import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { usdc, volumeDays, zeroAddress } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const wmon = "0x3bd359c1119da7da1d913d1c4d2b7c461115433a";
const weth = "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242";
const wbtc = "0x0555e30da8f98308edb960aa94c0db47230d2b9c";
const usdt0 = "0xe7cd86e13ac4309349f30b3435a9d337750fc82d";

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hexAddress = (random) =>
  `0x${Array.from({ length: 40 }, () => Math.floor(random() * 16).toString(16)).join("")}`;

const tokens = (whole) => BigInt(whole) * 10n ** 18n;

const marketSpecs = [
  {
    base: zeroAddress,
    quote: usdc,
    dailyQuote: 4_200_000,
    quotePerBaseMilli: 30,
    takerBps: 2,
    makerBps: 1,
    activeShare: 1,
  },
  {
    base: weth,
    quote: usdc,
    dailyQuote: 1_150_000,
    quotePerBaseMilli: 3_400_000,
    takerBps: 3,
    makerBps: 1,
    activeShare: 1,
  },
  {
    base: wbtc,
    quote: usdc,
    dailyQuote: 780_000,
    quotePerBaseMilli: 95_000_000,
    takerBps: 3,
    makerBps: 1,
    activeShare: 1,
  },
  {
    base: wmon,
    quote: usdc,
    dailyQuote: 310_000,
    quotePerBaseMilli: 30,
    takerBps: 5,
    makerBps: 2,
    activeShare: 0.9,
  },
  {
    base: usdt0,
    quote: usdc,
    dailyQuote: 90_000,
    quotePerBaseMilli: 1_000,
    takerBps: 1,
    makerBps: 0,
    activeShare: 0.7,
  },
  {
    base: weth,
    quote: wmon,
    dailyQuote: 40_000,
    quotePerBaseMilli: 113_333_000,
    takerBps: 5,
    makerBps: 2,
    activeShare: 0.5,
  },
  {
    base: wbtc,
    quote: wmon,
    dailyQuote: 0,
    quotePerBaseMilli: 3_166_666_000,
    takerBps: 5,
    makerBps: 2,
    activeShare: 0,
  },
];

function marketRows(random) {
  return marketSpecs.map((spec, index) => ({
    block: 41_000_000 + index * 9_300_000 + Math.floor(random() * 1e5),
    market: hexAddress(random),
    base_asset: spec.base,
    quote_asset: spec.quote,
    vault: hexAddress(random),
    price_precision: "10000000",
    size_precision: "100000000000",
    tick_size: "100",
    min_size: "20000000000000",
    max_size: "200000000000000000",
    taker_fee_bps: String(spec.takerBps),
    maker_fee_bps: String(spec.makerBps),
    amm_spread: "30",
  }));
}

function volumeRows(random, markets) {
  const rows = [];
  for (const day of volumeDays())
    marketSpecs.forEach((spec, index) => {
      if (random() >= spec.activeShare) return;
      const quoteVolume =
        tokens(Math.round(spec.dailyQuote * (0.4 + random() * 1.2))) +
        BigInt(Math.floor(random() * 1e6)) * 10n ** 12n;
      const buy = (quoteVolume * BigInt(Math.floor(30 + random() * 40))) / 100n;
      const sell = quoteVolume - buy;
      const price = BigInt(spec.quotePerBaseMilli);
      const bps = (amount, rate) => (amount * BigInt(rate)) / 10000n;
      rows.push({
        day,
        market: markets[index].market,
        trades: String(
          20 +
            Math.floor(
              (Number(quoteVolume / 10n ** 18n) / 900) * (0.5 + random()),
            ),
        ),
        quote_volume: quoteVolume.toString(),
        base_fee: bps((buy * 1000n) / price, spec.takerBps).toString(),
        base_rebate: bps((buy * 1000n) / price, spec.makerBps).toString(),
        quote_fee: bps(sell, spec.takerBps).toString(),
        quote_rebate: bps(sell, spec.makerBps).toString(),
      });
    });
  return rows;
}

export function fixture() {
  const random = seeded(11);
  const markets = marketRows(random);
  return {
    demo: spec.demo,
    source: "synthetic",
    recordedAt,
    boundFunctions: Object.fromEntries(
      spec.binds.map((bind) => [
        bind.name,
        { function_slug: bind.function_slug, chain_id: bind.chain_id },
      ]),
    ),
    window: Object.fromEntries(spec.binds.map((b) => [b.name, b.window])),
    rows: { markets, volume: volumeRows(random, markets) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/synthetic.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
