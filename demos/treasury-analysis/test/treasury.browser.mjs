import { test, expect } from "@playwright/test";

test("report, verification and distinct downloads work without a wallet", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("status").first()).toContainText(
    "Sample complete",
  );
  await expect(page.locator("#closing")).toHaveText("950");
  await expect(page.locator("#net")).toHaveText("−50");
  await expect(
    page.getByRole("heading", {
      name: "The treasury’s balance fell by 50 USDC.",
    }),
  ).toBeVisible();
  await expect(page.locator("#reads")).toHaveText("$0.001062");
  await page.getByRole("button", { name: "Verify sample" }).click();
  await expect(page.locator("#verification")).toContainText(
    "Sample checks passed",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export this run/ }).click();
  expect((await download).suggestedFilename()).toBe("treasury-run.tar.gz");
  const source = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download source/ }).click();
  expect((await source).suggestedFilename()).toBe(
    "treasury-analysis-0.1.0.tar.gz",
  );
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("changed settings differ from the completed report and team movement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#closing")).toHaveText("950");
  await page.getByLabel("Include Team B").check();
  await expect(page.locator("#status")).toContainText("Settings changed");
  await expect(page.locator("#team-report")).toBeHidden();
  await page.getByRole("button", { name: "Run sample" }).click();
  await expect(page.locator("#team-summary")).toContainText(
    "Net team movement: +20 USDC",
  );
  await expect(page.locator("#net")).toHaveText("−50");
  await page
    .getByRole("combobox", { name: "Treasury", exact: true })
    .selectOption("0x2222222222222222222222222222222222222222");
  await page.getByRole("button", { name: "Run sample" }).click();
  await expect(page.locator("#closing")).toHaveText("570");
  await expect(page.locator("#result-heading")).toContainText("rose by 70");
});

test("an insufficient budget preserves the completed report", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#closing")).toHaveText("950");
  await page.getByLabel("Example budget").fill("0.001");
  await page.getByRole("button", { name: "Run sample" }).click();
  await expect(page.locator("#status")).toContainText("exceeds the budget");
  await expect(page.locator("#status")).toContainText(
    "previous completed result",
  );
  await expect(page.locator("#closing")).toHaveText("950");
  await expect(page.getByRole("button", { name: "Run sample" })).toBeEnabled();
});

test("quiet ranges produce an empty report and can be verified", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#closing")).toHaveText("950");
  await page.getByLabel("From block").fill("103");
  await page.getByRole("button", { name: "Run sample" }).click();
  await expect(page.locator("#result-heading")).toHaveText(
    "The treasury’s balance did not change.",
  );
  await expect(page.locator("#flow")).toContainText("No transfers");
  await page.getByRole("button", { name: "Verify sample" }).click();
  await expect(page.locator("#verification")).toContainText(
    "Sample checks passed",
  );
});

test("a total opens evidence with keyboard focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#incoming")).toHaveText("50");
  await page.locator("#incoming").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#edge-rows")).toContainText("100000000");
  await expect(page.locator("#evidence summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#edge-rows")).toBeHidden();
});
