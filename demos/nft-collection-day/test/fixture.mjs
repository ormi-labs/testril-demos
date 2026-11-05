import {
  bindsAt,
  collection,
  transferBinds,
  zeroAddress,
} from "../src/report.mjs";
import { blockAt as chainBlockAt } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const windowOf = (name) =>
  fixtureBinds.find((bind) => bind.name === name).window;
const dayFromBlock = chainBlockAt(windowOf("transfers-00").from_time);
const ownersFromBlock = chainBlockAt(windowOf("owners").from_time);
const metadataFromBlock = chainBlockAt(windowOf("metadata").from_time);

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
const blockAt = (n) => dayFromBlock + 40 + n * blockSpacing;

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
      block: ownersFromBlock + 1000 + id * 90000,
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
    metadata: [
      {
        block: metadataFromBlock,
        nft: collection,
        name: "Pudgy Penguins",
        symbol: "PPG",
      },
    ],
    ...Object.fromEntries(
      transferBinds(fixtureBinds).map(({ name, window }) => [
        name,
        transfers.filter(
          (t) =>
            t.block >= chainBlockAt(window.from_time) &&
            t.block < chainBlockAt(window.to_time),
        ),
      ]),
    ),
    owners,
  };
}

export const transfersIn = (rows) =>
  transferBinds(fixtureBinds).flatMap((bind) => rows[bind.name]);

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = fixtureBinds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        candidate.window.from_time <= window.from_time &&
        candidate.window.to_time >= window.to_time,
    );
    return bind.read
      ? rows[bind.name].filter(
          (row) =>
            row.block >= chainBlockAt(window.from_time) &&
            row.block < chainBlockAt(window.to_time),
        )
      : rows[bind.name];
  };
}
