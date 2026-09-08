import { expect, test } from "@playwright/test";

test("interface switches to Korean and remembers it", async ({ page }) => {
  await page.goto("/");
  // Start from English whatever the browser locale is.
  await page.evaluate(() => localStorage.setItem("gce.lang", "en"));
  await page.reload();
  await page.getByRole("button", { name: "한국어" }).click();
  await expect(page.getByRole("button", { name: "샘플 데이터셋 열기" })).toBeVisible();
  await page.getByRole("button", { name: "샘플 데이터셋 열기" }).click();
  await page.getByRole("tab", { name: "개요" }).click();
  await expect(page.locator(".summary")).toContainText("엔티티 189개, 관계 233개");
  await expect(page.getByRole("tab", { name: "지도" })).toBeVisible();

  // The choice survives a reload, and so does the dataset (its folder is in the URL).
  await page.reload();
  await expect(page.locator(".summary")).toContainText("엔티티 189개, 관계 233개");
  await page.getByRole("button", { name: "다른 데이터셋 열기" }).click();
  await expect(page.getByRole("button", { name: "샘플 데이터셋 열기" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "Open the sample dataset" })).toBeVisible();
});
