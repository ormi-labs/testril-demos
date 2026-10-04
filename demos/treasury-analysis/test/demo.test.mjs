import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  transferDemo,
  resetDemo,
  balanceProvenanceFor,
  provenanceFor,
  exportDemo,
} from "../src/demo.mjs";
import { replayBalances } from "../public/replay.js";
const initial = { treasury: "1000000", a: "0", b: "0" };
const send = (demo, from, to, amount) =>
  transferDemo(demo, { from, to, amount });
test("exact transfers conserve funds; each balance refresh charges three reads", () => {
  let demo = createDemo({ now: 0 });
  assert.deepEqual(demo.balanceRead.balances, initial);
  demo = send(demo, "treasury", "a", ".25");
  demo = send(demo, "a", "b", ".000001");
  assert.deepEqual(demo.balanceRead.balances, {
    treasury: "750000",
    a: "249999",
    b: "1",
  });
  assert.equal(demo.payment.spentRaw, "113");
  assert.equal(demo.payment.requestCount, 11);
  assert.equal(
    demo.chain.transfers[1].block,
    demo.chain.transfers[0].block + 1,
  );
  assert.equal(
    Date.parse(demo.chain.transfers[1].timestamp) -
      Date.parse(demo.chain.transfers[0].timestamp),
    1000,
  );
  assert.deepEqual(
    replayBalances(initial, demo.chain.transfers, 2),
    demo.balanceRead.balances,
  );
  assert.throws(() => replayBalances(initial, demo.chain.transfers, 3));
});
test("invalid transfers and empty payer leave original state intact", () => {
  const demo = createDemo();
  const before = JSON.stringify(demo);
  for (const amount of ["0", "-1", "1e-6", ".0000001", "2"])
    assert.throws(() => send(demo, "treasury", "a", amount));
  assert.throws(() => send(demo, "treasury", "treasury", ".1"));
  assert.throws(() => send(demo, "a", "b", ".1"));
  assert.throws(() => send(demo, "unknown", "b", ".1"));
  assert.equal(JSON.stringify(demo), before);
  const empty = createDemo({ paymentRaw: "30" });
  assert.throws(() => send(empty, "treasury", "a", ".25"), /payment wallet/);
  assert.deepEqual(empty.chain.balances, initial);
});
test("history charges only for a read; provenance and replay are free", () => {
  const empty = createDemo();
  assert.equal(empty.payment.spentRaw, "30");
  const demo = send(empty, "treasury", "a", ".25");
  const history = demo.historyRead;
  assert.equal(demo.payment.spentRaw, "71");
  const source = provenanceFor(demo, history.transfers[0].id);
  assert.equal(source.source.amountRaw, "250000");
  assert.match(source.source.transactionHash, /^0x[0-9a-f]{64}$/);
  assert.match(source.note, /Fictional/);
  replayBalances(initial, history.transfers, 1);
  assert.equal(demo.payment.spentRaw, "71");
});
test("reset returns both counterparties and clears payments, including an exhausted payer", () => {
  let demo = send(createDemo(), "treasury", "a", ".25");
  demo = send(demo, "treasury", "b", ".15");
  const reset = resetDemo(demo);
  assert.deepEqual(reset.balanceRead.balances, initial);
  assert.equal(reset.lastReset.sweeps.length, 2);
  assert.equal(reset.lastReset.returnedRaw, "400000");
  assert.equal(reset.payment.spentRaw, "0");
  assert.equal(reset.payment.requestCount, 0);
  assert.equal(reset.payment.remainingRaw, reset.payment.initialRaw);
  assert.deepEqual(reset.receipts, []);
  assert.deepEqual(exportDemo(reset).receipts, []);
  const exhausted = resetDemo(createDemo({ paymentRaw: "30" }));
  assert.equal(exhausted.payment.remainingRaw, "30");
  assert.equal(exhausted.payment.spentRaw, "0");
  assert.equal(reset.cycle, 2);
  assert.deepEqual(exportDemo(reset).transfers, []);
  assert.throws(() => provenanceFor(reset, demo.chain.transfers[0].id));
  assert.equal(resetDemo(reset).lastReset.sweeps.length, 0);
  const next = send(reset, "treasury", "b", "1");
  assert.equal(next.receipts.length, 2);
  assert.equal(next.payment.spentRaw, "41");
  assert.equal(demo.payment.spentRaw, "113");
  assert.deepEqual(
    replayBalances(initial, exportDemo(next).transfers, 1),
    next.balanceRead.balances,
  );
});

test("balance provenance describes the latest snapshot without a fabricated transaction", () => {
  const initialDemo = createDemo();
  assert.equal(balanceProvenanceFor(initialDemo, "a").source.balanceRaw, "0");
  const demo = send(initialDemo, "treasury", "a", ".25");
  const evidence = balanceProvenanceFor(demo, "a");
  assert.equal(evidence.source.balanceRaw, "250000");
  assert.equal(evidence.source.blockHash, demo.balanceRead.blockHash);
  assert.equal(evidence.source.block, demo.chain.block);
  assert.equal(evidence.function.name, "erc20.token_balance");
  assert.equal(evidence.source.transactionHash, undefined);
  assert.equal(demo.payment.spentRaw, "71");
  assert.throws(() => balanceProvenanceFor(demo, "unknown"));
  assert.equal(exportDemo(demo).balanceProvenance.length, 3);
});
test("a failed automatic history read does not commit the transfer or either charge", () => {
  const demo = createDemo({ paymentRaw: "70" });
  const before = JSON.stringify(demo);
  assert.throws(() => send(demo, "treasury", "a", ".25"), /payment wallet/);
  assert.equal(JSON.stringify(demo), before);
});
