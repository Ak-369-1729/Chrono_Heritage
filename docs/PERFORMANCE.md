# Performance budgets and measurements (V3.0)

## Measurement setup

* **Date and host:** 2026-10-18, development sandbox with **2 vCPU and no GPU**.
* **Browser:** headless Chromium 141 (Playwright 1.56) with **SwiftShader software WebGL**.
* **Server:** production Next.js build (`next start`, gzip on), one uvicorn worker, PostgreSQL 16 + PostGIS 3.4 on
  the same host. No network throttling.

Frame rates under SwiftShader are a worst case and do **not** represent GPU hardware. No physical phone or GPU laptop
was available. Re-measure on representative devices before launch.

## Web

| Budget | Target | Measured | Result |
|---|---|---|---|
| Landing initial JS (scripts in the HTML), gzip | ≤ 250 KB | 200 KB | met |
| Other routes' initial JS, gzip | ≤ 250 KB | 186–196 KB | met |
| Landing JS loaded after first paint, layered 2D mode (GSAP, panels, prefetched route chunks), gzip | — | 144 KB | recorded |
| Landing JS loaded after first paint, 3D mode (adds three, R3F, drei), gzip | ≤ 300 KB above 2D | 392 KB in total, ≈ 248 KB more than 2D | met |
| Atlas JS loaded after first paint (MapLibre, world outline, prefetches), gzip | — | 419 KB | recorded |
| First contentful paint | ≤ 1.8 s | 0.12–0.18 s (2D, static, app routes); 0.91 s (3D landing, while the 3D chunk parses) | met |
| Largest contentful paint | ≤ 2.5 s | 0.12–1.14 s (site dossier 1.14 s: its data arrives after first paint) | met |
| Cumulative layout shift | ≤ 0.1 | 0.000–0.011 on landing, site, register, docs, analysis; 0.078 atlas (map container) | met |
| 3D canvas attached after navigation | ≤ 3 s (v2 budget) | 4.7 s (software WebGL, 2 vCPU; v2 measured 2.1 s on 4 vCPU) | **missed here**; the 2D layer is shown meanwhile, so nothing waits on it |
| Scroll frame rate, layered 2D renderer (phone viewport) | ≥ 30 fps | 58–60 fps | met |
| Scroll frame rate, 3D renderer | ≥ 30 fps on a mid-range GPU | 0.2–5 fps under SwiftShader | **not verifiable here** |

**Safeguards for slow 3D.**

* The 3D scene measures its own frame rate. If it averages below 15 fps for two consecutive 3-second windows, it
  hands over to the layered 2D renderer and says why.
* This is tested end to end: SwiftShader triggers it.
* A visitor who explicitly asks for 3D (`?view=3d`, or the account preference) is not switched.
* Phones use the 2D renderer by default. Devices with four or fewer cores, or 4 GB or less of memory, get the lite 3D
  quality: fewer stars, a coarser terrain, no antialiasing, DPR 1.
* Rendering pauses when the journey is off screen.
* Overlays are updated imperatively, with no React render per frame.
* All textures are procedural, so there are no image downloads.

**Fix found while measuring.** The first measurement showed 439 KB of initial landing JS. A label constant was
imported from the 3D module, which pulled three.js into the first load. It was moved into its own module, and the
3D stack is now loaded only when the 3D renderer is chosen.

The site dossier first showed a layout shift of 0.41, because the footer jumped as data arrived. Every chamber now
reserves at least one screen of height, and the shift is 0.003.

## API (PRD §8: common APIs p95 < 1.5 s)

Concurrency 8, shared connection pool, 200 requests per read endpoint:

| Endpoint | p50 | p95 | max | Result |
|---|---|---|---|---|
| GET /sites | 109 ms | 178 ms | 249 ms | met |
| GET /sites/{id} | 104 ms | 145 ms | 202 ms | met |
| GET /gates | 260 ms | 368 ms | 456 ms | met |
| GET /benchmarks/runs/latest | 126 ms | 199 ms | 253 ms | met |
| GET /auth/registration | 8 ms | 15 ms | 20 ms | met |
| GET /auth/me (anonymous) | 10 ms | 17 ms | 19 ms | met |
| POST /sky/compute, 8 concurrent (site chronology, measured horizon) | 4.23 s | 4.43 s | 4.50 s | **exceeds 1.5 s under this load** |
| POST /sky/compute, one at a time | 0.35 s | 0.38 s | 0.38 s | met |

**The sky calculation under load.**

* It is CPU-bound Python. Eight simultaneous calculations contend for one process on two cores.
* Mitigations:
  * Run more API processes (`CHRONO_API_WORKERS`, default 2 in Compose).
  * Keep analyses on the worker queue (already the case).
  * Move exploratory sky calculations to the queue if needed.
* The landing page's live calculation runs once per visit, after first paint.

## Reproducing

Run these against a production build (`npm run build && npm start`) on the target hardware:

* `frontend/scripts/perf/perf.mjs`: web vitals, JS transferred, canvas time and frame rate.
* `frontend/scripts/perf/lazy.mjs`: JS loaded after first paint.

The API figures come from an httpx loop: 8 threads and a shared connection pool. The Lighthouse tool was not available in the sandbox, so no Lighthouse scores are claimed.
