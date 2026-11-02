import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { window } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const marketCount = 12;
const randomTradeCount = 200;
const secondsPerBlock = 5;
const firstBlockTime = 1790985600;
const answerTimeout = 3 * 86400;
const collateralToken = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
const conditionalTokens = spec.binds[0].params.conditional_tokens;
const factory = spec.binds[0].params.factory;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const wxdai = (amount) => BigInt(Math.round(amount * 100)) * 10n ** 16n;
const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");
const address = (random) => `0x${hex(random, 40)}`;
const blockAt = (fraction) =>
  window.from_block +
  Math.floor(fraction * (window.to_block - window.from_block - 1));

function trade(random, fields) {
  const fee = (fields.collateral * 2n) / 100n;
  return {
    block: fields.block,
    log_index: String(Math.floor(random() * 300)),
    tx: `0x${hex(random, 64)}`,
    market: fields.market,
    trader: fields.trader,
    side: fields.side,
    collateral_amount: fields.collateral.toString(),
    fee_amount: fee.toString(),
    outcome_index: String(fields.outcome),
    outcome_tokens: fields.tokens.toString(),
  };
}

function tradeRows(random, marketAddresses, traders) {
  const [top, ...others] = marketAddresses;
  const trader = traders[0];
  const topTrades = [
    [wxdai(1000.25), wxdai(1500), "buy", 0],
    [wxdai(500.5), wxdai(700), "buy", 1],
    [wxdai(300.25), wxdai(400), "sell", 0],
  ].map(([collateral, tokens, side, outcome], index) =>
    trade(random, {
      block: blockAt(0.5 + index / 100),
      market: top,
      trader,
      side,
      collateral,
      tokens,
      outcome,
    }),
  );
  const held = new Map();
  const randomTrades = [];
  for (let i = 0; i < randomTradeCount; i++) {
    const market = others[Math.floor(random() ** 1.6 * others.length)];
    const outcome = Math.floor(random() * 2);
    const key = `${market}:${outcome}`;
    const inventory = held.get(key) ?? 0n;
    const sells = inventory > wxdai(10) && random() < 0.3;
    const tokens = sells ? inventory / 2n : wxdai(5 + random() * 60);
    held.set(key, sells ? inventory - tokens : inventory + tokens);
    randomTrades.push(
      trade(random, {
        block: blockAt(random()),
        market,
        trader: traders[Math.floor(random() * traders.length)],
        side: sells ? "sell" : "buy",
        collateral: (tokens * BigInt(40 + Math.floor(random() * 40))) / 100n,
        tokens,
        outcome,
      }),
    );
  }
  return [...topTrades, ...randomTrades].sort((a, b) => a.block - b.block);
}

function liquidityRows(random, marketAddresses, funders) {
  return marketAddresses.map((market, index) => ({
    block: blockAt(index / 40),
    log_index: String(Math.floor(random() * 300)),
    tx: `0x${hex(random, 64)}`,
    market,
    funder: funders[index % funders.length],
    side: "add",
    shares: wxdai(50 + random() * 500).toString(),
    collateral_removed_from_fee_pool: "0",
  }));
}

function answerRow(random, questionId, block, answer, bond) {
  const ts = firstBlockTime + (block - window.from_block) * secondsPerBlock;
  return {
    block,
    log_index: String(Math.floor(random() * 300)),
    tx: `0x${hex(random, 64)}`,
    question_id: questionId,
    answer: `0x${BigInt(answer).toString(16).padStart(64, "0")}`,
    bond: bond.toString(),
    ts: String(ts),
    finalize_ts: String(ts + answerTimeout),
  };
}

function answerRows(random) {
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const questionId = `0x${hex(random, 64)}`;
    const block = blockAt(0.1 + random() * 0.8);
    rows.push(
      answerRow(random, questionId, block, i % 5 === 0 ? 0 : 1, wxdai(10)),
    );
    if (i % 3 === 0)
      rows.push(answerRow(random, questionId, block + 7000, i % 2, wxdai(25)));
  }
  rows.push(
    answerRow(
      random,
      `0x${hex(random, 64)}`,
      blockAt(0.7),
      `0x${"f".repeat(64)}`,
      wxdai(5),
    ),
  );
  return rows;
}

export function fixture() {
  const random = seeded(11);
  const marketAddresses = Array.from({ length: marketCount }, () =>
    address(random),
  );
  const creators = Array.from({ length: 4 }, () => address(random));
  const traders = Array.from({ length: 30 }, () => address(random));
  const markets = marketAddresses.map((market, index) => ({
    block: blockAt(index / 50),
    market,
    creator: creators[index % creators.length],
    conditional_tokens: conditionalTokens,
    collateral_token: collateralToken,
    fee: "20000000000000000",
  }));
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
      markets,
      trades: tradeRows(random, marketAddresses, traders),
      liquidity: liquidityRows(random, marketAddresses, [factory, ...creators]),
      answers: answerRows(random),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
