import { setTimeout as delay } from "node:timers/promises";
import { acceptedQuote, signBatchPayment } from "./batch-payment.mjs";
import { succeeded } from "./mcp.mjs";

// State is persisted before a signature can authorize a charge or a deposit.
export function createLiveTestril(config, mcp, state, save) {
  async function execute(entry) {
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
    if (state.receipts.some((r) => r.status === "paying"))
      throw new Error(
        "A payment has an uncertain result. Reconcile its quote before authorizing another payment.",
      );
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
    const accepted = acceptedQuote(quote, config);
    const amount = BigInt(accepted.amount);
    const spent = state.receipts.reduce(
      (sum, r) => sum + BigInt(r.chargeRaw),
      0n,
    );
    if (spent + amount > BigInt(state.chargeCapRaw))
      throw new Error("The Testril charge cap would be exceeded.");
    const channels = succeeded(
      await mcp.call("inspect", {
        subject: "channels",
        payer: config.payer.address,
        network: accepted.network,
      }),
      "inspect",
    );
    const signed = await signBatchPayment(
      accepted,
      channels.channels,
      config,
      (BigInt(state.depositCapRaw) - BigInt(state.depositedRaw)).toString(),
    );
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
    entry.paymentId = settled.payment_id;
    entry.status = "paid";
    await save();
    return execute(entry);
  }
  return {
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
        if (
          result.chain_id !== config.chain.id ||
          !Number.isSafeInteger(result.head) ||
          result.head < 0
        )
          throw new Error("Testril cannot report the Base Sepolia chain head.");
        if (result.head >= minimumBlock) return result.head;
        await delay(200);
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
    async read(id, block) {
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
          await delay(1000);
        }
        if (!done)
          throw new Error(
            "Testril is still materializing. Use Refresh live reads.",
          );
        result = await paid("read", args);
      }
      return succeeded(result, "read").values;
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
