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

  // The community inspector belongs to the views that navigate communities. This tab reads its own
  // records, so the column goes to the graph rather than repeating a prompt about a selection that
  // is never made here. Checked last: leaving the tab resets what was typed.
  await expect(page.locator("aside.inspector")).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.locator("aside.inspector")).toHaveCount(1);
  await page.getByRole("tab", { name: "Ask", exact: true }).click();
  await expect(page.locator("aside.inspector")).toHaveCount(0);
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

// The evidence lives on one page: a citation, a node and a row are three views of the same record,
// and picking any of them reads it in place rather than sending the reader to another tab.
test("picking a citation reads the record beside the answer without leaving the tab", async ({ page }) => {
  const trace = {
    schemaVersion: "1.0",
    producer: { tool: "explorer", version: "0.2.0" },
    createdAt: "2026-09-09T00:00:00.000Z",
    index: { label: "demo", files: {} },
    query: "what is alpha wired to?",
    runs: [
      {
        method: "local",
        engine: "explorer",
        status: "ok",
        error: null,
        response: "Alpha calls Beta [Data: Entities (1); Relationships (1)] and nothing else.",
        settings: { chatModel: "c" },
        context: {
          entities: [
            { id: "e1", shortId: "1", title: "Service · Alpha [AGE:1]", text: "Alpha serves carts", score: 0.9 },
            { id: "e2", shortId: "2", title: "Service · Beta [AGE:2]", text: "Beta stores orders", score: 0.4 },
          ],
          relationships: [
            {
              id: "r1", shortId: "1", title: "Service · Alpha [AGE:1] → Service · Beta [AGE:2]",
              text: "Alpha calls Beta",
              raw: { source: "Service · Alpha [AGE:1]", target: "Service · Beta [AGE:2]", type: "calls" },
            },
          ],
        },
        stages: [{ name: "chat", ms: 1 }],
        stats: { elapsedMs: 1, llmCalls: 1, promptTokens: 5, completionTokens: 1 },
      },
    ],
  };

  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample dataset" }).click();
  await page.getByRole("tab", { name: "Ask", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "search-trace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(trace)),
  });

  // Cited against merely retrieved: two entities went to the model, one came back in the answer.
  await expect(page.locator(".search .usage")).toContainText("cited 2 of the 3");
  await expect(page.locator(".search .used tbody tr.cited")).toHaveCount(2);

  // The embedding space reads the same sidecar local search needs, so it is off without one.
  await expect(page.getByRole("tab", { name: "Embedding space" })).toBeDisabled();
  await expect(page.getByRole("tab", { name: "Relationships" })).toHaveAttribute("aria-selected", "true");

  // Nothing is open until something is picked.
  await expect(page.locator(".search .record-pane.empty")).toBeVisible();

  await page.locator(".search .answer .cite button").first().click();
  await expect(page.getByRole("tab", { name: "Ask", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".search .record-pane h3")).toHaveText("Alpha");
  await expect(page.locator(".search .used tbody tr.picked")).toHaveCount(1);

  // The table is the same selection seen from the other side.
  await page.locator(".search .used tbody tr", { hasText: "Beta" }).first().click();
  await expect(page.locator(".search .record-pane h3")).toHaveText("Beta");
  await expect(page.getByRole("tab", { name: "Ask", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".search .record-pane.empty")).toBeVisible();
});
