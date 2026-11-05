import { readParts } from "../src/fetch.mjs";
import { bindsAt, knownPools, usdc, usdt } from "../src/report.mjs";
import { blockAt, resolveWindow } from "./fake-testril.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const dayFromBlock = blockAt(fixtureBinds[0].window.from_time);
const blocksPerHour = 300;

const ethUsd = 3000;
const [ethUsdc] = knownPools;
const otherPools = [`0x${"a1".repeat(32)}`, `0x${"b2".repeat(32)}`];
const senders = [
  "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  "0x2e5fc3f6b5b3e3f7d4f0bb0a6f3e2c9d1a7b8c01",
  "0x7a1d5c0e9f3b4a2d8c6e1f0b9a8d7c6b5e4f3a20",
  "0x9c3e7b1d5a0f2c4e6b8d0a1c3e5f7b9d1a3c5e40",
  "0x4b6d8f0a2c4e6a8c0e2b4d6f8a0c2e4b6d8f0a60",
];
const attackers = [
  "0xa77ac4e5e5a7d3c1b2f09e8d7c6b5a4f3e2d1c00",
  "0xb88bd5f6f6b8e4d2c3a1f0e9d8c7b6a5f4e3d211",
];
const jitProviders = [
  "0xc1171e000000000000000000000000000000a001",
  "0xc1171e000000000000000000000000000000a002",
  "0xc1171e000000000000000000000000000000a003",
];
const positionManager = "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e";

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hash = (prefix, n) =>
  `0x${prefix}${n.toString(16).padStart(64 - prefix.length, "0")}`;

function swapIntent(pool, sender, usd, sellsEth) {
  return { pool, sender, usd, sellsEth };
}

function buildEvents(random) {
  const events = [];
  const at = (hour, offset) => dayFromBlock + hour * blocksPerHour + offset;
  for (let i = 0; i < 230; i++) {
    const pool = i % 4 === 0 ? ethUsdc.id : otherPools[i % 2];
    const usd = 200 + random() ** 4 * 60000;
    events.push({
      block: at(Math.floor(random() * 24), Math.floor(random() * 270)),
      swaps: [
        swapIntent(
          pool,
          senders[Math.floor(random() * senders.length)],
          usd,
          random() < 0.5,
        ),
      ],
    });
  }
  [4.2e6, 2.9e6, 1.7e6, 880e3].forEach((usd, i) =>
    events.push({
      block: at(3 + i * 5, 77),
      swaps: [swapIntent(ethUsdc.id, senders[i], usd, i % 2 === 0)],
    }),
  );
  jitProviders.forEach((provider, i) =>
    events.push({
      block: at(2 + i * 7, 150),
      jit: { provider, delta: 4e18 * (i + 1) },
      swaps: [swapIntent(ethUsdc.id, senders[i + 1], 120e3 * (i + 1), true)],
    }),
  );
  attackers.forEach((attacker, i) =>
    events.push({
      block: at(9 + i * 8, 200),
      swaps: [
        swapIntent(otherPools[i], attacker, 50e3, true),
        swapIntent(otherPools[i], senders[i], 80e3, true),
        swapIntent(otherPools[i], attacker, 51e3, false),
      ],
    }),
  );
  events.push({
    block: at(20, 40),
    swaps: [
      swapIntent(otherPools[0], attackers[0], 10e3, true),
      swapIntent(otherPools[0], senders[3], 20e3, true),
      swapIntent(otherPools[0], attackers[0], 11e3, true),
    ],
  });
  events.push({
    block: at(21, 60),
    swaps: [swapIntent(ethUsdc.id, senders[1], 30e3, false)],
    liquidityOnly: { provider: jitProviders[0], delta: 2e18 },
  });
  return events.sort((a, b) => a.block - b.block);
}

