import { expect, test } from "@playwright/test";

// The URL carries the dataset folder and the view, so reload and the back button both work.
test("url keeps the dataset and the view; back button walks the trail", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.locator(".summary")).toContainText("189 entities");
  expect(page.url()).toContain("data=./samples/demo");
  expect(page.url()).toContain("#view=table");

  await page.locator(".ctable tbody tr", { hasText: "Payments" }).first().click();
  await page.locator(".inspector .member-btn", { hasText: "Payments worker" }).first().click();
  await page.getByRole("button", { name: "Explore neighbourhood" }).click();
  await expect(page.locator(".graph-stats")).toContainText("within 2 hops");
  expect(page.url()).toMatch(/#view=graph&community=\d+&entity=/);

  await page.reload();
  await expect(page.getByRole("tab", { name: /Graph: Payments worker/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".graph-stats")).toContainText("within 2 hops");

  // The paper's upper plane: the graph's communities as nodes inside their opened parents.
  await page.getByRole("button", { name: "See on map" }).click();
  await expect(page.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".graph-stats")).toContainText("communities and", { timeout: 30_000 });
  expect(page.url()).toContain("open=");
  await expect(page.locator(".inspector h2")).toHaveText("Payments");

  await page.goBack();
  await expect(page.getByRole("tab", { name: /Graph: Payments worker/ })).toHaveAttribute("aria-selected", "true");
});

test("map opens a nested community inside its closed parents", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=map");
  await expect(page.locator(".graph-stats")).toContainText("3 communities and 0 entities drawn", { timeout: 30_000 });
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.locator(".ctable tbody tr", { hasText: "Checkout" }).first().click();
  await page.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator(".map-note")).toContainText("Checkout sits inside a closed community");
  await page.getByRole("button", { name: "Open in map" }).click();
  await expect(page.locator(".graph-stats")).toContainText("9 communities and 3 entities drawn", { timeout: 30_000 });
  await expect(page.locator(".map-note")).toHaveCount(0);
  expect(page.url()).toMatch(/open=1,0|open=0,1/);
});

test("entities and relationships alone still give an entity list and neighbourhoods", async ({ page }) => {
  await page.goto("/?data=./samples/minimal");
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.locator(".summary")).toContainText("No community set loaded");
  await expect(page.getByRole("tab", { name: "Map" })).toBeDisabled();
  await page.getByRole("tab", { name: "Network" }).click();
  await page.getByPlaceholder("Find an entity").fill("gateway");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.locator(".inspector h2")).toContainText("gateway");
  await page.getByRole("button", { name: "Explore neighbourhood" }).click();
  await expect(page.locator(".graph-stats")).toContainText("in 0 communities");
});

test("ids from another dataset in the link are ignored", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=graph&community=nope-999&entity=nope-1&open=zzz");
  // The unknown ids leave nothing to draw a community graph from, so the default view opens instead.
  await expect(page.getByRole("tab", { name: "Schema" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.locator(".summary")).toContainText("189 entities");
  expect(page.url()).not.toContain("nope");
});
