import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);

test("check passes for every wallet on the fixture", () => {
  assert.equal(check(rows()).length, 3);
});

test("check fails when a transfer does not involve the wallet", () => {
  const corrupted = rows();
  corrupted["transfers-nick"][0].from =
    "0x3333333333333333333333333333333333333333";
  corrupted["transfers-nick"][0].to =
    "0x4444444444444444444444444444444444444444";
  assert.throws(() => check(corrupted), /nick\.eth.*names neither/);
});

test("check fails when a recorded ENS name is empty", () => {
  const corrupted = rows();
  corrupted["ens-brantly"][0].name = "";
  assert.throws(() => check(corrupted), /No ENS name recorded/);
});

test("check fails when a transfer is outside the week", () => {
  const corrupted = rows();
  corrupted["transfers-vitalik"][0].block = 1;
  assert.throws(() => check(corrupted), /outside the window/);
});

test("shape shows wei as ETH and raw token units at their decimals", () => {
  const input = rows();
  const [first] = input["transfers-nick"];
  first.token = "0x6b175474e89094c44da98b954eedeac495271d0f";
  first.value = "2500000000000000000";
  const wallet = shape(input).wallets[1];
  assert.equal(wallet.balance, "42.0000 ETH");
  assert.ok(
    wallet.transfers.some((t) => t.token === "DAI" && t.amount === "2.50"),
  );
});

test("shape counts self transfers once and orders newest first", () => {
  const [vitalik] = shape(rows()).wallets;
  assert.equal(vitalik.transferCount, 19);
  const blocks = vitalik.transfers.map((t) => t.block);
  assert.deepEqual(
    blocks,
    [...blocks].sort((a, b) => b - a),
  );
});
