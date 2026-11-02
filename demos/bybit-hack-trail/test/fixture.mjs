import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  hoursInWindow,
  tokens,
  transferWindow,
  wallets,
} from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const blocksPerHour = 300;
const unit = 10n ** 18n;
const [stEth, mEth, cmEth] = tokens;
const [cold, exploiter, walletA, walletB, walletC, walletD] = wallets;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");
const raw = (whole, random) =>
  BigInt(whole) * unit +
  (whole < 100 ? BigInt(Math.floor(random() * 1e9)) * 1000000000n : 0n);

function transferMoves(random) {
  const outside = Array.from({ length: 4 }, () => `0x${hex(random, 40)}`);
  const [dex, bridge, mixer, otc] = outside;
  const moves = [
    [14, cold, exploiter, stEth, 401000],
    [14, cold, exploiter, mEth, 8000],
    [14, cold, exploiter, cmEth, 15000],
    [15, exploiter, walletA, stEth, 150000],
    [15, exploiter, walletB, stEth, 100000],
    [16, exploiter, walletB, mEth, 8000],
    [16, exploiter, walletA, cmEth, 15000],
    [17, exploiter, dex, stEth, 100000],
    [18, walletA, walletD, cmEth, 15000],
    [19, walletB, walletC, mEth, 8000],
    [20, walletA, walletD, stEth, 50000],
    [22, walletA, bridge, stEth, 80000],
    [24, walletB, dex, stEth, 60000],
    [30, walletB, walletC, stEth, 40000],
    [40, walletC, mixer, mEth, 8000],
    [50, walletC, bridge, stEth, 40000],
    [60, walletD, otc, cmEth, 15000],
    [70, walletD, bridge, stEth, 50000],
  ];
  for (let i = 0; i < 40; i++)
    moves.push([
      20 + Math.floor(random() * 160),
      random() < 0.5 ? exploiter : walletA,
      outside[Math.floor(random() * 4)],
      stEth,
      1 + Math.floor(random() * 30),
    ]);
  return moves;
}

function transferRows(random) {
  const moves = transferMoves(random).sort((a, b) => a[0] - b[0]);
  const events = moves.map(([hour, from, to, token, whole], index) => ({
    block: transferWindow.from_block + hour * blocksPerHour + (index % 250),
    from,
    to,
    token,
    tx: `0x${hex(random, 64)}`,
    log_index: String(Math.floor(random() * 300)),
    value: raw(whole, random).toString(),
  }));
  return Object.fromEntries(
    spec.binds
      .filter((bind) => bind.function_slug === "erc20.wallet_transfers")
      .map((bind) => [
        bind.name,
        events.filter(
          (event) =>
            event.from === bind.params.wallet ||
            event.to === bind.params.wallet,
        ),
      ]),
  );
}

function balanceRows() {
  const ethMoves = [
    [14, cold, exploiter, 401000n],
    [15, exploiter, walletA, 150000n],
    [15, exploiter, walletB, 100000n],
    [16, exploiter, walletC, 50000n],
    [16, exploiter, walletD, 50000n],
    [17, exploiter, "outside", 50000n],
    [22, walletA, "outside", 150000n],
    [24, walletB, "outside", 100000n],
    [40, walletC, "outside", 50000n],
    [60, walletD, "outside", 50000n],
  ];
  const hours = hoursInWindow();
  const held = new Map(wallets.map((wallet) => [wallet, 0n]));
  held.set(cold, 420000n * unit);
  const rows = Object.fromEntries(wallets.map((wallet) => [wallet, []]));
  hours.forEach((hour, index) => {
    for (const [at, from, to, eth] of ethMoves)
      if (at === index) {
        held.set(from, held.get(from) - eth * unit);
        if (held.has(to)) held.set(to, held.get(to) + eth * unit);
      }
    for (const wallet of wallets)
      if (held.get(wallet) > 0n)
        rows[wallet].push({
          hour,
          owner: wallet,
          balance: held.get(wallet).toString(),
        });
  });
  return Object.fromEntries(
    spec.binds
      .filter((bind) => bind.function_slug === "native.balance")
      .map((bind) => [bind.name, rows[bind.params.owners[0]]]),
  );
}

export function fixture() {
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
    rows: { ...transferRows(seeded(11)), ...balanceRows() },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
