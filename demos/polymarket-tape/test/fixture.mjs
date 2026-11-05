import { readParts } from "../src/fetch.mjs";
import { bindsAt, exchanges, zeroWord } from "../src/report.mjs";
import { blockAt as chainBlockAt, resolveWindow } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const payoutsWindow = fixtureBinds.find(
  (bind) => bind.name === "payouts",
).window;
const fillWindow = {
  from_block: chainBlockAt(payoutsWindow.from_time),
  to_block: chainBlockAt(payoutsWindow.to_time),
};
const payoutWindow = fillWindow;

const fillCount = 280;
const blocksInDay = fillWindow.to_block - fillWindow.from_block;
const [ctfExchange, negRiskExchange, v2Exchange] = exchanges;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

let random;
const hex = (bytes) =>
  Array.from({ length: bytes }, () =>
    Math.floor(random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
const pick = (list, skew = 1) =>
  list[Math.floor(random() ** skew * list.length)];

let makers, takers, builders, tokenIds;
function startFromSeed() {
  random = seeded(11);
  makers = Array.from({ length: 12 }, () => `0x${hex(20)}`);
  takers = Array.from({ length: 6 }, () => `0x${hex(20)}`);
  builders = Array.from({ length: 4 }, () => `0x${hex(32)}`);
  tokenIds = Array.from({ length: 6 }, () => BigInt(`0x${hex(32)}`).toString());
}
const basePrice = [0.4, 0.12, 0.91, 0.05, 0.5, 0.67];
const busiestMarket = 0;

function priceBasisPoints(market, block) {
  const dayFraction = (block - fillWindow.from_block) / blocksInDay;
  const drift = market === busiestMarket ? 0.38 * dayFraction : 0;
  const noise = (random() - 0.5) * 0.04;
  return Math.round(
    Math.min(0.98, Math.max(0.02, basePrice[market] + drift + noise)) * 1e4,
  );
}

function fillRow({ block, market, dollars, exchange, builder, basisPoints }) {
  const collateral =
    BigInt(Math.round(dollars)) * 1000000n + BigInt(Math.floor(random() * 1e6));
  const bp = BigInt(basisPoints ?? priceBasisPoints(market, block));
  const tokens = (collateral * 10000n + bp - 1n) / bp;
  const isBuy = random() < 0.5;
  const fee = (amount) => (amount / 200n).toString();
  const version2 = exchange === v2Exchange;
  return {
    block,
    log_index: String(Math.floor(random() * 300)),
    tx: `0x${hex(32)}`,
    exchange,
    exchange_version: version2 ? "2" : "1",
    order_hash: `0x${hex(32)}`,
    maker: pick(makers, 1.4),
    taker: pick(takers),
    token_id: tokenIds[market],
    is_buy: isBuy,
    collateral_amount: collateral.toString(),
    token_amount: tokens.toString(),
    collateral_fee: version2 || !isBuy ? fee(collateral) : "0",
    token_fee: !version2 && isBuy ? fee(tokens) : "0",
    builder: version2 ? builder : zeroWord,
    metadata: zeroWord,
  };
}

const randomBlock = () =>
  fillWindow.from_block + Math.floor(random() * blocksInDay);

function randomFill() {
  const exchange = pick([ctfExchange, negRiskExchange, v2Exchange, v2Exchange]);
  return fillRow({
    block: randomBlock(),
    market: Math.floor(random() ** 1.6 * tokenIds.length),
    dollars: 20 + random() ** 4 * 9000,
    exchange,
    builder: pick(builders, 1.8),
  });
}

function whaleFills() {
  const whale = (market, dollars, basisPoints) =>
    fillRow({
      block: randomBlock(),
      market,
      dollars,
      basisPoints,
      exchange: v2Exchange,
      builder: builders[0],
    });
  return [
    whale(0, 640000),
    whale(2, 410000, 10000),
    whale(4, 280000),
    whale(0, 175000),
  ];
}

function payoutRows() {
  const resolutions = [
    [1n, 0n],
    [0n, 1n],
    [1n, 1n],
  ];
  return resolutions.flatMap((numerators, index) => {
    const block = payoutWindow.from_block + 900 + index * 1500;
    const conditionId = `0x${hex(32)}`;
    return numerators.map((numerator, outcome) => ({
      block,
      condition_id: conditionId,
      outcome_index: String(outcome),
      payout_numerator: numerator.toString(),
      payout_denominator: numerators.reduce((a, b) => a + b, 0n).toString(),
    }));
  });
}

export const fillsIn = (rows) => rows.fills;

export function fixture() {
  startFromSeed();
  const fills = [
    ...Array.from({ length: fillCount - 4 }, randomFill),
    ...whaleFills(),
  ].sort((a, b) => a.block - b.block || a.log_index - b.log_index);
  return {
    fills,
    payouts: payoutRows(),
  };
}

const within = (rows, window) => {
  const { from_block, to_block } = resolveWindow(window);
  return rows.filter((row) => row.block >= from_block && row.block < to_block);
};

export function fixtureFetched(rows = fixture()) {
  const reads = Object.fromEntries(
    fixtureBinds.map((bind) => [
      bind.name,
      readParts(bind.window, bind.read).map((part) => ({
        ...part,
        ...resolveWindow(part),
        count: within(rows[bind.name], part).length,
      })),
    ]),
  );
  return { rows, reads };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = fixtureBinds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        candidate.window.from_time <= window.from_time &&
        candidate.window.to_time >= window.to_time,
    );
    return within(rows[bind.name], window);
  };
}
