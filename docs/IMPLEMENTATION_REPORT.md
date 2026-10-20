# ChronoHeritage V3.0: implementation report

* **Date:** 2026-10-19
* **Input:** `chronoheritage-v2.0.zip`. It was audited first, and its contents were identical to the v2.0 repository.
* **Output:** `chronoheritage-v3.0.zip`.

This report keeps three things apart:

* what was **built and tested** (with commands and the actual results),
* what was **built but verified only partly or not at all** in the development sandbox,
* the **evidence gates**, which remain open.

No result below was assumed; where a check could not run, it says so.

---

## 1. What changed, in brief

| Area | V3.0 |
|---|---|
| Audit | Full inventory, baseline tests and a defect list before any change ([`V3_AUDIT.md`](V3_AUDIT.md)). |
| Registration and roles | `/register` asks *What brings you to ChronoHeritage?* (Researcher, Data Steward, Reviewer). It has a show/hide password toggle, confirmation, a strength guide, field-level errors and duplicate-email handling. Data Steward and Reviewer are **requests** that only an administrator can grant. Sessions are server-side and revocable. There is an account page and an administrator console. |
| Design system | "Astronomical Fortress": the brief's palette with fixed meanings, Fraunces with IBM Plex Sans, generated cusped-arch and chhatri motifs, an engraved-scale divider, jali texture used sparingly, and chamber headers on every route. |
| Landing | A six-scene journey (desert threshold, gateway, courtyard of time, instrument chamber, evidence vault, research workspace) over a new original 3D fortress-observatory. A layered 2D renderer serves phones and browsers without WebGL; still images serve reduced motion. Scene C shows a live calculation from the engine and scene E the live evidence ledger. |
| Application routes | Every route is restyled. Added: site-dossier navigation, visibility and archive controls, observations and photographs, an unsaved-change guard, plain-language feasibility, Sky Explorer conventions, an analysis workflow stepper, rerun lineage and a stuck-job notice, verified downloads, a gates dashboard, and documentation definitions, assumptions and references. |
| Infrastructure | Migration `0002`. The web image moved to Debian slim. Compose has image names, restart policies, configurable ports and a web healthcheck. `.gitattributes` keeps shell scripts at LF. CI lints the whole backend, runs e2e on three engines and adds a Compose smoke job. Windows 11 guide. |

## 2. Registration and role authorization

* **Roles** run viewer < researcher < **steward** (new) < reviewer < admin.
  * Data Stewards may publish site records to the public registry and curate other contributors' public records.
    Every change is audited, and a material change resets review.
  * Stewards cannot review, approve or archive other people's records.
* **Public sign-up never grants privileges.**
  * `RegisterIn` has no `role` field and forbids extra fields.
  * Every account is created as researcher.
  * `requested_role` steward or reviewer creates a `role_requests` row. A database check constraint allows only
    those two values, so admin can never be requested.
  * Only an administrator, through the API/UI or the operator CLI `python -m app.manage`, can grant a role.
* **Registration modes** (`CHRONO_REGISTRATION_MODE`):
  * `open`: researcher accounts are active at once and signed in.
  * `approval`: an administrator activates each account; until then sign-in gives `403 account_pending`.
  * `closed`: no public sign-up.
* **Publishing is now a steward capability.** A researcher sending `visibility: public` on create or patch gets
  `403 steward_required`. In v2 any researcher could publish directly; this was audit finding A3.
* **Sessions.**
  * Tokens are bound to `auth_sessions` rows.
  * Sign-out, sign-out everywhere, password change (other sessions), password reset and suspension all revoke them.
  * Tokens without a live session, including v2 tokens, are rejected.
  * Roles are read from the database on every request.
* **Passwords.**
  * scrypt hashes; at least 12 characters; must not contain the email name or display name.
  * Never generated, printed, logged, returned or written to audit events.
  * The seed no longer generates or prints passwords (finding A4).
* **Abuse limits.**
  * Sign-in, sign-up, password changes and role requests are rate-limited (configurable, counted per API worker).
  * Each non-admin user may have at most 3 unfinished calculations.
* **CSRF.** Cookie writes need the `x-chronoheritage-client` header. Sign-out from a cookie without it revokes
  nothing.
* Decision record: [`adr/0012`](adr/0012-accounts-roles-and-registration.md).

## 3. API contract changes (all consumers and tests updated)

* **New endpoints:**
  * `GET /auth/registration`
  * `PATCH /auth/me`, `POST /auth/me/password`
  * `POST /auth/me/role-requests`, `POST /auth/me/role-requests/{id}/withdraw`
  * `GET /auth/users`, `PATCH /auth/users/{id}`
  * `GET /auth/role-requests`, `POST /auth/role-requests/{id}/decision`
