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
      name: "volume",
      function_slug: "flap.token_volume",
      chain_id: 56,
      params: {
        swap: { portal },
        by: "day",
      },
      window: untilToday(8 * dayMs),
    },
    {
      name: "trades",
      function_slug: "flap.trade",
      chain_id: 56,
      params: { portal },
      window: untilToday(dayMs),
      read: { chunk_hours: 2 },
    },
  ];
}

export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const portal = "0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0";
const decimals = 18n;
const topTokens = 20;
const chartTokens = 10;

const nextDay = (day, step) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + step * dayMs)
    .toISOString()
    .slice(0, 10);

const utcDay = (time) => time.slice(0, 10);
const windowOf = (binds, name) =>
  binds.find((bind) => bind.name === name).window;

export function volumeDays(binds) {
  const { from_time, to_time } = windowOf(binds, "volume");
  const dayCount = (Date.parse(to_time) - Date.parse(from_time)) / dayMs;
  return Array.from({ length: dayCount }, (_, i) =>
    nextDay(utcDay(from_time), i),
  );
}

export const tradesDayOf = (binds) =>
  utcDay(windowOf(binds, "trades").from_time);

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

export function check({ rows, reads }, binds) {
  const days = volumeDays(binds);
  const tradesDay = tradesDayOf(binds);
  const missing = days.filter((day) => !rows.volume.some((r) => r.day === day));
  if (missing.length)
    throw new Error(`Volume is missing ${missing.join(", ")}.`);
  const strayDay = rows.volume.find((r) => !days.includes(r.day));
  if (strayDay)
    throw new Error(`Volume row for ${strayDay.day} is outside the window.`);
  const outside = rows.trades.find(
    (t) =>
      !reads.trades.some(
        (read) => t.block >= read.from_block && t.block < read.to_block,
      ),
  );
  if (outside)
    throw new Error(`Trade at block ${outside.block} is outside the window.`);
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

export function shape({ rows }, binds) {
  const days = volumeDays(binds);
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
    volumeDays: { first: days[0], last: days.at(-1) },
    tradesDay: tradesDayOf(binds),
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
