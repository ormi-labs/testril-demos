const dayMs = 86400000;
const poolListChunkHours = 1440;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const untilToday = (ms) => ({
    from_time: isoSecond(today - ms),
    to_time: isoSecond(today),
  });
  return [
    {
      name: "cl-volume",
      function_slug: "pancakeswap_infinity.cl_pool_volume",
      chain_id: 56,
      params: {
        swap: { manager: "0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b" },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "cl-pools",
      function_slug: "pancakeswap_infinity.cl_pool_list",
      chain_id: 56,
      params: { manager: "0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b" },
      window: {
        from_time: "2025-03-06T01:28:31Z",
        to_time: isoSecond(today),
      },
      read: { chunk_hours: poolListChunkHours },
    },
    {
      name: "bin-volume",
      function_slug: "pancakeswap_infinity.bin_pool_volume",
      chain_id: 56,
      params: {
        swap: { manager: "0xc697d2898e0d09264376196696c51d7abbbaa4a9" },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "bin-pools",
      function_slug: "pancakeswap_infinity.bin_pool_list",
      chain_id: 56,
      params: { manager: "0xc697d2898e0d09264376196696c51d7abbbaa4a9" },
      window: {
        from_time: "2025-03-06T01:29:55Z",
        to_time: isoSecond(today),
      },
      read: { chunk_hours: poolListChunkHours },
    },
    {
      name: "v4-volume",
      function_slug: "uniswap_v4.pool_volume",
      chain_id: 56,
      params: {
        swap: { manager: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df" },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "v4-pools",
      function_slug: "uniswap_v4.pool_list",
      chain_id: 56,
      params: { manager: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df" },
      window: {
        from_time: "2025-01-21T20:58:44Z",
        to_time: isoSecond(today),
      },
      read: { chunk_hours: poolListChunkHours },
    },
  ];
}

export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const stablecoins = new Map([
  ["0x55d398326f99059ff775485246999027b3197955", "USDT"],
  ["0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", "USDC"],
  ["0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d", "USD1"],
  ["0xc5f0f7b66764f6ec8c8dff7ba683102295e16409", "FDUSD"],
]);
export const symbols = new Map([
  ...stablecoins,
  [zeroAddress, "BNB"],
  ["0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", "WBNB"],
  ["0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", "CAKE"],
]);
const decimals = 18n;
const topHookPools = 10;

export const venues = [
  {
    key: "cl",
    dex: "PancakeSwap Infinity",
    name: "PancakeSwap Infinity CL",
    manager: "0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b",
  },
  {
    key: "bin",
    dex: "PancakeSwap Infinity",
    name: "PancakeSwap Infinity Bin",
    manager: "0xc697d2898e0d09264376196696c51d7abbbaa4a9",
  },
  {
    key: "v4",
    dex: "Uniswap v4",
    name: "Uniswap v4",
    manager: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
  },
].map((venue) => ({
  ...venue,
  volumeBind: `${venue.key}-volume`,
  poolsBind: `${venue.key}-pools`,
}));

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + dayMs).toISOString().slice(0, 10);

const utcDay = (time) => time.slice(0, 10);

export function windowDays(binds) {
  const { window } = binds.find((bind) => bind.name === "cl-volume");
  const days = [];
  for (
    let d = utcDay(window.from_time);
    d < utcDay(window.to_time);
    d = nextDay(d)
  )
    days.push(d);
  return days;
}

const isHooked = (pool) => BigInt(pool.hooks) !== 0n;
const isHookless = (pool) => pool.hooks === zeroAddress;

function stableLegVolume(pool, row) {
  if (stablecoins.has(pool.currency0)) return BigInt(row.volume0);
  if (stablecoins.has(pool.currency1)) return BigInt(row.volume1);
  return 0n;
}

const isStablePair = (pool) =>
  stablecoins.has(pool.currency0) && stablecoins.has(pool.currency1);
const legsDisagree = (row) => {
  const [volume0, volume1] = [BigInt(row.volume0), BigInt(row.volume1)];
  const gap = volume0 > volume1 ? volume0 - volume1 : volume1 - volume0;
  return gap * 100n > volume0;
};
const hooklessWithRegistration = (pool) =>
  pool.hooks_registration !== undefined &&
  isHookless(pool) &&
  BigInt(pool.hooks_registration) !== 0n;

function poolsById(rows, venue) {
  const pools = new Map();
  for (const pool of rows[venue.poolsBind]) {
    if (pools.has(pool.pool))
      throw new Error(`${venue.name} lists pool ${pool.pool} twice.`);
    pools.set(pool.pool, pool);
  }
  for (const row of rows[venue.volumeBind])
    if (!pools.has(row.pool))
      throw new Error(
        `${venue.name} has volume for pool ${row.pool}, which is not in its pool list.`,
      );
  return pools;
}

export const poolMaps = (rows) =>
  new Map(venues.map((venue) => [venue.key, poolsById(rows, venue)]));

function sumRows(volumeRows, pools, include = () => true) {
  const total = { swaps: 0n, stable: 0n };
  for (const row of volumeRows) {
    const pool = pools.get(row.pool);
    if (!include(pool)) continue;
    total.swaps += BigInt(row.swaps);
    total.stable += stableLegVolume(pool, row);
  }
  return total;
}

function checkPartition(pools, venue) {
  for (const pool of pools.values())
    if (isHooked(pool) === isHookless(pool))
      throw new Error(
        `${venue.name} pool ${pool.pool}: hooks ${pool.hooks} count as ${isHooked(pool) ? "both hooked and hookless" : "neither hooked nor hookless"}.`,
      );
}

function checkVenue(rows, pools, venue, days) {
  const seen = new Set();
  for (const row of rows[venue.volumeBind]) {
    if (!days.includes(row.day))
      throw new Error(
        `${venue.name} has a row for ${row.day}, outside the window.`,
      );
    const key = `${row.pool}/${row.day}`;
    if (seen.has(key))
      throw new Error(
        `${venue.name} has two rows for pool ${row.pool} on ${row.day}.`,
      );
    seen.add(key);
    const pool = pools.get(row.pool);
    if (isStablePair(pool) && isHookless(pool) && legsDisagree(row))
      throw new Error(
        `${venue.name} pool ${row.pool} on ${row.day}: the two stablecoin legs differ by more than 1%.`,
      );
  }
  for (const pool of pools.values())
    if (hooklessWithRegistration(pool))
      throw new Error(
        `${venue.name} pool ${pool.pool}: zero hooks contradict hooks_registration ${pool.hooks_registration}.`,
      );
  checkPartition(pools, venue);
  return seen.size;
}

export function check({ rows }, binds) {
  const days = windowDays(binds);
  const pools = poolMaps(rows);
  return venues.map((venue) => {
    const venuePools = pools.get(venue.key);
    const count = checkVenue(rows, venuePools, venue, days);
    const registered = [...venuePools.values()].some(
      (pool) => pool.hooks_registration !== undefined,
    );
    return `${venue.name}: ${count} pool-day rows over ${days.length} days all belong to the ${venuePools.size} listed pools, every pool is exactly one of hooked or hookless, so on each day hooked plus hookless volume equals the total, hookless stablecoin pairs trade equal legs${registered ? ", and hookless pools have zero hooks_registration" : ""}`;
  });
}

export function formatCompact(raw) {
  const dollars = Number(raw / 10n ** decimals);
  if (dollars < 1e3) return `$${dollars.toFixed(2)}`;
  const [scale, suffix] =
    dollars >= 1e9 ? [1e9, "B"] : dollars >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `$${(dollars / scale).toFixed(2)}${suffix}`;
}

const percent = (part, whole) =>
  whole === 0n
    ? "0.0%"
    : `${(Number((part * 1000n) / whole) / 10).toFixed(1)}%`;

const shortHex = (hex) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
const symbol = (address) => symbols.get(address) ?? shortHex(address);

function venueSummary(rows, venue, pools) {
  const all = sumRows(rows[venue.volumeBind], pools);
  const hooked = sumRows(rows[venue.volumeBind], pools, isHooked);
  const active = new Set(rows[venue.volumeBind].map((row) => row.pool));
  const view = {
    name: venue.name,
    dex: venue.dex,
    activePools: active.size,
    activeHookedPools: [...active].filter((id) => isHooked(pools.get(id)))
      .length,
    hookedShare: percent(hooked.stable, all.stable),
    hookedMillions: Number(hooked.stable / 10n ** decimals) / 1e6,
    hooklessMillions:
      Number((all.stable - hooked.stable) / 10n ** decimals) / 1e6,
  };
  return { view, all, hooked };
}

function dexSummaries(summaries) {
  return [...new Set(summaries.map((s) => s.view.dex))].map((dex) => {
    const own = summaries.filter((s) => s.view.dex === dex);
    const sum = (pick) => own.reduce((total, s) => total + pick(s), 0n);
    const total = sum((s) => s.all.stable);
    const hooked = sum((s) => s.hooked.stable);
    return {
      dex,
      total: formatCompact(total),
      hooked: formatCompact(hooked),
      hookedShare: percent(hooked, total),
      activeHookedPools: own.reduce((n, s) => n + s.view.activeHookedPools, 0),
      activePools: own.reduce((n, s) => n + s.view.activePools, 0),
    };
  });
}

function topHooked(rows, poolMaps) {
  const ranked = venues.flatMap((venue) => {
    const pools = poolMaps.get(venue.key);
    const totals = new Map();
    for (const row of rows[venue.volumeBind]) {
      const pool = pools.get(row.pool);
      if (!isHooked(pool)) continue;
      const entry = totals.get(row.pool) ?? {
        venue,
        pool,
        swaps: 0n,
        stable: 0n,
      };
      entry.swaps += BigInt(row.swaps);
      entry.stable += stableLegVolume(pool, row);
      totals.set(row.pool, entry);
    }
    return [...totals.values()];
  });
  return ranked
    .sort((a, b) => (b.stable > a.stable ? 1 : b.stable < a.stable ? -1 : 0))
    .slice(0, topHookPools)
    .map(({ venue, pool, swaps, stable }) => ({
      venue: venue.name,
      pair: `${symbol(pool.currency0)}/${symbol(pool.currency1)}`,
      pool: shortHex(pool.pool),
      hooks: shortHex(pool.hooks),
      swaps: swaps.toString(),
      stable: stable === 0n ? "no stablecoin leg" : formatCompact(stable),
    }));
}

export function shape({ rows }, binds) {
  const days = windowDays(binds);
  const pools = poolMaps(rows);
  const summaries = venues.map((venue) =>
    venueSummary(rows, venue, pools.get(venue.key)),
  );
  return {
    dayWindow: { first: days[0], last: days.at(-1) },
    venues: summaries.map((s) => s.view),
    dexes: dexSummaries(summaries),
    hookedPools: topHooked(rows, pools),
  };
}
