import { bindsAt, venuesOf, windowDays } from "../src/report.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const venues = venuesOf(fixtureBinds);

const quietDayChance = 0.2;

const traded = {
  "aqua-ethereum": [
    ["0xdac17f958d2ee523a2206206994597c13d831ec7", 6, 40_000],
    ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6, 55_000],
    ["0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", 18, 12],
    ["0x111111111117dc0aa78b770fa6a738034120c302", 18, 9_000],
  ],
  "aqua-base": [
    ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6, 20_000],
    ["0x4200000000000000000000000000000000000006", 18, 6],
  ],
  "tessera-base": [
    ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6, 3_000],
    ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", 8, 0.04],
    ["0x4200000000000000000000000000000000000006", 18, 1.2],
  ],
};

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function venueRows(venue, random) {
  const { token, count, amount } = venue.fields;
  return traded[venue.name].flatMap(([address, decimals, perPush]) =>
    windowDays(venue.window)
      .filter(() => random() > quietDayChance)
      .map((day) => {
        const n = 1 + Math.floor(random() ** 2 * 60);
        const units = BigInt(Math.round(perPush * n * (0.5 + random()) * 1e6));
        return {
          day,
          [token]: address,
          [count]: String(n),
          [amount]: String((units * 10n ** BigInt(decimals)) / 1000000n),
        };
      }),
  );
}

export function fixture() {
  const random = seeded(44);
  return Object.fromEntries(
    venues.map((venue) => [venue.name, venueRows(venue, random)]),
  );
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
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
