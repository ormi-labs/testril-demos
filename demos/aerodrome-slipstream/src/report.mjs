import spec from "../testril.json" with { type: "json" };

export const poolVolume = spec.binds[0];
export const window = poolVolume.window;
export const factory = poolVolume.params.swap.pool_list.factory;
const dollarDecimals = 6n;
const dollar = 10n ** dollarDecimals;

export const knownPools = {
  "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59": {
    pair: "WETH / USDC",
    dollarSide: "volume1",
  },
  "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef": {
    pair: "USDC / cbBTC",
    dollarSide: "volume0",
  },
};

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export function days() {
  const all = [];
  for (let d = window.from_day; d < window.to_day; d = nextDay(d)) all.push(d);
  return all;
}

const dollarVolume = (row) => {
  const known = knownPools[row.pool];
  return known ? BigInt(row[known.dollarSide]) : null;
};

export function totalsByPool(rows) {
  const totals = new Map();
  for (const row of rows) {
    const total = totals.get(row.pool) ?? { swaps: 0n, dollars: null };
    total.swaps += BigInt(row.swaps);
    const dollars = dollarVolume(row);
    if (dollars !== null) total.dollars = (total.dollars ?? 0n) + dollars;
    totals.set(row.pool, total);
  }
  return totals;
}

const bySizeDescending = (a, b) => (b > a ? 1 : b < a ? -1 : 0);

export function leaderboard(rows) {
  return [...totalsByPool(rows)]
    .map(([pool, total]) => ({ pool, ...total }))
    .sort((a, b) =>
      a.dollars !== null && b.dollars !== null
        ? bySizeDescending(a.dollars, b.dollars)
        : a.dollars !== null
          ? -1
          : b.dollars !== null
            ? 1
            : bySizeDescending(a.swaps, b.swaps),
    );
}

export function check(rows) {
  const poolRows = rows["pool-volume"];
  if (!poolRows.length) throw new Error("No pool volume rows.");
  const seen = new Set();
  for (const row of poolRows) {
    if (row.day < window.from_day || row.day >= window.to_day)
      throw new Error(
        `Row for ${row.pool} on ${row.day} is outside the window.`,
      );
    if (BigInt(row.swaps) <= 0n)
      throw new Error(`${row.pool} has ${row.swaps} swaps on ${row.day}.`);
    const key = `${row.pool}@${row.day}`;
    if (seen.has(key))
      throw new Error(`Two rows for ${row.pool} on ${row.day}.`);
    seen.add(key);
  }

  const board = leaderboard(poolRows);
  const ranked = board.filter((entry) => entry.dollars !== null);
  ranked.slice(1).forEach((entry, index) => {
    if (entry.dollars > ranked[index].dollars)
      throw new Error(`${entry.pool} outranks a pool with less dollar volume.`);
  });
  const dollarsPerDay = new Map();
  for (const row of poolRows) {
    const dollars = dollarVolume(row);
    if (dollars !== null)
      dollarsPerDay.set(row.day, (dollarsPerDay.get(row.day) ?? 0n) + dollars);
  }
  const byDay = [...dollarsPerDay.values()].reduce((sum, v) => sum + v, 0n);
  const byPool = ranked.reduce((sum, entry) => sum + entry.dollars, 0n);
  if (byDay !== byPool)
    throw new Error(
      `Daily dollar volume sums to ${byDay} but pool totals sum to ${byPool}.`,
    );
  return [
    `Every one of the ${poolRows.length} pool-day rows has at least one swap`,
    `${ranked.length} ranked pools are in descending order of dollar volume, ${formatUsd(byPool)} in total`,
    `Per-day dollar volume sums to the same ${formatUsd(byDay)} as the pool totals`,
  ];
}

export function formatUsd(raw) {
  const cents = (raw + 5000n) / 10000n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
}

export function formatCompact(raw) {
  const dollars = Number(raw / dollar);
  const [scale, suffix] =
    dollars >= 1e9 ? [1e9, "B"] : dollars >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `$${(dollars / scale).toFixed(2)}${suffix}`;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function series(rows, pool) {
  const perDay = new Map(
    rows
      .filter((row) => row.pool === pool)
      .map((row) => [row.day, dollarVolume(row)]),
  );
  return days().map((day) => ({
    day,
    millions: Number((perDay.get(day) ?? 0n) / dollar) / 1e6,
  }));
}

export function shape(rows) {
  const poolRows = rows["pool-volume"];
  const board = leaderboard(poolRows);
  const ranked = board.filter((entry) => entry.dollars !== null);
  const totalSwaps = board.reduce((sum, entry) => sum + entry.swaps, 0n);
  const totalDollars = ranked.reduce((sum, entry) => sum + entry.dollars, 0n);
  return {
    window,
    factory,
    poolCount: board.length,
    totalSwaps: totalSwaps.toLocaleString("en-US"),
    totalDollars: formatCompact(totalDollars),
    leader: ranked[0] && {
      pair: knownPools[ranked[0].pool].pair,
      volume: formatCompact(ranked[0].dollars),
    },
    charts: ranked.map((entry) => ({
      symbol: knownPools[entry.pool].pair,
      series: series(poolRows, entry.pool),
    })),
    pools: board.map((entry, index) => ({
      rank: String(index + 1),
      pool: shortAddress(entry.pool),
      pair: knownPools[entry.pool]?.pair ?? "dollar side unknown",
      swaps: entry.swaps.toLocaleString("en-US"),
      volume: entry.dollars === null ? "—" : formatUsd(entry.dollars),
    })),
  };
}
