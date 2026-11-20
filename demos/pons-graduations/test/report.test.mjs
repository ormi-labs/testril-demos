import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check reconciles fee rows with sweeps on the fixture", () => {
  const passed = check({ rows: rows() });
  assert.equal(passed.length, 1);
  assert.match(passed[0], /ETH swept/);
});

test("a token launched before the window graduates, sweeps and trades in it without failing", () => {
  const earlier = rows();
  const token = `0x${"ab".repeat(20)}`;
  earlier.graduations[3].token = token;
  for (const row of earlier["pool-fees"].filter(
    (r) => r.token === earlier["pool-fees"][0].token,
  ))
    row.token = token;
  for (const row of earlier["pool-fee-sweep"].filter(
    (r) => r.token === rows()["pool-fees"][0].token,
  ))
    row.token = token;
  check({ rows: earlier });
  const view = shape({ rows: earlier }, fixtureBinds);
  assert.equal(view.funnel[1].count, 14);
  assert.equal(view.graduationRate, "27%");
});

test("check fails when a fee amount is in ether instead of raw units", () => {
  const corrupted = rows();
  const row = corrupted["pool-fees"][2];
  row.creator_amount = String(BigInt(row.creator_amount) / 10n ** 18n);
  assert.throws(
    () => check({ rows: corrupted }),
    /fee rows give \d+ creator, its sweeps give \d+/,
  );
});

test("check fails when fee rows move an amount from creator to protocol", () => {
  const corrupted = rows();
  const row = corrupted["pool-fees"][2];
  const moved = BigInt(row.creator_amount) / 2n;
  row.creator_amount = String(BigInt(row.creator_amount) - moved);
  row.protocol_amount = String(BigInt(row.protocol_amount) + moved);
  assert.throws(() => check({ rows: corrupted }), /fee rows give \d+ creator/);
});

test("check fails when a sweep is missing from the sweep list", () => {
  const corrupted = rows();
  corrupted["pool-fee-sweep"].splice(5, 1);
  assert.throws(() => check({ rows: corrupted }), /fee rows give/);
});

test("check fails when a sweep is counted twice", () => {
  const corrupted = rows();
  corrupted["pool-fees"].push({ ...corrupted["pool-fees"][0] });
  assert.throws(() => check({ rows: corrupted }), /two fee rows/);
});

test("shape builds the funnel and splits the swept fees 50/25/25", () => {
  const view = shape({ rows: rows() }, fixtureBinds);
  assert.deepEqual(
    view.funnel.map((step) => step.count),
    [48, 14, 9],
  );
  assert.equal(view.graduationRate, "29%");
  assert.equal(view.creatorShare, "50%");
  assert.equal(view.buybackShare, "25%");
  assert.equal(view.protocolShare, "25%");
  assert.equal(view.daily.length, 7);
});
