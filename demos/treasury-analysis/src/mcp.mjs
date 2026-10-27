import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  demoFailure,
  refusalReason,
  testrilOperation,
  transportCode,
} from "./errors.mjs";

export async function connectMcp(url) {
  const client = new Client({ name: "move-money", version: "0.3.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  } catch (error) {
    await client.close().catch(() => {});
    throw demoFailure("TESTRIL_REQUEST_FAILED", "Cannot connect to Testril.", {
      operation: "connect",
      transportCode: transportCode(error),
    });
  }
  return {
    async call(name, args = {}, payment) {
      const operation = testrilOperation(name);
      let result;
      try {
        result = await client.callTool(
          {
            name,
            arguments: args,
            ...(payment ? { _meta: { "x402/payment": payment } } : {}),
          },
          undefined,
          {
            timeout: 60000,
          },
        );
      } catch (error) {
        // SDK errors can include request bodies. Never forward signed payloads.
        throw demoFailure(
          "TESTRIL_REQUEST_FAILED",
          `Testril ${operation} request failed. Check the connection and refresh.`,
          { operation, transportCode: transportCode(error) },
        );
      }
      let value;
      try {
        value =
          result.structuredContent ??
          JSON.parse(
            result.content.find((item) => item.type === "text")?.text ?? "null",
          );
      } catch {
        throw demoFailure(
          "TESTRIL_RESPONSE_INVALID",
          `Testril ${operation} returned an invalid response.`,
          { operation },
        );
      }
      if (
        result.isError &&
        value?.x402Version === 2 &&
        value.error === "payment_required"
      ) {
        let quote;
        try {
          quote = JSON.parse(result.content[1]?.text ?? "null");
        } catch {
          /* Refuse malformed quote details. */
        }
        if (
          !Array.isArray(value.accepts) ||
          typeof quote?.quote_id !== "string" ||
          !quote.quote_id ||
          !Array.isArray(quote.lines)
        )
          throw demoFailure(
            "TESTRIL_PAYMENT_CHALLENGE_INVALID",
            `Testril ${operation} returned an invalid payment challenge.`,
            { operation },
          );
        return {
          ...value,
          quote_id: quote.quote_id,
          amount: quote.amount,
          lines: quote.lines,
          outcome: "payment_required",
        };
      }
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        result.isError
      )
        throw demoFailure(
          "TESTRIL_RESPONSE_INVALID",
          `Testril ${operation} returned an invalid response.`,
          { operation },
        );
      const settlement = result._meta?.["x402/payment-response"];
      return settlement
        ? {
            ...value,
            paymentResponse: {
              success: settlement.success,
              network: settlement.network,
              payer: settlement.payer,
              transaction: settlement.transaction,
              chargedAmount: settlement.extra?.chargedAmount,
            },
          }
        : value;
    },
    async close() {
      try {
        await client.close();
      } catch (error) {
        throw demoFailure(
          "TESTRIL_REQUEST_FAILED",
          "The Testril connection could not close.",
          {
            operation: "close",
            transportCode: transportCode(error),
          },
        );
      }
    },
  };
}

export function succeeded(result, name) {
  const operation = testrilOperation(name);
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !["success", "error", "payment_required"].includes(result.outcome)
  )
    throw demoFailure(
      "TESTRIL_RESPONSE_INVALID",
      `Testril ${operation} returned an invalid response.`,
      { operation },
    );
  if (result.outcome !== "success") {
    const reason = refusalReason(result.kind);
    throw demoFailure(
      "TESTRIL_OPERATION_REJECTED",
      `Testril ${operation}: ${reason}.`,
      { operation, reason },
    );
  }
  return result;
}
