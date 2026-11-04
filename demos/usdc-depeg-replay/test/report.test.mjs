import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  hourBlocks,
  hours,
  shape,
  zeroAddress,
} from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check proves each hour's supply change from mints and burns", () => {
  assert.equal(check(rows()).length, 3);
});

test("check fails when a burn is read as a mint", () => {
  const corrupted = rows();
  const burn = corrupted["usdc-edges"].find(
    (e) => e.to === zeroAddress && e.block >= hourBlocks(1).from,
  );
  [burn.from, burn.to] = [zeroAddress, burn.from];
  assert.throws(() => check(corrupted), /mints minus burns/);
});

test("check fails when supply is in whole dollars instead of raw units", () => {
  const corrupted = rows();
  for (const row of corrupted.supply)
    row.total_supply = (BigInt(row.total_supply) / 1000000n).toString();
  assert.throws(() => check(corrupted), /USDC supply changed by/);
});

test("check fails when the answer is read with the wrong decimals", () => {
  const corrupted = rows();
  for (const row of corrupted["usdc-usd-feed"])
    row.answer = (BigInt(row.answer) * 100n).toString();
  assert.throws(() => check(corrupted), /outside \$0.80–\$1.02/);
});

test("check fails when an hour of the answer is missing", () => {
  const corrupted = rows();
  corrupted["usdc-usd-feed"].pop();
  assert.throws(() => check(corrupted), new RegExp(`missing ${hours.at(-1)}`));
});

test("shape finds the bottom of the dip and the burning addresses", () => {
  const view = shape(rows());
  assert.match(view.lowest.price, /^\$0\.8[78]/);
  assert.ok(view.timeline.some((hour) => hour.netBurnMillions < 0));
  assert.ok(view.timeline.some((hour) => hour.netBurnMillions > 0));
  assert.equal(view.burners.length, 6);
  assert.ok(Number.parseFloat(view.burners[0].share) > 0);
});

test("check fails when supply is read at an hour's first block instead of its last", () => {
  const corrupted = rows();
  const supply = corrupted.supply.filter((row) => row.hour);
  const shifted = supply.map((row, i) => ({
    ...row,
    hour: supply[(i + 1) % supply.length].hour,
  }));
  corrupted.supply = shifted;
  assert.throws(() => check(corrupted), /mints minus burns/);
});
