import { expect, test } from "@playwright/test";

// The app opens on the whole knowledge graph; communities are something you add to it.
test("network view opens by default and arranges entity types in columns", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".rail")).toHaveCount(0);
  // The schema is the frame: each type is one node until it is opened.
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });
  const arrange = page.locator(".control", { hasText: "Arrange" }).locator("select");
  await expect(arrange).toHaveValue("schema");
  await arrange.selectOption("layers");
  await expect(page.locator(".graph-stats")).toContainText("point forward", { timeout: 30_000 });

  // Communities start off and are added as an overlay.
  const communities = page.locator(".control", { hasText: "Communities" }).locator("select");
  await expect(communities).toHaveValue("off");
  await communities.selectOption("clouds");
  await expect(page.locator("canvas.cloud-layer")).toHaveCount(1);

  await arrange.selectOption("force");
  await expect(page.locator(".graph-stats")).not.toContainText("point forward");
});

test("hiding a relationship type redraws the graph without it", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await page.locator(".control", { hasText: "Arrange" }).locator("select").selectOption("layers");
  await expect(page.locator(".graph-stats")).toContainText("233 relationships", { timeout: 30_000 });
  await page.locator(".graph-legend button", { hasText: "related" }).first().click();
  await expect(page.locator(".graph-stats")).toContainText("0 relationships");
});

test("the schema strip walks the data outwards one relationship at a time", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.locator(".schema-strip .chip").first()).toBeVisible({ timeout: 30_000 });
  // Every entity type is on the strip, grouped into layers.
  await expect(page.locator(".strip-band")).not.toHaveCount(0);

  await page.locator(".schema-strip .chip", { hasText: "Service" }).first().click();
  await expect(page.locator(".chip.static")).toContainText("from the schema: Service");
  await expect(page.locator(".schema-strip .chip.on").first()).toBeVisible();
});

test("part and whole are the same switch in every arrangement", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  const show = page.locator(".control", { hasText: "Show" }).locator("select");
  const arrange = page.locator(".control", { hasText: "Arrange" }).locator("select");
  await expect(show).toHaveValue("some");
  await expect(page.locator(".graph-stats")).toContainText("Part:", { timeout: 30_000 });

  await arrange.selectOption("layers");
  await expect(page.locator(".graph-stats")).toContainText("Part:", { timeout: 30_000 });
  await show.selectOption("all");
  await expect(page.locator(".graph-stats")).toContainText("Whole:", { timeout: 30_000 });
  // Whole means whole, isolated records included.
  await expect(page.locator(".graph-stats")).toContainText("189 of 189 entities");
});

test("opening a type names two records and counts the rest", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });
  await expect(page.locator(".graph-stats")).toContainText("names its two busiest records");
  // Nothing on screen offers a node count to choose.
  await expect(page.locator(".control", { hasText: "At most" })).toHaveCount(0);
  await expect(page.locator(".graph-view")).not.toContainText("800");
});
