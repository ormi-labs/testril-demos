export const binds = [
  {
    name: "binance-total",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: [
          "0x28c6c06298d514db089934071355e5743bf21d60",
          "0xf977814e90da44bfa03b6295a0616a897441acec",
        ],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "binance-owner-1",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0x28c6c06298d514db089934071355e5743bf21d60"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "binance-owner-2",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0xf977814e90da44bfa03b6295a0616a897441acec"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "binance-native",
    function_slug: "native.balance",
    chain_id: 1,
    params: {
      owners: [
        "0x28c6c06298d514db089934071355e5743bf21d60",
        "0xf977814e90da44bfa03b6295a0616a897441acec",
      ],
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "coinbase-total",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: [
          "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
          "0x3cd751e6b0078be393132286c442345e5dc49699",
        ],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "coinbase-owner-1",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "coinbase-owner-2",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0x3cd751e6b0078be393132286c442345e5dc49699"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "coinbase-native",
    function_slug: "native.balance",
    chain_id: 1,
    params: {
      owners: [
        "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
        "0x3cd751e6b0078be393132286c442345e5dc49699",
      ],
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "kraken-total",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: [
          "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
          "0x2910543af39aba0cd09dbb2d50200b3e800a63d2",
        ],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "kraken-owner-1",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "kraken-owner-2",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0x2910543af39aba0cd09dbb2d50200b3e800a63d2"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "kraken-native",
    function_slug: "native.balance",
    chain_id: 1,
    params: {
      owners: [
        "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
        "0x2910543af39aba0cd09dbb2d50200b3e800a63d2",
      ],
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "okx-total",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0x6cc5f688a315f3dc28a7781717a9a798a59fda7b"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "okx-native",
    function_slug: "native.balance",
    chain_id: 1,
    params: {
      owners: ["0x6cc5f688a315f3dc28a7781717a9a798a59fda7b"],
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "bitfinex-total",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "bitfinex-native",
    function_slug: "native.balance",
    chain_id: 1,
    params: {
      owners: ["0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec"],
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "gemini-total",
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: {
      reads: {
        tokens: [
          "0xdac17f958d2ee523a2206206994597c13d831ec7",
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        ],
        owners: ["0xd24400ae8bfebb18ca49be86258a3c749cf46853"],
      },
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
  {
    name: "gemini-native",
    function_slug: "native.balance",
    chain_id: 1,
    params: {
      owners: ["0xd24400ae8bfebb18ca49be86258a3c749cf46853"],
      by: "hour",
    },
    window: { from_hour: "2026-10-25T00", to_hour: "2026-11-01T00" },
  },
];

const bindByName = Object.fromEntries(binds.map((bind) => [bind.name, bind]));
export const tideWindow = bindByName["binance-total"].window;
export const [usdt, usdc] = bindByName["binance-total"].params.reads.tokens;
const symbols = { [usdt]: "USDT", [usdc]: "USDC" };
const decimals = 6n;
const wei = 10n ** 18n;
const biggestHours = 10;
const displayNames = {
  binance: "Binance",
  coinbase: "Coinbase",
  kraken: "Kraken",
  okx: "OKX",
  bitfinex: "Bitfinex",
  gemini: "Gemini",
};

export const exchanges = binds
  .filter((bind) => bind.name.endsWith("-total"))
  .map((bind) => {
    const id = bind.name.slice(0, -"-total".length);
    return {
      id,
      name: displayNames[id],
      owners: bind.params.reads.owners,
      ownerBinds: binds
        .filter((other) => other.name.startsWith(`${id}-owner-`))
        .map((other) => other.name),
    };
  });

export function hours() {
  const result = [];
  for (
    let t = Date.parse(`${tideWindow.from_hour}:00:00Z`);
    t < Date.parse(`${tideWindow.to_hour}:00:00Z`);
    t += 3600000
  )
    result.push(new Date(t).toISOString().slice(0, 13));
  return result;
}

function balancesByHour(rows, bindName, keyField, keys) {
  const expected = hours();
  const bind = rows[bindName];
  const outside = bind.filter((row) => !expected.includes(row.hour));
  if (outside.length)
    throw new Error(
      `${bindName} has hour ${outside[0].hour}, outside the window.`,
    );
  const series = new Map(keys.map((key) => [key, new Map()]));
  for (const row of bind) {
    const key = row[keyField].toLowerCase();
    if (!series.has(key))
      throw new Error(`${bindName} has an unexpected ${keyField} ${key}.`);
    if (series.get(key).has(row.hour))
      throw new Error(`${bindName} has two rows for ${key} at ${row.hour}.`);
    series.get(key).set(row.hour, row);
  }
  for (const [key, byHour] of series)
    for (const hour of expected) {
      if (!byHour.has(hour))
        throw new Error(`${bindName} is missing ${key} at ${hour}.`);
      if (BigInt(byHour.get(hour).balance) <= 0n)
        throw new Error(
          `${bindName} has a zero or negative balance for ${key} at ${hour}.`,
        );
    }
  return new Map(
    [...series].map(([key, byHour]) => [
      key,
      new Map([...byHour].map(([hour, row]) => [hour, BigInt(row.balance)])),
    ]),
  );
}

const tokenBalances = (rows, bindName) =>
  balancesByHour(rows, bindName, "token", [usdt, usdc]);
const nativeBalances = (rows, exchange) =>
  balancesByHour(rows, `${exchange.id}-native`, "owner", exchange.owners);

export function check(rows) {
  const expected = hours();
  for (const exchange of exchanges) {
    tokenBalances(rows, `${exchange.id}-total`);
    nativeBalances(rows, exchange);
  }
  const split = exchanges.filter((exchange) => exchange.ownerBinds.length);
  for (const exchange of split) {
    const total = tokenBalances(rows, `${exchange.id}-total`);
    const owners = exchange.ownerBinds.map((name) => tokenBalances(rows, name));
    for (const token of [usdt, usdc])
      for (const hour of expected) {
        const sum = owners.reduce(
          (acc, owner) => acc + owner.get(token).get(hour),
          0n,
        );
        if (total.get(token).get(hour) !== sum)
          throw new Error(
            `${exchange.name} ${symbols[token]} total at ${hour} is ${total.get(token).get(hour)}, but its owners hold ${sum}.`,
          );
      }
  }
  const wallets = exchanges.reduce((n, e) => n + e.owners.length, 0);
  return [
    `${expected.length} contiguous hours, from ${expected[0]} to ${expected.at(-1)}, present for every exchange total in USDT and USDC, none zero`,
    `${split.map((e) => e.name).join(", ")}: the total equals the sum of its listed owners in every hour, for both tokens`,
    `Native ETH balance present and positive for all ${wallets} wallets in every hour`,
  ];
}

export function formatUsd(raw, signed = false) {
  const dollars = Number(raw / 10n ** decimals);
  const sign = dollars < 0 ? "−" : signed ? "+" : "";
  const abs = Math.abs(dollars);
  const [scale, suffix] =
    abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `${sign}$${(abs / scale).toFixed(2)}${suffix}`;
}

export const formatEth = (raw) => `${(raw / wei).toLocaleString("en-US")} ETH`;

function stableTotals(rows, exchange) {
  const total = tokenBalances(rows, `${exchange.id}-total`);
  return hours().map(
    (hour) => total.get(usdt).get(hour) + total.get(usdc).get(hour),
  );
}

const absolute = (value) => (value < 0n ? -value : value);

const bySizeDescending = (a, b) => {
  const [sizeA, sizeB] = [absolute(a.change), absolute(b.change)];
  return sizeA === sizeB ? 0 : sizeB > sizeA ? 1 : -1;
};

function hourlyChanges(exchange, totals) {
  const expected = hours();
  return totals.slice(1).map((balance, i) => ({
    hour: expected[i + 1],
    exchange: exchange.name,
    change: balance - totals[i],
    balance,
  }));
}

export function shape(rows) {
  const expected = hours();
  const totals = exchanges.map((exchange) => stableTotals(rows, exchange));
  const changes = exchanges
    .flatMap((exchange, i) => hourlyChanges(exchange, totals[i]))
    .sort(bySizeDescending);
  const sumLast = (list) =>
    list.reduce((acc, series) => acc + series.at(-1), 0n);
  const sumFirst = (list) => list.reduce((acc, series) => acc + series[0], 0n);
  const eth = exchanges.map((exchange) => {
    const balances = nativeBalances(rows, exchange);
    return exchange.owners.reduce(
      (acc, owner) => acc + balances.get(owner).get(expected.at(-1)),
      0n,
    );
  });
  const inflow = changes.find((c) => c.change > 0n);
  const outflow = changes.find((c) => c.change < 0n);
  const describe = (c) => `${c.exchange} · ${c.hour}:00 UTC`;
  return {
    tideWindow,
    hours: expected,
    stablecoins: formatUsd(sumLast(totals)),
    stablecoinChange: formatUsd(sumLast(totals) - sumFirst(totals), true),
    eth: formatEth(eth.reduce((a, b) => a + b, 0n)),
    biggestIn: {
      amount: formatUsd(inflow.change, true),
      where: describe(inflow),
    },
    biggestOut: {
      amount: formatUsd(outflow.change, true),
      where: describe(outflow),
    },
    exchanges: exchanges.map((exchange, i) => ({
      name: exchange.name,
      latest: formatUsd(totals[i].at(-1)),
      eth: formatEth(eth[i]),
      millions: totals[i].map((raw) => Number(raw / 10n ** decimals) / 1e6),
    })),
    biggestHours: changes.slice(0, biggestHours).map((c) => ({
      hour: c.hour,
      exchange: c.exchange,
      direction: c.change > 0n ? "In" : "Out",
      change: formatUsd(c.change, true),
      balance: formatUsd(c.balance),
    })),
  };
}
