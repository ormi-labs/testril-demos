import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { feeDays } from "../src/report.mjs";

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
const blocksPerDay = 823950;
const factoryDeploymentBlock = 26841846;
const dayStartBlock = (dayIndex) =>
  binds.launches.window.from_block + dayIndex * blocksPerDay;

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

const hexBytes = (random, bytes) =>
  Array.from({ length: Math.ceil(bytes / 4) }, () =>
    Math.floor(random() * 4294967296)
      .toString(16)
      .padStart(8, "0"),
  )
    .join("")
    .slice(0, bytes * 2);

const address = (random) => `0x${hexBytes(random, 20)}`;

const milliEth = (thousandths) =>
  (BigInt(Math.round(thousandths)) * wei) / 1000n;

function launchRows(random) {
  const { factory } = binds.launches.params;
  const end = dayStartBlock(feeDays().length);
  const step = Math.floor((end - factoryDeploymentBlock) / launchCount);
  return Array.from({ length: launchCount }, (_, i) => ({
    block: factoryDeploymentBlock + i * step + Math.floor(random() * step),
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
    pool_id_prefix: `0x${hexBytes(random, 25)}${"0".repeat(14)}`,
    position_id: String(1000 + i),
    token: launch.token,
  }));
}

function volumeRows(launches, random) {
  const days = feeDays();
  return days.flatMap((day, d) =>
    launches
      .filter(
        (launch, i) => i % 3 === d % 3 && launch.block < dayStartBlock(d + 1),
      )
      .map((launch) => {
        const buys = 2 + Math.floor(random() * 30);
        const sells = Math.floor(random() * buys);
        const bought = milliEth(buys * (50 + random() * 400));
        const sold = milliEth(sells * (40 + random() * 300));
        return {
          day,
          curve: launch.curve,
          trades: String(buys + sells),
          buy_count: String(buys),
          sell_count: String(sells),
          bought: bought.toString(),
          sold: sold.toString(),
          fees: ((bought + sold) / 100n).toString(),
          taxes: "0",
        };
      }),
  );
}

function sweepRows(graduations, random) {
  const days = feeDays();
  return graduations.flatMap((graduation) =>
    days.flatMap((day, d) => {
      if (dayStartBlock(d) <= graduation.block || random() < 0.6) return [];
      return Array.from({ length: 1 + Math.floor(random() * 2) }, (_, n) => {
        const fees = milliEth(5 + random() ** 3 * 400);
        const creator = fees / 2n;
        const buyback = fees / 4n;
        return {
          day,
          block: dayStartBlock(d) + n * 100 + Math.floor(random() * 100),
          log_index: String(n),
          tx: `0x${hexBytes(random, 32)}`,
          token: graduation.token,
          protocol_amount: (fees - creator - buyback).toString(),
          buyback_amount: buyback.toString(),
          creator_amount: creator.toString(),
        };
      });
    }),
  );
}

const withoutDay = (sweep) =>
  Object.fromEntries(Object.entries(sweep).filter(([key]) => key !== "day"));

function feeRows(sweeps) {
  const perPoolDay = Map.groupBy(sweeps, (s) => `${s.day}/${s.token}`);
  return [...perPoolDay.values()].map((group) => {
    const sum = (key) =>
      group.reduce((total, s) => total + BigInt(s[key]), 0n).toString();
    return {
      day: group[0].day,
      token: group[0].token,
      sweeps: String(group.length),
      protocol_amount: sum("protocol_amount"),
      buyback_amount: sum("buyback_amount"),
      creator_amount: sum("creator_amount"),
    };
  });
}

export function fixture() {
  const random = seeded(11);
  const launches = launchRows(random);
  const graduations = graduationRows(launches, random);
  const sweeps = sweepRows(graduations, random);
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
      "pool-fees": feeRows(sweeps),
      "pool-fee-sweep": sweeps.map(withoutDay),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
