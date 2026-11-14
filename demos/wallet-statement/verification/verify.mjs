import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { rpcClient, verifyWindow } from "../public/verification.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !process.env.ETHEREUM_RPC_URL) {
  console.error(
    "Usage: ETHEREUM_RPC_URL=https://... node verification/verify.mjs verification/input.json result.json",
  );
  process.exitCode = 1;
} else {
  try {
    const input = JSON.parse(await readFile(inputPath, "utf8"));
    const batches = [],
      results = [],
      rpc = rpcClient(process.env.ETHEREUM_RPC_URL, batches);
    for (const window of input.windows) {
      const load = (name) =>
        readFile(resolve(dirname(inputPath), name), "utf8");
      results.push(
        await verifyWindow(
          {
            scope: { ...input, ...window },
            provenance: JSON.parse(await load(window.provenance)),
            rows: (await load(window.rows))
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line)),
          },
          rpc,
        ),
      );
    }
    await writeFile(
      outputPath,
      JSON.stringify({ checkedAt: new Date().toISOString(), results, batches }),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify(
        results.map(({ counterparties, ...r }) => ({
          ...r,
          counterparties: counterparties.length,
        })),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
