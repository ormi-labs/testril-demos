import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { livePeer, testConfig } from "./live-peer.mjs";
import { liveConfig } from "../src/live-config.mjs";
import { replayBalances } from "../public/replay.js";
import { createLiveChain } from "../src/live-chain.mjs";
import { createLiveDemo } from "../src/live-demo.mjs";
import { connectMcp } from "../src/mcp.mjs";
import { createLiveTestril } from "../src/live-testril.mjs";
import { describeFailure } from "../src/errors.mjs";

test("the live CLI checks Testril's head and Function bindings without making payments or transfers", async (t) => {
  const peer = await livePeer(t);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [fileURLToPath(new URL("../src/live-cli.mjs", import.meta.url)), "check"],
    {
      env: {
        ...process.env,
        ...peer.env,
        TESTRIL_MCP_URL: peer.config.mcpUrl,
        TESTRIL_CHARGE_CAP_USDC: "0",
        TESTRIL_ESCROW_CAP_USDC: "0",
      },
    },
  );
  assert.match(stdout, /Testril reports Base Sepolia block 100/);
  assert.match(stdout, /live Function bindings/);
  assert.deepEqual(
    peer.calls
      .filter((call) => call.name === "bind")
      .map((call) => [call.args.function_slug, call.args.params]),
    [
      ["erc20.transfer_edges", { token_address: peer.config.token.address }],
      ...peer.config.wallets.map((wallet) => [
        "erc20.token_balance",
        {
          reads: {
            tokens: [peer.config.token.address],
            owners: [wallet.address],
          },
        },
      ]),
    ],
  );
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 0);
  assert.equal(peer.prepares, 0);
});

test("the live CLI reports a refused Function binding and exits without paying", async (t) => {
  const peer = await livePeer(t, {
    refuseBinding: "erc20.token_balance",
  });
  await assert.rejects(
    promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("../src/live-cli.mjs", import.meta.url)), "check"],
      {
        env: {
          ...process.env,
          ...peer.env,
          TESTRIL_MCP_URL: peer.config.mcpUrl,
        },
      },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(
        error.stderr,
        /refused binding erc20\.token_balance \(Treasury\): invalid_params/,
      );
      assert.match(
        error.stderr,
        /test\/fixtures\/erc20-token-balance-params\.json/,
      );
      return true;
    },
  );
  assert.equal(peer.calls.filter((call) => !!call.payment).length, 0);
  assert.equal(peer.prepares, 0);
});

