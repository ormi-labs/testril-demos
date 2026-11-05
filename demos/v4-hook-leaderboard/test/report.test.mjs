import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  formatCompact,
  hookTotals,
  shape,
  usdc,
  zeroAddress,
} from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check passes and names the hook sum and the unhooked pools", () => {
  const passed = check(rows(), fixtureBinds);
  assert.match(passed[1], /Hooks add up to \d+ swaps/);
  assert.match(
    passed[2],
    /pools with volume at the zero address are shown as No hook/,
  );
});

test("check fails when a volume pool is not in pool_list", () => {
  const corrupted = rows();
  corrupted.volume[0].pool = `0x${"ab".repeat(32)}`;
  assert.throws(() => check(corrupted, fixtureBinds), /is not in pool_list/);
});

test("check fails when a pool is listed twice and its swaps count twice", () => {
  const corrupted = rows();
  corrupted.pools.push(structuredClone(corrupted.pools[0]));
  assert.throws(() => check(corrupted, fixtureBinds), /Hooks add up to/);
});

test("check fails when a volume day is outside the window", () => {
  const corrupted = rows();
  corrupted.volume[0].day = "2026-11-02";
  assert.throws(() => check(corrupted, fixtureBinds), /outside the window/);
});

test("hook swaps are the sum of their pools' volume rows", () => {
  const data = rows();
  const [top] = hookTotals(data);
  const pools = new Set(
    data.pools.filter((p) => p.hooks === top.hook).map((p) => p.pool),
  );
  const swaps = data.volume
    .filter((row) => pools.has(row.pool))
    .reduce((total, row) => total + BigInt(row.swaps), 0n);
  assert.equal(top.swaps, swaps);
});

test("shape labels Arrakis hooks, other hooks and the zero address", () => {
  const view = shape(rows(), fixtureBinds);
  const labels = new Set(view.hooks.map((hook) => hook.label));
  assert.deepEqual([...labels].sort(), ["Arrakis", "No hook", "Unlabelled"]);
  const none = view.hooks.find((hook) => hook.hook === zeroAddress);
  assert.equal(none.label, "No hook");
  assert.equal(none.address, "—");
});

test("stablecoin volume reads the stablecoin side of each pool", () => {
  const data = rows();
  const pool = data.pools.find((p) => p.currency0 === zeroAddress);
  const row = data.volume.find((v) => v.pool === pool.pool);
  assert.notEqual(row.volume0, row.volume1);
  const totals = hookTotals({ ...data, pools: [pool], volume: [row] });
  assert.equal(totals[0].volume, BigInt(row.volume1));
});

test("stablecoin volume reads volume0 when the stablecoin is currency0", () => {
  const data = rows();
  const pool = {
    ...data.pools[0],
    currency0: usdc,
    currency1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  };
  const row = {
    ...data.volume[0],
    pool: pool.pool,
    volume0: "7000000",
    volume1: "3",
  };
  const totals = hookTotals({ ...data, pools: [pool], volume: [row] });
  assert.equal(totals[0].volume, 7_000_000n);
});

test("check fails when the Arrakis hook list contains the zero address", () => {
  const corrupted = rows();
  corrupted["arrakis-hooks"][0].hook = zeroAddress;
  assert.throws(() => check(corrupted, fixtureBinds), /zero address/);
});

test("checksummed addresses give the same report as lowercase ones", () => {
  const shouted = rows();
  for (const pool of shouted.pools) {
    pool.currency0 = pool.currency0.toUpperCase().replace("0X", "0x");
    pool.currency1 = pool.currency1.toUpperCase().replace("0X", "0x");
    pool.hooks = pool.hooks.toUpperCase().replace("0X", "0x");
  }
  for (const row of shouted["arrakis-hooks"])
    row.hook = row.hook.toUpperCase().replace("0X", "0x");
  assert.deepEqual(shape(shouted, fixtureBinds), shape(rows(), fixtureBinds));
});

test("compact amounts under a thousand dollars are not shown as thousandths", () => {
  assert.equal(formatCompact(250_000_000n), "$250");
  assert.equal(formatCompact(1_500_000_000n), "$1.50K");
});
