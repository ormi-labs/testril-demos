import { fileURLToPath } from "node:url";
import { liveConfig } from "./live-config.mjs";
import { createLiveChain } from "./live-chain.mjs";
import { connectMcp } from "./mcp.mjs";
import { createLiveDemo } from "./live-demo.mjs";
import { succeeded } from "./mcp.mjs";
import { decimalAmount } from "../public/amounts.js";

let demo;
let mcp;
try {
  const command = process.argv[2];
  if (!["check", "smoke", "resume-smoke"].includes(command))
    throw new Error(
      "Usage: node --env-file=.env src/live-cli.mjs check|smoke|resume-smoke",
    );
  const config = liveConfig();
  const chain = createLiveChain(config);
  mcp = await connectMcp(config.mcpUrl);
  const { head } = succeeded(
    await mcp.call("inspect", { subject: "chain", chain_id: config.chain.id }),
    "inspect",
  );
  if (!Number.isSafeInteger(head))
    throw new Error("Testril cannot report the Base Sepolia chain head.");
  console.log(
    `Testril reports Base Sepolia block ${head}; all four signer addresses match.`,
  );
  if (command !== "check") {
    if (config.chargeCapRaw === "0" || config.depositCapRaw === "0")
      throw new Error("Configure the approved Testril caps first.");
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
      throw new Error(
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
          BigInt(t.amountRaw) !==
            BigInt(Math.round(Number(sequence[i][2]) * 1000000)),
      )
    )
      throw new Error(
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
  console.error(
    error.name === "Error"
      ? error.message
      : "Live operation failed. Inspect the saved state and refresh.",
  );
  process.exitCode = 1;
} finally {
  if (demo) await demo.close();
  else await mcp?.close();
}
