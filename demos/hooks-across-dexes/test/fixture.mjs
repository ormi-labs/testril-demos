import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { venues, windowDays, zeroAddress } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const usdt = "0x55d398326f99059ff775485246999027b3197955";
const usdc = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
const usd1 = "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d";
const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const cake = "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82";

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, digits) =>
  Array.from({ length: digits }, () =>
    Math.floor(random() * 16).toString(16),
  ).join("");
const raw = (dollars, random) =>
  BigInt(Math.round(dollars)) * 10n ** 18n + BigInt(Math.floor(random() * 1e9));

const pairs = Object.fromEntries(
  Object.entries({
    "bnb-usdt": [zeroAddress, usdt],
    "usdt-usdc": [usdt, usdc],
    "usd1-wbnb": [usd1, wbnb],
    "wbnb-usdt": [wbnb, usdt],
    "wbnb-cake": [wbnb, cake],
    "bnb-cake": [zeroAddress, cake],
  }).map(([name, tokens]) => [name, tokens.toSorted()]),
);
const hookless = (pair, dollars) => ({ pair, dollars, hooked: false });
const hooked = (pair, dollars) => ({ pair, dollars, hooked: true });
const poolSpecs = {
  cl: [
    hookless("bnb-usdt", 60e6),
    hookless("wbnb-usdt", 25e6),
    hookless("usdt-usdc", 18e6),
    hookless("usd1-wbnb", 9e6),
    hookless("wbnb-cake", 7e6),
    hookless("bnb-cake", 3e6),
    hooked("bnb-usdt", 8e6),
    hooked("usd1-wbnb", 2e6),
    hooked("wbnb-cake", 1.5e6),
  ],
  bin: [
    hookless("bnb-usdt", 10e6),
    hookless("usdt-usdc", 6e6),
    hookless("wbnb-cake", 1e6),
    hooked("usdt-usdc", 5e6),
    hooked("bnb-usdt", 2.5e6),
  ],
  v4: [
    hookless("bnb-usdt", 4e6),
    hookless("usd1-wbnb", 1.2e6),
    hookless("wbnb-cake", 0.4e6),
    hooked("bnb-usdt", 3.5e6),
    hooked("usd1-wbnb", 2e6),
    hooked("wbnb-cake", 0.6e6),
    hooked("usdt-usdc", 1.1e6),
  ],
};
const inactivePools = { cl: 2, bin: 1, v4: 2 };

function poolList(random, venue, hookAddresses) {
  const pools = poolSpecs[venue.key].map((spec) => ({ ...spec, active: true }));
  for (let i = 0; i < inactivePools[venue.key]; i++)
    pools.push({
      pair: "wbnb-cake",
      dollars: 0,
      hooked: i % 2 === 0,
      active: false,
    });
  return pools.map((pool) => ({
    ...pool,
    id: `0x${hex(random, 64)}`,
    hooks: pool.hooked
      ? hookAddresses[Math.floor(random() * hookAddresses.length)]
      : zeroAddress,
  }));
}

function listRow(venue, pool, index) {
  const [currency0, currency1] = pairs[pool.pair];
  const bounds = spec.binds.find(
    (bind) => bind.name === venue.poolsBind,
  ).window;
  const row = {
    block: bounds.from_block + 1000 + index * 1000003,
    currency0,
    currency1,
    fee: "2500",
    hooks: pool.hooks,
    pool: pool.id,
  };
  return venue.key === "bin"
    ? { ...row, bin_step: "10", hooks_registration: pool.hooked ? "1" : "0" }
    : {
        ...row,
        tick_spacing: "50",
        ...(venue.key === "cl" && {
          hooks_registration: pool.hooked ? "1" : "0",
        }),
      };
}

function volumeRows(random, pool) {
  const [currency0, currency1] = pairs[pool.pair];
  const stables = [usdt, usdc, usd1];
  const stable0 = stables.includes(currency0);
  const bothStable = stables.includes(currency0) && stables.includes(currency1);
  return windowDays().flatMap((day) => {
    if (!pool.active || random() < 0.15) return [];
    const stable = raw(pool.dollars * (0.5 + random()), random);
    const other = bothStable
      ? (stable * (1000n + BigInt(Math.floor(random() * 3)) - 1n)) / 1000n
      : raw((pool.dollars / 600) * (0.5 + random()), random);
    return [
      {
        day,
        pool: pool.id,
        swaps: String(50 + Math.floor((pool.dollars / 1e4) * (0.5 + random()))),
        volume0: (stable0 ? stable : other).toString(),
        volume1: (stable0 ? other : stable).toString(),
      },
    ];
  });
}

export function fixture() {
  const random = seeded(11);
  const hookAddresses = Array.from({ length: 4 }, () => `0x${hex(random, 40)}`);
  const rows = {};
  for (const venue of venues) {
    const pools = poolList(random, venue, hookAddresses);
    rows[venue.poolsBind] = pools.map((pool, index) =>
      listRow(venue, pool, index),
    );
    rows[venue.volumeBind] = pools.flatMap((pool) => volumeRows(random, pool));
  }
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
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
