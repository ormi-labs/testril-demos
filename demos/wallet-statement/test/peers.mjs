import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import {
  hashDomain,
  hashTypedData,
  recoverTypedDataAddress,
  keccak256,
  encodeAbiParameters,
} from "viem";
import { digest } from "../public/verification.js";
import { scope, decimal, usdc, summary } from "../public/model.js";
import {
  batchDomain,
  channelTypes,
  voucherTypes,
  collector,
} from "../public/payments.js";

// Public, deterministic test identity. Never fund this account.
export const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
export const domainTypes = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];
export const tokenDomain = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: usdc,
};
const authFields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];
export const separator = hashDomain({
  domain: tokenDomain,
  types: { EIP712Domain: domainTypes },
});
export function wallet() {
  return {
    async request({ method, params }) {
      if (["eth_accounts", "eth_requestAccounts"].includes(method))
        return [account.address];
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") return "0x6000";
      if (method === "eth_call") return separator;
      if (method === "eth_signTypedData_v4")
        return account.signTypedData(JSON.parse(params[1]));
      throw new Error("Unexpected wallet method");
    },
  };
}
export async function listen(server) {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${server.address().port}`;
}
export async function close(server) {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}

export async function peers({
  bindingRefusal = false,
  rpcFailure = false,
  rpcChain = "0x1",
  dailyTransactions,
  fullDayProvenance = false,
  omitReceipt = false,
  network = "eip155:8453",
  mismatch = false,
  counterpartyPageSize = 1000,
  duplicateCounterparty = false,
  missingTokenAmounts = false,
  invalidDailySource = false,
} = {}) {
  const records = {};
  for (const h of [12, 13])
    records[h] = JSON.parse(
      await readFile(
        new URL(`../recordings/hour-${h}.json`, import.meta.url),
        "utf8",
      ),
    );
  // The daily peer intentionally reuses a small ledger. Only its advertised
  // window changes; this is synthetic test data, never a production recording.
  records.day = structuredClone(records[12]);
  Object.assign(records.day.scope, scope());
  Object.assign(records.day.providers.testril.provenance, {
    from_block: scope().from_block,
    to_block: scope().to_block,
  });
  if (dailyTransactions) {
    const seed = records.day.providers.testril.rows;
    records.day.providers.testril.rows = Array.from(
      { length: dailyTransactions },
      (_, i) => ({
        ...seed[i % seed.length],
        tx: `0x${(i + 1).toString(16).padStart(64, "0")}`,
      }),
    );
  }
  const daily = new Map();
  async function reportRecord(fromTime) {
    if (!fromTime?.includes("T00:"))
      return records[Number(fromTime?.slice(11, 13) ?? 12)];
    const date = fromTime.slice(0, 10);
    if (!daily.has(date)) {
      const record = structuredClone(records.day);
      const offset =
        Math.round((Date.parse(date) - Date.parse("2026-11-10")) / 86400000) *
        7173;
      Object.assign(record.scope, scope(date), {
        from_block: 26380784 + offset,
        to_block: 26387957 + offset,
      });
      record.providers.testril.rows.forEach((row) => (row.block += offset));
      const provenance = record.providers.testril.provenance;
      provenance.from_block += offset;
      provenance.to_block += offset;
      provenance.blocks.forEach((block) => (block.number += offset));
      if (fullDayProvenance) {
        provenance.blocks = Array.from({ length: 7173 }, (_, i) => ({
          number: record.scope.from_block + i,
          block_hash: `0x${(record.scope.from_block + i).toString(16).padStart(64, "0")}`,
        }));
        provenance.block_count = provenance.blocks.length;
      }
      provenance.digest = await digest(1, provenance.blocks);
      daily.set(date, record);
    }
    return daily.get(date);
  }
  const id = records[12].scope.bound_function_id;
  const totalsId = `sha256:${"cc".repeat(32)}`;
  const calls = [],
    channels = [];
  let prepared = false;
  const receipt = (amount) => ({
    success: true,
    network,
    payer: account.address,
    transaction: `0x${"ab".repeat(32)}`,
    extra: { chargedAmount: amount },
  });
  const challenge = (scheme, amount) => ({
    x402Version: 2,
    error: "payment_required",
    resource: { url: "https://provider.invalid/data" },
    accepts: [
      {
        scheme,
        amount,
        network,
        asset: usdc,
        payTo: "0x1111111111111111111111111111111111111111",
        maxTimeoutSeconds: scheme === "exact" ? 300 : 3600,
        extra: {
          name: "USD Coin",
          version: "2",
          ...(scheme === "batch-settlement"
            ? {
                receiverAuthorizer:
                  "0x2222222222222222222222222222222222222222",
                withdrawDelay: 3600,
                minDeposit: "10000",
              }
            : {}),
        },
      },
    ],
  });
  async function signer(data, signature) {
    if (
      (await recoverTypedDataAddress({ ...data, signature })).toLowerCase() !==
      account.address.toLowerCase()
    )
      throw new Error("Bad test signature");
  }
  async function batch(payment, amount) {
    const p = payment.payload;
    if (
      hashTypedData({
        domain: batchDomain,
        types: channelTypes,
        primaryType: "ChannelConfig",
        message: p.channelConfig,
      }) !== p.voucher.channelId
    )
      throw new Error("Wrong channel");
    await signer(
      {
        domain: batchDomain,
        types: voucherTypes,
        primaryType: "Voucher",
        message: {
          channelId: p.voucher.channelId,
          maxClaimableAmount: p.voucher.maxClaimableAmount,
        },
      },
      p.voucher.signature,
    );
    if (
      BigInt(p.voucher.maxClaimableAmount) !==
      BigInt(channels[0]?.chargedCumulativeAmount ?? "0") + BigInt(amount)
    )
      throw new Error("Wrong cumulative amount");
    if (p.deposit) {
      const a = p.deposit.authorization.erc3009Authorization;
      if (a.to !== collector || a.value !== "10000")
        throw new Error("Wrong deposit");
      await signer(
        {
          domain: tokenDomain,
          types: { ReceiveWithAuthorization: authFields },
          primaryType: "ReceiveWithAuthorization",
          message: {
            from: a.from,
            to: a.to,
            value: a.value,
            validAfter: a.validAfter,
            validBefore: a.validBefore,
            nonce: keccak256(
              encodeAbiParameters(
                [{ type: "bytes32" }, { type: "bytes32" }],
                [p.voucher.channelId, a.salt],
              ),
            ),
          },
        },
        a.signature,
      );
    }
    channels.splice(0, channels.length, {
      channelId: p.voucher.channelId,
      channelConfig: p.channelConfig,
      network,
      closed: false,
      balance: "10000",
      chargedCumulativeAmount: p.voucher.maxClaimableAmount,
    });
  }
  async function tool(name, args, payment) {
    calls.push({ provider: "testril", name, args, paid: Boolean(payment) });
    if (name === "bind")
      return bindingRefusal
        ? { outcome: "error", kind: "invalid_params" }
        : {
            outcome: "success",
            bound_function_id:
              args.function_slug === "erc20.wallet_counterparties"
                ? totalsId
                : id,
          };
    if (name === "inspect")
      return args.subject === "channels"
        ? { outcome: "success", channels }
        : args.subject === "job"
          ? {
              outcome: "success",
              state: "done",
              blocks_total: 299,
              blocks_done: 299,
            }
          : {
              outcome: "success",
              materialized: prepared ? [[26384371, 26384969]] : [],
              active_jobs: [],
              dependencies:
                args.bound_function_id === totalsId
                  ? [
                      {
                        function_slug: "erc20.wallet_transfers",
                        bound_function_id: id,
                      },
                    ]
                  : [],
            };
    if (name === "read" && !prepared)
      return { outcome: "error", kind: "range_unavailable", materializing: [] };
    const amount =
      name === "materialize" ? "120" : name === "provenance" ? "17" : "23";
    if (!payment) return challenge("batch-settlement", amount);
    await batch(payment, amount);
    if (name === "materialize") prepared = true;
    const record = await reportRecord(args.from_time);
    let value;
    if (name === "materialize")
      value = { outcome: "success", job: { job_id: "job:1" } };
    else if (args.bound_function_id === totalsId) {
      value =
        name === "provenance"
          ? {
              outcome: "success",
              bound_function_id: totalsId,
              chain_id: 1,
              from_time: args.from_time,
              to_time: args.to_time,
              computation: {
                kind: "function",
                id: "erc20.wallet_counterparties",
                version: 1,
              },
              sources: [
                {
                  kind: "rows",
                  chain_id: 1,
                  bound_function_id: invalidDailySource
                    ? `sha256:${"ff".repeat(32)}`
                    : id,
                  from_block: record.scope.from_block,
                  to_block: record.scope.to_block,
                },
              ],
            }
          : {
              outcome: "success",
              values: summary(record.providers.testril.rows).counterparties.map(
                (r) => ({
                  day: args.from_time.slice(0, 10),
                  token: record.scope.token,
                  counterparty: r.address,
                  transfers: String(r.transfers),
                  received: r.incoming,
                  sent: r.outgoing,
                }),
              ),
            };
    } else
      value =
        name === "provenance"
          ? record.providers.testril.provenance
          : {
              outcome: "success",
              values: record.providers.testril.rows.map(
                ({ from, to, ...row }) => ({
                  ...row,
                  counterparty: from === record.scope.wallet ? to : from,
                  direction:
                    from === to
                      ? "self"
                      : from === record.scope.wallet
                        ? "out"
                        : "in",
                }),
              ),
            };
    return {
      value,
      receipt: omitReceipt ? null : receipt(amount),
    };
  }
  const mcp = createServer(async (req, res) => {
    let text = "";
    for await (const part of req) text += part;
    if (!text) {
      res.writeHead(405);
      res.end();
      return;
    }
    const input = JSON.parse(text);
    if (input.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }
    let result;
    try {
      if (input.method === "initialize")
        result = {
          protocolVersion: input.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "test", version: "1" },
        };
      else if (input.method === "tools/list")
        result = {
          tools: ["bind", "inspect", "read", "materialize", "provenance"].map(
            (name) => ({
              name,
              inputSchema: { type: "object", additionalProperties: true },
            }),
          ),
        };
      else {
        const reply = await tool(
          input.params.name,
          input.params.arguments,
          input.params._meta?.["x402/payment"],
        );
        const data = reply.value ?? reply;
        result = {
          structuredContent: data,
          content: [{ type: "text", text: JSON.stringify(data) }],
          ...(reply.receipt
            ? { _meta: { "x402/payment-response": reply.receipt } }
            : {}),
        };
        if (data.x402Version) {
          result.isError = true;
          result.content.push({
            type: "text",
            text: JSON.stringify({
              amount: { atoms: data.accepts[0].amount },
              lines: [],
            }),
          });
        }
      }
    } catch {
      result = {
        isError: true,
        structuredContent: { outcome: "error", kind: "test_peer_rejected" },
        content: [{ type: "text", text: "Test payment rejected" }],
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }));
  });
  const nansen = createServer(async (req, res) => {
    let text = "";
    for await (const part of req) text += part;
    const body = JSON.parse(text),
      encoded = req.headers["payment-signature"];
    const totals = req.url.endsWith("/counterparties");
    calls.push({
      provider: "nansen",
      name: totals ? "counterparties" : "transactions",
      body,
      paid: Boolean(encoded),
    });
    try {
      if (!encoded) {
        res.writeHead(402, {
          "payment-required": Buffer.from(
            JSON.stringify(challenge("exact", "10000")),
          ).toString("base64"),
        });
        res.end("{}");
        return;
      }
      const payment = JSON.parse(Buffer.from(encoded, "base64").toString()),
        auth = payment.payload.authorization;
      if (
        auth.value !== "10000" ||
        Number(auth.validBefore) - Date.now() / 1000 < 150
      )
        throw new Error("Wrong price or short Nansen validity");
      await signer(
        {
          domain: tokenDomain,
          types: { TransferWithAuthorization: authFields },
          primaryType: "TransferWithAuthorization",
          message: auth,
        },
        payment.payload.signature,
      );
      const record = await reportRecord(body.date.from),
        byTx = new Map();
      if (totals) {
        const rows = summary(record.providers.testril.rows).counterparties;
        const page = body.pagination.page;
        const selected = rows.slice(
          (page - 1) * counterpartyPageSize,
          page * counterpartyPageSize,
        );
        if (duplicateCounterparty && page > 1) selected[0] = rows[0];
        if (!omitReceipt)
          res.setHeader(
            "payment-response",
            Buffer.from(JSON.stringify(receipt("10000"))).toString("base64"),
          );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            pagination: {
              page,
              per_page: 1000,
              is_last_page: page * counterpartyPageSize >= rows.length,
            },
            data: selected.map((r, index) => ({
              counterparty_address: r.address,
              tokens_info: [
                {
                  token_address: "0x0000000000000000000000000000000000000001",
                  num_transfer: "999999",
                },
                {
                  token_address: record.scope.token,
                  num_transfer: String(
                    r.transfers + (mismatch && index === 0 ? 1 : 0),
                  ),
                  ...(!missingTokenAmounts && {
                    token_in_amount: decimal(r.incoming),
                    token_out_amount: decimal(r.outgoing),
                  }),
                },
              ],
            })),
          }),
        );
        return;
      }
      for (const [index, row] of record.providers.testril.rows.entries()) {
        const tx = byTx.get(row.tx) ?? {
          chain: "ethereum",
          transaction_hash: row.tx,
          block_timestamp: body.date.from,
          tokens_sent: [],
          tokens_received: [],
        };
        tx[row.from === body.address ? "tokens_sent" : "tokens_received"].push({
          token_address: row.token,
          token_amount: decimal(
            (
              BigInt(row.value) + (mismatch && index === 0 ? 1n : 0n)
            ).toString(),
          ),
          from_address: row.from,
          to_address: row.to,
        });
        byTx.set(row.tx, tx);
      }
      const page = body.pagination.page,
        values = [...byTx.values()];
      if (!omitReceipt)
        res.setHeader(
          "payment-response",
          Buffer.from(JSON.stringify(receipt("10000"))).toString("base64"),
        );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          pagination: {
            page,
            per_page: 100,
            is_last_page: page * 100 >= values.length,
          },
          data: values.slice((page - 1) * 100, page * 100),
        }),
      );
    } catch {
      res.writeHead(400);
      res.end("{}");
    }
  });
  const rpcCalls = [];
  const rpc = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const input = JSON.parse(body);
    rpcCalls.push(input);
    if (rpcFailure) {
      res.writeHead(503);
      res.end("private node failure");
      return;
    }
    const epoch = Date.parse("2026-11-10") / 1000;
    let result;
    if (input.method === "eth_chainId") result = rpcChain;
    else {
      const tag = input.params[0];
      const number =
        tag === "finalized"
          ? 26380784 +
            Math.floor(((Date.now() / 1000 - 3600 - epoch) * 7173) / 86400)
          : Number(BigInt(tag));
      result = {
        number: `0x${number.toString(16)}`,
        timestamp: `0x${Math.max(0, epoch + Math.floor(((number - 26380784) * 86400) / 7173) + 1).toString(16)}`,
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }));
  });
  return {
    testrilUrl: await listen(mcp),
    ethereumRpcUrl: await listen(rpc),
    rpcCalls,
    nansenUrl: await listen(nansen),
    calls,
    close: async () => {
      await close(mcp);
      await close(nansen);
      await close(rpc);
    },
  };
}
