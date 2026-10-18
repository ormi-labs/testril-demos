import { createServer } from "node:http";
import { privateKeyToAccount } from "viem/accounts";
import {
  encodeAbiParameters,
  hashDomain,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
} from "viem";
import { reportSpec, paymentNetwork, usdc } from "../public/model.js";
import {
  batchDomain,
  channelTypes,
  collector,
  voucherTypes,
} from "../public/payments.js";

// Public deterministic test key. Never fund this account.
export const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
export const spec = reportSpec();
export const rows = [
  {
    hour: spec.fromHour,
    pool: spec.pool,
    swaps: "7",
    volume0: "123456789012",
    volume1: "987654321098765432109876",
  },
  {
    hour: "2026-10-17T14",
    pool: spec.pool,
    swaps: "11",
    volume0: "230000000001",
    volume1: "111111111111111111111111",
  },
];
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
const authorizationFields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];

export function testWallet() {
  return {
    async request({ method, params }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts")
        return [account.address];
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") return "0x6000";
      if (method === "eth_call")
        return hashDomain({
          domain: tokenDomain,
          types: { EIP712Domain: domainTypes },
        });
      if (method === "eth_signTypedData_v4")
        return account.signTypedData(JSON.parse(params[1]));
      throw new Error(`Unexpected test wallet method: ${method}`);
    },
  };
}

export function challenge(scheme = "exact", amount = "10000", overrides = {}) {
  return {
    outcome: "payment_required",
    error: "payment_required",
    x402Version: 2,
    resource: {
      url: "https://agents.allium.so/api/v1/explorer/queries/run-async",
    },
    accepts: [
      {
        scheme,
        network: paymentNetwork,
        asset: usdc,
        amount,
        payTo: "0x1111111111111111111111111111111111111111",
        maxTimeoutSeconds: 3600,
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
        ...overrides,
      },
    ],
  };
}

const receipt = (amount) => ({
  success: true,
  network: paymentNetwork,
  payer: account.address,
  transaction: `0x${"ab".repeat(32)}`,
  extra: { chargedAmount: amount },
});
async function verifySigner(data, signature) {
  const address = await recoverTypedDataAddress({ ...data, signature });
  if (address.toLowerCase() !== account.address.toLowerCase())
    throw new Error("The fake peer rejected an invalid signature.");
}

export async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
export async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

