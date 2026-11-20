import { readParts } from "../src/fetch.mjs";
import { bindsAt, exchanges, zeroWord } from "../src/report.mjs";
import { blockAt as chainBlockAt, resolveWindow } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const day = "2026-11-01";
const payoutsWindow = fixtureBinds.find(
  (bind) => bind.name === "payouts",
).window;
const payoutFromBlock = chainBlockAt(payoutsWindow.from_time);
const [ctfExchange, negRiskExchange, v2Exchange] = exchanges;

const code = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const builderRow = (builder, exchange, dollars, fills) => ({
  builder,
  collateral_amount: String(dollars * 1000000 + 123456),
  collateral_fee: String(dollars * 5000),
  day,
  exchange,
  fills: String(fills),
});

function builderRows() {
  const coded = Array.from({ length: 11 }, (_, i) =>
    builderRow(code(0xb0 + i), v2Exchange, 780000 - i * 61000, 4000 - i * 300),
  );
  return [
    builderRow(zeroWord, v2Exchange, 16515576, 474696),
    builderRow(zeroWord, ctfExchange, 2400, 31),
    builderRow(zeroWord, negRiskExchange, 900, 12),
    ...coded,
  ];
}

function payoutRows() {
  const resolutions = [
    [1n, 0n],
    [0n, 1n],
    [1n, 0n],
    [1n, 1n],
  ];
  return resolutions.flatMap((numerators, index) => {
    const block = payoutFromBlock + 900 + index * 1500;
    const conditionId = code(0xc0 + index);
    return numerators.map((numerator, outcome) => ({
      block,
      condition_id: conditionId,
      outcome_index: String(outcome),
      payout_numerator: numerator.toString(),
      payout_denominator: numerators.reduce((a, b) => a + b, 0n).toString(),
    }));
  });
}

export function fixture() {
  return { builders: builderRows(), payouts: payoutRows() };
}

const inBlocks = (rows, window) => {
  const { from_block, to_block } = resolveWindow(window);
  return rows.filter((row) => row.block >= from_block && row.block < to_block);
};
const inDays = (rows, window) =>
  rows.filter(
    (row) =>
      row.day >= window.from_time.slice(0, 10) &&
      row.day < window.to_time.slice(0, 10),
  );
const within = (name) => (name === "builders" ? inDays : inBlocks);

export function fixtureFetched(rows = fixture()) {
  const reads = Object.fromEntries(
    fixtureBinds.map((bind) => [
      bind.name,
      readParts(bind.window, bind.read).map((part) => ({
        ...part,
        ...resolveWindow(part),
        count: within(bind.name)(rows[bind.name], part).length,
      })),
    ]),
  );
  return { rows, reads };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
  return (bound, window) => {
    const bind = fixtureBinds.find(
      (candidate) =>
        candidate.function_slug === bound.function_slug &&
        candidate.chain_id === bound.chain_id &&
        sameParams(candidate.params, bound.params) &&
        candidate.window.from_time <= window.from_time &&
        candidate.window.to_time >= window.to_time,
    );
    return within(bind.name)(rows[bind.name], window);
  };
}
