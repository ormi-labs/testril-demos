import { test } from "node:test";
import assert from "node:assert/strict";
import { check, daosOf, formatAmount, shape } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const daos = daosOf(fixtureBinds);
const uniswap = daos.find((dao) => dao.id === "uniswap");

test("check proves every DAO total equals the sum of its wallets", () => {
  const passed = check(rows(), fixtureBinds);
  assert.equal(passed.length, daos.length * 2);
  assert.match(passed[0], /Uniswap: 3 tokens over 91 days, each total equals/);
});

test("check fails when one wallet is a single raw unit off on one day", () => {
  const corrupted = rows();
  const [row] = corrupted[uniswap.wallets[1].bind].filter(
    (r) => r.day === "2026-09-15" && r.token === uniswap.tokens[1],
  );
  row.balance = (BigInt(row.balance) + 1n).toString();
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /Uniswap USDC on 2026-09-15/,
  );
});

test("check fails when a wallet's day is missing from its own read", () => {
  const corrupted = rows();
  const bind = uniswap.wallets[0].bind;
  corrupted[bind] = corrupted[bind].filter(
    (r) => !(r.day === "2026-10-01" && r.token === uniswap.tokens[2]),
  );
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /Uniswap WETH on 2026-10-01/,
  );
});

test("check fails on a negative native balance", () => {
  const corrupted = rows();
  corrupted["ens-native"][0].balance = "-5";
  assert.throws(
    () => check(corrupted, fixtureBinds),
    /ENS DAO has a negative balance: -5/,
  );
});

test("check fails on a native row from a foreign owner or outside the window", () => {
  const foreign = rows();
  foreign["ens-native"][0].owner = "0x0000000000000000000000000000000000000001";
  assert.throws(
    () => check(foreign, fixtureBinds),
    /ENS DAO native balance row is outside/,
  );
  const late = rows();
  late["ens-native"][0].day = "2027-01-01";
  assert.throws(
    () => check(late, fixtureBinds),
    /ENS DAO native balance row is outside/,
  );
});

test("check fails when the governance token vanishes for a day", () => {
  const corrupted = rows();
  const arbitrum = daos.find((dao) => dao.id === "arbitrum");
  const day = arbitrum.days[3];
  for (const bind of [
    arbitrum.totalBind,
    ...arbitrum.wallets.map((w) => w.bind),
  ])
    corrupted[bind] = corrupted[bind].filter(
      (r) => !(r.day === day && r.token === arbitrum.tokens[0]),
    );
  assert.throws(
    () => check(corrupted, fixtureBinds),
    new RegExp(`no ARB on ${day}`),
  );
});

test("formatAmount scales by the token's decimals", () => {
  assert.equal(formatAmount(5_690_000_000_000n, 6), "5.69M");
  assert.equal(formatAmount(5_690_000_000_000_000_000n, 18), "5.69");
  assert.equal(
    formatAmount(-1_500_000_000_000_000_000_000n, 18, true),
    "−1.50K",
  );
});

test("shape lists holdings with the wallet split and the governance line", () => {
  const view = shape(rows(), fixtureBinds);
  const card = view.cards[0];
  assert.equal(card.name, "Uniswap");
  assert.equal(card.line.points.length, 91);
  assert.deepEqual(
    card.holdings.map((h) => h.symbol),
    ["UNI", "USDC", "WETH", "ETH"],
  );
  assert.equal(card.holdings[0].wallets.length, 2);
  assert.equal(view.cards[2].line.points.length, 8);
  assert.match(view.cards[2].holdings[0].change, /^−2[4-6]\.\d\dM ARB$/);
  assert.match(card.holdings[1].change, /^−1\.\d\dM USDC$/);
});
