export const binds = [
  {
    name: "supply",
    function_slug: "erc20.token_supply",
    chain_id: 1,
    params: {
      tokens: [
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      ],
      by: "day",
    },
    window: { from_day: "2026-10-02", to_day: "2026-11-02" },
  },
  {
    name: "usdc-edges",
    function_slug: "erc20.transfer_edges",
    chain_id: 1,
    params: { token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
    window: { from_block: 26316189, to_block: 26323365 },
    read: { chunk_blocks: 600 },
  },
  {
    name: "ens-circle",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x55fe002aeff02f77364de339a1292923a15844b8",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-binance-14",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x28c6c06298d514db089934071355e5743bf21d60",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-binance-8",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xf977814e90da44bfa03b6295a0616a897441acec",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-coinbase-10",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-kraken-4",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-okx-73",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-bitfinex-2",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-uniswap-v3-usdc-weth",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-uniswap-v3-usdc-usdt",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x3416cf6c708da44db2624d63ea0aaef7113527c6",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-uniswap-v4-pool-manager",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x000000000004444c5dc75cb358380d2e3de08a90",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-uniswap-universal-router",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-curve-3pool",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-aave-v3-ausdc",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-morpho-blue",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-maker-psm-usdc",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-cow-settlement",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x9008d19f58aabd9ed0d60971565aa8510560ab41",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-1inch-v6-router",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0x111111125421ca6dc452d289314280a0f8842a65",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-0x-exchange-proxy",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-balancer-v2-vault",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xba12222222228d8ba445958a75a0704d566bf2c8",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "ens-vitalik",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    },
    window: { from_block: 26323364, to_block: 26323365 },
  },
];

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const bindByName = Object.fromEntries(binds.map((bind) => [bind.name, bind]));
export const supplyWindow = bindByName.supply.window;
export const edgesWindow = bindByName["usdc-edges"].window;
export const usdc = bindByName["usdc-edges"].params.token_address;
export const usdt = bindByName.supply.params.tokens.find(
  (token) => token !== usdc,
);
export const ensAddresses = binds
  .filter((bind) => bind.function_slug === "ens.primary_name")
  .map((bind) => bind.params.address);
const decimals = 6n;
const topPairs = 20;

const nextDay = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * 86400000)
    .toISOString()
    .slice(0, 10);

export function supplyDays() {
  const days = [];
  for (
    let d = supplyWindow.from_day;
    d < supplyWindow.to_day;
    d = nextDay(d, 1)
  )
    days.push(d);
  return days;
}
export const edgesDay = nextDay(supplyWindow.to_day, -1);

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

export function check(rows) {
  const days = supplyDays();
  for (const token of [usdt, usdc]) {
    const supply = supplyByDay(rows, token);
    const missing = days.filter((day) => !supply.has(day));
    if (missing.length)
      throw new Error(`Supply of ${token} is missing ${missing.join(", ")}.`);
  }
  const outside = rows["usdc-edges"].filter(
    (edge) =>
      edge.block < edgesWindow.from_block || edge.block >= edgesWindow.to_block,
  );
  if (outside.length)
    throw new Error(`Edge at block ${outside[0].block} is outside the window.`);
  const supply = supplyByDay(rows, usdc);
  const change = supply.get(edgesDay) - supply.get(nextDay(edgesDay, -1));
  const { minted, burned } = mintsAndBurns(rows["usdc-edges"]);
  if (change !== minted - burned)
    throw new Error(
      `USDC supply changed by ${change} on ${edgesDay}, but mints minus burns in blocks ${edgesWindow.from_block}–${edgesWindow.to_block - 1} is ${minted - burned}.`,
    );
  return [
    `USDT and USDC supply present for all ${days.length} days`,
    `USDC supply change on ${edgesDay} (${formatUsd(change, true)}) equals mints (${formatUsd(minted)}) minus burns (${formatUsd(burned)})`,
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

export function labels(rows) {
  const names = new Map(
    binds
      .filter((bind) => bind.function_slug === "ens.primary_name")
      .flatMap((bind) => rows[bind.name] ?? [])
      .filter((row) => row.name)
      .map((row) => [row.address.toLowerCase(), row.name]),
  );
  return (address) =>
    address === zeroAddress
      ? "Zero address"
      : (names.get(address) ?? shortAddress(address));
}

function tokenSummary(rows, token, symbol) {
  const supply = supplyByDay(rows, token);
  const days = supplyDays();
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

export function shape(rows) {
  const edges = rows["usdc-edges"];
  const { minted, burned } = mintsAndBurns(edges);
  return {
    supplyWindow,
    edgesDay,
    edgesWindow,
    tokens: [
      tokenSummary(rows, usdt, "USDT"),
      tokenSummary(rows, usdc, "USDC"),
    ],
    minted: formatCompact(minted),
    burned: formatCompact(burned),
    net: formatCompact(minted - burned, true),
    pairs: pairs(edges, labels(rows)),
  };
}
