import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { acceptedQuote, signBatchPayment } from "./batch-payment.mjs";
import { succeeded } from "./mcp.mjs";
import { demoFailure, describeFailure, failureMessage } from "./errors.mjs";

async function bindFunction(mcp, chainId, slug, wallet, params, schemaFixture) {
  try {
    const result = succeeded(
      await mcp.call("bind", {
        function_slug: slug,
        chain_id: chainId,
        params,
      }),
      "bind",
    );
    if (
      typeof result.bound_function_id !== "string" ||
      !result.bound_function_id ||
      result.bound_function_id.length > 512
    )
      throw demoFailure(
        "TESTRIL_RESPONSE_INVALID",
        "Testril bind returned an invalid Function identifier.",
        { operation: "bind" },
      );
    return result.bound_function_id;
  } catch (error) {
    const failure = describeFailure(error);
    const context = wallet ? ` (${wallet.name})` : "";
    const details = {
      functionSlug: slug,
      ...(wallet && { walletId: wallet.id }),
    };
    if (
      failure?.code === "TESTRIL_OPERATION_REJECTED" &&
      failure.details.operation === "bind"
    ) {
      const { reason } = failure.details;
      const hint =
        reason === "invalid_params"
          ? ` Its params schema may have changed in a Testril release; compare with ${schemaFixture}.`
          : "";
      throw demoFailure(
        "TESTRIL_BINDING_REJECTED",
        `Testril refused binding ${slug}${context}: ${reason}.${hint}`,
        { ...details, reason },
      );
    }
    if (
      [
        "TESTRIL_REQUEST_FAILED",
        "TESTRIL_RESPONSE_INVALID",
        "TESTRIL_PAYMENT_CHALLENGE_INVALID",
      ].includes(failure?.code)
    )
      throw demoFailure(
        failure.code,
        `Testril could not bind ${slug}${context}. ${failureMessage(error)}`,
        { ...failure.details, ...details },
      );
    throw error;
  }
}

export async function bindLiveFunctions(mcp, config) {
  const functions = {
    edges: await bindFunction(
      mcp,
      config.chain.id,
      "erc20.transfer_edges",
      undefined,
      { token_address: config.token.address },
      "test/fixtures/erc20-transfer-edges-params.json",
    ),
  };
  for (const wallet of config.wallets)
    functions[wallet.id] = await bindFunction(
      mcp,
      config.chain.id,
      "erc20.token_balance",
      wallet,
      {
        reads: {
          tokens: [config.token.address],
          owners: [wallet.address],
        },
      },
      "test/fixtures/erc20-token-balance-params.json",
    );
  return functions;
}

export async function inspectChainHead(mcp, chainId) {
  const result = succeeded(
    await mcp.call("inspect", { subject: "chain", chain_id: chainId }),
    "inspect",
  );
  const head = result.head?.block;
  if (result.chain_id !== chainId || !Number.isSafeInteger(head) || head < 0)
    throw demoFailure(
      "TESTRIL_HEAD_UNAVAILABLE",
      "Testril cannot report the Base Sepolia chain head.",
    );
  return head;
}

function materializationPending(result, block) {
  if (result.outcome !== "error" || result.kind !== "range_unavailable")
    return false;
  const ranges = result.materializing ?? [];
  if (
    !Array.isArray(ranges) ||
    !ranges.every(
      (range) =>
        range !== null &&
        typeof range === "object" &&
        !Array.isArray(range) &&
        Number.isSafeInteger(range.from_block) &&
        Number.isSafeInteger(range.to_block) &&
        range.from_block >= 0 &&
        range.to_block > range.from_block,
    )
  )
    throw demoFailure(
      "TESTRIL_RESPONSE_INVALID",
      "Testril read returned invalid materialization ranges.",
      { operation: "read" },
    );
  return ranges.some(
    (range) => range.from_block <= block && range.to_block >= block + 1,
  );
}

