import { test, expect } from "@playwright/test";
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

test("requested layout, empty history and keyboard balance provenance", async ({
  page,
}) => {
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

test("replay uses separate chronological rows; reset clears transfers and retains payments", async ({
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
  await expect(page.locator("#spent")).toHaveText("0.000275");
  await expect(page.locator("#receipt-rows tr")).toHaveCount(12);
  await page.locator("#reset-evidence summary").click();
  await expect(page.locator("#reset-sweeps li")).toHaveCount(2);
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
