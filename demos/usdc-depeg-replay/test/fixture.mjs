import {
  binds,
  feed,
  hourBlocks,
  hours,
  mintsAndBurns,
  usdc,
  zeroAddress,
} from "../src/report.mjs";

const circle = "0x55fe002aeff02f77364de339a1292923a15844b8";
const minters = Array.from(
  { length: 6 },
  (_, i) => `0x${String(i + 1).repeat(40)}`,
);
const holders = Array.from(
  { length: 16 },
  (_, i) => `0x${(i + 10).toString(16).padStart(2, "0").repeat(20)}`,
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

function edgeRows(random) {
  const pickMinter = () => minters[Math.floor(random() ** 2 * minters.length)];
  const edges = [];
  const add = (hour, slot, from, to, dollars) =>
    edges.push({
      block: hourBlocks(hour).from + 40 + slot * 37,
      from,
      to,
      amount: raw(dollars, random).toString(),
      count: String(1 + Math.floor(random() * 4)),
    });
  hours.forEach((_, hour) => {
    const depth = (1 - dollarPrice(hour)) / 0.12;
    add(hour, 0, pickMinter(), zeroAddress, 2e6 + depth * 6e8 * random());
    if (depth > 0.4)
      add(hour, 1, pickMinter(), zeroAddress, depth * 3e8 * random());
    if (hour >= mintStart)
      add(hour, 2, zeroAddress, circle, 4e7 + ((hour - mintStart) / 60) * 3e8);
    if (hour % 3 === 0)
      add(
        hour,
        3,
        holders[hour % 8],
        holders[8 + (hour % 8)],
        1e6 + random() * 5e7,
      );
  });
  return edges;
}

function supplyRows(edges, random) {
  let supply = raw(Number(startingSupply), random);
  const netByHour = mintsAndBurns(edges).map(
    ({ minted, burned }) => minted - burned,
  );
  return hours.map((hour, index) => {
    if (index > 0) supply += netByHour[index];
    return { hour, token: usdc, total_supply: supply.toString() };
  });
}

export function fixture() {
  const random = seeded(7);
  const edges = edgeRows(random);
  return {
    supply: supplyRows(edges, random),
    "usdc-edges": edges,
    "usdc-usd-feed": feedRows(random),
  };
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