// State is persisted before a signature can authorize a charge or a deposit.
export function createLiveTestril(
  config,
  mcp,
  state,
  save,
  measure = (_name, operation) => operation(),
  readProgress = (_id, _block, _phase) => {},
  authorizePayment = async (_payment) => {},
) {
  let payments = Promise.resolve();
  let channels;
  const reads = new Map();
  // Cumulative vouchers must settle in order; resource execution can overlap.
  function settle(operation) {
    const previous = payments;
    const result = (async () => {
      await measure("Payment queue wait", () => previous);
      return operation();
    })();
    payments = result.catch(() => {});
    return result;
  }
  async function paid(verb, args) {
    const key = JSON.stringify([verb, args]);
    const cached = state.receipts.find(
      (r) => r.cacheKey === key && r.status === "done",
    );
    if (cached) return cached.result;
    if (state.receipts.some((r) => r.cacheKey === key && r.status === "paid"))
      throw demoFailure(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "A paid request did not finish. Reconcile its quote before paying again.",
        { reason: "unfinished-request" },
      );
    const quote = await mcp.call(verb, args);
    if (quote.outcome === "success") return quote;
    if (quote.outcome !== "payment_required") return quote;
    return settle(async () => {
      if (state.receipts.some((r) => r.status === "paying"))
        throw demoFailure(
          "PAYMENT_RECONCILIATION_REQUIRED",
          "A payment has an uncertain result. Reconcile its quote before authorizing another payment.",
          { reason: "uncertain-settlement" },
        );
      const accepted = acceptedQuote(quote, config);
      const amount = BigInt(accepted.amount);
      const spent = state.receipts.reduce(
        (sum, r) => sum + BigInt(r.chargeRaw),
        0n,
      );
      if (spent + amount > BigInt(state.chargeCapRaw))
        throw demoFailure(
          "PAYMENT_LIMIT_REACHED",
          "The Testril charge cap would be exceeded.",
          { limit: "charge" },
        );
      channels ??= succeeded(
        await mcp.call("inspect", {
          subject: "channels",
          payer: config.payer.address,
          network: accepted.network,
        }),
        "inspect",
      ).channels;
      const signed = await measure("Sign Testril payment", () =>
        signBatchPayment(
          accepted,
          channels,
          config,
          (BigInt(state.depositCapRaw) - BigInt(state.depositedRaw)).toString(),
        ),
      );
      await authorizePayment({
        quoteId: quote.quote_id,
        chargeRaw: accepted.amount,
        depositRaw: signed.depositRaw,
      });
      const entry = {
        mode: "live",
        id: quote.quote_id,
        kind: verb === "materialize" ? "materialization" : "reads",
        function: args.bound_function_id,
        verb,
        args,
        cacheKey: key,
        status: "paying",
        chargeRaw: accepted.amount,
        depositRaw: signed.depositRaw,
        lines: quote.lines,
        requestCount: verb === "read" ? 1 : 0,
        block: args.from_block,
        timestamp: new Date().toISOString(),
        paymentIdentifier: randomUUID(),
      };
      state.receipts.push(entry);
      state.depositedRaw = (
        BigInt(state.depositedRaw) + BigInt(signed.depositRaw)
      ).toString();
      await save();
      const payment = JSON.parse(signed.payload);
      // Name the request without persisting its signature. A lost settlement
      // remains quarantined; no second payment is authorized automatically.
      payment.extensions = {
        "payment-identifier": { info: { id: entry.paymentIdentifier } },
      };
      const result = await measure("Settle Testril payment", () =>
        mcp.call(verb, args, payment),
      );
      const response = result.paymentResponse;
      if (
        response?.success !== true ||
        response.network !== accepted.network ||
        typeof response.payer !== "string" ||
        response.payer.toLowerCase() !== config.payer.address.toLowerCase() ||
        (response.chargedAmount !== undefined &&
          response.chargedAmount !== accepted.amount)
      )
        throw demoFailure(
          "PAYMENT_RECONCILIATION_REQUIRED",
          "The paid call returned no matching settlement confirmation. Reconcile its quote before paying again.",
          { reason: "missing-settlement" },
        );
      const index = channels.findIndex(
        (c) => c.channelId === signed.channel.channelId,
      );
      if (index < 0) channels.push(signed.channel);
      else channels[index] = signed.channel;
      entry.result = result;
      entry.status = result.outcome === "success" ? "done" : "paid";
      await save();
      if (verb === "read")
        readProgress(args.bound_function_id, args.from_block, "paid");
      return result;
    });
  }
  async function readWindow(id, block) {
    const args = {
      bound_function_id: id,
      from_block: block,
      to_block: block + 1,
    };
    let result = await paid("read", args);
    const until = Date.now() + 60000;
    while (materializationPending(result, block)) {
      if (Date.now() >= until)
        throw demoFailure(
          "TESTRIL_MATERIALIZING",
          "Testril is still materializing. Use Refresh to retry.",
          {},
        );
      await measure("Materialization polling sleep", () => delay(200));
      result = await paid("read", args);
    }
    if (result.outcome === "error" && result.kind === "range_unavailable") {
      const work = succeeded(await paid("materialize", args), "materialize");
      const jobId = work.job?.job_id;
      if (typeof jobId !== "string")
        throw demoFailure(
          "TESTRIL_RESPONSE_INVALID",
          "Materialization returned no job handle.",
          { operation: "materialize" },
        );
      const until = Date.now() + 60000;
      let done = false;
      while (Date.now() < until) {
        const job = succeeded(
          await mcp.call("inspect", { subject: "job", job_id: jobId }),
          "inspect",
        );
        const status = job.state;
        if (status === "done") {
          done = true;
          break;
        }
        if (status === "failed")
          throw demoFailure(
            "TESTRIL_MATERIALIZATION_FAILED",
            "Testril materialization failed. Refresh to inspect the same job.",
            {},
          );
        await measure("Materialization polling sleep", () => delay(200));
      }
      if (!done)
        throw demoFailure(
          "TESTRIL_MATERIALIZING",
          "Testril is still materializing. Use Refresh to retry.",
          {},
        );
      readProgress(id, block, "materialized");
      result = await paid("read", args);
    }
    const values = succeeded(result, "read").values;
    if (!Array.isArray(values))
      throw demoFailure(
        "TESTRIL_RESPONSE_INVALID",
        "Testril read returned invalid rows.",
        { operation: "read" },
      );
    readProgress(id, block, "done");
    return values;
  }
  return {
    beginReadBatch() {
      channels = undefined;
    },
    async head(minimumBlock = 0) {
      const until = Date.now() + 60000;
      do {
        const head = await inspectChainHead(mcp, config.chain.id);
        if (head >= minimumBlock) return head;
        await measure("Chain-head polling sleep", () => delay(200));
      } while (Date.now() < until);
      throw demoFailure(
        "TESTRIL_CATCHING_UP",
        "Testril is still catching up with the transfer. Use Refresh to retry.",
        {},
      );
    },
    read(id, block) {
      const key = JSON.stringify([id, block]);
      if (!reads.has(key)) {
        const result = readWindow(id, block).finally(() => reads.delete(key));
        reads.set(key, result);
      }
      return reads.get(key);
    },
    async provenance(id, block) {
      return succeeded(
        await mcp.call("provenance", {
          bound_function_id: id,
          from_block: block,
          to_block: block + 1,
        }),
        "provenance",
      );
    },
  };
}
