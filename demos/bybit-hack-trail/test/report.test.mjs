import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, wallets } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => JSON.parse(JSON.stringify(fixture().rows));
const [, exploiter, walletA] = wallets;
const exploiterBind = "transfers-exploiter";

test("check passes on the fixture and says what it proved", () => {
  assert.match(check(rows())[0], /counted once each/);
});

test("check fails when a transfer is listed twice in one wallet", () => {
  const corrupted = rows();
  corrupted[exploiterBind].push(corrupted[exploiterBind][0]);
  assert.throws(() => check(corrupted), /listed twice/);
});

test("check fails when two wallets disagree about one transfer", () => {
  const corrupted = rows();
  const row = corrupted["transfers-hop-a4b2"].find(
    (transfer) => transfer.from === exploiter && transfer.to === walletA,
  );
  row.value = (BigInt(row.value) * 1000000n).toString();
  assert.throws(() => check(corrupted), /disagree/);
});

test("check fails when a transfer between trail wallets is missing on one side", () => {
  const corrupted = rows();
  corrupted["transfers-hop-a4b2"].shift();
  assert.throws(() => check(corrupted), /is missing from/);
});

test("check fails when a wallet sends more than it received", () => {
  const corrupted = rows();
  for (const name of [exploiterBind, "transfers-hop-a4b2"])
    for (const row of corrupted[name])
      if (row.from === exploiter && row.to === walletA)
        row.value = (BigInt(row.value) * 10n).toString();
  assert.throws(() => check(corrupted), /sends more .* than it received/);
});

test("check fails when a balance row falls outside the window", () => {
  const corrupted = rows();
  corrupted["balance-exploiter"][0].hour = "2025-03-02T00";
  assert.throws(() => check(corrupted), /stray or repeated/);
});

test("shape counts a transfer read from both wallets once", () => {
  const view = shape(rows());
  const byLabel = Object.fromEntries(view.wallets.map((w) => [w.label, w]));
  assert.equal(view.headline.stolen, "424,000");
  assert.equal(byLabel["Exploiter"].sent, "373,271");
  assert.equal(byLabel["Wallet 0xa4b2…449e"].received, "165,000");
  assert.equal(view.headline.transfers, "58");
  assert.equal(view.nodes.length, 10);
});
