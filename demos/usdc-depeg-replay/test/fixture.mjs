import { binds, feed, hours, mintsAndBurns, usdc } from "../src/report.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = binds;

const circle = "0x55fe002aeff02f77364de339a1292923a15844b8";
const minters = Array.from(
  { length: 6 },
  (_, i) => `0x${String(i + 1).repeat(40)}`,
);
const startingSupply = 43900000000n;
const dipStart = 36;
const dipBottom = 58;
const recovered = 84;
const mintStart = 60;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const raw = (dollars, random) =>
  BigInt(Math.round(dollars)) * 1000000n + BigInt(Math.floor(random() * 1e6));

function dollarPrice(hour) {
  if (hour < dipStart) return 1;
  if (hour < dipBottom)
    return 1 - (0.12 * (hour - dipStart)) / (dipBottom - dipStart);
  if (hour < recovered)
    return 0.88 + (0.119 * (hour - dipBottom)) / (recovered - dipBottom);
  return 0.999;
}

function feedRows(random) {
  return hours.map((hour, index) => {
    const noise = (random() - 0.5) * 0.0008;
    return {
      hour,
      feed,
      answer: BigInt(Math.round((dollarPrice(index) + noise) * 1e8)).toString(),
    };
  });
}

function mintBurnRows(random) {
  const pickMinter = () => minters[Math.floor(random() ** 2 * minters.length)];
  const rows = new Map();
  const move = (hour, counterparty, side, dollars) => {
    const key = `${hour}:${counterparty}`;
    const row = rows.get(key) ?? {
      counterparty,
      hour: hours[hour],
      received: 0n,
      sent: 0n,
      token: usdc,
      transfers: 0n,
    };
    row[side] += raw(dollars, random);
    row.transfers += 1n;
    rows.set(key, row);
  };
  hours.forEach((_, hour) => {
    const depth = (1 - dollarPrice(hour)) / 0.12;
    move(hour, pickMinter(), "received", 2e6 + depth * 6e8 * random());
    if (depth > 0.4)
      move(hour, pickMinter(), "received", depth * 3e8 * random());
    if (hour >= mintStart)
      move(hour, circle, "sent", 4e7 + ((hour - mintStart) / 60) * 3e8);
  });
  return [...rows.values()].map((row) => ({
    ...row,
    received: row.received.toString(),
    sent: row.sent.toString(),
    transfers: row.transfers.toString(),
  }));
}

function supplyRows(fetched, random) {
  let supply = raw(Number(startingSupply), random);
  const netByHour = mintsAndBurns(fetched).map(
    ({ minted, burned }) => minted - burned,
  );
  return hours.map((hour, index) => {
    if (index > 0) supply += netByHour[index];
    return { hour, token: usdc, total_supply: supply.toString() };
  });
}

export function fixture() {
  const random = seeded(7);
  const mintsBurns = mintBurnRows(random);
  return {
    supply: supplyRows(
      fixtureFetched({ "usdc-mints-burns": mintsBurns }),
      random,
    ),
    "usdc-mints-burns": mintsBurns,
    "usdc-usd-feed": feedRows(random),
  };
}

export const fixtureFetched = (rows = fixture()) => ({ rows, reads: {} });

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
  return (bound) =>
    rows[
      binds.find(
        (candidate) =>
          candidate.function_slug === bound.function_slug &&
          candidate.chain_id === bound.chain_id &&
          sameParams(candidate.params, bound.params),
      ).name
    ];
}
