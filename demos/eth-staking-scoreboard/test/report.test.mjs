import { test } from "node:test";
import assert from "node:assert/strict";
import { check, lidoTotals, shape, windowDays } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("check passes on the fixture and lists what it proved", () => {
  assert.equal(check(rows()).length, 3);
});

test("check fails when a day is missing from one series", () => {
  const corrupted = rows();
  const gap = windowDays()[30];
  corrupted.stmatic = corrupted.stmatic.filter((row) => row.day !== gap);
  assert.throws(
    () => check(corrupted),
    new RegExp(`stmatic is missing ${gap}`),
  );
});

test("check fails when an amount is not an integer", () => {
  const corrupted = rows();
  corrupted.lido[5].vault_ether = "21000.5";
  assert.throws(() => check(corrupted), /not a raw integer amount/);
});

test("check fails when pooled ether is in whole ETH instead of wei", () => {
  const corrupted = rows();
  corrupted.lido[5].pooled_ether = "9050000";
  assert.throws(() => check(corrupted), /the amount is not in wei/);
});

test("check fails on a duplicated day instead of doubling it", () => {
  const corrupted = rows();
  corrupted.lido.push(structuredClone(corrupted.lido[90]));
  assert.throws(() => check(corrupted), /lido has more than one row for/);
});

test("check fails on a duplicated eigenlayer strategy", () => {
  const corrupted = rows();
  corrupted.eigenlayer.push(structuredClone(corrupted.eigenlayer[0]));
  assert.throws(() => check(corrupted), /more than one row for strategy/);
});

test("check fails on a row outside the window", () => {
  const corrupted = rows();
  corrupted.wbeth.push({ ...corrupted.wbeth[0], day: "2026-11-02" });
  assert.throws(() => check(corrupted), /outside the window/);
});

test("check fails when stVault ether exceeds pooled ether", () => {
  const corrupted = rows();
  const row = corrupted.lido[10];
  [row.pooled_ether, row.vault_ether] = [row.vault_ether, row.pooled_ether];
  assert.throws(() => check(corrupted), /not below Lido's pooled ether/);
});

test("check fails when the wBETH exchange rate falls", () => {
  const corrupted = rows();
  corrupted.wbeth[20].exchange_rate = corrupted.wbeth[10].exchange_rate;
  assert.throws(() => check(corrupted), /exchange rate fell on/);
});

test("Lido total is pooled plus stVault ether to the wei", () => {
  const data = rows();
  const latest = data.lido.at(-1);
  const pooled = BigInt(latest.pooled_ether);
  const vault = BigInt(latest.vault_ether);
  assert.equal(lidoTotals(data).get(latest.day), pooled + vault);
  const millions = (wei) =>
    `${(Number(wei / 10n ** 18n) / 1e6).toFixed(2)}M ETH`;
  const rendered = [pooled + vault, pooled, pooled - vault].map(millions);
  assert.equal(new Set(rendered).size, 3);
  assert.equal(shape(data).lidoTotal, rendered[0]);
});

test("shape shows stMATIC shrinking and keeps EigenLayer out of the ETH venues", () => {
  const view = shape(rows());
  assert.equal(view.venues[1].symbol, "stVaults");
  assert.deepEqual(
    view.venues.map((venue) => venue.symbol),
    ["stETH", "stVaults", "wBETH"],
  );
  assert.match(view.stmatic.change, /^−.*MATIC \(−/);
  assert.ok(view.eigenlayer.series[0].amount > 0);
});
