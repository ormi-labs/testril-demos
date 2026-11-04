import { binds, days, knownPools } from "../src/report.mjs";

const [wethUsdc, usdcCbbtc] = Object.keys(knownPools);
const otherPools = Array.from(
  { length: 8 },
  (_, i) => `0x${(i + 1).toString(16).repeat(40)}`,
);

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const units = (amount, decimals, random) =>
  BigInt(Math.round(amount)) * 10n ** BigInt(decimals) +
  BigInt(Math.floor(random() * 10 ** Math.min(decimals, 6)));

function poolRows(random, pool, dailyDollars, volumes, skipOdds) {
  return days()
    .filter(() => random() >= skipOdds)
    .map((day) => {
      const dollars = dailyDollars * (0.6 + random() * 0.8);
      return {
        day,
        pool,
        swaps: String(Math.round(dollars / 4000) + 1),
        ...volumes(dollars, random),
      };
    });
}

export function fixture() {
  const random = seeded(11);
  const rows = [
    ...poolRows(
      random,
      wethUsdc,
      60e6,
      (d, r) => ({
        volume0: units(d / 3500, 18, r).toString(),
        volume1: units(d, 6, r).toString(),
      }),
      0,
    ),
    ...poolRows(
      random,
      usdcCbbtc,
      90e6,
      (d, r) => ({
        volume0: units(d, 6, r).toString(),
        volume1: units(d / 95000, 8, r).toString(),
      }),
      0,
    ),
    ...otherPools.flatMap((pool, i) =>
      poolRows(
        random,
        pool,
        40e6 / (i + 1),
        (d, r) => ({
          volume0: units(d / 2, 18, r).toString(),
          volume1: units(d / 2, 6, r).toString(),
        }),
        i / 10,
      ),
    ),
  ];
  return { "pool-volume": rows };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const covers = (outer, inner) =>
  Object.keys(inner).every((key) =>
    key.startsWith("from_")
      ? inner[key] >= outer[key]
      : inner[key] <= outer[key],
  );

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = binds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        covers(candidate.window, window),
    );
    return "from_block" in window && bind.read
      ? rows[bind.name].filter(
          (row) =>
            row.block >= window.from_block && row.block < window.to_block,
        )
      : rows[bind.name];
  };
}
