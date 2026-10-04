import { test, expect } from "@playwright/test";
async function send(page, from, to, amount) {
  await page.locator("#from").selectOption(from);
  await page.locator("#to").selectOption(to);
  await page.locator("#amount").fill(amount);
  await page.locator("#transfer").click();
  await expect(page.locator("#status")).toContainText("Mock transfer complete");
}
async function scrub(page, step) {
  await page.locator("#replay-step").evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(step));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#balance-treasury")).toHaveText("1");
});
test("transfers, incremental replay, keyboard provenance and reset", async ({
  page,
}) => {
  await send(page, "treasury", "a", ".25");
  await send(page, "a", "b", ".1");
  await expect(page.locator("#balance-treasury")).toHaveText("0.75");
  await expect(page.locator("#balance-a")).toHaveText("0.15");
  await expect(page.locator("#balance-b")).toHaveText("0.1");
  await expect(page.locator("#spent")).toHaveText("0.000090");
  await page.locator("#show").click();
  await expect(page.locator(".transfer-row")).toHaveCount(1);
  await page.locator("#play").click();
  await scrub(page, 2);
  await expect(page.locator(".transfer-row")).toHaveCount(2);
  await expect(page.locator(".transfer-row").first()).toContainText(
    "Block 100000001",
  );
  await expect(page.locator(".transfer-row").first()).toContainText("UTC");
  await page.locator(".transfer-row").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#provenance")).toBeVisible();
  await expect(page.locator("#provenance-content")).toContainText(
    "250000 raw units",
  );
  await expect(page.locator("#spent")).toHaveText("0.000102");
  await page.keyboard.press("Escape");
  await expect(page.locator("#provenance")).toBeHidden();
  await page.locator("#reset").click();
  await expect(page.locator("#balance-treasury")).toHaveText("1");
  await expect(page.locator("#balance-a")).toHaveText("0");
  await expect(page.locator("#balance-b")).toHaveText("0");
  await expect(page.locator("#spent")).toHaveText("0.000132");
  await expect(page.locator("#history")).toBeHidden();
  await page.locator("#reset-evidence summary").click();
  await expect(page.locator("#reset-sweeps li")).toHaveCount(2);
  await page.locator("#show").click();
  await expect(page.locator("#empty-history")).toBeVisible();
  await expect(page.locator("#spent")).toHaveText("0.000132");
});
test("invalid transfer spends nothing; refresh resumes cached balances", async ({
  page,
}) => {
  await page.locator("#amount").fill("2");
  await page.locator("#transfer").click();
  await expect(page.locator("#status")).toHaveClass(/error/);
  await expect(page.locator("#spent")).toHaveText("0.000030");
  await send(page, "treasury", "b", ".3");
  await page.reload();
  await expect(page.locator("#balance-b")).toHaveText("0.3");
  await expect(page.locator("#spent")).toHaveText("0.000060");
});
test("reduced motion pauses; stale replay stays separate from current balances", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await send(page, "treasury", "a", ".25");
  await page.locator("#show").click();
  await expect(page.locator("#step-label")).toHaveText("0 / 1");
  await expect(page.locator("#play")).toHaveText("Play");
  await scrub(page, 1);
  await send(page, "treasury", "b", ".1");
  await expect(page.locator("#history-stale")).toBeVisible();
  await expect(page.locator("#balance-treasury")).toHaveText("0.65");
  await expect(page.locator("#replay-wallets")).toContainText("0.75 USDC");
  await page.locator(".transfer-row").click();
  await expect(page.locator("#provenance")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  expect((await download).suggestedFilename()).toBe(
    "wallet-transfers-run.tar.gz",
  );
});
