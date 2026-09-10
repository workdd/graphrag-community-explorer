import { expect, test } from "@playwright/test";

// The Health view is the answer to "I paid to index this; is it any good?". The numbers were always
// there in the Quality view; what is checked here is that they are stated as consequences a reader
// can act on, and that the tab says how many without being opened.
test("the index says what it will and will not answer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();

  // The count rides on the tab, so the problem is visible from any other view.
  const health = page.getByRole("tab", { name: /^Health/ });
  await expect(health).toContainText("2");
  await health.click();

  // Each finding names what was measured, what it costs a search, and what to change.
  const unclaimed = page.locator(".finding", { hasText: "belong to no community" });
  await expect(unclaimed).toContainText("20 entities");
  await expect(unclaimed).toContainText("global search");
  await expect(unclaimed).toContainText("cannot appear in a global answer");
  await expect(unclaimed).toHaveClass(/fix/);

  // The sample has one community holding most of a level, which is a real defect of the sample.
  await expect(page.locator(".finding", { hasText: "One community holds" })).toContainText("at L0");

  // Something to watch is not something to fix, and both are above what is fine.
  await expect(page.locator(".finding.watch", { hasText: "have no relationship" })).toBeVisible();
  await expect(page.locator(".health-count")).toHaveText("2 to fix");
  await expect(page.locator(".health-fine summary")).toContainText("What looks fine");

  // A finding opens the view that shows the records behind it.
  await page.getByRole("button", { name: "See them under the bands" }).click();
  await expect(page.getByRole("tab", { name: "Communities" })).toHaveAttribute("aria-selected", "true");
});

// Nine views read as one undifferentiated row before this, and the tabs claimed a pattern they did
// not implement: every one its own tab stop, no panel associated with any of them.
test("the view strip is a real tab pattern", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(9);

  // One stop for the whole strip: only the open view is reachable with Tab.
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);

  // The panel exists and says which tab opened it.
  const panel = page.getByRole("tabpanel");
  await expect(panel).toHaveAttribute("id", "view-panel");
  await expect(panel).toHaveAttribute("aria-labelledby", "tab-schema");
  await expect(page.getByRole("tab", { name: "Types" })).toHaveAttribute("aria-controls", "view-panel");

  // Arrows move between views, Home and End reach the ends, and the ends wrap.
  await page.getByRole("tab", { name: "Types" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Graph", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Formation" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Ask" })).toBeFocused();

  // A view that cannot be opened is stepped over rather than landed on.
  await expect(page.getByRole("tab", { name: /^Focus/ })).toBeDisabled();
  await page.getByRole("tab", { name: "Communities" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Quality" })).toBeFocused();
});

// Somebody who has just opened an index does not know that the point of it is one tab along.
test("a first visit is pointed at the tab that answers something, once", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();

  const hint = page.locator(".first-hint");
  await expect(hint).toContainText("no API key is needed");
  await hint.getByRole("button", { name: "Show me" }).click();
  await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");

  // Read once is read for good.
  await page.getByRole("tab", { name: /^Health/ }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".first-hint")).toHaveCount(0);
});
