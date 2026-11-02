import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { daos } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const nativeIndex = 3;
const decimalsByAsset = [18, 6, 18, 18];

// Per wallet: starting whole units of [governance token, USDC, WETH, ETH].
// A zero start is never held, so it yields no rows, as the daemon does.
const holdings = {
  uniswap: {
    start: [
      [4.1e8, 2.6e6, 480, 1900],
      [1.5e7, 4.2e6, 90, 310],
    ],
    step: [2e5, 8e4, 12, 40],
    grant: { dayIndex: 40, asset: 1, amount: 1.5e6 },
  },
  ens: {
    start: [
      [4.2e6, 9.8e6, 3100, 250],
      [0, 4.5e7, 12000, 0],
    ],
    step: [3e4, 1e5, 40, 8],
    grant: { dayIndex: 50, asset: 1, amount: 2.4e6 },
  },
  arbitrum: {
    start: [
      [7.1e8, 3.4e6, 210, 640],
      [1.2e8, 0, 0, 55],
    ],
    step: [4e5, 5e4, 6, 12],
    grant: { dayIndex: 4, asset: 0, amount: 2.5e7 },
  },
};

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rawUnits = (units, decimals) =>
  BigInt(Math.round(units * 100)) * 10n ** BigInt(decimals - 2);

function walletUnits(dao, random) {
  const { start, step } = holdings[dao.id];
  return start.map((assets) => {
    const days = assets.map(() => []);
    assets.forEach((first, asset) => {
      let units = first;
      for (let index = 0; index < dao.days.length; index++) {
        if (first > 0 && index > 0)
          units = Math.max(0, units + (random() - 0.5) * 2 * step[asset]);
        days[asset].push(units);
      }
    });
    return days;
  });
}

function dayRows(dao, wallets) {
  const { grant } = holdings[dao.id];
  const grantee = wallets[0][grant.asset];
  for (let index = grant.dayIndex; index < dao.days.length; index++)
    grantee[index] = Math.max(0, grantee[index] - grant.amount);
  const rawAt = (wallet, asset, index) =>
    rawUnits(wallets[wallet][asset][index], decimalsByAsset[asset]);
  const tokenRows = (members) =>
    dao.days.flatMap((day, index) =>
      dao.tokens.flatMap((token, asset) => {
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
      const balance = rawAt(wallet, nativeIndex, index);
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
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