* **Changed:**
  * `POST /auth/register` takes `requested_role`, `affiliation` and `statement`. It applies the password rules and
    returns `{user, signed_in, token, role_request, message}`.
  * `POST /auth/login` adds `expires_at`, plus `403 account_pending` / `account_suspended`.
  * `POST /auth/logout` revokes the session (`?everywhere=true` revokes all).
  * `GET /auth/me` adds account fields and `capabilities`.
  * `POST /auth/users` accepts `steward` and requires 12-character passwords.
  * `POST /sites` and `PATCH /sites/{id}`: public visibility needs the steward role.
  * `POST /sites/{id}/archive`: owner or reviewer only.
  * `GET /sites/{id}` adds `permissions`.
  * Analysis, rerun and benchmark start can return `429 too_many_jobs`.
* **Wording:** two gate-condition labels changed ("approved by a reviewer"; "omitted from this build").
* The path prefix stays `/api/v2`. The application version is 3.0.0.

## 4. Files and modules

* **Backend, new:**
  * `app/services/accounts.py`, `app/ratelimit.py`, `app/manage.py`
  * `alembic/versions/0002_accounts_roles_sessions.py`
  * `tests/test_accounts.py` (34 tests)
* **Backend, changed:**
  * `models.py`, `schemas.py`, `security.py`, `deps.py`, `config.py`, `seed.py`, `main.py`
  * `api/v2/auth.py`, `sites.py`, `analyses.py`, `benchmarks.py`
  * `services/sites.py`, `jobs.py`, `analysis.py` (one warning string)
  * `science/gates.py` (two labels only)
  * `tests/conftest.py`, `test_api.py`, `test_migrations.py`
  * The 0001 migration (lint fixes only: imports and whitespace)
* **Frontend, new:**
  * `components/motifs.tsx`
  * `components/auth/*`, `components/analysis/Workflow.tsx`
  * `components/landing/{Journey, NightLayers, panels, data, labels}.tsx` and `components/landing/fortress/*`
  * `app/{register, account, admin}`
  * `lib/{password, prefs, nav, unsaved}.ts`
  * `scripts/perf/*`
  * e2e specs `auth` and `mobile`; unit tests for accounts and motifs
* **Frontend, rewritten or changed:**
  * `globals.css`, `ui.tsx`, `SiteNav`, `SiteFooter`, `SiteMap`, `GateCard`, `Editors`, `Demos`, `lib/auth.tsx`
  * Every page under `app/`
  * The landing choreography, copy and sections
* **Frontend, removed:** the v2 landing `scene/*`, `Narrative.tsx` and `StaticArt.tsx`.
* **Infrastructure and docs:**
  * `docker-compose.yml`, both Dockerfiles, `.gitattributes`, `.env.example`, `.github/workflows/ci.yml`
  * `README.md`, `docs/WINDOWS_SETUP.md`, `docs/V3_AUDIT.md`, `docs/PERFORMANCE.md`, `docs/ASSETS.md`
  * ADRs 0012 and 0013

## 5. Existing functionality preserved (checklist from the audit)

| Item | Evidence |
|---|---|
| Science modules unchanged in logic | `git diff` of `backend/app/science` shows only the two gate labels. The science and astronomy test files are unmodified and pass. |
| Residuals, conventions, chronology, refraction, horizon, Monte Carlo, references, statistics, gates | Same tests as v2, all passing (part of the 140 backend tests). |
| Snapshots and hashes, rerun lineage, review states, audit | API tests pass. Lineage is now also shown in the UI. |
| Cross-site endpoint closed until Tier 2 | Server test assertions unchanged and passing (its Tier-2 fixture now publishes through a steward). The e2e test also posts directly to `/analyses/cross-site` and is refused. |
| Illustrative records cannot be approved | Unchanged tests pass. Labels shown everywhere, including map markers. |
| Benchmark harness | 11 pass / 0 fail / 5 blocked offline. Suite hash `c69e642f…` unchanged. Historical agreement ≤ 0.0096° (tolerance 0.25°). |
| PDF, CSV and JSON reports with SHA-256 | e2e downloads a PDF through the UI; the browser recomputes its SHA-256 and it matches the recorded value. |
| Migrations on a fresh database, upgrade and downgrade | `test_migrations` covers base → head → 0001 (with v2 data) → head → base → head, plus a models-versus-migrations drift check. |
| Docker Compose (db, api, worker, web) and CI | Kept and extended. See §7 for what was actually run. |
| No ML | Unchanged; the migration test asserts no ML tables. |

