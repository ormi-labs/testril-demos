import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const stateWindow = binds["reserve-state"].window;
export const totalsWindow = binds["reserve-totals"].window;
export const holdingsWindow = binds["morpho-holdings"].window;
export const reservesWindow = binds.reserves.window;

export const assets = [
  {
    symbol: "USDC",
    decimals: 6,
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  },
  {
    symbol: "USDT",
    decimals: 6,
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
  {
    symbol: "WETH",
    decimals: 18,
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  },
  {
    symbol: "WBTC",
    decimals: 8,
    address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  },
  {
    symbol: "DAI",
    decimals: 18,
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  },
  {
    symbol: "wstETH",
    decimals: 18,
    address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  },
  {
    symbol: "LINK",
    decimals: 18,
    address: "0x514910771af9ca656af840dff83e8264ecf986ca",
  },
];
const usdc = assets[0];
const rawAmount = /^[0-9]+$/;
const basisPointsPerPercent = 100n;
const rayPerBasisPoint = 10n ** 23n;
const maxBorrowRate = 10n * 10n ** 27n;
const minBorrowRate = 10n ** 21n;
const totalsFields = [
  "supplied",
  "withdrawn",
  "borrowed",
  "repaid",
  "flash_loaned",
  "flash_premium",
  "liquidated_collateral",
  "minted_to_treasury",
];

const hourMs = 3600000;
const toDate = (hour) => new Date(Date.parse(`${hour}:00:00Z`));
const fromDate = (date) => date.toISOString().slice(0, 13);
export const addHours = (hour, step) =>
  fromDate(new Date(+toDate(hour) + step * hourMs));
export const addDays = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * 24 * hourMs)
    .toISOString()
    .slice(0, 10);

export function holdingDays() {
  const days = [];
  for (
    let d = holdingsWindow.from_day;
    d < holdingsWindow.to_day;
    d = addDays(d, 1)
  )
    days.push(d);
  return days;
}
export const lastStateHour = addHours(stateWindow.to_hour, -1);

const bySymbol = (asset) =>
  assets.find((a) => a.address === asset.toLowerCase());
const utilizationBp = (row) => {
  const supply = BigInt(row.a_token_supply);
  return supply === 0n ? 0n : (BigInt(row.variable_debt) * 10000n) / supply;
};

function latestPerAsset(rows, order) {
  const latest = new Map();
  for (const row of rows) {
    const key = row.asset.toLowerCase();
    if (!latest.has(key) || order(row) > order(latest.get(key)))
      latest.set(key, row);
  }
  return latest;
}

function checkState(rows) {
  const listed = new Set(rows.reserves.map((row) => row.asset.toLowerCase()));
  for (const row of rows["reserve-state"]) {
    const name = bySymbol(row.asset)?.symbol ?? row.asset;
    if (!listed.has(row.asset.toLowerCase()))
      throw new Error(
        `${name} has hourly state but is not in the reserve list.`,
      );
    if (row.hour < stateWindow.from_hour || row.hour >= stateWindow.to_hour)
      throw new Error(`${name} state at ${row.hour} is outside the window.`);
    if (BigInt(row.variable_debt) > BigInt(row.a_token_supply))
      throw new Error(
        `${name} utilization at ${row.hour} is above 100%: variable debt ${row.variable_debt} exceeds aToken supply ${row.a_token_supply}.`,
      );
    const borrow = BigInt(row.variable_borrow_rate);
    if (
      borrow > maxBorrowRate ||
      (BigInt(row.variable_debt) > 0n && borrow <= minBorrowRate)
    )
      throw new Error(
        `${name} borrow rate at ${row.hour} is outside 0.001%–1000% a year: ${row.variable_borrow_rate} is not in ray.`,
      );
    if (BigInt(row.liquidity_rate) > borrow)
      throw new Error(
        `${name} supply rate at ${row.hour} is above its borrow rate.`,
      );
  }
  const latest = latestPerAsset(rows["reserve-state"], (row) => row.hour);
  for (const { symbol, address } of assets)
    if (latest.get(address)?.hour !== lastStateHour)
      throw new Error(`${symbol} has no state at ${lastStateHour}.`);
}

function checkTotals(rows) {
  const history = Map.groupBy(rows["reserve-totals"], (row) =>
    row.asset.toLowerCase(),
  );
  for (const [asset, list] of history) {
    const name = bySymbol(asset)?.symbol ?? asset;
    const sorted = list.toSorted((a, b) => a.block - b.block);
    sorted.forEach((row, i) => {
      if (row.block >= totalsWindow.to_block)
        throw new Error(
          `${name} totals at block ${row.block} are after the window.`,
        );
      if (BigInt(row.flash_premium) > BigInt(row.flash_loaned))
        throw new Error(
          `${name} flash-loan premiums exceed the amount flash-loaned at block ${row.block}.`,
        );
      for (const field of totalsFields)
        if (i > 0 && BigInt(row[field]) < BigInt(sorted[i - 1][field]))
          throw new Error(
            `${name} lifetime ${field} decreases at block ${row.block}.`,
          );
    });
  }
  for (const { symbol, address } of assets)
    if (!history.has(address))
      throw new Error(`${symbol} has no lifetime totals.`);
}

