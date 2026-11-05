import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "../src/check.mjs";
import { hoursInWindow, shape, wallets } from "../src/report.mjs";
import { fixture, fixtureFetched, hourOfBlock } from "./fixture.mjs";

const rows = () => JSON.parse(JSON.stringify(fixture()));
const checkRows = (corrupted) => check(fixtureFetched(corrupted));
const [, exploiter, walletA] = wallets;
const exploiterBind = "transfers-exploiter";

test("check passes on the fixture and says what it proved", () => {
  assert.match(checkRows(rows())[0], /counted once each/);
});

test("check fails when a transfer is listed twice in one wallet", () => {
  const corrupted = rows();
  corrupted[exploiterBind].push(corrupted[exploiterBind][0]);
  assert.throws(() => checkRows(corrupted), /listed twice/);
});

test("check fails when two wallets disagree about one transfer", () => {
  const corrupted = rows();
  const row = corrupted["transfers-hop-a4b2"].find(
    (transfer) => transfer.from === exploiter && transfer.to === walletA,
  );
  row.value = (BigInt(row.value) * 1000000n).toString();
  assert.throws(() => checkRows(corrupted), /disagree/);
});

test("check fails when a transfer between trail wallets is missing on one side", () => {
  const corrupted = rows();
  corrupted["transfers-hop-a4b2"].shift();
  assert.throws(() => checkRows(corrupted), /is missing from/);
});

test("check fails when transfers are scaled but the balances are not", () => {
  const corrupted = rows();
  for (const name of [exploiterBind, "transfers-hop-a4b2"])
    for (const row of corrupted[name])
      if (row.from === exploiter && row.to === walletA)
        row.value = (BigInt(row.value) * 10n).toString();
  assert.throws(() => checkRows(corrupted), /balance moved/);
});

const balanceRow = (corrupted, bind, hourIndex, token) =>
  corrupted[bind].find(
    (row) => row.hour === hoursInWindow()[hourIndex] && row.token === token,
  );
const stEth = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";

test("check fails when one balance is off by a factor of 1e9", () => {
  const corrupted = rows();
  const row = balanceRow(corrupted, "token-balance-hop-a4b2", 22, stEth);
  row.balance = (BigInt(row.balance) * 10n ** 9n).toString();
  assert.throws(() => checkRows(corrupted), /balance moved/);
});

test("check fails when one hour's balance change has the wrong sign", () => {
  const corrupted = rows();
  const before = balanceRow(corrupted, "token-balance-hop-a4b2", 21, stEth);
  const after = balanceRow(corrupted, "token-balance-hop-a4b2", 22, stEth);
  after.balance = (
    2n * BigInt(before.balance) -
    BigInt(after.balance)
  ).toString();
  assert.throws(() => checkRows(corrupted), /balance moved/);
});

test("check fails when one small stETH transfer is dropped outside the rebase hours", () => {
  const corrupted = rows();
  const hours = hoursInWindow();
  const small = corrupted["transfers-hop-a4b2"].find(
    (row) =>
      row.token === stEth &&
      row.value.length <= 20 &&
      !["12", "13"].includes(hours[hourOfBlock(row.block)].slice(11)),
  );
  corrupted["transfers-hop-a4b2"] = corrupted["transfers-hop-a4b2"].filter(
    (row) => row !== small,
  );
  assert.throws(() => checkRows(corrupted), /balance moved/);
});

test("check places a transfer by its read's resolved blocks, not by an even 300 blocks", () => {
  const input = rows();
  const lastOfHour29 = input["transfers-hop-a4b2"].find(
    (row) => hourOfBlock(row.block + 1) === 30 && hourOfBlock(row.block) === 29,
  );
  assert.ok(
    lastOfHour29,
    "fixture has a transfer on the last block of an hour",
  );
  const fetched = fixtureFetched(input);
  for (const reads of Object.values(fetched.reads)) {
    reads[29].to_block -= 1;
    reads[30].from_block -= 1;
  }
  assert.throws(() => check(fetched), /balance moved/);
});

test("check fails when a transfer sits outside every read", () => {
  const fetched = fixtureFetched(rows());
  const stray = {
    ...fetched.rows[exploiterBind][0],
    from: exploiter,
    to: `0x${"9".repeat(40)}`,
    log_index: "9999",
  };
  stray.block = fetched.reads[exploiterBind].at(-1).to_block;
  fetched.rows[exploiterBind].push(stray);
  assert.throws(() => check(fetched), /outside the window/);
});

test("check fails when a balance row falls outside the window", () => {
  const corrupted = rows();
  corrupted["balance-exploiter"][0].hour = "2025-03-02T00";
  assert.throws(() => checkRows(corrupted), /stray or repeated/);
});

test("shape keeps each token separate and counts a transfer once", () => {
  const view = shape({ rows: rows() });
  const byLabel = Object.fromEntries(view.wallets.map((w) => [w.label, w]));
  assert.deepEqual(view.headline.intoExploiter, [
    { symbol: "stETH", amount: "90,000" },
    { symbol: "mETH", amount: "8,000" },
    { symbol: "cmETH", amount: "15,000" },
  ]);
  const coldWallet = byLabel["Bybit cold wallet"];
  assert.equal(coldWallet.tokens[1].net, "−8,000");
  const walletC = byLabel["Wallet 0x0fa0…6d2e"];
  assert.deepEqual(walletC.tokens, [
    { symbol: "mETH", received: "8,000", sent: "8,000", net: "0" },
  ]);
  assert.equal(view.headline.transfers, "55");
  assert.equal(view.nodes.length, 10);
});

test("shape puts outside destinations after the deepest tracked hop", () => {
  const { nodes } = shape({ rows: rows() });
  const deepest = Math.max(...nodes.filter((n) => n.tracked).map((n) => n.hop));
  for (const node of nodes.filter((n) => !n.tracked))
    assert.equal(node.hop, deepest + 1);
});
