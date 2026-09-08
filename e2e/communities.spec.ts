import { expect, test } from "@playwright/test";

// Every community at once: a band per level, a circle per community, a curve to its parent.
test("the community view shows all levels as bands and can hide what belongs to none", async ({ page }) => {
  await page.goto("/?data=./samples/demo#view=map");
  await expect(page.locator(".bands")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".graph-stats")).toContainText("29 communities on 3 levels");
  await expect(page.locator(".band-node")).toHaveCount(29);
  // one band per level, each naming its level and what it holds
  await expect(page.locator(".bands .mono").first()).toContainText("L0");

  const loose = page.locator(".bands-controls input[type=checkbox]");
  await expect(loose).toBeChecked();
  await expect(page.locator(".bands .loose")).toHaveCount(1);
  await loose.uncheck();
  await expect(page.locator(".bands .loose")).toHaveCount(0);

  // Picking a circle reads it on the right.
  await page.locator(".band-node").first().click();
  await expect(page.locator(".inspector h2")).not.toBeEmpty();

  // The nested box map is still one switch away.
  await page.locator(".head-control select").selectOption("boxes");
  await expect(page.locator(".graph-stats")).toContainText("communities and", { timeout: 30_000 });
});
