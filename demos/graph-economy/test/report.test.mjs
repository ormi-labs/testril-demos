import { test } from "node:test";
import assert from "node:assert/strict";
import { check, formatGrt, shape } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const collected = (list) => list.find((r) => r.kind === "rewards_collected");

test("check passes on the fixture with three proven sentences", () => {
  assert.equal(check(rows()).length, 3);
});

test("check fails when the indexer share is in whole GRT instead of wei", () => {
  const corrupted = rows();
  const row = collected(corrupted["indexing-rewards"]);
  row.indexer_rewards = (BigInt(row.indexer_rewards) / 10n ** 18n).toString();
  assert.throws(() => check(corrupted), /indexer .* \+ delegator/);
});

test("check proves per-indexer rewards add up on the fixture", () => {
  assert.match(check(rows())[1], /Per-indexer rewards add up/);
});

test("check fails when a reward log is counted twice", () => {
  const corrupted = rows();
  corrupted["indexing-rewards"].push({ ...corrupted["indexing-rewards"][0] });
  assert.throws(() => check(corrupted), /twice/);
});

test("check fails when a delegator holds more shares than the pool", () => {
  const corrupted = rows();
  corrupted.delegation[0].delegator_shares = (
    BigInt(corrupted.delegation[0].pool_shares) + 1n
  ).toString();
  assert.throws(() => check(corrupted), /shares of a pool/);
});

test("shape credits a reward to the indexer its row names", () => {
  const data = rows();
  const [top] = shape(data, fixtureBinds).indexers;
  const row = data["indexing-rewards"].find(
    (r) => r.kind === "rewards_collected" && r.indexer === top.address,
  );
  row.indexer = "0x" + "1".repeat(40);
  assert.notEqual(shape(data, fixtureBinds).indexers[0].rewards, top.rewards);
});

test("shape ranks indexers by rewards and takes the pool from the last delegation row", () => {
  const data = rows();
  const view = shape(data, fixtureBinds);
  const totals = new Map();
  for (const row of data["indexing-rewards"])
    totals.set(
      row.indexer,
      (totals.get(row.indexer) ?? 0n) + BigInt(row.amount),
    );
  const [topAddress] = [...totals].sort(([, a], [, b]) => (b > a ? 1 : -1))[0];
  assert.equal(view.indexers[0].address, topAddress);
  const lastRow = data.delegation.findLast((r) => r.indexer === topAddress);
  assert.equal(
    view.indexers[0].pool,
    lastRow ? formatGrt(BigInt(lastRow.pool_tokens)) : "—",
  );
});

test("shape subtracts undelegations from net delegation", () => {
  const data = rows();
  const gross = data.delegation
    .filter((r) => r.kind === "delegated")
    .reduce((s, r) => s + BigInt(r.tokens), 0n);
  const net = data.delegation.reduce(
    (s, r) => s + (r.kind === "delegated" ? 1n : -1n) * BigInt(r.tokens),
    0n,
  );
  assert.notEqual(net, gross);
  assert.equal(
    shape(data, fixtureBinds).netDelegation.startsWith(net < 0n ? "−" : "+"),
    true,
  );
});
