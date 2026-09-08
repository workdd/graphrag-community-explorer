import { expect, test } from "@playwright/test";

// The schema view shows the Parquet tables as relational tables and the rows local search would rank.
test("schema view lists the tables and the rows behind a community", async ({ page }) => {
  await page.goto("/?data=./samples/demo");
  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.locator(".tcard")).toHaveCount(7);
  await expect(page.locator(".tcard", { has: page.locator(".tcard-name", { hasText: /^entities$/ }) })).toContainText("189 rows");
  await expect(page.locator(".tcard.missing")).toHaveCount(0);
  await expect(page.locator(".schema-svg")).toBeVisible();
  await expect(page.locator(".ctx-table[data-kind=entities] tbody tr")).toHaveCount(15);

  await page.locator(".tree-title", { hasText: "Payments" }).first().click();
  await expect(page.locator(".schema-context h3")).toContainText("Rows behind Payments");
  await expect(page.locator(".ctx-table[data-kind=entities] tbody tr")).toHaveCount(9);
  await expect(page.locator(".ctx-table[data-kind=relationships] tr.group").first()).toContainText("in-network");
  await expect(page.locator(".ctx-table[data-kind=communities] tbody tr.selected")).toContainText("Payments");

  await page.locator(".ctx-table[data-kind=entities] tbody tr").first().click();
  await expect(page.locator(".inspector h2")).toContainText("Payments worker");
  await expect(page.locator(".ctx-table[data-kind=entities] tbody tr.selected")).toHaveCount(1);
});

test("schema view marks the tables an entity-only index lacks", async ({ page }) => {
  await page.goto("/?data=./samples/minimal#view=schema");
  await expect(page.locator(".tcard")).toHaveCount(7);
  await expect(page.locator(".tcard.missing")).toHaveCount(5);
  await expect(page.locator(".col.ref.dangling").first()).toBeVisible();
  await expect(page.locator(".ctx-table[data-kind=communities] tr.empty")).toContainText("No communities.parquet");
});
