#!/usr/bin/env node
// Fails the build if dist/ carries any dataset other than the synthetic sample, or if a provider
// key set in the environment was inlined into the bundle. Vite inlines every VITE_* value, so a key
// that is convenient during development would otherwise ship to whoever can read the built files.
// Set ALLOW_EMBEDDED_KEY=1 to publish a build that carries one on purpose.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = join(process.cwd(), "dist");
const offenders = [];
const embeddedKey = (process.env.VITE_LLM_API_KEY ?? "").trim();
const keyed = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    const rel = relative(dist, path).split("\\").join("/");
    const isData = /\.(parquet|arrow|feather)$/.test(rel) || rel.startsWith("data/");
    if (isData && !rel.startsWith("samples/")) offenders.push(rel);
    if (embeddedKey.length >= 8 && /\.(js|html|css|map)$/.test(rel)) {
      if (readFileSync(path, "utf8").includes(embeddedKey)) keyed.push(rel);
    }
  }
};
try {
  walk(dist);
} catch (error) {
  console.error(`check-dist: cannot read ${dist}: ${error.message}`);
  process.exit(1);
}
if (offenders.length > 0) {
  console.error("check-dist: dataset files outside samples/ would be published:");
  for (const file of offenders) console.error(`  ${file}`);
  process.exit(1);
}
if (keyed.length > 0 && process.env.ALLOW_EMBEDDED_KEY !== "1") {
  console.error("check-dist: VITE_LLM_API_KEY was inlined into the build and would be published:");
  for (const file of keyed) console.error(`  ${file}`);
  console.error("  Build without the variable, or set ALLOW_EMBEDDED_KEY=1 to publish it on purpose.");
  process.exit(1);
}
if (keyed.length > 0) console.log(`check-dist: publishing an embedded provider key on request (${keyed.length} files)`);
console.log("check-dist: only the sample dataset ships in dist/");
