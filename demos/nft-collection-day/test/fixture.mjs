import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  collection,
  dayWindow,
  metadataWindow,
  ownersWindow,
  zeroAddress,
} from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const existingTokens = 150;
const holderCount = 36;
const newMints = 12;
const tradesOnDay = 90;
const burnedToken = "3";
const blockSpacing = 30;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const address = (n) => `0x${(n + 1).toString(16).padStart(40, "a")}`;
const txHash = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const blockAt = (n) => dayWindow.from_block + 40 + n * blockSpacing;

function dayEvents(random) {
  const events = [];
  for (let i = 0; i < newMints; i++)
    events.push({
      block: blockAt(i * 11 + 2),
      token: String(existingTokens + i),
      kind: "mint",
    });
  for (let i = 0; i < tradesOnDay; i++)
    events.push({
      block: blockAt(i * 2 + 5),
      token: String(4 + Math.floor(random() ** 1.5 * (existingTokens - 4))),
      kind: i === 0 ? "hop" : "trade",
    });
  events.push({ block: blockAt(60), token: burnedToken, kind: "burn" });
  return events.sort((a, b) => a.block - b.block);
}

export function fixture() {
  const random = seeded(7);
  const holders = Array.from({ length: holderCount }, (_, i) => address(i));
  const pickHolder = (skew) =>
    holders[Math.floor(random() ** skew * holderCount)];
  const owner = new Map();
  const owners = [];
  for (let id = 0; id < existingTokens; id++) {
    owner.set(String(id), pickHolder(2.2));
    owners.push({
      block: ownersWindow.from_block + 1000 + id * 90000,
      token_id: String(id),
      owner: owner.get(String(id)),
    });
  }

  const transfers = [];
  const move = (token_id, to, block) => {
    transfers.push({
      block,
      from: owner.get(token_id) ?? zeroAddress,
      to,
      log_index: String(transfers.length),
      token_id,
      tx: txHash(transfers.length + 1),
    });
    owner.set(token_id, to);
  };
  const newOwner = (token) => {
    const to = pickHolder(1.5);
    return to === owner.get(token) ? holders.at(-1) : to;
  };
  for (const { block, token, kind } of dayEvents(random)) {
    if (kind === "mint") move(token, pickHolder(3), block);
    else if (kind === "burn") move(token, zeroAddress, block);
    else {
      move(token, newOwner(token), block);
      if (kind === "hop") move(token, newOwner(token), block);
    }
  }

  const lastAtBlock = new Map();
  for (const t of transfers) lastAtBlock.set(`${t.token_id}@${t.block}`, t);
  for (const t of lastAtBlock.values())
    owners.push({ block: t.block, token_id: t.token_id, owner: t.to });

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
      metadata: [
        {
          block: metadataWindow.from_block,
          nft: collection,
          name: "Pudgy Penguins",
          symbol: "PPG",
        },
      ],
      transfers,
      owners,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
