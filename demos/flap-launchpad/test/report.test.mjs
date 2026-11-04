import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  formatBnb,
  shape,
  tradesDay,
  zeroAddress,
} from "../src/report.mjs";
import { fixture, usd1 } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

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

test("check fails when a fee is scaled by 10^18", () => {
  const corrupted = rows();
  const trade = corrupted.trades[3];
  trade.fee_amount = (BigInt(trade.fee_amount) * 10n ** 18n).toString();
  assert.throws(() => check(corrupted), /has fee/);
});

test("check fails when fee and quote amount are swapped", () => {
  const corrupted = rows();
  const trade = corrupted.trades[3];
  [trade.fee_amount, trade.quote_amount] = [
    trade.quote_amount,
    trade.fee_amount,
  ];
  assert.throws(() => check(corrupted), /has fee/);
});

test("check fails when a trade is relabelled to another quote asset", () => {
  const corrupted = rows();
  corrupted.trades.find((t) => t.quote_token === zeroAddress).quote_token =
    usd1;
  assert.throws(() => check(corrupted), /On 2026-11-01, .* /);
});

test("check fails on a volume row outside the window", () => {
  const corrupted = rows();
  corrupted.volume.push({ ...corrupted.volume[0], day: "2026-11-05" });
  assert.throws(() => check(corrupted), /2026-11-05 is outside/);
});

test("check fails when a volume day is missing", () => {
  const corrupted = rows();
  corrupted.volume = corrupted.volume.filter((r) => r.day !== "2026-10-27");
  assert.throws(() => check(corrupted), /missing 2026-10-27/);
});

test("shape ranks tokens by buys plus sells and totals match the rows", () => {
  const data = rows();
  const view = shape(data);
  const native = data.volume.filter((r) => r.quote_token === zeroAddress);
  const buys = native.reduce((s, r) => s + BigInt(r.buy_quote_amount), 0n);
  assert.equal(view.buys, formatBnb(buys));
  const volumes = view.tokens.map((t) => t.buysBnb + t.sellsBnb);
  assert.deepEqual(
    volumes,
    [...volumes].sort((a, b) => b - a),
  );
  assert.equal(view.tokens.length, 14);
});

test("shape leaves out the token quoted in another asset", () => {
  const data = rows();
  const view = shape(data);
  const everyBuy = data.volume.reduce(
    (s, r) => s + BigInt(r.buy_quote_amount),
    0n,
  );
  const everyFee = data.trades.reduce((s, t) => s + BigInt(t.fee_amount), 0n);
  const usd1Token = data.trades.find((t) => t.quote_token === usd1).token;
  assert.notEqual(view.buys, formatBnb(everyBuy));
  assert.notEqual(view.fees, formatBnb(everyFee));
  assert.equal(view.tokenCount, 14);
  assert.ok(!view.tokens.some((t) => t.token === usd1Token));
});
