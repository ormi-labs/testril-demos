import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertLeaderboardAddsUp,
  check,
  leaderboardEntries,
  shape,
} from "../src/report.mjs";
import { fillsIn, fixture, fixtureBinds, fixtureFetched } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("the fixture is the same on every call", () => {
  assert.deepEqual(fixture(), fixture());
});

test("check passes on the fixture, including a fill priced at exactly 1", () => {
  const data = rows();
  assert.equal(check(fixtureFetched(data)).length, 4);
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
  assert.throws(
    () => check(fixtureFetched(corrupted)),
    /price outside \(0, 1\]/,
  );
});

test("check fails on a zero-collateral fill", () => {
  const corrupted = rows();
  fillsIn(corrupted)[0].collateral_amount = "0";
  assert.throws(() => check(fixtureFetched(corrupted)), /price outside/);
});

test("check fails on a fill outside the window", () => {
  const corrupted = rows();
  corrupted.fills[0].block = 1;
  assert.throws(() => check(fixtureFetched(corrupted)), /outside the window/);
});

test("check fails when a condition resolves outside the payout window", () => {
  const corrupted = rows();
  for (const row of corrupted.payouts.slice(0, 2)) row.block = 1;
  assert.throws(() => check(fixtureFetched(corrupted)), /outside the window/);
});

test("a fill's hour is the read that resolved to its block, not an even 300 blocks", () => {
  const input = fixtureFetched();
  const [largest] = shape(input, fixtureBinds).tape;
  input.reads.fills[largest.hour].to_block = largest.block;
  input.reads.fills[largest.hour + 1].from_block = largest.block;
  assert.equal(shape(input, fixtureBinds).tape[0].hour, largest.hour + 1);
});

test("check fails on a fill from an exchange the demo did not name", () => {
  const corrupted = rows();
  fillsIn(corrupted)[0].exchange = `0x${"1".repeat(40)}`;
  assert.throws(() => check(fixtureFetched(corrupted)), /not a named exchange/);
});

test("check fails when a fill is read twice", () => {
  const corrupted = rows();
  corrupted.fills.push(structuredClone(corrupted.fills[0]));
  assert.throws(
    () => check(fixtureFetched(corrupted)),
    /share a transaction and log index/,
  );
});

test("check fails when a payout denominator is not the numerators' sum", () => {
  const corrupted = rows();
  corrupted.payouts[0].payout_numerator = "5";
  assert.throws(() => check(fixtureFetched(corrupted)), /not its denominator/);
});

test("check fails when a fill has no builder word", () => {
  const corrupted = rows();
  delete fillsIn(corrupted)[0].builder;
  assert.throws(
    () => check(fixtureFetched(corrupted)),
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
  assert.throws(() => check(fixtureFetched(corrupted)), /not its denominator/);
});

test("check fails when a payout row is listed twice", () => {
  const repeated = rows();
  repeated.payouts.push(structuredClone(repeated.payouts[0]));
  assert.throws(
    () => check(fixtureFetched(repeated)),
    /must appear exactly once/,
  );
});

test("check fails when a losing outcome is missing from a condition", () => {
  const missing = rows();
  const loser = missing.payouts.find((r) => r.payout_numerator === "0");
  missing.payouts = missing.payouts.filter((r) => r !== loser);
  assert.throws(
    () => check(fixtureFetched(missing)),
    /must appear exactly once/,
  );
});

test("check fails when a version 1 fill carries a builder code", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find((f) => f.exchange_version === "1");
  fill.builder = `0x${"a".repeat(64)}`;
  assert.throws(
    () => check(fixtureFetched(corrupted)),
    /Version 1 fill .* emits none/,
  );
});

test("check fails when a version 1 buy books its fee as collateral", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find(
    (f) => f.exchange_version === "1" && f.is_buy,
  );
  [fill.collateral_fee, fill.token_fee] = [fill.token_fee, fill.collateral_fee];
  assert.throws(() => check(fixtureFetched(corrupted)), /wrong asset/);
});

test("check fails when a version 2 sell books its fee as tokens", () => {
  const corrupted = rows();
  const fill = fillsIn(corrupted).find(
    (f) => f.exchange_version === "2" && !f.is_buy,
  );
  [fill.collateral_fee, fill.token_fee] = [fill.token_fee, fill.collateral_fee];
  assert.throws(() => check(fixtureFetched(corrupted)), /wrong asset/);
});

test("shape ranks the largest fill first and builders by volume", () => {
  const view = shape(fixtureFetched(), fixtureBinds);
  assert.equal(view.fills, "280");
  assert.match(view.tape[0].volume, /^\$640,/);
  assert.equal(view.tape[0].price.split(".")[0], "0");
  assert.notEqual(view.builders[0].label, "No builder code");
  assert.equal(view.builderCount, "4");
});

test("shape's odds line follows the busiest market upward through the day", () => {
  const { points } = shape(fixtureFetched(), fixtureBinds).odds;
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
