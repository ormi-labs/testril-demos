const dayMs = 86400000;
const weekDays = 7;
const hoursPerDay = 24;
const nameLookbackMs = 5 * 60000;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
const ensRegistry = "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e";
const trackedTokens = [
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
];
export const wallets = [
  { key: "vitalik", address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045" },
  { key: "nick", address: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5" },
  { key: "brantly", address: "0x983110309620d911731ac0932219af06091b6744" },
];

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const between = (from, to) => ({
    from_time: isoSecond(from),
    to_time: isoSecond(to),
  });
  const lastBlocks = between(today - nameLookbackMs, today);
  return [
    ...wallets.map(({ key, address }) => ({
      name: `ens-${key}`,
      function_slug: "ens.primary_name",
      chain_id: 1,
      params: { registry: ensRegistry, address },
      window: lastBlocks,
    })),
    {
      name: "balance",
      function_slug: "native.balance",
      chain_id: 1,
      params: { owners: wallets.map(({ address }) => address) },
      window: lastBlocks,
    },
    ...wallets.map(({ key, address }) => ({
      name: `transfers-${key}`,
      function_slug: "erc20.wallet_transfers",
      chain_id: 1,
      params: { wallet: address, tokens: trackedTokens },
      window: between(today - weekDays * dayMs, today),
      read: { chunk_hours: hoursPerDay },
    })),
  ];
}

export const weekOf = (binds) => {
  const { window } = binds.find((bind) => bind.name === "transfers-vitalik");
  const days = Array.from({ length: weekDays }, (_, day) =>
    isoSecond(Date.parse(window.from_time) + day * dayMs).slice(0, 10),
  );
  return { first: days[0], last: days.at(-1), days };
};

const holdsBlock = (block) => (read) =>
  block >= read.from_block && block < read.to_block;

function transfersOf({ rows, reads }, wallet) {
  const name = `transfers-${wallet.key}`;
  return rows[name].map((transfer) => ({
    ...transfer,
    day: reads[name].findIndex(holdsBlock(transfer.block)),
  }));
}

export const tokens = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    symbol: "WETH",
    decimals: 18,
  },
};
const ethDecimals = 18;
const shownTransfers = 25;

const ensName = (rows, wallet) =>
  rows[`ens-${wallet.key}`]?.findLast((row) => row.address === wallet.address)
    ?.name;
const balanceOf = (rows, wallet) =>
  rows.balance.findLast((row) => row.owner === wallet.address)?.balance ?? "0";
// Testril returns lowercase hex addresses, so plain equality is exact.
const involves = (transfer, address) =>
  transfer.from === address || transfer.to === address;
const directionOf = (transfer, address) =>
  transfer.from === transfer.to
    ? "self"
    : transfer.from === address
      ? "out"
      : "in";

export function check({ rows, reads }) {
  const passed = [];
  for (const wallet of wallets) {
    const label = ensName(rows, wallet) || wallet.address;
    if (!ensName(rows, wallet))
      throw new Error(`No ENS name recorded for ${wallet.address}.`);
    const transfers = transfersOf({ rows, reads }, wallet);
    const outside = transfers.find((t) => t.day < 0);
    if (outside)
      throw new Error(
        `${label} has a transfer at block ${outside.block} outside the window.`,
      );
    const stranger = transfers.find((t) => !involves(t, wallet.address));
    if (stranger)
      throw new Error(
        `Transfer ${stranger.tx} in ${label}'s list names neither ${wallet.address} as sender nor as recipient.`,
      );
    passed.push(
      `${label}: ${transfers.length} transfers, each with the wallet as sender or recipient; ENS name present`,
    );
  }
  return passed;
}

export function formatUnits(raw, decimals, places) {
  const scale = 10n ** BigInt(decimals - places);
  const rounded = (BigInt(raw) + scale / 2n) / scale;
  const unit = 10n ** BigInt(places);
  const whole = (rounded / unit).toLocaleString("en-US");
  return `${whole}.${String(rounded % unit).padStart(places, "0")}`;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function transferView(transfer, wallet) {
  const token = tokens[transfer.token];
  const direction = directionOf(transfer, wallet.address);
  return {
    block: transfer.block,
    direction,
    counterparty: shortAddress(
      direction === "in" ? transfer.from : transfer.to,
    ),
    token: token.symbol,
    amount: formatUnits(transfer.value, token.decimals, 2),
    tx: shortAddress(transfer.tx),
  };
}

function dailyCounts(transfers, wallet, dayCount) {
  const days = Array.from({ length: dayCount }, () => ({
    in: 0,
    out: 0,
    self: 0,
  }));
  for (const transfer of transfers.filter((t) => t.day >= 0))
    days[transfer.day][directionOf(transfer, wallet.address)] += 1;
  return days;
}

export function shape({ rows, reads }, binds) {
  const week = weekOf(binds);
  return {
    week: { first: week.first, last: week.last },
    wallets: wallets.map((wallet) => {
      const transfers = transfersOf({ rows, reads }, wallet);
      return {
        address: wallet.address,
        name: ensName(rows, wallet),
        balance: `${formatUnits(balanceOf(rows, wallet), ethDecimals, 4)} ETH`,
        transferCount: transfers.length,
        daily: dailyCounts(transfers, wallet, week.days.length),
        transfers: [...transfers]
          .sort((a, b) => b.block - a.block)
          .slice(0, shownTransfers)
          .map((transfer) => transferView(transfer, wallet)),
      };
    }),
  };
}
