import { readFile, writeFile } from "node:fs/promises";
import { buildSample, defaultInputs } from "./sample.mjs";
import { verifySample, verifyRpc } from "./verify.mjs";
import { discover } from "./mcp.mjs";
import { decimalAmount, usdAmount } from "../public/amounts.js";

try {
  const [command, filename] = process.argv.slice(2);
  if (command === "sample") {
    const run = buildSample(defaultInputs);
    console.log(
      `Fictional USDC sample · [${run.inputs.fromBlock}, ${run.inputs.toBlock})`,
    );
    for (const key of ["opening", "incoming", "outgoing", "net", "closing"])
      console.log(
        `${key.padEnd(9)} ${decimalAmount(run.report[`${key}Raw`], 6, key === "net")} USDC`,
      );
    console.log(
      `Illustrative reads: ${usdAmount(run.receipts.readsRaw)}; paid: $0.000000`,
    );
    if (filename) {
      await writeFile(filename, `${JSON.stringify(run, null, 2)}\n`);
      console.log(`Exported ${filename}`);
    }
  } else if (command === "verify" && filename) {
    const run = JSON.parse(await readFile(filename, "utf8"));
    if (run.mode === "live" && !process.env.ETHEREUM_RPC_URL)
      throw new Error(
        "Set ETHEREUM_RPC_URL to a reference archive RPC with EIP-1898 support.",
      );
    const verification =
      run.mode === "sample"
        ? verifySample(run)
        : await verifyRpc(run, process.env.ETHEREUM_RPC_URL);
    console.log(JSON.stringify(verification, null, 2));
    if (verification.status !== "passed") process.exitCode = 1;
  } else if (command === "discover") {
    console.log(
      JSON.stringify(
        await discover(
          process.env.TESTRIL_MCP_URL ?? "https://dev.testril.ai/mcp",
        ),
        null,
        2,
      ),
    );
  } else {
    throw new Error(
      "Usage: node src/cli.mjs sample [run.json] | verify <run.json> | discover",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
