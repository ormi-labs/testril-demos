import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, fileStore } from "../src/server.mjs";
import { createProviders, nansenRows } from "../src/providers.mjs";
import { runComparison } from "../public/runner.js";
import { signPayment } from "../public/payments.js";
import { scope, decimalAtoms, compare, summary } from "../public/model.js";
import { replay, verifyWindow } from "../public/verification.js";
import { failure, describeFailure } from "../src/errors.mjs";
import { account, peers, wallet, listen, close } from "./peers.mjs";

async function fixture(t, options) {
  const directory = await mkdtemp(join(tmpdir(), "wallet-statement-"));
  const p = await peers(options);
  const store = fileStore(directory);
  const write = store.save;
  if (options?.failOnPending || options?.failAfterConfirmation)
    store.save = async (run) => {
      if (
        (options.failOnPending && run.pending) ||
        (options.failAfterConfirmation &&
          run.operations.some((o) => o.confirmed))
      )
        throw failure("STATE_UNAVAILABLE");
      await write(run);
    };
  const app = createApp({ providers: createProviders(p), store });
  const base = await listen(app);
  t.after(async () => {
    await close(app);
    await p.close();
    await rm(directory, { recursive: true });
  });
  const request = async (path, body) => {
    const r = await fetch(
      `${base}/${path}`,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    return v;
  };
  return { ...p, base, store, request };
}

test("real HTTP/MCP adapters complete approvals, pagination, provenance and recording verification", async (t) => {
  const f = await fixture(t);
  let saved;
  const run = await runComparison({
    hour: 12,
    payer: account.address,
    request: f.request,
    approve: async () => true,
    sign: (q) =>
      signPayment(wallet(), account.address, q.challenge, q.accepted, q.plan),
    persist: (r) => {
      saved = structuredClone(r);
    },
    sleep: async () => {},
  });
  assert.equal(run.status, "done", run.error);
  assert.equal(saved.pending, null);
  assert.equal(run.providers.nansen.pages, 3);
  assert.equal(run.providers.testril.rows.length, 292);
  assert.equal(
    compare(run.providers.testril.rows, run.providers.nansen.rows).matches,
    true,
  );
  assert.ok(
    run.providers.testril.payments.some(
      (p) => p.phase === "provenance" && p.amount === "17",
    ),
  );
  assert.ok(run.providers.testril.payments.every((p) => p.confirmed));
  assert.equal(
    run.providers.testril.payments.reduce(
      (n, p) => n + BigInt(p.depositAmount),
      0n,
    ),
    10000n,
  );
  assert.doesNotMatch(
    JSON.stringify(run),
    /signature|PAYMENT-SIGNATURE|channelConfig/,
  );
  const evidence = JSON.parse(
    await readFile(
      new URL("../verification/evidence/evidence.json", import.meta.url),
    ),
  );
  const checked = await verifyWindow(
    {
      scope: run.scope,
      rows: run.providers.testril.rows,
      provenance: run.providers.testril.provenance,
    },
    replay(evidence),
  );
  assert.equal(checked.transfers, 292);
  assert.equal(checked.counterparties.length, 93);
});

test("both recorded hours replay real source evidence and reject an edited amount", async () => {
  const evidence = JSON.parse(
    await readFile(
      new URL("../verification/evidence/evidence.json", import.meta.url),
    ),
  );
  for (const [h, count] of [
    [12, 292],
    [13, 503],
  ]) {
    const run = JSON.parse(
      await readFile(new URL(`../recordings/hour-${h}.json`, import.meta.url)),
    );
    const input = {
      scope: run.scope,
      rows: run.providers.testril.rows,
      provenance: run.providers.testril.provenance,
    };
    assert.equal(
      (await verifyWindow(input, replay(evidence))).transfers,
      count,
    );
    input.rows[0].value = (BigInt(input.rows[0].value) + 1n).toString();
    await assert.rejects(
      verifyWindow(input, replay(evidence)),
      /Transfer differs/,
    );
  }
});

test("Nansen decimal parsing retains original digits and repeated transfer legs", () => {
  assert.equal(decimalAtoms("9.000000000000001e9"), "9000000000000001");
  assert.throws(() => decimalAtoms("0.0000001"), /six decimal/);
  const tx = "0x" + "a".repeat(64),
    to = "0x" + "b".repeat(40),
    report = scope();
  const text = `{"pagination":{"page":1,"per_page":100,"is_last_page":true},"data":[{"chain":"ethereum","block_timestamp":"2026-11-10T12:01:00","transaction_hash":"${tx}","tokens_sent":[{"token_address":"${report.token}","from_address":"${report.wallet}","to_address":"${to}","token_amount":-9000000000.000001},{"token_address":"${report.token}","from_address":"${report.wallet}","to_address":"${to}","token_amount":-9000000000.000001}],"tokens_received":[]}]}`;
  const result = nansenRows(text, report);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].value, "9000000000000001");
  assert.equal(summary(result.rows).outgoing, "18000000000000002");
});

test("cancel and unusable browser storage prevent any signature submission", async (t) => {
  for (const badStorage of [false, true]) {
    const f = await fixture(t);
    let signatures = 0;
    const run = await runComparison({
      hour: 12,
      payer: account.address,
      request: f.request,
      approve: async () => false,
      sign: () => {
        signatures++;
      },
      persist: () => {
        if (badStorage) throw new Error("quota");
      },
    });
    assert.notEqual(run.status, "done");
    assert.equal(signatures, 0);
    assert.equal(f.calls.filter((x) => x.paid).length, 0);
  }
});

