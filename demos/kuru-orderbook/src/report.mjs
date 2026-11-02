import spec from "../testril.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const router = binds.markets.params.router;
export const volumeWindow = binds.volume.window;
export const usdc = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const symbols = new Map([
  [zeroAddress, "MON"],
  [usdc, "USDC"],
  ["0x3bd359c1119da7da1d913d1c4d2b7c461115433a", "WMON"],
  ["0xee8c0e9f1bffb4eb878d8f15f368a02a35481242", "WETH"],
  ["0x0555e30da8f98308edb960aa94c0db47230d2b9c", "WBTC"],
  ["0xe7cd86e13ac4309349f30b3435a9d337750fc82d", "USDT0"],
]);
const chartMarkets = 8;

const nextDay = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * 86400000)
    .toISOString()
    .slice(0, 10);

export function volumeDays() {
  const days = [];
  for (
    let d = volumeWindow.from_day;
    d < volumeWindow.to_day;
    d = nextDay(d, 1)
  )
    days.push(d);
  return days;
}

const feeFields = ["base_fee", "base_rebate", "quote_fee", "quote_rebate"];

const bpsDenominator = 10000n;

const feeError = (row, message) =>
  new Error(`Market ${row.market} on ${row.day}: ${message}.`);

function checkFees(row, market) {
  for (const field of feeFields)
    if (BigInt(row[field]) < 0n)
      throw feeError(row, `${field} is negative (${row[field]})`);
  const takerBps = BigInt(market.taker_fee_bps);
  if (
    BigInt(row.quote_fee) * bpsDenominator >
    BigInt(row.quote_volume) * takerBps
  )
    throw feeError(row, `quote_fee exceeds ${takerBps} bps of quote_volume`);
  if (BigInt(market.maker_fee_bps) > takerBps) return;
  for (const side of ["base", "quote"])
    if (BigInt(row[`${side}_rebate`]) > BigInt(row[`${side}_fee`]))
      throw feeError(row, `${side}_rebate exceeds ${side}_fee`);
}

export function check(rows) {
  const registered = new Map(
    rows.markets.map((market) => [market.market.toLowerCase(), market]),
  );
  const days = new Set(volumeDays());
  const seen = new Set();
  for (const row of rows.volume) {
    const market = registered.get(row.market.toLowerCase());
    if (!market)
      throw new Error(
        `Volume row of market ${row.market} on ${row.day} has no market_list row.`,
      );
    checkFees(row, market);
    if (!days.has(row.day))
      throw new Error(`Volume row on ${row.day} is outside the window.`);
    const key = `${row.market.toLowerCase()}@${row.day}`;
    if (seen.has(key))
      throw new Error(`Market ${row.market} has two rows for ${row.day}.`);
    seen.add(key);
  }
  return [
    `All ${rows.volume.length} volume rows belong to the ${registered.size} registered markets`,
    `Fees and rebates fit each market's registered rates in all ${rows.volume.length} rows`,
    `Every row is inside ${volumeWindow.from_day} to ${volumeWindow.to_day} (exclusive) and each market has one row per day`,
  ];
}

const symbolOf = (asset) => symbols.get(asset) ?? shortAddress(asset);
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function formatTokens(raw, places = 2) {
  const step = 10n ** (18n - BigInt(places));
  const rounded = (raw + step / 2n) / step;
  const whole = (rounded / 10n ** BigInt(places)).toLocaleString("en-US");
  if (places === 0) return whole;
  const fraction = String(rounded % 10n ** BigInt(places)).padStart(
    places,
    "0",
  );
  return `${whole}.${fraction}`;
}

const toFloat = (raw) => Number(raw / 10n ** 14n) / 1e4;

function totalsByMarket(volume) {
  const totals = new Map();
  for (const row of volume) {
    const key = row.market.toLowerCase();
    const total = totals.get(key) ?? {
      quoteVolume: 0n,
      trades: 0n,
      baseFee: 0n,
      baseRebate: 0n,
      quoteFee: 0n,
      quoteRebate: 0n,
    };
    total.quoteVolume += BigInt(row.quote_volume);
    total.trades += BigInt(row.trades);
    total.baseFee += BigInt(row.base_fee);
    total.baseRebate += BigInt(row.base_rebate);
    total.quoteFee += BigInt(row.quote_fee);
    total.quoteRebate += BigInt(row.quote_rebate);
    totals.set(key, total);
  }
  return totals;
}

function amounts(base, quote, baseSymbol, quoteSymbol) {
  const parts = [
    [base, baseSymbol],
    [quote, quoteSymbol],
  ]
    .filter(([raw]) => raw > 0n)
    .map(([raw, symbol]) => `${formatTokens(raw, 4)} ${symbol}`);
  return parts.length ? parts.join(" + ") : "none";
}

function marketView(market, total) {
  const baseSymbol = symbolOf(market.base_asset);
  const quoteSymbol = symbolOf(market.quote_asset);
  const quoteVolume = total?.quoteVolume ?? 0n;
  return {
    market: market.market,
    pair: `${baseSymbol}/${quoteSymbol}`,
    usdcQuoted: market.quote_asset === usdc,
    volume: `${formatTokens(quoteVolume)} ${quoteSymbol}`,
    amount: toFloat(quoteVolume),
    trades: (total?.trades ?? 0n).toLocaleString("en-US"),
    takerBps: market.taker_fee_bps,
    makerBps: market.maker_fee_bps,
    fees: amounts(
      total?.baseFee ?? 0n,
      total?.quoteFee ?? 0n,
      baseSymbol,
      quoteSymbol,
    ),
    rebates: amounts(
      total?.baseRebate ?? 0n,
      total?.quoteRebate ?? 0n,
      baseSymbol,
      quoteSymbol,
    ),
  };
}

const compareBigInt = (a, b) => (a > b) - (a < b);

function share(part, whole) {
  if (whole === 0n) return "0.0%";
  const tenths = (part * 1000n) / whole;
  return `${tenths / 10n}.${tenths % 10n}%`;
}

export function shape(rows) {
  const totals = totalsByMarket(rows.volume);
  const entries = rows.markets
    .map((market) => {
      const total = totals.get(market.market.toLowerCase());
      return {
        view: marketView(market, total),
        rawVolume: total?.quoteVolume ?? 0n,
      };
    })
    .sort(
      (a, b) =>
        Number(b.view.usdcQuoted) - Number(a.view.usdcQuoted) ||
        compareBigInt(b.rawVolume, a.rawVolume),
    );
  const usdcEntries = entries.filter((entry) => entry.view.usdcQuoted);
  const usdcVolume = usdcEntries.reduce((sum, e) => sum + e.rawVolume, 0n);
  const trades = [...totals.values()].reduce((sum, t) => sum + t.trades, 0n);
  const top = usdcEntries[0];
  return {
    volumeWindow,
    router,
    registered: entries.length,
    active: totals.size,
    usdcVolume: `${formatTokens(usdcVolume, 0)} USDC`,
    trades: trades.toLocaleString("en-US"),
    topMarket: top && usdcVolume > 0n ? top.view.pair : "none",
    topShare: top ? share(top.rawVolume, usdcVolume) : "0.0%",
    bars: usdcEntries
      .slice(0, chartMarkets)
      .map(({ view: { pair, volume, amount } }) => ({ pair, volume, amount })),
    markets: entries.map((entry) => entry.view),
  };
}
