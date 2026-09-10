import { expect, test } from "@playwright/test";

test("GraphRAG 0.3 create_final_* layout loads with inferred membership", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("gce.lang", "en")).catch(() => undefined);
  await page.goto("/?data=./samples/legacy");
  await page.getByRole("tab", { name: /^Health/ }).click();
  await expect(page.locator(".summary")).toContainText("189 entities and 233 relationships");
  await expect(page.locator(".summary")).toContainText("29 communities");
  await page.locator(".integrity summary").click();
  await expect(page.locator(".integrity")).toContainText("Members inferred from relationship endpoints");
  await page.locator(".ctable tbody tr").first().click();
  await expect(page.locator(".inspector .facts")).toContainText("inferred");
});
