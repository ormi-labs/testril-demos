import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const window = binds.markets.window;
export const factory = binds.markets.params.factory;
export const realitio = binds.answers.params.realitio;
const decimals = 10n ** 18n;
const invalidAnswer = `0x${"f".repeat(64)}`;
const topMarkets = 20;

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const day = (unixSeconds) =>
  new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);

export function formatXdai(raw) {
  const cents = (raw + 5n * 10n ** 15n) / 10n ** 16n;
  const whole = (cents / 100n).toLocaleString("en-US");
  return `${whole}.${String(cents % 100n).padStart(2, "0")} wxDAI`;
}

function tokensByOutcome(trades, market, side) {
  const totals = new Map();
  for (const trade of trades) {
    if (trade.market !== market || trade.side !== side) continue;
    const outcome = trade.outcome_index;
    totals.set(
      outcome,
      (totals.get(outcome) ?? 0n) + BigInt(trade.outcome_tokens),
    );
  }
  return totals;
}

export function check(rows) {
  const listed = new Set(rows.markets.map((market) => market.market));
  const unlisted = [...rows.trades, ...rows.liquidity].find(
    (row) => !listed.has(row.market),
  );
  if (unlisted)
    throw new Error(`Market ${unlisted.market} is not in market_list.`);

  for (const trade of rows.trades) {
    if (trade.side !== "buy" && trade.side !== "sell")
      throw new Error(`Trade ${trade.tx} has side "${trade.side}".`);
    if (BigInt(trade.fee_amount) > BigInt(trade.collateral_amount))
      throw new Error(
        `Trade ${trade.tx} kept a fee of ${trade.fee_amount} on ${trade.collateral_amount} of collateral.`,
      );
  }

  for (const market of listed) {
    const bought = tokensByOutcome(rows.trades, market, "buy");
    const sold = tokensByOutcome(rows.trades, market, "sell");
    for (const [outcome, tokens] of sold)
      if (tokens > (bought.get(outcome) ?? 0n))
        throw new Error(
          `Market ${market} sold ${tokens} tokens of outcome ${outcome} but only ${bought.get(outcome) ?? 0n} were bought.`,
        );
  }

  const early = rows.answers.find(
    (answer) =>
      BigInt(answer.ts) > 0n && BigInt(answer.finalize_ts) < BigInt(answer.ts),
  );
  if (early)
    throw new Error(`Answer ${early.tx} finalizes before it was given.`);

  return [
    `All ${rows.trades.length} trades and ${rows.liquidity.length} funding events are on a market in market_list`,
    "Every sell of an outcome is covered by buys of that outcome, and no fee exceeds its trade",
    `All ${rows.answers.length} answers finalize after they were given`,
  ];
}

function marketSummaries(rows) {
  const summaries = new Map(
    rows.markets.map((market) => [
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
    summary.volume += BigInt(trade.collateral_amount);
    summary.trades += 1n;
  }
  return [...summaries.values()].sort((a, b) =>
    b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0,
  );
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
    bond: formatXdai(BigInt(answer.bond)),
    finalizes: day(answer.finalize_ts),
  }));
}

export function shape(rows) {
  const summaries = marketSummaries(rows);
  const volume = summaries.reduce((sum, market) => sum + market.volume, 0n);
  const answers = settlingAnswers(rows.answers);
  return {
    window,
    factory,
    realitio,
    marketCount: String(rows.markets.length),
    tradeCount: String(rows.trades.length),
    volume: formatXdai(volume),
    answeredCount: String(answers.length),
    markets: summaries.slice(0, topMarkets).map((market) => ({
      market: shortAddress(market.market),
      creator: shortAddress(market.creator),
      trades: market.trades.toString(),
      volume: formatXdai(market.volume),
      wxdai: Number(market.volume / decimals),
    })),
    answers,
  };
}
