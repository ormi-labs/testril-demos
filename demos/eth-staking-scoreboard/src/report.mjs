import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const scoreboardWindow = binds.lido.window;
const weiPerEther = 10n ** 18n;
const rawAmount = /^[0-9]+$/;
const minimumPooledEther = 1000n * weiPerEther;

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export function windowDays() {
  const days = [];
  for (
    let d = scoreboardWindow.from_day;
    d < scoreboardWindow.to_day;
    d = nextDay(d)
  )
    days.push(d);
  return days;
}

function raw(value, where) {
  if (!rawAmount.test(String(value)))
    throw new Error(`${where} is "${value}", not a raw integer amount.`);
  return BigInt(value);
}

function requireWindowDay(row, name) {
  if (!windowDays().includes(row.day))
    throw new Error(`${name} has a row for ${row.day}, outside the window.`);
}

function requireEveryDay(series, name) {
  const missing = windowDays().filter((day) => !series.has(day));
  if (missing.length)
    throw new Error(`${name} is missing ${missing.join(", ")}.`);
}

function byDay(rows, name, field) {
  const days = new Map();
  for (const row of rows[name]) {
    requireWindowDay(row, name);
    if (days.has(row.day))
      throw new Error(`${name} has more than one row for ${row.day}.`);
    days.set(row.day, raw(row[field], `${name} ${field} on ${row.day}`));
  }
  requireEveryDay(days, name);
  return days;
}

function eigenlayerByDay(rows) {
  const days = new Map();
  const seen = new Set();
  for (const row of rows.eigenlayer) {
    requireWindowDay(row, "eigenlayer");
    const key = `${row.day} ${row.strategy}`;
    if (seen.has(key))
      throw new Error(
        `eigenlayer has more than one row for strategy ${row.strategy} on ${row.day}.`,
      );
    seen.add(key);
    const amount = raw(row.underlying_amount, `eigenlayer on ${row.day}`);
    days.set(row.day, (days.get(row.day) ?? 0n) + amount);
  }
  requireEveryDay(days, "eigenlayer");
  return days;
}

export function check(rows) {
  const lido = byDay(rows, "lido", "pooled_ether");
  const vaults = byDay(rows, "lido", "vault_ether");
  const wbethRate = byDay(rows, "wbeth", "exchange_rate");
  byDay(rows, "wbeth", "staked_ether");
  byDay(rows, "stmatic", "pooled_matic");
  eigenlayerByDay(rows);
  const days = windowDays();
  for (const day of days) {
    if (lido.get(day) < minimumPooledEther)
      throw new Error(
        `On ${day} Lido's pooled ether is ${lido.get(day)} wei, under 1,000 ETH: the amount is not in wei.`,
      );
    if (lido.get(day) <= vaults.get(day))
      throw new Error(
        `On ${day} stVault ether ${vaults.get(day)} wei is not below Lido's pooled ether ${lido.get(day)} wei.`,
      );
    if (wbethRate.get(day) < weiPerEther)
      throw new Error(`wBETH is worth less than 1 ETH on ${day}.`);
  }
  const rateFell = days.find(
    (day, i) => i > 0 && wbethRate.get(day) < wbethRate.get(days[i - 1]),
  );
  if (rateFell) throw new Error(`The wBETH exchange rate fell on ${rateFell}.`);
  return [
    `All four series cover every one of the ${days.length} days, with raw non-negative amounts`,
    `Pooled ether is at least 1,000 ETH in wei and above stVault ether on every day`,
    `The wBETH exchange rate never falls and stays at or above 1 ETH`,
  ];
}

export function lidoTotals(rows) {
  const pooled = byDay(rows, "lido", "pooled_ether");
  const vaults = byDay(rows, "lido", "vault_ether");
  return new Map(
    windowDays().map((day) => [day, pooled.get(day) + vaults.get(day)]),
  );
}

function compact(value, unit, signed = false) {
  const whole = Number(value / weiPerEther);
  const sign = whole < 0 ? "−" : signed ? "+" : "";
  const abs = Math.abs(whole);
  const [scale, suffix] =
    abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${sign}${(abs / scale).toFixed(suffix ? 2 : 0)}${suffix} ${unit}`;
}

function percent(change, base) {
  const sign = change < 0n ? "−" : "+";
  const absoluteChange = change < 0n ? -change : change;
  const basisPoints = Number((absoluteChange * 10000n) / base);
  return `${sign}${(basisPoints / 100).toFixed(1)}%`;
}

function venue(symbol, fn, unit, series) {
  const days = windowDays();
  const first = series.get(days[0]);
  const last = series.get(days.at(-1));
  return {
    symbol,
    function: fn,
    first: compact(first, unit),
    latest: compact(last, unit),
    change: `${compact(last - first, unit, true)} (${percent(last - first, first)})`,
    series: days.map((day) => ({
      day,
      amount: Number(series.get(day) / 10n ** 15n) / 1000,
    })),
  };
}

export function shape(rows) {
  const pooled = byDay(rows, "lido", "pooled_ether");
  const vaults = byDay(rows, "lido", "vault_ether");
  const venues = [
    venue("stETH", "lido.pooled_ether", "ETH", pooled),
    venue("stVaults", "lido.pooled_ether", "ETH", vaults),
    venue(
      "wBETH",
      "wbeth.staked_ether",
      "ETH",
      byDay(rows, "wbeth", "staked_ether"),
    ),
  ];
  const eigenlayer = venue(
    "EigenLayer",
    "eigenlayer.strategy_underlying",
    "tokens",
    eigenlayerByDay(rows),
  );
  const lido = lidoTotals(rows);
  const days = windowDays();
  const stmatic = venue(
    "stMATIC",
    "lido.pooled_matic",
    "MATIC",
    byDay(rows, "stmatic", "pooled_matic"),
  );
  return {
    window: scoreboardWindow,
    latestDay: days.at(-1),
    lidoTotal: compact(lido.get(days.at(-1)), "ETH"),
    venues,
    eigenlayer,
    stmatic,
  };
}
