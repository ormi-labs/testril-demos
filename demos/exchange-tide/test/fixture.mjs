import { binds, exchanges, hours, usdc, usdt } from "../src/report.mjs";

const walkDollars = 5e6;
const walkEth = 200;

const startingBalances = {
  binance: [
    [1.2e9, 0.9e9, 60000],
    [0.6e9, 0.5e9, 35000],
  ],
  coinbase: [
    [0.4e9, 0.9e9, 40000],
    [0.2e9, 0.3e9, 15000],
  ],
  kraken: [
    [0.4e9, 0.3e9, 25000],
    [0.25e9, 0.2e9, 9000],
  ],
  okx: [[0.5e9, 0.4e9, 30000]],
  bitfinex: [[0.2e9, 0.25e9, 12000]],
  gemini: [[0.15e9, 0.2e9, 6000]],
};

// Each event's exchange has no stablecoin noise in that hour, so the hour's change equals the event exactly.
const events = [
  { exchange: "binance", hour: 100, owner: 0, token: usdt, dollars: 300e6 },
  { exchange: "coinbase", hour: 60, owner: 0, token: usdc, dollars: -250e6 },
  { exchange: "kraken", hour: 140, owner: 1, token: usdc, dollars: 120e6 },
  { exchange: "okx", hour: 30, owner: 0, token: usdt, dollars: -90e6 },
];

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const raw = (units, scale, random) =>
  BigInt(Math.round(units)) * scale + BigInt(Math.floor(random() * 1e6));
const dollars = (amount, random) => raw(amount, 1000000n, random);
const ether = (amount, random) => raw(amount, 10n ** 18n, random);

function walk(start, step, count, quietHours, toRaw, random) {
  let balance = toRaw(start, random);
  const values = [balance];
  for (let hour = 1; hour < count; hour++) {
    const noise = quietHours.has(hour) ? 0 : (random() - 0.5) * 2 * step;
    balance += toRaw(noise, random);
    values.push(balance);
  }
  return values;
}

function ownerSeries(exchange, ownerIndex, random) {
  const [usdtStart, usdcStart, ethStart] =
    startingBalances[exchange.id][ownerIndex];
  const count = hours().length;
  const quiet = new Set(
    events.filter((e) => e.exchange === exchange.id).map((e) => e.hour),
  );
  const stable = (token, start) => {
    const values = walk(start, walkDollars, count, quiet, dollars, random);
    for (const event of events)
      if (
        event.exchange === exchange.id &&
        event.owner === ownerIndex &&
        event.token === token
      )
        for (let hour = event.hour; hour < count; hour++)
          values[hour] += BigInt(event.dollars) * 1000000n;
    return values;
  };
  return {
    [usdt]: stable(usdt, usdtStart),
    [usdc]: stable(usdc, usdcStart),
    eth: walk(ethStart, walkEth, count, new Set(), ether, random),
  };
}

const tokenRows = (series) =>
  hours().flatMap((hour, i) =>
    [usdt, usdc].map((token) => ({
      hour,
      token,
      balance: series(token, i).toString(),
    })),
  );

export function fixture() {
  const random = seeded(7);
  const rows = {};
  for (const exchange of exchanges) {
    const owners = exchange.owners.map((_, i) =>
      ownerSeries(exchange, i, random),
    );
    rows[`${exchange.id}-total`] = tokenRows((token, i) =>
      owners.reduce((sum, owner) => sum + owner[token][i], 0n),
    );
    exchange.ownerBinds.forEach((name, i) => {
      rows[name] = tokenRows((token, hour) => owners[i][token][hour]);
    });
    rows[`${exchange.id}-native`] = exchange.owners.flatMap((owner, i) =>
      hours().map((hour, h) => ({
        hour,
        owner,
        balance: owners[i].eth[h].toString(),
      })),
    );
  }
  return rows;
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const covers = (outer, inner) =>
  Object.keys(inner).every((key) =>
    key.startsWith("from_")
      ? inner[key] >= outer[key]
      : inner[key] <= outer[key],
  );

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = binds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        covers(candidate.window, window),
    );
    return "from_block" in window && bind.read
      ? rows[bind.name].filter(
          (row) =>
            row.block >= window.from_block && row.block < window.to_block,
        )
      : rows[bind.name];
  };
}
