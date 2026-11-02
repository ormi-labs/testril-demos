import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const feesWindow = binds["pool-fees"].window;
export const launchWindow = binds.launches.window;
const topTokens = 12;

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export function feeDays() {
  const days = [];
  for (let d = feesWindow.from_day; d < feesWindow.to_day; d = nextDay(d))
    days.push(d);
  return days;
}

function raw(value, label) {
  if (!/^\d+$/.test(String(value)))
    throw new Error(`${label} is not a raw integer amount: ${value}.`);
  return BigInt(value);
}

const splitTotal = (row) =>
  raw(row.creator_amount, "creator_amount") +
  raw(row.buyback_amount, "buyback_amount") +
  raw(row.protocol_amount, "protocol_amount");

const splitFields = ["creator", "buyback", "protocol"];

function tokenTotals(rows, sweepsOf) {
  const totals = new Map();
  for (const row of rows) {
    const token = row.token.toLowerCase();
    const entry = totals.get(token) ?? {
      token,
      sweeps: 0n,
      creator: 0n,
      buyback: 0n,
      protocol: 0n,
    };
    entry.sweeps += sweepsOf(row);
    for (const field of splitFields)
      entry[field] += raw(row[`${field}_amount`], `${field}_amount`);
    totals.set(token, entry);
  }
  return totals;
}

const feeTotals = (feeRows) =>
  tokenTotals(feeRows, (row) => raw(row.sweeps, "sweeps"));
const sweepTotals = (sweepRows) => tokenTotals(sweepRows, () => 1n);
const totalOf = (entry) => entry.creator + entry.buyback + entry.protocol;
const byTotalDesc = (a, b) =>
  (totalOf(b) > totalOf(a)) - (totalOf(b) < totalOf(a));

const tokensOf = (rows) => new Set(rows.map((row) => row.token.toLowerCase()));

function firstMissing(tokens, known) {
  return [...tokens].find((token) => !known.has(token));
}

export function check(rows) {
  const launched = tokensOf(rows.launches);
  const graduated = tokensOf(rows.graduations);
  const orphan = firstMissing(graduated, launched);
  if (orphan)
    throw new Error(`Token ${orphan} graduated but was never launched.`);
  const sweptTokens = tokensOf(rows["pool-fees"]);
  const unlisted = firstMissing(sweptTokens, graduated);
  if (unlisted)
    throw new Error(`Token ${unlisted} had fees swept but never graduated.`);
  const curves = new Set(rows.launches.map((row) => row.curve.toLowerCase()));
  const strayCurve = firstMissing(
    new Set(rows["curve-volume"].map((row) => row.curve.toLowerCase())),
    curves,
  );
  if (strayCurve)
    throw new Error(`Curve ${strayCurve} traded but was never launched.`);
  const seen = new Set();
  for (const row of rows["pool-fees"]) {
    const key = `${row.day}/${row.token.toLowerCase()}`;
    if (seen.has(key))
      throw new Error(`Token ${row.token} has two fee rows on ${row.day}.`);
    seen.add(key);
  }
  const fromSweeps = sweepTotals(rows["pool-fee-sweep"]);
  const fromFees = feeTotals(rows["pool-fees"]);
  for (const token of new Set([...fromSweeps.keys(), ...fromFees.keys()])) {
    const swept = fromSweeps.get(token);
    const fees = fromFees.get(token);
    const mismatch = ["sweeps", ...splitFields].find(
      (field) => (swept?.[field] ?? 0n) !== (fees?.[field] ?? 0n),
    );
    if (mismatch)
      throw new Error(
        `Token ${token} fee rows give ${fees?.[mismatch] ?? 0n} ${mismatch}, its sweeps give ${swept?.[mismatch] ?? 0n}.`,
      );
  }
  const total = [...fromSweeps.values()].reduce((s, e) => s + totalOf(e), 0n);
  return [
    `All ${graduated.size} graduated tokens are among the ${launched.size} launched tokens`,
    `All ${sweptTokens.size} tokens with swept fees graduated, and every traded curve was launched`,
    `${formatEth(total)} swept: per token, the fee rows' sweep count and creator, buyback and protocol amounts equal the sums over its individual sweeps, one fee row per token per day`,
  ];
}

function sumBy(feeRows, key) {
  const sums = new Map();
  for (const row of feeRows)
    sums.set(row[key], (sums.get(row[key]) ?? 0n) + splitTotal(row));
  return sums;
}

export function formatEth(wei) {
  const units = (wei + 5n * 10n ** 13n) / 10n ** 14n;
  const whole = (units / 10000n).toLocaleString("en-US");
  return `${whole}.${String(units % 10000n).padStart(4, "0")} ETH`;
}

const percent = (part, whole) =>
  whole === 0n ? "0%" : `${(part * 100n + whole / 2n) / whole}%`;

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const eth = (wei) => Number(wei / 10n ** 12n) / 1e6;

const tokenFees = (feeRows) =>
  [...feeTotals(feeRows).values()].sort(byTotalDesc);

export function shape(rows) {
  const launched = rows.launches.length;
  const graduated = tokensOf(rows.graduations).size;
  const sweptTokenCount = tokensOf(rows["pool-fees"]).size;
  const tokens = tokenFees(rows["pool-fees"]);
  const sum = (key) => tokens.reduce((s, t) => s + t[key], 0n);
  const [creator, buyback, protocol] = [
    sum("creator"),
    sum("buyback"),
    sum("protocol"),
  ];
  const total = creator + buyback + protocol;
  const volume = rows["curve-volume"].reduce(
    (s, row) => s + BigInt(row.bought) + BigInt(row.sold),
    0n,
  );
  const dailyFees = sumBy(rows["pool-fees"], "day");
  return {
    feesWindow,
    launchWindow,
    funnel: [
      { label: "Launched", count: launched },
      { label: "Graduated", count: graduated },
      { label: "Fees swept", count: sweptTokenCount },
    ],
    graduationRate: percent(BigInt(graduated), BigInt(launched)),
    volume: formatEth(volume),
    swept: formatEth(total),
    creator: formatEth(creator),
    buyback: formatEth(buyback),
    protocol: formatEth(protocol),
    creatorShare: percent(creator, total),
    buybackShare: percent(buyback, total),
    protocolShare: percent(protocol, total),
    daily: feeDays().map((day) => ({
      day,
      eth: eth(dailyFees.get(day) ?? 0n),
    })),
    tokens: tokens.slice(0, topTokens).map((t) => ({
      token: t.token,
      label: shortAddress(t.token),
      sweeps: t.sweeps.toString(),
      creator: formatEth(t.creator),
      buyback: formatEth(t.buyback),
      protocol: formatEth(t.protocol),
      total: formatEth(totalOf(t)),
    })),
  };
}
