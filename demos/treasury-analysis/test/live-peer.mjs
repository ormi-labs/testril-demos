import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { liveConfig, sameAddress } from "../src/live-config.mjs";
import { connectMcp } from "../src/mcp.mjs";
import { createLiveDemo } from "../src/live-demo.mjs";

// Public throwaway keys, used only by the local HTTP peer.
export function testConfig() {
  const env = {
    TESTRIL_CHARGE_CAP_USDC: "0.1",
    TESTRIL_ESCROW_CAP_USDC: "0.1",
  };
  for (const [i, key, address] of [
    [1, "TREASURY_PRIVATE_KEY", "TREASURY_ADDRESS"],
    [2, "COUNTERPARTY_A_PRIVATE_KEY", "COUNTERPARTY_A_ADDRESS"],
    [3, "COUNTERPARTY_B_PRIVATE_KEY", "COUNTERPARTY_B_ADDRESS"],
    [4, "TESTRIL_PAYER_PRIVATE_KEY", "TESTRIL_PAYER_ADDRESS"],
  ]) {
    env[key] = `0x${String(i).padStart(64, "0")}`;
    env[address] = privateKeyToAccount(env[key]).address;
  }
  return { env, config: liveConfig(env) };
}

export async function livePeer(t, options = {}) {
  const { config, env } = testConfig();
  const calls = [];
  const functions = new Map();
  const quotes = new Map();
  const covered = new Set();
  const channels = [];
  const records = new Map();
  let block = 100;
  let prepares = 0;
  let uncertain = false;
  let missReceipt = false;
  let headLag = options.headLagAfterTransfer ?? 0;
  const balances = {
    treasury: "20000000",
    a: "500000",
    b: "0",
    ...options.balances,
  };
  const snapshots = new Map();
  const address = (id) => config.wallets.find((w) => w.id === id).address;
  async function captureSnapshot(at = block) {
    if (!snapshots.has(at)) snapshots.set(at, { ...balances });
    return {
      block: at,
      blockHash: `0x${String(at).padStart(64, "0")}`,
      timestamp: new Date(at * 1000).toISOString(),
      balances: { ...snapshots.get(at) },
    };
  }
  const chain = {
    async prepare(from, to, amountRaw) {
      if (BigInt(amountRaw) > BigInt(balances[from]))
        throw new Error("RPC gas estimation: insufficient USDC balance.");
      prepares++;
      return {
        hash: `0x${String(prepares + 1000).padStart(64, "0")}`,
        serialized: "0xfake",
        from,
        to,
        amountRaw,
      };
    },
    async broadcast(pending) {
      if (records.has(pending.hash)) return;
      balances[pending.from] = (
        BigInt(balances[pending.from]) - BigInt(pending.amountRaw)
      ).toString();
      balances[pending.to] = (
        BigInt(balances[pending.to]) + BigInt(pending.amountRaw)
      ).toString();
      block++;
      const snapshot = await captureSnapshot();
      records.set(pending.hash, {
        ...pending,
        ...snapshot,
        id: pending.hash,
        transactionHash: pending.hash,
        logIndex: 7,
      });
    },
    async confirm(pending) {
      if (missReceipt) {
        missReceipt = false;
        throw new Error(
          "The transfer is pending. Refresh before sending again.",
        );
      }
      const record = { ...records.get(pending.hash) };
      delete record.serialized;
      delete record.balances;
      return record;
    },
  };
  async function tool(name, args) {
    calls.push({ name, args });
    await options.beforeTool?.(name, args);
    if (name === "bind") {
      const id = JSON.stringify([args.function_slug, args.params]);
      functions.set(id, args);
      return { outcome: "success", bound_function_id: id };
    }
    if (name === "inspect") {
      if (args.subject === "chain") {
        await captureSnapshot();
        return {
          outcome: "success",
          subject: "chain",
          chain_id: 84532,
          head: options.unavailableHead
            ? null
            : block > 100 && headLag-- > 0
              ? block - 1
              : block,
        };
      }

      if (args.subject === "channels") return { outcome: "success", channels };
      if (args.subject === "job") return { outcome: "success", state: "done" };
    }
    if (name === "provenance")
      return {
        outcome: "success",
        computation: { kind: "function", id: "test", version: 1 },
        sources: [],
      };
    if (name === "pay_quote") {
      if (uncertain) {
        uncertain = false;
        throw new Error("uncertain settlement");
      }
      const payload = JSON.parse(args.payload).payload;
      const quote = quotes.get(args.quote_id);
      if (payload.deposit)
        channels.push({
          channelId: payload.voucher.channelId,
          network: "eip155:84532",
          channelConfig: payload.channelConfig,
          balance: payload.deposit.amount,
          chargedCumulativeAmount: "0",
          closed: false,
        });
      const channel = channels.find(
        (c) => c.channelId === payload.voucher.channelId,
      );
      if (
        BigInt(payload.voucher.maxClaimableAmount) !==
        BigInt(channel.chargedCumulativeAmount) + BigInt(quote.amount)
      )
        throw new Error("Incorrect cumulative voucher.");
      channel.chargedCumulativeAmount = payload.voucher.maxClaimableAmount;
      quote.paymentId = `paid:${args.quote_id}`;
      return { outcome: "success", payment_id: quote.paymentId };
    }
    if (name === "materialize" || name === "read") {
      if (args.payment_id) {
        const quote = [...quotes.values()].find(
          (q) => q.paymentId === args.payment_id,
        );
        const work = quote.args;
        if (name === "materialize") {
          covered.add(JSON.stringify(work));
          return {
            outcome: "success",
            result: "materializing",
            job: { job_id: "job:1" },
          };
        }
        const definition = functions.get(work.bound_function_id);
        const snapshot = snapshots.get(work.from_block);
        const values =
          definition.function_slug === "erc20.token_balance"
            ? config.wallets
                .filter((w) =>
                  sameAddress(w.address, definition.params.owners[0]),
                )
                .flatMap((w) =>
                  snapshot[w.id] === "0"
                    ? []
                    : [
                        {
                          block: work.from_block,
                          token: config.token.address,
                          balance: snapshot[w.id],
                        },
                      ],
                )
            : [...records.values()]
                .filter((r) => r.block === work.from_block)
                .map((r) => ({
                  block: r.block,
                  from: address(r.from),
                  to: address(r.to),
                  amount: r.amountRaw,
                  count: "1",
                }));
        return { outcome: "success", values };
      }
      if (name === "read" && !covered.has(JSON.stringify(args)))
        return { outcome: "error", kind: "range_unavailable" };
      const id = `quote:${quotes.size + 1}`;
      const amount = String(name === "materialize" ? 120 : 21);
      quotes.set(id, { args, amount });
      return {
        outcome: "payment_required",
        quote_id: id,
        lines: [{ label: name, units: 1, unit_price: Number(amount) / 1e6 }],
        accepts: [
          {
            scheme: "batch-settlement",
            network: options.network ?? "eip155:84532",
            asset: config.token.address,
            amount,
            payTo: address("treasury"),
            extra: {
              name: "USDC",
              version: "2",
              withdrawDelay: 3600,
              receiverAuthorizer: address("a"),
            },
          },
        ],
      };
    }
    throw new Error(`Unexpected tool ${name}`);
  }
  const server = createServer(async (request, response) => {
    if (request.method === "DELETE") {
      response.writeHead(200);
      response.end();
      return;
    }
    if (request.method === "GET") {
      response.writeHead(405);
      response.end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    if (message.id === undefined) {
      response.writeHead(202);
      response.end();
      return;
    }
    let result;
    if (message.method === "initialize")
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "local-peer", version: "1" },
      };
    else {
      try {
        const value = await tool(message.params.name, message.params.arguments);
        result = {
          content: [{ type: "text", text: JSON.stringify(value) }],
          structuredContent: value,
          isError: false,
        };
      } catch {
        response.destroy();
        return;
      }
    }
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Mcp-Session-Id": "local-peer-session",
    });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const directory = await mkdtemp(join(tmpdir(), "live-demo-test-"));
  config.mcpUrl = `http://127.0.0.1:${server.address().port}/mcp`;
  t.after(async () => {
    await demo.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  let demo = await createLiveDemo({
    config,
    chain,
    mcp: await connectMcp(config.mcpUrl),
    directory,
  });
  return {
    env,
    config,
    chain,
    calls,
    directory,
    balances,
    channels,
    get demo() {
      return demo;
    },
    get prepares() {
      return prepares;
    },
    advanceBlock() {
      block++;
    },
    failNextPayment() {
      uncertain = true;
    },
    delayNextReceipt() {
      missReceipt = true;
    },
    async restart() {
      await demo.close();
      demo = await createLiveDemo({
        config,
        chain,
        mcp: await connectMcp(config.mcpUrl),
        directory,
      });
    },
  };
}
