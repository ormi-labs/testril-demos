export const binds = [
  {
    name: "aqua-ethereum",
    function_slug: "aqua.push_volume",
    chain_id: 1,
    params: {
      swap: { registry: "0x499943e74fb0ce105688beee8ef2abec5d936d31" },
      by: "day",
    },
    window: { from_day: "2026-10-25", to_day: "2026-11-02" },
  },
  {
    name: "aqua-base",
    function_slug: "aqua.push_volume",
    chain_id: 8453,
    params: {
      swap: { registry: "0x499943e74fb0ce105688beee8ef2abec5d936d31" },
      by: "day",
    },
    window: { from_day: "2026-10-25", to_day: "2026-11-02" },
  },
  {
    name: "tessera-base",
    function_slug: "tessera_v.token_volume",
    chain_id: 8453,
    params: {
      swap: { swap_address: "0x55555522005bcae1c2424d474bfd5ed477749e3e" },
      by: "day",
    },
    window: { from_day: "2026-10-25", to_day: "2026-11-02" },
  },
];

const fieldsBySlug = {
  "aqua.push_volume": {
    token: "token",
    count: "pushes",
    amount: "amount",
    unit: "pushes",
  },
  "tessera_v.token_volume": {
    token: "token_in",
    count: "trades",
    amount: "amount_in",
    unit: "trades",
  },
};
const venueNames = {
  "aqua-ethereum": "1inch Aqua · Ethereum",
  "aqua-base": "1inch Aqua · Base",
  "tessera-base": "Tessera · Base",
};
const tokens = {
  1: {
    "0xdac17f958d2ee523a2206206994597c13d831ec7": ["USDT", 6],
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["USDC", 6],
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": ["WETH", 18],
    "0x111111111117dc0aa78b770fa6a738034120c302": ["1INCH", 18],
  },
  8453: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": ["USDC", 6],
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": ["cbBTC", 8],
    "0x4200000000000000000000000000000000000006": ["WETH", 18],
  },
};
export const venues = binds.map((bind) => ({
  ...bind,
  title: venueNames[bind.name],
  fields: fieldsBySlug[bind.function_slug],
}));
export const reportWindow = binds[0].window;
const integer = /^[0-9]+$/;

const nextDay = (day) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);

export function windowDays({ from_day, to_day }) {
  const days = [];
  for (let day = from_day; day < to_day; day = nextDay(day)) days.push(day);
  return days;
}

function cells(venue, rows) {
  const { token, count, amount } = venue.fields;
  return rows.map((row) => ({
    day: row.day,
    token: row[token].toLowerCase(),
    count: row[count],
    amount: row[amount],
  }));
}

function checkVenue(venue, rows) {
  const days = windowDays(venue.window);
  const seen = new Set();
  for (const cell of cells(venue, rows)) {
    const where = `${venue.title}, ${cell.token} on ${cell.day}`;
    if (!days.includes(cell.day))
      throw new Error(`${where} is outside the window.`);
    if (!integer.test(cell.count) || !integer.test(cell.amount))
      throw new Error(
        `${where} has a negative or non-integer count or amount.`,
      );
    if (BigInt(cell.count) < 1n || BigInt(cell.amount) < 1n)
      throw new Error(
        `${where} has a zero count or amount; no row should exist.`,
      );
    const key = `${cell.token}/${cell.day}`;
    if (seen.has(key)) throw new Error(`${where} appears twice.`);
    seen.add(key);
  }
  return `${venue.title}: ${seen.size} token-days in ${days.length} days, every row has a positive count and amount, no day counted twice`;
}

export function check(rows) {
  return venues.map((venue) => checkVenue(venue, rows[venue.name]));
}

export function formatAmount(raw, decimals) {
  const hundredths = (BigInt(raw) * 100n) / 10n ** BigInt(decimals);
  const whole = (hundredths / 100n).toLocaleString("en-US");
  return `${whole}.${String(hundredths % 100n).padStart(2, "0")}`;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function tokenSummary(venue, rows, address, days) {
  const [symbol, decimals] = tokens[venue.chain_id][address] ?? [
    shortAddress(address),
    0,
  ];
  const mine = cells(venue, rows).filter((cell) => cell.token === address);
  const byDay = new Map(mine.map((cell) => [cell.day, cell]));
  const total = mine.reduce((sum, cell) => sum + BigInt(cell.amount), 0n);
  const count = mine.reduce((sum, cell) => sum + BigInt(cell.count), 0n);
  return {
    symbol,
    address,
    total: formatAmount(total, decimals),
    count: count.toString(),
    bars: days.map((day) => {
      const cell = byDay.get(day);
      const raw = cell ? BigInt(cell.amount) : 0n;
      return {
        day,
        label: formatAmount(raw, decimals),
        value: Number(raw) / 10 ** decimals,
        count: cell?.count ?? "0",
      };
    }),
  };
}

export function shape(rows) {
  return {
    window: reportWindow,
    venues: venues.map((venue) => {
      const venueRows = rows[venue.name];
      const days = windowDays(venue.window);
      const addresses = [
        ...new Set(cells(venue, venueRows).map((cell) => cell.token)),
      ];
      const summaries = addresses.map((address) =>
        tokenSummary(venue, venueRows, address, days),
      );
      return {
        name: venue.name,
        title: venue.title,
        chainId: venue.chain_id,
        functionSlug: venue.function_slug,
        unit: venue.fields.unit,
        count: summaries
          .reduce((sum, token) => sum + BigInt(token.count), 0n)
          .toString(),
        tokens: summaries,
      };
    }),
  };
}
