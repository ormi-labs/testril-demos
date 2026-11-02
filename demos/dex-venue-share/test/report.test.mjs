import { test } from "node:test";
import assert from "node:assert/strict";
import { basisPoints, check, days, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);
const v4Pool =
  "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27";

test("check passes on the fixture for both pairs", () => {
  const passed = check(rows());
  assert.equal(passed.length, 4);
  assert.match(passed[0], /ETH \/ USDC venue shares sum to 100.00%/);
});

test("check fails when v4 USDC volume is read as its ETH side", () => {
  const corrupted = rows();
  for (const row of corrupted["uniswap-v4"].filter((r) => r.pool === v4Pool))
    [row.volume0, row.volume1] = [row.volume1, row.volume0];
  assert.throws(() => check(corrupted), /Uniswap v4 trades .* per ETH/);
});

test("check fails when Curve USDC coin is read as WETH", () => {
  const corrupted = rows();
  for (const row of corrupted.curve)
    row.coin_index =
      row.coin_index === "2" ? "0" : row.coin_index === "0" ? "2" : "1";
  assert.throws(() => check(corrupted), /Curve trades .* per ETH/);
});

test("check fails when a day has no volume at any venue", () => {
  const corrupted = rows();
  const [, second] = days();
  for (const list of Object.values(corrupted))
    list.splice(0, list.length, ...list.filter((r) => r.day !== second));
  assert.throws(
    () => check(corrupted),
    new RegExp(`No ETH / USDC volume on ${second}`),
  );
});

test("basisPoints hands leftover points to the largest remainders", () => {
  assert.deepEqual(basisPoints([1n, 1n, 1n]), [3334n, 3333n, 3333n]);
  assert.deepEqual(basisPoints([5n, 0n, 15n]), [2500n, 0n, 7500n]);
});

test("shape shows v4 and Fluid gaining share while v3 loses it", () => {
  const view = shape(rows());
  const [first, last] = [view.pairs[0].days[0], view.pairs[0].days.at(-1)];
  const share = (day, venue) =>
    day.shares.find((s) => s.venue === venue).fraction;
  assert.ok(share(last, "Uniswap v4") > share(first, "Uniswap v4"));
  assert.ok(share(last, "Uniswap v3") < share(first, "Uniswap v3"));
  assert.equal(view.headline.leader, "Uniswap v3");
  assert.equal(view.tiers[0].tier, "0.05%");
  assert.ok(view.tiers[0].fraction > view.tiers[1].fraction);
});
