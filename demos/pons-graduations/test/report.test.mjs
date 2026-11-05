import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check proves graduates were launched and swept fees were graduated", () => {
  const passed = check(rows());
  assert.match(passed[0], /All 14 graduated tokens are among the 48 launched/);
  assert.match(passed[2], /ETH swept/);
});

test("check fails when a token graduated without being launched", () => {
  const corrupted = rows();
  corrupted.graduations[3].token = `0x${"ab".repeat(20)}`;
  assert.throws(() => check(corrupted), /graduated but was never launched/);
});

test("check fails when fees are swept from a pool that never graduated", () => {
  const corrupted = rows();
  corrupted["pool-fees"][0].token = corrupted.launches[40].token;
  assert.throws(() => check(corrupted), /fees swept but never graduated/);
});

test("check fails when a fee amount is in ether instead of raw units", () => {
  const corrupted = rows();
  const row = corrupted["pool-fees"][2];
  row.creator_amount = String(BigInt(row.creator_amount) / 10n ** 18n);
  assert.throws(
    () => check(corrupted),
    /fee rows give \d+ creator, its sweeps give \d+/,
  );
});

test("check fails when fee rows move an amount from creator to protocol", () => {
  const corrupted = rows();
  const row = corrupted["pool-fees"][2];
  const moved = BigInt(row.creator_amount) / 2n;
  row.creator_amount = String(BigInt(row.creator_amount) - moved);
  row.protocol_amount = String(BigInt(row.protocol_amount) + moved);
  assert.throws(() => check(corrupted), /fee rows give \d+ creator/);
});

test("check fails when a sweep is missing from the sweep list", () => {
  const corrupted = rows();
  corrupted["pool-fee-sweep"].splice(5, 1);
  assert.throws(() => check(corrupted), /fee rows give/);
});

test("check fails when a sweep is counted twice", () => {
  const corrupted = rows();
  corrupted["pool-fees"].push({ ...corrupted["pool-fees"][0] });
  assert.throws(() => check(corrupted), /two fee rows/);
});

test("shape builds the funnel and splits the swept fees 50/25/25", () => {
  const view = shape(rows(), fixtureBinds);
  assert.deepEqual(
    view.funnel.map((step) => step.count),
    [48, 14, 14],
  );
  assert.equal(view.graduationRate, "29%");
  assert.equal(view.creatorShare, "50%");
  assert.equal(view.buybackShare, "25%");
  assert.equal(view.protocolShare, "25%");
  assert.equal(view.daily.length, 91);
});
