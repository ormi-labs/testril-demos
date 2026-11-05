const dayMs = 86400000;
const managerCreatedAt = "2025-01-23T16:16:47Z";
const tickChunkHours = 672;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
export const manager = "0x000000000004444c5dc75cb358380d2e3de08a90";
export const pool =
  "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27";

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  return [
    {
      name: "ticks",
      function_slug: "uniswap_v4.tick",
      chain_id: 1,
      params: { manager, pool },
      window: { from_time: managerCreatedAt, to_time: isoSecond(today) },
      read: { chunk_hours: tickChunkHours },
    },
    {
      name: "pool-state",
      function_slug: "uniswap_v4.pool_state",
      chain_id: 1,
      params: { manager, pool, by: "day" },
      window: {
        from_time: isoSecond(today - dayMs),
        to_time: isoSecond(today),
      },
    },
  ];
}

export const stateDayOf = (binds) =>
  binds
    .find((bind) => bind.name === "pool-state")
    .window.from_time.slice(0, 10);
const decimalsGap = 1e12;
const barTicks = 100;
const barCount = 60;
const tableRows = 12;
const feeUnitsPerPercent = 10000;
const q192 = 2n ** 192n;

export function finalTicks(tickRows) {
  const latest = new Map();
  for (const row of tickRows) {
    const tick = BigInt(row.tick);
    if (!latest.has(tick) || row.block > latest.get(tick).block)
      latest.set(tick, row);
  }
  return [...latest]
    .map(([tick, row]) => ({
      tick,
      gross: BigInt(row.liquidity_gross),
      net: BigInt(row.liquidity_net),
    }))
    .sort((a, b) => (a.tick < b.tick ? -1 : 1));
}

export function liquidityAt(ticks, tick) {
  return ticks
    .filter((entry) => entry.tick <= tick)
    .reduce((sum, entry) => sum + entry.net, 0n);
}

function poolStateRow(rows, stateDay) {
  const row = rows["pool-state"].find((entry) => entry.day === stateDay);
  if (!row) throw new Error(`Pool state is missing ${stateDay}.`);
  return row;
}

export function check({ rows, reads }, binds) {
  const stateDay = stateDayOf(binds);
  const stray = [...rows.ticks, ...rows["pool-state"]].find(
    (row) => row.pool !== pool,
  );
  if (stray) throw new Error(`Row for pool ${stray.pool} is not ${pool}.`);
  const outside = rows.ticks.find(
    (row) =>
      !reads.ticks.some(
        (read) => row.block >= read.from_block && row.block < read.to_block,
      ),
  );
  if (outside)
    throw new Error(
      `Tick row at block ${outside.block} is outside the window.`,
    );
  const ticks = finalTicks(rows.ticks);
  const overdrawn = ticks.find(
    (entry) => (entry.net < 0n ? -entry.net : entry.net) > entry.gross,
  );
  if (overdrawn)
    throw new Error(
      `Tick ${overdrawn.tick} has net ${overdrawn.net} beyond gross ${overdrawn.gross}.`,
    );
  const total = ticks.reduce((sum, entry) => sum + entry.net, 0n);
  if (total !== 0n)
    throw new Error(`Net liquidity across all ticks is ${total}, not 0.`);
  const state = poolStateRow(rows, stateDay);
  const summed = liquidityAt(ticks, BigInt(state.tick));
  if (summed !== BigInt(state.liquidity))
    throw new Error(
      `Net liquidity summed up to tick ${state.tick} is ${summed}, but the pool's in-range liquidity is ${state.liquidity}.`,
    );
  return [
    `No tick holds more net than gross liquidity across ${ticks.length} ticks`,
    "Net liquidity over all ticks sums to 0, as every position adds and removes the same amount",
    `Net liquidity summed from the lowest tick to tick ${state.tick} (${summed}) equals the pool's in-range liquidity on ${stateDay}`,
  ];
}

const usd = (price) =>
  `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const tickPrice = (tick) => usd(1.0001 ** Number(tick) * decimalsGap);

function sqrtPriceUsd(sqrtPriceX96) {
  const cents = (sqrtPriceX96 ** 2n * 10n ** 14n) / q192;
  const whole = (cents / 100n).toLocaleString("en-US");
  return `$${whole}.${String(cents % 100n).padStart(2, "0")}`;
}

const units = [
  [10n ** 12n, "T"],
  [10n ** 9n, "B"],
  [10n ** 6n, "M"],
  [10n ** 3n, "K"],
];

export function formatLiquidity(raw, signed = false) {
  const abs = raw < 0n ? -raw : raw;
  const sign = raw < 0n ? "−" : signed ? "+" : "";
  const [scale, suffix] = units.find(([size]) => abs >= size) ?? [1n, ""];
  const hundredths = (abs * 100n) / scale;
  const fraction = String(hundredths % 100n).padStart(2, "0");
  return `${sign}${hundredths / 100n}.${fraction}${suffix}`;
}

function bars(ticks, currentTick) {
  const first =
    currentTick -
    (currentTick % BigInt(barTicks)) -
    BigInt((barCount / 2) * barTicks);
  const starts = Array.from(
    { length: barCount },
    (_, i) => first + BigInt(i * barTicks),
  );
  const levels = starts.map((start) => liquidityAt(ticks, start));
  const tallest = levels.reduce((a, b) => (b > a ? b : a), 1n);
  const span = BigInt(barCount * barTicks);
  return {
    bars: starts.map((start, i) => ({
      fromTick: start.toString(),
      price: tickPrice(start),
      liquidity: formatLiquidity(levels[i]),
      height: Number((levels[i] * 1000n) / tallest) / 1000,
    })),
    marker: Number(((currentTick - first) * 1000n) / span) / 1000,
  };
}

function side(tick, currentTick) {
  if (tick === currentTick) return "at price";
  return tick < currentTick ? "below price" : "above price";
}

export function shape({ rows }, binds) {
  const stateDay = stateDayOf(binds);
  const state = poolStateRow(rows, stateDay);
  const ticks = finalTicks(rows.ticks);
  const currentTick = BigInt(state.tick);
  const initialized = ticks.filter((entry) => entry.gross > 0n);
  const byGross = [...initialized].sort((a, b) =>
    b.gross > a.gross ? 1 : b.gross < a.gross ? -1 : 0,
  );
  return {
    pool: {
      pair: "ETH/USDC",
      id: pool,
      manager,
      fee: `${Number(state.lp_fee) / feeUnitsPerPercent}%`,
    },
    ticksSince: managerCreatedAt.slice(0, 10),
    stateDay,
    price: sqrtPriceUsd(BigInt(state.sqrt_price_x96)),
    currentTick: state.tick,
    liquidity: formatLiquidity(BigInt(state.liquidity)),
    initializedTicks: initialized.length.toString(),
    ...bars(ticks, currentTick),
    ticks: byGross.slice(0, tableRows).map((entry) => ({
      tick: entry.tick.toString(),
      price: tickPrice(entry.tick),
      gross: formatLiquidity(entry.gross),
      net: formatLiquidity(entry.net, true),
      side: side(entry.tick, currentTick),
    })),
  };
}
