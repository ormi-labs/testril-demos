import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("check passes on the fixture for every venue", () => {
  assert.equal(check(rows()).length, 3);
});

test("check fails when an amount is negative", () => {
  const corrupted = rows();
  corrupted["aqua-base"][0].amount = "-5";
  assert.throws(() => check(corrupted), /negative or non-integer/);
});

test("check fails when a day is counted twice", () => {
  const corrupted = rows();
  corrupted["tessera-base"].push({ ...corrupted["tessera-base"][0] });
  assert.throws(() => check(corrupted), /appears twice/);
});

test("check fails on a day outside the window", () => {
  const corrupted = rows();
  corrupted["aqua-ethereum"][0].day = "2026-11-02";
  assert.throws(() => check(corrupted), /outside the window/);
});

test("check fails when an amount is in decimal units instead of raw", () => {
  const corrupted = rows();
  corrupted["tessera-base"][0].amount_in = "0.04";
  assert.throws(() => check(corrupted), /non-integer/);
});

test("shape keeps 18-decimal and 6-decimal tokens apart and fills quiet days", () => {
  const rowsByName = rows();
  const [usdc, weth] = [
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    "0x4200000000000000000000000000000000000006",
  ];
  const day = "2026-10-26";
  rowsByName["aqua-base"] = [
    { day, token: usdc, pushes: "3", amount: "1500000000" },
    { day, token: weth, pushes: "2", amount: "2500000000000000000" },
  ];
  const base = shape(rowsByName).venues.find((v) => v.name === "aqua-base");
  assert.deepEqual(
    base.tokens.map((t) => [t.symbol, t.total, t.count]),
    [
      ["USDC", "1,500.00", "3"],
      ["WETH", "2.50", "2"],
    ],
  );
  assert.equal(base.tokens[0].bars.length, 8);
  assert.equal(base.tokens[0].bars.filter((bar) => bar.value === 0).length, 7);
  assert.equal(base.count, "5");
});
