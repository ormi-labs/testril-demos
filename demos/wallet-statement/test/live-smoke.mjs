// Opt-in operator check. Never included in `npm test` or the browser test suite.
import { chromium } from "@playwright/test";
import { mkdtemp, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createApp, fileStore } from "../src/server.mjs";
import { createProviders } from "../src/providers.mjs";
import { collector, escrow } from "../public/payments.js";
import {
  compare,
  usdc,
  maxPages,
  chargeCap,
  depositCap,
  scope,
} from "../public/model.js";

if (
  process.env.ALLOW_PAID_SMOKE !== "1" ||
  !process.env.TESTRIL_PAYER_PRIVATE_KEY
)
  throw new Error("Explicit paid-smoke configuration is required.");
const reportDate =
  process.env.PAID_SMOKE_DATE ??
  new Date(Date.now() - 86400000).toISOString().slice(0, 10);
scope(reportDate);
function limit(name, fallback, maximum) {
  const value = process.env[name] ?? fallback;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > BigInt(maximum))
    throw new Error("Invalid operator allowance");
  return BigInt(value);
}
const serviceCap = limit("PAID_SMOKE_SERVICE_CAP_ATOMS", "100000", chargeCap);
const newDepositCap = limit(
  "PAID_SMOKE_DEPOSIT_CAP_ATOMS",
  "10000",
  depositCap,
);
const combinedCap = limit("PAID_SMOKE_COMBINED_CAP_ATOMS", "110000", chargeCap);
const account = privateKeyToAccount(process.env.TESTRIL_PAYER_PRIVATE_KEY);
if (
  process.env.PAID_SMOKE_EXPECTED_PAYER &&
  account.address.toLowerCase() !==
    process.env.PAID_SMOKE_EXPECTED_PAYER.toLowerCase()
)
  throw new Error("Unexpected operator wallet");
const balanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];
const rpc = createPublicClient({
  transport: http(
    process.env.PAID_SMOKE_BASE_RPC_URL ?? "https://mainnet.base.org",
    { retryCount: 0 },
  ),
});
const directory = await mkdtemp(join(tmpdir(), "wallet-statement-live-"));
let app;
let target = process.env.PAID_SMOKE_URL;
if (target && target !== "https://demos.testril.si/pool-flows/")
  throw new Error("Use the production demo or the local operator server");
