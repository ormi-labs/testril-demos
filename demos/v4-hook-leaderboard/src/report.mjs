const dayMs = 86400000;
const managerCreatedAt = "2025-01-23T16:16:47Z";
const listChunkHours = 336;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const untilToday = (ms) => ({
    from_time: isoSecond(today - ms),
    to_time: isoSecond(today),
  });
  return [
    {
      name: "pools",
      function_slug: "uniswap_v4.pool_list",
      chain_id: 1,
      params: { manager },
      window: { from_time: managerCreatedAt, to_time: isoSecond(today) },
      read: { chunk_hours: listChunkHours },
    },
    {
      name: "volume",
      function_slug: "uniswap_v4.pool_volume",
      chain_id: 1,
      params: {
        swap: { manager },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "arrakis-hooks",
      function_slug: "arrakis.hook_list",
      chain_id: 1,
      params: { factory: arrakisFactory },
      window: { from_time: managerCreatedAt, to_time: isoSecond(today) },
      read: { chunk_hours: listChunkHours },
    },
  ];
}

export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const manager = "0x000000000004444c5dc75cb358380d2e3de08a90";
export const arrakisFactory = "0xef129a430032c8183aba158c1a70799e3b840df9";
export const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const usdt = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const stablecoins = new Set([usdc, usdt]);
const stablecoinDecimals = 10n ** 6n;
const listedHooks = 12;
const chartedHooks = 10;

const sum = (values) => values.reduce((total, value) => total + value, 0n);
const compareBigIntDesc = (a, b) => (a > b ? -1 : a < b ? 1 : 0);

function lowercased(rows) {
  return {
    ...rows,
    pools: rows.pools.map((pool) => ({
      ...pool,
      pool: pool.pool.toLowerCase(),
      currency0: pool.currency0.toLowerCase(),
      currency1: pool.currency1.toLowerCase(),
      hooks: pool.hooks.toLowerCase(),
    })),
    volume: rows.volume.map((row) => ({
      ...row,
      pool: row.pool.toLowerCase(),
    })),
    "arrakis-hooks": rows["arrakis-hooks"].map((row) => ({
      ...row,
      hook: row.hook.toLowerCase(),
    })),
  };
}

function stablecoinSide(pool) {
  if (stablecoins.has(pool.currency0)) return "volume0";
  if (stablecoins.has(pool.currency1)) return "volume1";
  return null;
}

export function volumeDays(binds) {
  const { window } = binds.find((bind) => bind.name === "volume");
  const days = [];
  for (
    let day = Date.parse(window.from_time);
    day < Date.parse(window.to_time);
    day += dayMs
  )
    days.push(new Date(day).toISOString().slice(0, 10));
  return days;
}

function stablecoinVolume(pool, row) {
  const side = stablecoinSide(pool);
  return side ? BigInt(row[side]) : 0n;
}

function poolTotals(rows) {
  const totals = new Map();
  for (const row of rows.volume) {
    const total = totals.get(row.pool) ?? { swaps: 0n, volume: [] };
    total.swaps += BigInt(row.swaps);
    total.volume.push(row);
    totals.set(row.pool, total);
  }
  return totals;
}

export function hookTotals(rows) {
  const totals = poolTotals(rows);
  const hooks = new Map();
  for (const pool of rows.pools) {
    const own = totals.get(pool.pool);
    if (!own) continue;
    const hook = hooks.get(pool.hooks) ?? {
      hook: pool.hooks,
      pools: 0n,
      swaps: 0n,
      volume: 0n,
    };
    hook.pools += 1n;
    hook.swaps += own.swaps;
    hook.volume += sum(own.volume.map((row) => stablecoinVolume(pool, row)));
    hooks.set(pool.hooks, hook);
  }
  return [...hooks.values()].sort((a, b) =>
    compareBigIntDesc(a.swaps, b.swaps),
  );
}

export function check(listed, binds) {
  const rows = lowercased(listed);
  const known = new Set(rows.pools.map((pool) => pool.pool));
  const unknown = rows.volume.find((row) => !known.has(row.pool));
  if (unknown)
    throw new Error(`Volume pool ${unknown.pool} is not in pool_list.`);
  const days = volumeDays(binds);
  const outside = rows.volume.find((row) => !days.includes(row.day));
  if (outside)
    throw new Error(`Volume day ${outside.day} is outside the window.`);
  const hooks = hookTotals(rows);
  const totalSwaps = sum(rows.volume.map((row) => BigInt(row.swaps)));
  const hookSwaps = sum(hooks.map((hook) => hook.swaps));
  if (hookSwaps !== totalSwaps)
    throw new Error(
      `Hooks add up to ${hookSwaps} swaps, but the pools' volume rows total ${totalSwaps}.`,
    );
  const arrakisHooks = arrakisHookSet(rows);
  if (arrakisHooks.has(zeroAddress))
    throw new Error("The Arrakis hook list contains the zero address.");
  const unhooked = hooks.find((hook) => hook.hook === zeroAddress);
  return [
    `All ${new Set(rows.volume.map((row) => row.pool)).size} pools with volume are in pool_list`,
    `Hooks add up to ${hookSwaps} swaps, the same as the volume rows`,
    `${unhooked?.pools ?? 0n} pools with volume at the zero address are shown as No hook`,
  ];
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const grouped = (value) => value.toLocaleString("en-US");

export function formatCompact(raw) {
  if (raw === 0n) return "—";
  const dollars = Number(raw / stablecoinDecimals);
  if (dollars < 1e3) return `$${dollars}`;
  const [scale, suffix] =
    dollars >= 1e9 ? [1e9, "B"] : dollars >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `$${(dollars / scale).toFixed(2)}${suffix}`;
}

const arrakisHookSet = (rows) =>
  new Set(rows["arrakis-hooks"].map((row) => row.hook));

function hookLabel(hook, arrakisHooks) {
  if (hook === zeroAddress) return "No hook";
  return arrakisHooks.has(hook) ? "Arrakis" : "Unlabelled";
}

export function shape(listed, binds) {
  const days = volumeDays(binds);
  const rows = lowercased(listed);
  const arrakisHooks = arrakisHookSet(rows);
  const hooks = hookTotals(rows);
  const totalSwaps = sum(hooks.map((hook) => hook.swaps));
  const hooked = hooks.filter((hook) => hook.hook !== zeroAddress);
  const hookedSwaps = sum(hooked.map((hook) => hook.swaps));
  const arrakis = hooked.filter((hook) => arrakisHooks.has(hook.hook));
  return {
    volumeDays: { first: days[0], last: days.at(-1) },
    poolsSince: managerCreatedAt.slice(0, 10),
    manager,
    totalSwaps: grouped(totalSwaps),
    totalVolume: formatCompact(sum(hooks.map((hook) => hook.volume))),
    hookedShare:
      totalSwaps === 0n
        ? "—"
        : `${((Number(hookedSwaps) / Number(totalSwaps)) * 100).toFixed(1)}%`,
    hookCount: String(hooked.length),
    arrakisCount: String(arrakis.length),
    arrakisSwaps: grouped(sum(arrakis.map((hook) => hook.swaps))),
    hooks: hooks.slice(0, listedHooks).map((hook) => ({
      hook: hook.hook,
      address: hook.hook === zeroAddress ? "—" : shortAddress(hook.hook),
      label: hookLabel(hook.hook, arrakisHooks),
      pools: hook.pools.toString(),
      swaps: grouped(hook.swaps),
      volume: formatCompact(hook.volume),
      swapCount: Number(hook.swaps),
    })),
    chartedHooks,
  };
}
