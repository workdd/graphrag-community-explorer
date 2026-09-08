import { expect, test } from "@playwright/test";

// A hub with hundreds of neighbours is unreadable drawn whole, so the graph names a few of each
// kind and keeps the rest as a bubble that can be opened.
test("a record picked in the top bar centres the graph and abstracts the rest", async ({ page }) => {
  await page.goto("/?data=./samples/demo");
  await page.getByPlaceholder("Find a record").fill("Payments worker");
  await page.locator(".finder-hits li button").first().click();

  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".chip.static")).toContainText("centred on", { timeout: 30_000 });
  await expect(page.locator(".graph-stats")).toContainText("neighbours over");
  await expect(page.locator(".control", { hasText: "Arrange" }).locator("select")).toHaveValue("focus");

  // Everything can still be drawn on request.
  const show = page.locator(".control", { hasText: "Show" }).locator("select");
  await expect(show).toHaveValue("few");
  await show.selectOption("all");
  await expect(page.locator(".graph-stats")).toContainText("Everything it touches is drawn.");

  // Leaving the record puts the schema back.
  await page.locator(".chip.static").click();
  await expect(page.locator(".graph-stats")).toContainText("types drawn");
});
