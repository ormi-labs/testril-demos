import { randomUUID } from "node:crypto";
import {
  atoms,
  chargeCap,
  depositCap,
  decimal,
  normalizeRows,
  paymentNetwork,
} from "../public/model.js";
import { selectOffer, paymentPlan } from "../public/payments.js";
import { alliumSql } from "./providers.mjs";

const providerState = (stage) => ({
  stage,
  status: "ready",
  phase: "read",
  payments: [],
  events: [],
  rows: null,
});
const safeReceipt = (r) =>
  r
    ? {
        success: r.success,
        network: r.network,
        payer: r.payer,
        transaction: r.transaction,
        chargedAmount: r.extra?.chargedAmount,
      }
    : null;
const success = (value) => {
  if (value.outcome !== "success")
    throw new Error(
      `Testril refused the request (${value.kind ?? value.outcome}).`,
    );
  return value;
};

function checkLimits(run, accepted, deposit, phase) {
  const payments = Object.values(run.providers).flatMap((p) => p.payments);
  if (
    payments.reduce((sum, p) => sum + atoms(p.amount), 0n) +
      atoms(accepted.amount) >
    atoms(chargeCap)
  ) {
    throw new Error(
      `${phase === "preparation" ? "Preparation" : "This request"} quotes ${decimal(accepted.amount)} USDC and exceeds the remaining ${decimal(chargeCap)} USDC run charge allowance.${phase === "preparation" ? " Prepare the fixed report's coverage before enabling visitor runs." : ""}`,
    );
  }
  if (
    payments.reduce((sum, p) => sum + atoms(p.depositAmount), 0n) +
      atoms(deposit) >
    atoms(depositCap)
  )
    throw new Error(
      "The escrow deposit exceeds the run's separate deposit allowance.",
    );
}

export function createRun(spec, wallet) {
  return {
    id: randomUUID(),
    spec,
    wallet,
    createdAt: Date.now(),
    providers: {
      testril: providerState("bind"),
      allium: providerState("submit"),
    },
    busy: false,
  };
}

export function publicProvider(state) {
  return {
    status: state.status,
    stage: state.stage,
    phase: state.phase,
    rows: state.rows,
    payments: state.payments,
    events: state.events,
    error: state.error,
    coverage: state.coverage,
    runId: state.runId,
    boundFunctionId: state.boundFunctionId,
  };
}

export async function advance(run, name, payment, peers) {
  if (!["testril", "allium"].includes(name))
    throw new Error("Unknown provider.");
  const state = run.providers[name];
  if (run.busy) throw new Error("Another request is already in progress.");
  if (["done", "error"].includes(state.status))
    throw new Error(
      "This provider has finished. Start a new run to try again.",
    );
  if (Date.now() - run.createdAt > 600000 || state.events.length >= 180)
    throw new Error(
      "The run expired. Reconcile any payments before starting again.",
    );
  run.busy = true;
  const started = performance.now();
  const operationStage = state.stage;
  state.phase = ["bind", "coverage", "materialize", "job"].includes(state.stage)
    ? "preparation"
    : "read";
  try {
    if (payment && !state.challenge)
      throw new Error("There is no pending payment to authorize.");
    if (payment) {
      const expected = state.challenge.accepted;
      if (JSON.stringify(payment.accepted) !== JSON.stringify(expected))
        throw new Error("The payment does not match the pending quote.");
      const plan = paymentPlan(expected, state.challenge.channels, run.wallet);
      checkLimits(run, expected, plan.depositAmount, state.phase);
      const suppliedDeposit = payment.payload?.deposit?.amount ?? "0";
      if (suppliedDeposit !== plan.depositAmount)
        throw new Error(
          "The escrow deposit does not match the approved amount.",
        );
      state.payments.push({
        phase: state.phase,
        amount: expected.amount,
        depositAmount: suppliedDeposit,
        confirmation: "unconfirmed",
        receipt: null,
      });
    } else if (state.challenge) {
      return {
        ...publicProvider(state),
        status: "payment_required",
        ...state.challenge,
      };
    }
    let result;
    if (name === "testril")
      result = await testrilStep(run, state, peers.testril, payment);
    else result = await alliumStep(run, state, peers.allium, payment);
    if (result.outcome === "payment_required") {
      if (payment)
        throw new Error(
          "The paid request was challenged again. Reconcile the payment before retrying.",
        );
      const accepted = selectOffer(result, name);
      const channels =
        name === "testril" && accepted.scheme === "batch-settlement"
          ? success(
              await peers.testril.call("inspect", {
                subject: "channels",
                payer: run.wallet,
                network: paymentNetwork,
              }),
            ).channels
          : [];
      const plan = paymentPlan(accepted, channels, run.wallet);
      checkLimits(run, accepted, plan.depositAmount, state.phase);
      state.challenge = {
        challenge: result,
        accepted,
        channels,
        depositAmount: plan.depositAmount,
      };
      return {
        ...publicProvider(state),
        status: "payment_required",
        ...state.challenge,
      };
    }
    if (payment) {
      const entry = state.payments.at(-1);
      entry.receipt = safeReceipt(result.receipt);
      const r = entry.receipt;
      if (
        r?.success === true &&
        r.network === paymentNetwork &&
        r.payer?.toLowerCase() === run.wallet.toLowerCase() &&
        (r.chargedAmount === undefined || r.chargedAmount === entry.amount)
      )
        entry.confirmation = "confirmed";
    }
    state.challenge = null;
    state.status = state.rows ? "done" : "running";
    return {
      ...publicProvider(state),
      waitMs: ["job", "status"].includes(state.stage) ? 1500 : 0,
    };
  } catch (error) {
    state.status = "error";
    state.error = error.message;
    state.challenge = null;
    return publicProvider(state);
  } finally {
    state.events.push({
      stage: operationStage,
      phase: state.phase,
      elapsedMs: Math.round(performance.now() - started),
      paid: Boolean(payment),
    });
    run.busy = false;
  }
}

