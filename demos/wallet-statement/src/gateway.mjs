import {
  scope,
  maxPages,
  atoms,
  chargeCap,
  depositCap,
  validateRows,
} from "../public/model.js";
import { selectOffer, paymentPlan } from "../public/payments.js";
import { confirmedReceipt, nansenRows } from "./providers.mjs";
import { failure, describeFailure } from "./errors.mjs";

const actions = [
  "bind",
  "coverage",
  "read",
  "materialize",
  "job",
  "provenance",
  "transactions",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/;
export function newRun(payer, window = "day", id = crypto.randomUUID()) {
  if (
    typeof payer !== "string" ||
    !/^0x[0-9a-f]{40}$/i.test(payer) ||
    !uuid.test(id)
  )
    throw failure("INVALID_REQUEST");
  try {
    scope(window);
  } catch {
    throw failure("INVALID_REQUEST");
  }
  return {
    id,
    payer,
    window,
    created: Date.now(),
    charges: "0",
    deposits: "0",
    bound: null,
    job: null,
    challenge: null,
    pending: null,
    stopped: false,
    operations: [],
  };
}
export function publicRun(run) {
  return {
    id: run.id,
    payer: run.payer,
    window: run.window,
    charges: run.charges,
    deposits: run.deposits,
    stopped: run.stopped,
    pending: run.pending,
    operations: run.operations,
  };
}
export async function execute(run, input, { providers, persist }) {
  if (!input || typeof input !== "object") throw failure("INVALID_REQUEST");
  const provider = input.action === "transactions" ? "nansen" : "testril";
  const details = { provider, operation: input.action };
  if (
    !input ||
    Object.keys(input).some(
      (k) => !["action", "page", "payment", "id"].includes(k),
    ) ||
    !actions.includes(input.action) ||
    !uuid.test(input.id)
  )
    throw failure("INVALID_REQUEST");
  if (
    run.hour !== undefined || // Older hourly purchases remain inspectable, never replayed.
    run.stopped ||
    run.pending ||
    Date.now() - run.created > 3600000 ||
    run.operations.length >= 128
  )
    throw failure("RUN_STOPPED");
  if (run.operations.some((o) => o.id === input.id))
    throw failure("RUN_STOPPED");
  const report = scope(run.window);
  if (input.action !== "bind" && provider === "testril" && !run.bound)
    throw failure("INVALID_REQUEST");
  if (
    input.action === "transactions" &&
    (!Number.isSafeInteger(input.page) ||
      input.page < 1 ||
      input.page > maxPages)
  )
    throw failure("INVALID_REQUEST");
  if (input.action === "job" && !run.job) throw failure("INVALID_REQUEST");
  const args = {
    bound_function_id: run.bound,
    from_time: report.from_time,
    to_time: report.to_time,
  };
  const saved = run.challenge;
  let paymentRecord;
  const save = async () => {
    try {
      await persist(run);
    } catch {
      throw failure("STATE_UNAVAILABLE");
    }
  };
  const started = performance.now();
  if (input.payment) {
    if (
      !saved ||
      saved.action !== input.action ||
      saved.page !== input.page ||
      Date.now() - saved.at > 90000 ||
      JSON.stringify(saved.accepted) !== JSON.stringify(input.payment.accepted)
    )
      throw failure("INVALID_REQUEST");
    const deposit = input.payment.payload?.deposit?.amount ?? "0";
    if (deposit !== saved.plan.depositAmount) throw failure("INVALID_REQUEST");
    if (
      saved.accepted.scheme === "batch-settlement" &&
      (JSON.stringify(input.payment.payload?.channelConfig) !==
        JSON.stringify(saved.plan.config) ||
        input.payment.payload?.voucher?.channelId !== saved.plan.channelId ||
        input.payment.payload.voucher.maxClaimableAmount !== saved.plan.maximum)
    )
      throw failure("INVALID_REQUEST");
    const charges = atoms(run.charges) + atoms(saved.accepted.amount),
      deposits = atoms(run.deposits) + atoms(deposit);
    if (charges > atoms(chargeCap) || deposits > atoms(depositCap))
      throw failure("LIMIT_EXCEEDED");
    paymentRecord = {
      id: input.id,
      provider,
      action: input.action,
      amount: saved.accepted.amount,
      deposit,
      confirmed: false,
      receipt: null,
    };
    run.charges = charges.toString();
    run.deposits = deposits.toString();
    run.operations.push(paymentRecord);
    run.pending = input.id;
    run.challenge = null;
    await save(); // Persist the intent before forwarding a signature.
  } else if (
    saved &&
    saved.action === input.action &&
    saved.page === input.page &&
    Date.now() - saved.at < 90000
  ) {
    return { outcome: "payment_required", ...saved };
  }
  let result;
  try {
    if (provider === "nansen")
      result = await providers.nansen(run.window, input.page, input.payment);
    else {
      const requests = {
        bind: [
          "bind",
          {
            chain_id: 1,
            function_slug: "erc20.wallet_transfers",
            params: { wallet: report.wallet, tokens: [report.token] },
          },
        ],
        coverage: [
          "inspect",
          { subject: "bound_function", bound_function_id: run.bound },
        ],
        job: ["inspect", { subject: "job", job_id: run.job }],
        read: ["read", args],
        materialize: ["materialize", args],
        provenance: ["provenance", args],
      };
      result = await providers.testril(
        ...requests[input.action],
        input.payment,
      );
    }
    if (input.payment) {
      paymentRecord.receipt = result.receipt;
      paymentRecord.confirmed = confirmedReceipt(
        result.receipt,
        paymentRecord.amount,
        run.payer,
      );
      run.pending = paymentRecord.confirmed ? null : input.id;
      run.stopped = !paymentRecord.confirmed;
      await save();
      if (!paymentRecord.confirmed) throw failure("PAYMENT_UNCERTAIN", details);
    }
    if (result.challenge) {
      let accepted, plan;
      try {
        accepted = selectOffer(result.challenge, provider);
        if (provider === "nansen" && accepted.maxTimeoutSeconds < 150)
          throw new Error("Short payment validity");
        let channels = [];
        if (accepted.scheme === "batch-settlement") {
          const r = await providers.testril("inspect", {
            subject: "channels",
            payer: run.payer,
            network: "eip155:8453",
          });
          if (r.value?.outcome !== "success")
            throw new Error("Channel inspection failed");
          channels = r.value.channels;
        }
        plan = paymentPlan(accepted, channels, run.payer);
      } catch {
        throw failure("PROVIDER_INVALID_RESPONSE", details);
      }
      if (
        atoms(run.charges) + atoms(accepted.amount) > atoms(chargeCap) ||
        atoms(run.deposits) + atoms(plan.depositAmount) > atoms(depositCap)
      )
        throw failure("LIMIT_EXCEEDED");
      run.challenge = {
        action: input.action,
        ...(input.page ? { page: input.page } : {}),
        at: Date.now(),
        accepted,
        plan,
        challenge: result.challenge,
      };
      await save();
      return { outcome: "payment_required", ...run.challenge };
    }
    let value;
    try {
      if (provider === "nansen") {
        if (result.status !== 200)
          throw new Error("Nansen refused the request");
        value = nansenRows(result.text, report);
        if (value.pagination.page !== input.page) throw new Error("Wrong page");
      } else {
        value = result.value;
        if (input.action === "read" && value?.kind === "range_unavailable") {
          value = {
            outcome: "error",
            kind: "range_unavailable",
            inProgress: Boolean(value.materializing?.length),
          };
        } else {
          if (value?.outcome === "error") {
            if (input.action === "bind")
              throw failure("TESTRIL_BINDING_REJECTED", {
                functionSlug: "erc20.wallet_transfers",
                reason: [
                  "invalid_params",
                  "function_not_found",
                  "unsupported_chain",
                ].includes(value.kind)
                  ? value.kind
                  : "unknown",
              });
            throw failure("PROVIDER_REFUSED", details);
          }
          if (value?.outcome !== "success")
            throw new Error("Testril refused the request");
          if (input.action === "bind") {
            if (!/^sha256:[a-f0-9]{64}$/.test(value.bound_function_id))
              throw new Error("Invalid binding");
            run.bound = value.bound_function_id;
            value = { bound_function_id: run.bound };
          }
          if (input.action === "read")
            value = { rows: validateRows(value.values, report, provider) };
          if (input.action === "materialize") {
            if (!/^job:\d+$/.test(value.job?.job_id))
              throw new Error("Invalid job");
            run.job = value.job.job_id;
            value = { job_id: run.job };
          }
          if (input.action === "coverage") {
            const jobs = (value.active_jobs ?? []).filter((id) =>
              /^job:\d+$/.test(id),
            );
            if (jobs.length) run.job = jobs[0];
            value = {
              materialized: value.materialized ?? [],
              activeJobs: jobs,
            };
          }
          if (input.action === "job")
            value = {
              state: value.state,
              done: value.blocks_done,
              total: value.blocks_total,
            };
          if (input.action === "provenance") {
            if (
              !Array.isArray(value.blocks) ||
              value.bound_function_id !== run.bound ||
              value.blocks.length > report.to_block - report.from_block ||
              value.chain_id !== 1 ||
              value.from_block !== report.from_block ||
              value.to_block !== report.to_block ||
              value.block_count !== value.blocks.length ||
              !/^sha256:[a-f0-9]{64}$/.test(value.digest) ||
              value.computation?.id !== "erc20.wallet_transfers" ||
              value.computation?.version !== 1 ||
              value.orphaned?.length
            )
              throw new Error("Invalid provenance");
            const blocks = value.blocks.map((b) => {
              if (
                !Number.isSafeInteger(b.number) ||
                b.number < report.from_block ||
                b.number >= report.to_block ||
                !/^0x[a-f0-9]{64}$/.test(b.block_hash)
              )
                throw new Error("Invalid block");
              return { number: b.number, block_hash: b.block_hash };
            });
            value = {
              outcome: "success",
              bound_function_id: run.bound,
              chain_id: 1,
              from_block: report.from_block,
              to_block: report.to_block,
              block_count: blocks.length,
              blocks,
              digest: value.digest,
              computation: {
                kind: "function",
                id: "erc20.wallet_transfers",
                version: 1,
              },
            };
          }
        }
      }
    } catch (error) {
      if (describeFailure(error)) throw error;
      throw failure("PROVIDER_INVALID_RESPONSE", details);
    }
    run.challenge = null;
    await save();
    return {
      outcome: "success",
      value,
      payment: paymentRecord ?? null,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    run.stopped = true;
    if (input.payment && run.pending) run.pending = input.id;
    const primary = describeFailure(error)
      ? error
      : failure(
          input.payment && !paymentRecord.confirmed
            ? "PAYMENT_UNCERTAIN"
            : "PROVIDER_UNAVAILABLE",
          details,
        );
    try {
      await save();
    } catch {
      /* The pre-submission intent remains the durable fallback. */
    }
    throw primary;
  }
}
