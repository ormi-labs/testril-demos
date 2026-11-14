import { test, expect } from "@playwright/test";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { account, separator } from "./peers.mjs";

async function installWallet(page) {
  await page.exposeFunction("signTestData", (value) =>
    account.signTypedData(value),
  );
  await page.addInitScript(
    ({ address, separator }) => {
      window.testSignatures = 0;
      window.ethereum = {
        async request({ method, params }) {
          if (["eth_accounts", "eth_requestAccounts"].includes(method))
            return [address];
          if (method === "eth_chainId") return "0x2105";
          if (method === "eth_call") return separator;
          if (method === "eth_getCode") return "0x6000";
          if (method === "eth_signTypedData_v4") {
            window.testSignatures++;
            return window.signTestData(JSON.parse(params[1]));
          }
          throw new Error("Unexpected wallet request");
        },
      };
    },
    { address: account.address, separator },
  );
}

test("recorded answers replay source evidence, catch a changed amount and fit the viewport", async ({
  page,
}, info) => {
  const paid = [];
  page.on("request", (r) => {
    if (r.method() === "POST") paid.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("#agreement")).toHaveText(
    "Every transfer and amount matches",
  );
  await expect(page.locator("#testril .count")).toHaveText("292");
  await expect(page.locator("#testril .query-time")).toHaveText(
    /^\d+\.\d{2} s$/,
  );
  await page
    .getByRole("button", { name: "Rebuild from saved evidence" })
    .click();
  await expect(page.locator("#proof-status")).toHaveText(
    "Saved evidence replay passed",
  );
  await expect(page.locator("#proof-result")).toContainText(
    "292 transfers rebuilt exactly",
  );
  await page.getByRole("button", { name: "Try an edited amount" }).click();
  await expect(page.locator("#proof-status")).toHaveText(
    "Edited copy rejected",
  );
  await expect(page.locator("#testril .count")).toHaveText("292");
  expect(paid).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const screenshots = new URL("../../../docs/screenshots/", import.meta.url);
  const screenshotPath = await access(screenshots)
    .then(() =>
      fileURLToPath(
        new URL(`wallet-statement-${info.project.name}.png`, screenshots),
      ),
    )
    .catch(() => info.outputPath("recorded.png"));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.selectOption("#hour", "13");
  await expect(page.locator("#testril .count")).toHaveText("503");
});

test("first Run click completes real HTTP adapters, approvals, all pages and source verification", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  for (let step = 0; step < 15; step++) {
    await expect
      .poll(
        async () =>
          (await page.locator("#notice").innerText()).startsWith(
            "Run complete",
          ) || (await page.getByRole("dialog").isVisible()),
      )
      .toBe(true);
    if ((await page.locator("#notice").innerText()).startsWith("Run complete"))
      break;
    await page.getByRole("button", { name: "Approve and sign" }).click();
  }
  await expect(page.locator("#notice")).toContainText("Run complete");
  await expect(page.locator("#agreement")).toHaveText(
    "Every transfer and amount matches",
  );
  await expect(page.locator("#nansen .provider-notes")).toContainText(
    "3 complete transaction pages",
  );
  await page
    .getByRole("button", { name: "Rebuild from saved evidence" })
    .click();
  await expect(page.locator("#proof-status")).toHaveText(
    "Saved evidence replay passed",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download this run" }).click(),
  ]);
  const value = await readFile(await download.path(), "utf8");
  expect(JSON.parse(value).status).toBe("done");
  expect(value).not.toMatch(/signature|PAYMENT-SIGNATURE|channelConfig/);
});

test("cancel stops without signing, and missing wallets are explained", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText("wallet extension");
  await installWallet(page);
  await page.reload();
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.locator("#notice")).toContainText("Run cancelled");
  expect(await page.evaluate(() => window.testSignatures)).toBe(0);
});

test("a failed live Ethereum request is not presented as successful verification", async ({
  page,
}) => {
  await page.route("https://rpc.mevblocker.io/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#agreement")).toContainText("Every transfer");
  await page
    .getByRole("button", { name: "Check live Ethereum records" })
    .click();
  await expect(page.locator("#proof-status")).toHaveText(
    "Check did not complete",
  );
  await page
    .getByRole("button", { name: "Rebuild from saved evidence" })
    .click();
  await expect(page.locator("#proof-status")).toHaveText(
    "Saved evidence replay passed",
  );
});

test("a lost paid browser response stops and preserves the known confirmation", async ({
  page,
}) => {
  await installWallet(page);
  let lost = false;
  await page.route("**/api/runs/**/step", async (route) => {
    if (!lost && route.request().postDataJSON()?.payment) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.locator("#notice")).toContainText("could not finish");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("testril-wallet-statement:last-run")),
  );
  expect(saved.status).toBe("stopped");
  expect(saved.providers.testril.payments[0].confirmed).toBe(true);
  expect(saved.pending).toBeNull();
  const signatures = await page.evaluate(() => window.testSignatures);
  await page.reload();
  expect(await page.evaluate(() => window.testSignatures)).toBe(0);
  expect(signatures).toBeGreaterThan(0);
});
