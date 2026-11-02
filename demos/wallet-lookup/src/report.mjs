import spec from "../testril.json" with { type: "json" };

const binds = spec.binds;
export const weekWindow = binds.find((bind) =>
  bind.name.startsWith("transfers-"),
).window;
export const wallets = binds
  .filter((bind) => bind.function_slug === "ens.primary_name")
  .map((bind) => ({
    key: bind.name.replace("ens-", ""),
    address: bind.params.address,
  }));
export const blocksPerDay = 7200;
export const tokens = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    symbol: "WETH",
    decimals: 18,
  },
};
const weekDays = (weekWindow.to_block - weekWindow.from_block) / blocksPerDay;
const ethDecimals = 18;
const shownTransfers = 25;

const ensName = (rows, wallet) =>
  rows[`ens-${wallet.key}`]?.find((row) => row.address === wallet.address)
    ?.name;
const balanceOf = (rows, wallet) =>
  rows.balance.find((row) => row.owner === wallet.address)?.balance ?? "0";
// Testril returns lowercase hex addresses, so plain equality is exact.
const involves = (transfer, address) =>
  transfer.from === address || transfer.to === address;
const directionOf = (transfer, address) =>
  transfer.from === transfer.to
    ? "self"
    : transfer.from === address
      ? "out"
      : "in";

export function check(rows) {
  const passed = [];
  for (const wallet of wallets) {
    const label = ensName(rows, wallet) || wallet.address;
    if (!ensName(rows, wallet))
      throw new Error(`No ENS name recorded for ${wallet.address}.`);
    const transfers = rows[`transfers-${wallet.key}`];
    const stranger = transfers.find((t) => !involves(t, wallet.address));
    if (stranger)
      throw new Error(
        `Transfer ${stranger.tx} in ${label}'s list names neither ${wallet.address} as sender nor as recipient.`,
      );
    const outside = transfers.find(
      (t) => t.block < weekWindow.from_block || t.block >= weekWindow.to_block,
    );
    if (outside)
      throw new Error(
        `${label} has a transfer at block ${outside.block} outside the window.`,
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

function dailyCounts(transfers, wallet) {
  const days = Array.from({ length: weekDays }, () => ({
    in: 0,
    out: 0,
    self: 0,
  }));
  for (const transfer of transfers) {
    const day = Math.floor(
      (transfer.block - weekWindow.from_block) / blocksPerDay,
    );
    days[day][directionOf(transfer, wallet.address)] += 1;
  }
  return days;
}

export function shape(rows) {
  return {
    weekWindow,
    wallets: wallets.map((wallet) => {
      const transfers = rows[`transfers-${wallet.key}`];
      return {
        address: wallet.address,
        name: ensName(rows, wallet),
        balance: `${formatUnits(balanceOf(rows, wallet), ethDecimals, 4)} ETH`,
        transferCount: transfers.length,
        daily: dailyCounts(transfers, wallet),
        transfers: [...transfers]
          .sort((a, b) => b.block - a.block)
          .slice(0, shownTransfers)
          .map((transfer) => transferView(transfer, wallet)),
      };
    }),
  };
}
