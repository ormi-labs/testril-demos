import { setTimeout as delay } from "node:timers/promises";
import { succeeded } from "./testril.mjs";

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

export function newRun(binds) {
  return {
    state: "running",
    startedAt: new Date().toISOString(),
    spentAtoms: "0",
    binds: binds.map((bind) => ({
      name: bind.name,
      function_slug: bind.function_slug,
      step: "waiting",
      done: 0,
      total: 1,
      unit: null,
    })),
  };
}

function jobProgress(job) {
  const key = Object.keys(job).find((name) => name.endsWith("_done"));
  if (!key) return { done: 0, total: 1, unit: null };
  const unit = key.slice(0, -"_done".length);
  return { done: job[key], total: job[`${unit}_total`], unit };
}

async function waitForJob(testril, jobId, progress, pollMs) {
  for (;;) {
    const job = succeeded(
      await testril.call("inspect", { subject: "job", job_id: jobId }),
      "inspect",
    );
    Object.assign(progress, jobProgress(job));
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

const charge = (answer) =>
  answer.receipt?.state === "paid" ? BigInt(answer.receipt.amount.atoms) : 0n;

export async function fetchRows({ binds, testril, run, pollMs = 2000 }) {
  const rows = {};
  const pay = (answer) => {
    run.spentAtoms = (BigInt(run.spentAtoms) + charge(answer)).toString();
  };
  for (const [index, bind] of binds.entries()) {
    const progress = run.binds[index];
    progress.step = "binding";
    const { bound_function_id: id } = succeeded(
      await testril.call("bind", {
        function_slug: bind.function_slug,
        chain_id: bind.chain_id,
        params: bind.params,
      }),
      "bind",
    );
    progress.step = "indexing";
    progress.jobId = null;
    for (let waiting = true; waiting;) {
      const prepared = await testril.call("materialize", {
        bound_function_id: id,
        ...bind.window,
      });
      pay(prepared);
      const jobId = jobToWaitFor(prepared);
      if (jobId) {
        progress.jobId = jobId;
        await waitForJob(testril, jobId, progress, pollMs);
      }
      waiting = jobId !== undefined && prepared.outcome !== "success";
    }
    const parts = readParts(bind.window, bind.read);
    Object.assign(progress, {
      step: "reading",
      done: 0,
      total: parts.length,
      unit: "reads",
    });
    rows[bind.name] = [];
    for (const part of parts) {
      const answer = succeeded(
        await testril.call("read", { bound_function_id: id, ...part }),
        "read",
      );
      pay(answer);
      rows[bind.name].push(...answer.values);
      progress.done += 1;
    }
    progress.step = "done";
  }
  return rows;
}
