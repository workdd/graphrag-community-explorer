import { expect, test } from "@playwright/test";

// The app opens on the whole knowledge graph; communities are something you add to it.
test("network view opens by default and arranges entity types in columns", async ({ page }) => {
  await page.goto("/?data=./samples/demo");
  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".rail")).toHaveCount(0);
  await expect(page.locator(".graph-stats")).toContainText("entities and", { timeout: 30_000 });
  await expect(page.locator(".graph-stats")).toContainText("point forward");

  // Communities start off and are added as an overlay.
  const communities = page.locator(".control", { hasText: "Communities" }).locator("select");
  await expect(communities).toHaveValue("off");
  await communities.selectOption("clouds");
  await expect(page.locator("canvas.cloud-layer")).toHaveCount(1);

  await page.locator(".control", { hasText: "Arrange" }).locator("select").selectOption("force");
  await expect(page.locator(".graph-stats")).not.toContainText("point forward");
});

test("hiding a relationship type redraws the graph without it", async ({ page }) => {
  await page.goto("/?data=./samples/demo");
  await expect(page.locator(".graph-stats")).toContainText("233 relationships", { timeout: 30_000 });
  await page.locator(".graph-legend button", { hasText: "related" }).first().click();
  await expect(page.locator(".graph-stats")).toContainText("0 relationships");
});
