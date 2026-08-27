import { expect, test } from "@playwright/test";

test("opens the CesiumJS COPC viewer", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("./");

  await expect(page).toHaveTitle("CesiumJS COPC Runtime");
  await expect(page.getByRole("heading", { name: /COPC, streamed directly/i })).toBeVisible();
  await expect(page.getByLabel("COPC URL")).toHaveValue(/\.copc\.laz$/);
  await expect(page.locator("#cesium canvas")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("starts with a safe point budget and allows explicit detail increases", async ({ page }) => {
  await page.goto("/");

  const pointBudget = page.locator("#point-budget");
  await expect(pointBudget).toHaveValue("1500000");
  await expect(pointBudget).toHaveAttribute("max", "10000000");
});
