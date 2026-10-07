import { readFile, writeFile } from "node:fs/promises";
import { createDemo, transferDemo, exportDemo } from "./demo.mjs";
import { decimalAmount } from "../public/amounts.js";
import { replayBalances } from "../public/replay.js";

try {
  const [command, filename] = process.argv.slice(2);
  let run;
  if (command === "sample") {
    let demo = createDemo();
    demo = transferDemo(demo, { from: "treasury", to: "a", amount: "0.25" });
    demo = transferDemo(demo, { from: "treasury", to: "b", amount: "0.1" });
    demo = transferDemo(demo, { from: "a", to: "b", amount: "0.05" });
    run = exportDemo(demo);
    if (filename)
      await writeFile(filename, `${JSON.stringify(run, null, 2)}\n`);
  } else if (command === "replay" && filename) {
    run = JSON.parse(await readFile(filename, "utf8"));
    if (run.formatVersion !== 2 || !["mock", "live"].includes(run.mode))
      throw new Error("This CLI replays version 2 demo exports only.");
  } else
    throw new Error(
      "Usage: node src/cli.mjs sample [run.json] | replay <run.json>",
    );
  const balances = replayBalances(
    run.initialBalances,
    run.transfers,
    run.transfers.length,
  );
  if (Object.keys(balances).some((id) => balances[id] !== run.balances[id]))
    throw new Error("Export balances disagree with the transfer replay.");
  console.log(
    run.mode === "live"
      ? "Base Sepolia / USDC / LIVE — arithmetic replay of the 1 USDC demo allowance."
      : "Arbitrum / USDC / MOCK — no funds moved or payments occurred.",
  );
  for (const wallet of run.wallets)
    console.log(`${wallet.name}: ${decimalAmount(balances[wallet.id])} USDC`);
  console.log(
    `${run.transfers.length} ${run.mode} transfers. Testril charges: ${decimalAmount(run.payment.spentRaw)} USDC${run.mode === "mock" ? " (simulated)" : ""}.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
