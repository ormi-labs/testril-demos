import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, subjects } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);
const [vitalik, nick] = subjects;

test("check passes on the fixture and names the invariants", () => {
  const passed = check(rows());
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
  assert.throws(() => check(corrupted), /not later than the previous/);
});

test("check fails when a cost is in ETH instead of wei", () => {
  const corrupted = rows();
  corrupted[nick.binds.registration][1].cost = "0.0059";
  assert.throws(() => check(corrupted), /non-negative integer of wei/);
});

test("check fails when a negative cost slips in", () => {
  const corrupted = rows();
  corrupted[nick.binds.registration][1].cost = "-1";
  assert.throws(() => check(corrupted), /non-negative integer of wei/);
});

test("check fails when owner changes are out of block order", () => {
  const corrupted = rows();
  corrupted[vitalik.binds.domain].reverse();
  assert.throws(() => check(corrupted), /is not after block/);
});

test("check fails when a month of the address record is missing", () => {
  const corrupted = rows();
  corrupted[nick.binds.address].splice(10, 1);
  assert.throws(() => check(corrupted), /missing 2020-12/);
});

test("shape orders the timeline and totals renewal costs in ETH", () => {
  const view = shape(rows());
  const blocks = view.timeline.map((event) => event.when);
  assert.match(blocks[0], /^block /);
  assert.equal(view.subjects[0].renewals, "5");
  assert.match(view.subjects[0].renewalCost, /^\d+\.\d{4} ETH$/);
  assert.ok(view.timeline.some((event) => event.kind === "NameWrapper"));
  assert.ok(
    view.subjects.every((s) =>
      s.marks.every((m) => m.position >= 0 && m.position < 1),
    ),
  );
});
