import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  formatEth,
  gracePeriodSeconds,
  shape,
  subjectsOf,
} from "../src/report.mjs";
import { fixture, fixtureBinds, fixtureFetched } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const [vitalik, nick] = subjectsOf(fixtureBinds);

test("check passes on the fixture and names the invariants", () => {
  const passed = check(fixtureFetched(rows()), fixtureBinds);
  assert.equal(passed.length, 6);
  assert.match(passed[1], /5 renewals, each expiring no earlier/);
});

test("check fails when a renewal expires before the previous one", () => {
  const corrupted = rows();
  const renewals = corrupted[vitalik.binds.registration];
  [renewals[2].expires, renewals[3].expires] = [
    renewals[3].expires,
    renewals[2].expires,
  ];
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /earlier than the previous/,
  );
});

test("check accepts a renewal that adds no time, as vitalik.eth's at block 15305008", () => {
  const withZeroRenewal = rows();
  const registration = withZeroRenewal[vitalik.binds.registration];
  const [, previous] = registration;
  registration.splice(2, 0, {
    ...previous,
    block: previous.block + 1,
    cost: "0",
  });
  assert.match(
    check(fixtureFetched(withZeroRenewal), fixtureBinds)[1],
    /6 renewals/,
  );
});

test("check fails when a cost is in ETH instead of wei", () => {
  const corrupted = rows();
  corrupted[nick.binds.registration][1].cost = "0.0059";
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /non-negative integer of wei/,
  );
});

test("check fails when a cost is in gwei or 1000x too large", () => {
  for (const cost of ["5900000", "5900000000000000000000"]) {
    const corrupted = rows();
    corrupted[nick.binds.registration][1].cost = cost;
    assert.throws(
      () => check(fixtureFetched(corrupted), fixtureBinds),
      /per year, outside/,
    );
  }
});

test("check prices a renewal shorter than a year by its seconds, as vitalik.eth's 4-day one at block 25497658", () => {
  const withShortRenewal = rows();
  const registration = withShortRenewal[vitalik.binds.registration];
  const last = registration.at(-1);
  registration.push({
    ...last,
    block: last.block + 1,
    cost: "31756445700156",
    expires: String(BigInt(last.expires) + 350212n),
  });
  assert.equal(check(fixtureFetched(withShortRenewal), fixtureBinds).length, 6);
});

test("check accepts a free renewal and a four-letter name priced at 1.2 ETH a year", () => {
  const data = rows();
  const registration = data[nick.binds.registration];
  registration[1].cost = "0";
  const years =
    (BigInt(registration[2].expires) - BigInt(registration[1].expires)) /
    (365n * 86400n);
  registration[2].cost = String(years * 1_200_000_000_000_000_000n);
  assert.equal(check(fixtureFetched(data), fixtureBinds).length, 6);
});

test("check fails when a wrapped expiry lacks the 90-day grace period", () => {
  const corrupted = rows();
  const [first] = corrupted[vitalik.binds.wrapped];
  first.expiry = String(BigInt(first.expiry) - BigInt(gracePeriodSeconds));
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /plus the 90-day grace period/,
  );
});

test("check fails when registrar expiry is in milliseconds", () => {
  const corrupted = rows();
  for (const row of corrupted[nick.binds.registration])
    row.expires = String(BigInt(row.expires) * 1000n);
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /plus the 90-day grace period/,
  );
});

test("check fails when owner changes are out of block order", () => {
  const corrupted = rows();
  corrupted[vitalik.binds.domain].reverse();
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /is not after block/,
  );
});

test("check fails when a row sits outside the window", () => {
  const corrupted = rows();
  corrupted[vitalik.binds.domain][0].block = 1;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /has a row at block 1, outside \[/,
  );
});

test("check fails when a wrapped row sits past the last read", () => {
  const input = fixtureFetched(rows());
  const reads = input.reads[nick.binds.wrapped];
  input.rows[nick.binds.wrapped][0].block = reads.at(-1).to_block;
  assert.throws(() => check(input, fixtureBinds), /outside \[/);
});

test("an event is dated inside its read, not by a block clock", () => {
  const input = fixtureFetched(rows());
  const reads = input.reads[vitalik.binds.domain];
  const before = shape(input, fixtureBinds).subjects[0].marks;
  for (const read of reads) {
    read.from_time = new Date(Date.parse(read.from_time) + 86400000)
      .toISOString()
      .replace(".000Z", "Z");
    read.to_time = new Date(Date.parse(read.to_time) + 86400000)
      .toISOString()
      .replace(".000Z", "Z");
  }
  const after = shape(input, fixtureBinds).subjects[0].marks;
  assert.notDeepEqual(
    after.map((m) => m.position),
    before.map((m) => m.position),
  );
});

test("check fails when a month of the address record is missing", () => {
  const corrupted = rows();
  corrupted[nick.binds.address].splice(11, 1);
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /missing 2020-12/,
  );
});

test("check fails when a month of the address record is duplicated", () => {
  const corrupted = rows();
  corrupted[nick.binds.address][5] = { ...corrupted[nick.binds.address][4] };
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /extra or duplicate rows for 2020-05/,
  );
});

test("shape lists events in block order and counts only real changes", () => {
  const data = rows();
  const view = shape(fixtureFetched(data), fixtureBinds);
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
