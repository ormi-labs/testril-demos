import { scope, atoms, chargeCap, depositCap } from "./model.js";

class Stop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const phaseFor = (action) =>
  ["bind", "coverage", "materialize", "job"].includes(action)
    ? "preparation"
    : action === "provenance"
      ? "provenance"
      : "query";
export async function runComparison({
  hour,
  payer,
  request,
  approve,
  sign,
  persist,
  onChange = () => {},
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  const run = {
    schemaVersion: 1,
    kind: "live",
    status: "running",
    createdAt: new Date().toISOString(),
    scope: scope(hour),
    payer,
    id: null,
    pending: null,
    providers: Object.fromEntries(
      ["testril", "nansen"].map((name) => [
        name,
        {
          status: "waiting",
          rows: [],
          payments: [],
          events: [],
          timing: {
            query: 0,
            preparation: 0,
            provenance: 0,
            wallet: 0,
            total: 0,
          },
        },
      ]),
    ),
  };
  const save = async () => {
    try {
      await persist(run);
    } catch {
      throw new Stop(
        "STATE_UNAVAILABLE",
        "This browser could not save the run. No further payment will be submitted.",
      );
    }
    onChange(run);
  };
  const started = performance.now();
  let active;
  async function action(provider, name, page) {
    const target = run.providers[provider],
      phase = phaseFor(name),
      id = crypto.randomUUID();
    active = target;
    target.stage = name;
    target.status = "running";
    await save();
    const body = { action: name, id, ...(page ? { page } : {}) };
    const start = performance.now();
    let wait = 0;
    let reply = await request(`api/runs/${run.id}/step`, body);
    if (reply.outcome === "payment_required") {
      const payments = Object.values(run.providers).flatMap((p) => p.payments);
      if (
        payments.reduce((s, p) => s + atoms(p.amount), 0n) +
          atoms(reply.accepted.amount) >
          atoms(chargeCap) ||
        payments.reduce((s, p) => s + atoms(p.depositAmount), 0n) +
          atoms(reply.plan.depositAmount) >
          atoms(depositCap)
      )
        throw new Stop(
          "LIMIT_EXCEEDED",
          "This purchase exceeds the remaining run allowance.",
        );
      target.status = "approval";
      onChange(run);
      const walletStart = performance.now();
      if (
        !(await approve({
          provider,
          action: name,
          phase,
          amount: reply.accepted.amount,
          deposit: reply.plan.depositAmount,
          payTo: reply.accepted.payTo,
        }))
      )
        throw new Stop(
          "CANCELLED",
          "Run cancelled. Earlier completed purchases are retained below.",
        );
      let payment;
      try {
        payment = await sign(reply);
      } catch {
        throw new Stop(
          "SIGNING_DECLINED",
          "Wallet signing was declined or unavailable. This request was not submitted.",
        );
      }
      wait = performance.now() - walletStart;
      target.timing.wallet += wait;
      payment.extensions = { "payment-identifier": { info: { id } } };
      const record = {
        id,
        phase,
        action: name,
        amount: reply.accepted.amount,
        depositAmount: reply.plan.depositAmount,
        confirmed: false,
        receipt: null,
      };
      target.payments.push(record);
      run.pending = { id, provider, action: name };
      await save(); // A durable browser record precedes the signed HTTP request.
      reply = await request(`api/runs/${run.id}/step`, { ...body, payment });
      if (!reply.payment?.confirmed)
        throw new Stop(
          "PAYMENT_UNCERTAIN",
          "The payment needs checking. No automatic resubmission will occur.",
        );
      record.confirmed = true;
      record.receipt = reply.payment.receipt;
      run.pending = null;
      await save();
    }
    if (reply.outcome !== "success")
      throw new Stop(
        "REQUEST_FAILED",
        "The provider did not complete this step.",
      );
    const elapsed = Math.round(performance.now() - start - wait);
    target.timing[phase] += elapsed;
    target.events.push({ action: name, phase, elapsedMs: elapsed });
    await save();
    return reply.value;
  }
  try {
    await save();
    const created = await request("api/runs", { payer, hour });
    run.id = created.id;
    await save();
    const t = run.providers.testril,
      tStart = performance.now();
    const bound = await action("testril", "bind");
    run.scope.bound_function_id = bound.bound_function_id;
    const coverage = await action("testril", "coverage");
    t.coverage = coverage;
    let read = await action("testril", "read");
    if (read.kind === "range_unavailable") {
      if (read.inProgress && !coverage.activeJobs.length)
        throw new Stop(
          "PREPARATION_IN_PROGRESS",
          "This report is already being prepared. Wait for that work to finish before starting another run.",
        );
      if (!coverage.activeJobs.length) await action("testril", "materialize");
      let done = false;
      for (let i = 0; i < 180; i++) {
        const job = await action("testril", "job");
        if (job.state === "done") {
          done = true;
          break;
        }
        if (["failed", "canceled"].includes(job.state))
          throw new Stop(
            "PREPARATION_FAILED",
            "Preparation stopped. Inspect the existing job before buying it again.",
          );
        const wait = performance.now();
        await sleep(1000);
        t.timing.preparation += performance.now() - wait;
      }
      if (!done)
        throw new Stop(
          "PREPARATION_PENDING",
          "Preparation is still running. This run will not buy it again.",
        );
      read = await action("testril", "read");
    }
    if (!Array.isArray(read.rows))
      throw new Stop("INVALID_RESULT", "Testril did not return transfers.");
    t.rows = read.rows;
    t.provenance = await action("testril", "provenance");
    t.status = "done";
    t.timing.total = Math.round(performance.now() - tStart);
    await save();
    const n = run.providers.nansen,
      nStart = performance.now();
    for (let page = 1; page <= 20; page++) {
      const value = await action("nansen", "transactions", page);
      n.rows.push(...value.rows);
      if (n.rows.length > 3000)
        throw new Stop(
          "REPORT_TOO_LARGE",
          "The report exceeds this demo's row limit.",
        );
      n.pages = page;
      if (value.pagination.last) {
        n.status = "done";
        break;
      }
    }
    if (n.status !== "done")
      throw new Stop(
        "INCOMPLETE_REPORT",
        "Pagination did not finish within this demo's limits.",
      );
    n.timing.total = Math.round(performance.now() - nStart);
    run.status = "done";
  } catch (error) {
    run.status =
      error instanceof Stop && error.code === "CANCELLED"
        ? "cancelled"
        : "stopped";
    run.error =
      error instanceof Stop
        ? error.message
        : "The request could not finish. Any submitted payment must be checked before another run.";
    if (active && active.status !== "done") active.status = "stopped";
    if (run.id && run.pending) {
      try {
        const stored = await request(`api/runs/${run.id}`);
        for (const op of stored.operations) {
          for (const p of Object.values(run.providers).flatMap(
            (p) => p.payments,
          )) {
            if (p.id === op.id) {
              p.confirmed = op.confirmed;
              p.receipt = op.receipt;
            }
          }
        }
        if (!stored.pending) run.pending = null;
      } catch {
        /* Keep the original pending intent if its status is unknown. */
      }
    }
  }
  run.elapsedMs = Math.round(performance.now() - started);
  try {
    await save();
  } catch {
    run.error =
      "The final run could not be saved. Download it now to retain its evidence.";
    run.status = "stopped";
    onChange(run);
  }
  return run;
}
