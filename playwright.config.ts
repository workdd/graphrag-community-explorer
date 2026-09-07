import { defineConfig } from "@playwright/test";

// Runs against the production build so the worker, the sample and the relative base are all exercised.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1400, height: 900 },
    // Locally the installed Chrome is enough; CI installs Chromium.
    channel: process.env.CI ? undefined : "chrome",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
