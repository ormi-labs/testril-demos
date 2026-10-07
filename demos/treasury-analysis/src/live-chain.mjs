import {
  BlockNotFoundError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
} from "viem";
import { baseSepolia } from "viem/chains";
import { setTimeout as delay } from "node:timers/promises";
import { sameAddress } from "./live-config.mjs";

export function createLiveChain(config) {
  const transport = http(config.rpcUrl, { retryCount: 0, timeout: 30000 });
  const rpc = createPublicClient({ chain: baseSepolia, transport });
  const signers = Object.fromEntries(
    Object.entries(config.accounts).map(([id, account]) => [
      id,
      createWalletClient({ account, chain: baseSepolia, transport }),
    ]),
  );
  const address = (id) => config.wallets.find((w) => w.id === id)?.address;
  return {
    async snapshot(blockNumber) {
      if ((await rpc.getChainId()) !== 84532)
        throw new Error("The RPC must serve Base Sepolia.");
      const block = await rpc.getBlock(
        blockNumber === undefined ? {} : { blockNumber: BigInt(blockNumber) },
      );
      const balances = {};
      for (const wallet of config.wallets)
        balances[wallet.id] = (
          await rpc.readContract({
            address: config.token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.address],
            blockNumber: block.number,
          })
        ).toString();
      return {
        block: Number(block.number),
        blockHash: block.hash,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        balances,
      };
    },
    async prepare(from, to, amountRaw) {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [address(to), BigInt(amountRaw)],
      });
      const signer = signers[from];
      const request = await signer.prepareTransactionRequest({
        to: config.token.address,
        data,
      });
      if (request.gas * request.maxFeePerGas > 100000000000000n)
        throw new Error("This transfer's maximum gas fee exceeds 0.0001 ETH.");
      const serialized = await signer.signTransaction(request);
      return { hash: keccak256(serialized), serialized };
    },
    async broadcast(pending) {
      try {
        await rpc.sendRawTransaction({
          serializedTransaction: pending.serialized,
        });
      } catch {
        /* Receipt lookup resolves a duplicate or an uncertain broadcast. */
      }
    },
    async confirm(pending) {
      let receipt;
      try {
        receipt = await rpc.waitForTransactionReceipt({
          hash: pending.hash,
          confirmations: 1,
          pollingInterval: 200,
          timeout: 60000,
        });
      } catch {
        throw new Error(
          "The transfer is pending. Use Refresh live reads; do not send it again.",
        );
      }
      // Recheck that the receipt belongs to the current block before recording it.
      let block;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          receipt = await rpc.getTransactionReceipt({ hash: pending.hash });
          block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
          const head = await rpc.getBlockNumber({ cacheTime: 0 });
          if (block.hash === receipt.blockHash && head >= receipt.blockNumber)
            break;
        } catch (error) {
          if (
            !(error instanceof BlockNotFoundError) &&
            !(error instanceof TransactionReceiptNotFoundError)
          )
            throw error;
        }
        block = undefined;
        await delay(1000);
      }
      if (!block)
        throw new Error(
          "The RPC has not confirmed a stable transfer block yet. Use Refresh to retry; do not send the transfer again.",
        );
      if (receipt.status !== "success") return { reverted: true };
      const events = receipt.logs
        .filter((log) => sameAddress(log.address, config.token.address))
        .flatMap((log) => {
          try {
            const decoded = decodeEventLog({
              abi: erc20Abi,
              data: log.data,
              topics: log.topics,
            });
            return decoded.eventName === "Transfer" &&
              sameAddress(decoded.args.from, address(pending.from)) &&
              sameAddress(decoded.args.to, address(pending.to)) &&
              decoded.args.value === BigInt(pending.amountRaw)
              ? [{ ...decoded.args, logIndex: log.logIndex }]
              : [];
          } catch {
            return [];
          }
        });
      if (events.length !== 1)
        throw new Error(
          "The confirmed transaction does not contain the expected USDC transfer.",
        );
      return {
        id: pending.hash,
        transactionHash: pending.hash,
        from: pending.from,
        to: pending.to,
        amountRaw: pending.amountRaw,
        kind: pending.kind,
        block: Number(receipt.blockNumber),
        blockHash: receipt.blockHash,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        logIndex: events[0].logIndex,
      };
    },
  };
}
