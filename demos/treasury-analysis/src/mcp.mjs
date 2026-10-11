import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connectMcp(url) {
  const client = new Client({ name: "move-money", version: "0.3.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return {
    async call(name, args = {}, payment) {
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
      } catch {
        // SDK errors can include request bodies. Never forward signed payloads.
        throw new Error(
          `Testril ${name} request failed. Check the connection and refresh.`,
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
        throw new Error(`Testril ${name} returned an invalid response.`);
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
          throw new Error(
            `Testril ${name} returned an invalid payment challenge.`,
          );
        return {
          ...value,
          quote_id: quote.quote_id,
          amount: quote.amount,
          lines: quote.lines,
          outcome: "payment_required",
        };
      }
      if (!value || result.isError)
        throw new Error(`Testril ${name} returned an invalid response.`);
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
    close: () => client.close(),
  };
}

export function succeeded(result, name) {
  if (result.outcome !== "success")
    throw new Error(
      `Testril ${name}: ${result.kind ?? result.outcome ?? "invalid response"}.`,
    );
  return result;
}
