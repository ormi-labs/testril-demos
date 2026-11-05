import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check passes on the fixture", () => {
  assert.equal(check({ rows: rows() }, fixtureBinds).length, 3);
});

test("check fails when a volume row's market was never registered", () => {
  const corrupted = rows();
  corrupted.volume[0].market = "0x" + "ab".repeat(20);
  assert.throws(
    () => check({ rows: corrupted }, fixtureBinds),
    /no market_list row/,
  );
});

test("check fails when a rebate is negative", () => {
  const corrupted = rows();
  corrupted.volume[3].quote_rebate = "-1";
  assert.throws(
    () => check({ rows: corrupted }, fixtureBinds),
    /quote_rebate is negative/,
  );
});

test("check fails when a fee and a rebate are swapped", () => {
  const corrupted = rows();
  const row = corrupted.volume.find((r) => r.quote_fee !== r.quote_rebate);
  [row.quote_fee, row.quote_rebate] = [row.quote_rebate, row.quote_fee];
  assert.throws(
    () => check({ rows: corrupted }, fixtureBinds),
    /quote_rebate exceeds quote_fee/,
  );
});

test("check fails when a fee is read in 6-decimal USDC instead of 18", () => {
  const corrupted = rows();
  corrupted.volume[0].quote_fee = (
    BigInt(corrupted.volume[0].quote_fee) *
    10n ** 12n
  ).toString();
  assert.throws(
    () => check({ rows: corrupted }, fixtureBinds),
    /quote_fee exceeds .* bps/,
  );
});

test("check matches market addresses regardless of case", () => {
  const mixed = rows();
  mixed.markets[0].market = mixed.markets[0].market
    .toUpperCase()
    .replace("0X", "0x");
  assert.equal(check({ rows: mixed }, fixtureBinds).length, 3);
  assert.equal(shape({ rows: mixed }, fixtureBinds).active, 6);
});

test("shape survives a recording with no USDC-quoted volume", () => {
  const view = shape(
    { rows: { markets: rows().markets, volume: [] } },
    fixtureBinds,
  );
  assert.equal(view.topMarket, "none");
  assert.equal(view.topShare, "0.0%");
});

test("check fails when a market has two rows for one day", () => {
  const corrupted = rows();
  corrupted.volume.push({ ...corrupted.volume[0] });
  assert.throws(() => check({ rows: corrupted }, fixtureBinds), /two rows/);
});

test("check fails when a row falls outside the window", () => {
  const corrupted = rows();
  corrupted.volume[0].day = "2026-11-02";
  assert.throws(
    () => check({ rows: corrupted }, fixtureBinds),
    /outside the window/,
  );
});

test("shape ranks USDC-quoted markets by volume and splits fees by asset", () => {
  const view = shape({ rows: rows() }, fixtureBinds);
  assert.equal(view.registered, 7);
  assert.equal(view.active, 6);
  assert.equal(view.markets[0].pair, "MON/USDC");
  assert.match(view.markets[0].fees, /MON \+ .* USDC$/);
  assert.equal(view.markets.at(-1).fees, "none");
  const usdcPairs = view.markets.filter((m) => m.usdcQuoted).map((m) => m.pair);
  assert.deepEqual(
    view.bars.map((b) => b.pair),
    usdcPairs.slice(0, 8),
  );
});

test("shape sums volume of a market over all its days", () => {
  const data = rows();
  const [market] = data.markets;
  const total = data.volume
    .filter((row) => row.market === market.market)
    .reduce((sum, row) => sum + BigInt(row.trades), 0n);
  assert.equal(
    shape({ rows: data }, fixtureBinds).markets.find(
      (m) => m.market === market.market,
    ).trades,
    total.toLocaleString("en-US"),
  );
});