function checkHoldings(rows) {
  for (const row of rows["morpho-holdings"])
    if (!rawAmount.test(row.in_markets) || !rawAmount.test(row.in_vaults))
      throw new Error(
        `Morpho holdings of ${row.token} on ${row.day} are not non-negative integers.`,
      );
  for (const day of holdingDays()) {
    const venues = usdcByVenue(rows, day);
    if (!venues)
      throw new Error(
        `USDC is missing from Aave state or Morpho holdings on ${day}.`,
      );
    if (venues.markets + venues.vaults === 0n)
      throw new Error(`Morpho holds no USDC on ${day}.`);
  }
}

export function check(rows) {
  checkState(rows);
  checkTotals(rows);
  checkHoldings(rows);
  const days = holdingDays().length;
  return [
    `Every Aave reserve with state is in the reserve list, and all ${rows["reserve-state"].length} hourly rows lie inside the window`,
    "Variable debt never exceeds aToken supply (utilization within 0–100%); supply rates never exceed borrow rates; borrow rates read as ray stay between 0.001% and 1000%",
    "Lifetime totals only grow between blocks, and flash-loan premiums never exceed flash-loaned amounts",
    `Morpho holdings are non-negative integers, Morpho holds USDC every day, and USDC is present in Aave and Morpho for all ${days} days`,
  ];
}

export function formatPercent(bp) {
  return `${bp / basisPointsPerPercent}.${String(bp % basisPointsPerPercent).padStart(2, "0")}%`;
}
const formatRate = (ray) => formatPercent(BigInt(ray) / rayPerBasisPoint);

export function formatAmount(raw, decimals) {
  const units = Number(BigInt(raw) / 10n ** BigInt(decimals - 2)) / 100;
  const [scale, suffix] =
    units >= 1e9
      ? [1e9, "B"]
      : units >= 1e6
        ? [1e6, "M"]
        : units >= 1e3
          ? [1e3, "K"]
          : [1, ""];
  return `${(units / scale).toFixed(2)}${suffix}`;
}
const millions = (raw, decimals) =>
  Number(BigInt(raw) / 10n ** BigInt(decimals - 2)) / 100 / 1e6;

function usdcByVenue(rows, day) {
  const aave = rows["reserve-state"]
    .filter(
      (row) =>
        row.asset.toLowerCase() === usdc.address && row.hour.startsWith(day),
    )
    .toSorted((a, b) => (a.hour < b.hour ? 1 : -1))[0];
  const morpho = rows["morpho-holdings"].find(
    (row) => row.day === day && row.token.toLowerCase() === usdc.address,
  );
  return (
    aave &&
    morpho && {
      day,
      aaveIdle: BigInt(aave.a_token_supply) - BigInt(aave.variable_debt),
      markets: BigInt(morpho.in_markets),
      vaults: BigInt(morpho.in_vaults),
    }
  );
}

function rateBoard(rows) {
  const latest = latestPerAsset(rows["reserve-state"], (row) => row.hour);
  return assets.map(({ symbol, decimals, address }) => {
    const row = latest.get(address);
    return {
      symbol,
      supplyApr: formatRate(row.liquidity_rate),
      borrowApr: formatRate(row.variable_borrow_rate),
      utilization: formatPercent(utilizationBp(row)),
      supplied: formatAmount(row.a_token_supply, decimals),
      borrowed: formatAmount(row.variable_debt, decimals),
      borrowSeries: rows["reserve-state"]
        .filter((r) => r.asset.toLowerCase() === address)
        .toSorted((a, b) => (a.hour < b.hour ? -1 : 1))
        .map(
          (r) =>
            Number(BigInt(r.variable_borrow_rate) / rayPerBasisPoint) / 100,
        ),
    };
  });
}

function lifetimeTotals(rows) {
  const latest = latestPerAsset(rows["reserve-totals"], (row) => row.block);
  return assets.map(({ symbol, decimals, address }) => {
    const row = latest.get(address);
    return {
      symbol,
      liquidated: formatAmount(row.liquidated_collateral, decimals),
      flashLoaned: formatAmount(row.flash_loaned, decimals),
      flashPremium: formatAmount(row.flash_premium, decimals),
    };
  });
}

export function shape(rows) {
  const byVenue = holdingDays().map((day) => usdcByVenue(rows, day));
  const display = (raw) => formatAmount(raw, usdc.decimals);
  const latest = byVenue.at(-1);
  const board = rateBoard(rows);
  const totals = lifetimeTotals(rows);
  return {
    stateWindow,
    totalsWindow,
    holdingsWindow,
    reserveCount: rows.reserves.length,
    headline: {
      usdcUtilization: board[0].utilization,
      usdcBorrowApr: board[0].borrowApr,
      usdcLiquidated: totals[0].liquidated,
      usdcFlashPremium: totals[0].flashPremium,
    },
    board,
    totals,
    byVenue: byVenue.map((s) => ({
      day: s.day,
      aaveIdle: millions(s.aaveIdle, usdc.decimals),
      markets: millions(s.markets, usdc.decimals),
      vaults: millions(s.vaults, usdc.decimals),
    })),
    byVenueLatest: {
      aaveIdle: display(latest.aaveIdle),
      markets: display(latest.markets),
      vaults: display(latest.vaults),
    },
  };
}
