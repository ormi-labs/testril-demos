import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, wallets } from "../src/report.mjs";
import { fixture, fixtureBinds, fixtureFetched } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check passes for every wallet on the fixture", () => {
  assert.equal(check(fixtureFetched(rows()), fixtureBinds).length, 3);
});

test("check fails when a transfer does not involve the wallet", () => {
  const corrupted = rows();
  corrupted["transfers-nick"][0].from =
    "0x3333333333333333333333333333333333333333";
  corrupted["transfers-nick"][0].to =
    "0x4444444444444444444444444444444444444444";
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /nick\.eth.*names neither/,
  );
});

test("check fails when a recorded ENS name is empty", () => {
  const corrupted = rows();
  corrupted["ens-brantly"][0].name = "";
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /No ENS name recorded/,
  );
});

test("check fails when a transfer sits outside the window, and passes at its last block", () => {
  const corrupted = rows();
  const { reads } = fixtureFetched(corrupted);
  const lastBlock = reads["transfers-vitalik"].at(-1).to_block;
  corrupted["transfers-vitalik"][0].block = lastBlock;
  assert.throws(
    () => check(fixtureFetched(corrupted), fixtureBinds),
    /outside the window/,
  );
  corrupted["transfers-vitalik"][0].block = lastBlock - 1;
  assert.equal(check(fixtureFetched(corrupted), fixtureBinds).length, 3);
});

test("a transfer's day is the read that resolved to its block, not an even 7200 blocks", () => {
  const input = fixtureFetched(rows());
  const [day0, day1] = input.reads["transfers-nick"];
  const first = input.rows["transfers-nick"].find(
    (transfer) => transfer.block >= day1.from_block,
  );
  const perDay = () =>
    shape(input, fixtureBinds).wallets[1].daily.map((d) => d.in + d.out);
  const before = perDay();
  day0.to_block = day1.from_block = first.block + 1;
  assert.deepEqual(perDay().slice(0, 2), [before[0] + 1, before[1] - 1]);
});

test("a wallet with no balance row shows 0 ETH and still passes", () => {
  const input = rows();
  input.balance = input.balance.filter(
    (row) => row.owner !== wallets[0].address,
  );
  assert.equal(check(fixtureFetched(input), fixtureBinds).length, 3);
  assert.equal(
    shape(fixtureFetched(input), fixtureBinds).wallets[0].balance,
    "0.0000 ETH",
  );
});

test("shape shows wei as ETH and raw token units at their decimals", () => {
  const input = rows();
  const [first] = input["transfers-nick"];
  first.token = "0x6b175474e89094c44da98b954eedeac495271d0f";
  first.value = "2500000000000000000";
  const wallet = shape(fixtureFetched(input), fixtureBinds).wallets[1];
  assert.equal(wallet.balance, "42.0000 ETH");
  assert.ok(
    wallet.transfers.some((t) => t.token === "DAI" && t.amount === "2.50"),
  );
});

test("shape shows a self transfer once, as self, and orders newest first", () => {
  const input = rows();
  const [vitalik] = shape(fixtureFetched(input), fixtureBinds).wallets;
  assert.equal(vitalik.transferCount, 19);
  const self = vitalik.transfers.filter((t) => t.direction === "self");
  assert.equal(self.length, 1);
  assert.equal(self[0].counterparty, "0xd8da…6045");
  const blocks = vitalik.transfers.map((t) => t.block);
  assert.deepEqual(
    blocks,
    [...blocks].sort((a, b) => b - a),
  );
});
