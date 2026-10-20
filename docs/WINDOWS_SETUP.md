# Running ChronoHeritage V3.0 on Windows 11 (Docker Desktop and VS Code)

These steps use **PowerShell** (Windows Terminal, or the terminal inside VS Code) and the files that ship in the
archive: `docker-compose.yml`, `.env.example`, `backend/` and `frontend/`. Every command is run from the project
folder unless a step says otherwise.

> **How these steps were checked.** The PowerShell lines in steps 4–7 and 9–11 were run with PowerShell 7 against
> the real Compose stack. That stack was built from locally assembled stand-ins for the base images, because the
> development sandbox cannot download from Docker Hub. Windows itself, Windows PowerShell 5.1 and Docker Desktop
> were not available, so this exact path was not run end to end. In particular `Expand-Archive`, `code .`,
> `Start-Process` and `Get-NetTCPConnection` were not run on Windows. The implementation report has the details.

## 0. Prerequisites (once)

| Need | Notes |
|---|---|
| Windows 11 with virtualisation enabled | Docker Desktop uses WSL 2. |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) 4.x or later | Use the **WSL 2 based engine** (Settings → General). Give it at least 4 GB of memory (Settings → Resources); the web build is memory-hungry. |
| [Visual Studio Code](https://code.visualstudio.com/) | During installation, tick "Add to PATH" so `code .` works. |
| About 6 GB of free disk space | Images plus the JPL DE406 ephemeris (about 180 MB), which is downloaded during the build. |
| Free ports 3000 and 8000 | Step 11 shows how to use other ports. |

Start Docker Desktop and wait until it reports that the engine is running. Then check:

```powershell
docker version
docker compose version
```

## 1. Extract the archive

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\Projects" | Out-Null
Expand-Archive -Path "$HOME\Downloads\chronoheritage-v3.0.zip" -DestinationPath "$HOME\Projects" -Force
Set-Location "$HOME\Projects\chronoheritage"
Get-ChildItem
```

You should see `backend`, `frontend`, `docs`, `docker-compose.yml`, `.env.example` and `README.md`.

## 2. Open the project in VS Code

```powershell
code .
```

To use the integrated terminal, choose **Terminal → New Terminal** (it opens PowerShell in the project folder).

## 3. Create `.env` from the example

```powershell
Copy-Item .env.example .env
```

`.env` holds your local secrets. It is listed in `.gitignore` and must never be committed or shared.

## 4. Set the secrets without displaying them

These lines replace the two `change-me` placeholders with long random values. They write the file as UTF-8
without a byte-order mark and never print the values.

```powershell
function New-Secret([int]$Bytes = 48) {
  $b = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b) -replace '[+/=]', ''
}
$envText = Get-Content .env -Raw
$envText = $envText -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$(New-Secret 24)"
$envText = $envText -replace '(?m)^CHRONO_SECRET_KEY=.*$', "CHRONO_SECRET_KEY=$(New-Secret 48)"
[System.IO.File]::WriteAllText((Resolve-Path .env), $envText)

