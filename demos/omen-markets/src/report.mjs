import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const window = binds.trades.window;
export const factory = binds.markets.params.factory;
export const realitio = binds.answers.params.realitio;
export const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
const one = 10n ** 18n;
const invalidAnswer = `0x${"f".repeat(64)}`;
const topMarkets = 20;
const feeRoundingTolerance = 1n;
const maxAnswerTimeoutSeconds = 365n * 24n * 3600n;

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const day = (unixSeconds) =>
  new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);
const inWindow = (block) =>
  block >= window.from_block && block < window.to_block;
const isWxdai = (market) => market.collateral_token.toLowerCase() === wxdai;

export function formatAmount(raw, unit) {
  const cents = (raw + 5n * 10n ** 15n) / 10n ** 16n;
  const whole = (cents / 100n).toLocaleString("en-US");
  return `${whole}.${String(cents % 100n).padStart(2, "0")} ${unit}`;
}

const absolute = (value) => (value < 0n ? -value : value);

function expectedFee(trade, market) {
  const collateral = BigInt(trade.collateral_amount);
  const fee = BigInt(market.fee);
  return trade.side === "buy"
    ? (collateral * fee) / one
    : (collateral * fee) / (one - fee);
}

function poolChange(trade) {
  const collateral = BigInt(trade.collateral_amount);
  const fee = BigInt(trade.fee_amount);
  const tokens = BigInt(trade.outcome_tokens);
  const isBuy = trade.side === "buy";
  return {
    allOutcomes: isBuy ? collateral - fee : -(collateral + fee),
    ownOutcome: isBuy ? -tokens : tokens,
    outcome: trade.outcome_index,
  };
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items)
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function checkPoolReconciles(market, states, trades, funding) {
  const fundedBlocks = new Set(funding.map((row) => row.block));
  const tradesByBlock = groupBy(trades, (trade) => trade.block);
  const blocks = groupBy(states, (state) => state.block);
  const ordered = [...blocks.keys()].sort((a, b) => a - b);
  for (const [index, block] of ordered.entries()) {
    const holdings = new Map(
      blocks
        .get(block)
        .map((state) => [state.outcome_index, BigInt(state.amount)]),
    );
    const negative = [...holdings].find(([, amount]) => amount < 0n);
    if (negative)
      throw new Error(
        `Market ${market} holds ${negative[1]} tokens of outcome ${negative[0]}.`,
      );
    if (index === 0 || fundedBlocks.has(block)) continue;
    const before = new Map(
      blocks
        .get(ordered[index - 1])
        .map((state) => [state.outcome_index, BigInt(state.amount)]),
    );
    const changes = (tradesByBlock.get(block) ?? []).map(poolChange);
    for (const [outcome, amount] of holdings) {
      const expected = changes.reduce(
        (sum, change) =>
          sum +
          change.allOutcomes +
          (change.outcome === outcome ? change.ownOutcome : 0n),
        before.get(outcome) ?? 0n,
      );
      if (amount < expected)
        throw new Error(
          `Market ${market} holds ${amount} tokens of outcome ${outcome} at block ${block}, its trades leave at least ${expected}.`,
        );
    }
  }
}

