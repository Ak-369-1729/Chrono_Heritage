// JS loaded after first paint, gzip, per route: node scripts/perf/lazy.mjs (run after next build, against next start).
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
import fs from "fs"; import zlib from "zlib";
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const b = await chromium.launch({ args: GL });
async function lazy(route, wait, viewport = { width: 1440, height: 900 }) {
  const p = await b.newPage({ viewport });
  const urls = new Set();
  p.on("request", (r) => { if (r.resourceType() === "script" && r.url().includes("/_next/static/") && !r.headers()["next-router-prefetch"]) urls.add(new URL(r.url()).pathname); });
  const html = await (await fetch(BASE + route)).text();
  const initial = new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]));
  await p.goto(BASE + route, { waitUntil: "networkidle" });
  await wait(p);
  const extra = [...urls].filter((u) => !initial.has(u));
  const kb = extra.reduce((a, u) => a + zlib.gzipSync(fs.readFileSync(new URL("../../.next", import.meta.url).pathname + u.replace("/_next", "")), { level: 9 }).length, 0) / 1024;
  console.log(route, "lazy chunks:", extra.length, Math.round(kb), "KB gz");
  await p.close();
}
await lazy("/?view=3d", async (p) => { await p.locator("section[data-mode] canvas").waitFor({ state: "attached" }); await p.waitForTimeout(1500); });
await lazy("/?view=layers", async (p) => p.waitForTimeout(2500));
await lazy("/atlas", async (p) => { await p.locator(".maplibregl-canvas").waitFor({ state: "attached" }); await p.waitForTimeout(1000); });
await b.close();
