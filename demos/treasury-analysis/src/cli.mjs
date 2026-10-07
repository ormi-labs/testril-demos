import { readFile, writeFile } from "node:fs/promises";
import { createDemo, transferDemo, exportDemo } from "./demo.mjs";
import { decimalAmount, rawAmount } from "../public/amounts.js";
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
    if (
      ![2, 3].includes(run.formatVersion) ||
      !["mock", "live"].includes(run.mode)
    )
      throw new Error("This CLI replays version 2 or 3 demo exports only.");
  } else
    throw new Error(
      "Usage: node src/cli.mjs sample [run.json] | replay <run.json>",
    );
  const balances =
    run.mode === "live"
      ? run.actualBalances
      : replayBalances(
          run.initialBalances,
          run.transfers,
          run.transfers.length,
        );
  const walletIds = run.wallets.map((wallet) => wallet.id);
  if (
    new Set(walletIds).size !== walletIds.length ||
    Object.keys(balances).length !== walletIds.length ||
    Object.keys(run.balances).length !== walletIds.length ||
    walletIds.some(
      (id) => !Object.hasOwn(balances, id) || balances[id] !== run.balances[id],
    )
  )
    throw new Error("Export balances disagree with the replay results.");
  // Live replay uses cached snapshots; validate every amount before printing it.
  for (const amount of Object.values(balances)) rawAmount(amount);
  console.log(
    run.mode === "live"
      ? "Base Sepolia / USDC / LIVE — latest cached Testril wallet balances."
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