export function check(rows) {
  const markets = new Map(
    rows.markets.map((market) => [market.market, market]),
  );
  const unlisted = [
    ...rows.trades,
    ...rows.liquidity,
    ...rows.market_state,
  ].find((row) => !markets.has(row.market));
  if (unlisted)
    throw new Error(`Market ${unlisted.market} is not in market_list.`);

  for (const trade of rows.trades) {
    if (trade.side !== "buy" && trade.side !== "sell")
      throw new Error(`Trade ${trade.tx} has side "${trade.side}".`);
    const expected = expectedFee(trade, markets.get(trade.market));
    if (absolute(BigInt(trade.fee_amount) - expected) > feeRoundingTolerance)
      throw new Error(
        `Trade ${trade.tx} kept a fee of ${trade.fee_amount}, the market's fee on ${trade.collateral_amount} is ${expected}.`,
      );
  }

  const tradesByMarket = groupBy(rows.trades, (trade) => trade.market);
  const fundingByMarket = groupBy(rows.liquidity, (row) => row.market);
  for (const [market, states] of groupBy(
    rows.market_state,
    (state) => state.market,
  ))
    checkPoolReconciles(
      market,
      states,
      tradesByMarket.get(market) ?? [],
      fundingByMarket.get(market) ?? [],
    );

  const misdated = rows.answers.find((answer) => {
    const wait = BigInt(answer.finalize_ts) - BigInt(answer.ts);
    return (
      BigInt(answer.ts) > 0n && (wait < 0n || wait > maxAnswerTimeoutSeconds)
    );
  });
  if (misdated)
    throw new Error(
      `Answer ${misdated.tx} finalizes before it was given or more than a year after.`,
    );

  return [
    `All ${rows.trades.length} trades, ${rows.liquidity.length} funding events and ${rows.market_state.length} pool balances are on a market in market_list`,
    "Every trade's fee is the market's fee on its collateral, and no pool holds fewer outcome tokens than its trades leave (tokens sent straight to a market may add more)",
    `All ${rows.answers.length} answers finalize within a year after they were given`,
  ];
}

function wxdaiSummaries(rows) {
  const summaries = new Map(
    rows.markets.filter(isWxdai).map((market) => [
      market.market,
      {
        market: market.market,
        creator: market.creator,
        volume: 0n,
        trades: 0n,
      },
    ]),
  );
  for (const trade of rows.trades) {
    const summary = summaries.get(trade.market);
    if (!summary) continue;
    summary.volume += BigInt(trade.collateral_amount);
    summary.trades += 1n;
  }
  return [...summaries.values()].sort((a, b) =>
    b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0,
  );
}

function otherCollateral(rows) {
  const totals = new Map();
  const tokenOf = new Map();
  for (const market of rows.markets.filter((m) => !isWxdai(m))) {
    tokenOf.set(market.market, market.collateral_token);
    const total = totals.get(market.collateral_token) ?? {
      token: market.collateral_token,
      markets: 0,
      trades: 0,
      volume: 0n,
    };
    total.markets += 1;
    totals.set(market.collateral_token, total);
  }
  for (const trade of rows.trades) {
    const total = totals.get(tokenOf.get(trade.market));
    if (!total) continue;
    total.trades += 1;
    total.volume += BigInt(trade.collateral_amount);
  }
  return [...totals.values()].map((total) => ({
    token: shortAddress(total.token),
    markets: String(total.markets),
    trades: String(total.trades),
    rawVolume: total.volume.toString(),
  }));
}

function describeAnswer(word) {
  if (word === invalidAnswer) return "Invalid";
  const outcome = BigInt(word);
  return outcome < 1000n ? `Outcome ${outcome}` : shortAddress(word);
}

function settlingAnswers(answers) {
  const latest = new Map();
  for (const answer of [...answers].sort(
    (a, b) => a.block - b.block || Number(a.log_index) - Number(b.log_index),
  ))
    latest.set(answer.question_id, answer);
  return [...latest.values()].map((answer) => ({
    question: shortAddress(answer.question_id),
    answer: describeAnswer(answer.answer),
    bond: formatAmount(BigInt(answer.bond), "xDAI"),
    finalizes: day(answer.finalize_ts),
  }));
}

export function shape(rows) {
  const summaries = wxdaiSummaries(rows);
  const volume = summaries.reduce((sum, market) => sum + market.volume, 0n);
  const answers = settlingAnswers(rows.answers);
  const others = otherCollateral(rows);
  return {
    window,
    factory,
    realitio,
    marketCount: String(rows.markets.filter((m) => inWindow(m.block)).length),
    tradeCount: String(rows.trades.length),
    volume: formatAmount(volume, "wxDAI"),
    otherCollateral: others,
    answeredCount: String(answers.length),
    markets: summaries.slice(0, topMarkets).map((market) => ({
      market: shortAddress(market.market),
      creator: shortAddress(market.creator),
      trades: market.trades.toString(),
      volume: formatAmount(market.volume, "wxDAI"),
      cents: Number(market.volume / 10n ** 16n),
    })),
    answers,
  };
}