## 6. Tests run and actual results

All on 2026-10-18/19 in the sandbox: 2 vCPU, Ubuntu 24.04, Python 3.13.16, Node 22.22.0, PostgreSQL 16 + PostGIS
3.4.2, Chromium 141 via Playwright 1.56.1.

| Check | Command | Result |
|---|---|---|
| Backend lint (whole backend; v2 CI linted only `app tests`) | `ruff check .` | clean |
| Backend tests | `pytest` | **140 passed** (v2 baseline 106) |
| Benchmark harness | `python -m app.benchmarks.harness --no-horizons` | 11 pass, 0 fail, 5 blocked |
| TypeScript | `npx tsc --noEmit` | clean |
| Frontend unit tests | `npx vitest run` | **37 passed** (v2 baseline 24) |
| Production build | `npm run build` | succeeded |
| End-to-end, Chromium, five viewports (1440×900, 1280×800, 768×1024, 390×844, 320×640) | `npx playwright test` | see the final line below |
| End-to-end against the Docker stack (desktop: auth + journeys) | `E2E_BASE_URL=http://localhost:13000 npx playwright test …` | 15 of 16 passed. The one failure was the sign-up rate limit (10 per hour, the production default) after 11 sign-ups, which is the limit working as designed. |

**Final Playwright run (Chromium, all five viewport projects, 2026-10-19):** **149 passed, 0 failed, 19 skipped**
(9.2 min). The 19 skips are by design: viewport-specific tests (3D on desktop, layered 2D on phone, keyboard
checks on desktop/laptop) are skipped on the other projects. The administrator-approval test ran, with an
administrator created through `app.manage --password-env` and credentials passed only through the environment.

The end-to-end suites cover:

* Landing:
  * the hero and its calls to action, with no console errors;
  * 3D scenes revealed by scroll, and layered 2D on phones;
  * the live engine calculation and the live ledger;
  * the skip link, the scene index and the Back button;
  * the switch to still images and back;
  * a slow device being moved to the layered view;
  * reduced motion, and no WebGL with and without reduced motion.
* Accounts:
  * register, sign out (the old session is rejected by the server) and sign in;
  * client and server validation, duplicate email and the password toggle;
  * a steward request that stays pending, and a hand-crafted publish that is refused;
  * a crafted admin sign-up refused (422) and admin endpoints refused (401/403);
  * the motion preference applied;
  * an administrator approving a reviewer request.
* Journeys:
  * atlas source tracing and the dossier navigation;
  * a blocked record that explains why;
  * Sky Explorer, including disabled unsupported targets;
  * an analysis run → workflow step → lineage → PDF with checksum confirmation;
  * feasibility "no decision";
  * benchmarks blocked ≠ pass;
  * cross-site refused in the UI and the API;
  * the documentation demo;
  * the unsaved-change guard;
  * researchers saving drafts only.
* Responsive (17 routes on every viewport): one `h1`, a skip link, no horizontal overflow, content below the fixed
  navigation, no console errors or 5xx responses; keyboard reach and skip-link focus.
* Mobile: the menu (focus, Escape, navigation), touch targets of at least 40 px, the atlas list/map toggle with a
  rendered map, Sky charts within the screen, and registration with the virtual keyboard types.

**Defects found by these checks and fixed before packaging:**

* 320 px overflow on `/feasibility` and `/documentation`.
* An absolutely positioned screen-reader span widened the page.
* A blur-triggered layout shift swallowed the sign-up click on phones.
* After using an in-page link, the Back button restored the URL but not the page.
* The 3D stack was pulled into the initial landing bundle (439 → 200 KB).
* A 0.41 layout shift on the site dossier.
* A context-loss message overwrote the slow-device explanation.

## 7. Docker, Windows and cross-browser: what was and was not verified

* **Docker Compose, with stand-in base images.**
  * The sandbox's Docker daemon cannot download from Docker Hub (the egress policy blocks it).
  * To exercise the real Dockerfiles, Compose file, entrypoint, migrations, worker and proxy, local stand-in images
    were assembled and tagged with the official names:
    * `python:3.13-slim`: Ubuntu 24.04 minbase plus CPython 3.13.16
    * `node:22-slim`: Ubuntu minbase plus Node 22.22.0
    * `postgis/postgis:16-3.4`: Ubuntu PostgreSQL 16 + PostGIS 3.4.2 with a minimal entrypoint
  * With those, every project file was used unchanged:
    * `docker compose build` succeeded.
    * `docker compose up -d` brought db, api and web to *healthy* and the worker up.
    * Alembic reported `0002 (head)`.
    * `app.manage create-user` worked through a real interactive prompt.
    * The worker ran the benchmark suite: 11 pass / 5 blocked, the same as natively.
    * The browser flows above passed against the stack.
  * **Not verified:** the official Docker Hub base images themselves, and Docker Desktop on Windows. The new CI job
    `compose` builds from the official images and smoke-tests the stack, but it has not run on GitHub.
