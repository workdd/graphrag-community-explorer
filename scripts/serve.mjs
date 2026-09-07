#!/usr/bin/env node
// Serves the built app and, optionally, folders of Parquet files under /data/<name>/.
//   npx graphrag-community-explorer --data ~/graphrag/output --port 4180
//   node scripts/serve.mjs --data ~/graphrag/output          (in a checkout, after npm run build)
// Then open http://127.0.0.1:4180/?data=./data/output
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dataDirs = new Map();
let port = 4180;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--data" && args[i + 1]) {
    const dir = resolve(args[++i]);
    dataDirs.set(basename(dir), dir);
  } else if (args[i] === "--port" && args[i + 1]) {
    port = Number(args[++i]);
  }
}
// Installed as a package the build sits next to this script; in a checkout it is ./dist after `npm run build`.
const packaged = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const dist = existsSync(join(packaged, "index.html")) ? packaged : resolve(process.cwd(), "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("No built app found. Run `npm run build` in a checkout, or install the package from npm.");
  process.exit(1);
}

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".parquet": "application/octet-stream" };

const send = (res, file) => {
  res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
};

http
  .createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const data = /^\/data\/([^/]+)\/(.*)$/.exec(path);
    if (data) {
      const root = dataDirs.get(data[1]);
      const file = root ? normalize(join(root, data[2])) : "";
      if (root && file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return send(res, file);
      res.statusCode = 404;
      return res.end("not found");
    }
    const file = normalize(join(dist, path === "/" ? "index.html" : path));
    if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return send(res, file);
    send(res, join(dist, "index.html"));
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`GraphRAG Community Explorer at http://127.0.0.1:${port}/`);
    for (const name of dataDirs.keys()) console.log(`  dataset: http://127.0.0.1:${port}/?data=./data/${name}`);
  });
