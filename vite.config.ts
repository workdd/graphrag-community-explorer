/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serves ./local-data/<name>/* at /data/<name>/* during development only. Real indexes live
 * there, outside public/, so a production build can never include them.
 */
function localData(): Plugin {
  const root = resolve(process.cwd(), "local-data");
  return {
    name: "local-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = normalize(join(root, rel));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Relative base keeps the build deployable from any sub-path (GitHub Pages, file://).
export default defineConfig({
  base: "./",
  plugins: [react(), localData()],
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1" },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
