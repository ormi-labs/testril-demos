import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, fixtureBinds } from "./fixture.mjs";
import {
  check,
  checkLeaderboard,
  knownPools,
  leaderboard,
  shape,
} from "../src/report.mjs";

const rowsOf = () => structuredClone(fixture());

test("check passes on the fixture", () => {
  assert.equal(check(rowsOf(), fixtureBinds).length, 3);
});

test("the pool with the most dollars leads, though WETH/USDC has the larger raw volume", () => {
  const view = shape(rowsOf(), fixtureBinds);
  assert.equal(view.rankedPools[0].pair, "USDC / cbBTC");
  assert.equal(view.rankedPools[1].pair, "WETH / USDC");
  assert.equal(view.unrankedPools.length, 8);
});

test("check fails when a pool's volume0 and volume1 are read swapped", () => {
  for (const pool of Object.keys(knownPools)) {
    const rows = rowsOf();
    for (const row of rows["pool-volume"])
      if (row.pool === pool)
        [row.volume0, row.volume1] = [row.volume1, row.volume0];
    assert.throws(() => check(rows, fixtureBinds), /dollar side is misread/);
  }
});

test("check fails when a pool has no volume on the other token", () => {
  const rows = rowsOf();
  const row = rows["pool-volume"].find((r) => knownPools[r.pool]);
  row[knownPools[row.pool].otherSide] = "0";
  assert.throws(() => check(rows, fixtureBinds), /dollar side is misread/);
});

test("checkLeaderboard fails when a ranked total does not match its rows", () => {
  const poolRows = rowsOf()["pool-volume"];
  const { ranked } = leaderboard(poolRows);
  ranked[0].dollars += 1n;
  assert.throws(() => checkLeaderboard(poolRows, ranked), /its rows sum to/);
});

test("checkLeaderboard fails when the ranking is out of order", () => {
  const poolRows = rowsOf()["pool-volume"];
  const { ranked } = leaderboard(poolRows);
  ranked.reverse();
  assert.throws(() => checkLeaderboard(poolRows, ranked), /outranks/);
});

test("checkLeaderboard fails when a known pool with rows is missing", () => {
  const poolRows = rowsOf()["pool-volume"];
  const { ranked } = leaderboard(poolRows);
  ranked.pop();
  assert.throws(
    () => checkLeaderboard(poolRows, ranked),
    /known pools have rows/,
  );
});

test("check fails on a pool-day with zero swaps", () => {
  const rows = rowsOf();
  rows["pool-volume"][0].swaps = "0";
  assert.throws(() => check(rows, fixtureBinds), /0 swaps/);
});

test("check fails on a duplicated pool-day row", () => {
  const rows = rowsOf();
  rows["pool-volume"].push({ ...rows["pool-volume"][0] });
  assert.throws(() => check(rows, fixtureBinds), /Two rows/);
});

test("check fails on a day outside the window", () => {
  const rows = rowsOf();
  rows["pool-volume"][0].day = "2026-11-02";
  assert.throws(() => check(rows, fixtureBinds), /outside the window/);
});
