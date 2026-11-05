import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, zeroAddress } from "../src/report.mjs";
import {
  fixture,
  fixtureBinds,
  fixtureFetched,
  transfersIn,
} from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check passes on the fixture and states all three invariants", () => {
  const passed = check(fixtureFetched(rows()), fixtureBinds);
  assert.equal(passed.length, 3);
  assert.match(passed[0], /All 12 mints/);
});

test("check fails when a mint comes from a holder, not the zero address", () => {
  const corrupted = rows();
  transfersIn(corrupted).find((t) => t.from === zeroAddress).from =
    corrupted.owners[0].owner;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /not the zero address|already had/,
  );
});

test("check fails when a token with an earlier owner is called a mint", () => {
  const corrupted = rows();
  const trade = transfersIn(corrupted).find(
    (t) => t.from !== zeroAddress && t.to !== zeroAddress,
  );
  trade.from = zeroAddress;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /already had an owner/,
  );
});

test("check fails when a block's owner row is missing or duplicated", () => {
  const missing = rows();
  missing.owners.pop();
  assert.throws(
    () => check(fixtureFetched(missing), fixtureBinds),
    /has 0 owner rows/,
  );
  const duplicated = rows();
  duplicated.owners.push({ ...duplicated.owners.at(-1) });
  assert.throws(
    () => check(fixtureFetched(duplicated), fixtureBinds),
    /has 2 owner rows/,
  );
});

test("check fails when the owner row names the first receiver of a double hop", () => {
  const corrupted = rows();
  const [first, second] = transfersIn(corrupted).filter((t, i, all) =>
    all.some(
      (o, j) => j !== i && o.token_id === t.token_id && o.block === t.block,
    ),
  );
  corrupted.owners.find(
    (o) => o.token_id === second.token_id && o.block === second.block,
  ).owner = first.to;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /last transfer went to/,
  );
});

test("check fails when a trade's sender was not the token's owner", () => {
  const corrupted = rows();
  const trade = transfersIn(corrupted).find(
    (t, i, all) =>
      t.from !== zeroAddress &&
      t.to !== zeroAddress &&
      all.every((o, j) => j === i || o.token_id !== t.token_id),
  );
  [trade.from, trade.to] = [trade.to, trade.from];
  corrupted.owners.find(
    (o) => o.token_id === trade.token_id && o.block === trade.block,
  ).owner = trade.to;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /but its owner was/,
  );
});

test("check fails when a token's only transfer of the day is dropped", () => {
  const corrupted = rows();
  const once = corrupted.transfers.find(
    (t, i, all) =>
      t.from !== zeroAddress &&
      t.to !== zeroAddress &&
      all.every((o, j) => j === i || o.token_id !== t.token_id),
  );
  corrupted.transfers = corrupted.transfers.filter((t) => t !== once);
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /Replaying the day's transfers/,
  );
});

test("check fails when a transfer sits outside the day's reads", () => {
  const corrupted = rows();
  corrupted.transfers[0].block = 1;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /outside the day/,
  );
});

test("check accepts a mint of a token burned before the day", () => {
  const remint = rows();
  const mint = transfersIn(remint).find((t) => t.from === zeroAddress);
  remint.owners.push({
    block: 1,
    token_id: mint.token_id,
    owner: zeroAddress,
  });
  assert.ok(check(fixtureFetched(remint), fixtureBinds));
});

test("shape splits the day into mints, trades and a burn", () => {
  const view = shape(fixtureFetched(rows()), fixtureBinds);
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
