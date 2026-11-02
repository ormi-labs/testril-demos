import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, windowDays } from "../src/report.mjs";
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

test("check fails when an amount is in ether instead of raw wei", () => {
  const corrupted = rows();
  corrupted.lido[5].vault_ether = "21000.5";
  assert.throws(() => check(corrupted), /not a raw integer amount/);
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

test("shape sums stETH and stVaults into Lido and shows stMATIC shrinking", () => {
  const view = shape(rows());
  assert.match(view.lidoTotal, /^9\.\d\dM ETH$/);
  assert.equal(view.venues[1].symbol, "stVaults");
  assert.match(view.stmatic.change, /^−.*MATIC \(−/);
  const eigenFirst = view.venues[3].series[0].amount;
  assert.ok(eigenFirst > 0);
});
