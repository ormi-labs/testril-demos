import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const poolWindow = binds.pool.window;
export const [ethFeed, btcFeed, usdcFeed] = binds.feeds.params.feeds;
export const feedNames = new Map([
  [ethFeed, "ETH / USD"],
  [btcFeed, "BTC / USD"],
  [usdcFeed, "USDC / USD"],
]);
export const feedDecimals = 8n;
const ethDecimals = 18n;
const usdcDecimals = 6n;
const maxGapBasisPoints = 200n;
const q192 = 2n ** 192n;

const hourStamp = (ms) => new Date(ms).toISOString().slice(0, 13);

export function windowHours() {
  const hours = [];
  for (
    let ms = Date.parse(`${poolWindow.from_hour}:00:00Z`);
    hourStamp(ms) < poolWindow.to_hour;
    ms += 3600000
  )
    hours.push(hourStamp(ms));
  return hours;
}

export const poolPriceFromSqrt = (sqrtPriceX96) =>
  (BigInt(sqrtPriceX96) ** 2n *
    10n ** (ethDecimals - usdcDecimals + feedDecimals)) /
  q192;

export const sqrtFromPrice = (priceScaled) =>
  isqrt(
    (priceScaled * q192) / 10n ** (ethDecimals - usdcDecimals + feedDecimals),
  );

function isqrt(n) {
  let x = n;
  let next = (x + 1n) / 2n;
  while (next < x) {
    x = next;
    next = (x + n / x) / 2n;
  }
  return x;
}

function answersByHour(rows, feed) {
  return new Map(
    rows.feeds
      .filter((row) => row.feed.toLowerCase() === feed)
      .map((row) => [row.hour, BigInt(row.answer)]),
  );
}

const poolByHour = (rows) =>
  new Map(
    rows.pool.map((row) => [row.hour, poolPriceFromSqrt(row.sqrt_price_x96)]),
  );

const gapBasisPoints = (pool, oracle) => ((pool - oracle) * 10000n) / oracle;

const abs = (n) => (n < 0n ? -n : n);

export function check(rows) {
  const hours = windowHours();
  const pool = poolByHour(rows);
  const oracle = answersByHour(rows, ethFeed);
  for (const [name, series] of [
    ["Pool price", pool],
    ["ETH / USD feed", oracle],
  ]) {
    const missing = hours.filter((hour) => !series.has(hour));
    if (missing.length) throw new Error(`${name} is missing ${missing[0]}.`);
  }
  const notPositive = rows.feeds.find((row) => BigInt(row.answer) <= 0n);
  if (notPositive)
    throw new Error(
      `Feed ${notPositive.feed} answered ${notPositive.answer} at ${notPositive.hour}.`,
    );
  let widest = 0n;
  for (const hour of hours) {
    const gap = abs(gapBasisPoints(pool.get(hour), oracle.get(hour)));
    if (gap > maxGapBasisPoints)
      throw new Error(
        `At ${hour} the pool price ${formatPrice(pool.get(hour))} is ${formatPercent(gap)} from the feed ${formatPrice(oracle.get(hour))}, beyond ${formatPercent(maxGapBasisPoints)}.`,
      );
    if (gap > widest) widest = gap;
  }
  return [
    `Pool price and ETH / USD feed present for all ${hours.length} hours`,
    `Every feed answer is positive (${rows.feeds.length} answers)`,
    `Pool price stays within ${formatPercent(maxGapBasisPoints)} of the feed every hour; the widest gap is ${formatPercent(widest)}`,
  ];
}

export function formatPrice(scaled) {
  const cents = (scaled + 500000n) / 1000000n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
}

export function formatPercent(basisPoints) {
  const sign = basisPoints < 0n ? "−" : "";
  const magnitude = abs(basisPoints);
  return `${sign}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}%`;
}

const formatDollars = (value) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNumber = (scaled) => Number(scaled) / 10 ** Number(feedDecimals);

function heartbeat(rows, feed) {
  const answers = answersByHour(rows, feed);
  const series = windowHours().map((hour) => answers.get(hour));
  let updates = 0;
  let flat = 0;
  let longestFlat = 0;
  let largestStep = 0n;
  for (let i = 1; i < series.length; i += 1) {
    if (series[i] === series[i - 1]) {
      flat += 1;
      longestFlat = Math.max(longestFlat, flat);
    } else {
      updates += 1;
      flat = 0;
      const step = abs(gapBasisPoints(series[i], series[i - 1]));
      if (step > largestStep) largestStep = step;
    }
  }
  return {
    name: feedNames.get(feed),
    feed,
    latest: formatPrice(series.at(-1)),
    updates: String(updates),
    longestFlat: `${longestFlat} h`,
    largestStep: formatPercent(largestStep),
  };
}

export function shape(rows) {
  const hours = windowHours();
  const pool = poolByHour(rows);
  const oracle = answersByHour(rows, ethFeed);
  const gaps = hours.map((hour) =>
    gapBasisPoints(pool.get(hour), oracle.get(hour)),
  );
  const widest = gaps.reduce((a, b) => (abs(b) > abs(a) ? b : a));
  const meanAbs =
    gaps.reduce((sum, gap) => sum + abs(gap), 0n) / BigInt(gaps.length);
  const series = hours.map((hour) => ({
    hour,
    pool: toNumber(pool.get(hour)),
    oracle: toNumber(oracle.get(hour)),
  }));
  const prices = series.flatMap((point) => [point.pool, point.oracle]);
  return {
    poolWindow,
    latestPool: formatPrice(pool.get(hours.at(-1))),
    latestOracle: formatPrice(oracle.get(hours.at(-1))),
    widestGap: formatPercent(widest),
    widestGapHour: hours[gaps.indexOf(widest)],
    meanGap: formatPercent(meanAbs),
    low: formatDollars(Math.min(...prices)),
    high: formatDollars(Math.max(...prices)),
    series,
    feeds: [ethFeed, btcFeed, usdcFeed].map((feed) => heartbeat(rows, feed)),
  };
}
