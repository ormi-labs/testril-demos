import test from "node:test";
import assert from "node:assert/strict";
import {
  compareRows,
  normalizeRows,
  reportSpec,
  validateRecording,
} from "../public/model.js";
import { selectOffer, paymentPlan, signPayment } from "../public/payments.js";
import { alliumSql, createAllium } from "../src/providers.mjs";
import { advance, createRun } from "../src/run.mjs";
import { createApp } from "../src/server.mjs";
import {
  account,
  challenge,
  close,
  fakePeers,
  listen,
  rows,
  spec,
  testWallet,
} from "./peers.mjs";

test("compare exact raw integers, fill empty hours, and detect a one-atom difference", () => {
  const normalized = normalizeRows(rows, spec);
  assert.equal(normalized[1].volume1, "0");
  assert.equal(normalized[0].volume1, "987654321098765432109876");
  const other = structuredClone(rows);
  other[0].volume1 = "987654321098765432109877";
  assert.deepEqual(compareRows(rows, other, spec).differences, [
    {
      hour: spec.fromHour,
      field: "volume1",
      testril: rows[0].volume1,
      allium: other[0].volume1,
    },
  ]);
  assert.throws(
    () => normalizeRows([{ ...rows[0], volume0: 123 }], spec),
    /integer string/,
  );
  assert.throws(
    () => normalizeRows([{ ...rows[0], pool: account.address }], spec),
    /different pool/,
  );
  assert.throws(() => normalizeRows([rows[0], rows[0]], spec), /duplicate/);
});

test("the report and SQL have identical fixed scope and preserve integer precision", () => {
  assert.throws(() => reportSpec("2026-02-30T12"), /Invalid/);
  const sql = alliumSql(spec);
  assert.match(sql, /ethereum\.dex\.trades/);
  assert.ok(
    sql.includes(spec.pool) &&
      sql.includes(spec.fromHour) &&
      sql.includes(spec.toHour),
  );
  assert.match(sql, /token_sold_amount_raw_str, 38, 0/);
  assert.doesNotMatch(sql, /FLOAT|usd_amount/);
});

test("payment selection rejects testnet, wrong tokens, and changed wallet accounts", async () => {
  assert.throws(
    () =>
      selectOffer(
        challenge("exact", "10000", { network: "eip155:84532" }),
        "allium",
      ),
    /not offering/,
  );
  assert.throws(
    () =>
      selectOffer(
        challenge("exact", "10000", { asset: account.address }),
        "allium",
      ),
    /not offering/,
  );
  const quoted = challenge();
  const accepted = selectOffer(quoted, "allium");
  const wallet = {
    request: async () => ["0x1111111111111111111111111111111111111111"],
  };
  await assert.rejects(
    signPayment(
      wallet,
      account.address,
      quoted,
      accepted,
      paymentPlan(accepted, [], account.address),
    ),
    /account changed/,
  );
  const wrongDomain = testWallet();
  const request = wrongDomain.request;
  wrongDomain.request = (args) =>
    args.method === "eth_call" ? `0x${"0".repeat(64)}` : request(args);
  await assert.rejects(
    signPayment(
      wrongDomain,
      account.address,
      quoted,
      accepted,
      paymentPlan(accepted, [], account.address),
    ),
    /signing domain/,
  );
});

async function drive(run, name, peers) {
  let payment;
  for (let i = 0; i < 20; i++) {
    const state = await advance(run, name, payment, peers);
    payment = undefined;
    if (state.status === "payment_required") {
      const plan = paymentPlan(state.accepted, state.channels, account.address);
      payment = await signPayment(
        testWallet(),
        account.address,
        state.challenge,
        state.accepted,
        plan,
      );
    } else if (["done", "error"].includes(state.status)) return state;
  }
  throw new Error("The test run did not terminate.");
}

