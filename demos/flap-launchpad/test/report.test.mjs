import { test } from "node:test";
import assert from "node:assert/strict";
import { check, formatBnb, shape, tradesDay } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("check proves the trade day's volume and fees", () => {
  const passed = check(rows());
  assert.equal(passed.length, 3);
  assert.match(passed[1], /equal the sums of 240 trade rows/);
});

test("check fails when a sell is read as a buy", () => {
  const corrupted = rows();
  const sell = corrupted.trades.find((t) => !t.is_buy);
  sell.is_buy = true;
  assert.throws(() => check(corrupted), /sums (buys|sells) to/);
});

test("check fails when volume is in BNB instead of raw wei", () => {
  const corrupted = rows();
  for (const row of corrupted.volume.filter((r) => r.day === tradesDay))
    row.buy_quote_amount = (
      BigInt(row.buy_quote_amount) /
      10n ** 18n
    ).toString();
  assert.throws(() => check(corrupted), /sums buys to/);
});

test("check fails when a trade is missing from the rows", () => {
  const corrupted = rows();
  corrupted.trades.pop();
  assert.throws(() => check(corrupted), /counts \d+ trades|sums/);
});

test("check fails on a negative fee", () => {
  const corrupted = rows();
  corrupted.trades[3].fee_amount = "-1";
  assert.throws(() => check(corrupted), /negative fee/);
});

test("check fails when a volume day is missing", () => {
  const corrupted = rows();
  corrupted.volume = corrupted.volume.filter((r) => r.day !== "2026-10-27");
  assert.throws(() => check(corrupted), /missing 2026-10-27/);
});

test("shape ranks tokens by buys plus sells and totals match the rows", () => {
  const data = rows();
  const view = shape(data);
  const buys = data.volume.reduce((s, r) => s + BigInt(r.buy_quote_amount), 0n);
  assert.equal(view.buys, formatBnb(buys));
  const volumes = view.tokens.map((t) => t.buysBnb + t.sellsBnb);
  assert.deepEqual(
    volumes,
    [...volumes].sort((a, b) => b - a),
  );
  assert.equal(view.tokens.length, 14);
});
