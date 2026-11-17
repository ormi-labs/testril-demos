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

test("historical layout gives cost and time equal prominence and exposes both full ledgers", async ({
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
  for (const heading of ["Summary", "Output", "Full costs & time"])
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  await expect(page.locator("#testril .query-cost")).toHaveText("0.007193");
  await expect(page.locator("#nansen .query-cost")).toHaveText("0.690000");
  await expect(page.locator("#testril .query-time")).toHaveText(
    /^\d+\.\d{2} s$/,
  );
  await expect(page.locator("#nansen .query-time")).toHaveText(
    /^\d+\.\d{2} s$/,
  );
  expect(
    await page
      .locator("#testril .query-cost")
      .evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe(
    await page
      .locator("#testril .query-time")
      .evaluate((e) => getComputedStyle(e).fontSize),
  );
  await expect(page.locator("#time-comparison")).toContainText("42.1×");
  await expect(page.locator("#price-comparison")).toContainText("95.9×");
  await expect(page.locator("#testril-count")).toHaveText("7139");
  await expect(page.locator("#nansen-count")).toHaveText("7139");
  await expect(page.locator("#report-window")).toHaveText(
    "2026-11-10 · full UTC day",
  );
  const preparation = page.getByRole("row", { name: /^Data prep/ });
  await expect(preparation.locator("td").nth(0)).toHaveText("0.860760");
  await expect(preparation.locator("td").nth(1)).toHaveText("Unknown");
  await expect(preparation.locator("td").nth(2)).toHaveText("Unknown");
  const provenance = page.getByRole("row", { name: /^Provenance/ });
  await expect(provenance.locator("td").nth(2)).toHaveText("N/A");
  await expect(provenance.getByRole("link")).toHaveAttribute(
    "href",
    "https://testril.si/blog/why-provenance-matters/",
  );
  await expect(page.getByText("USDC IN", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Check Testril’s work", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("footer a")).toHaveText("Download source (ZIP) ↗");
  const screenshots = new URL("../../../docs/screenshots/", import.meta.url);
  const screenshotPath = await access(screenshots)
    .then(() =>
      fileURLToPath(
        new URL(`wallet-statement-${info.project.name}.png`, screenshots),
      ),
    )
    .catch(() => info.outputPath("historical.png"));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page
    .getByText("View the full transfer ledger", { exact: true })
    .click();
  await expect(page.locator("#transfers tr")).toHaveCount(7139);
  await page.selectOption("#ledger-provider", "nansen");
  await expect(page.locator("#transfers tr")).toHaveCount(7139);
  await expect(page.locator("#ledger-caption")).toContainText(
    "Nansen: 7139 transfers · complete ledger",
  );
  expect(paid).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
  await expect(page.locator("#report-date")).toBeVisible();
  await expect(page.locator("#testril .query-cost")).toHaveText("—");
  await expect(page.locator("#price-comparison")).toBeEmpty();
  await expect(page.locator("#transfers")).toBeEmpty();
  const walletScreenshot = await access(screenshots)
    .then(() =>
      fileURLToPath(
        new URL(
          `wallet-statement-wallet-${info.project.name}.png`,
          screenshots,
        ),
      ),
    )
    .catch(() => info.outputPath("wallet.png"));
  await page.screenshot({ path: walletScreenshot, fullPage: true });
  await page
    .getByRole("tab", { name: "Run with your Wallet" })
    .press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "Historical Run", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#testril-count")).toHaveText("7139");
});

test("choosing another day completes real HTTP peers, paid pages and a dated export", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  const starts = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/runs"))
      starts.push(r.postDataJSON());
  });
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
  await page.locator("#report-date").fill("2026-11-09");
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
  await expect(page.locator("#report-window")).toContainText(
    "2026-11-09 · full UTC day",
  );
  await expect(page.locator("#nansen .provider-notes")).toHaveText(
    "3 complete pages",
  );
  await expect(page.locator("#testril-provenance-cost")).toHaveText("0.000017");
  expect(starts).toHaveLength(1);
  expect(starts[0].window).toBe("2026-11-09");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download this run" }).click(),
  ]);
  const value = await readFile(await download.path(), "utf8"),
    run = JSON.parse(value);
  expect(run.status).toBe("done");
  expect(run.scope.window).toBe("2026-11-09");
  expect(run.scope.from_block).toBe(26373611);
  expect(value).not.toMatch(/signature|PAYMENT-SIGNATURE|channelConfig/);
  await page.locator("#report-date").fill("2026-11-10");
  await page.locator("#report-date").blur();
  await expect(page.locator("#testril .query-time")).toHaveText("—");
  await expect(page.locator("#testril-count")).toHaveText("—");
});

test("invalid days and a failed day lookup cannot reach wallet signing", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.locator("#report-date").fill("2099-01-01");
  await page.locator("#report-date").blur();
  await expect(page.locator("#run")).toBeDisabled();
  await page.locator("#report-date").fill("2026-11-09");
  await page.locator("#report-date").blur();
  await page.route("**/api/runs", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "SCOPE_UNAVAILABLE",
        error: "private node details",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText(
    "No data purchases were submitted",
  );
  await expect(page.locator("#notice")).not.toContainText(
    "private node details",
  );
  expect(await page.evaluate(() => window.testSignatures)).toBe(0);
});
test("cancel stops without signing, and missing wallets are explained", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText("wallet extension");
  await installWallet(page);
  await page.reload();
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
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
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
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

test("hosted failures retain a safe request reference without exposing arbitrary provider text", async ({
  page,
}) => {
  await installWallet(page);
  const ref = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await page.route("**/api/runs/*/step", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "secret provider payload",
        code: "PROVIDER_UNAVAILABLE",
        ref,
      }),
    }),
  );
  await page.goto("/");
  await page.getByRole("tab", { name: "Run with your Wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText(ref);
  await expect(page.locator("#notice")).not.toContainText(
    "secret provider payload",
  );
});

test("an old hourly pending purchase survives the daily UI upgrade without another signature", async ({
  page,
}) => {
  const old = JSON.parse(
    await readFile(
      new URL("../recordings/hour-12.json", import.meta.url),
      "utf8",
    ),
  );
  Object.assign(old, {
    kind: "live",
    status: "stopped",
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    pending: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      provider: "testril",
      action: "read",
    },
  });
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "testril-wallet-statement:last-run",
        JSON.stringify(value),
      ),
    old,
  );
  const posts = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("#recovery")).toBeVisible();
  await expect(page.locator("#run")).toBeDisabled();
  await expect(page.locator("#report-date")).toBeDisabled();
  await expect(page.locator("#report-window")).toContainText("12:00–13:00");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download pending attempt" }).click(),
  ]);
  const saved = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(saved.pending).toEqual(old.pending);
  expect(saved.scope.hour).toBe(12);
  expect(posts).toEqual([]);
});
