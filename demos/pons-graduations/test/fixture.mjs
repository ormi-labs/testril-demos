import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { feeDays } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const launchCount = 48;
const graduatedCount = 14;
const nativeCoin = `0x${"0".repeat(40)}`;
const wei = 10n ** 18n;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const address = (random) =>
  `0x${Array.from({ length: 5 }, () =>
    Math.floor(random() * 4294967296)
      .toString(16)
      .padStart(8, "0"),
  ).join("")}`;

const milliEth = (thousandths) =>
  (BigInt(Math.round(thousandths)) * wei) / 1000n;

function launchRows(random) {
  const { factory } = spec.binds[0].params;
  const blocks = spec.binds[0].window;
  const step = Math.floor((blocks.to_block - blocks.from_block) / launchCount);
  return Array.from({ length: launchCount }, (_, i) => ({
    block: blocks.from_block + i * step + Math.floor(random() * step),
    curve: address(random),
    factory,
    token: address(random),
    deployer: address(random),
    pair_token: nativeCoin,
    launch_config_id: "0",
    graduation_threshold: (4n * wei + wei / 5n).toString(),
  }));
}

function graduationRows(launches, random) {
  return launches.slice(0, graduatedCount).map((launch, i) => ({
    block: launch.block + 20000 + Math.floor(random() * 5000),
    pool_id_prefix: `${address(random)}${"0".repeat(24)}`.slice(0, 66),
    position_id: String(1000 + i),
    token: launch.token,
  }));
}

function volumeRows(launches, random) {
  const days = feeDays();
  return days.flatMap((day, d) =>
    launches
      .filter((_, i) => i % 3 === d % 3)
      .map((launch) => {
        const buys = 2 + Math.floor(random() * 30);
        const sells = Math.floor(random() * buys);
        const bought = milliEth(buys * (50 + random() * 400));
        const sold = milliEth(sells * (40 + random() * 300));
        return {
          day,
          curve: launch.curve,
          trades: buys + sells,
          buy_count: buys,
          sell_count: sells,
          bought: bought.toString(),
          sold: sold.toString(),
          fees: ((bought + sold) / 100n).toString(),
          taxes: "0",
        };
      }),
  );
}

function feeRows(graduations, random) {
  const days = feeDays();
  return graduations.flatMap((graduation, i) =>
    days.slice(i + 2).flatMap((day) => {
      if (random() < 0.45) return [];
      const fees = milliEth(5 + random() ** 3 * 400);
      const creator = fees / 2n;
      const buyback = fees / 4n;
      return [
        {
          day,
          token: graduation.token,
          sweeps: 1 + Math.floor(random() * 3),
          protocol_amount: (fees - creator - buyback).toString(),
          buyback_amount: buyback.toString(),
          creator_amount: creator.toString(),
        },
      ];
    }),
  );
}

export function fixture() {
  const random = seeded(11);
  const launches = launchRows(random);
  const graduations = graduationRows(launches, random);
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
      launches,
      graduations,
      "curve-volume": volumeRows(launches, random),
      "pool-fees": feeRows(graduations, random),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
