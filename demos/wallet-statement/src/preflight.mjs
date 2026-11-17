import { createProviders } from "./providers.mjs";
import { scope } from "../public/model.js";
import { selectOffer } from "../public/payments.js";

const peers = createProviders({
  testrilUrl: process.env.TESTRIL_MCP_URL,
  nansenUrl: process.env.NANSEN_URL,
});
const report = scope(),
  checks = {},
  blockers = [];
try {
  const binding = await peers.testril("bind", {
    chain_id: 1,
    function_slug: "erc20.wallet_transfers",
    params: { wallet: report.wallet, tokens: [report.token] },
  });
  if (binding.value?.outcome !== "success") throw new Error("Binding refused");
  const args = {
    bound_function_id: binding.value.bound_function_id,
    from_time: report.from_time,
    to_time: report.to_time,
  };
  for (const name of ["read", "provenance"]) {
    let operation = name;
    let r = await peers.testril(name, args);
    if (name === "read" && r.value?.kind === "range_unavailable") {
      checks.coverage = "Preparation needed";
      checks.read = { result: "requires_preparation" };
      operation = "materialize";
      r = await peers.testril("materialize", args);
    }
    if (r.challenge) {
      const a = selectOffer(r.challenge, "testril");
      checks[operation] = {
        result: "payment_offered",
        scheme: a.scheme,
        amount: a.amount,
      };
    } else if (r.value?.outcome === "success")
      checks[operation] = { result: "data_returned_without_payment" };
    else if (name === "provenance" && r.value?.kind === "range_unavailable")
      checks[operation] = { result: "requires_preparation" };
    else throw new Error("Operation unavailable");
  }
} catch {
  blockers.push("Testril wallet-transfer discovery failed.");
}
try {
  const r = await peers.nansen("day", 1);
  const a = selectOffer(r.challenge, "nansen");
  if (a.maxTimeoutSeconds < 150) throw new Error("Unsupported validity");
  checks.nansen = {
    result: "payment_offered",
    amount: a.amount,
    validitySeconds: a.maxTimeoutSeconds,
  };
} catch {
  blockers.push("Nansen accountless transaction discovery failed.");
}
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      readyForWalletTrial: !blockers.length,
      paidExecutionVerified: false,
      checks,
      blockers,
      note: "No signing, payment, materialization job or transfer was submitted. Discovery is not proof of paid delivery.",
    },
    null,
    2,
  ),
);
if (blockers.length) process.exitCode = 1;
