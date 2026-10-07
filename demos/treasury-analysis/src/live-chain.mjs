import {
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
          confirmations: 2,
          timeout: 60000,
        });
      } catch {
        throw new Error(
          "The transfer is pending. Use Refresh live reads; do not send it again.",
        );
      }
      // The wait helper can retain a receipt fetched before confirmations. Fetch
      // it again so an early L2 inclusion cannot become our recorded evidence.
      let block;
      for (let attempt = 0; attempt < 5; attempt++) {
        receipt = await rpc.getTransactionReceipt({ hash: pending.hash });
        block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
        const head = await rpc.getBlockNumber({ cacheTime: 0 });
        if (
          block.hash === receipt.blockHash &&
          head >= receipt.blockNumber + 1n
        )
          break;
        block = undefined;
        await delay(1000);
      }
      if (!block)
        throw new Error(
          "The transfer block changed. Refresh after the chain settles.",
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