test("missing receipt stops with durable uncertainty and cannot buy another page", async (t) => {
  const f = await fixture(t, { omitReceipt: true });
  const run = await runComparison({
    hour: 12,
    payer: account.address,
    request: f.request,
    approve: async () => true,
    sign: (q) =>
      signPayment(wallet(), account.address, q.challenge, q.accepted, q.plan),
    persist: () => {},
  });
  assert.equal(run.status, "stopped");
  assert.ok(run.pending);
  const state = await f.store.load(run.id);
  assert.equal(state.stopped, true);
  assert.ok(state.pending);
  await assert.rejects(
    f.request(`api/runs/${run.id}/step`, {
      action: "transactions",
      page: 1,
      id: crypto.randomUUID(),
    }),
  );
  assert.equal(f.calls.filter((x) => x.paid).length, 1);
});

test("lost browser response retains evidence without automatically resubmitting", async (t) => {
  const f = await fixture(t);
  let lost = false;
  const request = async (path, body) => {
    const r = await f.request(path, body);
    if (body?.payment && !lost) {
      lost = true;
      throw new Error("connection lost");
    }
    return r;
  };
  const run = await runComparison({
    hour: 12,
    payer: account.address,
    request,
    approve: async () => true,
    sign: (q) =>
      signPayment(wallet(), account.address, q.challenge, q.accepted, q.plan),
    persist: () => {},
  });
  assert.equal(run.status, "stopped");
  assert.equal(run.pending, null);
  assert.equal(f.calls.filter((x) => x.paid).length, 1);
  assert.equal(run.providers.testril.payments[0].confirmed, true);
});

test("wrong network, extra parameters and cross-origin requests cannot authorize a purchase", async (t) => {
  const f = await fixture(t, { network: "eip155:84532" });
  let signed = false;
  const run = await runComparison({
    hour: 12,
    payer: account.address,
    request: f.request,
    approve: async () => true,
    sign: () => {
      signed = true;
    },
    persist: () => {},
  });
  assert.equal(run.status, "stopped");
  assert.equal(signed, false);
  const bad = await fetch(f.base + "/api/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://elsewhere.invalid",
    },
    body: JSON.stringify({ payer: account.address, hour: 12 }),
  });
  assert.equal(bad.status, 400);
  await assert.rejects(
    f.request("api/runs", {
      payer: account.address,
      hour: 12,
      sql: "anything",
    }),
  );
});

test("failure identity survives wording changes and rejects forged or hostile objects", () => {
  const e = failure("PROVIDER_REFUSED", {
    provider: "testril",
    operation: "bind",
  });
  e.message = "A different explanation";
  assert.equal(describeFailure(e).code, "PROVIDER_REFUSED");
  assert.equal(describeFailure({ code: "PROVIDER_REFUSED" }), undefined);
  assert.equal(
    describeFailure(
      new Proxy(
        {},
        {
          get() {
            throw new Error("private key");
          },
        },
      ),
    ),
    undefined,
  );
});

test("state failures before submission prevent spending; failures after confirmation preserve the prior intent", async (t) => {
  for (const failOnPending of [true, false]) {
    const f = await fixture(t, {
      failOnPending,
      failAfterConfirmation: !failOnPending,
    });
    const run = await runComparison({
      hour: 12,
      payer: account.address,
      request: f.request,
      approve: async () => true,
      sign: (q) =>
        signPayment(wallet(), account.address, q.challenge, q.accepted, q.plan),
      persist: () => {},
    });
    assert.equal(run.status, "stopped");
    assert.equal(f.calls.filter((r) => r.paid).length, failOnPending ? 0 : 1);
    const durable = await f.store.load(run.id);
    assert.equal(Boolean(durable.pending), !failOnPending);
  }
});

test("duplicate concurrent paid requests are not executed twice", async (t) => {
  const f = await fixture(t);
  const { id } = await f.request("api/runs", {
    payer: account.address,
    hour: 12,
  });
  const action = (name) =>
    f.request(`api/runs/${id}/step`, { action: name, id: crypto.randomUUID() });
  await action("bind");
  const quote = await action("materialize");
  const payment = await signPayment(
    wallet(),
    account.address,
    quote.challenge,
    quote.accepted,
    quote.plan,
  );
  const body = { action: "materialize", id: crypto.randomUUID(), payment };
  const replies = await Promise.allSettled([
    f.request(`api/runs/${id}/step`, body),
    f.request(`api/runs/${id}/step`, body),
  ]);
  assert.equal(replies.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.calls.filter((r) => r.paid).length, 1);
});

test("a real result mismatch is retained rather than forced into agreement", async (t) => {
  const f = await fixture(t, { mismatch: true });
  const run = await runComparison({
    hour: 12,
    payer: account.address,
    request: f.request,
    approve: async () => true,
    sign: (q) =>
      signPayment(wallet(), account.address, q.challenge, q.accepted, q.plan),
    persist: () => {},
    sleep: async () => {},
  });
  assert.equal(run.status, "done");
  assert.equal(
    compare(run.providers.testril.rows, run.providers.nansen.rows).matches,
    false,
  );
});