async function testrilStep(run, state, peer, payment) {
  const window = {
    bound_function_id: state.boundFunctionId,
    from_hour: run.spec.fromHour,
    to_hour: run.spec.toHour,
  };
  let result;
  if (state.stage === "bind") {
    result = success(
      await peer.call("bind", {
        chain_id: run.spec.chainId,
        function_slug: "uniswap_v3.pool_volume",
        params: {
          by: "hour",
          swap: { pool_list: { factory: run.spec.factory } },
        },
      }),
    );
    state.boundFunctionId = result.bound_function_id;
    if (!/^sha256:[a-f0-9]{64}$/.test(state.boundFunctionId))
      throw new Error("Testril returned an invalid bound function id.");
    state.stage = "coverage";
  } else if (state.stage === "coverage") {
    result = success(
      await peer.call("inspect", {
        subject: "bound_function",
        bound_function_id: state.boundFunctionId,
      }),
    );
    state.coverage = {
      materialized: result.materialized ?? [],
      materializing: result.materializing ?? [],
      activeJobs: result.active_jobs ?? [],
    };
    state.remainingJobs = [...state.coverage.activeJobs];
    state.stage = "read";
  } else if (state.stage === "read") {
    result = await peer.call(
      "read",
      { ...window, key: { pool: run.spec.pool } },
      payment,
    );
    if (
      result.outcome === "error" &&
      result.kind === "range_unavailable" &&
      !payment
    ) {
      if (state.remainingJobs?.length) {
        state.jobId = state.remainingJobs.shift();
        state.stage = "job";
        return result;
      }
      if (result.materializing?.length)
        throw new Error(
          "There is paid materialization already in progress. Wait for it to finish before starting another run; no new preparation was purchased.",
        );
      state.stage = "materialize";
      return result;
    }
    if (result.outcome !== "payment_required") {
      success(result);
      state.rows = normalizeRows(result.values, run.spec);
    }
  } else if (state.stage === "materialize") {
    result = await peer.call("materialize", window, payment);
    if (result.outcome !== "payment_required") {
      success(result);
      state.jobId = result.job?.job_id;
      if (!state.jobId)
        throw new Error("Materialization returned no job handle.");
      state.stage = "job";
    }
  } else if (state.stage === "job") {
    result = success(
      await peer.call("inspect", { subject: "job", job_id: state.jobId }),
    );
    if (["failed", "canceled"].includes(result.state))
      throw new Error(
        `Testril materialization ${result.state}. Inspect job ${state.jobId} before retrying.`,
      );
    if (result.state === "done") state.stage = "read";
  }
  return result;
}

async function alliumStep(run, state, peer, payment) {
  let result;
  if (state.stage === "submit") {
    result = await peer.call(
      "POST",
      "/api/v1/explorer/queries/run-async",
      { parameters: { sql: alliumSql(run.spec) }, run_config: { limit: 1000 } },
      payment,
    );
    if (result.outcome !== "payment_required") {
      state.runId = result.value.run_id;
      if (!/^[a-f0-9-]{36}$/i.test(state.runId))
        throw new Error("Allium returned an invalid run id.");
      state.stage = "status";
    }
  } else if (state.stage === "status") {
    result = await peer.call(
      "GET",
      `/api/v1/explorer/query-runs/${state.runId}/status`,
      null,
      payment,
    );
    if (result.outcome !== "payment_required") {
      const status =
        typeof result.value === "string" ? result.value : result.value.status;
      if (["failed", "canceled"].includes(status))
        throw new Error(`Allium query ${status}. Run id: ${state.runId}.`);
      if (status === "success") state.stage = "results";
      else if (!["created", "running", "queued"].includes(status))
        throw new Error("Allium returned an unknown query status.");
    }
  } else if (state.stage === "results") {
    result = await peer.call(
      "GET",
      `/api/v1/explorer/query-runs/${state.runId}/results?f=json`,
      null,
      payment,
    );
    if (result.outcome !== "payment_required")
      state.rows = normalizeRows(result.value.data, run.spec);
  }
  return result;
}
