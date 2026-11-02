import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("the fixture is the same on every call", () => {
  assert.deepEqual(fixture(), fixture());
});

test("check passes on the fixture, including a fill priced at exactly 1", () => {
  const data = rows();
  assert.equal(check(data).length, 3);
  assert.ok(data.fills.some((f) => f.collateral_amount === f.token_amount));
});

test("check fails when a fill's amounts are swapped, pricing it above 1", () => {
  const corrupted = rows();
  const fill = corrupted.fills.find(
    (f) => f.collateral_amount !== f.token_amount,
  );
  [fill.collateral_amount, fill.token_amount] = [
    fill.token_amount,
    fill.collateral_amount,
  ];
  assert.throws(() => check(corrupted), /price outside \(0, 1\]/);
});

test("check fails on a zero-collateral fill", () => {
  const corrupted = rows();
  corrupted.fills[0].collateral_amount = "0";
  assert.throws(() => check(corrupted), /price outside/);
});

test("check fails on a fill outside the block window", () => {
  const corrupted = rows();
  corrupted.fills[0].block = 1;
  assert.throws(() => check(corrupted), /outside the window/);
});

test("check fails on a fill from an exchange the demo did not name", () => {
  const corrupted = rows();
  corrupted.fills[0].exchange = `0x${"1".repeat(40)}`;
  assert.throws(() => check(corrupted), /not a named exchange/);
});

test("check fails when a fill is read twice", () => {
  const corrupted = rows();
  corrupted.fills.push(structuredClone(corrupted.fills[0]));
  assert.throws(() => check(corrupted), /share a transaction and log index/);
});

test("check fails when a payout denominator is not the numerators' sum", () => {
  const corrupted = rows();
  corrupted.payouts[0].payout_numerator = "5";
  assert.throws(() => check(corrupted), /denominator of 1/);
});

test("shape ranks the largest fill first and builders by volume", () => {
  const view = shape(rows());
  assert.equal(view.fills, "280");
  assert.match(view.tape[0].volume, /^\$640,/);
  assert.equal(view.tape[0].price.split(".")[0], "0");
  assert.equal(view.builders[0].label !== "No builder code", true);
  assert.equal(view.builderCount, "4");
});

test("shape's odds line follows the busiest market upward through the day", () => {
  const { points } = shape(rows()).odds;
  assert.ok(points.length > 12);
  assert.ok(points.at(-1).price > points[0].price + 0.2);
});
