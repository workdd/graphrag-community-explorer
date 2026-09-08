import { expect, test } from "@playwright/test";

// The chat tab without a provider and without an embeddings sidecar. No model is ever called here:
// what is checked is that the tab says plainly what is missing rather than failing at the request.
test("ask tab reports what it needs and never hides the network call", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();
  await page.getByRole("tab", { name: "Ask", exact: true }).click();

  // The product promise is that browsing is local. This tab is the exception and says so.
  await expect(page.locator(".search .notice.info").first()).toContainText("sends the selected evidence");

  // The sample ships no embeddings.parquet, so local search is off and says why.
  await expect(page.getByRole("tab", { name: "Local" })).toBeDisabled();
  await expect(page.locator(".search")).toContainText("embeddings.parquet");
  await expect(page.getByRole("tab", { name: "Global" })).toBeEnabled();

  // The cost of a global question is shown before anything is spent.
  await expect(page.locator(".search .notice.info").nth(1)).toContainText("model calls");

  // No key, no asking.
  await page.getByRole("textbox", { name: "Ask about this index" }).fill("what is this index about?");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();

  // The settings panel opens with presets and keeps the key out of the page text.
  await expect(page.locator(".search .settings")).toContainText("Base URL");
  await page.getByLabel("API key").fill("sk-not-a-real-key");
  await expect(page.getByRole("button", { name: /Provider:/ })).not.toContainText("sk-not-a-real-key");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
});

test("ask tab refuses a trace it cannot read", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();
  await page.getByRole("tab", { name: "Ask", exact: true }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "search-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: "9.0", runs: [] })),
  });
  await expect(page.locator(".search .notice.warn").last()).toContainText("trace schema 1");
});
