export const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const feed = "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6";
export const zeroAddress = "0x0000000000000000000000000000000000000000";
const hourMs = 3600000;
const replayStart = "2023-03-10T00:00:00Z";
const replayEnd = "2023-03-15T00:00:00Z";
const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);

export const hours = [];
for (let t = Date.parse(replayStart); t < Date.parse(replayEnd); t += hourMs)
  hours.push(hourKey(t));

const edgesBind = "usdc-edges";

export const binds = [
  {
    name: "supply",
    function_slug: "erc20.token_supply",
    chain_id: 1,
    params: { tokens: [usdc], by: "hour" },
    window: { from_time: replayStart, to_time: replayEnd },
  },
  {
    name: edgesBind,
    function_slug: "erc20.transfer_edges",
    chain_id: 1,
    params: { token_address: usdc },
    window: { from_time: replayStart, to_time: replayEnd },
    read: { chunk_hours: 1 },
  },
  {
    name: "usdc-usd-feed",
    function_slug: "aggregator.latest_answer",
    chain_id: 1,
    params: { feeds: [feed], by: "hour" },
    window: { from_time: replayStart, to_time: replayEnd },
  },
];

export const bindsAt = () => binds;

const decimals = 6n;
const feedDecimals = 8;
const priceFloor = 80000000n;
const priceCeiling = 102000000n;
const topBurners = 10;

const byHour = (rows, field) =>
  new Map(rows.map((row) => [row.hour, BigInt(row[field])]));

const lowercased = (edges) =>
  edges.map((edge) => ({
    ...edge,
    from: edge.from.toLowerCase(),
    to: edge.to.toLowerCase(),
  }));

export function edgesByHour({ rows, reads }) {
  const byHour = new Map(hours.map((hour) => [hour, []]));
  for (const edge of lowercased(rows[edgesBind])) {
    const read = reads[edgesBind].find(
      (candidate) =>
        edge.block >= candidate.from_block && edge.block < candidate.to_block,
    );
    const hour = read?.from_time.slice(0, 13);
    if (!byHour.has(hour))
      throw new Error(
        `Transfer edge at block ${edge.block} is outside the replay hours.`,
      );
    byHour.get(hour).push(edge);
  }
  return byHour;
}

export function mintsAndBurns(fetched) {
  const byHour = edgesByHour(fetched);
  return hours.map((hour) => {
    const net = { minted: 0n, burned: 0n };
    for (const edge of byHour.get(hour)) {
      if (edge.from === zeroAddress) net.minted += BigInt(edge.amount);
      if (edge.to === zeroAddress) net.burned += BigInt(edge.amount);
    }
    return net;
  });
}

export function check({ rows, reads }) {
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
  const flows = mintsAndBurns({ rows, reads });
  hours.forEach((hour, index) => {
    if (index === 0) return;
    const change = supply.get(hour) - supply.get(hours[index - 1]);
    const { minted, burned } = flows[index];
    if (change !== minted - burned)
      throw new Error(
        `USDC supply changed by ${change} in ${hour}, but mints minus burns in that hour is ${minted - burned}.`,
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

export function shape({ rows, reads }) {
  const prices = byHour(rows["usdc-usd-feed"], "answer");
  const flows = mintsAndBurns({ rows, reads });
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
    hourWindow: { first: hours[0], last: hours.at(-1) },
    lowest: { price: lowest.price, hour: lowest.label },
    peakBurn: { amount: peak.netBurn, hour: peak.label },
    minted: formatCompact(minted),
    burned: formatCompact(burned),
    net: formatCompact(burned - minted, true),
    timeline,
    burners: burners(rows[edgesBind]),
  };
}
