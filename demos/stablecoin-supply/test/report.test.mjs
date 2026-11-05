import { test } from "node:test";
import assert from "node:assert/strict";
import { check, edgesDay, labels, shape, zeroAddress } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const fetched = (value = rows()) => ({ rows: value });
const day = edgesDay(fixtureBinds);

test("check proves the fixture day's supply change from mints and burns", () => {
  assert.match(
    check(fetched(), fixtureBinds)[1],
    /equals mints .* minus burns/,
  );
});

test("check fails when a burn is read as a mint", () => {
  const corrupted = rows();
  const burn = corrupted["usdc-edges"].find((e) => e.to === zeroAddress);
  [burn.from, burn.to] = [zeroAddress, burn.from];
  assert.throws(
    () => check(fetched(corrupted), fixtureBinds),
    /mints minus burns/,
  );
});

test("check fails when supply is in whole dollars instead of raw units", () => {
  const corrupted = rows();
  for (const row of corrupted.supply)
    row.total_supply = (BigInt(row.total_supply) / 1000000n).toString();
  assert.throws(
    () => check(fetched(corrupted), fixtureBinds),
    /USDC supply changed by/,
  );
});

test("check fails when a supply day is missing", () => {
  const corrupted = rows();
  corrupted.supply = corrupted.supply.filter((row) => row.day !== day);
  assert.throws(
    () => check(fetched(corrupted), fixtureBinds),
    new RegExp(`missing ${day}`),
  );
});

test("shape nets mints against burns and names addresses from ENS", () => {
  const view = shape(fetched(), fixtureBinds);
  assert.equal(view.minted, "$315.00M");
  assert.equal(view.burned, "$370.00M");
  assert.equal(view.net, "−$55.00M");
  assert.equal(view.pairs[0].toLabel, "Zero address");
  assert.ok(
    view.pairs.some((p) => [p.fromLabel, p.toLabel].includes("vitalik.eth")),
  );
});

test("an address takes the name of its last row, and no name when the last row is empty", () => {
  const changed = rows();
  const [renamed, cleared] = ["ens-binance-14", "ens-binance-8"];
  const addressOf = (name) => changed[name][0].address;
  const rowsOf = (name, names) =>
    names.map((value, index) => ({
      block: index,
      address: addressOf(name),
      name: value,
    }));
  changed[renamed] = rowsOf(renamed, ["old.eth", "new.eth"]);
  changed[cleared] = rowsOf(cleared, ["gone.eth", ""]);
  const label = labels(changed, fixtureBinds);
  assert.equal(label(addressOf(renamed)), "new.eth");
  assert.match(label(addressOf(cleared)), /^0x[0-9a-f]{4}…[0-9a-f]{4}$/);
});