test("chain inspection reads the block from Testril's head object and rejects invalid snapshots", async () => {
  const config = { chain: { id: 84532 } };
  let result = {
    outcome: "success",
    subject: "chain",
    chain_id: 84532,
    head: { block: 47898718, time: "2026-10-09T17:08:44Z" },
  };
  const testril = createLiveTestril(
    config,
    {
      async call(name, args) {
        assert.equal(name, "inspect");
        assert.deepEqual(args, { subject: "chain", chain_id: 84532 });
        return result;
      },
    },
    {},
    async () => {},
  );
  assert.equal(await testril.head(), 47898718);
  for (const head of [
    null,
    {},
    { block: -1 },
    { block: 1.5 },
    { block: "47898718" },
    { block: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    result = { ...result, head };
    await assert.rejects(testril.head(), /Testril cannot report/);
  }
  result = { ...result, chain_id: 1, head: { block: 47898718 } };
  await assert.rejects(testril.head(), /Testril cannot report/);
});

test("MCP shutdown failure still releases the lock and preserves state", async (t) => {
  const peer = await livePeer(t);
  const directory = join(peer.directory, "close-failure");
  await mkdir(directory);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const demo = await createLiveDemo({
    config: peer.config,
    chain: peer.chain,
    directory,
    mcp: {
      close: async () => {
        throw new Error("MCP close failed");
      },
    },
  });
  const saved = await readFile(join(directory, ".live-state.json"), "utf8");
  await assert.rejects(demo.close(), /MCP close failed/);
  await assert.rejects(access(join(directory, ".live-lock")), {
    code: "ENOENT",
  });
  assert.equal(
    await readFile(join(directory, ".live-state.json"), "utf8"),
    saved,
  );
  await assert.rejects(demo.close(), /MCP close failed/);
  await assert.rejects(demo.refresh(), /shutting down/);
});

test("a second live session reports its lock owner and cannot disturb the first session", async (t) => {
  const peer = await livePeer(t);
  const ownerPath = join(peer.directory, ".live-lock", "pid");
  assert.equal((await readFile(ownerPath, "utf8")).trim(), String(process.pid));
  await assert.rejects(
    createLiveDemo({
      config: peer.config,
      chain: peer.chain,
      mcp: await connectMcp(peer.config.mcpUrl),
      directory: peer.directory,
    }),
    new RegExp(`Live server PID ${process.pid} holds`),
  );
  assert.equal((await readFile(ownerPath, "utf8")).trim(), String(process.pid));
  await peer.restart();
  assert.equal((await readFile(ownerPath, "utf8")).trim(), String(process.pid));
});

test("live mode checks signer addresses and refuses caps beyond approval without exposing keys", () => {
  const { env } = testConfig();
  assert.throws(
    () => liveConfig({ ...env, TREASURY_ADDRESS: env.COUNTERPARTY_A_ADDRESS }),
    /does not match/,
  );
  assert.throws(
    () => liveConfig({ ...env, TESTRIL_CHARGE_CAP_USDC: "0.100001" }),
    /approved/,
  );
  assert.throws(
    () => liveConfig({ ...env, TESTRIL_ESCROW_CAP_USDC: "1" }),
    /approved/,
  );
  assert.throws(
    () => liveConfig({ ...env, TREASURY_PRIVATE_KEY: "bad-private-key" }),
    (error) =>
      !error.message.includes("bad-private-key") &&
      /TREASURY_PRIVATE_KEY/.test(error.message),
  );
});

test("reads wait for existing materialization without paying to index the same range", async (t) => {
  const peer = await livePeer(t, { existingMaterialization: true });
  const snapshot = await peer.demo.refresh();
  assert.equal(snapshot.actualBalances.a, "500000");
  assert.equal(peer.calls.filter((c) => c.name === "materialize").length, 0);
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 3);
});

test("malformed materialization ranges retain the read failure classification without paying", async (t) => {
  for (const materializing of [
    {},
    "private-provider-payload",
    1,
    false,
    [null],
    [[]],
    [{}],
    [{ from_block: 100 }],
    [{ from_block: "100", to_block: 101 }],
    [{ from_block: 100, to_block: "101" }],
    [{ from_block: -1, to_block: 101 }],
    [{ from_block: 100.5, to_block: 101 }],
    [{ from_block: 100, to_block: 101.5 }],
    [{ from_block: 100, to_block: Number.MAX_SAFE_INTEGER + 1 }],
    [{ from_block: 101, to_block: 100 }],
    [{ from_block: 100, to_block: 100 }],
    [{ from_block: 100, to_block: 101 }, null],
  ])
    await t.test(JSON.stringify(materializing), async (t) => {
      const peer = await livePeer(t, {
        rangeUnavailableResponse: () => ({
          outcome: "error",
          kind: "range_unavailable",
          materializing,
        }),
      });
      await assert.rejects(peer.demo.refresh(), (error) => {
        assert.deepEqual(describeFailure(error), {
          code: "TESTRIL_RESPONSE_INVALID",
          details: { operation: "read" },
        });
        assert.doesNotMatch(error.message, /private-provider-payload/);
        return true;
      });
      assert.equal(peer.calls.filter((call) => call.payment).length, 0);
      assert.equal(
        peer.calls.filter((call) => call.name === "materialize").length,
        0,
      );
      assert.equal(peer.prepares, 0);
    });
});

test("absent, empty and unrelated valid materialization ranges allow new materialization", async (t) => {
  for (const materializing of [
    undefined,
    null,
    [],
    [{ from_block: 0, to_block: 1 }],
  ])
    await t.test(String(JSON.stringify(materializing)), async (t) => {
      const peer = await livePeer(t, {
        rangeUnavailableResponse: () => ({
          outcome: "error",
          kind: "range_unavailable",
          ...(materializing !== undefined && { materializing }),
        }),
      });
      assert.equal((await peer.demo.refresh()).actualBalances.a, "500000");
      assert.equal(
        peer.calls.filter((call) => call.name === "materialize" && call.payment)
          .length,
        3,
      );
      assert.equal(peer.calls.filter((call) => call.payment).length, 6);
      assert.equal(peer.prepares, 0);
    });
});

test("materialization ranges are validated again on polling replies", async (t) => {
  const seen = new Set();
  const peer = await livePeer(t, {
    rangeUnavailableResponse: (args) => {
      const first = !seen.has(args.bound_function_id);
      seen.add(args.bound_function_id);
      return {
        outcome: "error",
        kind: "range_unavailable",
        materializing: first
          ? [{ from_block: args.from_block, to_block: args.to_block }]
          : [null],
      };
    },
  });
  await assert.rejects(peer.demo.refresh(), (error) => {
    assert.deepEqual(describeFailure(error), {
      code: "TESTRIL_RESPONSE_INVALID",
      details: { operation: "read" },
    });
    return true;
  });
  assert.ok(peer.calls.filter((call) => call.name === "read").length > 3);
  assert.equal(peer.calls.filter((call) => call.payment).length, 0);
  assert.equal(
    peer.calls.filter((call) => call.name === "materialize").length,
    0,
  );
});

test("HTTP MCP payments reuse escrow; all wallet funds are available and reset sweeps A and B", async (t) => {
  const peer = await livePeer(t);
  const demo = peer.demo;
  assert.equal(demo.state().mcpUrl, peer.config.mcpUrl);
  assert.deepEqual(demo.state().actualBalances, {
    treasury: null,
    a: null,
    b: null,
  });
  assert.equal(demo.state().balanceRead.sources.treasury, null);
  await demo.refresh();
  assert.deepEqual(demo.state().balances, {
    treasury: "20000000",
    a: "500000",
    b: "0",
  });
  assert.equal(demo.state().actualBalances.a, "500000");
  assert.deepEqual(demo.state().balanceRead.balances, peer.balances);
  assert.equal(demo.state().balanceRead.sources.treasury.block, 100);
  assert.equal(demo.state().payment.depositedRaw, "100000");
  assert.equal(
    peer.calls.filter(
      (c) => !!c.payment && c.payment.payload.type === "deposit",
    ).length,
    1,
  );
  const before = demo.state();
  await assert.rejects(
    demo.transfer({
      revision: before.revision,
      from: "treasury",
      to: "a",
      amount: "20.000001",
    }),
    /available USDC balance/,
  );
  assert.equal(peer.prepares, 0);
  await demo.transfer({
    revision: before.revision,
    from: "treasury",
    to: "a",
    amount: "1.25",
  });
  await demo.transfer({
    revision: demo.state().revision,
    from: "a",
    to: "b",
    amount: ".10",
  });
  assert.deepEqual(demo.state().balances, {
    treasury: "18750000",
    a: "1650000",
    b: "100000",
  });
  assert.deepEqual(
    replayBalances(demo.export().initialBalances, demo.export().transfers, 2),
    demo.state().balances,
  );
  assert.equal(
    (await demo.balanceProvenance("a")).source.balanceRaw,
    "1650000",
  );
  assert.deepEqual(demo.state().actualBalances, {
    treasury: "18750000",
    a: "1650000",
    b: "100000",
  });
  assert.equal(
    (await demo.provenance(demo.export().transfers[0].id)).source.logIndex,
    7,
  );
  const spent = BigInt(demo.state().payment.spentRaw);
  const receipts = demo.state().receipts.length;
  await demo.reset({ revision: demo.state().revision });
  assert.deepEqual(demo.state().balances, {
    treasury: "20500000",
    a: "0",
    b: "0",
  });
  assert.equal(peer.balances.treasury, "20500000");
  assert.equal(peer.balances.a, "0");
  assert.ok(BigInt(demo.state().payment.lifetimeSpentRaw) > spent);
  assert.ok(demo.export().allReceipts.length > receipts);
  assert.equal(demo.state().payment.requestCount, 3);
  assert.equal(
    demo.state().receipts.filter((r) => r.kind === "reads").length,
    3,
  );
  // Reset's pre-sweep refresh also updates Treasury, untouched by the previous A→B transfer.
  assert.equal(
    BigInt(demo.state().payment.spentRaw),
    BigInt(demo.state().payment.lifetimeSpentRaw) - spent - 141n,
  );
  assert.equal(
    BigInt(demo.state().payment.remainingRaw),
    100000n - BigInt(demo.state().payment.lifetimeSpentRaw),
  );
  assert.equal(demo.export().transfers.length, 0);
  const saved = demo.state();
  assert.ok(!JSON.stringify(saved).includes("privateKey"));
  const disk = await readFile(join(peer.directory, ".live-state.json"), "utf8");
  for (const key of Object.values(peer.env).filter((v) =>
    /^0x[0-9a-f]{64}$/.test(v),
  ))
    assert.ok(!disk.includes(key));
  await peer.restart();
  assert.deepEqual(peer.demo.state().payment, saved.payment);
  assert.deepEqual(peer.demo.state().receipts, saved.receipts);
  assert.equal(peer.demo.state().id, saved.id);
});

test("zero and over-balance transfers have stable input failures without HTTP policy", async (t) => {
  const peer = await livePeer(t, {
    balances: { treasury: "1000000", a: "0", b: "0" },
  });
  await peer.demo.refresh();
  const before = peer.demo.state();
  const calls = peer.calls.length;
  for (const amount of ["0", "5"]) {
    await assert.rejects(
      peer.demo.transfer({
        revision: before.revision,
        from: "treasury",
        to: "a",
        amount,
      }),
      (error) => {
        assert.deepEqual(describeFailure(error), {
          code: "INVALID_AMOUNT",
          details: {},
        });
        assert.equal(error.status, undefined);
        assert.match(error.message, /available USDC balance/);
        return true;
      },
    );
  }
  assert.equal(peer.prepares, 0);
  assert.equal(peer.calls.length, calls);
});

test("reset reuses cached reads without inventing payments and never replenishes the lifetime cap", async (t) => {
  const peer = await livePeer(t, { balances: { a: "0" } });
  await peer.demo.refresh();
  const previous = peer.demo.state();
  await peer.demo.reset({ revision: previous.revision });
  assert.equal(peer.demo.state().payment.spentRaw, "0");
  assert.equal(peer.demo.state().payment.requestCount, 0);
  assert.deepEqual(peer.demo.state().receipts, []);
  assert.equal(
    peer.demo.state().payment.lifetimeSpentRaw,
    previous.payment.spentRaw,
  );
  assert.equal(
    peer.demo.state().payment.remainingRaw,
    previous.payment.remainingRaw,
  );
  assert.equal(peer.demo.export().allReceipts.length, previous.receipts.length);
  peer.config.chargeCapRaw = previous.payment.spentRaw;
  await peer.restart();
  assert.equal(peer.demo.state().payment.remainingRaw, "0");
  const payments = peer.calls.filter((c) => !!c.payment).length;
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".25",
    }),
    /charge cap/,
  );
  assert.equal(peer.calls.filter((c) => !!c.payment).length, payments);
  assert.equal(peer.demo.state().payment.spentRaw, "0");
  assert.equal(
    peer.demo.state().payment.lifetimeSpentRaw,
    previous.payment.spentRaw,
  );
});

