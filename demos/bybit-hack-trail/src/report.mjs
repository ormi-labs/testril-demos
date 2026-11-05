const hourMs = 3600000;
const windowStart = "2025-02-21T00:00:00Z";
const windowEnd = "2025-03-01T00:00:00Z";
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

export const tokens = [
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
  "0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa",
  "0xe6829d9a7ee3040e1276fa75293bde931859e8fa",
];
const trail = [
  ["bybit-cold-wallet", "0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4"],
  ["exploiter", "0x47666fab8bd0ac7003bce3f5c3585383f09486e2"],
  ["hop-a4b2", "0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e"],
  ["hop-bdd0", "0xbdd077f651ebe7f7b3ce16fe5f2b025be2969516"],
  ["hop-0fa0", "0x0fa09c3a328792253f8dee7116848723b72a6d2e"],
  ["hop-1542", "0x1542368a03ad1f03d96d51b414f4a2d6d2fe0d04"],
];
export const wallets = trail.map(([, address]) => address);

// A transfer row carries a block, not a time, so transfers are read in
// segments of a day; the segment holding Lido's daily rebase hours stands alone.
const rebaseStartHour = 12;
const segmentStartHours = [0, rebaseStartHour, 14];
const hoursPerDay = 24;

export const segments = [];
for (
  let day = Date.parse(windowStart);
  day < Date.parse(windowEnd);
  day += hoursPerDay * hourMs
)
  segmentStartHours.forEach((startHour, index) => {
    const endHour = segmentStartHours[index + 1] ?? hoursPerDay;
    segments.push({
      key: `${isoSecond(day).slice(0, 10)}-${String(startHour).padStart(2, "0")}`,
      from_time: isoSecond(day + startHour * hourMs),
      to_time: isoSecond(day + endHour * hourMs),
      lastHour: new Date(day + (endHour - 1) * hourMs)
        .toISOString()
        .slice(0, 13),
      holdsRebase: startHour === rebaseStartHour,
    });
  });

const hourlyWindow = { from_time: windowStart, to_time: windowEnd };

export const binds = [
  ...trail.flatMap(([key, wallet]) =>
    segments.map((segment) => ({
      name: `transfers-${key}-${segment.key}`,
      function_slug: "erc20.wallet_transfers",
      chain_id: 1,
      params: { wallet, tokens },
      window: { from_time: segment.from_time, to_time: segment.to_time },
    })),
  ),
  ...trail.map(([key, owner]) => ({
    name: `balance-${key}`,
    function_slug: "native.balance",
    chain_id: 1,
    params: { owners: [owner], by: "hour" },
    window: hourlyWindow,
  })),
  ...trail.map(([key, owner]) => ({
    name: `token-balance-${key}`,
    function_slug: "erc20.token_balance",
    chain_id: 1,
    params: { reads: { tokens, owners: [owner] }, by: "hour" },
    window: hourlyWindow,
  })),
];

export const bindsAt = () => binds;

export const walletKeys = trail.map(([key]) => key);
export const transferBinds = binds.filter(
  (bind) => bind.function_slug === "erc20.wallet_transfers",
);
export const balanceBinds = binds.filter(
  (bind) => bind.function_slug === "native.balance",
);
export const tokenBalanceBinds = binds.filter(
  (bind) => bind.function_slug === "erc20.token_balance",
);
export const transfersOfWallet = (rows, key) =>
  segments.flatMap((segment) => rows[`transfers-${key}-${segment.key}`]);
const walletOf = (key) => trail.find(([name]) => name === key)[1];
const source = walletOf("bybit-cold-wallet");
const exploiter = walletOf("exploiter");
export const maxNodes = 10;
const minDrawnAmount = 1000n * 10n ** 18n;

const titles = {
  "bybit-cold-wallet": "Bybit cold wallet",
  exploiter: "Exploiter",
  "hop-a4b2": "Wallet 0xa4b2…449e",
  "hop-bdd0": "Wallet 0xbdd0…9516",
  "hop-0fa0": "Wallet 0x0fa0…6d2e",
  "hop-1542": "Wallet 0x1542…0d04",
};
const names = new Map(trail.map(([key, address]) => [address, titles[key]]));
const symbols = new Map([
  ["0xae7ab96520de3a18e5e111b5eaab095312d7fe84", "stETH"],
  ["0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa", "mETH"],
  ["0xe6829d9a7ee3040e1276fa75293bde931859e8fa", "cmETH"],
]);

const unit = 10n ** 18n;
export const symbolOf = (token) => symbols.get(token);
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const label = (address) => names.get(address) ?? shortAddress(address);
export const transferKey = (row) => `${row.tx}:${row.log_index}`;
const edgeKey = (from, to) => `${from}>${to}`;

export function hoursInWindow() {
  const hours = [];
  for (
    let time = Date.parse(windowStart);
    time < Date.parse(windowEnd);
    time += hourMs
  )
    hours.push(new Date(time).toISOString().slice(0, 13));
  return hours;
}

export function formatAmount(raw, signed = false) {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const whole = ((abs + unit / 2n) / unit).toLocaleString("en-US");
  return `${negative ? "−" : signed && abs > 0n ? "+" : ""}${whole}`;
}

