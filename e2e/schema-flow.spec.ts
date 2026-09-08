import { expect, test } from "@playwright/test";

// Schema shape, then the records behind it, then the communities forming out of those records.
test("a triple picked in the schema view carries through to the data and the Leiden run", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=schema");
  await expect(page.locator(".schema-graph-side")).toContainText("entity types", { timeout: 30_000 });

  // The listed triples are the same objects the canvas arrows stand for.
  await page.locator(".schema-triples .chip").first().click();
  await expect(page.locator(".schema-graph-side")).toContainText("relationships of this shape");
  await expect(page.locator(".schema-values .value-title").first()).toBeVisible();

  await page.getByRole("button", { name: "Show these records in the graph" }).click();
  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".chip.static")).toContainText("from the schema:");
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });

  await page.getByRole("tab", { name: "Formation" }).click();
  const scope = page.locator(".control", { hasText: "Run on" }).locator("select");
  await expect(scope).toHaveValue("spotlight");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".formation-groups > li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".formation-members .value-title").first()).toBeVisible();

  // Clearing the schema selection puts the whole graph back.
  await page.getByRole("tab", { name: "Network" }).click();
  await page.locator(".chip.static").click();
  await expect(page.locator(".chip.static")).toHaveCount(0);
});

test("the schema view shows the types and the records behind one of them", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=schema");
  await expect(page.locator(".schema-graph-canvas canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".schema-graph-side")).toContainText("6 entity types");
  await expect(page.locator(".tcard")).toHaveCount(7);
});
