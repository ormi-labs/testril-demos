import { expect, test } from "@playwright/test";

test("renders the recording and writes the desktop screenshot", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#source")).toHaveText(
    "Synthetic fixture — not real data",
  );
  await expect(page.locator("#questions tr")).not.toHaveCount(0);
  await expect(page.locator("#checks .failed")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshot-desktop.png",
    fullPage: true,
  });
});
