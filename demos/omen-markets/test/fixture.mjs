import { binds, window } from "../src/report.mjs";

const marketCount = 12;
const randomTradeCount = 120;
const secondsPerBlock = 5;
const firstBlockTime = 1790985600;
const answerTimeout = 3 * 86400;
const collateralToken = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
const conditionalTokens = binds[0].params.conditional_tokens;
const factory = binds[0].params.factory;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const wxdaiUnit = 10n ** 18n;
const usdcUnit = 10n ** 6n;
const usdc = "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83";
const marketFee = 20000000000000000n;
const initialPool = 5000n;
const amount = (units, unit = wxdaiUnit) =>
  (BigInt(Math.round(units * 100)) * unit) / 100n;
const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");
const address = (random) => `0x${hex(random, 40)}`;
const blockAt = (fraction) =>
  window.from_block +
  Math.floor(fraction * (window.to_block - window.from_block - 1));

function trade(random, fields) {
  const feeDivisor = fields.side === "buy" ? wxdaiUnit : wxdaiUnit - marketFee;
  const fee = (fields.collateral * marketFee) / feeDivisor;
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

function tradeRows(random, markets, traders) {
  const [top, ...others] = markets.filter((m) => m.unit === wxdaiUnit);
  const [other] = markets.filter((m) => m.unit === usdcUnit);
  const trader = traders[0];
  const scripted = [
    [top, 1000.25, 1500, "buy", 0],
    [top, 500.5, 700, "buy", 1],
    [top, 300.25, 400, "sell", 0],
    [other, 250, 400, "buy", 0],
    [other, 100, 150, "sell", 1],
  ].map(([market, collateral, tokens, side, outcome], index) =>
    trade(random, {
      block: Math.max(blockAt(0.5 + index / 100), market.createdBlock),
      market: market.address,
      trader,
      side,
      collateral: amount(collateral, market.unit),
      tokens: amount(tokens, market.unit),
      outcome,
    }),
  );
  const randomTrades = [];
  for (let i = 0; i < randomTradeCount; i++) {
    const market = others[Math.floor(random() ** 1.6 * others.length)];
    const tokens = amount(5 + random() * 60);
    randomTrades.push(
      trade(random, {
        block: Math.max(blockAt(random()), market.createdBlock),
        market: market.address,
        trader: traders[Math.floor(random() * traders.length)],
        side: random() < 0.3 ? "sell" : "buy",
        collateral: (tokens * BigInt(40 + Math.floor(random() * 40))) / 100n,
        tokens,
        outcome: Math.floor(random() * 2),
      }),
    );
  }
  return [...scripted, ...randomTrades].sort((a, b) => a.block - b.block);
}

function liquidityRows(random, markets, funders) {
  return markets.map((market, index) => ({
    block: blockAt(index / 40),
    log_index: String(Math.floor(random() * 300)),
    tx: `0x${hex(random, 64)}`,
    market: market.address,
    funder: funders[index % funders.length],
    side: "add",
    shares: amount(50 + random() * 500, market.unit).toString(),
    collateral_removed_from_fee_pool: "0",
  }));
}

function marketStateRows(markets, trades, liquidity) {
  const events = [...trades, ...liquidity].sort((a, b) => a.block - b.block);
  const rows = [];
  for (const market of markets) {
    const pool = [initialPool * market.unit, initialPool * market.unit];
    const own = events.filter((event) => event.market === market.address);
    for (const block of new Set(own.map((event) => event.block))) {
      for (const event of own.filter((e) => e.block === block)) {
        if (event.side === "add") {
          for (const outcome of [0, 1]) pool[outcome] += BigInt(event.shares);
          continue;
        }
        const collateral = BigInt(event.collateral_amount);
        const fee = BigInt(event.fee_amount);
        const isBuy = event.side === "buy";
        for (const outcome of [0, 1])
          pool[outcome] += isBuy ? collateral - fee : -(collateral + fee);
        pool[event.outcome_index] +=
          BigInt(event.outcome_tokens) * (isBuy ? -1n : 1n);
      }
      pool.forEach((poolAmount, outcome) =>
        rows.push({
          block,
          market: market.address,
          outcome_index: String(outcome),
          amount: poolAmount.toString(),
        }),
      );
    }
  }
  return rows.sort((a, b) => a.block - b.block);
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
      answerRow(random, questionId, block, i % 5 === 0 ? 0 : 1, amount(10)),
    );
    if (i % 3 === 0)
      rows.push(answerRow(random, questionId, block + 7000, i % 2, amount(25)));
  }
  rows.push(
    answerRow(
      random,
      `0x${hex(random, 64)}`,
      blockAt(0.7),
      `0x${"f".repeat(64)}`,
      amount(5),
    ),
  );
  return rows;
}

export function fixture() {
  const random = seeded(11);
  const creators = Array.from({ length: 4 }, () => address(random));
  const traders = Array.from({ length: 30 }, () => address(random));
  const markets = Array.from({ length: marketCount + 1 }, (_, index) => ({
    address: address(random),
    unit: index < marketCount ? wxdaiUnit : usdcUnit,
    creator: creators[index % creators.length],
    createdBlock:
      index % 3 === 0
        ? window.from_block - 1000 * (index + 1)
        : blockAt(index / 50),
  }));
  const marketList = markets.map((market) => ({
    block: market.createdBlock,
    market: market.address,
    creator: market.creator,
    conditional_tokens: conditionalTokens,
    collateral_token: market.unit === wxdaiUnit ? collateralToken : usdc,
    fee: marketFee.toString(),
  }));
  const trades = tradeRows(random, markets, traders);
  const liquidity = liquidityRows(random, markets, [factory, ...creators]);
  return {
    markets: marketList,
    trades,
    liquidity,
    market_state: marketStateRows(markets, trades, liquidity),
    answers: answerRows(random),
  };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const covers = (outer, inner) =>
  Object.keys(inner).every((key) =>
    key.startsWith("from_")
      ? inner[key] >= outer[key]
      : inner[key] <= outer[key],
  );

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = binds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        covers(candidate.window, window),
    );
    return "from_block" in window && bind.read
      ? rows[bind.name].filter(
          (row) =>
            row.block >= window.from_block && row.block < window.to_block,
        )
      : rows[bind.name];
  };
}
