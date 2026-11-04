import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { x402Client } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/client";
import { wrapMCPClientWithPayment } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";

// Callers switch on each answer's `outcome`; the SDK's schema check only adds
// warnings for Testril's integer formats.
const acceptEveryResult = {
  getValidator: () => (data) => ({ valid: true, data }),
};

export function payerAccount(payerKey) {
  return privateKeyToAccount(`0x${payerKey.replace(/^0x/, "")}`);
}

export async function connectTestril({ url, payerKey, name }) {
  const account = payerAccount(payerKey);
  const voucherOnly = new BatchSettlementEvmScheme(toClientEvmSigner(account), {
    depositStrategy: () => false,
  });
  const client = wrapMCPClientWithPayment(
    new Client(
      { name, version: "1" },
      { jsonSchemaValidator: acceptEveryResult },
    ),
    x402Client.fromConfig({
      schemes: [{ network: "eip155:*", client: voucherOnly }],
      // The library's $1 default caps USDC payments; these vouchers only draw
      // usage credits, and one materialize can cost more than $1.
      spendControls: false,
    }),
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return {
    payer: account.address,
    async call(tool, args) {
      const result = await client.callTool(tool, args, { timeout: 120000 });
      return result.structuredContent ?? JSON.parse(result.content[0].text);
    },
    close: () => client.close(),
  };
}

export function succeeded(answer, tool) {
  if (answer.outcome === "success") return answer;
  if (answer.error === "payment_required")
    throw new Error(
      `Testril still asks payment for ${tool}: the payer's usage credits may be used up.`,
    );
  throw new Error(
    `Testril ${tool}: ${answer.kind ?? answer.outcome}${answer.message ? ` — ${answer.message}` : ""}`,
  );
}
