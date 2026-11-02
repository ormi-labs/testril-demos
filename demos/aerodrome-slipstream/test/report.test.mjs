import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { check, knownPools, leaderboard, shape } from "../src/report.mjs";

const t_swap = (known) =>
  Object.assign(known, {
    dollarSide: known.otherSide,
    otherSide: known.dollarSide,
  });

const rowsOf = () => structuredClone(fixture().rows);

test("check passes on the fixture", () => {
  assert.equal(check(rowsOf()).length, 3);
});

test("the pool with the most dollars leads, though WETH/USDC has the larger raw volume", () => {
  const view = shape(rowsOf());
  assert.equal(view.rankedPools[0].pair, "USDC / cbBTC");
  assert.equal(view.rankedPools[1].pair, "WETH / USDC");
  assert.equal(view.unrankedPools.length, 8);
});

test("check fails when a pool's dollar side is read from the wrong token", () => {
  for (const pool of Object.keys(knownPools)) {
    const known = knownPools[pool];
    const original = { ...known };
    t_swap(known);
    try {
      assert.throws(() => check(rowsOf()), /dollar side is misread/);
    } finally {
      Object.assign(known, original);
    }
  }
});

test("check fails when a ranked total does not match its rows", () => {
  const rows = rowsOf();
  const board = leaderboard(rows["pool-volume"]);
  board.ranked[0].dollars += 1n;
  assert.throws(() => check(rows, board), /its rows sum to/);
});

test("check fails when the ranking is out of order", () => {
  const rows = rowsOf();
  const board = leaderboard(rows["pool-volume"]);
  board.ranked.reverse();
  assert.throws(() => check(rows, board), /outranks/);
});

test("check fails on a pool-day with zero swaps", () => {
  const rows = rowsOf();
  rows["pool-volume"][0].swaps = "0";
  assert.throws(() => check(rows), /0 swaps/);
});

test("check fails on a duplicated pool-day row", () => {
  const rows = rowsOf();
  rows["pool-volume"].push({ ...rows["pool-volume"][0] });
  assert.throws(() => check(rows), /Two rows/);
});

test("check fails on a day outside the window", () => {
  const rows = rowsOf();
  rows["pool-volume"][0].day = "2026-11-02";
  assert.throws(() => check(rows), /outside the window/);
});
