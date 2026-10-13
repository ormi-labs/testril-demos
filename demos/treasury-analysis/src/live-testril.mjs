import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { acceptedQuote, signBatchPayment } from "./batch-payment.mjs";
import { succeeded } from "./mcp.mjs";

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
      throw new Error(
        "A paid request did not finish. Reconcile its quote before paying again.",
      );
    const quote = await mcp.call(verb, args);
    if (quote.outcome === "success") return quote;
    if (quote.outcome !== "payment_required") return quote;
    return settle(async () => {
      if (state.receipts.some((r) => r.status === "paying"))
        throw new Error(
          "A payment has an uncertain result. Reconcile its quote before authorizing another payment.",
        );
      const accepted = acceptedQuote(quote, config);
      const amount = BigInt(accepted.amount);
      const spent = state.receipts.reduce(
        (sum, r) => sum + BigInt(r.chargeRaw),
        0n,
      );
      if (spent + amount > BigInt(state.chargeCapRaw))
        throw new Error("The Testril charge cap would be exceeded.");
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
        requestCount: 1,
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
        throw new Error(
          "The paid call returned no matching settlement confirmation. Reconcile its quote before paying again.",
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
    while (
      result.outcome === "error" &&
      result.kind === "range_unavailable" &&
      result.materializing?.some(
        (range) => range.from_block <= block && range.to_block >= block + 1,
      )
    ) {
      if (Date.now() >= until)
        throw new Error(
          "Testril is still materializing. Use Refresh to retry.",
        );
      await measure("Materialization polling sleep", () => delay(200));
      result = await paid("read", args);
    }
    if (result.outcome === "error" && result.kind === "range_unavailable") {
      const work = succeeded(await paid("materialize", args), "materialize");
      const jobId = work.job?.job_id;
      if (typeof jobId !== "string")
        throw new Error("Materialization returned no job handle.");
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
          throw new Error(
            "Testril materialization failed. Refresh to inspect the same job.",
          );
        await measure("Materialization polling sleep", () => delay(200));
      }
      if (!done)
        throw new Error(
          "Testril is still materializing. Use Refresh to retry.",
        );
      readProgress(id, block, "materialized");
      result = await paid("read", args);
    }
    const values = succeeded(result, "read").values;
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
        const result = succeeded(
          await mcp.call("inspect", {
            subject: "chain",
            chain_id: config.chain.id,
          }),
          "inspect",
        );
        const head = result.head?.block;
        if (
          result.chain_id !== config.chain.id ||
          !Number.isSafeInteger(head) ||
          head < 0
        )
          throw new Error("Testril cannot report the Base Sepolia chain head.");
        if (head >= minimumBlock) return head;
        await measure("Chain-head polling sleep", () => delay(200));
      } while (Date.now() < until);
      throw new Error(
        "Testril is still catching up with the transfer. Use Refresh to retry.",
      );
    },
    async bind(slug, params) {
      return succeeded(
        await mcp.call("bind", {
          function_slug: slug,
          chain_id: 84532,
          params,
        }),
        "bind",
      ).bound_function_id;
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
