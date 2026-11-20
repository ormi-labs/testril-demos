const dayMs = 86400000;
const windowDays = 8;
const listReadHours = 720;
export const factories = [
  ["0x9592cd9b267748cbfbde90ac9f7df3c437a6d51b", "2024-04-23T03:47:43Z"],
  ["0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a", "2024-04-30T11:32:35Z"],
  ["0xade65c38cd4849adba595a4323a8c7ddfe89716a", "2025-10-17T10:33:03Z"],
  ["0xf8f2eb4940cfe7d13603dddd87f123820fc061ef", "2026-04-07T16:19:55Z"],
];
export const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const weth = "0x4200000000000000000000000000000000000006";
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

const listPrefix = "pools-";
const volumePrefix = "volume-";

export function bindsAt(now = Date.now()) {
  const today = isoSecond(Math.floor(now / dayMs) * dayMs);
  const volumeWindow = {
    from_time: isoSecond(Date.parse(today) - windowDays * dayMs),
    to_time: today,
  };
  return factories.flatMap(([factory, createdAt]) => [
    {
      name: `${listPrefix}${factory.slice(0, 6)}`,
      function_slug: "uniswap_v3.pool_list",
      chain_id: 8453,
      params: { factory },
      window: { from_time: createdAt, to_time: today },
      read: { chunk_hours: listReadHours },
    },
    {
      name: `${volumePrefix}${factory.slice(0, 6)}`,
      function_slug: "uniswap_v3.pool_volume",
      chain_id: 8453,
      params: { swap: { pool_list: { factory } }, by: "day" },
      window: volumeWindow,
    },
  ]);
}

const rowsNamed = (rows, prefix) =>
  Object.entries(rows)
    .filter(([name]) => name.startsWith(prefix))
    .flatMap(([, bindRows]) => bindRows);

const dollar = 10n ** 6n;
const wethPriceBand = [500n, 20000n];
const chartCount = 4;
const rankedShown = 20;
const unrankedShown = 10;
const tokenLabels = new Map([
  [usdc, "USDC"],
  [weth, "WETH"],
  ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "cbBTC"],
]);

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const tokenLabel = (token) => tokenLabels.get(token) ?? shortAddress(token);

export function sidesOf(listed) {
  const usdcSide =
    listed.token0 === usdc ? 0 : listed.token1 === usdc ? 1 : null;
  if (usdcSide === null) return null;
  const otherToken = usdcSide === 0 ? listed.token1 : listed.token0;
  return {
    dollarSide: `volume${usdcSide}`,
    otherSide: `volume${1 - usdcSide}`,
    otherToken,
    pair: `USDC / ${tokenLabel(otherToken)}`,
  };
}

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + dayMs).toISOString().slice(0, 10);

export function days(binds) {
  const { window } = binds.find((bind) => bind.name.startsWith(volumePrefix));
  const all = [];
  for (
    let d = window.from_time.slice(0, 10);
    d < window.to_time.slice(0, 10);
    d = nextDay(d)
  )
    all.push(d);
  return all;
}

export function poolSides(listRows) {
  return new Map(listRows.map((listed) => [listed.pool, sidesOf(listed)]));
}

export function leaderboard(poolRows, sides) {
  const totals = new Map();
  for (const row of poolRows) {
    const side = sides.get(row.pool);
    const total = totals.get(row.pool) ?? {
      pool: row.pool,
      swaps: 0n,
      dollars: side ? 0n : null,
    };
    total.swaps += BigInt(row.swaps);
    if (side) total.dollars += BigInt(row[side.dollarSide]);
    totals.set(row.pool, total);
  }
  const bySizeDescending = (field) => (a, b) =>
    b[field] > a[field] ? 1 : b[field] < a[field] ? -1 : 0;
  const pools = [...totals.values()];
  return {
    ranked: pools
      .filter((entry) => entry.dollars !== null)
      .sort(bySizeDescending("dollars")),
    unranked: pools
      .filter((entry) => entry.dollars === null)
      .sort(bySizeDescending("swaps")),
  };
}

const wethPriceOutsideBand = (row, side) => {
  const [low, high] = wethPriceBand;
  const dollars = BigInt(row[side.dollarSide]) * 10n ** 18n;
  const wethVolume = BigInt(row[side.otherSide]);
  return (
    dollars < low * dollar * wethVolume || dollars > high * dollar * wethVolume
  );
};

export function checkLeaderboard(poolRows, sides, ranked) {
  const usdcPoolsWithRows = new Set(
    poolRows.map((row) => row.pool).filter((pool) => sides.get(pool)),
  );
  if (ranked.length !== usdcPoolsWithRows.size)
    throw new Error(
      `${ranked.length} pools are ranked but ${usdcPoolsWithRows.size} USDC pools have rows.`,
    );
  ranked.forEach((entry, index) => {
    const { dollarSide } = sides.get(entry.pool);
    const summed = poolRows
      .filter((row) => row.pool === entry.pool)
      .reduce((sum, row) => sum + BigInt(row[dollarSide]), 0n);
    if (entry.dollars !== summed)
      throw new Error(
        `${entry.pool} is ranked with ${entry.dollars} but its rows sum to ${summed}.`,
      );
    if (index > 0 && entry.dollars > ranked[index - 1].dollars)
      throw new Error(`${entry.pool} outranks a pool with less dollar volume.`);
  });
}