export async function fakePeers({
  authFailure = false,
  network = paymentNetwork,
  amount = "10000",
  omitReceipt = false,
} = {}) {
  const calls = [];
  const channels = [];
  let prepared = false;
  const id = `sha256:${"a".repeat(64)}`;
  const testril = {
    async close() {},
    async call(name, args, payment) {
      calls.push({ provider: "testril", name, args, paid: Boolean(payment) });
      if (name === "bind") return { outcome: "success", bound_function_id: id };
      if (name === "inspect") {
        if (args.subject === "channels")
          return { outcome: "success", channels };
        if (args.subject === "job")
          return { outcome: "success", state: "done" };
        return { outcome: "success", materialized: [] };
      }
      if (name === "read" && !prepared)
        return { outcome: "error", kind: "range_unavailable" };
      const charge = name === "materialize" ? "120" : "23";
      if (!payment) return challenge("batch-settlement", charge, { network });
      const p = payment.payload;
      if (
        hashTypedData({
          domain: batchDomain,
          types: channelTypes,
          primaryType: "ChannelConfig",
          message: p.channelConfig,
        }) !== p.voucher.channelId
      )
        throw new Error("The fake peer rejected a wrong channel id.");
      await verifySigner(
        {
          domain: batchDomain,
          types: voucherTypes,
          primaryType: "Voucher",
          message: {
            channelId: p.voucher.channelId,
            maxClaimableAmount: BigInt(p.voucher.maxClaimableAmount),
          },
        },
        p.voucher.signature,
      );
      const prior = channels[0];
      if (
        BigInt(p.voucher.maxClaimableAmount) !==
        BigInt(prior?.chargedCumulativeAmount ?? "0") + BigInt(charge)
      )
        throw new Error("The fake peer rejected a wrong cumulative voucher.");
      if (p.deposit) {
        const auth = p.deposit.authorization.erc3009Authorization;
        if (auth.to !== collector || auth.value !== "10000")
          throw new Error(
            "The deposit must target the collector and have the approved size.",
          );
        await verifySigner(
          {
            domain: tokenDomain,
            types: { ReceiveWithAuthorization: authorizationFields },
            primaryType: "ReceiveWithAuthorization",
            message: {
              from: auth.from,
              to: auth.to,
              value: BigInt(auth.value),
              validAfter: BigInt(auth.validAfter),
              validBefore: BigInt(auth.validBefore),
              nonce: keccak256(
                encodeAbiParameters(
                  [{ type: "bytes32" }, { type: "bytes32" }],
                  [p.voucher.channelId, auth.salt],
                ),
              ),
            },
          },
          auth.signature,
        );
      }
      channels.splice(0, channels.length, {
        channelId: p.voucher.channelId,
        channelConfig: p.channelConfig,
        network: paymentNetwork,
        closed: false,
        balance: "10000",
        chargedCumulativeAmount: p.voucher.maxClaimableAmount,
      });
      if (name === "materialize") prepared = true;
      return {
        outcome: "success",
        ...(name === "materialize"
          ? { result: "materializing", job: { job_id: "job:test" } }
          : { values: rows }),
        receipt: omitReceipt ? undefined : receipt(charge),
      };
    },
  };
  const alliumServer = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const url = new URL(request.url, "http://test");
    const header = request.headers["payment-signature"];
    const payment = header
      ? JSON.parse(Buffer.from(header, "base64").toString())
      : undefined;
    calls.push({
      provider: "allium",
      path: url.pathname,
      paid: Boolean(payment),
      body: body ? JSON.parse(body) : null,
      hasApiKey: Boolean(
        request.headers.authorization || request.headers["x-api-key"],
      ),
    });
    const send = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    try {
      if (url.pathname.endsWith("/status"))
        return send(authFailure ? 401 : 200, { status: "success" });
      const charge = url.pathname.endsWith("/results") ? "20000" : amount;
      if (!payment) return send(402, challenge("exact", charge, { network }));
      const auth = payment.payload.authorization;
      if (
        auth.value !== charge ||
        auth.to !== "0x1111111111111111111111111111111111111111"
      )
        throw new Error("Incorrect payment scope.");
      await verifySigner(
        {
          domain: tokenDomain,
          types: { TransferWithAuthorization: authorizationFields },
          primaryType: "TransferWithAuthorization",
          message: auth,
        },
        payment.payload.signature,
      );
      if (!omitReceipt)
        response.setHeader(
          "payment-response",
          Buffer.from(JSON.stringify(receipt(charge))).toString("base64"),
        );
      return send(
        200,
        url.pathname.endsWith("/results")
          ? { data: rows }
          : { run_id: "12345678-1234-1234-1234-123456789abc" },
      );
    } catch {
      send(400, { message: "The fake peer rejected the payment." });
    }
  });
  const alliumUrl = await listen(alliumServer);
  const mcpServer = createServer(async (request, response) => {
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
    else if (input.method === "tools/list")
      result = {
        tools: ["bind", "inspect", "materialize", "read"].map((name) => ({
          name,
          inputSchema: { type: "object", additionalProperties: true },
        })),
      };
    else {
      const value = await testril.call(
        input.params.name,
        input.params.arguments,
        input.params._meta?.["x402/payment"],
      );
      const { receipt, ...data } = value;
      result = {
        structuredContent: data,
        content: [{ type: "text", text: JSON.stringify(data) }],
        ...(receipt ? { _meta: { "x402/payment-response": receipt } } : {}),
      };
      if (value.outcome === "payment_required")
        result.content.push({
          type: "text",
          text: JSON.stringify({
            quote_id: "quote:test",
            amount: { atoms: value.accepts[0].amount, usd: "$0" },
            lines: [],
          }),
        });
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }));
  });
  const testrilUrl = await listen(mcpServer);
  return {
    testril,
    testrilUrl,
    alliumUrl,
    calls,
    channels,
    close: async () => {
      await close(alliumServer);
      await close(mcpServer);
    },
  };
}
