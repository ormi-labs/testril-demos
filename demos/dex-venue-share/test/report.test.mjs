import { test } from "node:test";
import assert from "node:assert/strict";
import { basisPoints, check, days, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);
const curvePool = "0x7f86bf177dd4f3494b841a37e810a34dd56c829b";
const v4Pool =
  "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27";

test("check passes on the fixture for both pairs", () => {
  const passed = check(rows());
  assert.equal(passed.length, 4);
  assert.match(passed[0], /ETH \/ USDC every subject pool has rows/);
});

test("check fails when v4 USDC volume is read as its ETH side", () => {
  const corrupted = rows();
  for (const row of corrupted["uniswap-v4"].filter((r) => r.pool === v4Pool))
    [row.volume0, row.volume1] = [row.volume1, row.volume0];
  assert.throws(() => check(corrupted), /Uniswap v4 trades .* per ETH/);
});

test("check fails when a subject pool address matches no rows", () => {
  const corrupted = rows();
  for (const row of corrupted["uniswap-v4"].filter((r) => r.pool === v4Pool))
    row.pool = `0x${"cd".repeat(32)}`;
  assert.throws(
    () => check(corrupted),
    /Uniswap v4 subject pool 0x21c6.* has no rows/,
  );
});

test("check fails when Curve's ETH coin index points at USDC", () => {
  const corrupted = rows();
  for (const row of corrupted.curve.filter((r) => r.pool === curvePool))
    if (row.coin_index === "2") row.coin_index = "0";
    else if (row.coin_index === "0") row.coin_index = "2";
  assert.throws(() => check(corrupted), /Curve .* per ETH/);
});

test("check fails when both wstETH pools are read with the sides swapped", () => {
  const corrupted = rows();
  const wsteth = [
    "0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa",
    "0x0b1a513ee24972daef112bc777a5610d4325c9e7",
  ];
  for (const bind of ["uniswap-v3", "fluid-dex"])
    for (const row of corrupted[bind].filter((r) => wsteth.includes(r.pool)))
      [row.volume0, row.volume1] = [row.volume1, row.volume0];
  assert.throws(() => check(corrupted), /outside the plausible/);
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