function checkList(listRows) {
  const pools = new Set(listRows.map((listed) => listed.pool));
  if (pools.size !== listRows.length)
    throw new Error("The pool list names a pool twice.");
  return pools;
}

export function check({ rows }, binds) {
  const window = days(binds);
  const listRows = rowsNamed(rows, listPrefix);
  const listed = checkList(listRows);
  const sides = poolSides(listRows);
  const poolRows = rowsNamed(rows, volumePrefix);
  if (!poolRows.length) throw new Error("No pool volume rows.");
  const seen = new Set();
  let wethDays = 0;
  for (const row of poolRows) {
    if (!window.includes(row.day))
      throw new Error(
        `Row for ${row.pool} on ${row.day} is outside the window.`,
      );
    if (!listed.has(row.pool))
      throw new Error(`${row.pool} traded but is not in the pool list.`);
    if (BigInt(row.swaps) <= 0n)
      throw new Error(`${row.pool} has ${row.swaps} swaps on ${row.day}.`);
    const key = `${row.pool}@${row.day}`;
    if (seen.has(key))
      throw new Error(`Two rows for ${row.pool} on ${row.day}.`);
    seen.add(key);
    const side = sides.get(row.pool);
    if (side?.otherToken !== weth) continue;
    wethDays += 1;
    if (wethPriceOutsideBand(row, side))
      throw new Error(
        `USDC / WETH pool ${shortAddress(row.pool)} on ${row.day} implies a price outside $${wethPriceBand[0]} to $${wethPriceBand[1]} per WETH: the dollar side is misread.`,
      );
  }
  const { ranked } = leaderboard(poolRows, sides);
  checkLeaderboard(poolRows, sides, ranked);
  const total = ranked.reduce((sum, entry) => sum + entry.dollars, 0n);
  return [
    `Every one of the ${poolRows.length} pool-day rows has at least one swap, and every pool that traded is in the ${factories.length} factories' lists of ${listed.size} pools`,
    `All ${wethDays} USDC / WETH pool-days imply a WETH price between $${wethPriceBand[0]} and $${wethPriceBand[1]}, so the USDC side is the one read as dollars`,
    `${ranked.length} ranked pools cover every pool with USDC on one side that traded, are in descending order of USDC volume, and each matches the sum of its rows, ${formatUsd(total)} in total`,
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

const percentOf = (part, whole) =>
  `${whole ? Number((part * 1000n) / whole) / 10 : 0}%`;

function series(poolRows, days, pool, dollarSide) {
  const perDay = new Map(
    poolRows
      .filter((row) => row.pool === pool)
      .map((row) => [row.day, BigInt(row[dollarSide])]),
  );
  return days.map((day) => ({
    day,
    millions: Number((perDay.get(day) ?? 0n) / dollar) / 1e6,
  }));
}

export function shape({ rows }, binds) {
  const window = days(binds);
  const poolRows = rowsNamed(rows, volumePrefix);
  const listRows = rowsNamed(rows, listPrefix);
  const sides = poolSides(listRows);
  const { ranked, unranked } = leaderboard(poolRows, sides);
  const swapsOf = (entries) => entries.reduce((sum, e) => sum + e.swaps, 0n);
  const totalSwaps = swapsOf(ranked) + swapsOf(unranked);
  const totalDollars = ranked.reduce((sum, entry) => sum + entry.dollars, 0n);
  return {
    window: { first: window[0], last: window.at(-1) },
    factories: factories.map(([factory]) => factory),
    listedCount: listRows.length,
    poolCount: ranked.length + unranked.length,
    totalSwaps: totalSwaps.toLocaleString("en-US"),
    totalDollars: formatCompact(totalDollars),
    rankedCount: ranked.length,
    rankedSwapShare: percentOf(swapsOf(ranked), totalSwaps),
    leader: ranked[0] && {
      pair: sides.get(ranked[0].pool).pair,
      volume: formatCompact(ranked[0].dollars),
    },
    charts: ranked.slice(0, chartCount).map((entry) => ({
      symbol: sides.get(entry.pool).pair,
      series: series(
        poolRows,
        window,
        entry.pool,
        sides.get(entry.pool).dollarSide,
      ),
    })),
    rankedPools: ranked.slice(0, rankedShown).map((entry, index) => ({
      rank: String(index + 1),
      pool: shortAddress(entry.pool),
      pair: sides.get(entry.pool).pair,
      swaps: entry.swaps.toLocaleString("en-US"),
      volume: formatUsd(entry.dollars),
    })),
    unrankedCount: unranked.length,
    unrankedPools: unranked.slice(0, unrankedShown).map((entry) => ({
      pool: shortAddress(entry.pool),
      swaps: entry.swaps.toLocaleString("en-US"),
    })),
  };
}
