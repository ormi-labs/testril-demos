// Opt-in operator check. Never included in `npm test` or the browser test suite.
import { chromium } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createApp, fileStore } from "../src/server.mjs";
import { compare, usdc, maxPages } from "../public/model.js";

if (
  process.env.ALLOW_PAID_SMOKE !== "1" ||
  !process.env.TESTRIL_PAYER_PRIVATE_KEY
)
  throw new Error("Explicit paid-smoke configuration is required.");
const account = privateKeyToAccount(process.env.TESTRIL_PAYER_PRIVATE_KEY);
const rpc = createPublicClient({
  transport: http("https://mainnet.base.org", { retryCount: 0 }),
});
const directory = await mkdtemp(join(tmpdir(), "wallet-statement-live-"));
const app = createApp({ store: fileStore(directory) });
await new Promise((done) => app.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let currentQuote,
  charges = 0n,
  deposits = 0n;
try {
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
        if (!currentQuote || Number(data.domain.chainId) !== 8453)
          throw new Error("Unexpected signing domain");
        if (
          data.primaryType === "TransferWithAuthorization" &&
          (data.domain.verifyingContract.toLowerCase() !== usdc.toLowerCase() ||
            data.message.value !== currentQuote.accepted.amount ||
            data.message.to !== currentQuote.accepted.payTo)
        )
          throw new Error("Unexpected authorization");
        if (
          ![
            "TransferWithAuthorization",
            "ReceiveWithAuthorization",
            "Voucher",
          ].includes(data.primaryType)
        )
          throw new Error("Unexpected signature type");
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
  await page.goto(`http://127.0.0.1:${app.address().port}/`);
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
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
        /Run complete|could not|stopped|needs checking/.test(
          document.querySelector("#notice").textContent,
        ),
      null,
      { timeout: 90000 },
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
    if (charges > 100000n || deposits > 10000n)
      throw new Error("Operator trial allowance reached");
    await page.getByRole("button", { name: "Approve and sign" }).click();
  }
  await page.waitForFunction(
    () =>
      document.querySelector("#notice").textContent.startsWith("Run complete"),
    null,
    { timeout: 90000 },
  );
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
  await page
    .getByRole("button", { name: "Rebuild from saved evidence" })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("#proof-status").textContent ===
      "Saved evidence replay passed",
  );
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
  app.closeAllConnections();
  await new Promise((done) => app.close(done));
}