test("concurrent tabs cannot authorize two transfers with one revision", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  const input = {
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: ".75",
  };
  const results = await Promise.allSettled([
    peer.demo.transfer(input),
    peer.demo.transfer(input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(peer.prepares, 1);
  assert.equal(peer.demo.state().balances.a, "1250000");
});

test("external funding is available after a verified Testril refresh", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  peer.balances.treasury = "21000000";
  peer.advanceBlock();
  await peer.demo.refresh();
  assert.equal(peer.demo.state().actualBalances.treasury, "21000000");
  assert.equal(peer.demo.state().balanceRead.sources.treasury.block, 101);
  assert.equal(peer.demo.state().balances.treasury, "21000000");
  assert.equal(peer.demo.state().refreshNeeded, false);
  await peer.restart();
  assert.equal(peer.demo.state().actualBalances.treasury, "21000000");
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: "20.5",
  });
  assert.equal(peer.prepares, 1);
  assert.equal(peer.demo.state().balances.treasury, "500000");
  const exportPath = join(peer.directory, "run.json");
  await writeFile(exportPath, JSON.stringify(peer.demo.export()));
  const { stdout } = await promisify(execFile)(process.execPath, [
    new URL("../src/cli.mjs", import.meta.url).pathname,
    "replay",
    exportPath,
  ]);
  assert.match(stdout, /Treasury: 0.5 USDC/);
  assert.match(stdout, /Counterparty A: 21 USDC/);
});

