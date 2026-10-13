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
  await expect(page.locator("#read-cost")).toHaveText("0.000071");
  await expect(page.locator("#read-count")).toHaveText("7");
  await expect(page.locator("#materialization-cost")).toHaveText("0.000000");
  await expect(page.locator("#materialization-count")).toHaveText("0");
  await expect(page.locator("#receipt-rows tr")).toHaveCount(3);
  await expect(
    page.getByRole("columnheader", { name: "Block number" }),
  ).toBeVisible();
  await expect(page.locator("#receipt-rows tr").first()).toContainText(
    "100000001",
  );
  await expect(page.locator("#receipt-rows tr").last()).toContainText(
    "100000000",
  );
  const cost = page.locator("#receipt-rows tr").first().getByRole("button");
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
  await expect(page.locator("#receipt-rows tr").first()).toContainText(
    "100000002",
  );
  await expect(page.locator("#receipt-rows tr").last()).toContainText(
    "100000000",
  );
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
  await expect(page.locator("#read-cost")).toHaveText("0.000000");
  await expect(page.locator("#materialization-count")).toHaveText("0");
  await expect(page.locator("#materialization-cost")).toHaveText("0.000000");
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
  const source = page.getByRole("link", { name: "Download source" });
  await expect(source).toHaveAttribute(
    "href",
    "https://github.com/ormi-labs/testril-demos/tree/main/demos/treasury-analysis",
  );
  await expect(source).toHaveAttribute("target", "_blank");
});

