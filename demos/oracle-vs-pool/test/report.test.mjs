import { test } from "node:test";
import assert from "node:assert/strict";
import { check, ethFeed, shape, windowHours } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check proves the pool stays within 2% of the feed every hour", () => {
  const passed = check(rows(), fixtureBinds);
  assert.equal(windowHours(fixtureBinds).length, 168);
  assert.match(passed[2], /within 2\.00% of the feed every hour/);
});

test("check fails when the price is read the wrong way round", () => {
  const corrupted = rows();
  for (const row of corrupted.pool)
    row.sqrt_price_x96 = (2n ** 192n / BigInt(row.sqrt_price_x96)).toString();
  assert.throws(() => check(corrupted, fixtureBinds), /beyond 2\.00%/);
});

test("check fails when currency decimals are left out", () => {
  const corrupted = rows();
  for (const row of corrupted.pool)
    row.sqrt_price_x96 = (BigInt(row.sqrt_price_x96) * 10n ** 6n).toString();
  assert.throws(() => check(corrupted, fixtureBinds), /beyond 2\.00%/);
});

test("check fails when one hour drifts 3% from the feed", () => {
  const corrupted = rows();
  const row = corrupted.pool[50];
  row.sqrt_price_x96 = (
    (BigInt(row.sqrt_price_x96) * 10149n) /
    10000n
  ).toString();
  assert.throws(
    () => check(corrupted, fixtureBinds),
    new RegExp(`At ${row.hour}`),
  );
});

test("check fails when a feed answer is not positive", () => {
  const corrupted = rows();
  corrupted.feeds.find((row) => row.feed !== ethFeed).answer = "-1";
  assert.throws(() => check(corrupted, fixtureBinds), /answered -1/);
});

test("check fails when an hour is missing", () => {
  const corrupted = rows();
  const [missing] = corrupted.pool.splice(10, 1);
  assert.throws(
    () => check(corrupted, fixtureBinds),
    new RegExp(`missing ${missing.hour}`),
  );
});

test("shape reports the widest gap and each feed's update cadence", () => {
  const view = shape(rows(), fixtureBinds);
  assert.equal(view.series.length, 168);
  assert.equal(view.widestGapHour, windowHours(fixtureBinds)[100]);
  assert.match(view.widestGap, /^1\.\d\d%$/);
  const usdc = view.feeds[2];
  assert.equal(usdc.name, "USDC / USD");
  assert.equal(usdc.updates, "6");
  assert.equal(usdc.longestFlat, "23 h");
});