test("a pending receipt survives restart and is recovered without signing another transfer", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  peer.delayNextReceipt();
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".25",
    }),
    (error) => {
      assert.match(error.message, /pending/);
      assert.equal(error.timing.outcome, "failed");
      assert.ok(
        error.timing.stages.some(
          (s) => s.name === "RPC receipt wait and block verification",
        ),
      );
      return true;
    },
  );
  assert.ok(peer.demo.state().pending);
  assert.equal(peer.demo.progress().outcome, "failed");
  assert.equal(peer.demo.progress().steps.confirm.complete, false);
  assert.equal(peer.demo.progress().steps.confirm.active, 0);
  assert.equal(peer.demo.state().actualBalances.treasury, "20000000");
  assert.equal(peer.demo.state().balanceRead.sources.treasury.block, 100);
  assert.equal(peer.demo.state().refreshNeeded, true);
  await peer.restart();
  await peer.demo.refresh();
  assert.equal(peer.prepares, 1);
  assert.equal(peer.demo.state().balances.a, "750000");
  assert.equal(peer.demo.export().transfers.length, 1);
});

test("an uncertain settlement reserves the caps and refuses any second payment after restart", async (t) => {
  const peer = await livePeer(t);
  peer.failNextPayment();
  await assert.rejects(peer.demo.refresh(), /request failed|uncertain/);
  assert.deepEqual(peer.demo.state().balanceRead.balances, {
    treasury: null,
    a: null,
    b: null,
  });
  assert.equal(peer.demo.state().payment.spentRaw, "120");
  assert.equal(peer.demo.state().payment.depositedRaw, "100000");
  await assert.rejects(
    peer.demo.reset({ revision: peer.demo.state().revision }),
    /uncertain/,
  );
  assert.equal(peer.demo.state().payment.spentRaw, "120");
  await peer.restart();
  await assert.rejects(peer.demo.refresh(), /uncertain/);
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 1);
});

