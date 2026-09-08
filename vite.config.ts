/// <reference types="vitest/config" />
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serves ./local-data/<name>/* at /data/<name>/* during development only. Real indexes live
 * there, outside public/, so a production build can never include them.
 */
function localData(): Plugin {
  const root = existsSync(resolve(process.cwd(), "local-data")) ? realpathSync(resolve(process.cwd(), "local-data")) : resolve(process.cwd(), "local-data");
  return {
    name: "local-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        let rel: string;
        try {
          rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        } catch {
          res.statusCode = 400;
          return res.end("bad request");
        }
        // Inside the folder only: no parent paths, no prefix-sharing siblings, no symlinks that point out.
        const candidate = resolve(root, "." + (rel.startsWith("/") ? rel : `/${rel}`));
        const inside = (p: string) => {
          const r = relative(root, p);
          return r !== "" && !r.startsWith("..") && !isAbsolute(r);
        };
        if (!inside(candidate) || !existsSync(candidate)) return next();
        const real = realpathSync(candidate);
        if (!inside(real) || !statSync(real).isFile()) return next();
        res.setHeader("Content-Type", real.endsWith(".json") ? "application/json" : "application/octet-stream");
        createReadStream(real).on("error", () => res.end()).pipe(res);
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
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"], environment: "node" },
});
