import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertLeaderboardAddsUp,
  builderTotals,
  check,
  exchanges,
  leaderboardEntries,
  shape,
  zeroWord,
} from "../src/report.mjs";
import { fixture, fixtureBinds, fixtureFetched } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const checked = (data) => check(fixtureFetched(data), fixtureBinds);
const [ctfExchange] = exchanges;

test("check passes on the fixture", () => {
  assert.equal(checked(rows()).length, 4);
});

test("check fails on a builder row for another day", () => {
  const corrupted = rows();
  corrupted.builders[3].day = "2026-10-31";
  assert.throws(() => checked(corrupted), /outside the window/);
});

test("check fails on a builder row from an exchange the demo did not name", () => {
  const corrupted = rows();
  corrupted.builders[3].exchange = `0x${"1".repeat(40)}`;
  assert.throws(() => checked(corrupted), /not a named exchange/);
});

test("check fails when a builder row is read twice", () => {
  const corrupted = rows();
  corrupted.builders.push(structuredClone(corrupted.builders[3]));
  assert.throws(() => checked(corrupted), /share a builder code and exchange/);
});

test("check fails when a builder is not a 32-byte code", () => {
  const corrupted = rows();
  corrupted.builders[3].builder = "0xb0";
  assert.throws(() => checked(corrupted), /not a 32-byte code/);
});

test("check fails when a version 1 exchange credits a builder code", () => {
  const corrupted = rows();
  corrupted.builders.find((r) => r.exchange === ctfExchange).builder =
    `0x${"a".repeat(64)}`;
  assert.throws(() => checked(corrupted), /version 1 emits no builder codes/);
});

test("check fails when a fee exceeds its collateral, as from swapped fields", () => {
  const corrupted = rows();
  const row = corrupted.builders[3];
  [row.collateral_amount, row.collateral_fee] = [
    row.collateral_fee,
    row.collateral_amount,
  ];
  assert.throws(() => checked(corrupted), /fee of/);
});

test("check fails when a payout denominator is not the numerators' sum", () => {
  const corrupted = rows();
  corrupted.payouts[0].payout_numerator = "5";
  assert.throws(() => checked(corrupted), /not its denominator/);
});

test("check fails on a condition that pays nothing at all", () => {
  const corrupted = rows();
  for (const row of corrupted.payouts.slice(0, 2)) {
    row.payout_numerator = "0";
    row.payout_denominator = "0";
  }
  assert.throws(() => checked(corrupted), /not its denominator/);
});

test("check fails when a payout row is listed twice", () => {
  const corrupted = rows();
  corrupted.payouts.push(structuredClone(corrupted.payouts[0]));
  assert.throws(() => checked(corrupted), /must appear exactly once/);
});

test("check fails when a losing outcome is missing from a condition", () => {
  const corrupted = rows();
  const loser = corrupted.payouts.find((r) => r.payout_numerator === "0");
  corrupted.payouts = corrupted.payouts.filter((r) => r !== loser);
  assert.throws(() => checked(corrupted), /must appear exactly once/);
});

test("check fails when a condition resolves outside the payout window", () => {
  const corrupted = rows();
  for (const row of corrupted.payouts.slice(0, 2)) row.block = 1;
  assert.throws(() => checked(corrupted), /outside the window/);
});

test("shape sums every builder's fills and puts the zero code first by volume", () => {
  const view = shape(fixtureFetched(), fixtureBinds);
  assert.equal(view.fills, "502,239");
  assert.equal(view.builderCount, "11");
  assert.equal(view.builders[0].label, "No builder code");
  assert.equal(view.builders[0].volume, "$16,518,876.37");
  assert.equal(view.builders.at(-1).label, "4 other builders");
  assert.equal(view.conditionCount, "4");
  assert.deepEqual(view.resolutions, [
    { kind: "Outcome 0 paid in full", count: "2" },
    { kind: "Outcome 1 paid in full", count: "1" },
    { kind: "Split", count: "1" },
  ]);
});

test("a leaderboard that presents truncated volumes as the whole fails", () => {
  const totals = builderTotals(fixture().builders);
  const volume = totals.reduce((sum, t) => sum + t.volume, 0n);
  assert.throws(
    () =>
      assertLeaderboardAddsUp(leaderboardEntries(totals).slice(0, 1), volume),
    /Leaderboard rows sum/,
  );
  assertLeaderboardAddsUp(leaderboardEntries(totals), volume);
});

test("a builder's rows on several exchanges sum into one entry", () => {
  const zero = builderTotals(fixture().builders).find(
    (t) => t.builder === zeroWord,
  );
  assert.equal(zero.fills, 474696n + 31n + 12n);
});
