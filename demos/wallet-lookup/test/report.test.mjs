import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape, wallets } from "../src/report.mjs";
import { fixture, fixtureBinds, toBindRows } from "./fixture.mjs";

const rows = () => structuredClone(fixture());

test("check passes for every wallet on the fixture", () => {
  assert.equal(check(toBindRows(rows()), fixtureBinds).length, 3);
});

test("check fails when a transfer does not involve the wallet", () => {
  const corrupted = rows();
  corrupted["transfers-nick"][0].from =
    "0x3333333333333333333333333333333333333333";
  corrupted["transfers-nick"][0].to =
    "0x4444444444444444444444444444444444444444";
  assert.throws(
    () => check(toBindRows(corrupted), fixtureBinds),
    /nick\.eth.*names neither/,
  );
});

test("check fails when a recorded ENS name is empty", () => {
  const corrupted = rows();
  corrupted["ens-brantly"][0].name = "";
  assert.throws(
    () => check(toBindRows(corrupted), fixtureBinds),
    /No ENS name recorded/,
  );
});

test("check fails when a transfer sits in the wrong day", () => {
  const bound = toBindRows(rows());
  const days = fixtureBinds
    .filter(
      (bind) =>
        bind.name.startsWith("transfers-vitalik-") && bound[bind.name].length,
    )
    .map((bind) => bind.name);
  bound[days[0]].push(bound[days.at(-1)].pop());
  assert.throws(
    () => check(bound, fixtureBinds),
    /earlier day already reached/,
  );
});

test("a wallet with no balance row shows 0 ETH and still passes", () => {
  const input = rows();
  input.balance = input.balance.filter(
    (row) => row.owner !== wallets[0].address,
  );
  assert.equal(check(toBindRows(input), fixtureBinds).length, 3);
  assert.equal(
    shape(toBindRows(input), fixtureBinds).wallets[0].balance,
    "0.0000 ETH",
  );
});

test("shape shows wei as ETH and raw token units at their decimals", () => {
  const input = rows();
  const [first] = input["transfers-nick"];
  first.token = "0x6b175474e89094c44da98b954eedeac495271d0f";
  first.value = "2500000000000000000";
  const wallet = shape(toBindRows(input), fixtureBinds).wallets[1];
  assert.equal(wallet.balance, "42.0000 ETH");
  assert.ok(
    wallet.transfers.some((t) => t.token === "DAI" && t.amount === "2.50"),
  );
});

test("shape shows a self transfer once, as self, and orders newest first", () => {
  const input = rows();
  const [vitalik] = shape(toBindRows(input), fixtureBinds).wallets;
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
