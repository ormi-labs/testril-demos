import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  cp,
  readdir,
  readFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sourceEntries = [
  "README.md",
  "package.json",
  "package-lock.json",
  ".gitignore",
  ".env.example",
  ".prettierrc.json",
  ".prettierignore",
  "eslint.config.mjs",
  "playwright.config.mjs",
  "src",
  "public",
  "fixtures",
  "test",
];

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
        new Error(
          "Source and run downloads require the tar command (macOS or Linux).",
        ),
      ),
    );
    process.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error("Could not build the download.")),
    );
  });
}

export async function exportSource(root) {
  const directory = await mkdtemp(join(tmpdir(), "treasury-source-"));
  const destination = join(directory, "treasury-analysis");
  try {
    await mkdir(destination);
    for (const entry of sourceEntries)
      await cp(join(root, entry), join(destination, entry), {
        recursive: true,
      });
    const files = {};
    async function digestFiles(path = "") {
      const entries = await readdir(join(destination, path), {
        withFileTypes: true,
      });
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const relative = path ? `${path}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await digestFiles(relative);
        else if (entry.isFile())
          files[relative] = createHash("sha256")
            .update(await readFile(join(destination, relative)))
            .digest("hex");
        else
          throw new Error(
            "Source downloads require ordinary files, not symbolic links.",
          );
      }
    }
    await digestFiles();
    const { version } = JSON.parse(
      await readFile(join(destination, "package.json"), "utf8"),
    );
    const manifest = {
      project: "treasury-analysis",
      version,
      algorithm: "sha256",
      sourceDigest: createHash("sha256")
        .update(JSON.stringify(files))
        .digest("hex"),
      files,
    };
    await writeFile(
      join(destination, "SOURCE.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return await tarArchive(directory, ["treasury-analysis"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function exportRun(run) {
  const directory = await mkdtemp(join(tmpdir(), "wallet-run-"));
  try {
    const destination = join(directory, "run");
    await mkdir(destination);
    await writeFile(
      join(destination, "README.md"),
      "# Wallet transfers run\n\nAll transfers, reads, payments, addresses, times and hashes are mocked. No real funds moved.\n\nExtract the matching treasury-analysis 0.3.0 source and run:\n\n`node src/cli.mjs replay /path/to/run/run.json`\n\nReplay checks arithmetic; it does not verify Arbitrum or Testril. Amounts are raw six-decimal USDC integer strings. Reset clears both histories, restores the mock payment wallet, and resets read charges to zero.\n",
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
