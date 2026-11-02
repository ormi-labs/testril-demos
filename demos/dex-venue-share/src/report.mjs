import spec from "../testril.json" with { type: "json" };
import { pairs } from "./pairs.mjs";

export { pairs };

export const window = spec.binds[0].window;
const bpTotal = 10000n;
const priceTolerancePercent = 5n;
const ethDecimals = 18;

const pairById = (id) => pairs.find((pair) => pair.id === id);

const unique = (items) => [...new Set(items)];
export const venuesOf = (pair) => unique(pair.subjects.map((s) => s.venue));
const label = (s) => (s.tier ? `${s.venue} ${s.tier}` : s.venue);
const sum = (values) => values.reduce((a, b) => a + b, 0n);

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export function days() {
  const list = [];
  for (let d = window.from_day; d < window.to_day; d = nextDay(d)) list.push(d);
  return list;
}

function sideVolume(rows, s, day, side) {
  const own = rows[s.bind].filter((r) => r.day === day && r.pool === s.pool);
  if (!side.startsWith("coin:")) return sum(own.map((r) => BigInt(r[side])));
  const coin = side.slice("coin:".length);
  return sum(
    own
      .filter((r) => r.coin_index === coin)
      .map((r) => BigInt(r.volume_in) + BigInt(r.volume_out)),
  );
}

const dayVolumes = (rows, pair, day) =>
  pair.subjects.map((s) => ({
    ...s,
    eth: sideVolume(rows, s, day, s.eth),
    other: s.other ? sideVolume(rows, s, day, s.other) : undefined,
  }));

const venueTotals = (pair, volumes) =>
  venuesOf(pair).map((venue) =>
    sum(volumes.filter((v) => v.venue === venue).map((v) => v.eth)),
  );

const compareBigInt = (a, b) => (a > b ? 1 : a < b ? -1 : 0);
const largestRemainderFirst = (x, y) =>
  compareBigInt(y.remainder, x.remainder) || x.index - y.index;

export function basisPoints(amounts) {
  const total = sum(amounts);
  const points = amounts.map((a) => (a * bpTotal) / total);
  const byRemainder = amounts
    .map((a, index) => ({ index, remainder: (a * bpTotal) % total }))
    .sort(largestRemainderFirst);
  let left = bpTotal - sum(points);
  for (const { index: i } of byRemainder) {
    if (left-- > 0n) points[i] += 1n;
  }
  return points;
}

export function formatAmount(raw, decimals, places = 0) {
  const unit = 10n ** BigInt(decimals);
  const scale = 10n ** BigInt(places);
  const scaled = (raw * scale + unit / 2n) / unit;
  const whole = (scaled / scale).toLocaleString("en-US");
  return places
    ? `${whole}.${String(scaled % scale).padStart(places, "0")}`
    : whole;
}

const formatEth = (raw) => `${formatAmount(raw, ethDecimals)} ETH`;
export const formatPercent = (bp) =>
  `${bp / 100n}.${String(bp % 100n).padStart(2, "0")}%`;
const otherPerEth = (v) => (v.other * 10n ** BigInt(ethDecimals)) / v.eth;

function checkPriceBand(pair, day, v) {
  const milli = (otherPerEth(v) * 1000n) / 10n ** BigInt(pair.otherDecimals);
  const { min, max } = pair.perEthMilli;
  if (milli < min || milli > max)
    throw new Error(
      `On ${day} ${label(v)} trades ${formatAmount(otherPerEth(v), pair.otherDecimals, 4)} per ETH, outside the plausible ${formatAmount(min, 3)} to ${formatAmount(max, 3)}: its sides are swapped.`,
    );
}

function checkPrices(pair, day, volumes) {
  const priced = volumes.filter((v) => v.other !== undefined);
  const [reference, ...rest] = priced;
  if (reference.eth === 0n)
    throw new Error(`${label(reference)} has no volume on ${day}.`);
  for (const v of priced.filter((x) => x.eth > 0n))
    checkPriceBand(pair, day, v);
  const refPrice = otherPerEth(reference);
  for (const v of rest.filter((x) => x.eth > 0n)) {
    const price = otherPerEth(v);
    const gap = price > refPrice ? price - refPrice : refPrice - price;
    if (gap * 100n > refPrice * priceTolerancePercent)
      throw new Error(
        `On ${day} ${label(v)} trades ${formatAmount(price, pair.otherDecimals, 4)} per ETH but ${label(reference)} trades ${formatAmount(refPrice, pair.otherDecimals, 4)}: token sides are not comparable.`,
      );
  }
}

