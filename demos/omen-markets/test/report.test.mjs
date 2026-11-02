import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
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
  for (const trade of corrupted.trades)
    if (trade.side === "buy" && trade.outcome_index === "0")
      trade.side = "sell";
  assert.throws(() => check(corrupted), /sold .* tokens of outcome/);
});

test("check fails when the fee is larger than the trade", () => {
  const corrupted = rows();
  const trade = corrupted.trades[5];
  trade.fee_amount = (BigInt(trade.collateral_amount) + 1n).toString();
  assert.throws(() => check(corrupted), /kept a fee/);
});

test("check fails when an answer finalizes before it was given", () => {
  const corrupted = rows();
  corrupted.answers[0].finalize_ts = "1";
  assert.throws(() => check(corrupted), /finalizes before/);
});

test("shape ranks markets by volume and shows the last answer per question", () => {
  const view = shape(rows());
  assert.equal(view.markets[0].volume, "1,801.00 wxDAI");
  assert.equal(view.markets[0].trades, "3");
  const questions = view.answers.map((a) => a.question);
  assert.equal(new Set(questions).size, questions.length);
  assert.ok(view.answers.some((a) => a.answer === "Invalid"));
  assert.ok(view.answers.some((a) => a.bond === "25.00 wxDAI"));
});
