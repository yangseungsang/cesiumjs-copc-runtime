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

test("uses a device budget instead of the old fixed 1.5 M point cap", async ({ page }) => {
  await page.goto("/");

  const pointBudget = await page.locator("#point-budget").inputValue();
  expect(["1000000", "6000000", "10000000"]).toContain(pointBudget);
  expect(pointBudget).not.toBe("1500000");
});
