import spec from "../testril.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const supplyWindow = binds.supply.window;
export const edgesWindow = binds["usdc-edges"].window;
export const usdc = binds["usdc-edges"].params.token_address;
export const usdt = binds.supply.params.tokens.find((token) => token !== usdc);
export const ensAddresses = spec.binds
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
    spec.binds
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
