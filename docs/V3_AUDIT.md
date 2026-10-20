# V3.0 audit of the v2.0 source and preservation checklist

Date: 2026-10-18. Input: `chronoheritage-v2.0.zip` (183 tracked files). Before any change, the extracted archive was
compared file by file with the v2.0 repository (commit `339698d`) and was identical.

## Baseline, measured before any V3 change

| Check | Result |
|---|---|
| `pytest` (backend) | 106 passed |
| `ruff check app tests` (the command CI runs) | clean |
| `ruff check .` (whole backend) | **7 findings** in `alembic/versions/0001_initial_schema.py`, which CI never linted |
| `tsc --noEmit` | clean |
| `vitest run` | 24 passed |
| Playwright (desktop 1440×900 and Pixel 7) | 44 passed, 4 skipped by design |
| Route sweep at 320 / 768 / 1280 px (new audit script) | horizontal overflow at **320 px** on `/feasibility` (60 px) and `/documentation` (54 px); every other route clean |

## Inventory

### Backend (`backend/app`)
* **Science modules (pure):**
  * `science/angles.py`, `conventions.py`, `provenance.py`, `compatibility.py`, `chronology.py`
  * `science/refraction.py`, `horizon.py`, `montecarlo.py`, `statistics.py`, `gates.py`
  * `science/astronomy/{de406, engine, targets, reference_astropy, reference_analytic, horizons}.py`
* **Services:** sites, analysis, feasibility, benchmarks, gates, reports, jobs, audit.
* **API (`/api/v2`):** auth, meta, sources, sites, sky, analyses, feasibility, benchmarks, evidence. There are 21
  researcher endpoints, 8 reviewer endpoints and 1 admin endpoint.
* **Worker:** `app.worker`, a Postgres queue that claims jobs with `FOR UPDATE SKIP LOCKED`.
* **Reports:** `reports/pdf.py` (ReportLab with DejaVu fonts) and `reports/exports.py` (CSV and JSON).
* **Data:** migration `0001` (PostGIS, every table) and the seed (users from environment variables, plus five
  ILLUSTRATIVE sites). Benchmark suite `suite_v1` has 16 frozen cases.

### Frontend (`frontend/src`)
* **Routes:** `/`, `/atlas`, `/sites/[id]`, `/sites/new`, `/feasibility`, `/sky`, `/analysis`, `/analysis/new`,
  `/analysis/[id]`, `/benchmarks`, `/compare`, `/reports`, `/documentation`, `/gates`, `/login`.
* **API access:** one API client (`lib/api.ts`, with a CSRF header) behind a runtime proxy route
  (`app/api/[...path]/route.ts`).
* **Landing:** a five-scene R3F + GSAP narrative with lite 3D and static fallbacks.

### Environment variables
* `CHRONO_DATABASE_URL`, `CHRONO_SECRET_KEY`, `CHRONO_ENV`, `CHRONO_COOKIE_SECURE`
* `CHRONO_ARTIFACT_DIR`, `CHRONO_RUN_JOBS_INLINE`, `CHRONO_HORIZONS_*`, `CHRONO_DE406_DIR`
* `CHRONO_ALLOW_SELF_REGISTRATION`, `CHRONO_MAX_UPLOAD_BYTES`
* `CHRONO_{ADMIN,REVIEWER,RESEARCHER}_{EMAIL,PASSWORD}`
* `CHRONO_API_URL` (web)

### Seeded accounts
`CHRONO_*_EMAIL` and `CHRONO_*_PASSWORD` create admin, reviewer and researcher accounts. In v2, a blank password was
generated and **printed to the API log**.

## Defects and gaps found (all addressed in V3 unless stated)

| # | Finding | Severity |
|---|---|---|
| A1 | No usable registration: `/auth/register` exists but is disabled by default, has no UI and no role choice. | Gap (brief §7) |
| A2 | Sign-out only deletes the cookie. The signed token stays valid until it expires, so a copied token survives logout. | Security |
| A3 | Any researcher can create a site with `visibility="public"`, so it appears in the public atlas without any review. With open registration this would let anyone publish to the shared registry. | Security / integrity |
| A4 | The seed prints generated passwords to the container log. | Secret handling |
| A5 | The e2e helper contains a default researcher password in source. | Secret handling |
| A6 | The login page says "data stewards review records", but the seed names the reviewer "Data Steward (review)". There is no steward role. | Consistency |
| A7 | No per-user limit on queued jobs. Open registration would allow unbounded compute requests. | Abuse resistance |
| A8 | Horizontal overflow at 320 px on `/feasibility` and `/documentation`. | Responsive |
| A9 | CI lints `app tests` only, so the migration with lint findings went unnoticed. | Tooling |
| A10 | No account page, no admin user management UI, no password change. | Gap (brief §8) |
| A11 | Responsive e2e covered 1440 and 412 px only, and Chromium only. | Test coverage |
| A12 | Atlas prefetches of `/sites/*` show as failed requests during navigation (`net::ERR_ABORTED`). They are cancelled prefetches, not server errors. | Benign (documented) |

## Preservation checklist (verified at the end of V3; see the implementation report)

- [x] Every science module is unchanged in logic. The existing science tests still pass unmodified. *(`git diff`
      of `app/science` shows only two gate labels; no science test file changed.)*
- [x] Circular and axial residuals, north-reference conversion, chronology, refraction, horizon, Monte Carlo, both
      reference paths, statistics and gates are unchanged. *(Same tests, passing.)*
- [x] Input snapshot plus SHA-256, rerun lineage, review states and the audit log are kept. *(API tests and e2e.)*
- [x] The cross-site endpoint is still blocked server-side until Tier 2. *(Assertions unchanged. The only change is
      that the Tier-2 fixture's public records are now created by a steward, because researchers can no longer
      publish. The e2e suite also posts to the endpoint directly and is refused.)*
- [x] Illustrative records cannot be approved and are labelled in every view, including map markers.
- [x] Benchmark harness: 11 pass / 5 blocked offline, same suite hash `c69e642f…`.
- [x] PDF, CSV and JSON reports have checksums. *(The e2e download recomputes the PDF's SHA-256 in the browser.)*
- [x] Existing API contracts are kept. Changes are listed in the implementation report §3, with consumers and tests
      updated.
- [x] Migrations work on a fresh database and round-trip, including a v2-data upgrade and a drift check.
- [x] Docker Compose (db, api, worker, web) and CI are kept and extended. *(Compose verified only with stand-in base
      images; see the report §7.)*
- [x] No ML.
