import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  shape,
  stablecoins,
  venues,
  zeroAddress,
} from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const [cl] = venues;

test("check proves every venue's days from its pool list", () => {
  const passed = check(rows());
  assert.equal(passed.length, 3);
  assert.match(passed[0], /on each day hooked plus hookless/);
  assert.match(passed[0], /zero hooks_registration/);
  assert.doesNotMatch(passed[2], /hooks_registration/);
});

test("check fails when a traded pool is missing from the pool list", () => {
  const corrupted = rows();
  corrupted[cl.poolsBind].shift();
  assert.throws(() => check(corrupted), /not in its pool list/);
});

test("check fails when a pool is listed twice", () => {
  const corrupted = rows();
  corrupted[cl.poolsBind].push({ ...corrupted[cl.poolsBind][0] });
  assert.throws(() => check(corrupted), /lists pool .* twice/);
});

test("check fails when a pool has two rows for one day", () => {
  const corrupted = rows();
  corrupted[cl.volumeBind].push({ ...corrupted[cl.volumeBind][0] });
  assert.throws(() => check(corrupted), /two rows for pool/);
});

test("check fails when a row falls outside the day window", () => {
  const corrupted = rows();
  corrupted[cl.volumeBind][0].day = "2026-11-02";
  assert.throws(() => check(corrupted), /outside the window/);
});

const stablePairRow = (corrupted, venue) => {
  const pools = new Map(corrupted[venue.poolsBind].map((p) => [p.pool, p]));
  return corrupted[venue.volumeBind].find((row) => {
    const pool = pools.get(row.pool);
    return stablecoins.has(pool.currency0) && stablecoins.has(pool.currency1);
  });
};

test("check fails when a stablecoin pair's legs are swapped by 6 decimals", () => {
  const corrupted = rows();
  const row = stablePairRow(corrupted, cl);
  row.volume1 = (BigInt(row.volume1) / 10n ** 12n).toString();
  assert.throws(() => check(corrupted), /stablecoin legs differ/);
});

test("check fails when a hookless pool has a non-zero registration", () => {
  const corrupted = rows();
  const pool = corrupted[cl.poolsBind].find(
    (p) => p.hooks !== zeroAddress && p.hooks_registration === "1",
  );
  pool.hooks = zeroAddress;
  assert.throws(() => check(corrupted), /contradict hooks_registration/);
});

test("check fails when a pool's hooks fall in neither class", () => {
  const corrupted = rows();
  corrupted[cl.poolsBind][0].hooks = `0X${"0".repeat(40)}`;
  assert.throws(() => check(corrupted), /neither hooked nor hookless/);
});

test("check passes a hooked pool whose registration is zero", () => {
  const data = rows();
  const pool = data[cl.poolsBind].find((p) => p.hooks !== zeroAddress);
  pool.hooks_registration = "0";
  assert.equal(check(data).length, 3);
});

test("shape reads the stablecoin leg and splits hooked from hookless", () => {
  const [hookedPool, plainPool, nonStablePool] = ["a", "b", "c"].map(
    (letter) => `0x${letter.repeat(64)}`,
  );
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const cake = "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82";
  const hooks = `0x${"1".repeat(40)}`;
  const e = (n) => (BigInt(n) * 10n ** 18n).toString();
  const list = (pool, currency0, currency1, hooksAddress) => ({
    block: 1,
    pool,
    currency0,
    currency1,
    hooks: hooksAddress,
  });
  const day = (pool, swaps, volume0, volume1) => ({
    day: "2026-10-25",
    pool,
    swaps,
    volume0,
    volume1,
  });
  const small = {
    ...Object.fromEntries(
      venues.flatMap((v) => [
        [v.volumeBind, []],
        [v.poolsBind, []],
      ]),
    ),
    "v4-pools": [
      list(hookedPool, zeroAddress, usdt, hooks),
      list(plainPool, usdt, cake, zeroAddress),
      list(nonStablePool, zeroAddress, cake, hooks),
    ],
    "v4-volume": [
      day(hookedPool, "10", "999", e(3000000)),
      day(plainPool, "5", e(1000000), "999"),
      day(nonStablePool, "7", "999", "999"),
    ],
  };
  const v4 = shape(small).venues[2];
  assert.equal(v4.hookedMillions, 3);
  assert.equal(v4.hooklessMillions, 1);
  assert.equal(v4.hookedShare, "75.0%");
});