test("MCP payment challenges retain the request arguments and settle through metadata", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  const payments = peer.calls.filter((c) => c.payment);
  assert.equal(payments.length, 6);
  assert.ok(
    peer.calls.every(
      (c) => c.name !== "pay_quote" && !Object.hasOwn(c.args, "payment_id"),
    ),
  );
  for (const payment of payments) {
    assert.ok(
      peer.calls.some(
        (c) =>
          !c.payment &&
          c.name === payment.name &&
          JSON.stringify(c.args) === JSON.stringify(payment.args),
      ),
    );
    assert.match(
      payment.payment.extensions["payment-identifier"].info.id,
      /^[a-zA-Z0-9_-]{16,128}$/,
    );
  }
  assert.ok(peer.demo.export().allReceipts.every((r) => r.status === "done"));
});

for (const [label, options] of [
  ["missing quote", { malformedChallenge: true }],
  ["null offer", { paymentOffers: [null] }],
  ["non-object offer", { paymentOffers: ["batch-settlement"] }],
  ["array offer", { paymentOffers: [[]] }],
])
  test(`a malformed MCP challenge (${label}) cannot authorize a payment`, async (t) => {
    const peer = await livePeer(t, options);
    await assert.rejects(peer.demo.refresh(), (error) => {
      assert.deepEqual(describeFailure(error), {
        code: "TESTRIL_PAYMENT_CHALLENGE_INVALID",
        details: { operation: "materialize" },
      });
      return true;
    });
    assert.equal(peer.calls.filter((c) => c.payment).length, 0);
    assert.equal(peer.demo.export().allReceipts.length, 0);
  });

for (const response of ["omitSettlement", "wrongSettlement"]) {
  test(`${response} keeps the paid call uncertain and forbids another payment after restart`, async (t) => {
    const peer = await livePeer(t, { [response]: true });
    await assert.rejects(peer.demo.refresh(), (error) => {
      assert.equal(
        describeFailure(error).code,
        "PAYMENT_RECONCILIATION_REQUIRED",
      );
      return true;
    });
    assert.equal(peer.demo.export().allReceipts[0].status, "paying");
    assert.equal(peer.calls.filter((c) => c.payment).length, 1);
    await peer.restart();
    await assert.rejects(peer.demo.refresh(), /uncertain/);
    assert.equal(peer.calls.filter((c) => c.payment).length, 1);
  });
}

test("saved paid tickets need reconciliation before a new payment under the new transport", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  await peer.demo.close();
  const path = join(peer.directory, ".live-state.json");
  const saved = JSON.parse(await readFile(path, "utf8"));
  const receipt = saved.receipts.find((r) => r.verb === "read");
  receipt.status = "paid";
  receipt.paymentId = "legacy-paid-ticket";
  saved.refreshBlock = receipt.block;
  await writeFile(path, JSON.stringify(saved));
  const payments = peer.calls.filter((c) => c.payment).length;
  await peer.restart();
  await assert.rejects(peer.demo.refresh(), /Reconcile its quote/);
  assert.equal(peer.calls.filter((c) => c.payment).length, payments);
});

