import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { encodeEventTopics, erc20Abi } from "viem";
import { createLiveChain } from "../src/live-chain.mjs";
import { testConfig } from "./live-peer.mjs";

for (const missingBlocks of [0, 1])
  test(
    missingBlocks
      ? "confirmation retries a receipt whose block is temporarily unavailable"
      : "one confirmation records the canonical receipt without waiting for the next block",
    { timeout: 5000 },
    async (t) => {
      const { config } = testConfig();
      const hash = `0x${"aa".repeat(32)}`;
      const early = `0x${"bb".repeat(32)}`;
      const canonical = `0x${"cc".repeat(32)}`;
      let receiptRequests = 0;
      let blockRequests = 0;
      const topics = encodeEventTopics({
        abi: erc20Abi,
        eventName: "Transfer",
        args: {
          from: config.wallets[0].address,
          to: config.wallets[1].address,
        },
      });
      const server = createServer(async (request, response) => {
        let body = "";
        for await (const part of request) body += part;
        const message = JSON.parse(body);
        let result;
        if (message.method === "eth_blockNumber") result = "0x64";
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
          result =
            blockRequests++ < missingBlocks
              ? null
              : {
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
        response.end(
          JSON.stringify({ jsonrpc: "2.0", id: message.id, result }),
        );
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
      assert.ok(receiptRequests >= 2 + missingBlocks);
      assert.equal(blockRequests, 1 + missingBlocks);
    },
  );

for (const outcome of ["accepted", "already-known", "rejected"])
  test(`broadcast reports ${outcome} without hiding an unacknowledged submission`, async (t) => {
    const { config } = testConfig();
    const hash = `0x${"aa".repeat(32)}`;
    const methods = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const message = JSON.parse(body);
      methods.push(message.method);
      let result;
      if (message.method === "eth_sendRawTransaction") {
        if (outcome !== "accepted") {
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32000,
                message: "Provider refused the request; private payload",
              },
            }),
          );
          return;
        }
        result = hash;
      } else if (message.method === "eth_getTransactionByHash") {
        result =
          outcome === "already-known"
            ? {
                hash,
                blockNumber: null,
                blockHash: null,
                transactionIndex: null,
                from: config.wallets[0].address,
                to: config.token.address,
                nonce: "0x0",
                gas: "0x10000",
                gasPrice: "0x1",
                value: "0x0",
                input: "0x",
                type: "0x0",
                v: "0x1",
                r: "0x1",
                s: "0x1",
              }
            : null;
      } else throw new Error("Unexpected RPC method");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    config.rpcUrl = `http://127.0.0.1:${server.address().port}`;
    const pending = { hash, serialized: "0x1234" };
    const broadcast = createLiveChain(config).broadcast(pending);
    if (outcome === "rejected")
      await assert.rejects(
        broadcast,
        (error) =>
          /did not acknowledge/.test(error.message) &&
          !error.message.includes("private payload") &&
          !error.message.includes(pending.serialized),
      );
    else await broadcast;
    assert.deepEqual(
      methods,
      outcome === "accepted"
        ? ["eth_sendRawTransaction"]
        : ["eth_sendRawTransaction", "eth_getTransactionByHash"],
    );
  });
