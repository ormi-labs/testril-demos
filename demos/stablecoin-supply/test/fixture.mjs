import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  edgesWindow,
  ensAddresses,
  supplyDays,
  usdc,
  usdt,
  zeroAddress,
} from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const blockSpacing = 30;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const raw = (dollars, random) =>
  BigInt(Math.round(dollars)) * 1000000n + BigInt(Math.floor(random() * 1e6));

function edgeRows(random) {
  const [circle, ...holders] = ensAddresses;
  const transfers = [
    [zeroAddress, circle, 180e6],
    [zeroAddress, circle, 95e6],
    [zeroAddress, circle, 40e6],
    [circle, zeroAddress, 210e6],
    [circle, zeroAddress, 160e6],
    [circle, holders[2], 120e6],
    [circle, holders[0], 75e6],
    [holders[2], holders.at(-1), 55e6],
  ];
  while (transfers.length < 220) {
    const from = holders[Math.floor(random() ** 2 * holders.length)];
    const to = holders[Math.floor(random() ** 1.5 * holders.length)];
    if (from !== to) transfers.push([from, to, 2e4 + random() ** 4 * 4e7]);
  }
  return transfers.map(([from, to, dollars], index) => ({
    block: edgesWindow.from_block + index * blockSpacing,
    from,
    to,
    amount: raw(dollars, random).toString(),
    count: String(1 + Math.floor(random() * 4)),
  }));
}

function supplyRows(random, token, startDollars, lastChange) {
  const days = supplyDays();
  let supply = raw(startDollars, random);
  return days.map((day, index) => {
    if (index === days.length - 1) supply += lastChange;
    else if (index > 0) supply += raw((random() - 0.4) * 6e8, random);
    return { day, token, total_supply: supply.toString() };
  });
}

export function fixture() {
  const random = seeded(7);
  const edges = edgeRows(random);
  const net = edges.reduce(
    (sum, edge) =>
      sum +
      (edge.from === zeroAddress ? BigInt(edge.amount) : 0n) -
      (edge.to === zeroAddress ? BigInt(edge.amount) : 0n),
    0n,
  );
  const ensRows = Object.fromEntries(
    spec.binds
      .filter((bind) => bind.function_slug === "ens.primary_name")
      .map((bind) => [
        bind.name,
        [
          {
            block: bind.window.from_block,
            address: bind.params.address,
            name: bind.name === "ens-vitalik" ? "vitalik.eth" : "",
          },
        ],
      ]),
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
      supply: [
        ...supplyRows(random, usdt, 96.4e9, raw(3.1e8, random)),
        ...supplyRows(random, usdc, 43.8e9, net),
      ],
      "usdc-edges": edges,
      ...ensRows,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/synthetic.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
