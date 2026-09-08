#!/usr/bin/env node
// Serves the built app and, optionally, folders of Parquet files under /data/<name>/.
//   npx graphrag-community-explorer --data ~/graphrag/output --port 4180
//   node scripts/serve.mjs --data ~/graphrag/output          (in a checkout, after npm run build)
// Then open http://127.0.0.1:4180/?data=./data/output
import http from "node:http";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dataDirs = new Map();
let port = 4180;
let distArg;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--data" && args[i + 1]) {
    const dir = resolve(args[++i]);
    dataDirs.set(basename(dir), dir);
  } else if (args[i] === "--port" && args[i + 1]) {
    port = Number(args[++i]);
  } else if (args[i] === "--dist" && args[i + 1]) {
    distArg = resolve(args[++i]);
  }
}
// Installed as a package the build sits next to this script; in a checkout it is ./dist after `npm run build`.
const packaged = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const dist = distArg ?? (existsSync(join(packaged, "index.html")) ? packaged : resolve(process.cwd(), "dist"));
if (!existsSync(join(dist, "index.html"))) {
  console.error("No built app found. Run `npm run build` in a checkout, or install the package from npm.");
  process.exit(1);
}

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".parquet": "application/octet-stream" };

/**
 * Resolves a request path inside a root directory. Returns null when the path escapes the root,
 * including through `..`, a sibling folder that shares the root's prefix, or a symlink pointing out.
 */
export function resolveInside(root, requestPath) {
  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, "." + (requestPath.startsWith("/") ? requestPath : `/${requestPath}`));
  const rel = relative(rootReal, candidate);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  if (!existsSync(candidate)) return null;
  const real = realpathSync(candidate);
  const relReal = relative(rootReal, real);
  if (relReal.startsWith("..") || isAbsolute(relReal)) return null;
  return statSync(real).isFile() ? real : null;
}

const reply = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
};

const send = (res, file) => {
  res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
};

export function handler(req, res) {
  try {
    let path;
    try {
      path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    } catch {
      return reply(res, 400, "bad request: malformed URL encoding");
    }
    const data = /^\/data\/([^/]+)\/(.*)$/.exec(path);
    if (data) {
      const root = dataDirs.get(data[1]);
      const file = root ? resolveInside(root, data[2]) : null;
      if (file) return send(res, file);
      return reply(res, 404, "not found");
    }
    const file = resolveInside(dist, path === "/" ? "/index.html" : path);
    if (file) return send(res, file);
    return send(res, join(dist, "index.html"));
  } catch (error) {
    if (!res.headersSent) reply(res, 500, "server error");
    else res.end();
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (process.env.GCE_SERVE_NO_LISTEN !== "1") {
  http
    .createServer(handler)
    .on("error", (error) => {
      console.error(`cannot listen on ${port}: ${error.message}`);
      process.exit(1);
    })
    .listen(port, "127.0.0.1", () => {
      console.log(`GraphRAG Community Explorer at http://127.0.0.1:${port}/`);
      for (const name of dataDirs.keys()) console.log(`  dataset: http://127.0.0.1:${port}/?data=./data/${name}`);
    });
}
