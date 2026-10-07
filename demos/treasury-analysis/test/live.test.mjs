import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { livePeer, testConfig } from "./live-peer.mjs";
import { liveConfig } from "../src/live-config.mjs";
import { replayBalances } from "../public/replay.js";
import { createLiveDemo } from "../src/live-demo.mjs";
import { connectMcp } from "../src/mcp.mjs";

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
      (c) =>
        c.name === "pay_quote" &&
        JSON.parse(c.args.payload).payload.type === "deposit",
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
  assert.equal(demo.balanceProvenance("a").source.balanceRaw, "1650000");
  assert.deepEqual(demo.state().actualBalances, {
    treasury: "18750000",
    a: "1650000",
    b: "100000",
  });
  assert.equal(
    demo.provenance(demo.export().transfers[0].id).source.logIndex,
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
  assert.equal(
    BigInt(demo.state().payment.spentRaw),
    BigInt(demo.state().payment.lifetimeSpentRaw) - spent,
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
  const payments = peer.calls.filter((c) => c.name === "pay_quote").length;
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".25",
    }),
    /charge cap/,
  );
  assert.equal(
    peer.calls.filter((c) => c.name === "pay_quote").length,
    payments,
  );
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
    /pending/,
  );
  assert.ok(peer.demo.state().pending);
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
  await assert.rejects(peer.demo.refresh(), /request failed/);
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
  assert.equal(peer.calls.filter((c) => c.name === "pay_quote").length, 1);
});

test("quotes for a different network are refused before signing or paying", async (t) => {
  const peer = await livePeer(t, { network: "eip155:8453" });
  await assert.rejects(peer.demo.refresh(), /Base Sepolia/);
  assert.equal(peer.calls.filter((c) => c.name === "pay_quote").length, 0);
});

test("a charge cap smaller than the next quote stops before payment", async (t) => {
  const peer = await livePeer(t);
  // Saved-session cap can be lowered, never refilled by restart.
  peer.config.chargeCapRaw = "119";
  await peer.restart();
  await assert.rejects(peer.demo.refresh(), /charge cap/);
  assert.equal(peer.calls.filter((c) => c.name === "pay_quote").length, 0);
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

test("small starting balances and outside withdrawals use the actual sending balance", async (t) => {
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
    /balances changed/,
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
