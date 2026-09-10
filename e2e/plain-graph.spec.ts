import { expect, test } from "@playwright/test";

// The thesis of the CSV loader: nothing about the schema, the layouts, the community work or the
// health findings needs GraphRAG. This graph is two CSV tables and nothing else, and it has to get
// all the way to a community hierarchy without anyone installing anything.
test("a graph that never went near GraphRAG opens, and finds its own communities", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open a plain graph" }).click();

  // Read from the two tables, with the schema counted from the rows rather than declared.
  await page.getByRole("tab", { name: /^Health/ }).click();
  await expect(page.locator(".summary")).toContainText("76 entities and 486 relationships");
  await expect(page.locator(".summary")).toContainText("No community set loaded");

  // Half the product is dark without a grouping, and the Health view says so first.
  const finding = page.locator(".finding", { hasText: "no communities" });
  await expect(finding).toHaveClass(/fix/);
  await expect(page.getByRole("tab", { name: "Communities" })).toBeDisabled();

  // One click, and the rest of the app has something to work with.
  await finding.getByRole("button", { name: "Find communities" }).click();
  await expect(page.locator(".summary")).toContainText("communities on", { timeout: 30_000 });
  await expect(page.locator(".summary")).toContainText("(100%) belong to at least one");
  await expect(page.getByRole("tab", { name: "Communities" })).toBeEnabled();

  // And it says the grouping was computed rather than shipped.
  await page.getByRole("tab", { name: "Quality" }).click();
  await expect(page.locator(".ctable").first()).toBeVisible();
});

test("the types are counted from the rows of a CSV, not declared anywhere", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open a plain graph" }).click();
  await page.getByRole("tab", { name: "Types" }).click();

  // The generator gives every node one of three kinds and every edge one of four.
  await expect(page.locator(".schema-graph")).toBeVisible();
  await expect(page.locator("main")).toContainText("3 entity types");
});
