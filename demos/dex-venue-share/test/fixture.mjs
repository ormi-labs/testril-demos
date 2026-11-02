import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { days, pairs } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const wei = 10n ** 18n;
const wstethPerEth = 0.82;
const noisePools = {
  "uniswap-v2": ["0xa478c2975ab1ea89e8196811f51a7b7ade33eb11"],
  "uniswap-v3": ["0xcbcdf9626bc03e24f779434178a73a0b4bad62ed"],
  "uniswap-v4": [`0x${"ab".repeat(32)}`],
  "fluid-dex": ["0x0000000000000000000000000000000000f1d001"],
};
// [ETH-side volume on the first day, change per day]
const plan = {
  "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc": [7000, -300],
  "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640": [64000, -2600],
  "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8": [21000, -400],
  "0xe0554a476a092703abdb3ef35c80e0d76d32939f": [2800, 0],
  "0x7bea39867e4169dbe237d55c8242a8f2fcdcc387": [900, -40],
  "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27": [
    26000, 2200,
  ],
  "0x7f86bf177dd4f3494b841a37e810a34dd56c829b": [5200, 100],
  "0x2886a01a0645390872a9eb99dae1283664b0c524": [3100, 450],
  "0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa": [9000, -650],
  "0x0b1a513ee24972daef112bc777a5610d4325c9e7": [4200, 700],
};

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rawUnits = (amount, decimals, random) =>
  BigInt(Math.round(amount * 100)) * 10n ** BigInt(decimals - 2) +
  BigInt(Math.floor(random() * 1e6));

function poolRows(s, day, eth, other, random) {
  const swaps = String(200 + Math.floor(random() * 4000));
  if (s.bind !== "curve")
    return [
      {
        day,
        pool: s.pool,
        swaps,
        volume0: "0",
        volume1: "0",
        [s.eth]: eth.toString(),
        [s.other]: other.toString(),
      },
    ];
  const coinRow = (coin, amount) => {
    const bought = (amount * BigInt(30 + Math.floor(random() * 40))) / 100n;
    return {
      coin_index: coin,
      day,
      pool: s.pool,
      swaps,
      volume_in: (amount - bought).toString(),
      volume_out: bought.toString(),
    };
  };
  return [coinRow("0", other), coinRow("1", wei / 10n), coinRow("2", eth)];
}

function noiseRows(bind, day, random) {
  return (noisePools[bind] ?? []).map((pool) => ({
    day,
    pool,
    swaps: String(1 + Math.floor(random() * 90)),
    volume0: rawUnits(40 + random() * 900, 18, random).toString(),
    volume1: rawUnits(9e4 + random() * 4e6, 6, random).toString(),
  }));
}

export function fixture() {
  const random = seeded(11);
  const rows = Object.fromEntries(spec.binds.map((bind) => [bind.name, []]));
  let usdcPerEth = 2640;
  for (const [index, day] of days().entries()) {
    usdcPerEth *= 1 + (random() - 0.5) * 0.03;
    for (const pair of pairs)
      for (const s of pair.subjects) {
        const [start, change] = plan[s.pool];
        const ethAmount = start + change * index;
        const otherPerEth = pair.id === "eth-usdc" ? usdcPerEth : wstethPerEth;
        const drift = 1 + (random() - 0.5) * 0.02;
        rows[s.bind].push(
          ...poolRows(
            s,
            day,
            rawUnits(ethAmount, 18, random),
            rawUnits(
              ethAmount * otherPerEth * drift,
              pair.otherDecimals,
              random,
            ),
            random,
          ),
        );
      }
    for (const bind of Object.keys(noisePools))
      rows[bind].push(...noiseRows(bind, day, random));
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
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
