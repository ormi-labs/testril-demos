import { reportSpec, paymentNetwork, usdc } from "../public/model.js";
import { connectTestril, createAllium } from "./providers.mjs";

const spec = reportSpec(process.env.REPORT_FROM_HOUR);
const peer = await connectTestril(
  process.env.TESTRIL_MCP_URL ?? "https://dev.testril.ai/mcp",
);
try {
  const bound = await peer.call("bind", {
    chain_id: spec.chainId,
    function_slug: "uniswap_v3.pool_volume",
    params: { by: "hour", swap: { pool_list: { factory: spec.factory } } },
  });
  if (bound.outcome !== "success")
    throw new Error("Testril could not bind this report.");
  const window = {
    bound_function_id: bound.bound_function_id,
    from_hour: spec.fromHour,
    to_hour: spec.toHour,
  };
  const coverage = await peer.call("inspect", {
    subject: "bound_function",
    bound_function_id: bound.bound_function_id,
  });
  const read = await peer.call("read", { ...window, key: { pool: spec.pool } });
  const preparation =
    read.kind === "range_unavailable"
      ? await peer.call("materialize", window)
      : null;
  const summary = (value) =>
    value
      ? {
          outcome: value.outcome,
          kind: value.kind,
          amount: value.amount,
          lines: value.lines,
          offers: value.accepts?.map((a) => ({
            scheme: a.scheme,
            network: a.network,
            asset: a.asset,
            amount: a.amount,
          })),
        }
      : null;
  const allium = await createAllium(
    process.env.ALLIUM_URL ?? "https://agents.allium.so",
  ).call("POST", "/api/v1/explorer/queries/run-async", {
    parameters: { sql: "SELECT 1 AS value" },
  });
  console.info(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        note: "Unpaid discovery only. No signatures or paid work. A 402 is not proof of data delivery.",
        report: spec,
        requiredPayment: { network: paymentNetwork, asset: usdc },
        boundFunctionId: bound.bound_function_id,
        coverage: {
          materialized: coverage.materialized,
          materializing: coverage.materializing,
          activeJobs: coverage.active_jobs,
        },
        read: summary(read),
        preparation: summary(preparation),
        alliumSqlSubmission: summary(allium),
      },
      null,
      2,
    ),
  );
} finally {
  await peer.close();
}
