import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connectMcp(url) {
  const client = new Client({ name: "move-money", version: "0.3.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return {
    async call(name, args = {}) {
      let result;
      try {
        result = await client.callTool({ name, arguments: args }, undefined, {
          timeout: 60000,
        });
      } catch {
        // SDK errors can include request bodies. Never forward signed payloads.
        throw new Error(
          `Testril ${name} request failed. Check the connection and refresh.`,
        );
      }
      const value =
        result.structuredContent ??
        JSON.parse(
          result.content.find((item) => item.type === "text")?.text ?? "null",
        );
      if (!value || result.isError)
        throw new Error(`Testril ${name} returned an invalid response.`);
      return value;
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
