import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  feed,
  hourBlocks,
  hours,
  mintsAndBurns,
  usdc,
  zeroAddress,
} from "../src/report.mjs";

const circle = "0x55fe002aeff02f77364de339a1292923a15844b8";
const minters = Array.from(
  { length: 6 },
  (_, i) => `0x${String(i + 1).repeat(40)}`,
);
const holders = Array.from(
  { length: 16 },
  (_, i) => `0x${(i + 10).toString(16).padStart(2, "0").repeat(20)}`,
);
const recordedAt = "2023-03-16T00:00:00.000Z";
const startingSupply = 43900000000n;
const dipStart = 36;
const dipBottom = 58;
const recovered = 84;
const mintStart = 60;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const raw = (dollars, random) =>
  BigInt(Math.round(dollars)) * 1000000n + BigInt(Math.floor(random() * 1e6));

function dollarPrice(hour) {
  if (hour < dipStart) return 1;
  if (hour < dipBottom)
    return 1 - (0.12 * (hour - dipStart)) / (dipBottom - dipStart);
  if (hour < recovered)
    return 0.88 + (0.119 * (hour - dipBottom)) / (recovered - dipBottom);
  return 0.999;
}

function feedRows(random) {
  return hours.map((hour, index) => {
    const noise = (random() - 0.5) * 0.0008;
    return {
      hour,
      feed,
      answer: BigInt(Math.round((dollarPrice(index) + noise) * 1e8)).toString(),
    };
  });
}

function edgeRows(random) {
  const pickMinter = () => minters[Math.floor(random() ** 2 * minters.length)];
  const edges = [];
  const add = (hour, slot, from, to, dollars) =>
    edges.push({
      block: hourBlocks(hour).from + 40 + slot * 37,
      from,
      to,
      amount: raw(dollars, random).toString(),
      count: String(1 + Math.floor(random() * 4)),
    });
  hours.forEach((_, hour) => {
    const depth = (1 - dollarPrice(hour)) / 0.12;
    add(hour, 0, pickMinter(), zeroAddress, 2e6 + depth * 6e8 * random());
    if (depth > 0.4)
      add(hour, 1, pickMinter(), zeroAddress, depth * 3e8 * random());
    if (hour >= mintStart)
      add(hour, 2, zeroAddress, circle, 4e7 + ((hour - mintStart) / 60) * 3e8);
    if (hour % 3 === 0)
      add(
        hour,
        3,
        holders[hour % 8],
        holders[8 + (hour % 8)],
        1e6 + random() * 5e7,
      );
  });
  return edges;
}

function supplyRows(edges, random) {
  let supply = raw(Number(startingSupply), random);
  const netByHour = mintsAndBurns(edges).map(
    ({ minted, burned }) => minted - burned,
  );
  return hours.map((hour, index) => {
    if (index > 0) supply += netByHour[index];
    return { hour, token: usdc, total_supply: supply.toString() };
  });
}

export function fixture() {
  const random = seeded(7);
  const edges = edgeRows(random);
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
      supply: supplyRows(edges, random),
      "usdc-edges": edges,
      "usdc-usd-feed": feedRows(random),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