function checkVenueTotals(pair, day, rows, totals) {
  const subjectPools = new Map(pair.subjects.map((s) => [s.pool, s]));
  const direct = sum(
    [...subjectPools.values()].map((s) => sideVolume(rows, s, day, s.eth)),
  );
  if (sum(totals) !== direct)
    throw new Error(
      `${pair.title} venue totals add up to ${formatAmount(sum(totals), ethDecimals)} ETH on ${day} but the subject pools' rows hold ${formatAmount(direct, ethDecimals)} ETH.`,
    );
}

export function check(rows) {
  for (const bind of spec.binds)
    if (!rows[bind.name]?.length) throw new Error(`No rows for ${bind.name}.`);
  const passed = [];
  for (const pair of pairs) {
    for (const day of days()) {
      const volumes = dayVolumes(rows, pair, day);
      const totals = venueTotals(pair, volumes);
      if (sum(totals) === 0n)
        throw new Error(`No ${pair.title} volume on ${day}.`);
      checkVenueTotals(pair, day, rows, totals);
      checkPrices(pair, day, volumes);
    }
    passed.push(
      `${pair.title} venue totals equal the subject pools' ETH-side rows on each of ${days().length} days`,
      `${pair.title} priced pools trade within ${priceTolerancePercent}% of ${label(pair.subjects[0])}'s price and inside the plausible band on every day, so each ETH side is an ETH side despite token order`,
    );
  }
  return passed;
}

function pairView(rows, pair) {
  const venues = venuesOf(pair);
  const perDay = days().map((day) => {
    const totals = venueTotals(pair, dayVolumes(rows, pair, day));
    return { day, totals, points: basisPoints(totals) };
  });
  const windowTotals = venues.map((_, i) =>
    sum(perDay.map((d) => d.totals[i])),
  );
  const windowPoints = basisPoints(windowTotals);
  return {
    id: pair.id,
    title: pair.title,
    venues,
    days: perDay.map((d) => ({
      day: d.day,
      total: formatEth(sum(d.totals)),
      shares: venues.map((venue, i) => ({
        venue,
        percent: formatPercent(d.points[i]),
        eth: formatEth(d.totals[i]),
        fraction: Number(d.points[i]) / Number(bpTotal),
      })),
    })),
    overall: venues
      .map((venue, i) => ({ venue, i }))
      .sort((a, b) => Number(windowPoints[b.i] - windowPoints[a.i]))
      .map(({ venue, i }) => ({
        venue,
        percent: formatPercent(windowPoints[i]),
        eth: formatEth(windowTotals[i]),
      })),
    total: formatEth(sum(windowTotals)),
  };
}

function v3Tiers(rows) {
  const tiers = pairById("eth-usdc").subjects.filter(
    (s) => s.venue === "Uniswap v3",
  );
  const totals = tiers.map((s) =>
    sum(days().map((day) => sideVolume(rows, s, day, s.eth))),
  );
  const points = basisPoints(totals);
  return tiers.map((s, i) => ({
    tier: s.tier,
    pool: s.pool,
    eth: formatEth(totals[i]),
    percent: formatPercent(points[i]),
    fraction: Number(points[i]) / Number(bpTotal),
  }));
}

export function shape(rows) {
  const ethUsdc = pairView(rows, pairById("eth-usdc"));
  const wsteth = pairView(rows, pairById("wsteth-eth"));
  const tiers = v3Tiers(rows);
  const share = (view, venue) =>
    view.overall.find((o) => o.venue === venue).percent;
  return {
    window,
    pairs: [ethUsdc, wsteth],
    tiers,
    headline: {
      volume: ethUsdc.total,
      leader: ethUsdc.overall[0].venue,
      leaderShare: ethUsdc.overall[0].percent,
      topTier: [...tiers].sort((a, b) => b.fraction - a.fraction)[0],
      fluidSteth: share(wsteth, "Fluid"),
      fluidUsdc: share(ethUsdc, "Fluid"),
    },
  };
}
