import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
const chainNames = { 1: "Ethereum", 42161: "Arbitrum" };
const daoNames = {
  uniswap: "Uniswap",
  ens: "ENS DAO",
  arbitrum: "Arbitrum DAO",
};
const nativeSymbol = "ETH";
const nativeDecimals = 18;
const tokenInfo = {
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72": { symbol: "ENS", decimals: 18 },
  "0x912ce59144191c1204e64559fe8253a0e49e6548": { symbol: "ARB", decimals: 18 },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    symbol: "WETH",
    decimals: 18,
  },
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": {
    symbol: "WETH",
    decimals: 18,
  },
};
const walletNames = {
  "0x1a9c8182c09f50c8318d769245bea52c32be35bc": "Governance Timelock",
  "0x3d30b1ab88d487b0f3061f40de76845bec3f1e94": "Uniswap Foundation",
  "0xfe89cc7abb2c4183683ab71653c4cdc9b02d44b7": "DAO Wallet",
  "0x4f2083f5fbede34c2714affb3105539775f7fe64": "Endowment",
  "0xf3fc178157fb3c87548baa86f9d24ba38e649b58": "Treasury Timelock",
  "0x34d45e99f7d8c45ed05b5ca72d54bbd1fb3f98f0": "Core Timelock",
};

const nextDay = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * 86400000)
    .toISOString()
    .slice(0, 10);

export function daysOf(window) {
  const days = [];
  for (let d = window.from_day; d < window.to_day; d = nextDay(d, 1))
    days.push(d);
  return days;
}

export const daos = Object.entries(daoNames).map(([id, name]) => {
  const total = binds[`${id}-tokens`];
  const walletBinds = spec.binds.filter((bind) =>
    bind.name.startsWith(`${id}-tokens-`),
  );
  return {
    id,
    name,
    chain: chainNames[total.chain_id],
    window: total.window,
    days: daysOf(total.window),
    tokens: total.params.reads.tokens,
    wallets: walletBinds.map((bind) => ({
      address: bind.params.reads.owners[0],
      label: walletNames[bind.params.reads.owners[0]],
      bind: bind.name,
    })),
    totalBind: total.name,
    nativeBind: `${id}-native`,
  };
});

const series = (rows, key, id) =>
  new Map(
    rows
      .filter((row) => row[key] === id)
      .map((row) => [row.day, BigInt(row.balance)]),
  );

const sumOn = (maps, day) =>
  maps.reduce((sum, map) => sum + (map.get(day) ?? 0n), 0n);

function daoRows(rows, dao) {
  return [
    rows[dao.totalBind],
    rows[dao.nativeBind],
    ...dao.wallets.map((wallet) => rows[wallet.bind]),
  ];
}

export function check(rows) {
  const passed = [];
  for (const dao of daos) {
    const governance = tokenInfo[dao.tokens[0]].symbol;
    const held = series(rows[dao.totalBind], "token", dao.tokens[0]);
    const idle = dao.days.filter((day) => !held.has(day));
    if (idle.length)
      throw new Error(`${dao.name} shows no ${governance} on ${idle[0]}.`);
    for (const token of dao.tokens) {
      const total = series(rows[dao.totalBind], "token", token);
      const parts = dao.wallets.map((wallet) =>
        series(rows[wallet.bind], "token", token),
      );
      for (const day of dao.days) {
        const wallets = sumOn(parts, day);
        const all = total.get(day) ?? 0n;
        if (all !== wallets)
          throw new Error(
            `${dao.name} ${tokenInfo[token].symbol} on ${day}: total is ${all} but its wallets hold ${wallets}.`,
          );
      }
    }
    const balances = daoRows(rows, dao).flat();
    const negative = balances.find((row) => BigInt(row.balance) < 0n);
    if (negative)
      throw new Error(
        `${dao.name} has a negative balance: ${negative.balance}.`,
      );
    passed.push(
      `${dao.name}: ${dao.tokens.length} tokens over ${dao.days.length} days, each total equals the sum of its ${dao.wallets.length} wallets`,
      `${dao.name}: all ${balances.length} balance rows are non-negative`,
    );
  }
  return passed;
}

export function formatAmount(raw, decimals, signed = false) {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const unit = 10n ** BigInt(decimals);
  const [scale, suffix] =
    abs >= 1000000000n * unit
      ? [1000000000n, "B"]
      : abs >= 1000000n * unit
        ? [1000000n, "M"]
        : abs >= 1000n * unit
          ? [1000n, "K"]
          : [1n, ""];
  const hundredths = (abs * 100n) / (unit * scale);
  const sign = negative ? "−" : signed ? "+" : "";
  return `${sign}${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}${suffix}`;
}

const wholeUnits = (raw, decimals) => Number(raw / 10n ** BigInt(decimals));

function holding(dao, { symbol, decimals, perWallet }) {
  const first = dao.days[0];
  const last = dao.days.at(-1);
  const total = (day) => sumOn(perWallet, day);
  return {
    symbol,
    latest: `${formatAmount(total(last), decimals)} ${symbol}`,
    change: `${formatAmount(total(last) - total(first), decimals, true)} ${symbol}`,
    wallets: dao.wallets.map((wallet, index) => ({
      label: wallet.label,
      amount: formatAmount(perWallet[index].get(last) ?? 0n, decimals),
    })),
  };
}

function cardView(dao, rows) {
  const first = dao.days[0];
  const last = dao.days.at(-1);
  const tokenHoldings = dao.tokens.map((token) =>
    holding(dao, {
      ...tokenInfo[token],
      perWallet: dao.wallets.map((wallet) =>
        series(rows[wallet.bind], "token", token),
      ),
    }),
  );
  const native = holding(dao, {
    symbol: nativeSymbol,
    decimals: nativeDecimals,
    perWallet: dao.wallets.map((wallet) =>
      series(rows[dao.nativeBind], "owner", wallet.address),
    ),
  });
  const governance = tokenInfo[dao.tokens[0]];
  const line = series(rows[dao.totalBind], "token", dao.tokens[0]);
  const values = dao.days.map((day) => line.get(day));
  const low = values.reduce((a, b) => (b < a ? b : a));
  const high = values.reduce((a, b) => (b > a ? b : a));
  return {
    id: dao.id,
    name: dao.name,
    chain: dao.chain,
    window: `${first} to ${last}`,
    dayCount: dao.days.length,
    holdings: [...tokenHoldings, native],
    line: {
      symbol: governance.symbol,
      low: formatAmount(low, governance.decimals),
      high: formatAmount(high, governance.decimals),
      points: dao.days.map((day, index) => ({
        day,
        value: wholeUnits(values[index], governance.decimals),
      })),
    },
  };
}

export function shape(rows) {
  const cards = daos.map((dao) => cardView(dao, rows));
  return {
    cards,
    headline: cards.map((card) => ({
      label: `${card.line.symbol} HELD · ${card.name.toUpperCase()}`,
      value: card.holdings[0].latest,
      note: `${card.holdings[0].change} over ${card.dayCount} days`,
    })),
    scope: daos.map((dao) => ({
      label: `${dao.name.toUpperCase()} · UTC DAYS`,
      value: `${dao.window.from_day} to ${dao.window.to_day} (exclusive)`,
    })),
  };
}
