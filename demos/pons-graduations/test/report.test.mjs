import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

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

test("check fails when a fee split is in ether instead of raw units", () => {
  const corrupted = rows();
  corrupted["pool-fees"][2].creator_amount = "0.0125";
  assert.throws(() => check(corrupted), /not a raw integer amount/);
});

test("check fails when a sweep is counted twice", () => {
  const corrupted = rows();
  corrupted["pool-fees"].push({ ...corrupted["pool-fees"][0] });
  assert.throws(() => check(corrupted), /two fee rows/);
});

test("shape builds the funnel and splits the swept fees 50/25/25", () => {
  const view = shape(rows());
  assert.deepEqual(
    view.funnel.map((step) => step.count),
    [48, 14, 14],
  );
  assert.equal(view.graduationRate, "29%");
  assert.equal(view.creatorShare, "50%");
  assert.equal(view.buybackShare, "25%");
  assert.equal(view.protocolShare, "25%");
  assert.equal(view.daily.length, 31);
});
