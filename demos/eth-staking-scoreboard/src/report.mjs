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
      name: "lido",
      function_slug: "lido.pooled_ether",
      chain_id: 1,
      params: {
        steth: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
        vault_hub: "0x1d201be093d847f6446530efb0e8fb426d176709",
        vault_hub_from_block: 24000000,
        by: "day",
      },
      window: untilToday(91 * dayMs),
    },
    {
      name: "wbeth",
      function_slug: "wbeth.staked_ether",
      chain_id: 1,
      params: {
        wbeth: "0xa2e3356610840701bdf5611a53974510ae27e2e1",
        by: "day",
      },
      window: untilToday(91 * dayMs),
    },
    {
      name: "stmatic",
      function_slug: "lido.pooled_matic",
      chain_id: 1,
      params: {
        st_matic: "0x9ee91f9f426fa633d227f7a9b000e28b9dfd8599",
        by: "day",
      },
      window: untilToday(91 * dayMs),
    },
    {
      name: "eigenlayer",
      function_slug: "eigenlayer.strategy_underlying",
      chain_id: 1,
      params: {
        strategy_list: {
          strategy_manager: "0x858646372cc42e1a627fce94aa7a7033e7cf075a",
        },
        by: "day",
      },
      window: untilToday(91 * dayMs),
    },
  ];
}

const weiPerEther = 10n ** 18n;
const rawAmount = /^[0-9]+$/;
const minimumWholeUnits = 1000n * weiPerEther;

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + dayMs).toISOString().slice(0, 10);

const utcDay = (time) => time.slice(0, 10);

export function windowDaysOf(binds) {
  const { window } = binds.find((bind) => bind.name === "lido");
  const days = [];
  for (
    let d = utcDay(window.from_time);
    d < utcDay(window.to_time);
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
    if (!record.has(row.day))
      throw new Error(`${name} has a row for ${row.day}, outside the window.`);
    add(record.get(row.day), row);
  }
  const missing = [...record.keys()].filter((day) => !record.get(day)[name]);
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

function parse(rows, binds) {
  const record = new Map(windowDaysOf(binds).map((day) => [day, {}]));
  onePerDay(rows, "lido", ["pooled_ether", "vault_ether"], record);
  onePerDay(rows, "wbeth", ["exchange_rate", "staked_ether"], record);
  onePerDay(rows, "stmatic", ["pooled_matic"], record);
  strategiesPerDay(rows, record);
  return record;
}

const lidoTotalOf = ({ lido }) => lido.pooled_ether + lido.vault_ether;

function requireWeiScale(record, name, field) {
  for (const day of record.keys()) {
    const amount = record.get(day)[name][field];
    if (amount < minimumWholeUnits)
      throw new Error(
        `On ${day} ${name} ${field} is ${amount} wei, under 1,000 whole units: the amount is not in wei.`,
      );
  }
}

export function check({ rows }, binds) {
  const record = parse(rows, binds);
  const windowDays = [...record.keys()];
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
  const windowDays = [...record.keys()];
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
  const windowDays = [...record.keys()];
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

export function shape({ rows }, binds) {
  const record = parse(rows, binds);
  const windowDays = [...record.keys()];
  const latest = record.get(windowDays.at(-1));
  return {
    window: { first: windowDays[0], last: windowDays.at(-1) },
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
