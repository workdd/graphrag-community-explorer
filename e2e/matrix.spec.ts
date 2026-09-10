import { expect, test } from "@playwright/test";

// A dense pair of types is unreadable as arrows, so the schema view sends it to the grid instead.
test("a dense triple offers the grid, and the grid reads the pairs", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=schema");
  await expect(page.locator(".schema-triples .chip").first()).toBeVisible({ timeout: 30_000 });
  await page.locator(".schema-triples .chip").first().click();
  await expect(page.locator(".density")).toContainText("of the possible pairs are connected");

  await page.getByRole("button", { name: "See as a grid" }).click();
  await expect(page.getByRole("tab", { name: "Matrix" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".matrix-canvas")).toBeVisible();
  await expect(page.locator(".graph-stats")).toContainText("cells are filled");

  // The cross selector lists every pair of types that has relationships.
  await expect(page.locator(".control", { hasText: new RegExp("^Cross") }).locator("option").first()).toContainText("×");
});

test("a star-shaped triple is listed as counts per hub", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=schema");
  await page.locator(".schema-triples .chip").first().click();
  await expect(page.locator(".groups li").first()).toBeVisible();
  await expect(page.locator(".schema-graph-side")).toContainText("each on average");
});

test("the top bar finder lists records and opens the one that is picked", async ({ page }) => {
  await page.goto("/?data=./samples/demo");
  await page.getByPlaceholder("Find a record").fill("Payments");
  await expect(page.locator(".finder-hits li")).not.toHaveCount(0);
  await page.locator(".finder-hits li button").first().click();
  await expect(page.getByRole("tab", { name: "Graph", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".inspector h2")).toContainText("Payments");
});
