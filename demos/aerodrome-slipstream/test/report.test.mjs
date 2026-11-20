import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, fixtureBinds, usdcCbbtc, wethUsdc } from "./fixture.mjs";
import {
  check,
  checkLeaderboard,
  leaderboard,
  poolSides,
  shape,
} from "../src/report.mjs";

const rowsOf = () => structuredClone(fixture());
const main = "0x5e7b";
const lists = (rows) =>
  Object.keys(rows)
    .filter((name) => name.startsWith("pools-"))
    .flatMap((name) => rows[name]);
const volumes = (rows) =>
  Object.keys(rows)
    .filter((name) => name.startsWith("volume-"))
    .flatMap((name) => rows[name]);
const ranking = (rows) => {
  const sides = poolSides(lists(rows));
  return {
    poolRows: volumes(rows),
    sides,
    ...leaderboard(volumes(rows), sides),
  };
};

test("check passes on the fixture", () => {
  assert.equal(check({ rows: rowsOf() }, fixtureBinds).length, 3);
});

test("each pool is priced by its USDC side from the pool list, whichever token it is", () => {
  const view = shape({ rows: rowsOf() }, fixtureBinds);
  assert.deepEqual(
    view.rankedPools.map((pool) => pool.pair),
    ["USDC / cbBTC", "USDC / WETH", "USDC / 0x9401…8631"],
  );
  assert.equal(view.unrankedCount, 8);
  assert.equal(view.listedCount, 13);
  assert.equal(view.poolCount, 11);
});

test("check fails when a USDC / WETH pool's volumes are read swapped", () => {
  const rows = rowsOf();
  for (const row of rows[`volume-${main}`])
    if (row.pool === wethUsdc)
      [row.volume0, row.volume1] = [row.volume1, row.volume0];
  assert.throws(() => check({ rows }, fixtureBinds), /dollar side is misread/);
});

test("check fails when a USDC / WETH pool-day moves no WETH", () => {
  const rows = rowsOf();
  rows[`volume-${main}`].find((r) => r.pool === wethUsdc).volume0 = "0";
  assert.throws(() => check({ rows }, fixtureBinds), /dollar side is misread/);
});

test("check fails when a pool traded but is missing from the pool list", () => {
  const rows = rowsOf();
  rows[`pools-${main}`] = rows[`pools-${main}`].filter(
    (r) => r.pool !== usdcCbbtc,
  );
  assert.throws(() => check({ rows }, fixtureBinds), /not in the pool list/);
});

test("check fails when the pool list names a pool twice", () => {
  const rows = rowsOf();
  rows[`pools-${main}`].push({ ...rows[`pools-${main}`][0] });
  assert.throws(() => check({ rows }, fixtureBinds), /names a pool twice/);
});

test("checkLeaderboard fails when a ranked total does not match its rows", () => {
  const { poolRows, sides, ranked } = ranking(rowsOf());
  ranked[0].dollars += 1n;
  assert.throws(
    () => checkLeaderboard(poolRows, sides, ranked),
    /its rows sum to/,
  );
});

test("checkLeaderboard fails when the ranking is out of order", () => {
  const { poolRows, sides, ranked } = ranking(rowsOf());
  ranked.reverse();
  assert.throws(() => checkLeaderboard(poolRows, sides, ranked), /outranks/);
});

test("checkLeaderboard fails when a USDC pool with rows is missing", () => {
  const { poolRows, sides, ranked } = ranking(rowsOf());
  ranked.pop();
  assert.throws(
    () => checkLeaderboard(poolRows, sides, ranked),
    /USDC pools have rows/,
  );
});

test("check fails on a pool-day with zero swaps", () => {
  const rows = rowsOf();
  rows[`volume-${main}`][0].swaps = "0";
  assert.throws(() => check({ rows }, fixtureBinds), /0 swaps/);
});

test("check fails on a duplicated pool-day row", () => {
  const rows = rowsOf();
  rows[`volume-${main}`].push({ ...rows[`volume-${main}`][0] });
  assert.throws(() => check({ rows }, fixtureBinds), /Two rows/);
});

test("check fails on a day outside the window", () => {
  const rows = rowsOf();
  rows[`volume-${main}`][0].day = "2026-11-02";
  assert.throws(() => check({ rows }, fixtureBinds), /outside the window/);
});
