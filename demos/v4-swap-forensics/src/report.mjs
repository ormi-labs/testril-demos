const dayMs = 86400000;
const hourMs = 3600000;
const hoursPerDay = 24;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
export const manager = "0x000000000004444c5dc75cb358380d2e3de08a90";
export const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const usdt = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const hourName = (hour) => String(hour).padStart(2, "0");

export function bindsAt(now = Date.now()) {
  const yesterday = Math.floor(now / dayMs) * dayMs - dayMs;
  const between = (from, to) => ({
    from_time: isoSecond(from),
    to_time: isoSecond(to),
  });
  const hourly = (prefix, function_slug) =>
    Array.from({ length: hoursPerDay }, (_, hour) => ({
      name: `${prefix}-${hourName(hour)}`,
      function_slug,
      chain_id: 1,
      params: { manager },
      window: between(
        yesterday + hour * hourMs,
        yesterday + (hour + 1) * hourMs,
      ),
    }));
  return [
    ...hourly("swaps", "uniswap_v4.swap"),
    ...hourly("liquidity", "uniswap_v4.modify_liquidity"),
    {
      name: "tokens",
      function_slug: "erc20.token_metadata",
      chain_id: 1,
      params: { tokens: [usdc, usdt], by: "day" },
      window: between(yesterday, yesterday + dayMs),
    },
  ];
}

export const dayOf = (binds) =>
  binds.find((bind) => bind.name === "tokens").window.from_time.slice(0, 10);

export function unpack(rows, binds) {
  const hourly = (prefix) =>
    binds
      .filter((bind) => bind.name.startsWith(`${prefix}-`))
      .flatMap((bind, hour) =>
        rows[bind.name].map((row) => ({ ...row, hour })),
      );
  return {
    swaps: hourly("swaps"),
    liquidity: hourly("liquidity"),
    tokens: rows.tokens,
  };
}

export const knownPools = [
  {
    id: "0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d",
    label: "ETH/USDC 0.05%",
    currency0: "ETH",
    currency1: usdc,
  },
];
const listedSwaps = 15;
const explorer = "https://etherscan.io/tx/";

const order = (a, b) =>
  a.block - b.block || Number(BigInt(a.log_index) - BigInt(b.log_index));
const sign = (raw) => {
  const value = BigInt(raw);
  return value > 0n ? 1 : value < 0n ? -1 : 0;
};
const sells0 = (swap) => sign(swap.amount0) > 0;
const sameBlockPool = (a, b) => a.block === b.block && a.pool === b.pool;

export function jitEvents({ swaps, liquidity }) {
  const events = [];
  for (const add of liquidity.filter(
    (row) => BigInt(row.liquidity_delta) > 0n,
  )) {
    const remove = liquidity.find(
      (row) =>
        sameBlockPool(row, add) &&
        row.sender === add.sender &&
        row.salt === add.salt &&
        row.tick_lower === add.tick_lower &&
        row.tick_upper === add.tick_upper &&
        BigInt(row.liquidity_delta) === -BigInt(add.liquidity_delta) &&
        order(add, row) < 0,
    );
    const swap = swaps
      .filter(
        (row) =>
          remove &&
          sameBlockPool(row, add) &&
          order(add, row) < 0 &&
          order(row, remove) < 0,
      )
      .sort(order)[0];
    if (swap) events.push({ add, swap, remove });
  }
  return events.sort((a, b) => order(a.add, b.add));
}

export function sandwiches({ swaps }) {
  const found = [];
  const ordered = [...swaps].sort(order);
  const lastBySender = new Map();
  ordered.forEach((swap, index) => {
    const key = `${swap.block}:${swap.pool}:${swap.sender}`;
    const front = lastBySender.get(key);
    lastBySender.set(key, index);
    if (front === undefined) return;
    const frontSwap = ordered[front];
    const victim = ordered
      .slice(front + 1, index)
      .find((row) => sameBlockPool(row, swap) && row.sender !== swap.sender);
    if (victim && sells0(frontSwap) !== sells0(swap))
      found.push({ front: frontSwap, victim, back: swap });
  });
  return found;
}

function checkSwapDirection(swaps) {
  const lastPrice = new Map();
  for (const swap of [...swaps].sort(order)) {
    if (sign(swap.amount0) * sign(swap.amount1) !== -1)
      throw new Error(
        `Swap ${swap.tx} moved ${swap.amount0} and ${swap.amount1}; a swap pays one currency and receives the other.`,
      );
    const price = BigInt(swap.sqrt_price_x96);
    const before = lastPrice.get(swap.pool);
    lastPrice.set(swap.pool, price);
    if (before === undefined) continue;
    if (sells0(swap) ? price > before : price < before)
      throw new Error(
        `Swap ${swap.tx} ${sells0(swap) ? "sells" : "buys"} currency0, so the price must ${sells0(swap) ? "fall" : "rise"}, but it went ${before} → ${price}.`,
      );
  }
}

function checkJitLiquidity(events) {
  for (const { add, swap } of events) {
    const inRange =
      BigInt(add.tick_lower) <= BigInt(swap.tick) &&
      BigInt(swap.tick) < BigInt(add.tick_upper);
    if (inRange && BigInt(swap.liquidity) < BigInt(add.liquidity_delta))
      throw new Error(
        `Swap ${swap.tx} reports liquidity ${swap.liquidity}, less than the ${add.liquidity_delta} added in range before it.`,
      );
  }
}