test("wallet-paid flow completes preparation, reusable escrow reads, SQL polling, and paid results", async (t) => {
  const peers = await fakePeers();
  t.after(peers.close);
  const run = createRun(spec, account.address);
  const connections = {
    testril: peers.testril,
    allium: createAllium(peers.alliumUrl),
  };
  const testril = await drive(run, "testril", connections);
  assert.equal(testril.status, "done", testril.error);
  assert.deepEqual(
    testril.payments.map((p) => [
      p.phase,
      p.amount,
      p.depositAmount,
      p.confirmation,
    ]),
    [
      ["preparation", "120", "10000", "confirmed"],
      ["read", "23", "0", "confirmed"],
    ],
  );
  const allium = await drive(run, "allium", connections);
  assert.equal(allium.status, "done", allium.error);
  assert.deepEqual(
    allium.payments.map((p) => p.amount),
    ["10000", "20000"],
  );
  assert.ok(allium.payments.every((p) => p.confirmation === "confirmed"));
  assert.equal(compareRows(testril.rows, allium.rows, spec).matches, true);
  assert.ok(
    peers.calls
      .filter((c) => c.provider === "allium")
      .every((c) => !c.hasApiKey),
  );
  const read = peers.calls.find((c) => c.name === "read");
  assert.deepEqual(read.args.key, { pool: spec.pool });
  assert.equal(peers.channels[0].chargedCumulativeAmount, "143");
});

test("an account-gated SQL status stops without pretending the paid submission delivered data", async (t) => {
  const peers = await fakePeers({ authFailure: true });
  t.after(peers.close);
  const run = createRun(spec, account.address);
  const state = await drive(run, "allium", {
    allium: createAllium(peers.alliumUrl),
  });
  assert.equal(state.status, "error");
  assert.match(state.error, /Accountless access/);
  assert.equal(state.rows, null);
  assert.equal(state.payments.length, 1);
  await assert.rejects(advance(run, "allium", undefined, {}), /finished/);
});

test("missing receipts remain unconfirmed, oversized quotes and testnet offers never request signing", async (t) => {
  for (const options of [
    { omitReceipt: true },
    { amount: "250001" },
    { network: "eip155:84532" },
  ]) {
    const peers = await fakePeers(options);
    t.after(peers.close);
    const state = await drive(createRun(spec, account.address), "allium", {
      allium: createAllium(peers.alliumUrl),
    });
    if (options.omitReceipt) {
      assert.equal(state.status, "done");
      assert.ok(state.payments.every((p) => p.confirmation === "unconfirmed"));
    } else {
      assert.equal(state.status, "error");
      assert.equal(peers.calls.filter((c) => c.paid).length, 0);
    }
  }
});

test("HTTP app defaults to no spending and rejects arbitrary SQL, cross-origin access, and unknown routes", async (t) => {
  const app = createApp({ env: {} });
  const url = await listen(app);
  t.after(() => close(app));
  const config = await (await fetch(`${url}/api/config`)).json();
  assert.equal(config.liveEnabled, false);
  assert.equal(
    (
      await fetch(`${url}/api/runs`, {
        method: "POST",
        body: JSON.stringify({ wallet: account.address }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(`${url}/api/config`, {
        headers: { origin: "https://unrelated.example" },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(`${url}/api/proxy`)).status, 404);
  const live = createApp({ env: { LIVE_ENABLED: "true" } });
  const liveUrl = await listen(live);
  t.after(() => close(live));
  assert.equal(
    (
      await fetch(`${liveUrl}/api/runs`, {
        method: "POST",
        body: JSON.stringify({ wallet: account.address, sql: "SELECT *" }),
      })
    ).status,
    400,
  );
});

test("recordings cannot label incomplete or imprecise results as completed runs", () => {
  assert.throws(
    () => validateRecording({ schemaVersion: 1, kind: "example" }),
    /recorded run/,
  );
  assert.throws(
    () =>
      validateRecording({
        schemaVersion: 1,
        kind: "recorded",
        recordedAt: new Date().toISOString(),
        spec,
        paymentNetwork: "eip155:8453",
        providers: {},
      }),
    /Both providers/,
  );
});
