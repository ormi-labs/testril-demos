import spec from "../testril.json" with { type: "json" };

export const poolVolume = spec.binds.find(
  (bind) => bind.name === "pool-volume",
);
export const window = poolVolume.window;
export const factory = poolVolume.params.swap.pool_list.factory;
const dollarDecimals = 6n;
const dollar = 10n ** dollarDecimals;

export const knownPools = {
  "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59": {
    pair: "WETH / USDC",
    dollarSide: "volume1",
    otherSide: "volume0",
    otherDecimals: 18,
    otherToken: "WETH",
    priceBand: [500, 20000],
  },
  "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef": {
    pair: "USDC / cbBTC",
    dollarSide: "volume0",
    otherSide: "volume1",
    otherDecimals: 8,
    otherToken: "cbBTC",
    priceBand: [10000, 500000],
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
  const pools = [...totalsByPool(rows)].map(([pool, total]) => ({
    pool,
    ...total,
  }));
  const ranked = pools
    .filter((entry) => entry.dollars !== null)
    .sort((a, b) => bySizeDescending(a.dollars, b.dollars));
  const unranked = pools
    .filter((entry) => entry.dollars === null)
    .sort((a, b) => bySizeDescending(a.swaps, b.swaps));
  return { ranked, unranked };
}

const priceOutsideBand = (row, known) => {
  const [low, high] = known.priceBand;
  const scaledDollars =
    BigInt(row[known.dollarSide]) * 10n ** BigInt(known.otherDecimals);
  const otherVolume = BigInt(row[known.otherSide]);
  return (
    scaledDollars < BigInt(low) * dollar * otherVolume ||
    scaledDollars > BigInt(high) * dollar * otherVolume
  );
};

export function checkLeaderboard(poolRows, ranked) {
  const knownWithRows = new Set(
    poolRows.map((row) => row.pool).filter((pool) => knownPools[pool]),
  );
  if (ranked.length !== knownWithRows.size)
    throw new Error(
      `${ranked.length} pools are ranked but ${knownWithRows.size} known pools have rows.`,
    );
  ranked.forEach((entry, index) => {
    const summed = poolRows
      .filter((row) => row.pool === entry.pool)
      .reduce(
        (sum, row) => sum + BigInt(row[knownPools[entry.pool].dollarSide]),
        0n,
      );
    if (entry.dollars !== summed)
      throw new Error(
        `${entry.pool} is ranked with ${entry.dollars} but its rows sum to ${summed}.`,
      );
    if (index > 0 && entry.dollars > ranked[index - 1].dollars)
      throw new Error(`${entry.pool} outranks a pool with less dollar volume.`);
  });
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
    const known = knownPools[row.pool];
    if (known && priceOutsideBand(row, known)) {
      const [low, high] = known.priceBand;
      throw new Error(
        `${known.pair} on ${row.day} implies a price outside ${low} to ${high} dollars per ${known.otherToken}: the dollar side is misread.`,
      );
    }
  }

  const { ranked } = leaderboard(poolRows);
  checkLeaderboard(poolRows, ranked);
  const total = ranked.reduce((sum, entry) => sum + entry.dollars, 0n);
  return [
    `Every one of the ${poolRows.length} pool-day rows has at least one swap`,
    `Each known pool's dollar side implies a sane token price on every day, so no wei side was read as dollars`,
    `${ranked.length} ranked pools cover every known pool that traded, are in descending order of dollar volume, and each matches the sum of its rows, ${formatUsd(total)} in total`,
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
  const { ranked, unranked } = leaderboard(poolRows);
  const board = [...ranked, ...unranked];
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
    rankedPools: ranked.map((entry, index) => ({
      rank: String(index + 1),
      pool: shortAddress(entry.pool),
      pair: knownPools[entry.pool].pair,
      swaps: entry.swaps.toLocaleString("en-US"),
      volume: formatUsd(entry.dollars),
    })),
    unrankedPools: unranked.map((entry) => ({
      pool: shortAddress(entry.pool),
      swaps: entry.swaps.toLocaleString("en-US"),
    })),
  };
}