test("quotes for a different network are refused before signing or paying", async (t) => {
  const peer = await livePeer(t, { network: "eip155:8453" });
  await assert.rejects(peer.demo.refresh(), (error) => {
    assert.deepEqual(describeFailure(error), {
      code: "PAYMENT_CONFIGURATION_INVALID",
      details: { reason: "unsupported-terms" },
    });
    return true;
  });
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 0);
});

test("a charge cap smaller than the next quote stops before payment", async (t) => {
  const peer = await livePeer(t);
  // Saved-session cap can be lowered, never refilled by restart.
  peer.config.chargeCapRaw = "119";
  await peer.restart();
  await assert.rejects(peer.demo.refresh(), (error) => {
    assert.deepEqual(describeFailure(error), {
      code: "PAYMENT_LIMIT_REACHED",
      details: { limit: "charge" },
    });
    return true;
  });
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 0);
});

test("saved allowance sessions upgrade without losing transfers or payment usage", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  const payment = peer.demo.state().payment;
  const path = join(peer.directory, ".live-state.json");
  const state = JSON.parse(await readFile(path, "utf8"));
  state.reserves = { treasury: "19000000", a: "500000", b: "0" };
  state.initialBalances = { treasury: "1000000", a: "0", b: "0" };
  state.balances = { treasury: "750000", a: "250000", b: "0" };
  await writeFile(path, JSON.stringify(state));
  await peer.restart();
  assert.deepEqual(peer.demo.state().payment, payment);
  assert.equal(peer.demo.state().refreshNeeded, true);
  await peer.demo.refresh();
  assert.deepEqual(peer.demo.state().balances, peer.balances);
  assert.equal(peer.demo.export().transfers.length, 1);
  assert.equal(JSON.parse(await readFile(path, "utf8")).reserves, undefined);
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "b",
    amount: "2",
  });
  assert.equal(peer.demo.state().balances.b, "2000000");
});

test("outside withdrawals fail gas estimation until a manual Testril refresh", async (t) => {
  const peer = await livePeer(t, { balances: { treasury: "250000", a: "0" } });
  await peer.demo.refresh();
  peer.balances.treasury = "100000";
  peer.advanceBlock();
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".2",
    }),
    /RPC gas estimation: insufficient USDC balance/,
  );
  assert.equal(peer.prepares, 0);
  await peer.demo.refresh();
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".2",
    }),
    /available USDC balance/,
  );
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: ".1",
  });
  assert.deepEqual(peer.demo.state().balances, {
    treasury: "0",
    a: "100000",
    b: "0",
  });
});

test("Testril refresh works while the signer's RPC is unreachable", async (t) => {
  const peer = await livePeer(t);
  const directory = join(peer.directory, "testril-only-reads");
  await mkdir(directory);
  const config = { ...peer.config, rpcUrl: "http://127.0.0.1:1" };
  const demo = await createLiveDemo({
    config,
    chain: createLiveChain(config),
    mcp: await connectMcp(config.mcpUrl),
    directory,
  });
  t.after(() => demo.close());
  assert.deepEqual(demo.state().balances, { treasury: null, a: null, b: null });
  await demo.refresh();
  assert.deepEqual(demo.state().actualBalances, peer.balances);
  assert.deepEqual(demo.state().balances, peer.balances);
  assert.equal((await demo.balanceProvenance("a")).source.blockHash, undefined);
  assert.ok(
    peer.calls.some((c) => c.name === "inspect" && c.args.subject === "chain"),
  );
});

test("an unavailable Testril chain head refuses reads without an RPC fallback", async (t) => {
  const peer = await livePeer(t, { unavailableHead: true });
  await assert.rejects(peer.demo.refresh(), /Testril cannot report/);
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 0);
  assert.deepEqual(peer.demo.state().actualBalances, {
    treasury: null,
    a: null,
    b: null,
  });
  assert.equal(peer.prepares, 0);
});

