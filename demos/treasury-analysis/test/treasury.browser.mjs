import { test, expect } from "@playwright/test";
import { createDemo, publicState } from "../src/demo.mjs";
import { fileURLToPath } from "node:url";
import { liveFixture } from "../src/live-config.mjs";
async function send(page, from, to, amount) {
  await page
    .locator(`#from label`)
    .filter({ has: page.locator(`input[value="${from}"]`) })
    .click();
  await page
    .locator(`#to label`)
    .filter({ has: page.locator(`input[value="${to}"]`) })
    .click();
  await page.locator("#amount").fill(amount);
  const count = Number(await page.locator("#transfer-count").textContent());
  await page.locator("#transfer").click();
  await expect(page.locator("#transfer-count")).toHaveText(String(count + 1));
  await expect(page.locator("#status")).toBeEmpty();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#balance-treasury")).toHaveText("1");
});

test("failed live startup clears previous mock balances and history", async ({
  page,
}, testInfo) => {
  await expect(page.locator("#balance-treasury")).toHaveText("1");
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { liveAvailable: true } }),
  );
  await page.route("**/api/sessions", (route) =>
    route.fulfill({ status: 400, json: { error: "Live session is locked." } }),
  );
  await page.reload();
  await expect(page.locator("#status")).toHaveText("Live session is locked.");
  await expect(page.locator("#network-name")).toHaveText("Base Sepolia");
  await expect(page.locator("#balance-treasury")).toHaveCount(0);
  await expect(page.locator("#wallets")).toHaveText(
    "Balances unavailable until the session opens.",
  );
  await expect(page.locator(".histories")).toBeHidden();
  await expect(page.locator("#transfer")).toBeDisabled();
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `../../../docs/screenshots/treasury-live-unavailable-${testInfo.project.name}.png`,
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
});

