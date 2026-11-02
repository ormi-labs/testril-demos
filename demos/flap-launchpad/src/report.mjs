import spec from "../testril.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const portal = binds.trades.params.portal;
export const volumeWindow = binds.volume.window;
export const tradesWindow = binds.trades.window;
const decimals = 18n;
const topTokens = 20;
const chartTokens = 10;

const nextDay = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * 86400000)
    .toISOString()
    .slice(0, 10);

export function volumeDays() {
  const dayCount =
    (Date.parse(volumeWindow.to_day) - Date.parse(volumeWindow.from_day)) /
    86400000;
  return Array.from({ length: dayCount }, (_, i) =>
    nextDay(volumeWindow.from_day, i),
  );
}
export const tradesDay = nextDay(volumeWindow.to_day, -1);

const keyOf = (row) => `${row.token}:${row.quote_token}`;

export function sumTrades(trades) {
  const sums = new Map();
  for (const trade of trades) {
    const sum = sums.get(keyOf(trade)) ?? {
      token: trade.token,
      quote_token: trade.quote_token,
      trades: 0n,
      buy_quote_amount: 0n,
      sell_quote_amount: 0n,
    };
    sum.trades += 1n;
    if (trade.is_buy) sum.buy_quote_amount += BigInt(trade.quote_amount);
    else sum.sell_quote_amount += BigInt(trade.quote_amount);
    sums.set(keyOf(trade), sum);
  }
  return sums;
}

function mismatch(volume, sum) {
  if (!volume || !sum) return "has trades on only one side";
  if (BigInt(volume.trades) !== sum.trades)
    return `counts ${volume.trades} trades but the trade rows have ${sum.trades}`;
  if (BigInt(volume.buy_quote_amount) !== sum.buy_quote_amount)
    return `sums buys to ${volume.buy_quote_amount} but the trade rows sum to ${sum.buy_quote_amount}`;
  if (BigInt(volume.sell_quote_amount) !== sum.sell_quote_amount)
    return `sums sells to ${volume.sell_quote_amount} but the trade rows sum to ${sum.sell_quote_amount}`;
}

export function check(rows) {
  const days = volumeDays();
  const missing = days.filter((day) => !rows.volume.some((r) => r.day === day));
  if (missing.length)
    throw new Error(`Volume is missing ${missing.join(", ")}.`);
  const strayDay = rows.volume.find((r) => !days.includes(r.day));
  if (strayDay)
    throw new Error(`Volume row for ${strayDay.day} is outside the window.`);
  const outside = rows.trades.filter(
    (t) =>
      t.block < tradesWindow.from_block || t.block >= tradesWindow.to_block,
  );
  if (outside.length)
    throw new Error(
      `Trade at block ${outside[0].block} is outside the window.`,
    );
  const badFee = rows.trades.find((t) => {
    const fee = BigInt(t.fee_amount);
    return fee < 0n || fee > BigInt(t.quote_amount);
  });
  if (badFee)
    throw new Error(
      `Trade ${badFee.tx} has fee ${badFee.fee_amount} outside 0..${badFee.quote_amount}.`,
    );
  const sums = sumTrades(rows.trades);
  const volumes = new Map(
    rows.volume.filter((r) => r.day === tradesDay).map((r) => [keyOf(r), r]),
  );
  for (const key of new Set([...sums.keys(), ...volumes.keys()])) {
    const problem = mismatch(volumes.get(key), sums.get(key));
    if (problem) throw new Error(`On ${tradesDay}, ${key} ${problem}.`);
  }
  const fees = rows.trades
    .filter((t) => t.quote_token === zeroAddress)
    .reduce((sum, t) => sum + BigInt(t.fee_amount), 0n);
  return [
    `Volume present for all ${days.length} days`,
    `On ${tradesDay}, buy and sell sums of ${volumes.size} tokens equal the sums of ${rows.trades.length} trade rows`,
    `All ${rows.trades.length} trade fees are between zero and the quote amount (${formatBnb(fees)} in BNB-quoted trades)`,
  ];
}

export function formatBnb(raw) {
  const hundredths =
    (raw + 5n * 10n ** (decimals - 3n)) / 10n ** (decimals - 2n);
  const whole = (hundredths / 100n).toLocaleString("en-US");
  return `${whole}.${String(hundredths % 100n).padStart(2, "0")} BNB`;
}

const toBnb = (raw) => Number(raw / 10n ** (decimals - 4n)) / 1e4;
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function leaderboard(rows) {
  const totals = new Map();
  for (const row of rows.volume.filter((r) => r.quote_token === zeroAddress)) {
    const total = totals.get(row.token) ?? { buys: 0n, sells: 0n, trades: 0n };
    total.buys += BigInt(row.buy_quote_amount);
    total.sells += BigInt(row.sell_quote_amount);
    total.trades += BigInt(row.trades);
    totals.set(row.token, total);
  }
  return [...totals.entries()]
    .map(([token, t]) => ({ token, ...t, volume: t.buys + t.sells }))
    .sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0))
    .slice(0, topTokens)
    .map((t) => ({
      token: t.token,
      label: shortAddress(t.token),
      trades: t.trades.toString(),
      buys: formatBnb(t.buys),
      sells: formatBnb(t.sells),
      volume: formatBnb(t.volume),
      buyShare: `${((Number(t.buys) / Number(t.volume)) * 100).toFixed(0)}%`,
      buysBnb: toBnb(t.buys),
      sellsBnb: toBnb(t.sells),
    }));
}

export function shape(rows) {
  const native = rows.volume.filter((r) => r.quote_token === zeroAddress);
  const sum = (key) => native.reduce((s, r) => s + BigInt(r[key]), 0n);
  const buys = sum("buy_quote_amount");
  const sells = sum("sell_quote_amount");
  const fees = rows.trades
    .filter((t) => t.quote_token === zeroAddress)
    .reduce((s, t) => s + BigInt(t.fee_amount), 0n);
  const tokens = leaderboard(rows);
  return {
    portal,
    volumeWindow,
    tradesDay,
    tradesWindow,
    chartTokens,
    buys: formatBnb(buys),
    sells: formatBnb(sells),
    trades: native
      .reduce((s, r) => s + BigInt(r.trades), 0n)
      .toLocaleString("en-US"),
    fees: formatBnb(fees),
    tokenCount: new Set(native.map((r) => r.token)).size,
    tokens,
  };
}
