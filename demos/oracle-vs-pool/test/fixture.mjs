import {
  bindsAt,
  btcFeed,
  ethFeed,
  sqrtFromPrice,
  usdcFeed,
  windowHours,
} from "../src/report.mjs";

export const fixtureNow = Date.parse("2026-11-01T00:30:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const poolId = fixtureBinds[0].params.pool;
const ethDeviationBasisPoints = 50;
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

function followMarket(market, thresholdBasisPoints, heartbeatHours) {
  let answer = market[0];
  return market.map((price, i) => {
    const heartbeatDue = i % heartbeatHours === 0;
    if (
      heartbeatDue ||
      Math.abs(price / answer - 1) * 10000 > thresholdBasisPoints
    )
      answer = price;
    return answer;
  });
}

export function fixture() {
  const random = seeded(11);
  const hours = windowHours(fixtureBinds);
  const ethMarket = marketWalk(random, 3180, 0.008, hours);
  const btcMarket = marketWalk(random, 98400, 0.006, hours);
  const feeds = [
    [ethFeed, followMarket(ethMarket, ethDeviationBasisPoints, 1)],
    [btcFeed, followMarket(btcMarket, 50, Infinity)],
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
    pool: hours.map((hour, i) => ({
      hour,
      pool: poolId,
      sqrt_price_x96: sqrtFromPrice(toScaled(poolPrices[i])).toString(),
      tick: String(tickFromDollars(poolPrices[i])),
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
  };
}

const tickFromDollars = (dollarsPerEth) =>
  Math.floor(Math.log(dollarsPerEth * 1e-12) / Math.log(1.0001));

function holdLast(answers) {
  let last;
  return answers.map((answer) => (last = answer ?? last));
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows(rows = fixture()) {
  return (bound) =>
    rows[
      fixtureBinds.find(
        (candidate) =>
          candidate.function_slug === bound.function_slug &&
          candidate.chain_id === bound.chain_id &&
          sameParams(candidate.params, bound.params),
      ).name
    ];
}
