import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertLeaderboardAddsUp,
  check,
  fillBinds,
  leaderboardEntries,
  shape,
} from "../src/report.mjs";
import { fillsIn, firstFillBind, fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("the fixture is the same on every call", () => {
  assert.deepEqual(fixture(), fixture());
});

test("check passes on the fixture, including a fill priced at exactly 1", () => {
  const data = rows();
  assert.equal(check(data, fixtureBinds).length, 4);
  assert.ok(fillsIn(data).some((f) => f.collateral_amount === f.token_amount));
});

test("check fails when a fill's amounts are swapped, pricing it above 1", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find(
    (f) => f.collateral_amount !== f.token_amount,
  );
  [fill.collateral_amount, fill.token_amount] = [
    fill.token_amount,
    fill.collateral_amount,
  ];
  assert.throws(() => check(corrupted, fixtureBinds), /price outside \(0, 1\]/);
});

test("check fails on a zero-collateral fill", () => {
  const corrupted = rows();
  fillsIn(corrupted)[0].collateral_amount = "0";
  assert.throws(() => check(corrupted, fixtureBinds), /price outside/);
});

test("check fails on a fill whose block is out of hour order", () => {
  const corrupted = rows();
  const hours = fillBinds(fixtureBinds).filter(
    (bind) => corrupted[bind.name].length,
  );
  corrupted[hours[0].name][0].block = corrupted[hours.at(-1).name][0].block + 1;
  assert.throws(() => check(corrupted, fixtureBinds), /earlier hour already/);
});

test("check fails on a fill from an exchange the demo did not name", () => {
  const corrupted = rows();
  fillsIn(corrupted)[0].exchange = `0x${"1".repeat(40)}`;
  assert.throws(() => check(corrupted, fixtureBinds), /not a named exchange/);
});

test("check fails when a fill is read twice", () => {
  const corrupted = rows();
  corrupted[firstFillBind(corrupted)].push(
    structuredClone(fillsIn(corrupted)[0]),
  );
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /share a transaction and log index/,
  );
});

test("check fails when a payout denominator is not the numerators' sum", () => {
  const corrupted = rows();
  corrupted.payouts[0].payout_numerator = "5";
  assert.throws(() => check(corrupted, fixtureBinds), /not its denominator/);
});

test("check fails when a fill has no builder word", () => {
  const corrupted = rows();
  delete fillsIn(corrupted)[0].builder;
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /no 32-byte builder word/,
  );
});

test("check fails on a condition that pays nothing at all", () => {
  const corrupted = rows();
  const [first] = corrupted.payouts;
  for (const row of corrupted.payouts.filter(
    (r) => r.condition_id === first.condition_id,
  )) {
    row.payout_numerator = "0";
    row.payout_denominator = "0";
  }
  assert.throws(() => check(corrupted, fixtureBinds), /not its denominator/);
});

test("check fails when a payout row is listed twice", () => {
  const repeated = rows();
  repeated.payouts.push(structuredClone(repeated.payouts[0]));
  assert.throws(
    () => check(repeated, fixtureBinds),
    /must appear exactly once/,
  );
});

test("check fails when a losing outcome is missing from a condition", () => {
  const missing = rows();
  const loser = missing.payouts.find((r) => r.payout_numerator === "0");
  missing.payouts = missing.payouts.filter((r) => r !== loser);
  assert.throws(() => check(missing, fixtureBinds), /must appear exactly once/);
});

test("check fails when a version 1 fill carries a builder code", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find((f) => f.exchange_version === "1");
  fill.builder = `0x${"a".repeat(64)}`;
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /Version 1 fill .* emits none/,
  );
});

test("check fails when a version 1 buy books its fee as collateral", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find(
    (f) => f.exchange_version === "1" && f.is_buy,
  );
  [fill.collateral_fee, fill.token_fee] = [fill.token_fee, fill.collateral_fee];
  assert.throws(() => check(corrupted, fixtureBinds), /wrong asset/);
});

test("check fails when a version 2 sell books its fee as tokens", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find(
    (f) => f.exchange_version === "2" && !f.is_buy,
  );
  [fill.collateral_fee, fill.token_fee] = [fill.token_fee, fill.collateral_fee];
  assert.throws(() => check(corrupted, fixtureBinds), /wrong asset/);
});

test("shape ranks the largest fill first and builders by volume", () => {
  const view = shape(rows(), fixtureBinds);
  assert.equal(view.fills, "280");
  assert.match(view.tape[0].volume, /^\$640,/);
  assert.equal(view.tape[0].price.split(".")[0], "0");
  assert.notEqual(view.builders[0].label, "No builder code");
  assert.equal(view.builderCount, "4");
});

test("shape's odds line follows the busiest market upward through the day", () => {
  const { points } = shape(rows(), fixtureBinds).odds;
  assert.ok(points.length > 12);
  assert.ok(points.at(-1).price > points[0].price + 0.2);
});

test("a leaderboard that presents truncated volumes as the whole fails", () => {
  const fills = fillsIn(rows());
  const total = fills.reduce((sum, f) => sum + BigInt(f.collateral_amount), 0n);
  const truncated = leaderboardEntries(fills).slice(0, 1);
  assert.throws(
    () => assertLeaderboardAddsUp(truncated, total),
    /Leaderboard rows sum/,
  );
  assertLeaderboardAddsUp(leaderboardEntries(fills), total);
});
