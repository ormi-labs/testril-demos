import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { venues, windowDays } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
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
    rows: Object.fromEntries(
      venues.map((venue) => [venue.name, venueRows(venue, random)]),
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
