// Web vitals, JS sizes and frame rate on a running production build: node scripts/perf/perf.mjs (BASE_URL to override).
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const b = await chromium.launch({ args: GL });
async function vitals(route, viewport, opts = {}) {
  const ctx = await b.newContext({ viewport, reducedMotion: opts.rm ? "reduce" : "no-preference", isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__v = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  const t0 = Date.now();
  await p.goto(BASE + route, { waitUntil: "networkidle" });
  let canvasMs = null;
  if (opts.canvas) { await p.locator("section[data-mode] canvas").waitFor({ state: "attached", timeout: 30000 }); canvasMs = Date.now() - t0; }
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const js = performance.getEntriesByType("resource").filter((e) => e.name.endsWith(".js") || e.initiatorType === "script");
    return { fcp, lcp: window.__v.lcp, cls: window.__v.cls, jsKB: Math.round(js.reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0) / 1024), mode: document.querySelector("section[data-mode]")?.getAttribute("data-mode") ?? null, hc: navigator.hardwareConcurrency };
  });
  let fps = null;
  if (opts.fps) {
    const out = [];
    for (const pr of opts.fps) {
      await p.evaluate((pr) => { const s = document.querySelector("section[data-mode]"); scrollTo(0, s.getBoundingClientRect().top + scrollY + pr * (s.offsetHeight - innerHeight)); }, pr);
      await p.waitForTimeout(2500);
      out.push(await p.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else res(+(n / ((performance.now() - t) / 1000)).toFixed(1)); }; requestAnimationFrame(f); })));
    }
    fps = out;
  }
  console.log(JSON.stringify({ route, w: viewport.width, rm: !!opts.rm, ...r, fcp: r.fcp && Math.round(r.fcp), lcp: Math.round(r.lcp), cls: +r.cls.toFixed(3), canvasMs, fps }));
  await ctx.close();
}
await vitals("/?view=3d", { width: 1440, height: 900 }, { canvas: true, fps: [0.05, 0.3, 0.45, 0.6] });
await vitals("/", { width: 390, height: 844 }, { fps: [0.05, 0.3, 0.45] });
await vitals("/", { width: 1440, height: 900 }, { rm: true });
for (const r of ["/atlas", "/sites/ill-aster-hill", "/register", "/documentation", "/analysis/new"]) await vitals(r, { width: 1440, height: 900 });
await vitals("/atlas", { width: 390, height: 844 });
await b.close();
