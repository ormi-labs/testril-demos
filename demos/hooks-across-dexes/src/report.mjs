import spec from "../testril.json" with { type: "json" };

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

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const dayWindow = binds["cl-volume"].window;
export const venues = [
  { key: "cl", dex: "PancakeSwap Infinity", name: "PancakeSwap Infinity CL" },
  { key: "bin", dex: "PancakeSwap Infinity", name: "PancakeSwap Infinity Bin" },
  { key: "v4", dex: "Uniswap v4", name: "Uniswap v4" },
].map((venue) => ({
  ...venue,
  volumeBind: `${venue.key}-volume`,
  poolsBind: `${venue.key}-pools`,
  manager: binds[`${venue.key}-volume`].params.swap.manager,
}));

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export function windowDays() {
  const days = [];
  for (let d = dayWindow.from_day; d < dayWindow.to_day; d = nextDay(d))
    days.push(d);
  return days;
}

const isHooked = (pool) => pool.hooks !== zeroAddress;

function stableLegVolume(pool, row) {
  if (stablecoins.has(pool.currency0)) return BigInt(row.volume0);
  if (stablecoins.has(pool.currency1)) return BigInt(row.volume1);
  return 0n;
}

function poolsById(rows, venue) {
  const pools = new Map();
  for (const pool of rows[venue.poolsBind]) {
    if (pools.has(pool.pool))
      throw new Error(`${venue.name} lists pool ${pool.pool} twice.`);
    pools.set(pool.pool, pool);
  }
  return pools;
}

function sumRows(rows, venue, pools, include = () => true) {
  const total = { swaps: 0n, stable: 0n };
  for (const row of rows[venue.volumeBind]) {
    const pool = pools.get(row.pool);
    if (!include(pool)) continue;
    total.swaps += BigInt(row.swaps);
    total.stable += stableLegVolume(pool, row);
  }
  return total;
}

function checkVenue(rows, venue, days) {
  const pools = poolsById(rows, venue);
  const seen = new Set();
  for (const row of rows[venue.volumeBind]) {
    if (!pools.has(row.pool))
      throw new Error(
        `${venue.name} has volume for pool ${row.pool}, which is not in its pool list.`,
      );
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
  }
  for (const day of days) {
    const dayRows = {
      [venue.volumeBind]: rows[venue.volumeBind].filter((r) => r.day === day),
    };
    const total = sumRows(dayRows, venue, pools);
    const hooked = sumRows(dayRows, venue, pools, isHooked);
    const hookless = sumRows(dayRows, venue, pools, (pool) => !isHooked(pool));
    if (
      hooked.swaps + hookless.swaps !== total.swaps ||
      hooked.stable + hookless.stable !== total.stable
    )
      throw new Error(
        `${venue.name} on ${day}: hooked plus hookless is not the total.`,
      );
  }
  return { pools: pools.size, rows: seen.size };
}

export function check(rows) {
  const days = windowDays();
  return venues.map((venue) => {
    const { pools, rows: count } = checkVenue(rows, venue, days);
    return `${venue.name}: ${count} pool-day rows over ${days.length} days all belong to the ${pools} listed pools, and hooked plus hookless equals the total each day`;
  });
}

export function formatCompact(raw) {
  const dollars = Number(raw / 10n ** decimals);
  const [scale, suffix] =
    dollars >= 1e9 ? [1e9, "B"] : dollars >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `$${(dollars / scale).toFixed(2)}${suffix}`;
}

const percent = (part, whole) =>
  whole === 0n
    ? "0.0%"
    : `${(Number((part * 1000n) / whole) / 10).toFixed(1)}%`;
const share = (part, whole) =>
  whole === 0n ? 0 : Number((part * 1000n) / whole) / 1000;

const shortHex = (hex) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
const symbol = (address) => symbols.get(address) ?? shortHex(address);

function venueSummary(rows, venue) {
  const pools = poolsById(rows, venue);
  const all = sumRows(rows, venue, pools);
  const hooked = sumRows(rows, venue, pools, isHooked);
  const active = new Set(rows[venue.volumeBind].map((row) => row.pool));
  const view = {
    name: venue.name,
    dex: venue.dex,
    pools: pools.size,
    activePools: active.size,
    activeHookedPools: [...active].filter((id) => isHooked(pools.get(id)))
      .length,
    swaps: all.swaps.toString(),
    hookedSwaps: hooked.swaps.toString(),
    stable: formatCompact(all.stable),
    hookedStable: formatCompact(hooked.stable),
    hooklessStable: formatCompact(all.stable - hooked.stable),
    hookedShare: percent(hooked.stable, all.stable),
    hookedFraction: share(hooked.stable, all.stable),
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

function topHooked(rows) {
  const ranked = venues.flatMap((venue) => {
    const pools = poolsById(rows, venue);
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

export function shape(rows) {
  const summaries = venues.map((venue) => venueSummary(rows, venue));
  return {
    dayWindow,
    venues: summaries.map((s) => s.view),
    dexes: dexSummaries(summaries),
    hookedPools: topHooked(rows),
  };
}
