import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const scoreboardWindow = binds.lido.window;
const weiPerEther = 10n ** 18n;
const rawAmount = /^[0-9]+$/;

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

function byDay(rows, name, field) {
  const days = new Map();
  for (const row of rows[name]) {
    const value = raw(row[field], `${name} ${field} on ${row.day}`);
    days.set(row.day, (days.get(row.day) ?? 0n) + value);
  }
  return days;
}

function requireEveryDay(series, name) {
  const missing = windowDays().filter((day) => !series.has(day));
  if (missing.length)
    throw new Error(`${name} is missing ${missing.join(", ")}.`);
}

export function check(rows) {
  const lido = byDay(rows, "lido", "pooled_ether");
  const vaults = byDay(rows, "lido", "vault_ether");
  const wbethRate = byDay(rows, "wbeth", "exchange_rate");
  const wbeth = byDay(rows, "wbeth", "staked_ether");
  const stmatic = byDay(rows, "stmatic", "pooled_matic");
  const eigenlayer = byDay(rows, "eigenlayer", "underlying_amount");
  const series = { lido, wbeth, stmatic, eigenlayer };
  for (const [name, values] of Object.entries(series))
    requireEveryDay(values, name);
  const days = windowDays();
  for (const day of days) {
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
    `stVault ether stays below pooled ether, so Lido's total (pooled plus stVault ether) is well formed on every day`,
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

const percent = (change, base) =>
  `${change < 0n ? "−" : "+"}${(Number(((change < 0n ? -change : change) * 10000n) / base) / 100).toFixed(1)}%`;

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
    venue(
      "EigenLayer",
      "eigenlayer.strategy_underlying",
      "tokens",
      byDay(rows, "eigenlayer", "underlying_amount"),
    ),
  ];
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
    stmatic,
  };
}
