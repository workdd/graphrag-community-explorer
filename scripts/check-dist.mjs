#!/usr/bin/env node
// Fails the build if dist/ carries any dataset other than the synthetic sample.
// Runs after `vite build` and in CI; the deploy script relies on it.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = join(process.cwd(), "dist");
const offenders = [];
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
console.log("check-dist: only the sample dataset ships in dist/");
