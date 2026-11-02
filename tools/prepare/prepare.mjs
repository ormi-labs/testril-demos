import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectTestril, succeeded } from "./testril.mjs";
import { createOperator } from "./operator.mjs";

const periodKinds = ["hour", "day", "month"];
const dayMs = 86400000;

export function windowKind(window) {
  return periodKinds.find((kind) => `from_${kind}` in window) ?? "block";
}
const ends = (kind, range) => [range[`from_${kind}`], range[`to_${kind}`]];
const spell = (kind, [from, to]) => ({
  [`from_${kind}`]: from,
  [`to_${kind}`]: to,
});

function periodStartMs(kind, value) {
  if (kind === "hour") return Date.parse(`${value}:00:00Z`);
  if (kind === "day") return Date.parse(`${value}T00:00:00Z`);
  return Date.parse(`${value}-01T00:00:00Z`);
}

export function windowBlocks(window, blocksPerDay) {
  const kind = windowKind(window);
  const [from, to] = ends(kind, window);
  if (kind === "block") return to - from;
  if (!blocksPerDay) return null;
  const days = (periodStartMs(kind, to) - periodStartMs(kind, from)) / dayMs;
  return Math.round(days * blocksPerDay);
}

export function holes(kind, [from, to], covered) {
  const spans = covered
    .map((range) => ends(kind, range))
    .filter(([start, end]) => end > from && start < to)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const gaps = [];
  let cursor = from;
  for (const [start, end] of spans) {
    if (start > cursor) gaps.push([cursor, start]);
    if (end > cursor) cursor = end;
  }
  if (cursor < to) gaps.push([cursor, to]);
  return gaps;
}

export function chunks(kind, [from, to], read = {}) {
  const parts = [];
  if (kind === "block" && read.chunk_blocks) {
    for (let start = from; start < to; start += read.chunk_blocks)
      parts.push([start, Math.min(start + read.chunk_blocks, to)]);
    return parts;
  }
  if (kind === "hour" && read.chunk_hours) {
    const hour = (ms) => new Date(ms).toISOString().slice(0, 13);
    const end = periodStartMs("hour", to);
    const step = read.chunk_hours * 3600000;
    for (let start = periodStartMs("hour", from); start < end; start += step)
      parts.push([hour(start), hour(Math.min(start + step, end))]);
    return parts;
  }
  return [[from, to]];
}

export async function loadSpec(demoDir) {
  return JSON.parse(await readFile(join(demoDir, "testril.json"), "utf8"));
}

export async function plan(spec, testril) {
  const { chains } = succeeded(
    await testril.call("inspect", { subject: "chains" }),
    "inspect",
  );
  const { rates } = succeeded(
    await testril.call("inspect", { subject: "pricing" }),
    "inspect",
  );
  const rate = BigInt(
    rates.find((r) => r.label === "materialize_blocks").unit_price.atoms,
  );
  return spec.binds.map((bind) => {
    const chain = chains.find((c) => c.chain_id === bind.chain_id);
    const blocks = windowBlocks(bind.window, chain?.blocks_per_day);
    return {
      name: bind.name,
      function_slug: bind.function_slug,
      chain_id: bind.chain_id,
      served: Boolean(chain?.head?.block),
      head: chain?.head?.block ?? null,
      window: bind.window,
      blocks,
      atoms: blocks === null ? null : BigInt(blocks) * rate,
    };
  });
}

export const usd = (atoms) =>
  `$${(Number(atoms) / 1e6).toFixed(atoms < 10000n ? 6 : 2)}`;

export function formatPlan(demo, rows) {
  const total = rows.reduce((sum, row) => sum + (row.atoms ?? 0n), 0n);
  const lines = rows.map((row) =>
    [
      `  ${row.name}`,
      row.function_slug,
      `chain ${row.chain_id} ${row.served ? `served (head ${row.head})` : "waiting"}`,
      Object.values(row.window).join(" → "),
      row.blocks === null ? "blocks unknown" : `${row.blocks} blocks`,
      row.atoms === null ? "" : `~${row.atoms} atoms (${usd(row.atoms)})`,
    ].join("  "),
  );
  return [
    demo,
    ...lines,
    `  materialize estimate: ~${total} atoms (${usd(total)}); functions that carry state are walked from their contract's creation and cost more`,
  ].join("\n");
}

export function createPayer(testril, operator, log) {
  let spent = 0n;
  return {
    get spent() {
      return spent;
    },
    async call(name, args) {
      const first = await testril.call(name, args);
      if (first.outcome !== "payment_required") return succeeded(first, name);
      if (!operator)
        throw new Error(
          `Testril quoted ${name}; set TESTRIL_OPERATOR_KEY to pay.`,
        );
      const accepted = first.accepts.find(
        (a) => a.scheme === "batch-settlement",
      );
      if (!accepted)
        throw new Error(`Testril offered no batch settlement for ${name}.`);
      const { channels } = succeeded(
        await testril.call("inspect", {
          subject: "channels",
          payer: operator.address,
          network: accepted.network,
        }),
        "inspect",
      );
      const payment = await operator.pay(accepted, channels);
      const result = await testril.call(name, args, payment);
      if (result.outcome === "payment_required" || !result.settlement?.success)
        throw new Error(
          `Testril did not confirm payment for ${name}. Inspect the channel before running again.`,
        );
      spent += BigInt(accepted.amount);
      log(`  paid ${accepted.amount} atoms for ${name}`);
      return succeeded(result, name);
    },
  };
}

