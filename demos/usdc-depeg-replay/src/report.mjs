import spec from "../testril.json" with { type: "json" };
import hourFirstBlocks from "./hour-first-blocks.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const hourWindow = binds.supply.window;
export const edgesWindow = binds["usdc-edges"].window;
export const usdc = binds["usdc-edges"].params.token_address;
export const feed = binds["usdc-usd-feed"].params.feeds[0];
const decimals = 6n;
const feedDecimals = 8;
const priceFloor = 80000000n;
const priceCeiling = 102000000n;
const topBurners = 10;

const addHours = (hour, step) =>
  new Date(Date.parse(`${hour}:00:00Z`) + step * 3600000)
    .toISOString()
    .slice(0, 13);

export const hours = [];
for (let h = hourWindow.from_hour; h < hourWindow.to_hour; h = addHours(h, 1))
  hours.push(h);

export const hourBlocks = (index) => ({
  from: hourFirstBlocks[index],
  to: hourFirstBlocks[index + 1],
});

function hourIndexOf(block) {
  let index = 0;
  while (hourFirstBlocks[index + 1] <= block) index++;
  return index;
}

const byHour = (rows, field) =>
  new Map(rows.map((row) => [row.hour, BigInt(row[field])]));

const lowercased = (edges) =>
  edges.map((edge) => ({
    ...edge,
    from: edge.from.toLowerCase(),
    to: edge.to.toLowerCase(),
  }));

export function mintsAndBurns(edges) {
  const net = hours.map(() => ({ minted: 0n, burned: 0n }));
  for (const edge of lowercased(edges)) {
    const hour = net[hourIndexOf(edge.block)];
    if (edge.from === zeroAddress) hour.minted += BigInt(edge.amount);
    if (edge.to === zeroAddress) hour.burned += BigInt(edge.amount);
  }
  return net;
}

export function check(rows) {
  if (
    hourFirstBlocks[0] !== edgesWindow.from_block ||
    hourFirstBlocks.at(-1) !== edgesWindow.to_block
  )
    throw new Error(
      "hour-first-blocks.json does not span the usdc-edges window in testril.json.",
    );
  const supply = byHour(
    rows.supply.filter((row) => row.token.toLowerCase() === usdc),
    "total_supply",
  );
  const prices = byHour(rows["usdc-usd-feed"], "answer");
  for (const [name, series] of [
    ["USDC supply", supply],
    ["Chainlink USDC/USD answer", prices],
  ]) {
    const missing = hours.filter((hour) => !series.has(hour));
    if (missing.length)
      throw new Error(`${name} is missing ${missing.join(", ")}.`);
  }
  const outside = rows["usdc-edges"].filter(
    (edge) =>
      edge.block < edgesWindow.from_block || edge.block >= edgesWindow.to_block,
  );
  if (outside.length)
    throw new Error(`Edge at block ${outside[0].block} is outside the window.`);
  const flows = mintsAndBurns(rows["usdc-edges"]);
  hours.forEach((hour, index) => {
    if (index === 0) return;
    const change = supply.get(hour) - supply.get(hours[index - 1]);
    const { minted, burned } = flows[index];
    if (change !== minted - burned)
      throw new Error(
        `USDC supply changed by ${change} in ${hour}, but mints minus burns in blocks ${hourBlocks(index).from}–${hourBlocks(index).to - 1} is ${minted - burned}.`,
      );
  });
  const outOfRange = hours.filter(
    (hour) => prices.get(hour) < priceFloor || prices.get(hour) > priceCeiling,
  );
  if (outOfRange.length)
    throw new Error(
      `Chainlink USDC/USD answer is outside $0.80–$1.02 in ${outOfRange[0]}.`,
    );
  return [
    `USDC supply and the Chainlink answer are present for all ${hours.length} hours`,
    `USDC supply change equals mints minus burns from the transfer edges in each of the ${hours.length - 1} hours after the first`,
    `The Chainlink USDC/USD answer stays between $0.80 and $1.02 in every hour`,
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

export function formatPrice(answer) {
  const tenThousandths = (answer + 5000n) / 10000n;
  return `$${tenThousandths / 10000n}.${String(tenThousandths % 10000n).padStart(4, "0")}`;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const millions = (raw) => Number(raw / 10n ** decimals) / 1e6;
const hourLabel = (hour) => `${hour.slice(5, 10)} ${hour.slice(11)}:00`;

function burners(edges) {
  const totals = new Map();
  for (const edge of lowercased(edges).filter((e) => e.to === zeroAddress)) {
    const entry = totals.get(edge.from) ?? { amount: 0n, count: 0n };
    entry.amount += BigInt(edge.amount);
    entry.count += BigInt(edge.count);
    totals.set(edge.from, entry);
  }
  const burned = [...totals.values()].reduce((sum, e) => sum + e.amount, 0n);
  return [...totals]
    .sort(([, a], [, b]) => (b.amount > a.amount ? 1 : -1))
    .slice(0, topBurners)
    .map(([address, { amount, count }]) => ({
      address: shortAddress(address),
      amount: formatUsd(amount),
      share: `${(Number((amount * 1000n) / burned) / 10).toFixed(1)}%`,
      burns: count.toString(),
    }));
}

export function shape(rows) {
  const prices = byHour(rows["usdc-usd-feed"], "answer");
  const flows = mintsAndBurns(rows["usdc-edges"]);
  const timeline = hours.map((hour, index) => {
    const { minted, burned } = flows[index];
    return {
      hour,
      label: hourLabel(hour),
      price: formatPrice(prices.get(hour)),
      priceValue: Number(prices.get(hour)) / 10 ** feedDecimals,
      netBurn: formatCompact(burned - minted, true),
      netBurnMillions: millions(burned - minted),
    };
  });
  const lowest = timeline.reduce((a, b) =>
    b.priceValue < a.priceValue ? b : a,
  );
  const peak = timeline.reduce((a, b) =>
    b.netBurnMillions > a.netBurnMillions ? b : a,
  );
  const minted = flows.reduce((sum, f) => sum + f.minted, 0n);
  const burned = flows.reduce((sum, f) => sum + f.burned, 0n);
  return {
    hourWindow,
    edgesWindow,
    lowest: { price: lowest.price, hour: lowest.label },
    peakBurn: { amount: peak.netBurn, hour: peak.label },
    minted: formatCompact(minted),
    burned: formatCompact(burned),
    net: formatCompact(burned - minted, true),
    timeline,
    burners: burners(rows["usdc-edges"]),
  };
}
