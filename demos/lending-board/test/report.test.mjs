import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const usdcRows = (list) =>
  list.filter((row) => (row.asset ?? row.token).startsWith("0xa0b869"));

test("check passes on the fixture with four proven statements", () => {
  assert.equal(check(rows()).length, 4);
});

test("check fails when debt and supply are swapped", () => {
  const corrupted = rows();
  for (const row of usdcRows(corrupted["reserve-state"]))
    [row.variable_debt, row.a_token_supply] = [
      row.a_token_supply,
      row.variable_debt,
    ];
  assert.throws(() => check(corrupted), /USDC utilization .* above 100%/);
});

test("check fails when rates carry nine extra digits", () => {
  const corrupted = rows();
  for (const row of corrupted["reserve-state"])
    row.variable_borrow_rate += "000000000";
  assert.throws(() => check(corrupted), /not in ray/);
});

test("check fails when rates lose nine digits", () => {
  const corrupted = rows();
  for (const row of corrupted["reserve-state"])
    row.variable_borrow_rate = row.variable_borrow_rate.slice(0, -9);
  assert.throws(() => check(corrupted), /not in ray/);
});

test("check fails when supply and borrow rates are swapped", () => {
  const corrupted = rows();
  for (const row of usdcRows(corrupted["reserve-state"]))
    [row.liquidity_rate, row.variable_borrow_rate] = [
      row.variable_borrow_rate,
      row.liquidity_rate,
    ];
  assert.throws(() => check(corrupted), /supply rate .* above its borrow rate/);
});

test("check fails when a lifetime total falls", () => {
  const corrupted = rows();
  const history = usdcRows(corrupted["reserve-totals"]).toSorted(
    (a, b) => a.block - b.block,
  );
  history.at(-1).liquidated_collateral = "1";
  assert.throws(() => check(corrupted), /liquidated_collateral decreases/);
});

test("check fails when Morpho holdings are negative", () => {
  const corrupted = rows();
  corrupted["morpho-holdings"][0].in_vaults = "-1";
  assert.throws(() => check(corrupted), /non-negative integers/);
});

test("check fails when Morpho holdings are decimals", () => {
  const corrupted = rows();
  corrupted["morpho-holdings"][0].in_markets = "1.5";
  assert.throws(() => check(corrupted), /non-negative integers/);
});

test("check fails when Morpho holds no USDC on a day", () => {
  const corrupted = rows();
  for (const row of usdcRows(corrupted["morpho-holdings"]).slice(0, 1))
    row.in_markets = row.in_vaults = "0";
  assert.throws(() => check(corrupted), /Morpho holds no USDC/);
});

test("check fails when an asset is missing its last hour", () => {
  const corrupted = rows();
  corrupted["reserve-state"] = corrupted["reserve-state"].filter(
    (row) =>
      !(row.asset.startsWith("0xa0b869") && row.hour === "2026-10-31T23"),
  );
  assert.throws(() => check(corrupted), /USDC has no state at 2026-10-31T23/);
});

test("shape converts ray to percent and stacks idle USDC across venues", () => {
  const corrupted = rows();
  const last = usdcRows(corrupted["reserve-state"]).at(-1);
  last.variable_borrow_rate = "58750000000000000000000000";
  last.a_token_supply = "2000000000000000";
  last.variable_debt = "1500000000000000";
  const view = shape(corrupted);
  assert.equal(view.board[0].borrowApr, "5.87%");
  assert.equal(view.board[0].utilization, "75.00%");
  assert.equal(view.board[0].supplied, "2.00B");
  assert.equal(view.byVenue.length, 7);
  assert.equal(view.byVenueLatest.aaveIdle, "500.00M");
});
