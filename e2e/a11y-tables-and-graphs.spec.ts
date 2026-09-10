import { expect, test } from "@playwright/test";

// #6: the community table and the quality table sorted and selected on click only. A header's
// sort state is a real <button> now (Enter/Space activates it, aria-sort on the <th> still
// announces the state), and a row is a real tab stop (Enter/Space selects it, aria-selected
// says whether it is the current one).
test("the community table sorts and selects from the keyboard", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=table");
  await expect(page.getByRole("tab", { name: /^Health/ })).toHaveAttribute("aria-selected", "true");

  const entitiesHeader = page.locator(".ctable th", { hasText: "Entities" });
  await expect(entitiesHeader).toHaveAttribute("aria-sort", "descending");

  await entitiesHeader.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(entitiesHeader).toHaveAttribute("aria-sort", "ascending");

  const firstRow = page.locator(".ctable tbody tr").first();
  await expect(firstRow).toHaveAttribute("tabindex", "0");
  await expect(firstRow).toHaveAttribute("aria-selected", "false");
  await firstRow.focus();
  await page.keyboard.press("Enter");
  await expect(firstRow).toHaveClass(/selected/);
  await expect(firstRow).toHaveAttribute("aria-selected", "true");
});

test("the quality table sorts from the keyboard", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=quality");
  await expect(page.getByRole("tab", { name: "Quality" })).toHaveAttribute("aria-selected", "true");

  const header = page.locator(".ctable th", { hasText: "Density" });
  const before = await header.getAttribute("aria-sort");
  await header.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(header).not.toHaveAttribute("aria-sort", before ?? "none");
});

// A canvas has no text content of its own, so without a name a screen reader announces nothing
// where a graph is. Each is read-only here (the record lists and legends beside it are the
// keyboard path to what it draws) but it should still say what it is.
test("every graph canvas has an accessible name", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=network");
  await expect(page.locator(".graph-canvas[role='img']")).toHaveAttribute("aria-label", /.+/);

  await page.goto("/?data=./samples/demo#view=schema");
  await expect(page.locator(".schema-graph-canvas[role='img']")).toHaveAttribute("aria-label", /.+/);
});