function requireBlocksInHourOrder(rows) {
  const latestByHour = [];
  for (const row of rows)
    latestByHour[row.hour] = Math.max(latestByHour[row.hour] ?? 0, row.block);
  for (const row of rows) {
    const earlier = latestByHour
      .slice(0, row.hour)
      .reduce((most, block) => Math.max(most, block ?? 0), 0);
    if (row.block <= earlier)
      throw new Error(
        `Row at block ${row.block} is in hour ${row.hour} but an earlier hour already reached block ${earlier}.`,
      );
  }
}

export function check(fetched, binds) {
  const rows = unpack(fetched, binds);
  const { swaps, liquidity } = rows;
  requireBlocksInHourOrder([...swaps, ...liquidity]);
  const positions = new Set(
    [...swaps, ...liquidity].map((row) => `${row.block}:${row.log_index}`),
  );
  if (positions.size !== swaps.length + liquidity.length)
    throw new Error("Two rows share a block and log index.");
  checkSwapDirection(swaps);
  const jit = jitEvents(rows);
  checkJitLiquidity(jit);
  const quote = rows.tokens.find((row) => row.token === usdc);
  if (quote?.decimals !== "6")
    throw new Error("USDC metadata is missing or not 6 decimals.");
  return [
    `Every one of ${swaps.length} swaps pays one currency and receives the other`,
    `Price after each swap moves the way its amounts say, across ${new Set(swaps.map((s) => s.pool)).size} pools`,
    `${jit.length} JIT adds are covered by the liquidity the swap reports`,
  ];
}

const shortHash = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const tx = (hash) => ({ hash: shortHash(hash), url: `${explorer}${hash}` });

export function formatUsd(raw, decimals) {
  const scale = 10n ** BigInt(decimals);
  const cents = (raw * 100n + scale / 2n) / scale;
  return `$${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
}

const poolName = (pool) =>
  knownPools.find((known) => known.id === pool)?.label ?? shortAddress(pool);

function biggestSwaps(swaps, quoteDecimals) {
  return swaps
    .flatMap((swap) => {
      const pool = knownPools.find((known) => known.id === swap.pool);
      if (!pool) return [];
      const quoteAmount = BigInt(swap.amount1);
      return [
        { swap, pool, size: quoteAmount < 0n ? -quoteAmount : quoteAmount },
      ];
    })
    .sort((a, b) => (b.size > a.size ? 1 : b.size < a.size ? -1 : 0))
    .slice(0, listedSwaps)
    .map(({ swap, pool, size }, index) => ({
      rank: String(index + 1),
      tx: tx(swap.tx),
      block: String(swap.block),
      pool: pool.label,
      direction: sells0(swap)
        ? `${pool.currency0} → USDC`
        : `USDC → ${pool.currency0}`,
      sender: shortAddress(swap.sender),
      size: formatUsd(size, quoteDecimals),
      millions: Number(size / 10n ** BigInt(quoteDecimals)) / 1e6,
    }));
}

function hourly(rows, jit, sandwichList) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour: String(hour).padStart(2, "0"),
    swaps: 0,
    jit: 0,
    sandwiches: 0,
  }));
  const bucket = (row) => hours[row.hour];
  rows.swaps.forEach((swap) => bucket(swap).swaps++);
  jit.forEach(({ swap }) => bucket(swap).jit++);
  sandwichList.forEach(({ victim }) => bucket(victim).sandwiches++);
  return hours;
}

export function shape(fetched, binds) {
  const rows = unpack(fetched, binds);
  const quoteDecimals = Number(
    rows.tokens.find((t) => t.token === usdc).decimals,
  );
  const jit = jitEvents(rows);
  const sandwichList = sandwiches(rows);
  return {
    day: dayOf(binds),
    tokens: rows.tokens.map(({ token, symbol, name }) => ({
      token,
      symbol,
      name,
    })),
    counts: {
      swaps: rows.swaps.length.toLocaleString("en-US"),
      liquidity: rows.liquidity.length.toLocaleString("en-US"),
      jit: String(jit.length),
      sandwiches: String(sandwichList.length),
    },
    hourly: hourly(rows, jit, sandwichList),
    biggest: biggestSwaps(rows.swaps, quoteDecimals),
    jit: jit.map(({ add, swap, remove }) => ({
      block: String(add.block),
      pool: poolName(add.pool),
      sender: shortAddress(add.sender),
      liquidity: BigInt(add.liquidity_delta).toLocaleString("en-US"),
      ticks: `${add.tick_lower} to ${add.tick_upper}`,
      add: tx(add.tx),
      swap: tx(swap.tx),
      remove: tx(remove.tx),
    })),
    sandwiches: sandwichList.map(({ front, victim, back }) => ({
      block: String(front.block),
      pool: poolName(front.pool),
      attacker: shortAddress(front.sender),
      victim: shortAddress(victim.sender),
      front: tx(front.tx),
      victimTx: tx(victim.tx),
      back: tx(back.tx),
      direction: sells0(front)
        ? "sold currency0, then bought it back"
        : "bought currency0, then sold it back",
    })),
  };
}
