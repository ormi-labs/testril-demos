import {
  binds,
  poolsWindow,
  usdc,
  usdt,
  volumeDays,
  zeroAddress,
} from "../src/report.mjs";

const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const wbtc = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const dai = "0x6b175474e89094c44da98b954eedeac495271d0f";
const pairs = [
  [zeroAddress, usdc],
  [weth, usdc],
  [usdc, usdt],
  [zeroAddress, usdt],
  [wbtc, usdc],
  [weth, wbtc],
  [dai, usdc],
  [zeroAddress, dai],
];
const poolCount = 90;
const activePools = 34;
const days = volumeDays();

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");
const address = (random) => `0x${hex(random, 40)}`;

function poolRows(random, hooks) {
  const hookChoices = [
    zeroAddress,
    zeroAddress,
    ...hooks.arrakis,
    ...hooks.other,
  ];
  const span = poolsWindow.to_block - poolsWindow.from_block;
  return Array.from({ length: poolCount }, (_, index) => {
    const [currency0, currency1] = [...pairs[index % pairs.length]].sort();
    return {
      block: poolsWindow.from_block + Math.floor((index / poolCount) * span),
      pool: `0x${hex(random, 64)}`,
      currency0,
      currency1,
      fee: String([100, 500, 3000, 8388608][index % 4]),
      tick_spacing: String([1, 10, 60][index % 3]),
      hooks: hookChoices[Math.floor(random() ** 1.3 * hookChoices.length)],
    };
  });
}

function volumeRows(random, pools) {
  return pools.slice(0, activePools).flatMap((pool) =>
    days.map((day) => {
      const swaps = 1 + Math.floor(random() ** 3 * 4000);
      const dollars = swaps * (200 + Math.floor(random() * 3000));
      const stable = BigInt(dollars) * 1000000n;
      const other = BigInt(Math.floor(random() * 1e6)) * 10n ** 12n;
      const stableFirst = [usdc, usdt].includes(pool.currency0);
      return {
        day,
        pool: pool.pool,
        swaps: String(swaps),
        volume0: (stableFirst ? stable : other).toString(),
        volume1: (stableFirst ? other : stable).toString(),
      };
    }),
  );
}

export function fixture() {
  const random = seeded(11);
  const hooks = {
    arrakis: Array.from({ length: 5 }, () => address(random)),
    other: Array.from({ length: 4 }, () => address(random)),
  };
  const pools = poolRows(random, hooks);
  const rows = {
    pools,
    volume: volumeRows(random, pools),
    "arrakis-hooks": hooks.arrakis.map((hook, index) => ({
      block: poolsWindow.from_block + 1000 * (index + 1),
      hook,
      module: address(random),
      salt: `0x${hex(random, 64)}`,
    })),
  };
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
