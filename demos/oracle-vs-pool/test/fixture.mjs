import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  btcFeed,
  ethFeed,
  sqrtFromPrice,
  usdcFeed,
  windowHours,
} from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const poolId = spec.binds[0].params.pool;
const hourlyFeedUpdateBasisPoints = 15;
const usdcHeartbeatHours = 24;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const toScaled = (dollars) => BigInt(Math.round(dollars * 1e8));

function marketWalk(random, start, volatility, hours) {
  let price = start;
  return hours.map(() => {
    price *= 1 + (random() - 0.5) * volatility;
    return price;
  });
}

function followMarket(market, thresholdBasisPoints) {
  let answer = market[0];
  return market.map((price) => {
    if (Math.abs(price / answer - 1) * 10000 > thresholdBasisPoints)
      answer = price;
    return answer;
  });
}

export function fixture() {
  const random = seeded(11);
  const hours = windowHours();
  const ethMarket = marketWalk(random, 3180, 0.008, hours);
  const btcMarket = marketWalk(random, 98400, 0.006, hours);
  const feeds = [
    [ethFeed, followMarket(ethMarket, hourlyFeedUpdateBasisPoints)],
    [btcFeed, followMarket(btcMarket, 50)],
    [
      usdcFeed,
      hours.map((_, i) =>
        i % usdcHeartbeatHours === 0 ? 1 + (random() - 0.5) * 0.0004 : null,
      ),
    ],
  ].map(([feed, answers]) => [feed, holdLast(answers)]);
  const poolPrices = ethMarket.map((price, i) =>
    i === 100 ? price * 1.014 : price * (1 + (random() - 0.5) * 0.004),
  );
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
    rows: {
      pool: hours.map((hour, i) => ({
        hour,
        pool: poolId,
        sqrt_price_x96: sqrtFromPrice(toScaled(poolPrices[i])).toString(),
        tick: "-197833",
        liquidity: String(71658789467938n + BigInt(i) * 1000000000n),
        lp_fee: "500",
        protocol_fee_zero_for_one: "0",
        protocol_fee_one_for_zero: "0",
      })),
      feeds: feeds.flatMap(([feed, answers]) =>
        hours.map((hour, i) => ({
          hour,
          feed,
          answer: toScaled(answers[i]).toString(),
        })),
      ),
    },
  };
}

function holdLast(answers) {
  let last;
  return answers.map((answer) => (last = answer ?? last));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
