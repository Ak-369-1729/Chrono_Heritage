# ChronoHeritage V3.0

*Reading the sky through the memory of stone.*

A scientific research platform for investigating possible relationships between historical sites, architectural
orientations, historical chronologies and the observable sky. Every measurement, source, convention and uncertainty
stays attached from the survey to the report, and a small angular residual is reported as a *candidate alignment*
under stated assumptions, never as proof of intent.

V3.0 rebuilds the interface as an "astronomical fortress": an original, procedurally drawn fortress-observatory
inspired by Rajasthani architecture in general. It also adds real registration with role requests, revocable
sessions and an administrator console. The scientific engine, safeguards and API of v2.0 are preserved; see
[`docs/V3_AUDIT.md`](docs/V3_AUDIT.md).

> **Status.** The software is built and tested. The scientific and adoption **evidence gates are not passed**:
>
> * The registry holds only five clearly labelled *fictional* demonstration sites.
> * The JPL Horizons benchmark cases are blocked until run with network access.
> * No published case has been recalculated.
> * No workflow timings or researcher pilots have been recorded.
>
> See [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md).

**Windows 11 users: follow [`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md)** (Docker Desktop, VS Code, PowerShell).

---

## What is in the box

| Area | What it does |
|---|---|
| **Landing** (`/`) | A six-scene scroll journey: desert threshold, gateway, courtyard of time, instrument chamber, evidence vault, research workspace. It uses 3D on capable desktops, layered 2D on phones or without WebGL, and still images for reduced motion. Scene C shows a live engine calculation and scene E the live evidence ledger. A skip link, a scene index and normal Back/Forward are always available. |
| **Accounts** (`/register`, `/login`, `/account`, `/admin`) | Sign-up asks *What brings you to ChronoHeritage?* (Researcher, Data Steward, Reviewer). Privileged roles are requests that an administrator approves. Includes a password strength guide, show/hide toggle and confirmation; sign-out revokes the session on the server; profile, password, motion and display preferences; an administrator console for users and role requests. |
| **Heritage Atlas** (`/atlas`) | Registry with real versus illustrative records, review status, provenance and eligibility filters, and an offline MapLibre map with touch controls (list and map toggle on phones). |
| **Site dossier** (`/sites/:id`) | Identity, orientation with raw → true azimuth steps, chronology, horizon, provenance, eligibility, numbered sources, observations and photographs, analyses, review and audit history, visibility and archive controls, and data-entry forms that never discard unsaved input silently. |
| **Dataset feasibility** (`/feasibility`) | Phase 0 inventory with a plain-language explanation and technical detail, provenance, a compatibility matrix, blockers, the kill-criterion worksheet, review and exports. |
| **Sky Explorer** (`/sky`) | Exploratory solar rise/set calculations with every input's provenance, conventions, time systems and limits, the horizon panorama and an optional cross-check against both independent reference paths. |
| **Analysis** (`/analysis`) | A five-step workflow (hypothesis → inputs → run → results → review). Each run keeps a hashed snapshot, Monte Carlo uncertainty, sensitivity, warnings, rerun lineage and reports. A queued job that does not progress is reported, not hidden. |
| **Benchmarks, Compare, Gates** | The frozen benchmark suite (blocked is never shown as passed), measured workflow comparisons only, and an evidence dashboard of what is satisfied, pending, open or closed, and why. |
| **Reports** (`/reports`) | PDF, CSV and JSON with visible progress, a confirmation naming the saved file, a SHA-256 check in the browser, and retry on failure. |
| **Documentation** (`/documentation`) | Definitions, conventions, methods, default assumptions, limitations and references, with interactive demonstrations. |

## Architecture

```
Browser ── Next.js 16 (React 19, TypeScript, Tailwind 4, R3F/three, GSAP, Recharts, MapLibre)
             │  /api/* runtime proxy (CHRONO_API_URL read per request; forwards cookies and the CSRF header)
             ▼
          FastAPI (/api/v2) ── services ── science modules (pure, independently tested)
             │                              angles · conventions · provenance · compatibility · chronology
             │                              astronomy (Skyfield + JPL DE406) · references (Astropy/ERFA, Laskar 1986)
             │                              horizon · refraction · Monte Carlo · statistics · gates
             ├── PostgreSQL 16 + PostGIS 3.4 (SQLAlchemy 2, Alembic: 0001 schema, 0002 accounts)
             ├── job queue in Postgres (FOR UPDATE SKIP LOCKED) ── worker process
             ├── accounts: roles, role requests, server-side sessions, rate limits, app.manage CLI
             ├── benchmark harness (DB-independent; also a CLI for CI)
             └── report artefacts (ReportLab PDF, CSV, JSON) on a volume
```

Design decisions are recorded in [`docs/adr/`](docs/adr). The newest are 0012 (accounts and roles) and 0013 (visual
language and landing renderers).

## Quick start (Docker Compose)

```bash
cp .env.example .env     # then replace POSTGRES_PASSWORD and CHRONO_SECRET_KEY with long random values
docker compose up --build -d
docker compose exec api python -m app.manage create-user --email you@example.org --role admin   # hidden prompt
```

Then open the web app at <http://localhost:3000>, the API docs at <http://localhost:3000/api/docs> and the API
health check at <http://localhost:8000/api/v2/health>. On Windows, use the PowerShell version in
[`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md), which also generates the secrets without printing them.

On start the API container runs migrations, registers the frozen benchmark suite and, with `CHRONO_SEED_DEMO=true`,
loads the five fictional demonstration sites.

## Local development (without Docker)

Requirements: Python 3.12+ (3.13 used), Node 22, PostgreSQL 16 with PostGIS 3.

```bash
createdb chronoheritage && psql chronoheritage -c "CREATE EXTENSION postgis"

cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt                 # includes de406 (~180 MB of JPL coefficients)
export CHRONO_DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/chronoheritage
export CHRONO_SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
alembic upgrade head
python -m app.seed                                  # --no-demo to skip the illustrative sites
python -m app.manage create-user --email you@example.org --role admin
uvicorn app.main:app --reload --port 8000           # jobs run in-process unless CHRONO_RUN_JOBS_INLINE=false
python -m app.worker                                # only with CHRONO_RUN_JOBS_INLINE=false

cd ../frontend
npm install                                         # also copies MapLibre's worker into public/vendor
CHRONO_API_URL=http://localhost:8000 npm run dev
```

## Accounts, roles and test accounts

| Role | How it is obtained | Can |
|---|---|---|
| Visitor | No account | Browse public records, the sky, benchmarks, gates and documentation |
| Researcher | Public sign-up (immediate in `open` mode) | Private draft sites and sources, hypotheses, single-site analyses, reports |
| Data Steward | **Requested** at sign-up or from the account page, **approved by an administrator** | Researcher rights, plus publishing site records to the public registry and curating public records (audited) |
| Reviewer | Requested, approved by an administrator | Steward rights, plus approving or rejecting records, runs, reports, tolerances and gate review conditions, and reading the audit log |
| Administrator | Only through `app.manage` (operator) or another administrator | Users, role requests, activation and suspension |

There are no default passwords anywhere in the code, documentation or bundles. To create local test accounts:

* **Researcher:** sign up at `/register`.
* **Any role:** `python -m app.manage create-user --email … --role steward|reviewer|admin` (hidden prompt, or
  `--password-env VAR` for scripts).
* **Forgotten password:** `python -m app.manage reset-password --email …`, which also signs out every session.
* **Bootstrap accounts:** the optional `CHRONO_*_EMAIL` / `CHRONO_*_PASSWORD` variables in `.env` create accounts
  at start-up. A blank password skips the account; nothing is ever generated or printed.

The end-to-end tests sign up throw-away accounts with random passwords at run time. The administrator flow runs only
when `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are supplied.

## Configuration

All configuration is environment-based (`CHRONO_` prefix; see `backend/app/config.py` and `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `CHRONO_DATABASE_URL` | local dev URL | SQLAlchemy URL (`postgresql+psycopg://…`) |
| `CHRONO_SECRET_KEY` | temporary in development | HMAC key for session tokens. A value starting with `change-me` is ignored; required in production. |
| `CHRONO_ENV` | `development` | `production` enforces the secret key |
| `CHRONO_COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `CHRONO_REGISTRATION_MODE` | `open` | `open`, `approval` or `closed` |
| `CHRONO_MAX_ACTIVE_JOBS_PER_USER` | `3` | Queued or running calculations per non-admin user |
| `CHRONO_REGISTER_LIMIT_PER_HOUR` | `10` | Sign-ups per client address per hour (per API worker) |
| `CHRONO_LOGIN_LIMIT_PER_5MIN` | `10` | Sign-in attempts per address and email per 5 minutes |
| `CHRONO_TOKEN_TTL_HOURS` | `12` | Session lifetime |
| `CHRONO_ARTIFACT_DIR` | `./artifacts` | Reports and uploaded images |
| `CHRONO_RUN_JOBS_INLINE` | `true` | Run jobs in the API process; `false` with a worker (Compose) |
| `CHRONO_HORIZONS_ENABLED` | `true` | Allow the benchmark suite to query JPL Horizons |
| `CHRONO_MAX_UPLOAD_BYTES` | 5 MiB | Photograph upload limit |
| `CHRONO_SEED_DEMO` | `true` (Compose) | Load the fictional demonstration sites |
| `CHRONO_API_WORKERS` | `2` (Compose) | Uvicorn worker processes |
| `CHRONO_WEB_PORT`, `CHRONO_API_PORT` | `3000`, `8000` | Host ports published by Compose |
| `CHRONO_API_URL` (web) | `http://localhost:8000` | Backend URL for the Next.js proxy, read at request time (never sent to the browser) |

No API keys or paid services are needed. JPL Horizons is public and is contacted only by the benchmark suite.

## Testing

```bash
cd backend  && ruff check . && pytest                        # science, astronomy, API, accounts, gates, migrations
cd backend  && python -m app.benchmarks.harness --no-horizons # benchmark suite as CI runs it
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
cd frontend && npx playwright test                           # needs API + web running; see playwright.config.ts
```

* Backend tests need PostgreSQL/PostGIS (`CHRONO_TEST_DATABASE_URL`, default local `chronoheritage_test`).
* Playwright projects cover 1440×900, 1280×800, 768×1024, 390×844 and 320×640. Set
  `E2E_ENGINES=chromium,firefox,webkit` to add the other engines once their browsers are installed.
* Because the suite signs up many accounts, raise `CHRONO_REGISTER_LIMIT_PER_HOUR` for test runs.
* CI (`.github/workflows/ci.yml`) runs all of the above, a Docker Compose build-and-smoke job, and a live benchmark
  job with network access.

## Security notes

* Authorization is enforced in the API. The interface only mirrors it: site pages receive server-computed
  `permissions`.
* Sessions are server-side and revocable. Passwords are scrypt-hashed and never logged or returned.
* Cookie writes require the `x-chronoheritage-client` header (CSRF).
* Uploads are checked by signature and size. Contributions such as photographs and readings are private to their
  author and reviewers.
* Cross-site analysis and reports stay closed on the server until the Tier 2 gate passes.
* Behind a reverse proxy, the API trusts `X-Forwarded-For` for rate limiting. In production, do not publish the
  API port directly; expose only the web service over HTTPS.

## Scientific limitations

* A candidate alignment is never evidence of intent.
* Provenance completeness is not correctness.
* Refraction near the horizon varies with the weather.
* DE406 limits calculations to −3000…+3000.
* Human review certifies the data-quality process, not historical intent.

See `/documentation#limitations`.
#   C h r o n o _ H e r i t a g e  
 