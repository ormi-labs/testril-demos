import { readFile, writeFile } from "node:fs/promises";
import { validateRecording } from "../public/model.js";

const [input, name] = process.argv.slice(2);
if (!input || !/^[a-z0-9-]+$/.test(name ?? ""))
  throw new Error(
    "Usage: npm run recording:import -- /path/to/run.json descriptive-name",
  );
const run = validateRecording(JSON.parse(await readFile(input, "utf8")));
const publicRanges = (ranges) =>
  ranges?.map((range) =>
    Object.fromEntries(
      Object.entries(range).filter(([key]) =>
        [
          "from_block",
          "to_block",
          "from_hour",
          "to_hour",
          "from_day",
          "to_day",
          "from_month",
          "to_month",
          "cache_expiry_time",
        ].includes(key),
      ),
    ),
  );
// Project only the public evidence schema; discard unknown fields and signatures.
const providers = Object.fromEntries(
  Object.entries(run.providers)
    .filter(([name]) => ["testril", "allium"].includes(name))
    .map(([name, p]) => [
      name,
      {
        status: p.status,
        rows: p.rows.map(({ hour, pool, swaps, volume0, volume1 }) => ({
          hour,
          pool,
          swaps,
          volume0,
          volume1,
        })),
        timing: {
          readMs: p.timing.readMs,
          preparationMs: p.timing.preparationMs,
          walletWaitMs: p.timing.walletWaitMs,
          totalMs: p.timing.totalMs,
        },
        payments: p.payments.map(
          ({ amount, depositAmount, phase, confirmation, receipt }) => ({
            amount,
            depositAmount,
            phase,
            confirmation,
            receipt: receipt
              ? {
                  success: receipt.success,
                  network: receipt.network,
                  payer: receipt.payer,
                  transaction: receipt.transaction,
                  chargedAmount: receipt.chargedAmount,
                }
              : null,
          }),
        ),
        boundFunctionId: p.boundFunctionId,
        runId: p.runId,
        coverage: p.coverage
          ? {
              materialized: publicRanges(p.coverage.materialized),
              materializing: publicRanges(p.coverage.materializing),
              activeJobs: p.coverage.activeJobs?.filter(
                (id) => typeof id === "string",
              ),
            }
          : undefined,
        events: p.events?.map(({ stage, phase, elapsedMs, paid }) => ({
          stage,
          phase,
          elapsedMs,
          paid,
        })),
      },
    ]),
);
const clean = {
  schemaVersion: 1,
  kind: "recorded",
  recordedAt: run.recordedAt,
  spec: run.spec,
  paymentNetwork: run.paymentNetwork,
  providers,
};
await writeFile(
  new URL(`../recordings/${name}.json`, import.meta.url),
  `${JSON.stringify(clean, null, 2)}\n`,
  { flag: "wx" },
);
console.info(
  `Imported recordings/${name}.json. Review its evidence before publishing.`,
);
