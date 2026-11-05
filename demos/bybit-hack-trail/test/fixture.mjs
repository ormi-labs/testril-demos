import { readParts } from "../src/fetch.mjs";
import {
  binds,
  hoursInWindow,
  tokens,
  transferBinds,
  walletKeys,
  wallets,
} from "../src/report.mjs";
import { blockAt, resolveWindow } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = binds;

const unit = 10n ** 18n;
const [stEth, mEth, cmEth] = tokens;
const [cold, exploiter, walletA, walletB, walletC, walletD] = wallets;

const blocksPerHour = 300;
const windowStartBlock = blockAt(binds[0].window.from_time);
const hourStartBlock = (hour) => windowStartBlock + hour * blocksPerHour;
export const hourOfBlock = (block) =>
  Math.floor((block - windowStartBlock) / blocksPerHour);
const rebaseHour = (index) => index % 24 === 12;
const rebaseNumerator = 10001n;
const rebaseDenominator = 10000n;

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

const coldHoldings = [
  [stEth, 90000],
  [mEth, 8000],
  [cmEth, 15000],
];

function transferMoves(random) {
  const outside = Array.from({ length: 4 }, () => `0x${hex(random, 40)}`);
  const [dex, bridge, mixer, otc] = outside;
  const moves = [
    [14, cold, exploiter, stEth, 90000],
    [14, cold, exploiter, mEth, 8000],
    [14, cold, exploiter, cmEth, 15000],
    [15, exploiter, walletA, stEth, 50000],
    [15, exploiter, walletB, stEth, 40000],
    [16, exploiter, walletC, mEth, 8000],
    [16, exploiter, walletD, cmEth, 15000],
    [22, walletA, bridge, stEth, 30000],
    [24, walletB, dex, stEth, 25000],
    [24, walletB, bridge, stEth, 15000],
    [40, walletC, mixer, mEth, 8000],
    [60, walletD, otc, cmEth, 15000],
    [70, walletA, bridge, stEth, 15000],
    [30, walletA, bridge, stEth, 7, -1],
    [30, walletA, bridge, stEth, 9, 0],
  ];
  for (let i = 0; i < 40; i++)
    moves.push([
      20 + Math.floor(random() * 50),
      walletA,
      outside[Math.floor(random() * 4)],
      stEth,
      1 + Math.floor(random() * 30),
    ]);
  return moves;
}

function transferEvents(random) {
  const moves = transferMoves(random).sort((a, b) => a[0] - b[0]);
  return moves.map(([hour, from, to, token, whole, offset], index) => ({
    block: hourStartBlock(hour) + (offset ?? index % 250),
    from,
    to,
    token,
    tx: `0x${hex(random, 64)}`,
    log_index: String(Math.floor(random() * 300)),
    value: raw(whole, random).toString(),
  }));
}

const bindsOf = (slug) => binds.filter((bind) => bind.function_slug === slug);

function transferRows(events) {
  return Object.fromEntries(
    walletKeys.map((key, index) => [
      `transfers-${key}`,
      events.filter(
        (event) => event.from === wallets[index] || event.to === wallets[index],
      ),
    ]),
  );
}

function tokenBalanceRows(events) {
  const held = new Map();
  const add = (wallet, token, amount) =>
    held.set(
      `${wallet}:${token}`,
      (held.get(`${wallet}:${token}`) ?? 0n) + amount,
    );
  for (const [token, whole] of coldHoldings)
    add(cold, token, BigInt(whole) * unit);
  const rows = Object.fromEntries(wallets.map((wallet) => [wallet, []]));
  hoursInWindow().forEach((hour, index) => {
    if (rebaseHour(index))
      for (const [key, balance] of held)
        if (key.endsWith(stEth))
          held.set(key, (balance * rebaseNumerator) / rebaseDenominator);
    for (const event of events)
      if (hourOfBlock(event.block) === index) {
        add(event.from, event.token, -BigInt(event.value));
        add(event.to, event.token, BigInt(event.value));
      }
    for (const wallet of wallets)
      for (const token of tokens) {
        const balance = held.get(`${wallet}:${token}`) ?? 0n;
        if (balance > 0n)
          rows[wallet].push({ hour, token, balance: balance.toString() });
      }
  });
  return Object.fromEntries(
    bindsOf("erc20.token_balance").map((bind) => [
      bind.name,
      rows[bind.params.reads.owners[0]],
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
    bindsOf("native.balance").map((bind) => [
      bind.name,
      rows[bind.params.owners[0]],
    ]),
  );
}

export function fixture() {
  const events = transferEvents(seeded(11));
  return {
    ...transferRows(events),
    ...tokenBalanceRows(events),
    ...balanceRows(),
  };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const within = (rows, window) => {
  const { from_block, to_block } = resolveWindow(window);
  return rows.filter((row) => row.block >= from_block && row.block < to_block);
};

export function fixtureFetched(rows = fixture()) {
  const reads = Object.fromEntries(
    transferBinds.map((bind) => [
      bind.name,
      readParts(bind.window, bind.read).map((part) => ({
        ...part,
        ...resolveWindow(part),
        count: within(rows[bind.name], part).length,
      })),
    ]),
  );
  return { rows, reads };
}

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = binds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        candidate.window.from_time <= window.from_time &&
        candidate.window.to_time >= window.to_time,
    );
    return bind.read ? within(rows[bind.name], window) : rows[bind.name];
  };
}