test("requested layout, empty history and keyboard balance provenance", async ({
  page,
}) => {
  await expect(page.locator("#testril-server")).toBeHidden();
  await expect(page.locator("#wallet-treasury .wallet-address")).toHaveText(
    "0x1111111111111111111111111111111111111111",
  );
  await expect(page.locator("#wallet-treasury .wallet-share")).toBeEmpty();
  await expect(
    page.getByRole("heading", { name: "Move Money", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Track balances and transfers", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Balances", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#transfer")).toBeInViewport();
  await expect(page.locator("#empty-history")).toBeVisible();
  await expect(page.locator("#payments")).toBeHidden();
  await expect(
    page.locator(
      "#all, #show, #available, #restart-replay, #replay-step, #export, .step-number, #balance-block, .reader-label",
    ),
  ).toHaveCount(0);
  const workspace = await page.locator(".workspace").boundingBox();
  const balances = await page.locator(".balances-section").boundingBox();
  const histories = await page.locator(".histories").boundingBox();
  expect(balances.x).toBeGreaterThanOrEqual(workspace.x);
  expect(balances.x + balances.width).toBeLessThanOrEqual(
    workspace.x + workspace.width,
  );
  if (page.viewportSize().width > 1120) {
    expect(histories.x).toBeGreaterThan(workspace.x + workspace.width);
    expect(Math.abs(histories.y - workspace.y)).toBeLessThan(1);
  } else {
    expect(histories.y).toBeGreaterThan(workspace.y + workspace.height);
  }
  const logo = await page.getByAltText("Testril").boundingBox();
  const identity = await page.locator(".identity").boundingBox();
  expect(logo.x).toBeLessThan(identity.x);
  await expect(page.locator("#transfer")).toHaveText("Send");
  await expect(
    page.getByRole("radio", { name: "Mock", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Live", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#from input[value=treasury]")).toBeChecked();
  await expect(page.locator("#to input[value=treasury]")).toBeDisabled();
  await page.locator("#from input[value=treasury]").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#from input[value=a]")).toBeChecked();
  await expect(page.locator("#to input[value=a]")).toBeDisabled();
  await expect(page.locator("#to input[value=treasury]")).toBeChecked();
  const amount = await page.locator("#amount").boundingBox();
  const sendButton = await page.locator("#transfer").boundingBox();
  expect(Math.abs(amount.y - sendButton.y)).toBeLessThan(1);
  const header = await page.locator(".masthead").boundingBox();
  const reset = await page.locator("#reset").boundingBox();
  expect(reset.y).toBeGreaterThanOrEqual(header.y + header.height);
  await page.locator("#wallet-a").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Balance provenance" }),
  ).toBeVisible();
  await expect(page.locator("#provenance-content")).toContainText(
    "0 USDC · 0 raw units",
  );
  await expect(page.locator("#provenance-content")).toContainText(
    "erc20.token_balance",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#wallet-a")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("both histories refresh automatically; provenance and tabs add no charges", async ({
  page,
}) => {
  await send(page, "treasury", "a", ".25");
  await expect(page.locator(".transfer-edge button")).toHaveCount(1);
  await expect(page.locator("#payment-count")).toHaveText("3");
  await page.locator("#wallet-a").click();
  await expect(page.locator("#provenance-content")).toContainText(
    "0.25 USDC · 250000 raw units",
  );
  await expect(page.locator("#provenance-content")).toContainText("100000001");
  await page.locator("#close-provenance").click();
  await page.locator("#payment-tab").click();
  await expect(page.locator("#spent")).toBeVisible();
  await expect(page.locator("#spent")).toHaveText("0.000071");
  await expect(page.locator("#receipt-rows tr")).toHaveCount(3);
  await expect(
    page.getByRole("columnheader", { name: "Block number" }),
  ).toBeVisible();
  await expect(page.locator("#receipt-rows tr").last()).toContainText(
    "100000001",
  );
  const cost = page.locator("#receipt-rows tr").last().getByRole("button");
  await cost.focus();
  await expect(page.locator("#cost-breakdown")).toContainText(
    "History read: 0.000010 USDC",
  );
  await expect(page.locator("#cost-breakdown")).toContainText(
    "Transfer rows: 0.000001 USDC",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#cost-breakdown")).toBeHidden();
  await send(page, "a", "b", ".1");
  await expect(page.locator("#receipt-rows tr")).toHaveCount(5);
  await expect(page.locator("#spent")).toHaveText("0.000113");
  await expect(page.locator("#transfer-count")).toHaveText("2");
  await page.locator("#transfer-tab").click();
  await expect(page.locator(".transfer-edge button")).toHaveCount(2);
  await expect(page.locator("#balance-treasury")).toHaveText("0.75");
  await expect(page.locator("#balance-a")).toHaveText("0.15");
  await expect(page.locator("#balance-b")).toHaveText("0.1");
  await page.locator(".transfer-edge button").first().click();
  await expect(
    page.getByRole("dialog", { name: "Transfer provenance" }),
  ).toBeVisible();
  await expect(page.locator("#provenance-content")).toContainText(
    "250000 raw units",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#spent")).toHaveText("0.000113");
  await page.locator("#transfer-tab").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#payment-tab")).toBeFocused();
  await expect(page.locator("#payments")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.locator("#history")).toBeVisible();
});

test("replay uses separate chronological rows; reset clears both histories and restores the payer", async ({
  page,
}) => {
  await send(page, "treasury", "a", ".4");
  await send(page, "a", "treasury", ".1");
  await send(page, "treasury", "a", ".2");
  await send(page, "a", "b", ".15");
  await send(page, "b", "a", ".05");
  await expect(page.locator(".transfer-edge button")).toHaveCount(5);
  const rows = await page
    .locator(".diagram-row button")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        name: button.getAttribute("aria-label"),
        top: button.getBoundingClientRect().top,
        bottom: button.getBoundingClientRect().bottom,
      })),
    );
  rows.forEach((row, index) => {
    expect(row.name).toMatch(new RegExp(`^Transfer ${index + 1}:`));
    if (index) expect(row.top).toBeGreaterThan(rows[index - 1].bottom);
  });
  await page.locator("#play").click();
  await expect(page.locator(".transfer-edge button")).toHaveCount(1);
  await page.locator("#play").click();
  await page.locator("#play").click();
  await expect(page.locator(".transfer-edge button")).toHaveCount(2);
  await page.locator("#play").click();
  await expect(page.locator('[data-wallet="treasury"]')).toContainText(
    "0.7 USDC",
  );
  await expect(page.locator("#balance-treasury")).toHaveText("0.5");
  await expect(page.locator("#spent")).toHaveText("0.000245");
  await page.locator("#reset").click();
  await expect(page.locator("#balance-treasury")).toHaveText("1");
  await expect(page.locator("#empty-history")).toBeVisible();
  await expect(page.locator(".transfer-edge button")).toHaveCount(0);
  await page.locator("#payment-tab").click();
  await expect(page.locator("#spent")).toHaveText("0.000000");
  await expect(page.locator("#receipt-rows tr")).toHaveCount(0);
  await expect(page.locator("#payment-count")).toHaveText("0");
  await expect(page.locator("#read-count")).toHaveText("0");
  await expect(page.locator("#payment-left")).toHaveText("0.010000");
  await page.locator("#reset-evidence summary").click();
  await expect(page.locator("#reset-sweeps li")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#payment-count")).toHaveText("0");
  await send(page, "treasury", "a", ".25");
  await page.locator("#payment-tab").click();
  await expect(page.locator("#receipt-rows tr")).toHaveCount(2);
  await expect(page.locator("#spent")).toHaveText("0.000041");
});

test("invalid transfer preserves histories; refresh resumes cached reads and downloads work", async ({
  page,
}) => {
  await page.locator("#amount").fill("2");
  await page.locator("#transfer").click();
  await expect(page.locator("#status")).toHaveClass(/error/);
  await expect(page.locator("#spent")).toHaveText("0.000030");
  await expect(page.locator("#empty-history")).toBeVisible();
  await send(page, "treasury", "b", ".3");
  await page.reload();
  await expect(page.locator("#balance-b")).toHaveText("0.3");
  await expect(page.locator(".transfer-edge button")).toHaveCount(1);
  await expect(page.locator("#spent")).toHaveText("0.000071");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download source" }).click();
  expect((await download).suggestedFilename()).toBe(
    "treasury-analysis-0.3.0.tar.gz",
  );
});

test("live mode shows full Testril balances and preserves costs on reset", async ({
  page,
}, testInfo) => {
  const state = {
    ...publicState(createDemo()),
    id: "live-browser-session",
    mode: "live",
    mcpUrl: "https://dev.testril.ai/mcp",
    wallets: liveFixture.wallets.map(({ id, name, address }) => ({
      id,
      name,
      address,
    })),
    chain: { name: "Base Sepolia", id: 84532 },
    refreshNeeded: true,
    balanceRead: {
      balances: { treasury: null, a: null, b: null },
      sources: { treasury: null, a: null, b: null },
    },
    receipts: [],
    payment: {
      spentRaw: "0",
      depositedRaw: "0",
      remainingRaw: "100000",
      requestCount: 0,
    },
  };
  let refreshCount = 0;
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { liveAvailable: true } }),
  );
  await page.route("**/api/sessions", async (route) => {
    if (route.request().postDataJSON()?.mode === "live")
      return route.fulfill({ status: 201, json: state });
    return route.continue();
  });
  await page.route("**/api/sessions/live-browser-session/**", async (route) => {
    if (route.request().url().endsWith("/refresh")) {
      if (refreshCount++) {
        state.refreshNeeded = true;
        return route.fulfill({
          status: 502,
          json: { error: "Testril read failed.", state },
        });
      }
      state.refreshNeeded = false;
      state.balanceRead = {
        balances: { treasury: "20000000", a: "500000", b: "0" },
        sources: {
          treasury: { block: 123 },
          a: { block: 123 },
          b: { block: 123 },
        },
      };
      state.payment = {
        spentRaw: "141",
        depositedRaw: "100000",
        remainingRaw: "99859",
        requestCount: 1,
      };
      state.receipts = [
        {
          id: "paid-browser",
          kind: "materialization",
          status: "done",
          chargeRaw: "120",
          requestCount: 0,
          timestamp: "2026-10-07T00:00:00Z",
          block: 123,
          lines: [
            { label: "materialize_blocks", units: 1, unit_price: 0.00012 },
          ],
        },
        {
          id: "read-browser",
          kind: "reads",
          status: "done",
          chargeRaw: "21",
          requestCount: 1,
          timestamp: "2026-10-07T00:00:00Z",
          block: 123,
          lines: [
            { label: "query_read", units: 1, unit_price: 0.00002 },
            { label: "query_blocks", units: 1, unit_price: 0.000001 },
          ],
        },
      ];
    }
    return route.fulfill({ json: state });
  });
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Live", exact: true }),
  ).toBeChecked();
  await expect(page.locator("#network-name")).toHaveText("Base Sepolia");
  await expect(page.locator("#testril-server")).toHaveText(state.mcpUrl);
  await expect(page.locator("#testril-server")).toBeVisible();
  await expect(
    page.locator("#live-note, #transfer-allowance, .wallet-source"),
  ).toHaveCount(0);
  await expect(page.locator("#balances-heading")).toHaveText("Wallet balances");
  await expect(page.locator("#balance-treasury")).toHaveText("Not yet read");
  await expect(page.locator("#wallet-treasury")).toBeDisabled();
  await expect(page.locator("#wallet-treasury .wallet-share")).toBeHidden();
  await expect(page.locator("#wallet-treasury .wallet-address")).toHaveText(
    state.wallets[0].address,
  );
  await expect(page.locator("#transfer")).toBeDisabled();
  await page.locator("#refresh-live").click();
  await expect(page.locator("#transfer")).toBeEnabled();
  await expect(page.locator("#balance-treasury")).toHaveText("20");
  await expect(page.locator("#balance-a")).toHaveText("0.5");
  await expect(page.locator("#balance-b")).toHaveText("0");
  await expect(page.locator("#wallet-treasury .wallet-share")).toBeEmpty();
  await expect(page.locator("#wallet-treasury meter")).toHaveAttribute(
    "max",
    "100",
  );
  await expect(page.locator("#wallet-treasury meter")).toHaveAttribute(
    "value",
    "97.56",
  );
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `../../../docs/screenshots/treasury-live-${testInfo.project.name}.png`,
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
  await page.locator("#payment-tab").click();
  await expect(page.locator("#budget-label")).toHaveText(
    "Testril budget left · USDC",
  );
  await expect(page.locator("#spent")).toHaveText("0.000141");
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `../../../docs/screenshots/treasury-live-payments-${testInfo.project.name}.png`,
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
  await page.locator("#spent .cost").focus();
  await expect(page.locator("#cost-breakdown")).toContainText(
    "Escrow deposited separately: 0.100000 USDC",
  );
  await page.locator("#reset").click();
  await expect(page.locator("#spent")).toHaveText("0.000141");
  await page.locator("#refresh-live").click();
  await expect(page.locator("#status")).toHaveText("Testril read failed.");
  await expect(page.locator("#balance-treasury")).toHaveText("20");
  await expect(page.locator("#transfer")).toBeDisabled();
  await page
    .locator(".mode-switch label")
    .filter({ has: page.locator('input[value="mock"]') })
    .click();
  await expect(page.locator("#testril-server")).toBeHidden();
});
