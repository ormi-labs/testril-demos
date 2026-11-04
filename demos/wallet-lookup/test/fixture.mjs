import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { tokens, wallets, weekWindow } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const tokenAddresses = Object.keys(tokens);
const counterparties = [
  "0x28c6c06298d514db089934071355e5743bf21d60",
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41",
  "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];
const names = {
  vitalik: "vitalik.eth",
  nick: "nick.eth",
  brantly: "brantly.eth",
};
const balances = {
  vitalik: 1234567890123456789012n,
  nick: 42000000000000000000n,
  brantly: 7500000000000000000n,
};
const transferCounts = { vitalik: 18, nick: 11, brantly: 6 };

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, length) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join("");

function transferRows(wallet, random) {
  const blockSpan = weekWindow.to_block - weekWindow.from_block;
  const rows = Array.from({ length: transferCounts[wallet.key] }, () => {
    const token = tokenAddresses[Math.floor(random() * tokenAddresses.length)];
    const incoming = random() < 0.55;
    const other = counterparties[Math.floor(random() * counterparties.length)];
    const dollars = BigInt(Math.floor(10 + random() ** 3 * 50000));
    return {
      block: weekWindow.from_block + Math.floor(random() * blockSpan),
      log_index: String(Math.floor(random() * 300)),
      tx: `0x${hex(random, 64)}`,
      token,
      from: incoming ? other : wallet.address,
      to: incoming ? wallet.address : other,
      value: (dollars * 10n ** BigInt(tokens[token].decimals)).toString(),
    };
  });
  if (wallet.key === "vitalik")
    rows.push({
      ...rows[0],
      from: wallet.address,
      to: wallet.address,
      log_index: "301",
    });
  return rows.sort((a, b) => a.block - b.block);
}

export function fixture() {
  const random = seeded(11);
  const rows = {
    balance: wallets.map((wallet) => ({
      block: spec.binds.find((bind) => bind.name === "balance").window
        .from_block,
      owner: wallet.address,
      balance: balances[wallet.key].toString(),
    })),
  };
  for (const wallet of wallets) {
    const ens = spec.binds.find((bind) => bind.name === `ens-${wallet.key}`);
    rows[ens.name] = [
      {
        block: ens.window.from_block,
        address: wallet.address,
        name: names[wallet.key],
      },
    ];
    rows[`transfers-${wallet.key}`] = transferRows(wallet, random);
  }
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
