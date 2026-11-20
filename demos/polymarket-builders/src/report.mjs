const dayMs = 86400000;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
export const zeroWord = `0x${"0".repeat(64)}`;
export const versionOneExchanges = [
  "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e",
  "0xc5d563a36ae78145c45a50134d48a1215220f80a",
];
export const exchanges = [
  ...versionOneExchanges,
  "0xe2222d279d744050d28e00520010520000310f59",
];
export const conditionalTokens = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";

export function bindsAt(now = Date.now()) {
  const yesterday = Math.floor(now / dayMs) * dayMs - dayMs;
  const window = {
    from_time: isoSecond(yesterday),
    to_time: isoSecond(yesterday + dayMs),
  };
  return [
    {
      name: "builders",
      function_slug: "polymarket_clob.builder_volume",
      chain_id: 137,
      params: { swap: { exchanges }, by: "day" },
      window,
    },
    {
      name: "payouts",
      function_slug: "conditional_tokens.condition_payouts",
      chain_id: 137,
      params: { conditional_tokens: conditionalTokens },
      window,
      read: { chunk_hours: 1 },
    },
  ];
}

export const dayOf = (binds) =>
  binds.find((bind) => bind.name === "builders").window.from_time.slice(0, 10);

const holdsBlock = (block) => (read) =>
  block >= read.from_block && block < read.to_block;

const outcomesPerCondition = 2;
const leaderboardSize = 8;
const shareScale = 10000n;

const byVolumeDescending = (a, b) =>
  b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0;
const shortHex = (hex) => `${hex.slice(0, 8)}…${hex.slice(-4)}`;
const sumOf = (entries, field) =>
  entries.reduce((sum, entry) => sum + entry[field], 0n);

export function builderTotals(rows) {
  const totals = new Map();
  for (const row of rows) {
    const total = totals.get(row.builder) ?? {
      builder: row.builder,
      volume: 0n,
      fills: 0n,
      fee: 0n,
    };
    total.volume += BigInt(row.collateral_amount);
    total.fills += BigInt(row.fills);
    total.fee += BigInt(row.collateral_fee);
    totals.set(row.builder, total);
  }
  return [...totals.values()].sort(byVolumeDescending);
}

function conditionsOf(payouts) {
  const conditions = new Map();
  for (const row of payouts) {
    const condition = conditions.get(row.condition_id) ?? {
      id: row.condition_id,
      numerators: [],
      rows: [],
    };
    condition.numerators[Number(row.outcome_index)] = BigInt(
      row.payout_numerator,
    );
    condition.rows.push(row);
    conditions.set(row.condition_id, condition);
  }
  return [...conditions.values()];
}

function checkBuilders(rows, day) {
  const outside = rows.find((row) => row.day !== day);
  if (outside)
    throw new Error(`Builder row for ${outside.day} is outside the window.`);
  const stranger = rows.find((row) => !exchanges.includes(row.exchange));
  if (stranger)
    throw new Error(
      `Builder row from ${stranger.exchange} is not a named exchange.`,
    );
  const keys = new Set(rows.map((row) => `${row.builder}:${row.exchange}`));
  if (keys.size !== rows.length)
    throw new Error("Two builder rows share a builder code and exchange.");
  const uncoded = rows.find((row) => !/^0x[0-9a-f]{64}$/.test(row.builder));
  if (uncoded)
    throw new Error(`Builder ${uncoded.builder} is not a 32-byte code.`);
  const coded = rows.find(
    (row) =>
      versionOneExchanges.includes(row.exchange) && row.builder !== zeroWord,
  );
  if (coded)
    throw new Error(
      `Version 1 exchange ${shortHex(coded.exchange)} credits builder ${shortHex(coded.builder)}, but version 1 emits no builder codes.`,
    );
  const odd = rows.find(
    (row) =>
      BigInt(row.fills) === 0n ||
      BigInt(row.collateral_fee) > BigInt(row.collateral_amount),
  );
  if (odd)
    throw new Error(
      `Builder ${shortHex(odd.builder)} has ${odd.fills} fills and a fee of ${odd.collateral_fee} on ${odd.collateral_amount} collateral.`,
    );
}

