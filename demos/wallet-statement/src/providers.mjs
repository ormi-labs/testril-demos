import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { decimalAtoms, scope, validateRows } from "../public/model.js";
import { failure, describeFailure } from "./errors.mjs";

const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b?.toLowerCase();
export function safeReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return null;
  return {
    success: receipt.success === true,
    network: receipt.network === "eip155:8453" ? receipt.network : null,
    payer: /^0x[0-9a-f]{40}$/i.test(receipt.payer ?? "") ? receipt.payer : null,
    transaction: /^0x[0-9a-f]{64}$/i.test(receipt.transaction ?? "")
      ? receipt.transaction
      : null,
    chargedAmount: /^\d+$/.test(receipt.extra?.chargedAmount ?? "")
      ? receipt.extra.chargedAmount
      : null,
  };
}
export function confirmedReceipt(receipt, amount, payer) {
  return (
    receipt?.success === true &&
    receipt.network === "eip155:8453" &&
    same(receipt.payer, payer) &&
    (receipt.chargedAmount === null || receipt.chargedAmount === amount)
  );
}

export function nansenRows(text, report) {
  // Read the original decimal text before JavaScript rounds it to a Number.
  const value = JSON.parse(text, (key, value, context) => {
    if (key !== "token_amount" || typeof value !== "number") return value;
    if (!context?.source)
      throw new Error("Lossless JSON numbers are required.");
    return context.source;
  });
  const p = value.pagination;
  if (
    !p ||
    !Number.isSafeInteger(p.page) ||
    p.page < 1 ||
    p.per_page !== 100 ||
    typeof p.is_last_page !== "boolean" ||
    !Array.isArray(value.data) ||
    value.data.length > 100
  )
    throw new Error("Invalid pagination.");
  const rows = [];
  for (const tx of value.data) {
    const timestamp = tx.block_timestamp;
    const time =
      typeof timestamp === "string"
        ? Date.parse(
            /[zZ]|[+-]\d\d:\d\d$/.test(timestamp) ? timestamp : timestamp + "Z",
          )
        : NaN;
    if (
      tx.chain !== "ethereum" ||
      !Number.isFinite(time) ||
      time < Date.parse(report.from_time) ||
      time >= Date.parse(report.to_time)
    )
      throw new Error("Different report window.");
    if (!Array.isArray(tx.tokens_sent) || !Array.isArray(tx.tokens_received))
      throw new Error("Missing transfers.");
    for (const t of [...tx.tokens_sent, ...tx.tokens_received]) {
      if (!same(t.token_address, report.token)) continue;
      rows.push({
        tx: tx.transaction_hash,
        token: t.token_address,
        from: t.from_address,
        to: t.to_address,
        value: decimalAtoms(t.token_amount),
      });
    }
  }
  return {
    rows: validateRows(rows, report, "nansen"),
    pagination: { page: p.page, last: p.is_last_page },
  };
}

export function createProviders({
  testrilUrl = "https://api.testril.si/mcp",
  nansenUrl = "https://api.nansen.ai",
  fetcher = fetch,
} = {}) {
  return {
    async testril(name, args, payment) {
      const client = new Client({ name: "wallet-statement", version: "0.1.0" });
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(testrilUrl)),
        );
        const r = await client.callTool(
          {
            name,
            arguments: args,
            ...(payment ? { _meta: { "x402/payment": payment } } : {}),
          },
          undefined,
          { timeout: 60000 },
        );
        const value =
          r.structuredContent ??
          JSON.parse(r.content.find((c) => c.type === "text")?.text);
        if (value?.x402Version === 2)
          return {
            challenge: { ...value, ...JSON.parse(r.content[1]?.text ?? "{}") },
          };
        return {
          value,
          receipt: safeReceipt(r._meta?.["x402/payment-response"]),
        };
      } catch (error) {
        if (describeFailure(error)) throw error;
        throw failure(payment ? "PAYMENT_UNCERTAIN" : "PROVIDER_UNAVAILABLE", {
          provider: "testril",
          operation: name,
        });
      } finally {
        try {
          await client.close();
        } catch {
          /* Closure cannot undo an already returned payment result. */
        }
      }
    },
    async nansen(window, page, payment) {
      const report = scope(window);
      let response;
      try {
        response = await fetcher(
          new URL("/api/v1/profiler/address/transactions", nansenUrl),
          {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(60000),
            headers: {
              "content-type": "application/json",
              ...(payment
                ? {
                    "PAYMENT-SIGNATURE": Buffer.from(
                      JSON.stringify(payment),
                    ).toString("base64"),
                  }
                : {}),
            },
            body: JSON.stringify({
              address: report.wallet,
              chain: "ethereum",
              date: { from: report.from_time, to: report.to_time },
              filters: { token_address: report.token },
              hide_spam_token: false,
              pagination: { page, per_page: 100 },
            }),
          },
        );
      } catch {
        throw failure(payment ? "PAYMENT_UNCERTAIN" : "PROVIDER_UNAVAILABLE", {
          provider: "nansen",
          operation: "transactions",
        });
      }
      const decode = (header) =>
        header ? JSON.parse(Buffer.from(header, "base64").toString()) : null;
      try {
        if (response.status === 402)
          return {
            challenge: decode(response.headers.get("payment-required")),
          };
        const receipt = safeReceipt(
          decode(response.headers.get("payment-response")),
        );
        const text = await response.text();
        if (text.length > 2000000) throw new Error("Oversized response");
        return { status: response.status, receipt, text };
      } catch {
        throw failure(
          payment ? "PAYMENT_UNCERTAIN" : "PROVIDER_INVALID_RESPONSE",
          { provider: "nansen", operation: "transactions" },
        );
      }
    },
  };
}