test("Send reads only the two involved wallets and their edge at the receipt block", async (t) => {
  const peer = await livePeer(t, { headLagAfterTransfer: 1 });
  await peer.demo.refresh();
  const result = await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  const timing = result.timing;
  assert.equal(timing.outcome, "success");
  const after = timing.stages.find(
    (s) => s.name === "Testril refresh after transfer",
  );
  assert.equal(
    after.details.find((d) => d.name === "Testril inspect chain"),
    undefined,
  );
  assert.equal(
    after.details.find((d) => d.name === "Testril inspect channels").calls,
    1,
  );
  assert.equal(
    after.details.find((d) => d.name === "Settle Testril payment").calls,
    6,
  );
  assert.equal(after.overlapping, true);
  assert.equal(
    timing.stages.find(
      (s) => s.name === "Testril balance check before transfer",
    ),
    undefined,
  );
  assert.ok(
    !after.details.some((d) => /provenance|Counterparty B/.test(d.name)),
  );
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 0);
  const untouched = peer.demo.state().balanceRead.sources.b;
  assert.equal(untouched.block, 100);
  assert.equal(peer.demo.state().actualBalances.b, "0");
  for (const label of [
    "RPC transaction preparation and signing",
    "RPC broadcast",
    "RPC receipt wait and block verification",
  ])
    assert.ok(timing.stages.find((s) => s.name === label).elapsedMs >= 0);
  assert.ok(
    Math.abs(
      timing.stages.reduce((sum, s) => sum + s.elapsedMs, 0) - timing.elapsedMs,
    ) < 0.001,
  );
  assert.equal(peer.demo.state().timing, undefined);
  assert.equal(peer.demo.export().timing, undefined);
  const transfer = peer.demo.export().transfers.at(-1);
  assert.equal(
    peer.demo.state().balanceRead.sources.treasury.block,
    transfer.block,
  );
  assert.equal(peer.demo.state().actualBalances.treasury, "19750000");
  assert.equal(
    peer.calls.filter((c) => c.name === "inspect" && c.args.subject === "chain")
      .length,
    1,
  );
});

test("provenance is fetched on demand, cached per snapshot, and preserved for untouched wallets", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 0);
  assert.equal(peer.demo.export().balanceProvenance[0].citation, undefined);
  const first = await peer.demo.balanceProvenance("treasury");
  const untouched = await peer.demo.balanceProvenance("b");
  assert.equal(first.function.version, 1);
  assert.deepEqual(await peer.demo.balanceProvenance("treasury"), first);
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 2);
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 2);
  assert.equal(peer.demo.export().balanceProvenance[0].citation, undefined);
  assert.deepEqual(await peer.demo.balanceProvenance("b"), untouched);
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 2);
  const latest = await peer.demo.balanceProvenance("treasury");
  assert.equal(latest.source.block, 101);
  const transfer = peer.demo.export().transfers[0];
  assert.equal(peer.demo.export().provenance[0].citation, undefined);
  const proof = await peer.demo.provenance(transfer.id);
  assert.equal(proof.range.fromBlock, 101);
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 4);
  await peer.restart();
  assert.deepEqual(await peer.demo.provenance(transfer.id), proof);
  assert.deepEqual(await peer.demo.balanceProvenance("treasury"), latest);
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 4);
});

test("concurrent resource quotes settle in order with one cumulative escrow balance", async (t) => {
  let active = 0,
    maximumActive = 0;
  const peer = await livePeer(t, {
    async beforeTool(name, args, payment) {
      if (!payment) return;
      active++;
      maximumActive = Math.max(maximumActive, active);
      await delay(10);
      active--;
    },
  });
  await peer.demo.refresh();
  assert.equal(maximumActive, 1);
  assert.equal(
    peer.calls.filter((c) => c.name === "materialize" && c.payment).length,
    3,
  );
  assert.equal(
    peer.calls.filter((c) => c.name === "read" && c.payment).length,
    3,
  );
  assert.equal(peer.demo.state().payment.depositedRaw, "100000");
  assert.equal(peer.demo.state().payment.spentRaw, "423");
  assert.equal(peer.channels[0].chargedCumulativeAmount, "423");
  assert.equal(peer.channels.length, 1);
  assert.equal(
    peer.calls.filter(
      (c) => c.name === "inspect" && c.args.subject === "channels",
    ).length,
    1,
  );
  const disk = JSON.parse(
    await readFile(join(peer.directory, ".live-state.json"), "utf8"),
  );
  assert.equal(disk.receipts.length, 6);
  assert.ok(disk.receipts.every((r) => r.status === "done"));
  assert.deepEqual(disk.balances, peer.balances);
});

