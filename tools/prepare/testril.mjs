import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connectTestril(url) {
  const client = new Client({ name: "testril-prepare", version: "0.1.0" });
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
          { timeout: 120000 },
        );
      } catch {
        // SDK errors can echo request bodies, which may hold a signed voucher.
        throw new Error(`Testril ${name} request failed.`);
      }
      const value =
        result.structuredContent ?? JSON.parse(result.content[0].text);
      if (result.isError && value.error === "payment_required")
        return {
          ...value,
          outcome: "payment_required",
          quote: JSON.parse(result.content[1]?.text ?? "null"),
        };
      if (result.isError)
        throw new Error(`Testril ${name} refused the call: ${value.error}.`);
      const settlement = result._meta?.["x402/payment-response"];
      return settlement ? { ...value, settlement } : value;
    },
    close: () => client.close(),
  };
}

export function succeeded(result, name) {
  if (result.outcome !== "success")
    throw new Error(
      `Testril ${name}: ${result.kind ?? result.outcome}${result.message ? ` — ${result.message}` : ""}`,
    );
  return result;
}