const toChartEth = (raw) => Number(raw / 10n ** 15n) / 1000;

export function uniqueTransfers(rows) {
  const unique = new Map();
  for (const bind of transferBinds)
    for (const row of rows[bind.name])
      if (!unique.has(transferKey(row)))
        unique.set(transferKey(row), { row, seenIn: new Set() });
  for (const bind of transferBinds)
    for (const row of rows[bind.name])
      unique.get(transferKey(row)).seenIn.add(bind.params.wallet);
  return unique;
}

function hopsFrom(start, edges) {
  const hops = new Map([[start, 0]]);
  const queue = [start];
  for (const current of queue)
    for (const edge of edges)
      if (edge.from === current && !hops.has(edge.to)) {
        hops.set(edge.to, hops.get(current) + 1);
        queue.push(edge.to);
      }
  return hops;
}

function sumEdges(entries) {
  const totals = new Map();
  for (const { from, to, token, value } of entries) {
    const key = `${edgeKey(from, to)}>${token}`;
    const edge = totals.get(key) ?? { from, to, token, amount: 0n };
    edge.amount += BigInt(value);
    totals.set(key, edge);
  }
  return [...totals.values()];
}

function sparkline(rows, bind) {
  const balances = new Map(
    rows[bind.name].map((row) => [row.hour, BigInt(row.balance)]),
  );
  const series = hoursInWindow().map((hour) => ({
    hour,
    eth: toChartEth(balances.get(hour) ?? 0n),
  }));
  const peak = Math.max(...series.map((point) => point.eth));
  return {
    series,
    peak: `${peak.toLocaleString("en-US", { maximumFractionDigits: 0 })} ETH`,
  };
}

const sumValues = (entries) =>
  entries.reduce((sum, entry) => sum + BigInt(entry.value), 0n);

function walletTokens(entries, address) {
  return tokens
    .map((token) => {
      const ofToken = entries.filter((entry) => entry.token === token);
      const received = sumValues(ofToken.filter((e) => e.to === address));
      const sent = sumValues(ofToken.filter((e) => e.from === address));
      return {
        symbol: symbols.get(token),
        received,
        sent,
        formatted: {
          received: formatAmount(received),
          sent: formatAmount(sent),
          net: formatAmount(received - sent, true),
        },
      };
    })
    .filter((entry) => entry.received > 0n || entry.sent > 0n);
}

const lastDay = isoSecond(Date.parse(windowEnd) - 1).slice(0, 10);

export function shape(rows) {
  const entries = [...uniqueTransfers(rows).values()].map((e) => e.row);
  const edges = sumEdges(entries);
  const hops = hopsFrom(source, edges);
  const routes = edges.filter((edge) => edge.amount >= minDrawnAmount);
  const routeCount = (address) =>
    routes.filter((edge) => edge.to === address).length;
  const outside = [...new Set(routes.map((edge) => edge.to))]
    .filter((address) => !wallets.includes(address))
    .sort((a, b) => routeCount(b) - routeCount(a) || a.localeCompare(b))
    .slice(0, maxNodes - wallets.length);
  const shown = new Set([...wallets, ...outside]);
  const deepestHop = Math.max(
    ...wallets.map((address) => hops.get(address) ?? 0),
  );
  const nodes = [...shown]
    .filter((address) => hops.has(address))
    .map((address) => ({
      address,
      label: label(address),
      hop: wallets.includes(address) ? hops.get(address) : deepestHop + 1,
      tracked: wallets.includes(address),
    }));
  const drawn = routes.filter(
    (edge) => shown.has(edge.from) && shown.has(edge.to),
  );
  const biggest = new Map(
    tokens.map((token) => [
      token,
      Math.max(
        ...drawn
          .filter((e) => e.token === token)
          .map((e) => toChartEth(e.amount)),
      ),
    ]),
  );
  return {
    window: { first: windowStart.slice(0, 10), last: lastDay },
    headline: {
      intoExploiter: walletTokens(entries, exploiter).map((entry) => ({
        symbol: entry.symbol,
        amount: entry.formatted.received,
      })),
      reached: String(
        nodes.filter((node) => node.tracked && node.hop > 0).length,
      ),
      destinations: String(outside.length),
      transfers: String(entries.length),
    },
    tokens: tokens.map((token) => ({
      symbol: symbols.get(token),
      token,
      moved: formatAmount(
        sumValues(entries.filter((entry) => entry.token === token)),
      ),
    })),
    nodes,
    edges: drawn.map((edge) => ({
      from: edge.from,
      to: edge.to,
      symbol: symbols.get(edge.token),
      tokenIndex: tokens.indexOf(edge.token),
      amount: formatAmount(edge.amount),
      share: toChartEth(edge.amount) / biggest.get(edge.token),
    })),
    hiddenEdges: edges.length - drawn.length,
    wallets: trail.map(([, address], index) => {
      return {
        address,
        label: label(address),
        hop: hops.get(address) ?? null,
        tokens: walletTokens(entries, address).map((entry) => ({
          symbol: entry.symbol,
          ...entry.formatted,
        })),
        spark: sparkline(rows, balanceBinds[index]),
      };
    }),
  };
}