test("concurrent quotes cannot exceed the shared cap and failure drains the other pipelines", async (t) => {
  let completed = 0;
  const peer = await livePeer(t, {
    async beforeTool(name, args, payment) {
      if (name === "materialize" && payment) {
        await delay(100);
        completed++;
      }
    },
  });
  peer.config.chargeCapRaw = "240";
  await peer.restart();
  await assert.rejects(peer.demo.refresh(), /charge cap/);
  assert.equal(completed, 2);
  assert.equal(peer.demo.state().payment.spentRaw, "240");
  assert.equal(peer.demo.state().payment.depositedRaw, "100000");
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 2);
  assert.equal(peer.channels[0].chargedCumulativeAmount, "240");
  const calls = peer.calls.length;
  await peer.restart();
  assert.equal(peer.calls.length, calls);
  assert.equal(peer.demo.state().payment.spentRaw, "240");
  assert.equal(peer.demo.state().refreshNeeded, true);
});

test("an embedding payment policy rejects authorization before settlement and leaves no uncertain payment", async (t) => {
  let reject = true;
  const authorized = [];
  const peer = await livePeer(t, {
    authorizePayment: async (payment) => {
      assert.equal(Object.hasOwn(payment, "payload"), false);
      if (reject) throw new Error("Hosted sponsor budget exhausted");
      authorized.push(payment);
    },
  });
  await assert.rejects(peer.demo.refresh(), /Hosted sponsor budget/);
  assert.equal(peer.calls.filter((c) => !!c.payment).length, 0);
  assert.equal(peer.demo.export().allReceipts.length, 0);
  reject = false;
  await peer.demo.refresh();
  assert.equal(authorized.length, peer.calls.filter((c) => !!c.payment).length);
  assert.equal(
    authorized.reduce((sum, p) => sum + BigInt(p.depositRaw), 0n),
    100000n,
  );
});

test("durable journals survive a new engine and failed persistence prevents payment transmission", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.close();
  let saved,
    rejectPaymentSave = false;
  const journal = {
    load: async () => saved,
    async save(contents) {
      if (
        rejectPaymentSave &&
        JSON.parse(contents).receipts.some((r) => r.status === "paying")
      )
        throw new Error("Durable storage unavailable");
      saved = contents;
    },
    close: async () => {},
  };
  const open = async () =>
    createLiveDemo({
      config: peer.config,
      chain: peer.chain,
      mcp: await connectMcp(peer.config.mcpUrl),
      journal,
    });
  const first = await open();
  await first.refresh();
  const original = first.state();
  await first.close();
  const second = await open();
  t.after(() => second.close());
  assert.equal(second.state().id, original.id);
  assert.equal(
    second.state().payment.lifetimeSpentRaw,
    original.payment.lifetimeSpentRaw,
  );
  peer.advanceBlock();
  rejectPaymentSave = true;
  const payments = peer.calls.filter((c) => !!c.payment).length;
  await assert.rejects(second.refresh(), (error) => {
    assert.deepEqual(describeFailure(error), {
      code: "JOURNAL_UNAVAILABLE",
      details: { operation: "save" },
    });
    assert.doesNotMatch(error.message, /Durable storage unavailable/);
    return true;
  });
  assert.equal(peer.calls.filter((c) => !!c.payment).length, payments);
  await assert.rejects(second.refresh(), /journal could not be persisted/);
});

test("balance bindings satisfy the captured Testril 0.13 schema and old top-level scope is refused", async (t) => {
  const peer = await livePeer(t);
  const client = await connectMcp(peer.config.mcpUrl);
  t.after(() => client.close());
  const refused = await client.call("bind", {
    function_slug: "erc20.token_balance",
    chain_id: 84532,
    params: {
      tokens: [peer.config.token.address],
      owners: [peer.config.wallets[0].address],
    },
  });
  assert.equal(refused.kind, "invalid_params");
  await peer.demo.refresh();
  assert.equal(peer.demo.state().balances.treasury, peer.balances.treasury);
});

test("a saved session rebinds after a service restart without erasing payment or transfer history", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: "0.25",
  });
  const before = peer.demo.export();
  const bindings = peer.calls.filter((c) => c.name === "bind").length;
  peer.clearBindings();
  peer.advanceBlock();
  await peer.restart();
  await peer.demo.refresh();
  const after = peer.demo.export();
  assert.equal(
    peer.calls.filter((c) => c.name === "bind").length,
    bindings + 4,
  );
  assert.deepEqual(after.transfers, before.transfers);
  assert.deepEqual(
    after.allReceipts.slice(0, before.allReceipts.length),
    before.allReceipts,
  );
  assert.equal(after.actualBalances.a, peer.balances.a);
});
