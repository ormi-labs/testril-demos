import { setTimeout as delay } from "node:timers/promises";
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
  async function execute(entry) {
    if (entry.verb === "read")
      readProgress(entry.args.bound_function_id, entry.args.from_block, "paid");
    const result = succeeded(
      await mcp.call(entry.verb, { payment_id: entry.paymentId }),
      entry.verb,
    );
    entry.result = result;
    entry.status = "done";
    await save();
    return result;
  }
  async function paid(verb, args) {
    const key = JSON.stringify([verb, args]);
    const cached = state.receipts.find(
      (r) => r.cacheKey === key && r.status === "done",
    );
    if (cached) return cached.result;
    const waiting = state.receipts.find(
      (r) => r.cacheKey === key && r.status === "paid",
    );
    if (waiting && Date.now() - Date.parse(waiting.timestamp) < 120000)
      return execute(waiting);
    if (waiting) {
      waiting.status = "expired";
      await save();
    }
    const quote = await mcp.call(verb, args);
    if (quote.outcome === "success") return quote;
    if (quote.outcome !== "payment_required") return quote;
    const entry = await settle(async () => {
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
        requestCount: verb === "read" ? 1 : 0,
        block: args.from_block,
        timestamp: new Date().toISOString(),
      };
      state.receipts.push(entry);
      state.depositedRaw = (
        BigInt(state.depositedRaw) + BigInt(signed.depositRaw)
      ).toString();
      await save();
      const settled = succeeded(
        await mcp.call("pay_quote", {
          quote_id: quote.quote_id,
          payload: signed.payload,
        }),
        "pay_quote",
      );
      if (typeof settled.payment_id !== "string")
        throw new Error("The paid quote returned no payment id.");
      const index = channels.findIndex(
        (c) => c.channelId === signed.channel.channelId,
      );
      if (index < 0) channels.push(signed.channel);
      else channels[index] = signed.channel;
      entry.paymentId = settled.payment_id;
      entry.status = "paid";
      await save();
      return entry;
    });
    return execute(entry);
  }
  async function readWindow(id, block) {
    const args = {
      bound_function_id: id,
      from_block: block,
      to_block: block + 1,
    };
    let result = await paid("read", args);
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