export function fixture() {
  const random = seeded(7);
  const prices = new Map();
  const swaps = [];
  const liquidity = [];
  const priceOf = (pool) => {
    if (!prices.has(pool))
      prices.set(pool, ethUsd * 1e-12 * (0.9 + random() * 0.2));
    return prices.get(pool);
  };
  const usedBlocks = new Set();
  let counter = 0;
  for (const event of buildEvents(random)) {
    let block = event.block;
    while (usedBlocks.has(block)) block++;
    usedBlocks.add(block);
    let log = 10;
    const lp = (provider, delta, tick) => {
      counter++;
      liquidity.push({
        block,
        log_index: String(log++),
        tx: hash("1f", counter),
        pool: ethUsdc.id,
        sender: provider,
        tick_lower: String(tick - 60),
        tick_upper: String(tick + 60),
        liquidity_delta: BigInt(delta).toString(),
        salt: `0x${"0".repeat(64)}`,
      });
    };
    const lpIndex = liquidity.length;
    if (event.jit) lp(event.jit.provider, event.jit.delta, 0);
    for (const intent of event.swaps) {
      counter++;
      const priceBefore = priceOf(intent.pool);
      const priceAfter = priceBefore * (intent.sellsEth ? 0.9995 : 1.0005);
      prices.set(intent.pool, priceAfter);
      const wei = BigInt(Math.round((intent.usd / ethUsd) * 1e6)) * 10n ** 12n;
      const quote = BigInt(Math.round(intent.usd * 1e6));
      const tick = Math.floor(Math.log(priceAfter) / Math.log(1.0001));
      swaps.push({
        block,
        log_index: String(log++),
        tx: hash("5a", counter),
        pool: intent.pool,
        sender: intent.sender,
        amount0: (intent.sellsEth ? wei : -wei).toString(),
        amount1: (intent.sellsEth ? -quote : quote).toString(),
        sqrt_price_x96: (
          (BigInt(Math.round(Math.sqrt(priceAfter) * 1e12)) * 2n ** 96n) /
          10n ** 12n
        ).toString(),
        liquidity: (BigInt(1e18) + BigInt(event.jit?.delta ?? 0)).toString(),
        tick: String(tick),
        fee: "3000",
      });
    }
    if (event.jit) {
      const add = liquidity[lpIndex];
      const swapTick = Number(swaps.at(-1).tick);
      add.tick_lower = String(swapTick - 60);
      add.tick_upper = String(swapTick + 60);
      lp(event.jit.provider, -event.jit.delta, swapTick);
    }
    if (event.liquidityOnly) {
      lp(event.liquidityOnly.provider, event.liquidityOnly.delta, 0);
      lp(event.liquidityOnly.provider, -event.liquidityOnly.delta, 0);
    }
  }
  for (let i = 0; i < 40; i++) {
    counter++;
    const block = dayFromBlock + 7000 - i * 150;
    liquidity.push({
      block,
      log_index: "3",
      tx: hash("1f", counter),
      pool: ethUsdc.id,
      sender: positionManager,
      tick_lower: "-120",
      tick_upper: "180",
      liquidity_delta: String((i % 3 === 0 ? -1 : 1) * 1e17 * (1 + i)),
      salt: hash("", i),
    });
  }
  const order = (a, b) =>
    a.block - b.block || Number(a.log_index) - Number(b.log_index);
  swaps.sort(order);
  liquidity.sort(order);
  return {
    swaps,
    liquidity,
    tokens: [
      {
        day: "2026-11-01",
        token: usdc,
        name: "USD Coin",
        symbol: "USDC",
        decimals: "6",
      },
      {
        day: "2026-11-01",
        token: usdt,
        name: "Tether USD",
        symbol: "USDT",
        decimals: "6",
      },
    ],
  };
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const within = (rows, window) => {
  const { from_block, to_block } = resolveWindow(window);
  return rows.filter((row) => row.block >= from_block && row.block < to_block);
};

export function fixtureFetched(rows = fixture()) {
  const reads = Object.fromEntries(
    fixtureBinds
      .filter((bind) => bind.read)
      .map((bind) => [
        bind.name,
        readParts(bind.window, bind.read).map((part) => ({
          ...part,
          ...resolveWindow(part),
          count: within(rows[bind.name], part).length,
        })),
      ]),
  );
  return { rows, reads };
}

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
    return bind.read ? within(rows[bind.name], window) : rows[bind.name];
  };
}
