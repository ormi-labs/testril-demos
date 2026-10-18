import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hashDomain } from "viem";
import { account, domainTypes, rows, spec, tokenDomain } from "./peers.mjs";
import { normalizeRows } from "../public/model.js";

async function installWallet(page) {
  await page.exposeFunction("signTestData", (data) =>
    account.signTypedData(data),
  );
  await page.addInitScript(
    ({ address, separator }) => {
      window.testSignatures = 0;
      window.ethereum = {
        async request({ method, params }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [address];
          if (method === "eth_chainId") return "0x2105";
          if (method === "eth_getCode") return "0x6000";
          if (method === "eth_call") return separator;
          if (method === "eth_signTypedData_v4") {
            window.testSignatures++;
            return window.signTestData(JSON.parse(params[1]));
          }
          throw new Error(`Unexpected method: ${method}`);
        },
      };
    },
    {
      address: account.address,
      separator: hashDomain({
        domain: tokenDomain,
        types: { EIP712Domain: domainTypes },
      }),
    },
  );
}

test("example is explicitly illustrative, shows exact integers, and fits the viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("#notice")).toContainText("No measured recording");
  await page.getByRole("button", { name: "Explore a layout example" }).click();
  await expect(page.locator("#notice")).toContainText("values are invented");
  await expect(page.locator("#agreement")).toContainText(
    "not a measured comparison",
  );
  await expect(page.locator("#testril .read-time")).toHaveText("Not measured");
  await expect(
    page.getByRole("button", { name: "Download this run" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `../../../docs/screenshots/pool-volume-example-${testInfo.project.name}.png`,
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
});

test("clicking Run completes both actual HTTP adapters and wallet payment approvals", async ({
  page,
}) => {
  await installWallet(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Run comparison", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  // Depending on shared fake-peer coverage, the second project can reuse prepared data.
  while (
    !(await page.locator("#notice").textContent()).startsWith("Run complete")
  ) {
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#payment-summary")).toContainText(
      "real USDC on Base mainnet",
    );
    await page.getByRole("button", { name: "Approve and sign" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect
      .poll(
        async () =>
          (await page.locator("#notice").textContent()).startsWith(
            "Run complete",
          ) || (await page.getByRole("dialog").isVisible()),
      )
      .toBe(true);
  }
  await expect(page.locator("#agreement")).toHaveText("All raw values match");
  await expect(page.locator("#rows")).toContainText("987654321098765432109876");
  expect(
    await page.evaluate(() => window.testSignatures),
  ).toBeGreaterThanOrEqual(3);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download this run" }).click(),
  ]);
  const content = await readFile(await download.path(), "utf8");
  const run = JSON.parse(content);
  expect(run.providers.allium.status).toBe("done");
  expect(run.providers.allium.payments.map((p) => p.amount)).toEqual([
    "10000",
    "20000",
  ]);
  expect(content).not.toMatch(
    /signature|privateKey|PAYMENT-SIGNATURE|channelConfig/,
  );
});

test("canceling an approval stops without requesting a signature", async ({
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
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.locator("#notice")).toContainText("Run canceled");
  expect(await page.evaluate(() => window.testSignatures)).toBe(0);
  await expect(
    page.getByRole("button", { name: "Download this run" }),
  ).toBeEnabled();
});

test("a recorded run plays without connecting a wallet or creating a paid session", async ({
  page,
}) => {
  const provider = {
    status: "done",
    rows: normalizeRows(rows, spec),
    payments: [],
    timing: { readMs: 1200, preparationMs: 0, walletWaitMs: 0, totalMs: 1200 },
  };
  const recording = {
    schemaVersion: 1,
    kind: "recorded",
    recordedAt: "2026-10-18T00:00:00Z",
    paymentNetwork: "eip155:8453",
    spec,
    providers: { testril: provider, allium: provider },
  };
  let sessionRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/runs")) sessionRequests++;
  });
  await page.route("**/api/recordings", (route) =>
    route.fulfill({ json: [{ id: "test-fixture", run: recording }] }),
  );
  await page.goto("/");
  await expect(page.locator("#notice")).toContainText(
    "Playback makes no paid requests",
  );
  await expect(page.locator("#agreement")).toHaveText("All raw values match");
  await expect(page.locator("#testril .read-time")).toHaveText("1.20 s");
  expect(sessionRequests).toBe(0);
});

test("a missing wallet is explained when Connect is clicked", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText("wallet extension");
});

test("a lost response preserves the payment intent in a downloadable attempt", async ({
  page,
}) => {
  await installWallet(page);
  let dropped = false;
  await page.route("**/api/runs/*/step", async (route) => {
    if (route.request().postDataJSON().payment && !dropped) {
      dropped = true;
      await route.fetch();
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Run with your wallet" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run comparison", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.locator("#notice")).toContainText(
    "Reconcile any submitted payment",
  );
  await expect(page.locator("#testril")).toContainText(
    "authorized · unconfirmed",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download this run" }).click(),
  ]);
  const run = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(run.kind).toBe("attempt");
  expect(run.providers.testril.payments[0].confirmation).toBe("unconfirmed");
});