* **Windows instructions.**
  * The PowerShell commands for `.env`, secrets, health checks, `compose ps`, logs, stop/start/restart, migrations
    and account creation were run with PowerShell 7.4 on Linux against the stack above.
  * The `.env` is written without a BOM, and the placeholder check passes.
  * Not run: `Expand-Archive` on Windows, `code .`, `Start-Process` (opening URLs), `Get-NetTCPConnection`
    (Windows-only), Windows PowerShell 5.1 and Docker Desktop itself.
* **Firefox and WebKit.** Only Chromium is available offline here, and its browsers cannot be downloaded. The
  Playwright configuration and the CI e2e job run the same suites on Firefox and WebKit
  (`E2E_ENGINES=chromium,firefox,webkit`), but that has not been executed.
* **Real GPUs and phones.**
  * Frame rates were measured only with software WebGL: 0.2–5 fps in 3D, 58–60 fps in the layered 2D renderer.
  * A runtime frame-rate monitor now moves devices that render 3D below 15 fps to the 2D renderer; this is tested.
  * Real-device frame rates remain unmeasured. See [`PERFORMANCE.md`](PERFORMANCE.md).
* **Accessibility.** The checks were structural and automated: headings, skip link, focus, keyboard, labels and
  `aria-describedby`, status text plus glyph, no overflow, reduced motion. No screen-reader session and no
  automated contrast audit tool (such as axe or Lighthouse) was run; neither tool was available. The palette's text
  colours were chosen for WCAG AA on the obsidian background, but this is not certified.
* **Live JPL Horizons.** Not reachable from the sandbox. The modern cases stay *blocked*, as in v2.

## 8. Security considerations

* Authorization is enforced only in the API. The UI mirrors server-computed `permissions` and `capabilities`, and
  tests send crafted requests to confirm that the server refuses them.
* No credentials exist in source, documentation or bundles:
  * The e2e suite signs up random throw-away accounts.
  * Administrator e2e credentials come from the environment.
  * CI generates and masks a per-run password.
* `.env` is git-ignored and excluded from the archive. The `change-me` placeholder secret is refused in production
  and ignored in development.
* Duplicate-email responses reveal that an address is registered. This was accepted, because the brief asks for
  duplicate handling and registration is rate-limited (ADR 0012).
* Rate limits run in process (per API worker) and key on the forwarded client address. In production, publish only
  the web service over HTTPS, keep the API port private, and add limits at the reverse proxy.
* There is no email verification and no self-service password reset by email, because no mail service is required.
  Administrators reset passwords with `app.manage`.
* Uploaded photographs and repeat readings are private to their author and reviewers by default. Any researcher can
  add them to a site they can see; publishing them remains a reviewer action.

## 9. Known limitations and unresolved external dependencies

1. The scientific and adoption evidence gates are **not passed**; they are unchanged from v2.
   * Only five fictional demonstration sites exist.
   * The Horizons, DEM-terrain and published-case benchmarks are blocked.
   * No workflow measurements or researcher pilots have been recorded.
2. Official base images, Docker Desktop on Windows, Firefox and WebKit, real GPUs and phones, and live Horizons are
   unverified (§7).
3. The Sky Explorer calculation has a p95 of 4.4 s with 8 concurrent requests on one process. It is 0.35 s on its
   own. More API workers are the mitigation.
4. The 3D canvas took 4.7 s to attach under software rendering on 2 vCPU, against a 3 s budget. The 2D layer is shown
   meanwhile.
5. Rate limits are per process, not shared.
6. When the 3D scene is not visible, its overlays are hidden from assistive technology. The full narrative, including
   the live values, is provided in a screen-reader-only section instead.

## 10. Where the rest lives

* Windows setup and test accounts: [`WINDOWS_SETUP.md`](WINDOWS_SETUP.md), and *Accounts, roles and test accounts*
  in the README.
* Audit and baseline: [`V3_AUDIT.md`](V3_AUDIT.md).
* Performance: [`PERFORMANCE.md`](PERFORMANCE.md).
* Decisions: [`adr/`](adr).
