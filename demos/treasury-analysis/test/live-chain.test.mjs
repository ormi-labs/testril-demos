import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { encodeEventTopics, erc20Abi } from "viem";
import { createLiveChain } from "../src/live-chain.mjs";
import { testConfig } from "./live-peer.mjs";

test("receipt confirmation refreshes an early L2 inclusion before recording its block and log", async (t) => {
  const { config } = testConfig();
  const hash = `0x${"aa".repeat(32)}`;
  const early = `0x${"bb".repeat(32)}`;
  const canonical = `0x${"cc".repeat(32)}`;
  let receiptRequests = 0;
  const topics = encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from: config.wallets[0].address, to: config.wallets[1].address },
  });
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    const message = JSON.parse(body);
    let result;
    if (message.method === "eth_blockNumber") result = "0x66";
    else if (message.method === "eth_getTransactionReceipt") {
      receiptRequests++;
      result = {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockNumber: "0x64",
        blockHash: receiptRequests === 1 ? early : canonical,
        from: config.wallets[0].address,
        to: config.token.address,
        status: "0x1",
        gasUsed: "0x10000",
        cumulativeGasUsed: "0x10000",
        effectiveGasPrice: "0x1",
        type: "0x2",
        contractAddress: null,
        logs: [
          {
            address: config.token.address,
            topics,
            data: `0x${(250000).toString(16).padStart(64, "0")}`,
            blockHash: canonical,
            blockNumber: "0x64",
            transactionHash: hash,
            transactionIndex: "0x0",
            logIndex: "0x7",
            removed: false,
          },
        ],
      };
    } else if (message.method === "eth_getBlockByNumber")
      result = {
        number: "0x64",
        hash: canonical,
        timestamp: "0x64",
        transactions: [],
      };
    else {
      response.writeHead(500);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  config.rpcUrl = `http://127.0.0.1:${server.address().port}`;
  const transfer = await createLiveChain(config).confirm({
    hash,
    from: "treasury",
    to: "a",
    amountRaw: "250000",
    kind: "transfer",
  });
  assert.equal(transfer.blockHash, canonical);
  assert.equal(transfer.logIndex, 7);
  assert.ok(receiptRequests >= 2);
});
