import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, window } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("check passes on the fixture", () => {
  assert.equal(check(rows()).length, 3);
});

test("check fails when a trade is on a market that is not listed", () => {
  const corrupted = rows();
  corrupted.trades[0].market = `0x${"1".repeat(40)}`;
  assert.throws(() => check(corrupted), /not in market_list/);
});

test("check fails when buys are read as sells", () => {
  const corrupted = rows();
  const buy = corrupted.trades.find((trade) => trade.side === "buy");
  buy.side = "sell";
  assert.throws(() => check(corrupted), /kept a fee/);
});

test("check fails when a fee is read 10^2 too large", () => {
  const corrupted = rows();
  const trade = corrupted.trades[5];
  trade.fee_amount = (BigInt(trade.fee_amount) * 100n).toString();
  assert.throws(() => check(corrupted), /kept a fee/);
});

test("check fails when a pool's tokens do not follow its trades", () => {
  const corrupted = rows();
  const state = corrupted.market_state.findLast(
    (row) => row.market === corrupted.trades.at(-1).market,
  );
  state.amount = (BigInt(state.amount) + 10n ** 18n).toString();
  assert.throws(() => check(corrupted), /its trades leave/);
});

test("check fails when a pool holds negative tokens", () => {
  const corrupted = rows();
  corrupted.market_state[0].amount = "-1";
  assert.throws(() => check(corrupted), /holds -1 tokens/);
});

test("check fails when an answer finalizes before it was given", () => {
  const corrupted = rows();
  corrupted.answers[0].finalize_ts = "1";
  assert.throws(() => check(corrupted), /finalizes before/);
});

test("shape ranks wxDAI markets by volume and lists other collateral apart", () => {
  const view = shape(rows());
  assert.equal(view.markets[0].volume, "1,801.00 wxDAI");
  assert.equal(view.markets[0].trades, "3");
  assert.equal(view.otherCollateral[0].rawVolume, "350000000");
  assert.ok(view.markets.every((market) => market.wxdai < 1e6));
});

test("shape counts only markets created in the window", () => {
  const data = rows();
  const created = data.markets.filter(
    (m) => m.block >= window.from_block && m.block < window.to_block,
  );
  assert.ok(created.length < data.markets.length);
  assert.equal(shape(data).marketCount, String(created.length));
});

test("shape skips a trade on an unlisted market instead of throwing", () => {
  const corrupted = rows();
  corrupted.trades[0].market = `0x${"1".repeat(40)}`;
  assert.doesNotThrow(() => shape(corrupted));
});

test("shape shows the last answer per question, bonds in xDAI", () => {
  const view = shape(rows());
  const questions = view.answers.map((a) => a.question);
  assert.equal(new Set(questions).size, questions.length);
  assert.ok(view.answers.some((a) => a.answer === "Invalid"));
  assert.ok(view.answers.some((a) => a.bond === "25.00 xDAI"));
});
