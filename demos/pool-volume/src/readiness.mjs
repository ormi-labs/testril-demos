import { atoms, chargeCap, paymentNetwork, usdc } from "../public/model.js";
import { selectOffer } from "../public/payments.js";

function quoteSummary(value) {
  return {
    outcome: value.outcome,
    kind: value.kind,
    amount: value.amount && {
      atoms: value.amount.atoms,
      usd: value.amount.usd,
    },
    lines: value.lines?.map((line) => ({
      label: line.label,
      units: line.units,
      amount: { atoms: line.amount?.atoms, usd: line.amount?.usd },
    })),
    offers: value.accepts?.map((offer) => ({
      scheme: offer.scheme,
      network: offer.network,
      asset: offer.asset,
      amount: offer.amount,
      domainName: offer.extra?.name,
      domainVersion: offer.extra?.version,
    })),
  };
}

function checkQuote(value, name, blockers) {
  if (value.outcome !== "payment_required") {
    blockers.push(`${name} did not return a payment challenge.`);
    return 0n;
  }
  try {
    const offer = selectOffer(value, name === "Testril" ? "testril" : "allium");
    if (offer.extra.name !== "USD Coin")
      throw new Error("The signing domain must use native Base USD Coin.");
    return atoms(offer.amount);
  } catch (error) {
    blockers.push(`${name}: ${error.message}`);
    return 0n;
  }
}

export async function probeReadiness({ spec, testril, allium }) {
  const blockers = [];
  const result = {
    checkedAt: new Date().toISOString(),
    note: "Unpaid discovery only. No signatures or paid work. A 402 is not proof of data delivery.",
    report: spec,
    requiredPayment: { network: paymentNetwork, asset: usdc },
    chargeCap,
    providers: {},
  };
  let quotedCharges = 0n;
  try {
    const peer = await testril();
    try {
      const bound = await peer.call("bind", {
        chain_id: spec.chainId,
        function_slug: "uniswap_v3.pool_volume",
        params: { by: "hour", swap: { pool_list: { factory: spec.factory } } },
      });
      if (bound.outcome !== "success")
        throw new Error("Report binding failed.");
      const window = {
        bound_function_id: bound.bound_function_id,
        from_hour: spec.fromHour,
        to_hour: spec.toHour,
      };
      const coverage = await peer.call("inspect", {
        subject: "bound_function",
        bound_function_id: bound.bound_function_id,
      });
      if (coverage.outcome !== "success")
        throw new Error("Coverage inspection failed.");
      const read = await peer.call("read", {
        ...window,
        key: { pool: spec.pool },
      });
      const testrilResult = {
        boundFunctionId: bound.bound_function_id,
        coverage: {
          materialized: coverage.materialized ?? [],
          materializing: coverage.materializing ?? [],
          activeJobs: coverage.active_jobs ?? [],
        },
        read: quoteSummary(read),
      };
      result.providers.testril = testrilResult;
      if (read.outcome === "error" && read.kind === "range_unavailable") {
        blockers.push(
          "Testril report coverage is not ready for visitor reads.",
        );
        if (coverage.active_jobs?.length || read.materializing?.length) {
          blockers.push(
            "Wait for existing Testril preparation before rechecking.",
          );
        } else {
          const preparation = await peer.call("materialize", window);
          testrilResult.preparation = quoteSummary(preparation);
          quotedCharges += checkQuote(preparation, "Testril", blockers);
          // Check the service's quoted total even if its payment rail is unsupported.
          if (
            preparation.amount &&
            atoms(preparation.amount.atoms) > atoms(chargeCap)
          )
            blockers.push(
              `Testril preparation quotes ${preparation.amount.usd}, exceeding the run charge cap. Prepare shared coverage or use a narrower supported scope; do not raise the visitor cap.`,
            );
        }
      } else if (read.outcome === "payment_required") {
        quotedCharges += checkQuote(read, "Testril", blockers);
      } else if (read.outcome !== "success") {
        blockers.push("Testril could not read the fixed report.");
      }
    } finally {
      await peer.close();
    }
  } catch {
    blockers.push(
      "Testril discovery failed. Check its endpoint and report support.",
    );
    result.providers.testril ??= { outcome: "discovery_failed" };
  }
  try {
    const quote = await allium.call(
      "POST",
      "/api/v1/explorer/queries/run-async",
      {
        parameters: { sql: "SELECT 1 AS value" },
      },
    );
    result.providers.allium = { sqlSubmission: quoteSummary(quote) };
    quotedCharges += checkQuote(quote, "Allium", blockers);
  } catch {
    blockers.push(
      "Allium discovery failed. Check its machine-payment endpoint.",
    );
    result.providers.allium = { outcome: "discovery_failed" };
  }
  if (quotedCharges > atoms(chargeCap))
    blockers.push("The discovered quotes exceed the combined run charge cap.");
  return {
    ...result,
    readyForWalletTrial: blockers.length === 0,
    paidExecutionVerified: false,
    remainingVerification: [
      "Settle bounded payments and retrieve completed results from both providers.",
      "Reconcile pool volumes and swap counts before publishing a measured recording.",
      "Include any additional Allium status and result charges within the run cap.",
    ],
    blockers,
  };
}
