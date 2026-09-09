import { expect, test } from "@playwright/test";

// The app opens on the whole knowledge graph; communities are something you add to it.
test("network view opens by default and arranges entity types in columns", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".rail")).toHaveCount(0);
  // The schema is the frame: each type is one node until it is opened.
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });
  const arrange = page.locator(".control", { hasText: new RegExp("^Arrange") }).locator("select");
  await expect(arrange).toHaveValue("schema");
  await arrange.selectOption("layers");
  await expect(page.locator(".graph-stats")).toContainText("point forward", { timeout: 30_000 });

  // Communities start off and are added as an overlay.
  const communities = page.locator(".control", { hasText: new RegExp("^Communities") }).locator("select");
  await expect(communities).toHaveValue("off");
  await communities.selectOption("clouds");
  await expect(page.locator("canvas.cloud-layer")).toHaveCount(1);

  await arrange.selectOption("force");
  await expect(page.locator(".graph-stats")).not.toContainText("point forward");
});

test("hiding a relationship type redraws the graph without it", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await page.locator(".control", { hasText: new RegExp("^Arrange") }).locator("select").selectOption("layers");
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
  const show = page.locator(".control", { hasText: new RegExp("^Show") }).locator("select");
  const arrange = page.locator(".control", { hasText: new RegExp("^Arrange") }).locator("select");
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

test("communities are laid out together when the clouds are on", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await page.locator(".control", { hasText: new RegExp("^Arrange") }).locator("select").selectOption("force");
  await page.locator(".control", { hasText: new RegExp("^Communities") }).locator("select").selectOption("clouds");
  await expect(page.locator("canvas.cloud-layer")).toHaveCount(1);
  await expect(page.locator(".graph-stats")).toContainText("entities and", { timeout: 30_000 });
});

test("turning communities on lays them out as separate blobs", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });
  // Asking for communities from the schema view has to show them, not do nothing.
  await page.locator(".control", { hasText: new RegExp("^Communities") }).locator("select").selectOption("clouds");
  await expect(page.locator(".control", { hasText: new RegExp("^Arrange") }).locator("select")).toHaveValue("force");
  await expect(page.locator(".graph-stats")).toContainText("entities and", { timeout: 30_000 });
  await expect(page.locator("canvas.cloud-layer")).toHaveCount(1);
});

// Turning communities on has to name them, and clicking a record must not fade the picture away.
test("communities are named on the canvas and listed under it, at any zoom", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });
  await page.locator(".control", { hasText: new RegExp("^Communities") }).locator("select").selectOption("clouds");
  const canvas = page.locator("canvas.cloud-layer");
  await expect(canvas).toHaveCount(1);

  // Every community is listed with the colour it was drawn in, so no name is ever out of reach.
  const listed = page.locator(".graph-legend", { hasText: "Communities" }).locator("button.legend-item");
  await expect(listed.first()).toBeVisible({ timeout: 30_000 });
  const names = await listed.count();
  expect(names).toBeGreaterThan(1);

  // Names are on the canvas with the whole graph in view, not only once it is zoomed into.
  await page.locator(".btn", { hasText: "Fit" }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("data-names")), { timeout: 15_000 }).toBeGreaterThan(0);

  // Reading a community from the list puts it in the inspector without leaving the graph.
  await listed.first().click();
  await expect(page.locator(".inspector h2")).not.toBeEmpty();
  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
});

// A community is mostly the links between its members, so a clickable edge makes the community
// itself unclickable over most of its area. Links are read from the inspector instead.
test("links take no clicks, so a tap inside a community reads the community", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.locator(".graph-stats")).toContainText("types drawn", { timeout: 30_000 });
  await page.locator(".control", { hasText: new RegExp("^Communities") }).locator("select").selectOption("clouds");
  await expect(page.locator("canvas.cloud-layer")).toHaveCount(1);
  await expect.poll(async () => Number(await page.locator("canvas.cloud-layer").getAttribute("data-names")), { timeout: 20_000 }).toBeGreaterThan(0);

  const canvas = page.locator(".graph-canvas");
  const box = (await canvas.boundingBox())!;
  const headings: string[] = [];
  for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.58], [0.58, 0.42], [0.5, 0.35], [0.35, 0.5]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(400);
    headings.push((await page.locator(".inspector h2").first().innerText().catch(() => "")).trim());
  }
  // A relationship heading reads "A → B"; no click may ever produce one.
  expect(headings.filter((heading) => heading.includes("\u2192"))).toEqual([]);
  // and at least one of those clicks landed on a community rather than on nothing
  expect(headings.filter((heading) => heading !== "").length).toBeGreaterThan(0);
});
