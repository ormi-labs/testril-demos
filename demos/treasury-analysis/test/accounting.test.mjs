import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../src/accounting.mjs";
import { buildSample, defaultInputs, reference } from "../src/sample.mjs";
import { decimalAmount, parseUsd } from "../public/amounts.js";

test("treasury cancels self-transfers and ranks actual counterparties", () => {
  const { report, receipts } = buildSample(defaultInputs);
  assert.deepEqual(
    [
      report.openingRaw,
      report.incomingRaw,
      report.outgoingRaw,
      report.netRaw,
      report.closingRaw,
    ],
    ["1000000000", "50000000", "100000000", "-50000000", "950000000"],
  );
  assert.equal(report.reconciles, true);
  assert.equal(report.selfTransfers, "1");
  assert.equal(report.counterparties[0].netRaw, "-70000000");
  assert.equal(report.counterparties[0].transferCount, "3");
  assert.equal(receipts.readsRaw, "1062");
  assert.equal(receipts.preparationRaw, "120240");
  assert.equal(receipts.paidRaw, "0");
});

test("team movements are separate from individual reconciliation", () => {
  const run = buildSample({
    ...defaultInputs,
    team: [reference.accounts[1].address],
  });
  assert.equal(run.report.netRaw, "-50000000");
  assert.equal(run.report.reconciles, true);
  assert.deepEqual(run.report.team, {
    incomingRaw: "20000000",
    outgoingRaw: "0",
    netRaw: "20000000",
  });
  assert.equal(run.report.counterparties[0].classification, "Team");
});

test("half-open ranges use preceding snapshots and exclude the upper block", () => {
  const run = buildSample({ ...defaultInputs, fromBlock: 101, toBlock: 102 });
  assert.equal(run.report.openingRaw, "930000000");
  assert.equal(run.report.closingRaw, "930000000");
  assert.equal(run.report.incomingRaw, "0");
  assert.equal(run.report.outgoingRaw, "0");
  assert.equal(run.report.selfTransfers, "1");
  const quiet = buildSample({
    ...defaultInputs,
    fromBlock: 103,
    toBlock: 1100,
  });
  assert.deepEqual(quiet.data.edges, []);
  assert.equal(quiet.report.openingRaw, "950000000");
  assert.equal(quiet.report.reconciles, true);
});

test("another treasury changes direction and balances", () => {
  const run = buildSample({
    ...defaultInputs,
    treasury: reference.accounts[1].address,
  });
  assert.equal(run.report.netRaw, "70000000");
  assert.equal(run.report.openingRaw, "500000000");
  assert.equal(run.report.closingRaw, "570000000");
});

test("budget compares exact millionths at the one-atom boundary", () => {
  assert.equal(
    buildSample({ ...defaultInputs, budgetRaw: "121302" }).receipts
      .remainingRaw,
    "0",
  );
  assert.throws(
    () => buildSample({ ...defaultInputs, budgetRaw: "121301" }),
    /exceeds the budget/,
  );
  assert.equal(parseUsd("0.001062"), "1062");
  assert.throws(() => parseUsd("0.0000001"), /six decimal/);
  assert.throws(() => parseUsd("1e3"), /six decimal/);
});

test("amounts beyond Number.MAX_SAFE_INTEGER preserve every unit", () => {
  const run = buildSample(defaultInputs);
  const amount = "9007199254740993123456789";
  const data = {
    openingRaw: amount,
    closingRaw: "0",
    edges: [{ ...run.data.edges[0], amountRaw: amount }],
  };
  const report = calculate(defaultInputs, data);
  assert.equal(report.outgoingRaw, amount);
  assert.equal(report.netRaw, `-${amount}`);
  assert.equal(report.reconciles, true);
  assert.equal(decimalAmount(amount), "9,007,199,254,740,993,123.456789");
  assert.equal(decimalAmount("1", 0), "1");
});

test("reject invalid scopes, unsafe amounts and duplicate aggregate keys", () => {
  assert.throws(
    () => buildSample({ ...defaultInputs, toBlock: 100 }),
    /non-empty/,
  );
  assert.throws(
    () => buildSample({ ...defaultInputs, treasury: "<script>" }),
    /address/,
  );
  assert.throws(
    () => buildSample({ ...defaultInputs, fromBlock: 99 }),
    /covers blocks/,
  );
  const { data } = buildSample(defaultInputs);
  assert.throws(
    () =>
      calculate(defaultInputs, {
        ...data,
        edges: [...data.edges, data.edges[0]],
      }),
    /Duplicate/,
  );
  assert.throws(
    () => calculate(defaultInputs, { ...data, openingRaw: 1000 }),
    /integer strings/,
  );
  assert.throws(
    () =>
      calculate(defaultInputs, {
        ...data,
        edges: [{ ...data.edges[0], block: 1100 }],
      }),
    /outside/,
  );
});
