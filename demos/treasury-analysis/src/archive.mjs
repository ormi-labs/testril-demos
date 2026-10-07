import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function tarArchive(cwd, entries) {
  return new Promise((resolve, reject) => {
    const process = spawn("tar", ["-czf", "-", "-C", cwd, ...entries], {
      env: { ...globalThis.process.env, COPYFILE_DISABLE: "1" },
    });
    const chunks = [];
    process.stdout.on("data", (chunk) => chunks.push(chunk));
    process.stderr.resume();
    process.on("error", () =>
      reject(
        new Error("Run downloads require the tar command (macOS or Linux)."),
      ),
    );
    process.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error("Could not build the download.")),
    );
  });
}

export async function exportRun(run) {
  const directory = await mkdtemp(join(tmpdir(), "wallet-run-"));
  try {
    const destination = join(directory, "run");
    await mkdir(destination);
    await writeFile(
      join(destination, "README.md"),
      `# Wallet transfers run\n\n${run.mode === "live" ? "Live Base Sepolia run; transfers and Testril payments use test funds. All USDC in Treasury, A, and B is available; Reset returns A and B funds to Treasury. Reset preserves payment usage and caps." : "All transfers, reads, payments, addresses, times and hashes are mocked. No real funds moved. Reset clears both histories and refills the mock payer."}\n\nFrom the demo source directory, run:\n\n\`node src/cli.mjs replay /path/to/run/run.json\`\n\nMock replay checks arithmetic; live replay shows cached Testril wallet balances. Neither independently verifies chain or Testril evidence. Amounts are raw six-decimal USDC integer strings.\n`,
    );
    await writeFile(
      join(destination, "run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );
    for (const name of [
      "transfers",
      "balances",
      "receipts",
      "provenance",
      "balanceProvenance",
    ])
      await writeFile(
        join(destination, `${name}.json`),
        `${JSON.stringify(run[name], null, 2)}\n`,
      );
    return await tarArchive(directory, ["run"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