function checkConditions(conditions, reads) {
  for (const condition of conditions) {
    const stray = condition.rows.find(
      (row) => !reads.some(holdsBlock(row.block)),
    );
    if (stray)
      throw new Error(
        `Condition ${shortHex(condition.id)} resolved at block ${stray.block}, outside the window.`,
      );
    const indices = condition.rows.map((r) => Number(r.outcome_index));
    const complete = Array.from(
      { length: outcomesPerCondition },
      (_, outcome) => outcome,
    ).every((outcome) => indices.filter((i) => i === outcome).length === 1);
    if (!complete || indices.length !== outcomesPerCondition)
      throw new Error(
        `Condition ${shortHex(condition.id)} lists outcomes ${indices.join(", ")}: each of the ${outcomesPerCondition} outcomes must appear exactly once.`,
      );
    const sum = condition.numerators.reduce((s, n) => s + n, 0n);
    if (
      sum === 0n ||
      condition.rows.some((r) => BigInt(r.payout_denominator) !== sum)
    )
      throw new Error(
        `Condition ${shortHex(condition.id)} pays numerators summing to ${sum}, not its denominator.`,
      );
  }
}

export function check({ rows, reads }, binds) {
  checkBuilders(rows.builders, dayOf(binds));
  const totals = builderTotals(rows.builders);
  const volume = sumOf(totals, "volume");
  assertLeaderboardAddsUp(leaderboardEntries(totals), volume);
  const conditions = conditionsOf(rows.payouts);
  checkConditions(conditions, reads.payouts);
  return [
    `All ${rows.builders.length} builder rows are for ${dayOf(binds)} on a named exchange, once per builder code and exchange, each with a fill and a fee no larger than its collateral`,
    `Version 1 exchanges credit only the zero code, as they emit no builder codes`,
    `The leaderboard (top ${leaderboardSize} plus other builders) adds up to the ${formatUsd(volume)} total`,
    `${conditions.length} resolved conditions each list both of their outcomes once and pay a non-zero denominator equal to the sum of their numerators`,
  ];
}

export function formatUsd(raw) {
  const cents = (raw + 5000n) / 10000n;
  const whole = (cents / 100n).toLocaleString("en-US");
  return `$${whole}.${String(cents % 100n).padStart(2, "0")}`;
}

export function formatCompact(raw) {
  const dollars = Number(raw / 10n ** 6n);
  const [scale, suffix] =
    dollars >= 1e6 ? [1e6, "M"] : dollars >= 1e3 ? [1e3, "K"] : [1, ""];
  return `$${(dollars / scale).toFixed(scale === 1 ? 0 : 2)}${suffix}`;
}

const builderLabel = (builder) =>
  builder === zeroWord ? "No builder code" : shortHex(builder);

export function leaderboardEntries(totals) {
  const ranked = totals.map((total) => ({
    ...total,
    label: builderLabel(total.builder),
  }));
  const rest = ranked.slice(leaderboardSize);
  if (rest.length === 0) return ranked;
  return [
    ...ranked.slice(0, leaderboardSize),
    {
      label: `${rest.length} other builders`,
      volume: sumOf(rest, "volume"),
      fills: sumOf(rest, "fills"),
      fee: sumOf(rest, "fee"),
    },
  ];
}

export function assertLeaderboardAddsUp(entries, total) {
  const shown = sumOf(entries, "volume");
  if (shown !== total)
    throw new Error(
      `Leaderboard rows sum to ${shown}, not the total ${total}.`,
    );
}

function leaderboard(totals) {
  const volume = sumOf(totals, "volume");
  return leaderboardEntries(totals).map((entry) => ({
    label: entry.label,
    volume: formatUsd(entry.volume),
    fills: entry.fills.toLocaleString("en-US"),
    fee: formatUsd(entry.fee),
    share: `${Number((entry.volume * 1000n) / volume) / 10}%`,
    fraction: Number((entry.volume * shareScale) / volume) / Number(shareScale),
  }));
}

function resolutionOf({ numerators }) {
  const winners = numerators.flatMap((n, outcome) => (n > 0n ? [outcome] : []));
  return winners.length === 1 ? `Outcome ${winners[0]} paid in full` : "Split";
}

function resolutions(conditions) {
  const counts = new Map();
  for (const condition of conditions) {
    const kind = resolutionOf(condition);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => ({ kind, count: count.toLocaleString("en-US") }));
}

export function shape({ rows }, binds) {
  const totals = builderTotals(rows.builders);
  const conditions = conditionsOf(rows.payouts);
  return {
    day: dayOf(binds),
    exchanges,
    fills: sumOf(totals, "fills").toLocaleString("en-US"),
    volume: formatCompact(sumOf(totals, "volume")),
    builderCount: String(
      totals.filter((total) => total.builder !== zeroWord).length,
    ),
    conditionCount: conditions.length.toLocaleString("en-US"),
    builders: leaderboard(totals),
    resolutions: resolutions(conditions),
  };
}
