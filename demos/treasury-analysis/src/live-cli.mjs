import { fileURLToPath } from "node:url";
import { liveConfig } from "./live-config.mjs";
import { createLiveChain } from "./live-chain.mjs";
import { connectMcp } from "./mcp.mjs";
import { createLiveDemo } from "./live-demo.mjs";
import { bindLiveFunctions, inspectChainHead } from "./live-testril.mjs";
import { decimalAmount, parseUsdc } from "../public/amounts.js";
import { demoFailure, describeFailure, failureMessage } from "./errors.mjs";

let demo;
let mcp;
try {
  const command = process.argv[2];
  if (!["check", "smoke", "resume-smoke"].includes(command))
    throw demoFailure(
      "INVALID_COMMAND",
      "Usage: node --env-file=.env src/live-cli.mjs check|smoke|resume-smoke",
    );
  const config = liveConfig();
  const chain = createLiveChain(config);
  mcp = await connectMcp(config.mcpUrl);
  const head = await inspectChainHead(mcp, config.chain.id);
  if (command === "check") {
    await bindLiveFunctions(mcp, config);
    console.log(
      `Testril reports Base Sepolia block ${head}; live Function bindings and all four signer addresses are valid.`,
    );
  } else {
    console.log(
      `Testril reports Base Sepolia block ${head}; all four signer addresses match.`,
    );
    if (config.chargeCapRaw === "0" || config.depositCapRaw === "0")
      throw demoFailure(
        "LIVE_CONFIGURATION_INVALID",
        "Configure the approved Testril caps first.",
      );
    demo = await createLiveDemo({
      config,
      chain,
      mcp,
      directory: fileURLToPath(new URL("..", import.meta.url)),
    });
    await demo.refresh();
    if (
      command === "smoke" &&
      (demo.state().transferCount ||
        demo.state().pending ||
        demo.state().balances.a !== "0" ||
        demo.state().balances.b !== "0")
    )
      throw demoFailure(
        "SMOKE_SEQUENCE_INVALID",
        "Finish or reset the existing run before starting a smoke sequence.",
      );
    for (const wallet of config.wallets)
      console.log(
        `${wallet.name}: ${decimalAmount(demo.state().actualBalances[wallet.id])} test USDC`,
      );
    const sequence = [
      ["treasury", "a", "0.25"],
      ["a", "b", "0.10"],
    ];
    const prior = demo.export().transfers;
    if (
      prior.length > sequence.length ||
      prior.some(
        (t, i) =>
          t.kind !== "transfer" ||
          t.from !== sequence[i][0] ||
          t.to !== sequence[i][1] ||
          t.amountRaw !== parseUsdc(sequence[i][2]),
      )
    )
      throw demoFailure(
        "SMOKE_SEQUENCE_INVALID",
        "The saved run is not the smoke sequence. Use the interface to finish or reset it.",
      );
    for (const [from, to, amount] of sequence.slice(prior.length)) {
      await demo.transfer({
        revision: demo.state().revision,
        from,
        to,
        amount,
      });
      console.log(
        `Confirmed ${amount} test USDC: ${from} → ${to}; ${demo.export().transfers.at(-1).transactionHash}`,
      );
    }
    await demo.reset({ revision: demo.state().revision });
    console.log("Reset returned the demo funds to Treasury.");
    console.log(
      `Testril charges across all runs: ${decimalAmount(demo.state().payment.lifetimeSpentRaw)} test USDC; escrow deposited: ${decimalAmount(demo.state().payment.depositedRaw)} test USDC.`,
    );
  }
} catch (error) {
  const failure = describeFailure(error);
  console.error(
    `${failure ? `${failure.code}: ` : ""}${failureMessage(error)}`,
  );
  process.exitCode = 1;
} finally {
  try {
    if (demo) await demo.close();
    else await mcp?.close();
  } catch (error) {
    console.error(failureMessage(error));
    process.exitCode = 1;
  }
}
