import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectTestril, succeeded } from "./testril.mjs";

const defaultUrl = "https://dev.testril.ai/mcp";

export function readParts(window, read = {}) {
  if (!read.chunk_blocks) return [window];
  const parts = [];
  for (
    let from = window.from_block;
    from < window.to_block;
    from += read.chunk_blocks
  )
    parts.push({
      from_block: from,
      to_block: Math.min(from + read.chunk_blocks, window.to_block),
    });
  return parts;
}

async function waitForJob(testril, jobId, pollMs) {
  for (;;) {
    const job = succeeded(
      await testril.call("inspect", { subject: "job", job_id: jobId }),
      "inspect",
    );
    if (job.state === "done") return;
    if (job.state === "failed" || job.state === "cancelled")
      throw new Error(`Testril job ${jobId} ${job.state}.`);
    await delay(pollMs);
  }
}

function jobToWaitFor(answer) {
  if (answer.outcome === "success") return answer.job.job_id;
  const next = answer.kind === "state" ? answer.remedy?.[0]?.call : undefined;
  if (next?.tool === "read") return undefined;
  if (next?.tool === "inspect" && next.arguments.job_id)
    return next.arguments.job_id;
  succeeded(answer, "materialize");
}

function charge(answer) {
  return answer.receipt?.state === "paid"
    ? BigInt(answer.receipt.amount.atoms)
    : 0n;
}

export async function record({
  spec,
  testril,
  log = console.info,
  pollMs = 5000,
}) {
  const recording = {
    demo: spec.demo,
    source: "dev",
    boundFunctions: {},
    rows: {},
  };
  let spent = 0n;
  for (const bind of spec.binds) {
    const started = Date.now();
    log(`${bind.name}: ${bind.function_slug} on chain ${bind.chain_id}`);
    const { bound_function_id: id } = succeeded(
      await testril.call("bind", {
        function_slug: bind.function_slug,
        chain_id: bind.chain_id,
        params: bind.params,
      }),
      "bind",
    );
    const prepared = await testril.call("materialize", {
      bound_function_id: id,
      ...bind.window,
    });
    spent += charge(prepared);
    const jobId = jobToWaitFor(prepared);
    if (jobId) await waitForJob(testril, jobId, pollMs);
    const rows = [];
    for (const part of readParts(bind.window, bind.read)) {
      const answer = succeeded(
        await testril.call("read", { bound_function_id: id, ...part }),
        "read",
      );
      spent += charge(answer);
      rows.push(...answer.values);
    }
    recording.rows[bind.name] = rows;
    recording.boundFunctions[bind.name] = {
      bound_function_id: id,
      function_slug: bind.function_slug,
      chain_id: bind.chain_id,
      job_id: jobId ?? null,
      ms: Date.now() - started,
    };
  }
  recording.recordedAt = new Date().toISOString();
  recording.spentAtoms = spent.toString();
  return recording;
}

async function main() {
  const payerKey = process.env.TESTRIL_PAYER_KEY;
  if (!payerKey)
    throw new Error(
      "Set TESTRIL_PAYER_KEY to the key that holds Testril usage credits.",
    );
  const spec = JSON.parse(
    await readFile(new URL("../testril.json", import.meta.url), "utf8"),
  );
  const testril = await connectTestril({
    url: process.env.TESTRIL_MCP_URL ?? defaultUrl,
    payerKey,
    name: spec.demo,
  });
  try {
    const recording = await record({ spec, testril });
    await writeFile(
      new URL("../recordings/recorded.json", import.meta.url),
      `${JSON.stringify(recording, null, 2)}\n`,
    );
    console.info(
      `Recorded ${spec.binds.length} binds; spent ${recording.spentAtoms} atoms of usage credits.`,
    );
  } finally {
    await testril.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
