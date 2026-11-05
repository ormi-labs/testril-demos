const dayMs = 86400000;
const nameLookbackMs = 5 * 60000;
const ensRegistry = "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e";
const named = [
  ["ens-circle", "0x55fe002aeff02f77364de339a1292923a15844b8"],
  ["ens-binance-14", "0x28c6c06298d514db089934071355e5743bf21d60"],
  ["ens-binance-8", "0xf977814e90da44bfa03b6295a0616a897441acec"],
  ["ens-coinbase-10", "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43"],
  ["ens-kraken-4", "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0"],
  ["ens-okx-73", "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b"],
  ["ens-bitfinex-2", "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec"],
  ["ens-uniswap-v3-usdc-weth", "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"],
  ["ens-uniswap-v3-usdc-usdt", "0x3416cf6c708da44db2624d63ea0aaef7113527c6"],
  ["ens-uniswap-v4-pool-manager", "0x000000000004444c5dc75cb358380d2e3de08a90"],
  [
    "ens-uniswap-universal-router",
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  ],
  ["ens-curve-3pool", "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7"],
  ["ens-aave-v3-ausdc", "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c"],
  ["ens-morpho-blue", "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb"],
  ["ens-maker-psm-usdc", "0x0a59649758aa4d66e25f08dd01271e891fe52199"],
  ["ens-cow-settlement", "0x9008d19f58aabd9ed0d60971565aa8510560ab41"],
  ["ens-1inch-v6-router", "0x111111125421ca6dc452d289314280a0f8842a65"],
  ["ens-0x-exchange-proxy", "0xdef1c0ded9bec7f1a1670819833240f027b25eff"],
  ["ens-balancer-v2-vault", "0xba12222222228d8ba445958a75a0704d566bf2c8"],
  ["ens-vitalik", "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"],
];
const usdtAddress = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

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
      params: { tokens: [usdtAddress, usdcAddress], by: "day" },
      window: untilToday(31 * dayMs),
    },
    {
      name: "usdc-edges",
      function_slug: "erc20.transfer_edges",
      chain_id: 1,
      params: { token_address: usdcAddress },
      window: untilToday(dayMs),
      read: { chunk_hours: 2 },
    },
    ...named.map(([name, address]) => ({
      name,
      function_slug: "ens.primary_name",
      chain_id: 1,
      params: { registry: ensRegistry, address },
      window: untilToday(nameLookbackMs),
    })),
  ];
}

export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const usdt = usdtAddress;
export const usdc = usdcAddress;
export const ensAddresses = named.map(([, address]) => address);
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

export function edgesDay(binds) {
  return utcDay(
    binds.find((bind) => bind.name === "usdc-edges").window.from_time,
  );
}

function supplyByDay(rows, token) {
  return new Map(
    rows.supply
      .filter((row) => row.token.toLowerCase() === token)
      .map((row) => [row.day, BigInt(row.total_supply)]),
  );
}

export function mintsAndBurns(edges) {
  let minted = 0n;
  let burned = 0n;
  for (const edge of edges) {
    if (edge.from === zeroAddress) minted += BigInt(edge.amount);
    if (edge.to === zeroAddress) burned += BigInt(edge.amount);
  }
  return { minted, burned };
}

export function check({ rows }, binds) {
  const days = supplyDays(binds);
  const day = edgesDay(binds);
  for (const token of [usdt, usdc]) {
    const supply = supplyByDay(rows, token);
    const missing = days.filter((day) => !supply.has(day));
    if (missing.length)
      throw new Error(`Supply of ${token} is missing ${missing.join(", ")}.`);
  }
  const supply = supplyByDay(rows, usdc);
  const change = supply.get(day) - supply.get(nextDay(day, -1));
  const { minted, burned } = mintsAndBurns(rows["usdc-edges"]);
  if (change !== minted - burned)
    throw new Error(
      `USDC supply changed by ${change} on ${day}, but mints minus burns that day is ${minted - burned}.`,
    );
  return [
    `USDT and USDC supply present for all ${days.length} days`,
    `USDC supply change on ${day} (${formatUsd(change, true)}) equals mints (${formatUsd(minted)}) minus burns (${formatUsd(burned)})`,
  ];
}

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

export function labels(rows, binds) {
  const names = new Map(
    binds
      .filter((bind) => bind.function_slug === "ens.primary_name")
      .flatMap((bind) => rows[bind.name] ?? [])
      .map((row) => [row.address.toLowerCase(), row.name]),
  );
  return (address) =>
    address === zeroAddress
      ? "Zero address"
      : names.get(address) || shortAddress(address);
}

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

function pairs(edges, label) {
  const totals = new Map();
  for (const edge of edges) {
    const from = edge.from.toLowerCase();
    const to = edge.to.toLowerCase();
    const key = `${from}>${to}`;
    const pair = totals.get(key) ?? {
      from,
      to,
      amount: 0n,
      count: 0n,
    };
    pair.amount += BigInt(edge.amount);
    pair.count += BigInt(edge.count);
    totals.set(key, pair);
  }
  return [...totals.values()]
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    .slice(0, topPairs)
    .map((pair) => ({
      from: pair.from,
      to: pair.to,
      fromLabel: label(pair.from),
      toLabel: label(pair.to),
      amount: formatUsd(pair.amount),
      millions: Number(pair.amount / 10n ** decimals) / 1e6,
      transfers: pair.count.toString(),
    }));
}

export function shape({ rows }, binds) {
  const edges = rows["usdc-edges"];
  const { minted, burned } = mintsAndBurns(edges);
  const days = supplyDays(binds);
  return {
    supplyDays: { first: days[0], last: days.at(-1) },
    edgesDay: edgesDay(binds),
    tokens: [
      tokenSummary(rows, days, usdt, "USDT"),
      tokenSummary(rows, days, usdc, "USDC"),
    ],
    minted: formatCompact(minted),
    burned: formatCompact(burned),
    net: formatCompact(minted - burned, true),
    pairs: pairs(edges, labels(rows, binds)),
  };
}
