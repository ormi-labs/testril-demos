import { test } from "node:test";
import assert from "node:assert/strict";
import { check, formatGrt, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);
const collected = (list) => list.find((r) => r.kind === "rewards_collected");

test("check passes on the fixture with four proven sentences", () => {
  assert.equal(check(rows()).length, 4);
});

test("check fails when the indexer share is in whole GRT instead of wei", () => {
  const corrupted = rows();
  const row = collected(corrupted["indexing-rewards"]);
  row.indexer_rewards = (BigInt(row.indexer_rewards) / 10n ** 18n).toString();
  assert.throws(() => check(corrupted), /indexer .* \+ delegator/);
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

test("check fails when a fee row's total ignores the tax", () => {
  const corrupted = rows();
  const row = corrupted["query-fees"].find(
    (r) => r.kind === "rebate_collected",
  );
  row.protocol_tax = "0";
  assert.throws(() => check(corrupted), /do not add up/);
});

test("shape ranks indexers by rewards and takes the pool from the last delegation row", () => {
  const data = rows();
  const view = shape(data);
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
    shape(data).netDelegation.startsWith(net < 0n ? "−" : "+"),
    true,
  );
});
