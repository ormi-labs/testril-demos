import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  formatEth,
  gracePeriodSeconds,
  shape,
  subjectsOf,
} from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const [vitalik, nick] = subjectsOf(fixtureBinds);

test("check passes on the fixture and names the invariants", () => {
  const passed = check(rows(), fixtureBinds);
  assert.equal(passed.length, 6);
  assert.match(passed[1], /5 renewals, each expiring later/);
});

test("check fails when a renewal expires before the previous one", () => {
  const corrupted = rows();
  const renewals = corrupted[vitalik.binds.registration];
  [renewals[2].expires, renewals[3].expires] = [
    renewals[3].expires,
    renewals[2].expires,
  ];
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /not later than the previous/,
  );
});

test("check fails when a cost is in ETH instead of wei", () => {
  const corrupted = rows();
  corrupted[nick.binds.registration][1].cost = "0.0059";
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /non-negative integer of wei/,
  );
});

test("check fails when a cost is in gwei or 1000x too large", () => {
  for (const cost of ["5900000", "5900000000000000000000"]) {
    const corrupted = rows();
    corrupted[nick.binds.registration][1].cost = cost;
    assert.throws(() => check(corrupted, fixtureBinds), /per year, outside/);
  }
});

test("check accepts a free renewal and a four-letter name priced at 1.2 ETH a year", () => {
  const data = rows();
  const registration = data[nick.binds.registration];
  registration[1].cost = "0";
  const years =
    (BigInt(registration[2].expires) - BigInt(registration[1].expires)) /
    (365n * 86400n);
  registration[2].cost = String(years * 1_200_000_000_000_000_000n);
  assert.equal(check(data, fixtureBinds).length, 6);
});

test("check fails when a wrapped expiry lacks the 90-day grace period", () => {
  const corrupted = rows();
  const [first] = corrupted[vitalik.binds.wrapped];
  first.expiry = String(BigInt(first.expiry) - BigInt(gracePeriodSeconds));
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /plus the 90-day grace period/,
  );
});

test("check fails when registrar expiry is in milliseconds", () => {
  const corrupted = rows();
  for (const row of corrupted[nick.binds.registration])
    row.expires = String(BigInt(row.expires) * 1000n);
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /plus the 90-day grace period/,
  );
});

test("check fails when owner changes are out of block order", () => {
  const corrupted = rows();
  corrupted[vitalik.binds.domain].reverse();
  assert.throws(() => check(corrupted, fixtureBinds), /is not after block/);
});

test("check fails when a month of the address record is missing", () => {
  const corrupted = rows();
  corrupted[nick.binds.address].splice(11, 1);
  assert.throws(() => check(corrupted, fixtureBinds), /missing 2020-12/);
});

test("check fails when a month of the address record is duplicated", () => {
  const corrupted = rows();
  corrupted[nick.binds.address][5] = { ...corrupted[nick.binds.address][4] };
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /extra or duplicate rows for 2020-05/,
  );
});

test("shape lists events in block order and counts only real changes", () => {
  const data = rows();
  const view = shape(data, fixtureBinds);
  const blocks = view.timeline.map((event) => Number(event.when.slice(6)));
  const numbered = blocks.filter((block) => !Number.isNaN(block));
  assert.ok(numbered.length > 0);
  assert.deepEqual(
    numbered,
    [...numbered].sort((a, b) => a - b),
  );
  const [first] = view.subjects;
  const renewals = data[vitalik.binds.registration].slice(1);
  assert.equal(first.renewals, String(renewals.length));
  assert.equal(
    first.renewalCost,
    formatEth(renewals.reduce((sum, row) => sum + BigInt(row.cost), 0n)),
  );
  assert.equal(first.ownerChanges, "2");
  assert.ok(
    view.timeline.some((event) =>
      event.text.includes("Owner changed to NameWrapper"),
    ),
  );
  assert.ok(first.marks.every((m) => m.position >= 0 && m.position < 1));
  assert.equal(
    Math.max(
      ...view.subjects.flatMap((s) => s.marks.map((m) => m.costBasisPoints)),
    ),
    10000,
  );
});
