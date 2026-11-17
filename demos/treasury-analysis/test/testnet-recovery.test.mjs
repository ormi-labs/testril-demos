import test from "node:test";
import assert from "node:assert/strict";
import { writeOffTestnetPayments } from "../src/testnet-recovery.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { livePeer } from "./live-peer.mjs";

const at = "2026-11-17T19:00:00.000Z";
function journal() {
  return {
    identity: JSON.stringify({
      chain: { id: 84532 },
      token: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    }),
    pending: null,
    receipts: [
      { id: "confirmed", status: "done", chargeRaw: "7", depositRaw: "0" },
      {
        id: "uncertain",
        status: "paying",
        verb: "read",
        paymentIdentifier: "keep-this-identifier",
        chargeRaw: "21",
        depositRaw: "100000",
        accepted: { network: "eip155:84532" },
      },
    ],
    depositedRaw: "100000",
    chargeCapRaw: "1000",
    depositCapRaw: "100000",
    functions: { treasury: "stale-binding" },
    balanceEvidence: { treasury: "old-read" },
    transferEvidence: { a: "old-read" },
    transfers: [{ id: "confirmed-transfer" }],
    refreshBlock: 123,
  };
}

test("testnet write-off preserves evidence and budgets while requiring fresh reads", () => {
  const original = journal();
  const result = writeOffTestnetPayments(JSON.stringify(original), at);
  const next = JSON.parse(result.contents);
  assert.equal(result.payments, 1);
  assert.equal(result.chargeRaw, "21");
  assert.equal(result.depositRaw, "100000");
  assert.deepEqual(next.receipts[0], original.receipts[0]);
  assert.deepEqual(next.receipts[1], {
    ...original.receipts[1],
    status: "abandoned",
    abandonedAt: at,
    abandonmentReason: "operator-testnet-writeoff",
  });
  for (const key of [
    "depositedRaw",
    "chargeCapRaw",
    "depositCapRaw",
    "transfers",
  ])
    assert.deepEqual(next[key], original[key]);
  assert.deepEqual(next.functions, {});
  assert.deepEqual(next.balanceEvidence, {});
  assert.equal(next.refreshNeeded, true);
  assert.equal(next.refreshBlock, undefined);
  assert.throws(() => writeOffTestnetPayments(result.contents, at));
});

test("write-off refuses mainnet, other assets, pending transfers and malformed payments", () => {
  for (const mutate of [
    (s) => {
      s.identity = JSON.stringify({ chain: { id: 8453 } });
    },
    (s) => {
      s.identity = JSON.stringify({
        chain: { id: 84532 },
        token: { address: "other" },
      });
    },
    (s) => {
      s.pending = { hash: "do-not-discard" };
    },
    (s) => {
      s.receipts[1].accepted.network = "eip155:8453";
    },
    (s) => {
      s.receipts[1].verb = "transfer";
    },
    (s) => {
      s.receipts[1].chargeRaw = "invalid";
    },
  ]) {
    const state = journal();
    mutate(state);
    assert.throws(() => writeOffTestnetPayments(JSON.stringify(state), at));
  }
});

test("the actual demo can send and clean up after an explicit testnet write-off", async (t) => {
  const peer = await livePeer(t, {
    loseFirstSettlement: true,
    balances: { treasury: "1000000", a: "0", b: "0" },
  });
  await assert.rejects(peer.demo.refresh());
  await peer.demo.close();
  const path = join(peer.directory, ".live-state.json");
  const original = await readFile(path, "utf8");
  const reset = writeOffTestnetPayments(original, at);
  await writeFile(path, reset.contents);
  peer.clearBindings();
  peer.advanceBlock();
  await peer.restart();
  await peer.demo.refresh();
  await peer.demo.transfer({
    revision: peer.demo.state().revision,
    from: "treasury",
    to: "a",
    amount: "0.01",
  });
  assert.equal(peer.demo.state().actualBalances.a, "10000");
  await peer.demo.reset({ revision: peer.demo.state().revision });
  assert.equal(peer.demo.state().actualBalances.a, "0");
  assert.equal(peer.demo.state().actualBalances.b, "0");
  assert.equal(peer.demo.export().allReceipts[0].status, "abandoned");
  assert.equal(peer.prepares, 2);
});
