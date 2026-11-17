// Explicitly funded operator benchmark; never runs with npm test.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scope, token } from "../public/model.js";
import { selectOffer, paymentPlan, signPayment } from "../public/payments.js";
import {
  createProviders,
  safeReceipt,
  confirmedReceipt,
} from "../src/providers.mjs";
import { execute, newRun } from "../src/gateway.mjs";
import { nansenTotal } from "../src/transfer-total.mjs";

if (process.env.ALLOW_PAID_SMOKE !== "1")
  throw new Error("Explicit paid-smoke configuration is required.");
const account = privateKeyToAccount(process.env.TESTRIL_PAYER_PRIVATE_KEY);
if (account.address !== process.env.PAID_SMOKE_EXPECTED_PAYER)
  throw new Error("Unexpected operator wallet.");
const prior = JSON.parse(
  await readFile(process.env.PAID_TOTAL_PRIOR_JOURNAL, "utf8"),
);
if (prior.payer.toLowerCase() !== account.address.toLowerCase())
  throw new Error("Wrong prior journal.");
const priorReserved = BigInt(prior.charges) + BigInt(prior.deposits);
const combinedLimit = 2000000n;
const newLimit = 100000n; // At most another 0.10 USDC, including deposits.
const directory = await mkdtemp(join(tmpdir(), "pool-flows-total-"));
const report = scope("day"); // Fixed, independently checked 10 November 2026 UTC.
const journal = {
  createdAt: new Date().toISOString(),
  payer: account.address,
  scope: report,
  priorReservedAtoms: priorReserved.toString(),
  newLimitAtoms: newLimit.toString(),
  combinedLimitAtoms: combinedLimit.toString(),
  status: "running",
  payments: [],
};
const save = () =>
  writeFile(join(directory, "trial.json"), JSON.stringify(journal), {
    mode: 0o600,
  });
