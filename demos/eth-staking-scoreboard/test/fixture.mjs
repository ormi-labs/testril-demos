import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { windowDays } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const wei = 10n ** 18n;
const strategies = [
  "0x93c4b944d05dfe6df7645a86cd2206016c51564d",
  "0x1bee69b7dfffa4e2d53c2a2df135c388ad25dcd2",
  "0x54945180db7943c0ed0fee7edab2bd24620256bc",
];

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const ether = (amount, random) =>
  BigInt(Math.round(amount)) * wei + BigInt(Math.floor(random() * 1e9));

function walk(random, start, dailyDrift, noise, days) {
  let amount = start;
  return days.map((_, i) => {
    if (i > 0) amount += dailyDrift + (random() - 0.5) * noise;
    return Math.max(amount, 0);
  });
}

export function fixture() {
  const random = seeded(11);
  const days = windowDays;
  const pooled = walk(random, 9.05e6, 1500, 6000, days);
  const vaults = walk(random, 21000, 520, 900, days);
  const matic = walk(random, 6.8e6, -26000, 9000, days);
  const wbethSupply = walk(random, 372000, 90, 400, days);
  const [
    { params: lidoParams },
    { params: wbethParams },
    { params: maticParams },
  ] = spec.binds;
  let rate = 1.118e18;
  const wbethRows = days.map((day, i) => {
    rate += 2.1e13 + random() * 1e12;
    const exchangeRate = BigInt(Math.round(rate / 1e6)) * 10n ** 6n;
    const supply = ether(wbethSupply[i], random);
    return {
      day,
      wbeth: wbethParams.wbeth,
      exchange_rate: exchangeRate.toString(),
      staked_ether: ((supply * exchangeRate) / wei).toString(),
    };
  });
  const eigenRows = strategies.flatMap((strategy, s) => {
    const sizes = walk(random, 90000 / (s + 1), 120 / (s + 1), 500, days);
    return days.map((day, i) => ({
      day,
      strategy,
      total_shares: ether(sizes[i] * 0.9, random).toString(),
      underlying_amount: ether(sizes[i], random).toString(),
    }));
  });
  const rows = {
    lido: days.map((day, i) => ({
      day,
      steth: lidoParams.steth,
      pooled_ether: ether(pooled[i], random).toString(),
      vault_ether: ether(vaults[i], random).toString(),
    })),
    wbeth: wbethRows,
    stmatic: days.map((day, i) => ({
      day,
      st_matic: maticParams.st_matic,
      pooled_matic: ether(matic[i], random).toString(),
    })),
    eigenlayer: eigenRows,
  };
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
    new URL("../recordings/synthetic.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
