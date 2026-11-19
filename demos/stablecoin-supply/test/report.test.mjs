import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, transferDay } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const fetched = (value = rows()) => ({ rows: value });
const day = transferDay(fixtureBinds);

test("check proves the fixture day's supply change from mints and burns", () => {
  assert.match(
    check(fetched(), fixtureBinds)[1],
    /equals mints .* minus burns/,
  );
});

test("check fails when a burn is read as a mint", () => {
  const corrupted = rows();
  const burner = corrupted["usdc-mints-burns"].find((r) => r.received !== "0");
  [burner.sent, burner.received] = [burner.received, burner.sent];
  assert.throws(
    () => check(fetched(corrupted), fixtureBinds),
    /mints minus burns/,
  );
});

test("check fails when two named addresses disagree on the USDC between them", () => {
  const corrupted = rows();
  const coinbase10 = "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43";
  const row = corrupted["usdc-circle"].find(
    (r) => r.counterparty === coinbase10,
  );
  row.sent = (BigInt(row.sent) + 1n).toString();
  assert.throws(
    () => check(fetched(corrupted), fixtureBinds),
    /reports sending .* but 0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43 reports/,
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

test("shape nets mints against burns and labels named addresses from the demo's list", () => {
  const view = shape(fetched(), fixtureBinds);
  assert.equal(view.minted, "$315.00M");
  assert.equal(view.burned, "$370.00M");
  assert.equal(view.net, "−$55.00M");
  assert.equal(view.pairs[0].toLabel, "Zero address");
  assert.equal(Math.round(view.pairs[0].millions), 370);
  assert.ok(
    view.pairs.some((p) =>
      [p.fromLabel, p.toLabel].includes("Circle (USDC issuer)"),
    ),
  );
});
