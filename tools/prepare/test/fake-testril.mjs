import { createServer } from "node:http";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { batchDomain, channelTypes, voucherTypes } from "../operator.mjs";

// Public deterministic test key. Never fund this account.
export const operatorKey = `0x${"0".repeat(63)}1`;
export const operatorAddress = privateKeyToAccount(operatorKey).address;
export const network = "eip155:84532";
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const receiver = "0x1111111111111111111111111111111111111111";
const materializeRate = 120n;
const readBase = 20n;

const success = (value) => ({ outcome: "success", ...value });
const kindOf = (args) =>
  ["hour", "day", "month"].find((k) => `from_${k}` in args) ?? "block";

function rowsFor(args) {
  const kind = kindOf(args);
  if (kind === "block") {
    const rows = [];
    for (let block = args.from_block; block < args.to_block; block += 1)
      rows.push({ block });
    return rows;
  }
  return [{ [kind]: args[`from_${kind}`] }];
}

function blocksIn(args) {
  const kind = kindOf(args);
  if (kind === "block") return BigInt(args.to_block - args.from_block);
  return 7200n;
}

const within = (kind, args, range) =>
  range[`from_${kind}`] <= args[`from_${kind}`] &&
  range[`to_${kind}`] >= args[`to_${kind}`];

export function fakeTestril({ channelBalance = "1000000" } = {}) {
  const calls = [];
  const bound = new Map();
  const jobs = new Map();
  const channelConfig = {
    payer: operatorAddress,
    payerAuthorizer: operatorAddress,
    receiver,
    receiverAuthorizer: "0x2222222222222222222222222222222222222222",
    token: usdc,
    withdrawDelay: 3600,
    salt: `0x${"0".repeat(64)}`,
  };
  const channel = {
    channelId: hashTypedData({
      domain: batchDomain(network),
      types: channelTypes,
      primaryType: "ChannelConfig",
      message: channelConfig,
    }),
    network,
    channelConfig,
    balance: channelBalance,
    chargedCumulativeAmount: "0",
    closed: false,
  };

  function quote(charge) {
    return {
      outcome: "payment_required",
      error: "payment_required",
      x402Version: 2,
      accepts: [
        {
          scheme: "batch-settlement",
          network,
          asset: usdc,
          amount: charge.toString(),
          payTo: receiver,
          maxTimeoutSeconds: 120,
          extra: {
            name: "USDC",
            version: "2",
            receiverAuthorizer: channelConfig.receiverAuthorizer,
            withdrawDelay: 3600,
          },
        },
      ],
    };
  }

  async function settle(payment, charge) {
    const voucher = payment.payload.voucher;
    const signer = await recoverTypedDataAddress({
      domain: batchDomain(payment.accepted.network),
      types: voucherTypes,
      primaryType: "Voucher",
      message: {
        channelId: voucher.channelId,
        maxClaimableAmount: BigInt(voucher.maxClaimableAmount),
      },
      signature: voucher.signature,
    });
    if (
      signer !== operatorAddress ||
      voucher.channelId !== channel.channelId ||
      BigInt(voucher.maxClaimableAmount) !==
        BigInt(channel.chargedCumulativeAmount) + charge
    )
      throw new Error("The fake rejected the voucher.");
    channel.chargedCumulativeAmount = voucher.maxClaimableAmount;
    return {
      success: true,
      network,
      payer: operatorAddress,
      extra: { chargedAmount: charge.toString() },
    };
  }

  async function call(name, args, payment) {
    calls.push({ name, args, paid: Boolean(payment) });
    if (name === "inspect") {
      if (args.subject === "chains")
        return success({
          chains: [
            {
              chain_id: 1,
              blocks_per_day: 7200,
              head: { block: 26327244, time: "2026-11-02T12:57:47Z" },
            },
            { chain_id: 42161, blocks_per_day: 321190 },
          ],
        });
      if (args.subject === "pricing")
        return success({
          rates: [
            {
              label: "materialize_blocks",
              unit_price: { atoms: materializeRate.toString() },
            },
          ],
        });
      if (args.subject === "channels") return success({ channels: [channel] });
      if (args.subject === "bound_function")
        return success(bound.get(args.bound_function_id));
      if (args.subject === "job") {
        const job = jobs.get(args.job_id);
        if (job.state !== "done") {
          job.state = "done";
          const card = bound.get(job.id);
          card.materializing = card.materializing.filter(
            (r) => r.job_id !== args.job_id,
          );
          card.materialized.push(job.range);
        }
        return success({ job_id: args.job_id, state: job.state });
      }
    }
    if (name === "bind") {
      const id = `sha256:${Buffer.from(JSON.stringify(args)).toString("hex").slice(0, 64)}`;
      if (!bound.has(id))
        bound.set(id, {
          bound_function_id: id,
          function_slug: args.function_slug,
          materialized: [],
          materializing: [],
        });
      return success({ bound_function_id: id });
    }
    const card = bound.get(args.bound_function_id);
    const kind = kindOf(args);
    const charge =
      name === "materialize"
        ? blocksIn(args) * materializeRate
        : readBase + blocksIn(args);
    if (
      name === "read" &&
      !card.materialized.some((range) => within(kind, args, range))
    )
      return { outcome: "error", kind: "range_unavailable" };
    if (!payment) return quote(charge);
    const settlement = await settle(payment, charge);
    if (name === "materialize") {
      const jobId = `job:${jobs.size + 1}`;
      const range = {
        [`from_${kind}`]: args[`from_${kind}`],
        [`to_${kind}`]: args[`to_${kind}`],
      };
      jobs.set(jobId, { id: card.bound_function_id, range, state: "running" });
      card.materializing.push({ ...range, job_id: jobId });
      return {
        ...success({ result: "materializing", job: { job_id: jobId } }),
        settlement,
      };
    }
    return { ...success({ values: rowsFor(args) }), settlement };
  }

  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    if (!text) {
      response.writeHead(405);
      return response.end();
    }
    const input = JSON.parse(text);
    if (input.id === undefined) {
      response.writeHead(202);
      return response.end();
    }
    let result;
    if (input.method === "initialize")
      result = {
        protocolVersion: input.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fake-testril", version: "1" },
      };
    else {
      const { settlement, ...value } = await call(
        input.params.name,
        input.params.arguments,
        input.params._meta?.["x402/payment"],
      );
      result = {
        isError: value.outcome === "payment_required",
        structuredContent: value,
        content: [{ type: "text", text: JSON.stringify(value) }],
        ...(settlement
          ? { _meta: { "x402/payment-response": settlement } }
          : {}),
      };
      if (value.outcome === "payment_required")
        result.content.push({
          type: "text",
          text: JSON.stringify({ quote_id: "quote:test", lines: [] }),
        });
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }));
  });

  return {
    calls,
    channel,
    async listen() {
      await new Promise((done) => server.listen(0, "127.0.0.1", done));
      return `http://127.0.0.1:${server.address().port}/mcp`;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}
