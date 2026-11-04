import { test } from "node:test";
import assert from "node:assert/strict";
import { check, edgesDay, shape, zeroAddress } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check proves the fixture day's supply change from mints and burns", () => {
  assert.match(check(rows())[1], /equals mints .* minus burns/);
});

test("check fails when a burn is read as a mint", () => {
  const corrupted = rows();
  const burn = corrupted["usdc-edges"].find((e) => e.to === zeroAddress);
  [burn.from, burn.to] = [zeroAddress, burn.from];
  assert.throws(() => check(corrupted), /mints minus burns/);
});

test("check fails when supply is in whole dollars instead of raw units", () => {
  const corrupted = rows();
  for (const row of corrupted.supply)
    row.total_supply = (BigInt(row.total_supply) / 1000000n).toString();
  assert.throws(() => check(corrupted), /USDC supply changed by/);
});

test("check fails when a supply day is missing", () => {
  const corrupted = rows();
  corrupted.supply = corrupted.supply.filter((row) => row.day !== edgesDay);
  assert.throws(() => check(corrupted), new RegExp(`missing ${edgesDay}`));
});

test("shape nets mints against burns and names addresses from ENS", () => {
  const view = shape(rows());
  assert.equal(view.minted, "$315.00M");
  assert.equal(view.burned, "$370.00M");
  assert.equal(view.net, "−$55.00M");
  assert.equal(view.pairs[0].toLabel, "Zero address");
  assert.ok(
    view.pairs.some((p) => [p.fromLabel, p.toLabel].includes("vitalik.eth")),
  );
});
