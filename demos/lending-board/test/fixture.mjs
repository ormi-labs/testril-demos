import {
  addDays,
  assets,
  bindsAt,
  holdingDays,
  lastStateHour,
  stateHours,
} from "../src/report.mjs";
import { blockAt } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-01T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const windowOf = (name) =>
  fixtureBinds.find((bind) => bind.name === name).window;
const reservesFromBlock = blockAt(windowOf("reserves").from_time);
const totalsFromBlock = blockAt(windowOf("reserve-totals").from_time);
const totalsToBlock = blockAt(windowOf("reserve-totals").to_time);

const reserveFactorPercent = 10n;
const zeroAddress = `0x${"0".repeat(40)}`;

const market = {
  USDC: {
    supply: 2.6e9,
    utilization: 0.78,
    borrowApr: 5.9,
    morpho: 5.4e9,
    vaults: 61e6,
  },
  USDT: {
    supply: 2.1e9,
    utilization: 0.83,
    borrowApr: 6.7,
    morpho: 0.9e9,
    vaults: 12e6,
  },
  WETH: {
    supply: 2.2e6,
    utilization: 0.71,
    borrowApr: 2.4,
    morpho: 0.9e6,
    vaults: 31e3,
  },
  WBTC: {
    supply: 3.1e4,
    utilization: 0.36,
    borrowApr: 0.4,
    morpho: 1.4e4,
    vaults: 0,
  },
  DAI: {
    supply: 0.6e9,
    utilization: 0.64,
    borrowApr: 5.1,
    morpho: 0.4e9,
    vaults: 8e6,
  },
  wstETH: {
    supply: 1.9e6,
    utilization: 0.05,
    borrowApr: 0.2,
    morpho: 1.1e6,
    vaults: 4e3,
  },
  LINK: {
    supply: 11e6,
    utilization: 0.52,
    borrowApr: 2.2,
    morpho: 0,
    vaults: 0,
  },
};

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rawUnits = (units, decimals) =>
  BigInt(Math.round(units * 1000)) * 10n ** BigInt(decimals - 3);
const ray = (percent) => BigInt(Math.round(percent * 1e4)) * 10n ** 21n;
const hex = (n) => `0x${n.toString(16).padStart(40, "0")}`;

function reserveRows() {
  return assets.map(({ address }, i) => ({
    block: reservesFromBlock + 127 + i * 40000 + (i > 4 ? 9000000 : 0),
    asset: address,
    a_token: hex(0xa000 + i),
    variable_debt_token: hex(0xd000 + i),
    stable_debt_token: zeroAddress,
    interest_rate_strategy: hex(0x5000 + i),
    pool: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
  }));
}

function sampleHours() {
  const hours = [];
  for (
    let d = stateHours(fixtureBinds)[0].slice(0, 10);
    d < lastStateHour(fixtureBinds).slice(0, 10);
    d = addDays(d, 1)
  )
    hours.push(`${d}T00`, `${d}T12`);
  return [...hours, lastStateHour(fixtureBinds)];
}

function stateRows(random) {
  return assets.flatMap(({ symbol, decimals, address }) => {
    const m = market[symbol];
    return sampleHours().map((hour, i) => {
      const utilization = Math.min(
        0.97,
        m.utilization + (random() - 0.5) * 0.06,
      );
      const supply = rawUnits(
        m.supply * (1 + i * 0.001 + (random() - 0.5) * 0.004),
        decimals,
      );
      const debt = (supply * BigInt(Math.round(utilization * 10000))) / 10000n;
      const borrowRate = ray(m.borrowApr * (1 + (random() - 0.5) * 0.1));
      const supplyRate =
        (borrowRate * debt * (100n - reserveFactorPercent)) / (supply * 100n);
      return {
        hour,
        asset: address,
        liquidity_rate: supplyRate.toString(),
        stable_borrow_rate: "0",
        variable_borrow_rate: borrowRate.toString(),
        liquidity_index: (
          1074234577n * 10n ** 18n +
          BigInt(i) * 10n ** 15n
        ).toString(),
        variable_borrow_index: (
          1124365765n * 10n ** 18n +
          BigInt(i) * 10n ** 15n
        ).toString(),
        a_token_supply: supply.toString(),
        variable_debt: debt.toString(),
        scaled_accrued_to_treasury: rawUnits(
          m.supply * 1e-5,
          decimals,
        ).toString(),
      };
    });
  });
}

function totalsRows(random) {
  return assets.flatMap(({ symbol, decimals, address }, i) => {
    const m = market[symbol];
    const lifetime = {
      supplied: m.supply * 9,
      withdrawn: m.supply * 8.2,
      borrowed: m.supply * m.utilization * 12,
      repaid: m.supply * m.utilization * 11.5,
      flash_loaned: m.supply * 3,
      flash_premium: m.supply * 3 * 0.0005,
      liquidated_collateral: m.supply * 0.02,
      minted_to_treasury: m.supply * 0.004,
    };
    const blocks = [
      totalsFromBlock - 90000 - i * 700,
      totalsFromBlock + 1800 + i * 90,
      totalsToBlock - 400 - i * 50,
    ];
    return blocks.map((block, step) => ({
      block,
      asset: address,
      ...Object.fromEntries(
        Object.entries(lifetime).map(([field, total]) => [
          field,
          rawUnits(
            total * (1 + step * 0.002 + random() * 0.0005),
            decimals,
          ).toString(),
        ]),
      ),
    }));
  });
}

function holdingRows(random) {
  return holdingDays(fixtureBinds).flatMap((day, i) =>
    assets
      .filter(({ symbol }) => market[symbol].morpho > 0)
      .map(({ symbol, decimals, address }) => ({
        day,
        token: address,
        in_markets: rawUnits(
          market[symbol].morpho * (1 + i * 0.002 + (random() - 0.5) * 0.01),
          decimals,
        ).toString(),
        in_vaults: rawUnits(
          market[symbol].vaults * (1 + (random() - 0.5) * 0.1),
          decimals,
        ).toString(),
      })),
  );
}

export function fixture() {
  const random = seeded(11);
  return {
    reserves: reserveRows(),
    "reserve-state": stateRows(random),
    "reserve-totals": totalsRows(random),
    "morpho-holdings": holdingRows(random),
  };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
  return (bound) =>
    rows[
      fixtureBinds.find(
        (candidate) =>
          candidate.function_slug === bound.function_slug &&
          candidate.chain_id === bound.chain_id &&
          sameParams(candidate.params, bound.params),
      ).name
    ];
}
