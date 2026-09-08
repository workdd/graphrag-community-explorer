import { expect, test } from "@playwright/test";

test("sample dataset: overview, graph, map and quality", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.locator(".summary")).toContainText("189 entities and 233 relationships");
  await expect(page.locator(".ctable tbody tr")).toHaveCount(29);
  await expect(page.locator(".integrity summary")).toContainText("no problems");

  await page.locator(".tree-title", { hasText: "Checkout" }).first().click();
  await expect(page.locator(".inspector h2")).toHaveText("Checkout");
  await page.getByRole("button", { name: "Open internal graph" }).click();
  await expect(page.locator(".graph-stats")).toContainText("27 of 27 entities");
  await expect(page.locator(".graph-canvas canvas").first()).toBeVisible();

  await page.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator(".graph-stats")).toContainText("3 communities and 0 entities drawn", { timeout: 30_000 });

  await page.getByRole("tab", { name: "Quality" }).click();
  await expect(page.locator(".quality table").first()).toContainText("L0");
});

test("entity inspector shows relationships and source text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.locator(".tree-title", { hasText: "Payments" }).first().click();
  await page.locator(".inspector .member-btn").first().click();
  await expect(page.locator(".inspector h3", { hasText: "Relationships" })).toBeVisible();
  await expect(page.locator(".inspector h3", { hasText: "Source text" })).toBeVisible();
});
