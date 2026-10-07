import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { livePeer, testConfig } from "./live-peer.mjs";
import { liveConfig } from "../src/live-config.mjs";
import { replayBalances } from "../public/replay.js";
import { createLiveDemo } from "../src/live-demo.mjs";
import { connectMcp } from "../src/mcp.mjs";

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

test("HTTP MCP payments reuse escrow; the 1 USDC allowance reserves other funds and survives reset/restart", async (t) => {
  const peer = await livePeer(t);
  const demo = peer.demo;
  assert.deepEqual(demo.state().actualBalances, {
    treasury: null,
    a: null,
    b: null,
  });
  assert.equal(demo.state().balanceRead.sources.treasury, null);
  await demo.refresh();
  assert.deepEqual(demo.state().balances, {
    treasury: "1000000",
    a: "0",
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
      amount: "1.000001",
    }),
    /allowance/,
  );
  assert.equal(peer.prepares, 0);
  await demo.transfer({
    revision: before.revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  await demo.transfer({
    revision: demo.state().revision,
    from: "a",
    to: "b",
    amount: ".10",
  });
  assert.deepEqual(demo.state().balances, {
    treasury: "750000",
    a: "150000",
    b: "100000",
  });
  assert.deepEqual(
    replayBalances(demo.export().initialBalances, demo.export().transfers, 2),
    demo.state().balances,
  );
  assert.equal(demo.balanceProvenance("a").source.balanceRaw, "650000");
  assert.deepEqual(demo.state().actualBalances, {
    treasury: "19750000",
    a: "650000",
    b: "100000",
  });
  assert.equal(
    demo.provenance(demo.export().transfers[0].id).source.logIndex,
    7,
  );
  const spent = BigInt(demo.state().payment.spentRaw);
  const receipts = demo.state().receipts.length;
  await demo.reset({ revision: demo.state().revision });
  assert.deepEqual(demo.state().balances, before.balances);
  assert.equal(peer.balances.treasury, "20000000");
  assert.equal(peer.balances.a, "500000");
  assert.ok(BigInt(demo.state().payment.spentRaw) > spent);
  assert.ok(demo.state().receipts.length > receipts);
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
  assert.equal(peer.demo.state().id, saved.id);
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
  assert.equal(peer.demo.state().balances.a, "750000");
});

test("a Testril read of externally added funds updates the displayed balance while transfers stay paused", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  peer.balances.treasury = "21000000";
  const snapshot = peer.chain.snapshot;
  peer.chain.snapshot = (at) => snapshot(at ?? 101);
  await assert.rejects(peer.demo.refresh(), /changed outside/);
  assert.equal(peer.demo.state().actualBalances.treasury, "21000000");
  assert.equal(peer.demo.state().balanceRead.sources.treasury.block, 101);
  assert.equal(peer.demo.state().balances.treasury, "1000000");
  assert.equal(peer.demo.state().refreshNeeded, true);
  await peer.restart();
  assert.equal(peer.demo.state().actualBalances.treasury, "21000000");
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".25",
    }),
    /Refresh/,
  );
  assert.equal(peer.prepares, 0);
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
  assert.equal(peer.demo.state().balances.a, "250000");
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
