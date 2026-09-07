/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base keeps the build deployable from any sub-path (GitHub Pages, file://).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173 },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
