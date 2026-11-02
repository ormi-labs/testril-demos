import spec from "../testril.json" with { type: "json" };

export const zeroWord = `0x${"0".repeat(64)}`;
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const fillWindow = binds.fills.window;
export const payoutWindow = binds.payouts.window;
export const exchanges = binds.fills.params.exchanges;
export const conditionalTokens = binds.payouts.params.conditional_tokens;
export const day = "2026-11-01";
export const blocksPerHour = 2400;
const tapeSize = 12;
const leaderboardSize = 8;
const priceScale = 10000n;

const inWindow = (row, window) =>
  row.block >= window.from_block && row.block < window.to_block;
const byVolumeDescending = (a, b) =>
  b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0;
const hourOf = (block) =>
  Math.floor((block - fillWindow.from_block) / blocksPerHour);
const shortHex = (hex) => `${hex.slice(0, 8)}…${hex.slice(-4)}`;

const volumeOf = (fill) => BigInt(fill.collateral_amount);
const totalVolume = (fills) => fills.reduce((sum, f) => sum + volumeOf(f), 0n);

export function builderVolumes(fills) {
  const volumes = new Map();
  for (const fill of fills)
    volumes.set(
      fill.builder,
      (volumes.get(fill.builder) ?? 0n) + volumeOf(fill),
    );
  return volumes;
}

