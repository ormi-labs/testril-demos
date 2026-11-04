import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { daos } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const decimals = { governance: 18, usdc: 6, weth: 18, eth: 18 };
const tokenOrder = ["governance", "usdc", "weth"];

// A zero start is never held, so it yields no rows, as the daemon does.
const holdings = {
  uniswap: {
    wallets: [
      { governance: 410_000_000, usdc: 2_600_000, weth: 480, eth: 1900 },
      { governance: 15_000_000, usdc: 4_200_000, weth: 90, eth: 310 },
    ],
    step: { governance: 200_000, usdc: 80_000, weth: 12, eth: 40 },
    grant: { dayIndex: 40, asset: "usdc", amount: 1_500_000 },
  },
  ens: {
    wallets: [
      { governance: 4_200_000, usdc: 9_800_000, weth: 3100, eth: 250 },
      { governance: 0, usdc: 45_000_000, weth: 12000, eth: 0 },
    ],
    step: { governance: 30_000, usdc: 100_000, weth: 40, eth: 8 },
    grant: { dayIndex: 50, asset: "usdc", amount: 2_400_000 },
  },
  arbitrum: {
    wallets: [
      { governance: 710_000_000, usdc: 3_400_000, weth: 210, eth: 640 },
      { governance: 120_000_000, usdc: 0, weth: 0, eth: 55 },
    ],
    step: { governance: 400_000, usdc: 50_000, weth: 6, eth: 12 },
    grant: { dayIndex: 4, asset: "governance", amount: 25_000_000 },
  },
};

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rawUnits = (wholeUnits, asset) =>
  BigInt(wholeUnits) * 10n ** BigInt(decimals[asset]);

function walletUnits(dao, random) {
  const { wallets, step, grant } = holdings[dao.id];
  return wallets.map((start, wallet) =>
    Object.fromEntries(
      Object.entries(start).map(([asset, first]) => {
        let units = first;
        const days = dao.days.map((_, index) => {
          if (first > 0 && index > 0)
            units = Math.max(
              0,
              units + Math.round((random() - 0.5) * 2 * step[asset]),
            );
          const granted =
            wallet === 0 && asset === grant.asset && index >= grant.dayIndex;
          return granted ? Math.max(0, units - grant.amount) : units;
        });
        return [asset, days];
      }),
    ),
  );
}

function dayRows(dao, wallets) {
  const rawAt = (wallet, asset, index) =>
    rawUnits(wallets[wallet][asset][index], asset);
  const tokenRows = (members) =>
    dao.days.flatMap((day, index) =>
      dao.tokens.flatMap((token, position) => {
        const asset = tokenOrder[position];
        const balance = members.reduce(
          (sum, wallet) => sum + rawAt(wallet, asset, index),
          0n,
        );
        return balance > 0n
          ? [{ day, token, balance: balance.toString() }]
          : [];
      }),
    );
  const nativeRows = dao.days.flatMap((day, index) =>
    dao.wallets.flatMap(({ address: owner }, wallet) => {
      const balance = rawAt(wallet, "eth", index);
      return balance > 0n ? [{ day, owner, balance: balance.toString() }] : [];
    }),
  );
  return {
    [dao.totalBind]: tokenRows(dao.wallets.map((_, wallet) => wallet)),
    ...Object.fromEntries(
      dao.wallets.map(({ bind }, wallet) => [bind, tokenRows([wallet])]),
    ),
    [dao.nativeBind]: nativeRows,
  };
}

export function fixture() {
  const random = seeded(7);
  const rows = Object.assign(
    {},
    ...daos.map((dao) => dayRows(dao, walletUnits(dao, random))),
  );
  return {
    demo: spec.demo,
    source: "synthetic",
    recordedAt,
    boundFunctions: Object.fromEntries(
      spec.binds.map((bind) => [
        bind.name,
        { function_slug: bind.function_slug, chain_id: bind.chain_id },
      ]),
    ),
    window: Object.fromEntries(spec.binds.map((b) => [b.name, b.window])),
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/synthetic.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
