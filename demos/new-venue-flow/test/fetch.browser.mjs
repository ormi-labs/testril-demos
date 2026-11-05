import { expect, test } from "@playwright/test";
import { fixtureBinds } from "./fixture.mjs";

test("the Fetch button shows progress, then the report and its cross-check", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#report")).toBeHidden();
  await page.getByRole("button", { name: "Fetch from Testril" }).click();
  await expect(page.locator("#fetch-binds li")).toHaveCount(
    fixtureBinds.length,
  );
  await expect(page.locator("#report")).toBeVisible();
  await expect(page.locator("#fetch-overall")).toHaveJSProperty("value", 1);
  await expect(page.locator("#venue-table tr")).not.toHaveCount(0);
  await expect(page.locator("#checks li")).not.toHaveCount(0);
  await expect(page.locator("#checks .failed")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fetch again" })).toBeEnabled();
});