test("live reset starts payment history with only the new wallet reads", async ({
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
    if (route.request().url().includes("/balance-provenance")) {
      const id = new URL(route.request().url()).searchParams.get("wallet");
      const wallet = state.wallets.find((w) => w.id === id);
      return route.fulfill({
        json: {
          mode: "live",
          chain: state.chain,
          token: liveFixture.token,
          function: { name: "erc20.token_balance", version: 1 },
          source: {
            wallet: wallet.name,
            address: wallet.address,
            balanceRaw: state.balanceRead.balances[id],
            block: 123,
          },
          citation: {
            computation: {
              kind: "function",
              id: "erc20.token_balance",
              version: 1,
            },
          },
          calculation: {
            description:
              "The full wallet balance comes from Testril at the cited block.",
          },
          note: "All USDC in Treasury, A, and B is available to the demo.",
        },
      });
    }
    if (route.request().url().endsWith("/reset")) {
      state.payment = {
        spentRaw: "423",
        lifetimeSpentRaw: "564",
        depositedRaw: "100000",
        remainingRaw: "99436",
        requestCount: 3,
        lifetimeRequestCount: 4,
      };
      state.receipts = state.wallets.flatMap((wallet) => [
        {
          id: `reset-materialize-${wallet.id}`,
          kind: "materialization",
          status: "done",
          chargeRaw: "120",
          requestCount: 0,
          timestamp: "2026-10-07T00:00:10Z",
          block: 124,
          lines: [
            { label: "materialize_blocks", units: 1, unit_price: 0.00012 },
          ],
        },
        {
          id: `reset-read-${wallet.id}`,
          kind: "reads",
          status: "done",
          chargeRaw: "21",
          requestCount: 1,
          timestamp: "2026-10-07T00:00:10Z",
          block: 124,
          lines: [
            { label: "query_read", units: 1, unit_price: 0.00002 },
            { label: "query_blocks", units: 1, unit_price: 0.000001 },
          ],
        },
      ]);
    }
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
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  await expect(refresh).toBeInViewport();
  const refreshBox = await refresh.boundingBox();
  const resetBox = await page.locator("#reset").boundingBox();
  expect(refreshBox.x + refreshBox.width).toBeLessThanOrEqual(resetBox.x);
  expect(Math.abs(refreshBox.y - resetBox.y)).toBeLessThan(1);
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
  await page.locator("#wallet-treasury").click();
  await expect(page.locator("#provenance")).toBeVisible();
  await expect(page.locator("#source-note")).toHaveText(
    "Base Sepolia · Testril wallet balance and block citation",
  );
  await expect(page.locator("#provenance-content")).toContainText(
    "20000000 raw units",
  );
  await expect(page.locator("#provenance-content")).not.toContainText(
    "Demo allowance",
  );
  await expect(page.locator("#provenance-content")).not.toContainText(
    "undefined",
  );
  await page.screenshot({
    path: new URL(
      `../../../docs/screenshots/treasury-live-balance-provenance-${testInfo.project.name}.png`,
      import.meta.url,
    ).pathname,
    fullPage: true,
  });
  await page.locator("#close-provenance").click();
  await page.locator("#payment-tab").click();
  await expect(page.locator("#spent")).toHaveText("0.000141");
  await expect(page.locator("#read-cost")).toHaveText("0.000021");
  await expect(page.locator("#read-count")).toHaveText("1");
  await expect(page.locator("#materialization-cost")).toHaveText("0.000120");
  await expect(page.locator("#materialization-count")).toHaveText("1");
  await expect(page.locator("#receipt-rows tr").first()).toContainText("Read");
  await expect(page.locator("#receipt-rows tr").last()).toContainText(
    "Materializing",
  );
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
  await expect(page.locator("#spent")).toHaveText("0.000423");
  await expect(page.locator("#read-cost")).toHaveText("0.000063");
  await expect(page.locator("#materialization-cost")).toHaveText("0.000360");
  await expect(page.locator("#materialization-count")).toHaveText("3");
  await expect(page.locator("#read-count")).toHaveText("3");
  await expect(page.locator("#payment-count")).toHaveText("6");
  await expect(page.locator("#receipt-rows tr")).toHaveCount(6);
  await expect(page.locator("#receipt-rows")).not.toContainText("00:00:00 UTC");
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `../../../docs/screenshots/treasury-live-reset-payments-${testInfo.project.name}.png`,
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
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

test("Live Send reports browser click-to-refresh time after updating balances", async ({
  page,
}) => {
  const state = {
    ...publicState(createDemo()),
    id: "live-timing-session",
    mode: "live",
    mcpUrl: "https://dev.testril.ai/mcp",
    chain: { id: 84532, name: "Base Sepolia" },
    token: liveFixture.token,
    wallets: liveFixture.wallets,
    refreshNeeded: false,
    balanceRead: {
      balances: { treasury: "20000000", a: "0", b: "0" },
      sources: {},
    },
    payment: {
      spentRaw: "0",
      depositedRaw: "0",
      remainingRaw: "100000",
      requestCount: 0,
    },
    receipts: [],
  };
  const timing = {
    id: "browser-timing-report",
    outcome: "success",
    elapsedMs: 25,
    stages: [
      {
        name: "Testril refresh after transfer",
        elapsedMs: 25,
        details: [
          { name: "Testril read Treasury execute", calls: 1, elapsedMs: 25 },
        ],
      },
    ],
  };
  let reported;
  const messages = [];
  page.on("console", (message) => {
    if (message.type() === "info") messages.push(message.text());
  });
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { liveAvailable: true } }),
  );
  await page.route("**/api/sessions", (route) =>
    route.request().postDataJSON()?.mode === "live"
      ? route.fulfill({ status: 201, json: state })
      : route.continue(),
  );
  await page.route(
    "**/api/sessions/live-timing-session/transfer",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      state.balanceRead.balances = {
        treasury: "19750000",
        a: "250000",
        b: "0",
      };
      state.historyRead.transfers = [
        {
          id: "timed-transfer",
          from: "treasury",
          to: "a",
          amountRaw: "250000",
          block: 123,
          timestamp: "2026-10-07T00:00:00Z",
        },
      ];
      state.transferCount = 1;
      await route.fulfill({ json: { ...state, timing } });
    },
  );
  await page.route("**/api/timings", (route) => {
    reported = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await page
    .locator(".mode-switch label")
    .filter({ has: page.locator('input[value="live"]') })
    .click();
  await expect(page.locator("#balance-treasury")).toHaveText("20");
  await page.locator("#transfer").click();
  await expect(page.locator("#balance-treasury")).toHaveText("19.75");
  await expect(page.locator("#transfer")).toBeEnabled();
  await expect.poll(() => reported?.elapsedMs ?? 0).toBeGreaterThanOrEqual(80);
  expect(reported.id).toBe(timing.id);
  expect(messages.join("\n")).toContain("[INFO] Send click → refreshed UI");
  expect(messages.join("\n")).toContain(
    "Testril refresh after transfer: 0.025s",
  );
});

test("Live Send modal follows overlapping progress, ignores other revisions, and closes on success or error", async ({
  page,
}, testInfo) => {
  const state = {
    ...publicState(createDemo()),
    id: "live-progress-session",
    mode: "live",
    revision: 0,
    mcpUrl: "https://dev.testril.ai/mcp",
    chain: { id: 84532, name: "Base Sepolia" },
    token: liveFixture.token,
    wallets: liveFixture.wallets,
    refreshNeeded: false,
    balanceRead: {
      balances: { treasury: "20000000", a: "0", b: "0" },
      sources: {},
    },
    payment: {
      spentRaw: "0",
      depositedRaw: "0",
      remainingRaw: "100000",
      requestCount: 0,
    },
    receipts: [],
  };
  let current = {
    revision: 99,
    outcome: "running",
    steps: { pay: { active: 1, started: true } },
  };
  let release;
  let fail = false;
  let polls = 0;
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { liveAvailable: true } }),
  );
  await page.route("**/api/sessions", (route) =>
    route.fulfill({ status: 201, json: state }),
  );
  await page.route(
    "**/api/sessions/live-progress-session/progress",
    (route) => {
      polls++;
      return route.fulfill({ json: current });
    },
  );
  await page.route(
    "**/api/sessions/live-progress-session/transfer",
    async (route) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      if (fail)
        return route.fulfill({
          status: 400,
          json: {
            error: "Testril read failed. Use Refresh to retry.",
            state: { ...state, refreshNeeded: true },
          },
        });
      state.revision++;
      state.balanceRead.balances = {
        treasury: "19750000",
        a: "250000",
        b: "0",
      };
      return route.fulfill({ json: state });
    },
  );
  await page.reload();
  await expect(page.locator("#balance-treasury")).toHaveText("20");
  await page.locator("#transfer").click();
  const modal = page.getByRole("dialog", { name: "Sending USDC" });
  await expect(modal).toBeVisible();
  await expect(page.locator("#progress-heading")).toBeFocused();
  await expect(page.locator("#progress-summary")).toContainText(
    "0.25 USDC · Treasury → Counterparty A",
  );
  await expect.poll(() => polls).toBeGreaterThanOrEqual(2);
  await expect(
    page.locator('[data-progress="pay"] .progress-state'),
  ).toHaveText("Pending");
  await expect(page.locator("#status")).toBeEmpty();
  current = {
    revision: 0,
    outcome: "running",
    phases: {
      rpc: { started: true, complete: true, elapsedMs: 200 },
      testril: { started: true, complete: false, elapsedMs: 100 },
    },
    steps: {
      prepare: { active: 0, started: true, complete: true },
      broadcast: { active: 0, started: true, complete: true },
      confirm: { active: 0, started: true, complete: true },
      materialize: { active: 2, started: true },
      pay: { active: 1, started: true },
      read: { active: 0, started: true },
    },
  };
  await expect(page.locator('[data-progress="materialize"]')).toHaveClass(
    /active/,
  );
  await expect(page.locator('[data-progress="pay"]')).toHaveClass(/active/);
  await expect(
    page.locator('[data-progress="confirm"] .progress-state'),
  ).toHaveText("Complete");
  await expect(
    page.getByRole("heading", { name: "Base Sepolia · RPC", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#testril-progress-heading")).toHaveText("Testril");
  await expect(page.locator("#rpc-progress-elapsed")).toHaveText("0.2s");
  await expect(page.locator("#testril-progress-elapsed")).toHaveText("0.1s");
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  await expect(page.locator("#progress-elapsed")).toContainText("s elapsed");
  expect(
    await modal.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `../../../docs/screenshots/treasury-live-progress-${testInfo.project.name}.png`,
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
  current.steps.materialize = { active: 0, started: true, complete: true };
  current.steps.pay = { active: 0, started: true, complete: true };
  current.steps.read = { active: 2, started: true };
  current.phases.testril.elapsedMs = 300;
  await expect(page.locator('[data-progress="read"]')).toHaveClass(/active/);
  await expect(page.locator("#rpc-progress-elapsed")).toHaveText("0.2s");
  await expect(page.locator("#testril-progress-elapsed")).toHaveText("0.3s");
  release();
  await expect(modal).toBeHidden();
  await expect(page.locator("#balance-treasury")).toHaveText("19.75");
  await expect(page.locator("#transfer")).toBeFocused();
  fail = true;
  release = undefined;
  await page.locator("#transfer").click();
  await expect(modal).toBeVisible();
  await expect.poll(() => typeof release).toBe("function");
  release();
  await expect(modal).toBeHidden();
  await expect(page.locator("#status")).toHaveText(
    "Testril read failed. Use Refresh to retry.",
  );
  await expect(page.locator("#status")).toBeFocused();
  await expect(page.locator("#transfer")).toBeDisabled();
});
