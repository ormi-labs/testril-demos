const dayMs = 86400000;
const named = [
  [
    "circle",
    "0x55fe002aeff02f77364de339a1292923a15844b8",
    "Circle (USDC issuer)",
  ],
  ["coinbase-10", "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43", "Coinbase 10"],
  ["bitfinex-2", "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec", "Bitfinex 2"],
  [
    "uniswap-v3-usdc-weth",
    "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    "Uniswap v3 USDC/WETH 0.05%",
  ],
  [
    "uniswap-v3-usdc-usdt",
    "0x3416cf6c708da44db2624d63ea0aaef7113527c6",
    "Uniswap v3 USDC/USDT 0.01%",
  ],
  [
    "uniswap-v4-pool-manager",
    "0x000000000004444c5dc75cb358380d2e3de08a90",
    "Uniswap v4 PoolManager",
  ],
  [
    "uniswap-universal-router",
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
    "Uniswap Universal Router",
  ],
  ["curve-3pool", "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7", "Curve 3pool"],
  [
    "aave-v3-ausdc",
    "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c",
    "Aave v3 aEthUSDC",
  ],
  ["morpho-blue", "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb", "Morpho Blue"],
  [
    "cow-settlement",
    "0x9008d19f58aabd9ed0d60971565aa8510560ab41",
    "CoW Protocol settlement",
  ],
  [
    "1inch-v6-router",
    "0x111111125421ca6dc452d289314280a0f8842a65",
    "1inch v6 router",
  ],
  [
    "balancer-v2-vault",
    "0xba12222222228d8ba445958a75a0704d566bf2c8",
    "Balancer v2 Vault",
  ],
];
export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const usdt = "0xdac17f958d2ee523a2206206994597c13d831ec7";
export const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const namedAddresses = named.map(([, address]) => address);
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

const usdcCounterparties = (wallet, by) => ({
  function_slug: "erc20.wallet_counterparties",
  chain_id: 1,
  params: { swap: { wallet, tokens: [usdc] }, by },
});

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const untilToday = (ms) => ({
    from_time: isoSecond(today - ms),
    to_time: isoSecond(today),
  });
  return [
    {
      name: "supply",
      function_slug: "erc20.token_supply",
      chain_id: 1,
      params: { tokens: [usdt, usdc], by: "day" },
      window: untilToday(31 * dayMs),
    },
    {
      name: "usdc-mints-burns",
      ...usdcCounterparties(zeroAddress, "day"),
      window: untilToday(dayMs),
    },
    ...named.map(([slug, address]) => ({
      name: `usdc-${slug}`,
      ...usdcCounterparties(address, "hour"),
      window: untilToday(dayMs),
      read: { chunk_hours: 1 },
    })),
  ];
}

const decimals = 6n;
const topPairs = 20;

const utcDay = (time) => time.slice(0, 10);
const nextDay = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * dayMs)
    .toISOString()
    .slice(0, 10);

export function supplyDays(binds) {
  const { window } = binds.find((bind) => bind.name === "supply");
  const days = [];
  for (
    let d = utcDay(window.from_time);
    d < utcDay(window.to_time);
    d = nextDay(d, 1)
  )
    days.push(d);
  return days;
}

export function transferDay(binds) {
  return utcDay(
    binds.find((bind) => bind.name === "usdc-mints-burns").window.from_time,
  );
}

const namedFlowBinds = (binds) =>
  binds.filter((bind) => namedAddresses.includes(bind.params.swap?.wallet));

function supplyByDay(rows, token) {
  return new Map(
    rows.supply
      .filter((row) => row.token.toLowerCase() === token)
      .map((row) => [row.day, BigInt(row.total_supply)]),
  );
}

export function mintsAndBurns(rows) {
  let minted = 0n;
  let burned = 0n;
  for (const row of rows["usdc-mints-burns"]) {
    minted += BigInt(row.sent);
    burned += BigInt(row.received);
  }
  return { minted, burned };
}

function namedDayTotals(rows, binds) {
  const totals = new Map();
  for (const bind of namedFlowBinds(binds)) {
    const wallet = bind.params.swap.wallet;
    for (const row of rows[bind.name]) {
      const counterparty = row.counterparty.toLowerCase();
      if (counterparty === wallet) continue;
      const key = `${wallet}>${counterparty}`;
      const total = totals.get(key) ?? {
        wallet,
        counterparty,
        sent: 0n,
        received: 0n,
      };
      total.sent += BigInt(row.sent);
      total.received += BigInt(row.received);
      totals.set(key, total);
    }
  }
  return totals;
}

