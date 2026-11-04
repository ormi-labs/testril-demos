import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  finalTicks,
  liquidityAt,
  pool,
  stateDay,
  tickWindow,
} from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const currentTick = -196310n;
const tickSpacing = 10;
const fullRange = 887270;
const positionCount = 48;
const blockSpacing = 40000;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const roundTo = (ticks) =>
  BigInt(Math.round(ticks / tickSpacing) * tickSpacing);

function positions(random) {
  const list = [
    {
      lower: currentTick,
      upper: currentTick + 240n,
      liquidity: 52_000_000_000_000n,
    },
    {
      lower: -BigInt(fullRange),
      upper: BigInt(fullRange),
      liquidity: 9_000_000_000_000n,
    },
  ];
  while (list.length < positionCount) {
    const center = Number(currentTick) + (random() - 0.5) * 4000 * random();
    const halfWidth = 40 + random() ** 2 * 1800;
    list.push({
      lower: roundTo(center - halfWidth),
      upper: roundTo(center + halfWidth),
      liquidity: BigInt(Math.round(1e12 + random() * 3e13)),
    });
  }
  return list;
}

function changes(list) {
  const events = list.flatMap((position, index) => {
    const block = tickWindow.from_block + 1000 + index * blockSpacing;
    const opened = [
      { block, tick: position.lower, amount: position.liquidity, side: 1n },
      { block, tick: position.upper, amount: position.liquidity, side: -1n },
    ];
    const withdrawn = index % 6 === 5;
    return withdrawn
      ? [
          ...opened,
          ...opened.map((open) => ({
            ...open,
            block: block + 20 * blockSpacing + 7,
            amount: -open.amount,
          })),
        ]
      : opened;
  });
  return events.sort((a, b) => a.block - b.block);
}

function tickRows(events) {
  const running = new Map();
  return events.map(({ block, tick, amount, side }) => {
    const now = running.get(tick) ?? { gross: 0n, net: 0n };
    now.gross += amount;
    now.net += amount * side;
    running.set(tick, now);
    return {
      block,
      pool,
      tick: tick.toString(),
      liquidity_gross: now.gross.toString(),
      liquidity_net: now.net.toString(),
    };
  });
}

function sqrtPriceX96(tick) {
  return BigInt(
    Math.round(1.0001 ** ((Number(tick) + 0.4) / 2) * 2 ** 96),
  ).toString();
}

export function fixture() {
  const events = changes(positions(seeded(11)));
  const ticks = tickRows(events);
  const liquidity = liquidityAt(finalTicks(ticks), currentTick);
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
      ticks,
      "pool-state": [
        {
          day: stateDay,
          pool,
          tick: currentTick.toString(),
          sqrt_price_x96: sqrtPriceX96(currentTick),
          liquidity: liquidity.toString(),
          lp_fee: "500",
          protocol_fee_zero_for_one: "0",
          protocol_fee_one_for_zero: "0",
        },
      ],
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/synthetic.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