async function waitForCoverage(testril, id, kind, window, log, pollMs) {
  for (;;) {
    const card = succeeded(
      await testril.call("inspect", {
        subject: "bound_function",
        bound_function_id: id,
      }),
      "inspect",
    );
    for (const range of card.materializing) {
      const job = succeeded(
        await testril.call("inspect", { subject: "job", job_id: range.job_id }),
        "inspect",
      );
      if (job.state === "failed" || job.state === "cancelled")
        throw new Error(`Testril job ${range.job_id} ${job.state}.`);
    }
    if (holes(kind, window, card.materialized).length === 0) return;
    log(`  waiting for ${card.materializing.length} job(s)`);
    await delay(pollMs);
  }
}

export async function recordBind(
  bind,
  { testril, payer, jobsLeft, log, pollMs },
) {
  const started = Date.now();
  const kind = windowKind(bind.window);
  const window = ends(kind, bind.window);
  const { bound_function_id: id } = succeeded(
    await testril.call("bind", {
      function_slug: bind.function_slug,
      chain_id: bind.chain_id,
      params: bind.params,
    }),
    "bind",
  );
  const card = succeeded(
    await testril.call("inspect", {
      subject: "bound_function",
      bound_function_id: id,
    }),
    "inspect",
  );
  const missing = holes(kind, window, [
    ...card.materialized,
    ...card.materializing,
  ]);
  if (missing.length > jobsLeft.count) return { pending: true };
  const jobs = [];
  for (const hole of missing) {
    const result = await payer.call("materialize", {
      bound_function_id: id,
      ...spell(kind, hole),
    });
    jobs.push(result.job.job_id);
    jobsLeft.count -= 1;
  }
  await waitForCoverage(testril, id, kind, window, log, pollMs);
  const rows = [];
  for (const part of chunks(kind, window, bind.read)) {
    const { values } = await payer.call("read", {
      bound_function_id: id,
      ...spell(kind, part),
      ...(bind.read?.key ? { key: bind.read.key } : {}),
    });
    rows.push(...values);
  }
  return {
    rows,
    boundFunction: {
      bound_function_id: id,
      function_slug: bind.function_slug,
      chain_id: bind.chain_id,
      jobs,
      materialized: missing.map((hole) => spell(kind, hole)),
      ms: Date.now() - started,
    },
  };
}

export async function record(
  demoDir,
  {
    testril,
    operator,
    maxJobs = Infinity,
    only,
    log = console.info,
    pollMs = 5000,
  },
) {
  const spec = await loadSpec(demoDir);
  const path = join(demoDir, "recordings", "report.json");
  const previous = JSON.parse(await readFile(path, "utf8").catch(() => "{}"));
  const report =
    previous.source === "dev"
      ? previous
      : { demo: spec.demo, source: "dev", boundFunctions: {}, rows: {} };
  report.window = Object.fromEntries(spec.binds.map((b) => [b.name, b.window]));
  const payer = createPayer(testril, operator, log);
  const jobsLeft = { count: maxJobs };
  const pending = [];
  for (const bind of spec.binds) {
    if (only && bind.name !== only) continue;
    log(`${bind.name}: ${bind.function_slug} on chain ${bind.chain_id}`);
    const result = await recordBind(bind, {
      testril,
      payer,
      jobsLeft,
      log,
      pollMs,
    });
    if (result.pending) {
      pending.push(bind.name);
      log("  skipped: --max-jobs reached");
      continue;
    }
    report.rows[bind.name] = result.rows;
    report.boundFunctions[bind.name] = result.boundFunction;
    report.recordedAt = new Date().toISOString();
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  }
  log(`spent ${payer.spent} atoms (${usd(payer.spent)})`);
  return { report, pending };
}

function parseArgs(argv) {
  const options = { demos: [], plan: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--plan") options.plan = true;
    else if (argv[i] === "--max-jobs") options.maxJobs = Number(argv[++i]);
    else if (argv[i] === "--only") options.only = argv[++i];
    else options.demos.push(resolve(argv[i]));
  }
  return options;
}

async function main() {
  const envFile = fileURLToPath(new URL(".env", import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.TESTRIL_MCP_URL;
  if (!url) throw new Error("Set TESTRIL_MCP_URL in tools/prepare/.env.");
  if (options.demos.length === 0)
    throw new Error("Name at least one demo directory.");
  const testril = await connectTestril(url);
  try {
    for (const demoDir of options.demos) {
      if (options.plan) {
        const rows = await plan(await loadSpec(demoDir), testril);
        console.info(formatPlan(basename(demoDir), rows));
        continue;
      }
      const key = process.env.TESTRIL_OPERATOR_KEY;
      const { pending } = await record(demoDir, {
        testril,
        operator: key ? createOperator(key) : undefined,
        maxJobs: options.maxJobs,
        only: options.only,
      });
      if (pending.length)
        console.info(`Run again to record: ${pending.join(", ")}`);
    }
  } finally {
    await testril.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