async function reserve(provider, quote) {
  const amount = BigInt(quote.accepted.amount);
  const deposit = BigInt(quote.plan.depositAmount);
  const reserved =
    journal.payments.reduce(
      (s, p) => s + BigInt(p.amount) + BigInt(p.deposit),
      0n,
    ) +
    amount +
    deposit;
  if (reserved > newLimit || priorReserved + reserved > combinedLimit)
    throw new Error("Trial allowance reached.");
  const record = {
    id: crypto.randomUUID(),
    provider,
    amount: amount.toString(),
    deposit: deposit.toString(),
    status: "reserved",
  };
  journal.payments.push(record);
  await save();
  return record;
}
const rpc = createPublicClient({
  transport: http("https://mainnet.base.org", { retryCount: 0 }),
});
const wallet = {
  async request({ method, params }) {
    if (method === "eth_accounts") return [account.address];
    if (method === "eth_chainId") return "0x2105";
    if (["eth_getCode", "eth_call"].includes(method))
      return rpc.request({ method, params });
    if (method === "eth_signTypedData_v4")
      return account.signTypedData(JSON.parse(params[1]));
    throw new Error("Unexpected wallet method.");
  },
};
const providers = createProviders();
console.log(
  JSON.stringify({ evidenceDirectory: directory, date: "2026-11-10" }),
);
try {
  await save();
  const url = "https://api.nansen.ai/api/v1/profiler/address/counterparties";
  const body = JSON.stringify({
    address: report.wallet,
    chain: "ethereum",
    date: { from: report.from_time, to: "2026-11-10T23:59:59Z" },
    source_input: "Tokens",
    group_by: "wallet",
    pagination: { page: 1, per_page: 1000 },
  });
  const request = (payment) =>
    fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      headers: {
        "content-type": "application/json",
        ...(payment
          ? {
              "payment-signature": Buffer.from(
                JSON.stringify(payment),
              ).toString("base64"),
            }
          : {}),
      },
      body,
    });
  const quoteStart = performance.now();
  const unsigned = await request();
  if (unsigned.status !== 402)
    throw new Error("Expected Nansen payment quote.");
  const challenge = JSON.parse(
    Buffer.from(unsigned.headers.get("payment-required"), "base64").toString(),
  );
  await unsigned.arrayBuffer();
  const accepted = selectOffer(challenge, "nansen");
  if (accepted.maxTimeoutSeconds < 150)
    throw new Error("Short quote validity.");
  const plan = paymentPlan(accepted, [], account.address);
  const quoteMs = performance.now() - quoteStart;
  const paymentRecord = await reserve("nansen", { accepted, plan });
  const payment = await signPayment(
    wallet,
    account.address,
    challenge,
    accepted,
    plan,
  );
  payment.extensions = {
    "payment-identifier": { info: { id: paymentRecord.id } },
  };
  paymentRecord.status = "pending";
  await save(); // Save intent, never the signature, before submitting it once.
  const paidStart = performance.now();
  const paid = await request(payment);
  const text = await paid.text();
  const receipt = safeReceipt(
    JSON.parse(
      Buffer.from(
        paid.headers.get("payment-response") ?? "",
        "base64",
      ).toString(),
    ),
  );
  paymentRecord.receipt = receipt;
  if (!confirmedReceipt(receipt, accepted.amount, account.address))
    throw new Error("Nansen payment is uncertain; no replay.");
  paymentRecord.status = "confirmed";
  await save();
  if (paid.status !== 200) throw new Error("Nansen did not return data.");
  const total = nansenTotal(JSON.parse(text), token);
  if (!total.last) throw new Error("Nansen summary needs more than one page.");
  journal.nansen = {
    endpoint: url,
    request: JSON.parse(body),
    count: total.count,
    entries: total.entries,
    counterparties: total.counterparties,
    requests: 1,
    quoteMs: Math.round(quoteMs),
    paidResponseMs: Math.round(performance.now() - paidStart),
    readMs: Math.round(quoteMs + performance.now() - paidStart),
    serviceAtoms: accepted.amount,
  };
  await save();
  console.log(
    JSON.stringify({
      nansen: {
        ...journal.nansen,
        counterparties: total.counterparties.length,
      },
    }),
  );

  const run = newRun(account.address);
  const persist = () =>
    writeFile(join(directory, "testril-journal.json"), JSON.stringify(run), {
      mode: 0o600,
    });
  await execute(
    run,
    { action: "bind", id: crypto.randomUUID() },
    { providers, persist },
  );
  const tQuoteStart = performance.now();
  const input = { action: "read", id: crypto.randomUUID() };
  const quote = await execute(run, input, { providers, persist });
  if (quote.outcome !== "payment_required")
    throw new Error("Expected Testril read quote.");
  const tQuoteMs = performance.now() - tQuoteStart;
  const tRecord = await reserve("testril", quote);
  const tPayment = await signPayment(
    wallet,
    account.address,
    quote.challenge,
    quote.accepted,
    quote.plan,
  );
  tPayment.extensions = { "payment-identifier": { info: { id: input.id } } };
  tRecord.id = input.id;
  tRecord.status = "pending";
  await save();
  const tPaidStart = performance.now();
  const result = await execute(
    run,
    { ...input, payment: tPayment },
    { providers, persist },
  );
  const tPaidMs = performance.now() - tPaidStart;
  tRecord.status = result.payment.confirmed ? "confirmed" : "pending";
  tRecord.receipt = result.payment.receipt;
  journal.testril = {
    function: "erc20.wallet_transfers",
    count: String(result.value.rows.length),
    requests: 1,
    quoteMs: Math.round(tQuoteMs),
    paidResponseMs: Math.round(tPaidMs),
    readMs: Math.round(tQuoteMs + tPaidMs),
    serviceAtoms: quote.accepted.amount,
    preparation: "Already materialized; no new preparation purchased.",
    method:
      "Retrieve transfers and count locally; no wallet-count Function exists.",
  };
  journal.matches = journal.testril.count === journal.nansen.count;
  journal.status = journal.matches ? "done" : "mismatch";
  await writeFile(
    join(directory, "testril-rows.json"),
    JSON.stringify(result.value.rows),
    { mode: 0o600 },
  );
  await save();
  console.log(
    JSON.stringify({ testril: journal.testril, matches: journal.matches }),
  );
} catch {
  journal.status = "stopped";
  await save();
  console.error(
    "Trial stopped; inspect its journal. Do not automatically rerun.",
  );
  process.exitCode = 1;
}
