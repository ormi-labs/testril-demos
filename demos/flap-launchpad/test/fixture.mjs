import {
  bindsAt,
  tradesDayOf,
  volumeDays,
  zeroAddress,
} from "../src/report.mjs";
import { readParts } from "../src/fetch.mjs";
import { blockAt, resolveWindow } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const tradesDay = tradesDayOf(fixtureBinds);
const tradesWindow = fixtureBinds.find((bind) => bind.name === "trades").window;
const tradesFromBlock = blockAt(tradesWindow.from_time);

const tokenCount = 14;
const tradeCount = 240;
const usd1 = "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d";
const usd1Every = 12;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");

const raw = (amount, random) =>
  BigInt(Math.round(amount * 1e6)) * 10n ** 12n +
  BigInt(Math.floor(random() * 1e6));

function makeTokens(random) {
  return Array.from(
    { length: tokenCount + 1 },
    () => `0x${hex(random, 36)}7777`,
  );
}

function tradeRows(random, tokens, usd1Token) {
  const span = blockAt(tradesWindow.to_time) - tradesFromBlock;
  const trades = Array.from({ length: tradeCount }, (_, index) => {
    const picked = tokens[Math.floor(random() ** 2.2 * tokens.length)];
    const inUsd1 = index % usd1Every === 0;
    const token = inUsd1 ? usd1Token : picked;
    const quote = raw(0.01 + random() ** 3 * 30, random);
    return {
      block: tradesFromBlock + Math.floor((index / tradeCount) * span),
      log_index: String(Math.floor(random() * 300)),
      tx: `0x${hex(random, 64)}`,
      token,
      trader: `0x${hex(random, 40)}`,
      is_buy: random() < (token === tokens[0] ? 0.7 : 0.5),
      token_amount: raw(1e6 + random() * 5e7, random).toString(),
      quote_amount: quote.toString(),
      fee_amount: (quote / 100n).toString(),
      quote_token: inUsd1 ? usd1 : zeroAddress,
    };
  });
  return trades;
}

function tradeDaySums(trades) {
  const sums = new Map();
  for (const t of trades) {
    const key = `${t.token}:${t.quote_token}`;
    const sum = sums.get(key) ?? { trades: 0, buy: 0n, sell: 0n };
    sum.trades += 1;
    if (t.is_buy) sum.buy += BigInt(t.quote_amount);
    else sum.sell += BigInt(t.quote_amount);
    sums.set(key, sum);
  }
  return sums;
}

function volumeRows(random, pairs, trades) {
  const sums = tradeDaySums(trades);
  return volumeDays(fixtureBinds).flatMap((day) =>
    pairs.flatMap(([token, quote_token], rank) => {
      if (day === tradesDay) {
        const sum = sums.get(`${token}:${quote_token}`);
        return sum
          ? [
              {
                day,
                token,
                quote_token,
                trades: String(sum.trades),
                buy_quote_amount: sum.buy.toString(),
                sell_quote_amount: sum.sell.toString(),
              },
            ]
          : [];
      }
      if (random() < 0.15) return [];
      const scale = 400 / (rank + 1);
      return [
        {
          day,
          token,
          quote_token,
          trades: String(5 + Math.floor(random() * 300)),
          buy_quote_amount: raw(random() * scale, random).toString(),
          sell_quote_amount: raw(random() * scale * 0.8, random).toString(),
        },
      ];
    }),
  );
}

export { usd1 };

export function fixture() {
  const random = seeded(11);
  const all = makeTokens(random);
  const usd1Token = all.pop();
  const trades = tradeRows(random, all, usd1Token);
  const pairs = [...all.map((t) => [t, zeroAddress]), [usd1Token, usd1]];
  return { volume: volumeRows(random, pairs, trades), trades };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const within = (rows, window) => {
  const { from_block, to_block } = resolveWindow(window);
  return rows.filter((row) => row.block >= from_block && row.block < to_block);
};

export function fixtureFetched(rows = fixture()) {
  const reads = Object.fromEntries(
    fixtureBinds.map((bind) => [
      bind.name,
      readParts(bind.window, bind.read).map((part) => ({
        ...part,
        ...resolveWindow(part),
        count: (bind.read ? within(rows[bind.name], part) : rows[bind.name])
          .length,
      })),
    ]),
  );
  return { rows, reads };
}

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = fixtureBinds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params),
    );
    return bind.read
      ? rows[bind.name].filter(
          (row) =>
            row.block >= blockAt(window.from_time) &&
            row.block < blockAt(window.to_time),
        )
      : rows[bind.name];
  };
}
