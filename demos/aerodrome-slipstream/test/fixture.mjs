import { bindsAt, days, factories, usdc, weth } from "../src/report.mjs";
import { blockAt, resolveWindow } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);

const cbbtc = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const aero = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
export const wethUsdc = "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59";
export const usdcCbbtc = "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef";
const usdcAero = "0xbe00ff35af70e8415d0eb605a286d8a45466a4c1";
const otherPools = Array.from(
  { length: 8 },
  (_, i) => `0x${(i + 1).toString(16).repeat(40)}`,
);
const idlePools = ["0x" + "a".repeat(40), "0x" + "b".repeat(40)];

const [, mainFactory, secondFactory] = factories.map(([factory]) => factory);
const factoryOf = (pool) => (pool === usdcAero ? secondFactory : mainFactory);
const createdAt = new Map(factories);
const listed = (pool, token0, token1, index) => ({
  block: blockAt(createdAt.get(factoryOf(pool))) + 40000 * (index + 1),
  pool,
  token0,
  token1,
  fee: "500",
  tick_spacing: "100",
});

function listRows() {
  return [
    [wethUsdc, weth, usdc],
    [usdcCbbtc, usdc, cbbtc],
    [usdcAero, usdc, aero],
    ...otherPools.map((pool) => [pool, weth, aero]),
    ...idlePools.map((pool) => [pool, usdc, weth]),
  ].map(([pool, token0, token1], index) => listed(pool, token0, token1, index));
}

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const units = (amount, decimals, random) =>
  BigInt(Math.round(amount)) * 10n ** BigInt(decimals) +
  BigInt(Math.floor(random() * 10 ** Math.min(decimals, 6)));

function poolRows(random, pool, dailyDollars, volumes, skipOdds) {
  return days(fixtureBinds)
    .filter(() => random() >= skipOdds)
    .map((day) => {
      const dollars = dailyDollars * (0.6 + random() * 0.8);
      return {
        day,
        pool,
        swaps: String(Math.round(dollars / 4000) + 1),
        ...volumes(dollars, random),
      };
    });
}

function volumeRows() {
  const random = seeded(11);
  return [
    ...poolRows(
      random,
      wethUsdc,
      60e6,
      (d, r) => ({
        volume0: units(d / 3500, 18, r).toString(),
        volume1: units(d, 6, r).toString(),
      }),
      0,
    ),
    ...poolRows(
      random,
      usdcCbbtc,
      90e6,
      (d, r) => ({
        volume0: units(d, 6, r).toString(),
        volume1: units(d / 95000, 8, r).toString(),
      }),
      0,
    ),
    ...poolRows(
      random,
      usdcAero,
      3e6,
      (d, r) => ({
        volume0: units(d, 6, r).toString(),
        volume1: units(d / 0.9, 18, r).toString(),
      }),
      0.3,
    ),
    ...otherPools.flatMap((pool, i) =>
      poolRows(
        random,
        pool,
        40e6 / (i + 1),
        (d, r) => ({
          volume0: units(d / 3500, 18, r).toString(),
          volume1: units(d / 0.9, 18, r).toString(),
        }),
        i / 10,
      ),
    ),
  ];
}

const fromFactory = (rows, factory) =>
  rows.filter((row) => factoryOf(row.pool) === factory);

export function fixture() {
  const pools = listRows();
  const volume = volumeRows();
  return Object.fromEntries(
    fixtureBinds.map(({ name, params }) =>
      params.factory
        ? [name, fromFactory(pools, params.factory)]
        : [name, fromFactory(volume, params.swap.pool_list.factory)],
    ),
  );
}

export function fixtureRows() {
  const pools = listRows();
  const volume = volumeRows();
  return (bound, window) => {
    if (bound.function_slug !== "uniswap_v3.pool_list")
      return fromFactory(volume, bound.params.swap.pool_list.factory);
    const { from_block, to_block } = resolveWindow(window);
    return fromFactory(pools, bound.params.factory).filter(
      (row) => row.block >= from_block && row.block < to_block,
    );
  };
}
