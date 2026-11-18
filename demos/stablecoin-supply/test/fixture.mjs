import {
  bindsAt,
  namedAddresses,
  supplyDays,
  transferDay,
  usdc,
  usdt,
  zeroAddress,
} from "../src/report.mjs";
import { blockAt } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const unnamed = `0x${"ab".repeat(20)}`;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const raw = (dollars, random) =>
  BigInt(Math.round(dollars)) * 1000000n + BigInt(Math.floor(random() * 1e6));

function transfers(random) {
  const [circle, ...holders] = namedAddresses;
  const transfers = [
    [zeroAddress, circle, 180e6],
    [zeroAddress, circle, 95e6],
    [zeroAddress, circle, 40e6],
    [circle, zeroAddress, 210e6],
    [circle, zeroAddress, 160e6],
    [circle, holders[2], 120e6],
    [circle, holders[0], 75e6],
    [holders[2], holders.at(-1), 55e6],
    [unnamed, holders[1], 48e6],
    [holders[1], unnamed, 9e6],
  ];
  while (transfers.length < 220) {
    const from = holders[Math.floor(random() ** 2 * holders.length)];
    const to = holders[Math.floor(random() ** 1.5 * holders.length)];
    if (from !== to) transfers.push([from, to, 2e4 + random() ** 4 * 4e7]);
  }
  const day = transferDay(fixtureBinds);
  return transfers.map(([from, to, dollars], index) => ({
    from,
    to,
    amount: raw(dollars, random),
    hour: `${day}T${String(index % 24).padStart(2, "0")}`,
  }));
}

function counterpartyRows(moves, wallet, by) {
  const rows = new Map();
  for (const { from, to, amount, hour } of moves) {
    if (from !== wallet && to !== wallet) continue;
    const counterparty = from === wallet ? to : from;
    const period = by === "hour" ? { hour } : { day: hour.slice(0, 10) };
    const key = `${counterparty}@${period[by]}`;
    const row = rows.get(key) ?? {
      counterparty,
      ...period,
      received: 0n,
      sent: 0n,
      token: usdc,
      transfers: 0n,
    };
    if (from === wallet) row.sent += amount;
    else row.received += amount;
    row.transfers += 1n;
    rows.set(key, row);
  }
  return [...rows.values()].map((row) => ({
    ...row,
    received: row.received.toString(),
    sent: row.sent.toString(),
    transfers: row.transfers.toString(),
  }));
}

function supplyRows(random, token, startDollars, lastChange) {
  const days = supplyDays(fixtureBinds);
  let supply = raw(startDollars, random);
  return days.map((day, index) => {
    if (index === days.length - 1) supply += lastChange;
    else if (index > 0) supply += raw((random() - 0.4) * 6e8, random);
    return { day, token, total_supply: supply.toString() };
  });
}

export function fixture() {
  const random = seeded(7);
  const moves = transfers(random);
  const net = moves.reduce(
    (sum, { from, to, amount }) =>
      sum +
      (from === zeroAddress ? amount : 0n) -
      (to === zeroAddress ? amount : 0n),
    0n,
  );
  const flowRows = Object.fromEntries(
    fixtureBinds
      .filter((bind) => bind.function_slug === "erc20.wallet_counterparties")
      .map((bind) => [
        bind.name,
        counterpartyRows(moves, bind.params.swap.wallet, bind.params.by),
      ]),
  );
  const ensRows = Object.fromEntries(
    fixtureBinds
      .filter((bind) => bind.function_slug === "ens.primary_name")
      .map((bind) => [
        bind.name,
        [
          {
            block: blockAt(bind.window.to_time) - 1,
            address: bind.params.address,
            name: bind.name === "ens-circle" ? "circle.eth" : "",
          },
        ],
      ]),
  );
  return {
    supply: [
      ...supplyRows(random, usdt, 96.4e9, raw(3.1e8, random)),
      ...supplyRows(random, usdc, 43.8e9, net),
    ],
    ...flowRows,
    ...ensRows,
  };
}

export function fixtureRows() {
  const rows = fixture();
  const nameOf = (bind) =>
    fixtureBinds.find(
      (b) =>
        b.function_slug === bind.function_slug &&
        JSON.stringify(b.params) === JSON.stringify(bind.params),
    ).name;
  const inHours = (row, window) =>
    row.hour >= window.from_time.slice(0, 13) &&
    row.hour < window.to_time.slice(0, 13);
  return (bind, window) =>
    bind.params.by === "hour"
      ? rows[nameOf(bind)].filter((row) => inHours(row, window))
      : rows[nameOf(bind)];
}
