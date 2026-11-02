import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { rewardWindow as window } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const wei = 10n ** 18n;
const firstEpoch = 1423;
const blocksPerEpoch = 321190;
const generatedIndexerCount = 14;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");
const grt = (amount, random) =>
  BigInt(Math.round(amount)) * wei +
  BigInt(Math.floor(random() * 1e9)) * 10n ** 9n;
const epochOf = (block) =>
  String(firstEpoch + Math.floor((block - window.from_block) / blocksPerEpoch));

function sortedBlocks(count, random) {
  const span = window.to_block - window.from_block;
  return Array.from(
    { length: count },
    () => window.from_block + Math.floor(random() * span),
  ).sort((a, b) => a - b);
}

function logRows(blocks, random, build) {
  return blocks.map((block, index) => ({
    block,
    log_index: String(1 + (index % 9)),
    tx: `0x${hex(random, 64)}`,
    ...build(block, index),
    epoch: epochOf(block),
  }));
}

function rewardRows(indexers, random) {
  return logRows(sortedBlocks(170, random), random, (_block, index) => {
    const indexer = indexers[Math.floor(random() ** 2 * indexers.length)];
    const base = { indexer, allocation: `0x${hex(random, 40)}` };
    if (index % 17 === 16)
      return {
        ...base,
        kind: "rewards_assigned",
        amount: grt(2e3 + random() * 1e4, random).toString(),
        indexer_rewards: "0",
        delegator_rewards: "0",
      };
    const amount = grt(4e3 + random() ** 2 * 9e4, random);
    const delegatorCutPoints = BigInt(
      indexer === indexers[3] ? 9200 : 1500 + Math.floor(random() * 5000),
    );
    const delegatorRewards = (amount * delegatorCutPoints) / 10000n;
    return {
      ...base,
      kind: "rewards_collected",
      amount: amount.toString(),
      indexer_rewards: (amount - delegatorRewards).toString(),
      delegator_rewards: delegatorRewards.toString(),
    };
  });
}

function delegationRows(indexers, random) {
  const pools = new Map(
    indexers.map((indexer) => [indexer, grt(2e6 + random() * 6e7, random)]),
  );
  return logRows(sortedBlocks(110, random), random, () => {
    const indexer =
      indexers[Math.floor(random() ** 1.5 * (indexers.length - 2))];
    const undelegated = random() < 0.35;
    const tokens = grt(500 + random() ** 3 * 4e5, random);
    const pool = pools.get(indexer) + (undelegated ? -tokens : tokens);
    pools.set(indexer, pool);
    const poolShares = (pool * 97n) / 100n;
    return {
      indexer,
      verifier: spec.binds[0].params.subgraph_service,
      delegator: `0x${hex(random, 40)}`,
      tokens: tokens.toString(),
      shares: ((tokens * 97n) / 100n).toString(),
      kind: undelegated ? "undelegated" : "delegated",
      delegator_shares: (
        (poolShares * BigInt(1 + Math.floor(random() * 8))) /
        100n
      ).toString(),
      pool_tokens: pool.toString(),
      pool_shares: poolShares.toString(),
    };
  });
}

function feeRows(random) {
  const kinds = [
    "allocation_collected",
    "rebate_collected",
    "query_fees_collected",
  ];
  const rows = logRows(sortedBlocks(120, random), random, (_block, index) => {
    const kind = kinds[index % kinds.length];
    const total = grt(300 + random() ** 2 * 9e3, random);
    if (kind === "query_fees_collected")
      return {
        kind,
        total: total.toString(),
        indexer_fees: (total - total / 20n).toString(),
        curator_fees: (total / 20n).toString(),
        protocol_tax: "0",
      };
    const tax = total / 100n;
    const curator = total / 20n;
    return {
      kind,
      total: total.toString(),
      indexer_fees: (total - tax - curator).toString(),
      curator_fees: curator.toString(),
      protocol_tax: tax.toString(),
    };
  });
  return rows.flatMap((row) =>
    row.kind === "query_fees_collected"
      ? [
          row,
          {
            ...row,
            kind: "payment_collected",
            log_index: "10",
            total: "0",
            indexer_fees: "0",
            curator_fees: "0",
            protocol_tax: (BigInt(row.total) / 100n).toString(),
          },
        ]
      : [row],
  );
}

export function fixture() {
  const random = seeded(11);
  const indexers = Array.from(
    { length: generatedIndexerCount },
    () => `0x${hex(random, 40)}`,
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
    window: Object.fromEntries(
      spec.binds.map((bind) => [bind.name, bind.window]),
    ),
    rows: {
      "indexing-rewards": rewardRows(indexers, random),
      delegation: delegationRows(indexers, random),
      "query-fees": feeRows(random),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
