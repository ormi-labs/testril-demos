import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const scoreboardWindow = binds.lido.window;
const weiPerEther = 10n ** 18n;
const rawAmount = /^[0-9]+$/;
const minimumWholeUnits = 1000n * weiPerEther;

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export const windowDays = listWindowDays();
const windowDaySet = new Set(windowDays);

function listWindowDays() {
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

function rowsOfDay(rows, name, record, add) {
  for (const row of rows[name]) {
    if (!windowDaySet.has(row.day))
      throw new Error(`${name} has a row for ${row.day}, outside the window.`);
    add(record.get(row.day), row);
  }
  const missing = windowDays.filter((day) => !record.get(day)[name]);
  if (missing.length)
    throw new Error(`${name} is missing ${missing.join(", ")}.`);
}

function onePerDay(rows, name, fields, record) {
  rowsOfDay(rows, name, record, (entry, row) => {
    if (entry[name])
      throw new Error(`${name} has more than one row for ${row.day}.`);
    entry[name] = Object.fromEntries(
      fields.map((field) => [
        field,
        raw(row[field], `${name} ${field} on ${row.day}`),
      ]),
    );
  });
}

function strategiesPerDay(rows, record) {
  rowsOfDay(rows, "eigenlayer", record, (entry, row) => {
    raw(row.underlying_amount, `eigenlayer on ${row.day}`);
    entry.eigenlayer ??= new Set();
    if (entry.eigenlayer.has(row.strategy))
      throw new Error(
        `eigenlayer has more than one row for strategy ${row.strategy} on ${row.day}.`,
      );
    entry.eigenlayer.add(row.strategy);
  });
}

function parse(rows) {
  const record = new Map(windowDays.map((day) => [day, {}]));
  onePerDay(rows, "lido", ["pooled_ether", "vault_ether"], record);
  onePerDay(rows, "wbeth", ["exchange_rate", "staked_ether"], record);
  onePerDay(rows, "stmatic", ["pooled_matic"], record);
  strategiesPerDay(rows, record);
  return record;
}

const lidoTotalOf = ({ lido }) => lido.pooled_ether + lido.vault_ether;

function requireWeiScale(record, name, field) {
  for (const day of windowDays) {
    const amount = record.get(day)[name][field];
    if (amount < minimumWholeUnits)
      throw new Error(
        `On ${day} ${name} ${field} is ${amount} wei, under 1,000 whole units: the amount is not in wei.`,
      );
  }
}

export function check(rows) {
  const record = parse(rows);
  requireWeiScale(record, "lido", "pooled_ether");
  requireWeiScale(record, "wbeth", "staked_ether");
  requireWeiScale(record, "stmatic", "pooled_matic");
  for (const [i, day] of windowDays.entries()) {
    const { lido, wbeth } = record.get(day);
    if (lido.pooled_ether <= lido.vault_ether)
      throw new Error(
        `On ${day} stVault ether ${lido.vault_ether} wei is not below Lido's pooled ether ${lido.pooled_ether} wei.`,
      );
    if (wbeth.exchange_rate < weiPerEther)
      throw new Error(`wBETH is worth less than 1 ETH on ${day}.`);
    if (
      i > 0 &&
      wbeth.exchange_rate < record.get(windowDays[i - 1]).wbeth.exchange_rate
    )
      throw new Error(`The wBETH exchange rate fell on ${day}.`);
  }
  const latest = record.get(windowDays.at(-1));
  return [
    `All four series cover every one of the ${windowDays.length} days, with raw non-negative amounts`,
    `Pooled ether, wBETH staked ether and stMATIC are each at least 1,000 whole units in wei`,
    `stVault ether is below pooled ether on every day, and the wBETH exchange rate stays at or above 1 ETH and never falls (heuristics: a slashing could trip them)`,
    `Lido total ${compact(lidoTotalOf(latest), "ETH")} on ${windowDays.at(-1)} = pooled ${compact(latest.lido.pooled_ether, "ETH")} + stVaults ${compact(latest.lido.vault_ether, "ETH")}`,
  ];
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

function venue(symbol, fn, unit, record, amountOf) {
  const amounts = windowDays.map((day) => amountOf(record.get(day)));
  const first = amounts[0];
  const last = amounts.at(-1);
  return {
    symbol,
    function: fn,
    first: compact(first, unit),
    latest: compact(last, unit),
    change: `${compact(last - first, unit, true)} (${percent(last - first, first)})`,
    series: windowDays.map((day, i) => ({
      day,
      amount: Number(amounts[i] / 10n ** 15n) / 1000,
    })),
  };
}

function strategyCount(record) {
  const count = (day) => record.get(day).eigenlayer.size;
  const first = count(windowDays[0]);
  const last = count(windowDays.at(-1));
  const change = last - first;
  return {
    symbol: "EigenLayer",
    function: "eigenlayer.strategy_underlying",
    first: `${first} strategies`,
    latest: `${last} strategies`,
    change: `${change < 0 ? "−" : "+"}${Math.abs(change)} strategies`,
  };
}

export function shape(rows) {
  const record = parse(rows);
  const latest = record.get(windowDays.at(-1));
  return {
    window: scoreboardWindow,
    latestDay: windowDays.at(-1),
    lidoTotal: compact(lidoTotalOf(latest), "ETH"),
    venues: [
      venue(
        "stETH",
        "lido.pooled_ether",
        "ETH",
        record,
        (r) => r.lido.pooled_ether,
      ),
      venue(
        "stVaults",
        "lido.pooled_ether",
        "ETH",
        record,
        (r) => r.lido.vault_ether,
      ),
      venue(
        "wBETH",
        "wbeth.staked_ether",
        "ETH",
        record,
        (r) => r.wbeth.staked_ether,
      ),
      venue(
        "stMATIC",
        "lido.pooled_matic",
        "MATIC",
        record,
        (r) => r.stmatic.pooled_matic,
      ),
    ],
    eigenlayer: strategyCount(record),
  };
}
