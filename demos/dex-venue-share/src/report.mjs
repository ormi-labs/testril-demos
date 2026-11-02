import spec from "../testril.json" with { type: "json" };

export const window = spec.binds[0].window;
const bpTotal = 10000n;
const priceTolerancePercent = 5n;
const ethDecimals = 18;

const subject = (venue, bind, pool, eth, other, tier) => ({
  venue,
  bind,
  pool,
  eth,
  other,
  tier,
});
const usdcPools = {
  v2: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc",
  v3Fee100: "0xe0554a476a092703abdb3ef35c80e0d76d32939f",
  v3Fee500: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  v3Fee3000: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
  v3Fee10000: "0x7bea39867e4169dbe237d55c8242a8f2fcdcc387",
  v4: "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27",
  curve: "0x7f86bf177dd4f3494b841a37e810a34dd56c829b",
  fluid: "0x2886a01a0645390872a9eb99dae1283664b0c524",
};
const wstethPools = {
  v3: "0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa",
  fluid: "0x0b1a513ee24972daef112bc777a5610d4325c9e7",
};

// Side names say which row field holds the ETH side. Uniswap v2 and v3 sort
// WETH after USDC; v4 and Fluid list the native ETH side first; Curve rows are
// per coin index (tricrypto: 0 USDC, 2 WETH).
export const pairs = [
  {
    id: "eth-usdc",
    title: "ETH / USDC",
    otherDecimals: 6,
    subjects: [
      subject("Uniswap v2", "uniswap-v2", usdcPools.v2, "volume1", "volume0"),
      subject(
        "Uniswap v3",
        "uniswap-v3",
        usdcPools.v3Fee500,
        "volume1",
        "volume0",
        "0.05%",
      ),
      subject(
        "Uniswap v3",
        "uniswap-v3",
        usdcPools.v3Fee3000,
        "volume1",
        "volume0",
        "0.3%",
      ),
      subject(
        "Uniswap v3",
        "uniswap-v3",
        usdcPools.v3Fee100,
        "volume1",
        "volume0",
        "0.01%",
      ),
      subject(
        "Uniswap v3",
        "uniswap-v3",
        usdcPools.v3Fee10000,
        "volume1",
        "volume0",
        "1%",
      ),
      subject("Uniswap v4", "uniswap-v4", usdcPools.v4, "volume0", "volume1"),
      subject("Curve", "curve", usdcPools.curve, "coin:2", "coin:0"),
      subject("Fluid", "fluid-dex", usdcPools.fluid, "volume0", "volume1"),
    ],
  },
  {
    id: "wsteth-eth",
    title: "wstETH / ETH",
    otherDecimals: 18,
    subjects: [
      subject(
        "Uniswap v3",
        "uniswap-v3",
        wstethPools.v3,
        "volume1",
        "volume0",
        "0.01%",
      ),
      subject("Fluid", "fluid-dex", wstethPools.fluid, "volume1", "volume0"),
    ],
  },
];

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
    other: sideVolume(rows, s, day, s.other),
  }));

const venueTotals = (pair, volumes) =>
  venuesOf(pair).map((venue) =>
    sum(volumes.filter((v) => v.venue === venue).map((v) => v.eth)),
  );

export function basisPoints(amounts) {
  const total = sum(amounts);
  const points = amounts.map((a) => (a * bpTotal) / total);
  const byRemainder = amounts
    .map((a, i) => [i, (a * bpTotal) % total])
    .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : x[0] - y[0]));
  let left = bpTotal - sum(points);
  for (const [i] of byRemainder) {
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

function checkPrices(pair, day, volumes) {
  const [reference, ...rest] = volumes;
  if (reference.eth === 0n)
    throw new Error(`${label(reference)} has no volume on ${day}.`);
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
      const shareSum = sum(basisPoints(totals));
      if (shareSum !== bpTotal)
        throw new Error(
          `${pair.title} venue shares sum to ${formatPercent(shareSum)} on ${day}.`,
        );
      checkPrices(pair, day, volumes);
    }
    passed.push(
      `${pair.title} venue shares sum to 100.00% on each of ${days().length} days`,
      `${pair.title} pools trade within ${priceTolerancePercent}% of ${label(pair.subjects[0])}'s price on every day, so each pool's ETH side is compared with ETH sides despite token order`,
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
  const tiers = pairs[0].subjects.filter((s) => s.venue === "Uniswap v3");
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
  const [ethUsdc, wsteth] = pairs.map((pair) => pairView(rows, pair));
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