function checkNamedPairsAgree(totals, day) {
  let sides = 0;
  for (const { wallet, counterparty, sent, received } of totals.values()) {
    if (!namedAddresses.includes(counterparty)) continue;
    const mirror = totals.get(`${counterparty}>${wallet}`);
    if (!mirror || mirror.sent !== received || mirror.received !== sent)
      throw new Error(
        `On ${day} ${wallet} reports sending ${counterparty} ${sent} and receiving ${received}, but ${counterparty} reports ${mirror ? `sending ${mirror.sent} and receiving ${mirror.received}` : "no USDC with it"}.`,
      );
    sides += 1;
  }
  return sides / 2;
}

export function check({ rows }, binds) {
  const days = supplyDays(binds);
  const day = transferDay(binds);
  for (const token of [usdt, usdc]) {
    const supply = supplyByDay(rows, token);
    const missing = days.filter((day) => !supply.has(day));
    if (missing.length)
      throw new Error(`Supply of ${token} is missing ${missing.join(", ")}.`);
  }
  const supply = supplyByDay(rows, usdc);
  const change = supply.get(day) - supply.get(nextDay(day, -1));
  const { minted, burned } = mintsAndBurns(rows);
  if (change !== minted - burned)
    throw new Error(
      `USDC supply changed by ${change} on ${day}, but mints minus burns that day is ${minted - burned}.`,
    );
  return [
    `USDT and USDC supply present for all ${days.length} days`,
    `USDC supply change on ${day} (${formatUsd(change, true)}) equals mints (${formatUsd(minted)}) minus burns (${formatUsd(burned)})`,
    namedPairsLine(checkNamedPairsAgree(namedDayTotals(rows, binds), day)),
  ];
}

const namedPairsLine = (pairs) =>
  pairs === 0
    ? "No two named addresses moved USDC to each other, so no pair is checked from both ends"
    : `${pairs} ${pairs === 1 ? "pair" : "pairs"} of named addresses report the same USDC between them from both ends`;

export function formatUsd(raw, signed = false) {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const cents = (abs + 5000n) / 10000n;
  const whole = (cents / 100n).toLocaleString("en-US");
  const sign = negative ? "−" : signed ? "+" : "";
  return `${sign}$${whole}.${String(cents % 100n).padStart(2, "0")}`;
}

export function formatCompact(raw, signed = false) {
  const dollars = Number(raw / 10n ** decimals);
  const sign = dollars < 0 ? "−" : signed ? "+" : "";
  const abs = Math.abs(dollars);
  const [scale, suffix] =
    abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `${sign}$${(abs / scale).toFixed(2)}${suffix}`;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const handLabels = new Map(named.map(([, address, label]) => [address, label]));

export const labelOf = (address) =>
  address === zeroAddress
    ? "Zero address"
    : (handLabels.get(address) ?? shortAddress(address));

function tokenSummary(rows, days, token, symbol) {
  const supply = supplyByDay(rows, token);
  const first = supply.get(days[0]);
  const last = supply.get(days.at(-1));
  return {
    symbol,
    token,
    latest: formatCompact(last),
    change: formatCompact(last - first, true),
    series: days.map((day) => ({
      day,
      millions: Number(supply.get(day) / 10n ** decimals) / 1e6,
    })),
  };
}

function pairs(totals, label) {
  const flows = new Map();
  const add = (from, to, amount) => {
    if (amount > 0n) flows.set(`${from}>${to}`, { from, to, amount });
  };
  for (const { wallet, counterparty, sent, received } of totals.values()) {
    add(wallet, counterparty, sent);
    add(counterparty, wallet, received);
  }
  return [...flows.values()]
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    .slice(0, topPairs)
    .map((pair) => ({
      from: pair.from,
      to: pair.to,
      fromLabel: label(pair.from),
      toLabel: label(pair.to),
      amount: formatUsd(pair.amount),
      millions: Number(pair.amount / 10n ** decimals) / 1e6,
    }));
}

export function shape({ rows }, binds) {
  const { minted, burned } = mintsAndBurns(rows);
  const days = supplyDays(binds);
  return {
    supplyDays: { first: days[0], last: days.at(-1) },
    transferDay: transferDay(binds),
    tokens: [
      tokenSummary(rows, days, usdt, "USDT"),
      tokenSummary(rows, days, usdc, "USDC"),
    ],
    minted: formatCompact(minted),
    burned: formatCompact(burned),
    net: formatCompact(minted - burned, true),
    pairs: pairs(namedDayTotals(rows, binds), labelOf),
  };
}
