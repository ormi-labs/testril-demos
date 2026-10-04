import { test, expect } from "@playwright/test";
async function send(page, from, to, amount) {
  await page.locator("#from").selectOption(from);
  await page.locator("#to").selectOption(to);
  await page.locator("#amount").fill(amount);
  await page.locator("#transfer").click();
  await expect(page.locator("#status")).toContainText("Mock transfer complete");
}
async function scrub(page, step) {
  await expect(page.locator("#history")).toBeVisible();
  await expect(page.locator("#replay-step")).toBeEnabled();
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
  await expect(page.locator(".transfer-edge button")).toHaveCount(1);
  await page.locator("#play").click();
  await scrub(page, 2);
  await expect(page.locator(".transfer-edge button")).toHaveCount(2);
  await expect(page.locator(".transfer-edge button").first()).toContainText(
    "Block 100000001",
  );
  await expect(page.locator(".transfer-edge button").first()).toContainText(
    "UTC",
  );
  await page.locator(".transfer-edge button").first().focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Transfer provenance" }),
  ).toBeVisible();
  expect(
    await page
      .locator("#provenance")
      .evaluate((dialog) => dialog.matches(":modal")),
  ).toBe(true);
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
  await expect(page.locator("#transfer-diagram")).toContainText("0.75 USDC");
  await page.locator(".transfer-edge button").click();
  await expect(
    page.getByRole("dialog", { name: "Transfer provenance" }),
  ).toBeVisible();
  expect(
    await page
      .locator("#provenance")
      .evaluate((dialog) => dialog.matches(":modal")),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close provenance" }).click();
  await expect(page.locator("#provenance")).toBeHidden();
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  expect((await download).suggestedFilename()).toBe(
    "wallet-transfers-run.tar.gz",
  );
});

test("each transfer has a separate chronological row, including reverse transfers", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await send(page, "treasury", "a", ".4");
  await send(page, "a", "treasury", ".1");
  await send(page, "treasury", "a", ".2");
  await send(page, "a", "b", ".15");
  await send(page, "b", "a", ".05");
  await page.locator("#show").click();
  await scrub(page, 2);
  await expect(page.locator(".diagram-wallet")).toHaveCount(3);
  await expect(page.locator(".transfer-edge button")).toHaveCount(2);
  await expect(page.locator('[data-wallet="treasury"]')).toContainText(
    "0.7 USDC",
  );
  await scrub(page, 5);
  await expect(page.locator(".diagram-wallet")).toHaveCount(3);
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
    if (index > 0) expect(row.top).toBeGreaterThan(rows[index - 1].bottom);
  });
  const reverse = page.getByRole("button", {
    name: "Transfer 2: Counterparty A to Treasury, 0.1 USDC. Show provenance.",
    exact: true,
  });
  await reverse.click();
  await expect(page.getByRole("dialog")).toContainText("100000 raw units");
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("#provenance").contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(reverse).toBeFocused();
  await expect(page.locator("#spent")).toHaveText("0.000195");
});
