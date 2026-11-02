import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);
const currentTick = BigInt(rows()["pool-state"][0].tick);

test("check proves in-range liquidity from the ticks up to the current tick", () => {
  assert.match(check(rows())[2], /equals the pool's in-range liquidity/);
});

test("check fails when an upper edge counts as added liquidity", () => {
  const corrupted = rows();
  const upper = corrupted.ticks.find((row) => row.tick === "887270");
  upper.liquidity_net = upper.liquidity_net.replace("-", "");
  assert.throws(() => check(corrupted), /not 0/);
});

test("check fails when a tick's latest row is dropped and its stale row is read", () => {
  const corrupted = rows();
  const tick = corrupted.ticks.find(
    (row) =>
      BigInt(row.tick) < currentTick &&
      corrupted.ticks.filter((other) => other.tick === row.tick).length > 1,
  ).tick;
  const latest = corrupted.ticks.findLast((row) => row.tick === tick);
  corrupted.ticks = corrupted.ticks.filter((row) => row !== latest);
  assert.throws(() => check(corrupted), /in-range liquidity/);
});

test("check fails when the pool's tick sits below the edge that holds its range", () => {
  const corrupted = rows();
  corrupted["pool-state"][0].tick = (currentTick - 10n).toString();
  assert.throws(() => check(corrupted), /in-range liquidity/);
});

test("check fails when a row belongs to another pool", () => {
  const corrupted = rows();
  corrupted.ticks[0].pool = `0x${"1".repeat(64)}`;
  assert.throws(() => check(corrupted), /is not 0x/);
});

test("shape marks the current price inside a 60-bucket histogram", () => {
  const view = shape(rows());
  assert.equal(view.bars.length, 60);
  assert.equal(view.currentTick, "-196310");
  assert.equal(view.price, "$2,984.06");
  assert.ok(view.marker > 0.4 && view.marker < 0.6);
  assert.ok(view.ticks.some((tick) => tick.side === "at price"));
});
