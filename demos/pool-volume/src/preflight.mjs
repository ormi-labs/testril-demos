import { reportSpec } from "../public/model.js";
import { connectTestril, createAllium } from "./providers.mjs";
import { probeReadiness } from "./readiness.mjs";

const result = await probeReadiness({
  spec: reportSpec(process.env.REPORT_FROM_HOUR),
  testril: () =>
    connectTestril(process.env.TESTRIL_MCP_URL ?? "https://dev.testril.ai/mcp"),
  allium: createAllium(process.env.ALLIUM_URL ?? "https://agents.allium.so"),
});
console.info(JSON.stringify(result, null, 2));
if (!result.readyForWalletTrial) process.exitCode = 1;