# Check without revealing anything: this prints nothing if both placeholders were replaced.
Select-String -Path .env -Pattern '^(POSTGRES_PASSWORD|CHRONO_SECRET_KEY)=change-me'
```

Other settings in `.env` that you may want to change in VS Code (`code .env`):

* `CHRONO_REGISTRATION_MODE`
  * `open` (default): new researcher accounts work at once.
  * `approval`: an administrator activates each new account.
  * `closed`: no public sign-up.
* `CHRONO_SEED_DEMO=true` loads the five fictional demonstration sites. They are clearly labelled and never count
  as evidence.
* `CHRONO_HORIZONS_ENABLED=false` keeps the benchmark suite offline. The JPL Horizons cases are then reported as
  *blocked*, never as passed.

Do **not** change `POSTGRES_PASSWORD` after the first start. The database volume keeps the original password
(see Troubleshooting).

## 5. Build and start

```powershell
docker compose up --build -d
```

The first build takes several minutes: it installs the Python packages (including the DE406 ephemeris) and builds
the Next.js site. Later starts take seconds. Four services start:

* `db`: PostgreSQL 16 with PostGIS 3.4
* `api`: FastAPI. On start it runs migrations, registers the benchmark suite and loads the demo data.
* `worker`: background analyses and benchmark runs
* `web`: Next.js

## 6. Check that the services are healthy

```powershell
docker compose ps
```

Wait until `db` and `api` show `healthy` and `web` shows `Up`/`healthy`. To wait automatically and then print the
API health report:

```powershell
$h = $null
do {
  Start-Sleep -Seconds 5
  try { $h = Invoke-RestMethod http://localhost:8000/api/v2/health } catch { $h = $null }
} until ($h -and $h.ok)
$h | ConvertTo-Json
```

A healthy report shows `api : ok`, `database : ok`, a PostGIS version, the DE406 date span and `ok : True`.

## 7. Open the application and the API documentation

```powershell
Start-Process http://localhost:3000            # the web application
Start-Process http://localhost:3000/api/docs   # interactive API documentation (OpenAPI)
```

## 8. Create or reset a local test account

There are no built-in passwords. Choose one of these:

**A. A researcher account, through the web page.** Open <http://localhost:3000/register> and choose *Researcher*.
Choosing *Data Steward* or *Reviewer* sends a request that an administrator must approve; until then the account
has researcher access.

**B. An administrator (or any role), with the operator command.** The password is typed into a hidden prompt
twice. It never appears on screen, in the shell history or in a log.

```powershell
docker compose exec api python -m app.manage create-user --email you@example.org --name "Your Name" --role admin
```

Other operator commands:

```powershell
docker compose exec api python -m app.manage list-users
docker compose exec api python -m app.manage reset-password --email you@example.org
docker compose exec api python -m app.manage set-role --email someone@example.org --role steward
docker compose exec api python -m app.manage set-status --email someone@example.org --status active
```

* `reset-password` signs the account out everywhere.
* `set-status ... active` activates an account in `approval` mode.
* Administrators can do all of this in the browser at <http://localhost:3000/admin>.
* Passwords need at least 12 characters and may not contain your email name or display name.

## 9. Stop and restart

```powershell
docker compose stop                 # stop, keep everything
docker compose start                # start again
docker compose restart api worker   # restart only the backend
docker compose down                 # remove the containers; the database and reports are kept (named volumes)
docker compose up -d                # create and start them again
```

> `docker compose down -v` also **deletes the database and generated reports**. Use it only for a clean slate.

After you change `.env`, apply it with `docker compose up -d`. After you change source code, rebuild with
`docker compose up --build -d`.

## 10. View logs

```powershell
docker compose logs -f api            # follow the API (Ctrl+C to stop following)
docker compose logs --tail 100 worker
docker compose logs --tail 100 web
docker compose logs --tail 100 db
```

Passwords and session tokens are never written to these logs.

## 11. Troubleshooting

**Docker is not running.** `docker version` shows only a *Client* section, or reports "error during connect".
Start Docker Desktop and wait for the engine to start.

**A port is already in use.** The error reads `bind: Only one usage of each socket address` or
`port is already allocated`. Find the program using it:

```powershell
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen |
  Select-Object LocalPort, OwningProcess, @{ n = 'Process'; e = { (Get-Process -Id $_.OwningProcess).ProcessName } }
```

Either stop that program, or move ChronoHeritage to other ports. Add these lines to `.env`, run
`docker compose up -d`, then open <http://localhost:3001>:

```text
CHRONO_WEB_PORT=3001
CHRONO_API_PORT=8001
```

**The API never becomes healthy.**

* Run `docker compose logs --tail 200 api`.
* `password authentication failed for user "chrono"` means `POSTGRES_PASSWORD` changed after the database was first
  created. Put the original value back. If the data is disposable, run `docker compose down -v`, then
  `docker compose up -d` to start fresh.
* `could not translate host name "db"` means the database container is not up. Check
  `docker compose logs db` and `docker compose ps`.

**Migrations.** The API applies them on every start. To run them by hand, or to see the current revision:

```powershell
docker compose run --rm api migrate
docker compose exec api alembic current
```

The expected head revision is `0002`.

**`exec ./docker-entrypoint.sh: no such file or directory`.** The script was saved with Windows line endings. The
image build removes them, so rebuild with `docker compose build --no-cache api worker`.

**The build stops with `exit code: 137` or "killed".** Docker ran out of memory. Raise the memory limit in Docker
Desktop (Settings → Resources), or add `memory=6GB` under `[wsl2]` in `%UserProfile%\.wslconfig`, then run
`wsl --shutdown` and restart Docker Desktop.

**Signing in fails.**

* "Email or password is incorrect": reset the password (step 8).
* "waiting for an administrator to activate it": you are in `approval` mode. Run
  `set-status --status active` or use the admin page.
* "Too many sign-in attempts": wait five minutes.
* You are signed out after every restart: `CHRONO_SECRET_KEY` still starts with `change-me`. Redo step 4, then run
  `docker compose up -d`.
* Over plain `http://` keep `CHRONO_COOKIE_SECURE=false`. Set it to `true` only behind HTTPS.

**An analysis stays "Queued".** The worker runs queued jobs. Check `docker compose ps worker` and
`docker compose logs --tail 100 worker`, and restart it with `docker compose restart worker`.

**JPL Horizons benchmark cases are "blocked".** This is expected offline or when `CHRONO_HORIZONS_ENABLED=false`.
With internet access and the setting set to `true`, start a run from the Benchmarks page.
