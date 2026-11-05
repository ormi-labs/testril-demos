import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, usdc, usdt } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check proves every total against its owners on the fixture", () => {
  const passed = check(rows(), fixtureBinds);
  assert.equal(passed.length, 3);
  assert.match(
    passed[1],
    /Binance, Coinbase, Kraken: the total equals the sum/,
  );
});

test("check fails when a total is only the first owner", () => {
  const corrupted = rows();
  corrupted["binance-total"] = corrupted["binance-owner-1"];
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /Binance USDT total at .* owners hold/,
  );
});

test("check fails when the two tokens are swapped in a total", () => {
  const corrupted = rows();
  for (const row of corrupted["coinbase-total"])
    row.token = row.token === usdt ? usdc : usdt;
  assert.throws(() => check(corrupted, fixtureBinds), /Coinbase USDT total/);
});

test("check fails when an hour is missing", () => {
  const corrupted = rows();
  corrupted["okx-total"] = corrupted["okx-total"].filter(
    (row) => row.hour !== "2026-10-28T09",
  );
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /okx-total is missing .* at 2026-10-28T09/,
  );
});

test("check fails when a bind returns an unknown token", () => {
  const corrupted = rows();
  corrupted["okx-total"][0].token =
    "0x0000000000000000000000000000000000000001";
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /okx-total has an unexpected token/,
  );
});

test("check fails when a bind returns two rows for one hour", () => {
  const corrupted = rows();
  corrupted["okx-total"].push({ ...corrupted["okx-total"][0] });
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /okx-total has two rows for .* at /,
  );
});

test("check fails when a gap is filled with zero", () => {
  const corrupted = rows();
  corrupted["kraken-native"][5].balance = "0";
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /kraken-native has a zero or negative balance/,
  );
});

test("check fails when an hour falls outside the window", () => {
  const corrupted = rows();
  corrupted["gemini-total"].push({
    hour: "2026-11-01T00",
    token: usdt,
    balance: "1",
  });
  assert.throws(() => check(corrupted, fixtureBinds), /outside the window/);
});

test("shape ranks the biggest hours by size and direction", () => {
  const view = shape(rows(), fixtureBinds);
  assert.deepEqual(
    view.biggestHours
      .slice(0, 2)
      .map((h) => [h.exchange, h.hour, h.direction, h.change]),
    [
      ["Binance", "2026-10-29T04", "In", "+$300.00M"],
      ["Coinbase", "2026-10-27T12", "Out", "−$250.00M"],
    ],
  );
  assert.equal(view.biggestIn.amount, "+$300.00M");
  assert.equal(view.biggestOut.amount, "−$250.00M");
  assert.equal(view.exchanges.length, 6);
  assert.equal(view.exchanges[0].millions.length, 168);
});
