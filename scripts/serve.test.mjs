// Boundary and robustness checks for scripts/serve.mjs using only synthetic temporary files.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const base = mkdtempSync(join(tmpdir(), "gce-serve-"));
const dist = join(base, "dist");
const input = join(base, "input");
const sibling = join(base, "input-sibling");
const outside = join(base, "outside.txt");
mkdirSync(dist);
mkdirSync(input);
mkdirSync(sibling);
writeFileSync(join(dist, "index.html"), "<html>app</html>");
writeFileSync(join(input, "entities.parquet"), "PAR1 synthetic");
writeFileSync(join(sibling, "marker.txt"), "SIBLING");
writeFileSync(outside, "OUTSIDE");
symlinkSync(outside, join(input, "escape.txt"));

const port = 4300 + Math.floor(Math.random() * 500);
let child;
const get = async (path) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.text() };
};

beforeAll(async () => {
  child = spawn(process.execPath, ["scripts/serve.mjs", "--dist", dist, "--data", input, "--port", String(port)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start");
});
afterAll(() => child?.kill());

describe("serve.mjs", () => {
  it("serves the app and files inside the data folder", async () => {
    expect((await get("/")).body).toContain("app");
    expect(await get("/data/input/entities.parquet")).toEqual({ status: 200, body: "PAR1 synthetic" });
  });

  it("refuses parent paths, prefix-sharing siblings and symlinks that leave the folder", async () => {
    expect((await get("/data/input/../input-sibling/marker.txt")).status).toBe(404);
    expect((await get("/data/input/..%2Finput-sibling/marker.txt")).status).toBe(404);
    expect((await get("/data/input-sibling/marker.txt")).status).toBe(404);
    expect((await get("/data/input/escape.txt")).status).toBe(404);
    expect((await get("/data/nope/x.parquet")).status).toBe(404);
  });

  it("survives malformed encoding and keeps answering", async () => {
    expect((await get("/%ZZ")).status).toBe(400);
    expect((await get("/data/input/%E0%A4%A")).status).toBe(400);
    expect((await get("/data/input/entities.parquet")).status).toBe(200);
    expect((await get("/")).status).toBe(200);
  });
});
