import { createServer } from "node:http";
import { recoverTypedDataAddress } from "viem";

const network = "eip155:84532";
const materializeRate = 120;
const readRate = 20;

// x402 batch-settlement voucher domain, as Testril's escrow verifies it.
const voucherDomain = {
  name: "x402 Batch Settlement",
  version: "1",
  chainId: 84532,
  verifyingContract: "0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003",
};
const voucherTypes = {
  Voucher: [
    { name: "channelId", type: "bytes32" },
    { name: "maxClaimableAmount", type: "uint128" },
  ],
};

// A fake chain: one block every 12 s, block 26316189 at 2026-11-01T00:00:00Z.
const anchorBlock = 26316189;
const anchorMs = Date.parse("2026-11-01T00:00:00Z");
const blockMs = 12000;
const periodMs = { hour: 3600000, day: 86400000 };
const retiredFields = ["from_hour", "from_day", "from_month"];

export function blockAt(time) {
  return anchorBlock + Math.ceil((Date.parse(time) - anchorMs) / blockMs);
}

function blockRange(window) {
  return "from_time" in window
    ? [blockAt(window.from_time), blockAt(window.to_time)]
    : [window.from_block, window.to_block];
}

const blocksIn = (window) => {
  const [from, to] = blockRange(window);
  return to - from;
};

function monthsBetween(from, to) {
  const months = (time) =>
    new Date(time).getUTCFullYear() * 12 + new Date(time).getUTCMonth();
  return months(to) - months(from);
}

function jobSize(bind, window) {
  const by = bind.params.by;
  if (!by) return { unit: "blocks", total: blocksIn(window) };
  const span = Date.parse(window.to_time) - Date.parse(window.from_time);
  const total =
    by === "month"
      ? monthsBetween(window.from_time, window.to_time)
      : span / periodMs[by];
  return { unit: `${by}s`, total };
}

function defaultRows(bind, window) {
  if (bind.params.by)
    return [{ [bind.params.by]: window.from_time.slice(0, 10) }];
  const [from, to] = blockRange(window);
  return Array.from({ length: to - from }, (_, i) => ({ block: from + i }));
}
const key = (id, window) => `${id} ${JSON.stringify(window)}`;
const windowOf = ({ bound_function_id: _, ...window }) => window;

function quote(amount, tool) {
  return {
    x402Version: 2,
    error: "payment_required",
    resource: { url: `mcp://tool/${tool}`, mimeType: "application/json" },
    accepts: [
      {
        scheme: "batch-settlement",
        network,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: String(amount),
        payTo: "0x4559A18661B816F05220C053A551172eD3015e52",
        maxTimeoutSeconds: 3600,
        extra: {
          name: "USDC",
          version: "2",
          minDeposit: "10000",
          receiverAuthorizer: "0x91b0959aee451c0001a05dc0bf5bfdc9f60f086b",
          withdrawDelay: 3600,
        },
      },
    ],
  };
}

export function fakeTestril({
  payer,
  rows = defaultRows,
  indexed = [],
  busy = [],
}) {
  const bound = new Map();
  const calls = [];
  const charges = [];
  const covered = new Set();
  const jobs = new Map();
  const polls = new Map();
  const served = new Set();

  async function verify(payment, amount) {
    const { voucher } = payment.payload;
    const signer = await recoverTypedDataAddress({
      domain: voucherDomain,
      types: voucherTypes,
      primaryType: "Voucher",
      message: {
        channelId: voucher.channelId,
        maxClaimableAmount: BigInt(voucher.maxClaimableAmount),
      },
      signature: voucher.signature,
    });
    if (payment.payload.type !== "voucher" || signer !== payer)
      throw new Error("The fake rejected the payment.");
    if (BigInt(voucher.maxClaimableAmount) < BigInt(amount))
      throw new Error("The fake rejected a voucher below the charge.");
  }

  async function answer(tool, args, payment) {
    calls.push({ tool, args, paid: Boolean(payment) });
    if (tool === "bind") {
      const id = `sha256:${args.function_slug}:${JSON.stringify(args.params)}`;
      bound.set(id, args);
      return { outcome: "success", bound_function_id: id };
    }
    if (tool === "inspect") {
      const job = jobs.get(args.job_id);
      const poll = (polls.get(args.job_id) ?? 0) + 1;
      polls.set(args.job_id, poll);
      const finished = poll > 1;
      if (finished && job.key) covered.add(job.key);
      return {
        outcome: "success",
        state: finished ? "done" : "running",
        [`${job.unit}_done`]: finished ? job.total : Math.floor(job.total / 2),
        [`${job.unit}_total`]: job.total,
      };
    }
    const id = args.bound_function_id;
    const bind = bound.get(id);
    const window = windowOf(args);
    const retired = retiredFields.find((field) => field in window);
    if (retired)
      return {
        outcome: "error",
        kind: "invalid_params",
        message: `\`${tool}\` takes no field \`${retired}\``,
      };
    if (tool === "materialize") {
      const busyJob = busy.find(
        (b) => b.function_slug === bind.function_slug && !served.has(b),
      );
      if (busyJob) {
        served.add(busyJob);
        jobs.set(busyJob.job_id, {
          key: busyJob.partial ? undefined : key(id, window),
          ...jobSize(bind, window),
        });
        return {
          outcome: "error",
          kind: "state",
          remedy: [
            {
              call: {
                tool: "inspect",
                arguments: { subject: "job", job_id: busyJob.job_id },
              },
            },
          ],
        };
      }
      if (indexed.includes(bind.function_slug) || covered.has(key(id, window)))
        return {
          outcome: "error",
          kind: "state",
          remedy: [{ call: { tool: "read", arguments: args } }],
        };
    }
    const amount =
      tool === "materialize"
        ? blocksIn(window) * materializeRate
        : readRate + blocksIn(window);
    if (!payment) return quote(amount, tool);
    await verify(payment, amount);
    charges.push({ tool, amount });
    const receipt = {
      state: "paid",
      amount: { atoms: String(amount), currency: "usage_credits" },
    };
    if (tool === "materialize") {
      const jobId = `job:${jobs.size + 1}`;
      jobs.set(jobId, { key: key(id, window), ...jobSize(bind, window) });
      return { outcome: "success", job: { job_id: jobId }, receipt };
    }
    return { outcome: "success", values: rows(bind, window), receipt };
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
      const { name, arguments: args, _meta } = input.params;
      const value = await answer(name, args, _meta?.["x402/payment"]);
      const paid = value.receipt !== undefined;
      result = {
        isError: value.error === "payment_required",
        structuredContent: value,
        content: [{ type: "text", text: JSON.stringify(value) }],
        ...(paid && {
          _meta: {
            "x402/payment-response": {
              success: true,
              network,
              payer: payer.toLowerCase(),
              transaction: "",
              extra: { chargedAmount: "0" },
            },
          },
        }),
      };
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }));
  });

  return {
    calls,
    charges,
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
