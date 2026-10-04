import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { usdAmount } from "../public/amounts.js";
import {
  calculate,
  calculationVersion,
  validateInputs,
} from "./accounting.mjs";

export const reference = JSON.parse(
  await readFile(
    new URL("../fixtures/reference.json", import.meta.url),
    "utf8",
  ),
);
const edges = JSON.parse(
  await readFile(new URL("../fixtures/edges.json", import.meta.url), "utf8"),
);
const balances = JSON.parse(
  await readFile(new URL("../fixtures/balances.json", import.meta.url), "utf8"),
);

export const defaultInputs = {
  chainId: reference.chainId,
  treasury: reference.accounts[0].address,
  token: reference.token,
  decimals: reference.decimals,
  fromBlock: 100,
  toBlock: 1100,
  team: [],
  budgetRaw: "150000",
};

export function sampleHash(block) {
  return `0x${createHash("sha256").update(`fictional-block:${block}`).digest("hex")}`;
}

export function sampleBalance(address, atBlock) {
  const snapshot = balances.findLast((snapshot) => snapshot.block <= atBlock);
  const balance = snapshot?.balances[address];
  if (balance === undefined)
    throw new Error(
      "Choose one of the three sample addresses within the covered range.",
    );
  return balance;
}

export function buildSample(inputs) {
  validateInputs(inputs);
  inputs = { ...inputs, team: [...inputs.team] };
  if (
    inputs.chainId !== reference.chainId ||
    inputs.token !== reference.token ||
    inputs.decimals !== reference.decimals
  )
    throw new Error(
      "The sample has one fictional six-decimal token on chain 1.",
    );
  if (inputs.fromBlock < 100 || inputs.toBlock > 1100)
    throw new Error(
      "The sample covers blocks [100, 1100). Choose a range inside it.",
    );
  if (
    inputs.team.some(
      (address) =>
        !reference.accounts.some((account) => account.address === address),
    )
  )
    throw new Error("Team members must be sample addresses.");
  const data = {
    edges: edges
      .filter(
        (edge) => edge.block >= inputs.fromBlock && edge.block < inputs.toBlock,
      )
      .map((edge) => ({ ...edge })),
    openingRaw: sampleBalance(inputs.treasury, inputs.fromBlock - 1),
    closingRaw: sampleBalance(inputs.treasury, inputs.toBlock - 1),
  };
  const blocks = BigInt(inputs.toBlock - inputs.fromBlock);
  // Historical illustrative rates, not a current quote. Units are millionths of USD.
  const preparation = (blocks + 2n) * 120n;
  const reads = blocks + 20n + 2n * 21n;
  const total = preparation + reads;
  if (total > BigInt(inputs.budgetRaw))
    throw new Error(
      `Sample estimate exceeds the budget: need ${usdAmount(total.toString())}. No payment was made.`,
    );
  const sourceBlocks = [
    ...new Set([
      inputs.fromBlock - 1,
      inputs.toBlock - 1,
      ...data.edges.map((edge) => edge.block),
    ]),
  ].sort((a, b) => a - b);
  return {
    formatVersion: 1,
    mode: "sample",
    inputs,
    data,
    report: calculate(inputs, data),
    receipts: {
      kind: "illustrative-estimate",
      paidRaw: "0",
      preparationRaw: preparation.toString(),
      readsRaw: reads.toString(),
      totalRaw: total.toString(),
      remainingRaw: (BigInt(inputs.budgetRaw) - total).toString(),
      note: "Synthetic estimates using the 3 October 2026 baseline. No quote, payment, materialization, or earnings occurred.",
    },
    provenance: {
      kind: "synthetic",
      function: "erc20_transfer_edges (required, not deployed)",
      blocks: sourceBlocks.map((block) => ({ block, hash: sampleHash(block) })),
    },
    calculation: {
      version: calculationVersion,
      description:
        "Sum directed edges touching the treasury; exclude self-transfers from inflow/outflow. Team movement is separate from individual balances. All ranges are half-open and all amounts are integer strings.",
    },
    verification: {
      status: "not-run",
      note: "No independent checks have run.",
    },
  };
}
