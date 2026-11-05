import { test } from "node:test";
import assert from "node:assert/strict";
import { check, jitEvents, sandwiches, shape } from "../src/report.mjs";
import { fixture, fixtureBinds, fixtureFetched } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check passes on the fixture with all three invariants", () => {
  const passed = check(fixtureFetched(rows()), fixtureBinds);
  assert.equal(passed.length, 3);
  assert.match(passed[2], /^3 JIT adds/);
});

test("check fails when a swap's amounts are flipped against its price move", () => {
  const corrupted = rows();
  const swap = corrupted.swaps.findLast((s) => BigInt(s.amount0) > 0n);
  swap.amount0 = `-${swap.amount0}`;
  swap.amount1 = swap.amount1.slice(1);
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /price must/,
  );
});

test("check fails when a swap pays and receives the same sign", () => {
  const corrupted = rows();
  corrupted.swaps[0].amount1 = corrupted.swaps[0].amount0;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /pays one currency/,
  );
});

test("check fails when a swap reports less liquidity than a JIT add in range", () => {
  const corrupted = rows();
  const { swap } = jitEvents(corrupted)[0];
  corrupted.swaps.find((s) => s.tx === swap.tx).liquidity = "1";
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /less than the .* added in range/,
  );
});

test("check fails when a row sits outside the window", () => {
  const corrupted = rows();
  corrupted.swaps[0].block = 1;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /outside the window/,
  );
});

test("a swap belongs to the hour whose read resolved to its block, not to an even 300 blocks", () => {
  const input = fixtureFetched(rows());
  const [hour0, hour1] = input.reads.swaps;
  const first = input.rows.swaps.find((row) => row.block >= hour1.from_block);
  const counts = shape(input, fixtureBinds).hourly.map((h) => h.swaps);
  hour0.to_block = hour1.from_block = first.block + 1;
  const moved = shape(input, fixtureBinds).hourly.map((h) => h.swaps);
  assert.deepEqual(moved.slice(0, 2), [counts[0] + 1, counts[1] - 1]);
});

test("check fails when USDC decimals are not 6", () => {
  const corrupted = rows();
  corrupted.tokens[0].decimals = "18";
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /not 6 decimals/,
  );
});

test("JIT needs an exactly negated remove: one unit short is not JIT", () => {
  const corrupted = rows();
  const { remove } = jitEvents(corrupted)[0];
  const row = corrupted.liquidity.find((r) => r.tx === remove.tx);
  row.liquidity_delta = String(BigInt(row.liquidity_delta) + 1n);
  assert.equal(jitEvents(corrupted).length, 2);
});

test("a sandwich needs opposite directions: same direction twice is not one", () => {
  const corrupted = rows();
  assert.equal(sandwiches(corrupted).length, 2);
  const { back } = sandwiches(corrupted)[0];
  const row = corrupted.swaps.find((s) => s.tx === back.tx);
  [row.amount0, row.amount1] = [row.amount1.slice(1), row.amount0];
  assert.equal(sandwiches(corrupted).length, 1);
});

test("shape lists the biggest swaps first and counts the planted patterns", () => {
  const view = shape(fixtureFetched(rows()), fixtureBinds);
  assert.equal(view.biggest[0].size, "$4,200,000.00");
  assert.equal(view.biggest[0].direction, "ETH → USDC");
  assert.equal(view.biggest[1].direction, "USDC → ETH");
  assert.equal(view.counts.jit, "3");
  assert.equal(view.counts.sandwiches, "2");
  assert.equal(view.hourly.length, 24);
  assert.match(view.biggest[0].tx.url, /^https:\/\/etherscan\.io\/tx\/0x/);
});
