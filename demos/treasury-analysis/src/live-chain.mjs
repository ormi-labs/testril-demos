import { demoFailure, describeFailure, transportCode } from "./errors.mjs";
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
    async prepare(from, to, amountRaw) {
      try {
        if ((await rpc.getChainId()) !== config.chain.id)
          throw demoFailure(
            "RPC_CONFIGURATION_INVALID",
            "The signer RPC must serve Base Sepolia.",
            {},
          );
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
          throw demoFailure(
            "GAS_POLICY_VIOLATION",
            "This transfer's maximum gas fee exceeds 0.0001 ETH.",
            {},
          );
        const serialized = await signer.signTransaction(request);
        return { hash: keccak256(serialized), serialized };
      } catch (error) {
        if (describeFailure(error)) throw error;
        throw demoFailure(
          "RPC_REQUEST_FAILED",
          "The RPC could not prepare the transfer. No transaction was submitted.",
          { operation: "prepare", transportCode: transportCode(error) },
        );
      }
    },
    async broadcast(pending) {
      try {
        await rpc.sendRawTransaction({
          serializedTransaction: pending.serialized,
        });
      } catch (error) {
        // An uncertain response may still mean the exact transaction was accepted.
        const known = await rpc
          .getTransaction({ hash: pending.hash })
          .catch(() => null);
        if (!known) {
          const details = String(
            error.details ?? error.shortMessage ?? "",
          ).toLowerCase();
          const reason = /too many requests|rate limit/.test(details)
            ? "rate-limited"
            : /insufficient funds/.test(details)
              ? "insufficient-gas"
              : /fee cap|underpriced|base fee/.test(details)
                ? "fee-too-low"
                : /nonce/.test(details)
                  ? "nonce-conflict"
                  : "provider-or-connection-error";
          throw demoFailure(
            "RPC_BROADCAST_UNACKNOWLEDGED",
            `The RPC did not acknowledge the transfer (${reason}). Its signed transaction is saved for recovery; do not send another transfer.`,
            { reason },
          );
        }
      }
    },
    async confirm(pending) {
      let receipt;
      try {
        receipt = await rpc.waitForTransactionReceipt({
          hash: pending.hash,
          confirmations: 1,
          checkReplacement: false,
          pollingInterval: 200,
          timeout: 60000,
        });
      } catch {
        throw demoFailure(
          "TRANSFER_PENDING",
          "The transfer is pending. Use Refresh live reads; do not send it again.",
          {},
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
            throw demoFailure(
              "RPC_REQUEST_FAILED",
              "The RPC could not verify the transfer receipt. Refresh before sending again.",
              { operation: "confirm", transportCode: transportCode(error) },
            );
        }
        block = undefined;
        await delay(1000);
      }
      if (!block)
        throw demoFailure(
          "TRANSFER_CONFIRMATION_PENDING",
          "The RPC has not confirmed a stable transfer block yet. Use Refresh to retry; do not send the transfer again.",
          {},
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
        throw demoFailure(
          "TRANSFER_EVIDENCE_MISMATCH",
          "The confirmed transaction does not contain the expected USDC transfer.",
          {},
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
