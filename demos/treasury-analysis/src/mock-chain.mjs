import { createHash } from "node:crypto";
import { rawAmount } from "../public/amounts.js";

const hash = (text) => `0x${createHash("sha256").update(text).digest("hex")}`;

export function createChain(wallets, firstBlock, id, now) {
  return {
    id,
    block: firstBlock,
    timestamp: new Date(now).toISOString(),
    blockHash: hash(`${id}:block:${firstBlock}`),
    balances: Object.fromEntries(
      wallets.map((wallet) => [wallet.id, wallet.initialRaw]),
    ),
    transfers: [],
  };
}

export function move(chain, from, to, amountRaw, kind = "transfer") {
  if (
    !Object.hasOwn(chain.balances, from) ||
    !Object.hasOwn(chain.balances, to)
  )
    throw new Error("Choose one of the three demo wallets.");
  if (from === to) throw new Error("Choose two different wallets.");
  const amount = rawAmount(amountRaw);
  if (amount === 0n) throw new Error("Enter an amount greater than zero.");
  if (amount > BigInt(chain.balances[from]))
    throw new Error("The sending wallet does not have enough USDC.");
  const block = chain.block + 1;
  // A deterministic mock clock, not a claim about real Arbitrum latency.
  const timestamp = new Date(Date.parse(chain.timestamp) + 1000).toISOString();
  const blockHash = hash(`${chain.id}:block:${block}`);
  const transfer = {
    id: `mock-tx-${chain.transfers.length + 1}`,
    from,
    to,
    amountRaw,
    kind,
    block,
    timestamp,
    blockHash,
    transactionHash: hash(`${chain.id}:transaction:${block}`),
    logIndex: 0,
  };
  return {
    ...chain,
    block,
    blockHash,
    timestamp,
    balances: {
      ...chain.balances,
      [from]: (BigInt(chain.balances[from]) - amount).toString(),
      [to]: (BigInt(chain.balances[to]) + amount).toString(),
    },
    transfers: [...chain.transfers, transfer],
  };
}
