import { pairs } from "./pairs.mjs";

const dayMs = 86400000;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const untilToday = (ms) => ({
    from_time: isoSecond(today - ms),
    to_time: isoSecond(today),
  });
  return [
    {
      name: "uniswap-v2",
      function_slug: "uniswap_v2.pool_volume",
      chain_id: 1,
      params: {
        swap: {
          pool_list: { factory: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f" },
        },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "uniswap-v3",
      function_slug: "uniswap_v3.pool_volume",
      chain_id: 1,
      params: {
        swap: {
          pool_list: { factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984" },
        },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "uniswap-v4",
      function_slug: "uniswap_v4.pool_volume",
      chain_id: 1,
      params: {
        swap: { manager: "0x000000000004444c5dc75cb358380d2e3de08a90" },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "curve",
      function_slug: "curve.pool_volume",
      chain_id: 1,
      params: {
        swap: {
          pool_list: { factory: "0x0c0e5f2ff0ff18a3be9b835635039256dc4b4963" },
        },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "fluid-dex",
      function_slug: "fluid_dex.pool_volume",
      chain_id: 1,
      params: {
        swap: {
          pool_list: { factory: "0x91716c4eda1fb55e84bf8b4c7085f84285c19085" },
        },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
  ];
}

export { pairs };

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

const utcDay = (time) => time.slice(0, 10);

export function days(binds) {
  const { window } = binds[0];
  const list = [];
  for (
    let d = utcDay(window.from_time);
    d < utcDay(window.to_time);
    d = nextDay(d)
  )
    list.push(d);
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
  for (const v of rest.filter((x) => x.eth > 0n && !x.bandOnly)) {
    const price = otherPerEth(v);
    const gap = price > refPrice ? price - refPrice : refPrice - price;
    if (gap * 100n > refPrice * priceTolerancePercent)
      throw new Error(
        `On ${day} ${label(v)} trades ${formatAmount(price, pair.otherDecimals, 4)} per ETH but ${label(reference)} trades ${formatAmount(refPrice, pair.otherDecimals, 4)}: token sides are not comparable.`,
      );
  }
}

function checkSubjectsHaveRows(pair, rows) {
  for (const s of pair.subjects)
    if (!rows[s.bind].some((r) => r.pool === s.pool))
      throw new Error(
        `${pair.title}: ${label(s)} subject pool ${s.pool} has no rows in ${s.bind}: the address is wrong or the pool is idle.`,
      );
}

export function check(rows, binds) {
  const window = days(binds);
  for (const bind of binds)
    if (!rows[bind.name]?.length) throw new Error(`No rows for ${bind.name}.`);
  const passed = [];
  for (const pair of pairs) {
    checkSubjectsHaveRows(pair, rows);
    for (const day of window) {
      const volumes = dayVolumes(rows, pair, day);
      const totals = venueTotals(pair, volumes);
      if (sum(totals) === 0n)
        throw new Error(`No ${pair.title} volume on ${day}.`);
      checkPrices(pair, day, volumes);
    }
    const bandOnly = pair.subjects.filter((s) => s.bandOnly).map(label);
    const comparable = bandOnly.length
      ? `all but ${bandOnly.join(", ")}`
      : "all";
    passed.push(
      `${pair.title} every subject pool has rows in its bind over the window`,
      `${pair.title} priced pools trade inside the plausible band on every day, and ${comparable} within ${priceTolerancePercent}% of ${label(pair.subjects[0])}'s price, so each ETH side is an ETH side despite token order`,
    );
  }
  return passed;
}

function pairView(rows, window, pair) {
  const venues = venuesOf(pair);
  const perDay = window.map((day) => {
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

function v3Tiers(rows, window) {
  const tiers = pairById("eth-usdc").subjects.filter(
    (s) => s.venue === "Uniswap v3",
  );
  const totals = tiers.map((s) =>
    sum(window.map((day) => sideVolume(rows, s, day, s.eth))),
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

export function shape(rows, binds) {
  const window = days(binds);
  const ethUsdc = pairView(rows, window, pairById("eth-usdc"));
  const wsteth = pairView(rows, window, pairById("wsteth-eth"));
  const tiers = v3Tiers(rows, window);
  const share = (view, venue) =>
    view.overall.find((o) => o.venue === venue).percent;
  return {
    window: { first: window[0], last: window.at(-1) },
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