function conditionsOf(payouts) {
  const conditions = new Map();
  for (const row of payouts) {
    const condition = conditions.get(row.condition_id) ?? {
      id: row.condition_id,
      block: row.block,
      denominator: BigInt(row.payout_denominator),
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

const feeIsInRequiredAsset = (fill) => {
  const feeInTokens = fill.exchange_version === "1" && fill.is_buy;
  const unpaid = feeInTokens ? fill.collateral_fee : fill.token_fee;
  return BigInt(unpaid) === 0n;
};

export function check(rows) {
  const { fills, payouts } = rows;
  const outside = fills.find((fill) => !inWindow(fill, fillWindow));
  if (outside)
    throw new Error(`Fill at block ${outside.block} is outside the window.`);
  const stranger = fills.find((fill) => !exchanges.includes(fill.exchange));
  if (stranger)
    throw new Error(`Fill from ${stranger.exchange} is not a named exchange.`);
  const keys = new Set(fills.map((fill) => `${fill.tx}:${fill.log_index}`));
  if (keys.size !== fills.length)
    throw new Error("Two fills share a transaction and log index.");
  for (const fill of fills) {
    const collateral = BigInt(fill.collateral_amount);
    const tokens = BigInt(fill.token_amount);
    if (collateral <= 0n || collateral > tokens)
      throw new Error(
        `Fill ${shortHex(fill.tx)} moves ${collateral} collateral for ${tokens} tokens, a price outside (0, 1].`,
      );
  }
  const feeProblem = fills.find((fill) => !feeIsInRequiredAsset(fill));
  if (feeProblem)
    throw new Error(
      `Fill ${shortHex(feeProblem.tx)} books its fee in the wrong asset: collateral_fee ${feeProblem.collateral_fee}, token_fee ${feeProblem.token_fee} for a version ${feeProblem.exchange_version} ${feeProblem.is_buy ? "buy" : "sell"}.`,
    );
  const versionOne = fills.filter((fill) => fill.exchange_version === "1");
  const coded = versionOne.find(
    (fill) => fill.builder !== zeroWord || fill.metadata !== zeroWord,
  );
  if (coded)
    throw new Error(
      `Version 1 fill ${shortHex(coded.tx)} carries a builder or metadata, but version 1 emits none.`,
    );
  const total = totalVolume(fills);
  const builderSum = [...builderVolumes(fills).values()].reduce(
    (sum, volume) => sum + volume,
    0n,
  );
  if (builderSum !== total)
    throw new Error(
      `Builder volumes sum to ${builderSum}, not the total ${total}.`,
    );
  assertLeaderboardAddsUp(leaderboardEntries(fills), total);
  const conditions = conditionsOf(payouts);
  for (const condition of conditions) {
    const outside = condition.rows.find((row) => !inWindow(row, payoutWindow));
    if (outside)
      throw new Error(
        `Condition ${shortHex(condition.id)} resolved at block ${outside.block}, outside the window.`,
      );
    const sum = condition.numerators.reduce((s, n) => s + n, 0n);
    if (condition.rows.some((r) => BigInt(r.payout_denominator) !== sum))
      throw new Error(
        `Condition ${shortHex(condition.id)} pays numerators summing to ${sum}, not its denominator.`,
      );
  }
  return [
    `All ${fills.length} fills price within (0, 1]: collateral never exceeds outcome tokens`,
    `Every fee is booked in the asset its version and side require`,
    `Builder volumes and the leaderboard (top ${leaderboardSize} plus other builders) each add up to the ${formatUsd(total)} total`,
    `${conditions.length} resolved conditions each pay a denominator equal to the sum of their numerators`,
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

export function priceText(fill) {
  const scaled =
    (BigInt(fill.collateral_amount) * priceScale) / BigInt(fill.token_amount);
  return `${scaled / priceScale}.${String(scaled % priceScale).padStart(4, "0")}`;
}

const tokensText = (raw) => (BigInt(raw) / 10n ** 6n).toLocaleString("en-US");
const builderLabel = (builder) =>
  builder === zeroWord ? "No builder code" : shortHex(builder);

function tape(fills) {
  return [...fills]
    .map((fill) => ({ fill, volume: volumeOf(fill) }))
    .sort(byVolumeDescending)
    .slice(0, tapeSize)
    .map(({ fill, volume }) => ({
      hour: hourOf(fill.block),
      block: fill.block,
      side: fill.is_buy ? "Maker buys" : "Maker sells",
      maker: shortHex(fill.maker),
      taker: shortHex(fill.taker),
      market: `…${fill.token_id.slice(-8)}`,
      price: priceText(fill),
      tokens: tokensText(fill.token_amount),
      volume: formatUsd(volume),
    }));
}

function busiestMarket(fills) {
  const volumes = new Map();
  for (const fill of fills)
    volumes.set(
      fill.token_id,
      (volumes.get(fill.token_id) ?? 0n) + volumeOf(fill),
    );
  return [...volumes].sort((a, b) =>
    byVolumeDescending({ volume: a[1] }, { volume: b[1] }),
  )[0][0];
}

function oddsLine(fills) {
  const tokenId = busiestMarket(fills);
  const hourly = new Map();
  for (const fill of fills.filter((f) => f.token_id === tokenId)) {
    const hour = hourOf(fill.block);
    const bucket = hourly.get(hour) ?? { collateral: 0n, tokens: 0n, fills: 0 };
    bucket.collateral += BigInt(fill.collateral_amount);
    bucket.tokens += BigInt(fill.token_amount);
    bucket.fills += 1;
    hourly.set(hour, bucket);
  }
  return {
    market: `…${tokenId.slice(-8)}`,
    points: [...hourly]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, { collateral, tokens, fills: count }]) => ({
        hour,
        fills: count,
        price: Number((collateral * priceScale) / tokens) / Number(priceScale),
      })),
  };
}

export function leaderboardEntries(fills) {
  const counts = new Map();
  for (const fill of fills)
    counts.set(fill.builder, (counts.get(fill.builder) ?? 0) + 1);
  const ranked = [...builderVolumes(fills)]
    .map(([builder, volume]) => ({
      label: builderLabel(builder),
      volume,
      fills: counts.get(builder),
    }))
    .sort(byVolumeDescending);
  const rest = ranked.slice(leaderboardSize);
  if (rest.length === 0) return ranked;
  return [
    ...ranked.slice(0, leaderboardSize),
    {
      label: "Other builders",
      volume: rest.reduce((sum, e) => sum + e.volume, 0n),
      fills: rest.reduce((sum, e) => sum + e.fills, 0),
    },
  ];
}

export function assertLeaderboardAddsUp(entries, total) {
  const shown = entries.reduce((sum, entry) => sum + entry.volume, 0n);
  if (shown !== total)
    throw new Error(
      `Leaderboard rows sum to ${shown}, not the total ${total}.`,
    );
}

function leaderboard(fills) {
  const total = totalVolume(fills);
  return leaderboardEntries(fills).map(({ label, volume, fills: count }) => ({
    label,
    volume: formatUsd(volume),
    fills: String(count),
    share: `${Number((volume * 1000n) / total) / 10}%`,
    fraction: Number((volume * priceScale) / total) / Number(priceScale),
  }));
}

function resolved(payouts) {
  return conditionsOf(payouts).map((condition) => ({
    condition: shortHex(condition.id),
    block: condition.block,
    payouts: condition.numerators.join(" · "),
    denominator: String(condition.denominator),
  }));
}

export function shape(rows) {
  const { fills, payouts } = rows;
  const total = totalVolume(fills);
  const largest = fills.reduce((a, b) => (volumeOf(b) > volumeOf(a) ? b : a));
  const builders = builderVolumes(fills);
  builders.delete(zeroWord);
  return {
    day,
    fillWindow,
    exchanges,
    fills: String(fills.length),
    volume: formatCompact(total),
    largest: formatUsd(volumeOf(largest)),
    builderCount: String(builders.size),
    tape: tape(fills),
    odds: oddsLine(fills),
    builders: leaderboard(fills),
    resolved: resolved(payouts),
  };
}
