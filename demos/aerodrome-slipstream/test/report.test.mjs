import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { check, shape } from "../src/report.mjs";

const rowsOf = () => structuredClone(fixture().rows);

test("check passes on the fixture", () => {
  assert.equal(check(rowsOf()).length, 3);
});

test("the pool with the most dollars leads, using each pool's dollar side", () => {
  const view = shape(rowsOf());
  assert.equal(view.pools[0].pair, "WETH / USDC");
  assert.equal(view.pools[1].pair, "USDC / cbBTC");
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
