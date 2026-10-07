import { readFile } from "node:fs/promises";

export const fixture = JSON.parse(
  await readFile(new URL("../fixtures/demo.json", import.meta.url), "utf8"),
);

export function readBalances(chain) {
  return {
    mode: "mock",
    function: "erc20.token_balance",
    block: chain.block,
    blockHash: chain.blockHash,
    timestamp: chain.timestamp,
    balances: { ...chain.balances },
    requestCount: fixture.wallets.length,
    chargeRaw: (
      BigInt(fixture.payment.balanceReadRaw) * BigInt(fixture.wallets.length)
    ).toString(),
  };
}

export function readTransfers(chain, startIndex) {
  const transfers = chain.transfers.slice(startIndex);
  return {
    mode: "mock",
    function: "erc20.transfer_edges",
    transfers: transfers.map((transfer) => ({ ...transfer })),
    fromBlock: transfers[0]?.block ?? null,
    toBlock: transfers.length ? chain.block + 1 : null,
    requestCount: transfers.length ? 1 : 0,
    chargeRaw: transfers.length
      ? (
          BigInt(fixture.payment.transferReadBaseRaw) +
          BigInt(fixture.payment.transferReadPerRowRaw) *
            BigInt(transfers.length)
        ).toString()
      : "0",
  };
}

export function transferProvenance(transfer) {
  return {
    mode: "mock",
    note: "Fictional evidence. These hashes cannot be checked on Arbitrum; no source verification was performed.",
    function: { name: "erc20.transfer_edges", version: "mock-v1" },
    chain: fixture.chain,
    token: fixture.token,
    binding: { chainId: fixture.chain.id, tokenAddress: fixture.token.address },
    range: { fromBlock: transfer.block, toBlock: transfer.block + 1 },
    source: {
      block: transfer.block,
      timestamp: transfer.timestamp,
      blockHash: transfer.blockHash,
      transactionHash: transfer.transactionHash,
      logIndex: transfer.logIndex,
      from: fixture.wallets.find((wallet) => wallet.id === transfer.from)
        .address,
      to: fixture.wallets.find((wallet) => wallet.id === transfer.to).address,
      amountRaw: transfer.amountRaw,
      transferCount: "1",
    },
    calculation: {
      description:
        "Display raw token units divided by 1,000,000. This mock places each transfer in a distinct block.",
      decimals: fixture.token.decimals,
    },
  };
}

export function balanceProvenance(read, wallet) {
  return {
    mode: "mock",
    note: "Fictional balance snapshot. This block hash cannot be checked on Arbitrum; no source verification was performed.",
    function: { name: read.function, version: "mock-v1" },
    chain: fixture.chain,
    token: fixture.token,
    binding: {
      chainId: fixture.chain.id,
      tokenAddress: fixture.token.address,
      walletAddress: wallet.address,
    },
    source: {
      wallet: wallet.name,
      address: wallet.address,
      block: read.block,
      blockHash: read.blockHash,
      timestamp: read.timestamp,
      balanceRaw: read.balances[wallet.id],
    },
    calculation: {
      description:
        "Display the balance snapshot's raw token units divided by 1,000,000.",
      decimals: fixture.token.decimals,
    },
  };
}
