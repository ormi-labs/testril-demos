import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, zeroAddress } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("check passes on the fixture and states all three invariants", () => {
  const passed = check(rows());
  assert.equal(passed.length, 3);
  assert.match(passed[0], /All 12 mints/);
});

test("check fails when a mint comes from a holder, not the zero address", () => {
  const corrupted = rows();
  corrupted.transfers.find((t) => t.from === zeroAddress).from =
    corrupted.owners[0].owner;
  assert.throws(() => check(corrupted), /not the zero address|already had/);
});

test("check fails when a token with an earlier owner is called a mint", () => {
  const corrupted = rows();
  const trade = corrupted.transfers.find(
    (t) => t.from !== zeroAddress && t.to !== zeroAddress,
  );
  trade.from = zeroAddress;
  assert.throws(() => check(corrupted), /already had an owner/);
});

test("check fails when a block's owner row is missing or duplicated", () => {
  const missing = rows();
  missing.owners.pop();
  assert.throws(() => check(missing), /has 0 owner rows/);
  const duplicated = rows();
  duplicated.owners.push({ ...duplicated.owners.at(-1) });
  assert.throws(() => check(duplicated), /has 2 owner rows/);
});

test("check fails when the owner row names the first receiver of a double hop", () => {
  const corrupted = rows();
  const [first, second] = corrupted.transfers.filter((t, i, all) =>
    all.some(
      (o, j) => j !== i && o.token_id === t.token_id && o.block === t.block,
    ),
  );
  corrupted.owners.find(
    (o) => o.token_id === second.token_id && o.block === second.block,
  ).owner = first.to;
  assert.throws(() => check(corrupted), /last transfer went to/);
});

test("shape splits the day into mints, trades and a burn", () => {
  const view = shape(rows());
  assert.equal(view.mints, 12);
  assert.equal(view.burns, 1);
  assert.equal(view.trades, 91);
  assert.equal(view.hours.length, 24);
  assert.equal(
    view.hours.reduce((sum, h) => sum + h.mints + h.trades, 0),
    103,
  );
  assert.equal(view.name, "Pudgy Penguins");
  assert.equal(view.concentration.top.length, 10);
});