if (!target) {
  app = createApp({
    store: fileStore(directory),
    providers: createProviders({
      testrilUrl: process.env.TESTRIL_MCP_URL,
      nansenUrl: process.env.NANSEN_URL,
      ethereumRpcUrl: process.env.ETHEREUM_RPC_URL,
      async fetcher(url, options) {
        const response = await fetch(url, options);
        if (new URL(url).pathname === "/api/v1/profiler/address/transactions") {
          // Metadata only: never log headers, signatures or provider bodies.
          try {
            await appendFile(
              join(directory, "provider-http.jsonl"),
              JSON.stringify({
                provider: "nansen",
                page: JSON.parse(options.body).pagination.page,
                paid: Boolean(options.headers["PAYMENT-SIGNATURE"]),
                status: response.status,
                hasQuote: response.headers.has("payment-required"),
                hasReceipt: response.headers.has("payment-response"),
              }) + "\n",
              { mode: 0o600 },
            );
          } catch {
            // Diagnostics cannot discard a completed provider response.
          }
        }
        return response;
      },
    }),
  });
  await new Promise((done) => app.listen(0, "127.0.0.1", done));
  target = `http://127.0.0.1:${app.address().port}/`;
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const reservations = [];
let currentQuote,
  approved,
  charges = 0n,
  deposits = 0n;
console.log(
  JSON.stringify({
    target,
    date: reportDate,
    payer: account.address,
    evidenceDirectory: directory,
    serviceCapAtoms: serviceCap.toString(),
    newDepositCapAtoms: newDepositCap.toString(),
    combinedCapAtoms: combinedCap.toString(),
  }),
);
try {
  const balance = await rpc.readContract({
    address: usdc,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < combinedCap)
    throw new Error("Fund the operator allowance before starting");
  page.on("response", async (response) => {
    if (response.url().endsWith("/step")) {
      try {
        const r = await response.json();
        if (r.outcome === "payment_required") currentQuote = r;
      } catch {
        /* The app records failed HTTP results. */
      }
    }
  });
  await page.exposeFunction(
    "operatorWalletRequest",
    async ({ method, params }) => {
      if (["eth_accounts", "eth_requestAccounts"].includes(method))
        return [account.address];
      if (method === "eth_chainId") return "0x2105";
      if (["eth_getCode", "eth_call"].includes(method))
        return rpc.request({ method, params });
      if (method === "eth_signTypedData_v4") {
        const data = JSON.parse(params[1]);
        if (
          !approved ||
          approved.usedTypes.has(data.primaryType) ||
          Number(data.domain.chainId) !== 8453
        )
          throw new Error("Unexpected signing domain");
        if (
          data.primaryType === "TransferWithAuthorization" &&
          (data.domain.verifyingContract.toLowerCase() !== usdc.toLowerCase() ||
            data.message.value !== approved.quote.accepted.amount ||
            data.message.to !== approved.quote.accepted.payTo)
        )
          throw new Error("Unexpected authorization");
        if (
          data.primaryType === "TransferWithAuthorization" &&
          approved.quote.accepted.scheme !== "exact"
        )
          throw new Error("Wrong signature scheme");
        if (
          data.primaryType === "ReceiveWithAuthorization" &&
          (approved.quote.accepted.scheme !== "batch-settlement" ||
            data.domain.verifyingContract.toLowerCase() !==
              usdc.toLowerCase() ||
            data.message.to.toLowerCase() !== collector.toLowerCase() ||
            data.message.value !== approved.quote.plan.depositAmount)
        )
          throw new Error("Unexpected deposit authorization");
        if (
          data.primaryType === "Voucher" &&
          (approved.quote.accepted.scheme !== "batch-settlement" ||
            data.domain.verifyingContract.toLowerCase() !==
              escrow.toLowerCase() ||
            data.message.channelId !== approved.quote.plan.channelId ||
            data.message.maxClaimableAmount !== approved.quote.plan.maximum)
        )
          throw new Error("Unexpected voucher authorization");
        if (
          data.primaryType !== "Voucher" &&
          data.message.from.toLowerCase() !== account.address.toLowerCase()
        )
          throw new Error("Unexpected payer");
        if (
          ![
            "TransferWithAuthorization",
            "ReceiveWithAuthorization",
            "Voucher",
          ].includes(data.primaryType)
        )
          throw new Error("Unexpected signature type");
        approved.usedTypes.add(data.primaryType);
        return account.signTypedData(data);
      }
      throw new Error("Unexpected wallet method");
    },
  );
  await page.addInitScript(() => {
    window.ethereum = {
      request: (request) => window.operatorWalletRequest(request),
    };
  });
  await page.goto(target);
  if (page.url() !== target) throw new Error("Unexpected demo URL");
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
  await page.locator("#report-date").fill(reportDate);
  await page.locator("#report-date").blur();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  for (let i = 0; i < maxPages + 10; i++) {
    await page.waitForFunction(
      () =>
        document.querySelector("#payment-dialog").open ||
        ["done", "stopped", "cancelled"].includes(
          JSON.parse(localStorage.getItem("testril-wallet-statement:last-run"))
            ?.status,
        ),
      null,
      { timeout: 240000 },
    );
    if (!(await page.getByRole("dialog").isVisible())) break;
    if (
      !currentQuote ||
      currentQuote.accepted.network !== "eip155:8453" ||
      currentQuote.accepted.asset.toLowerCase() !== usdc.toLowerCase()
    )
      throw new Error("Unsupported quote");
    charges += BigInt(currentQuote.accepted.amount);
    deposits += BigInt(currentQuote.plan.depositAmount);
    if (
      charges > serviceCap ||
      deposits > newDepositCap ||
      charges + deposits > combinedCap
    )
      throw new Error("Operator trial allowance reached");
    approved = { quote: structuredClone(currentQuote), usedTypes: new Set() };
    reservations.push({
      action: currentQuote.action,
      page: currentQuote.page,
      amount: currentQuote.accepted.amount,
      newDeposit: currentQuote.plan.depositAmount,
    });
    await writeFile(
      join(directory, "allowance.json"),
      JSON.stringify({
        target,
        date: reportDate,
        serviceCap: serviceCap.toString(),
        depositCap: newDepositCap.toString(),
        combinedCap: combinedCap.toString(),
        reservations,
      }),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        approving: currentQuote.action,
        page: currentQuote.page,
        serviceAtomsReserved: charges.toString(),
        depositAtomsReserved: deposits.toString(),
      }),
    );
    await page.getByRole("button", { name: "Approve and sign" }).click();
    await page.waitForFunction(
      () => !document.querySelector("#payment-dialog").open,
    );
  }
  const run = JSON.parse(
    await page.evaluate(() =>
      localStorage.getItem("testril-wallet-statement:last-run"),
    ),
  );
  if (
    run.status !== "done" ||
    !compare(run.providers.testril.rows, run.providers.nansen.rows).matches
  )
    throw new Error("Paid comparison did not match");
  if (run.scope.window !== reportDate)
    throw new Error("The comparison used another day");
  const final = await page.evaluate(() =>
    localStorage.getItem("testril-wallet-statement:last-run"),
  );
  await writeFile(join(directory, "completed-run.json"), final, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      completed: true,
      evidence: join(directory, "completed-run.json"),
      serviceChargeAtoms: charges.toString(),
      newDepositAtoms: deposits.toString(),
      transfers: run.providers.testril.rows.length,
    }),
  );
} catch {
  const attempt = await page
    .evaluate(() => localStorage.getItem("testril-wallet-statement:last-run"))
    .catch(() => null);
  if (attempt)
    await writeFile(join(directory, "attempt.json"), attempt, { mode: 0o600 });
  console.error(
    `Paid smoke stopped. Review safe evidence in ${directory}; do not automatically rerun.`,
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  if (app) {
    app.closeAllConnections();
    await new Promise((done) => app.close(done));
  }
}
