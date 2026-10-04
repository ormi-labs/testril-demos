import { randomUUID } from "node:crypto";
import { createChain, move } from "./mock-chain.mjs";
import {
  fixture,
  readBalances,
  readTransfers,
  transferProvenance,
} from "./mock-testril.mjs";
import { parseUsdc, rawAmount } from "../public/amounts.js";

function chargeRead(demo, result, kind) {
  const charge = rawAmount(result.chargeRaw);
  if (charge > BigInt(demo.payment.remainingRaw))
    throw new Error(
      "The mock payment wallet is empty. Reload in a new tab to start a new mock session.",
    );
  if (result.requestCount === 0) return demo;
  const receipt = {
    mode: "mock",
    id: `mock-read-${demo.receipts.length + 1}`,
    kind,
    requestCount: result.requestCount,
    chargeRaw: result.chargeRaw,
    function: result.function,
    block: demo.chain.block,
    timestamp: demo.chain.timestamp,
  };
  return {
    ...demo,
    receipts: [...demo.receipts, receipt],
    payment: {
      ...demo.payment,
      remainingRaw: (BigInt(demo.payment.remainingRaw) - charge).toString(),
      spentRaw: (BigInt(demo.payment.spentRaw) + charge).toString(),
      requestCount: demo.payment.requestCount + result.requestCount,
    },
  };
}

function updateBalances(demo) {
  const result = readBalances(demo.chain);
  return { ...chargeRead(demo, result, "balances"), balanceRead: result };
}

export function createDemo({
  id = randomUUID(),
  now = Date.now(),
  paymentRaw = fixture.payment.initialRaw,
} = {}) {
  rawAmount(paymentRaw);
  return updateBalances({
    id,
    revision: 0,
    cycle: 1,
    startIndex: 0,
    chain: createChain(fixture.wallets, fixture.chain.firstBlock, id, now),
    payment: {
      address: fixture.payment.address,
      initialRaw: paymentRaw,
      remainingRaw: paymentRaw,
      spentRaw: "0",
      requestCount: 0,
    },
    receipts: [],
    lastReset: null,
  });
}

export function transferDemo(demo, { from, to, amount }) {
  const amountRaw = parseUsdc(amount);
  const chain = move(demo.chain, from, to, amountRaw);
  // Build the new state before committing it: a failed mock read spends nothing.
  return updateBalances({ ...demo, chain, revision: demo.revision + 1 });
}

export function showTransfers(demo) {
  const history = readTransfers(demo.chain, demo.startIndex);
  const updated = chargeRead(demo, history, "transfers");
  return {
    demo: {
      ...updated,
      revision: updated === demo ? demo.revision : demo.revision + 1,
    },
    history,
  };
}

export function resetDemo(demo) {
  let chain = demo.chain;
  const sweeps = [];
  for (const wallet of fixture.wallets.filter(
    (wallet) => wallet.id !== "treasury",
  )) {
    const amountRaw = chain.balances[wallet.id];
    if (amountRaw === "0") continue;
    chain = move(chain, wallet.id, "treasury", amountRaw, "reset");
    sweeps.push(chain.transfers.at(-1));
  }
  return updateBalances({
    ...demo,
    chain,
    cycle: demo.cycle + 1,
    startIndex: chain.transfers.length,
    revision: demo.revision + 1,
    lastReset: {
      mode: "mock",
      sweeps,
      returnedRaw: sweeps
        .reduce((sum, transfer) => sum + BigInt(transfer.amountRaw), 0n)
        .toString(),
    },
  });
}

export function publicState(demo) {
  return {
    mode: "mock",
    id: demo.id,
    revision: demo.revision,
    cycle: demo.cycle,
    chain: fixture.chain,
    token: fixture.token,
    initialBalances: Object.fromEntries(
      fixture.wallets.map((wallet) => [wallet.id, wallet.initialRaw]),
    ),
    wallets: fixture.wallets.map(({ id, name, address }) => ({
      id,
      name,
      address,
    })),
    balances: { ...demo.balanceRead.balances },
    balanceRead: demo.balanceRead,
    transferCount: demo.chain.transfers.length - demo.startIndex,
    payment: demo.payment,
    receipts: demo.receipts,
    lastReset: demo.lastReset,
    rates: fixture.payment,
  };
}

export function provenanceFor(demo, id) {
  const transfer = demo.chain.transfers
    .slice(demo.startIndex)
    .find((transfer) => transfer.id === id);
  if (!transfer)
    throw new Error(
      "This transfer is not in the current run. Show transfers again.",
    );
  return transferProvenance(transfer);
}

export function exportDemo(demo) {
  return {
    formatVersion: 2,
    mode: "mock",
    note: "All transfers, reads, fees, addresses, timestamps and hashes are simulated. No funds moved or payments occurred.",
    cycle: demo.cycle,
    chain: fixture.chain,
    token: fixture.token,
    wallets: fixture.wallets,
    initialBalances: Object.fromEntries(
      fixture.wallets.map((wallet) => [wallet.id, wallet.initialRaw]),
    ),
    transfers: demo.chain.transfers.slice(demo.startIndex),
    balances: demo.balanceRead.balances,
    balanceRead: demo.balanceRead,
    payment: demo.payment,
    receipts: demo.receipts,
    lastReset: demo.lastReset,
    provenance: demo.chain.transfers
      .slice(demo.startIndex)
      .map(transferProvenance),
  };
}
