# AGENTS.md

Repository memory for the БОМБА БЕТ project. Keep this file current when you
learn something durable about building, running, or testing the project.

## What this is

Joke private sports-prediction app for a group of friends. Virtual points only.
No deposits, no paid bets, no gambling. Prizes are handed out manually by the
admin in Telegram Stars. This is a hard product constraint: never add real-money
flows, deposits, or payment integrations.

## Layout

- `backend/` — Node.js + TypeScript REST API, PostgreSQL, JWT. Owns all money-
  like logic (balances, payouts). Clients never change balances.
- `admin/` — React + TypeScript + Vite admin panel (owner-only).
- `android/` — Kotlin + Jetpack Compose app.
- `docker/` — entrypoint script and backup directory.
- `docker-compose.yml` — db + api + admin + backup stack.
- `docs/` — `DEPLOYMENT.md`, `DEPLOY_RENDER.md`, `BUILD_APK.md`.

## Build and test commands

Backend (from `backend/`):

- `npm test` — vitest unit tests (`src/__tests__/unit.test.ts`).
- `npm run typecheck` — `tsc --noEmit` over everything, including tests.
- `npm run build` — compiles with `tsconfig.build.json` (excludes tests from `dist`).
- `ADMIN_PASSWORD='<pw>' bash scripts/e2e.sh` — 52-check end-to-end suite
  against a running server.
- Migrations run automatically on API startup (`src/db/migrate.ts`). Startup
  also ensures default settings and the bootstrap admin (`seedAdmin`), so
  `npm start` is self-contained; all three steps are idempotent.
- `npm run migrate:prod` / `npm run seed:prod` run the compiled `dist/` versions
  (no `tsx`), which is what a production host uses.

Android (from `android/`, needs `ANDROID_HOME` set to the SDK):

- `gradle :app:testDebugUnitTest` — 25 unit/integration tests.
- `gradle :app:assembleDebug :app:assembleRelease` — builds both APKs.
- Release APK is debug-signed (no release keystore in the repo).

Full stack:

- `cp .env.example .env` then `docker compose up -d --build`.
- Admin bootstrap password is printed once in `docker compose logs api`.

## Environment notes

- The sandbox has no Android emulator/system image, so the app cannot be run on
  screen here. Verify Android changes with unit tests plus a successful APK build.
- `docker compose` works with `sudo` in this sandbox.
- Backend `API_BASE_URL` for the Android emulator is `http://10.0.2.2:4000`.

## Conventions and gotchas

- Points come in two buckets on every user: `balance` (total) and
  `withdrawable_balance` (cashable). Only points *won* in predictions are
  cashable; signup/daily bonuses and admin gifts are not. `src/services/economy.ts`
  owns the split (`resolveSplit`) and is unit-tested — change it there, not in
  the routes.
- Prize requests are denominated in Telegram Stars (`stars`), converted at
  `prizes.pointsPerStar` (default 100). The fund is capped at `prizes.maxStars`
  (default 125 ⭐).
- `backend/scripts/reset-test-data.sql` is a one-time launch wipe: it deletes
  every event and non-admin account and resets the point scale. Do not run it
  after real friends have registered.
- API responses wrap payloads (e.g. settings come back as `{settings: {...}}`
  with dotted keys). Prize reject uses the `rejectReason` field.
- `GET /api/prizes/rules` is intentionally public: it is registered before the
  global `requireAuth` middleware in `src/routes/prizes.ts`.
- The daily bonus counts failed rolls (`kind IN ('daily','daily_attempt')`) so
  the published "once per day" rule cannot be bypassed by spamming requests.
- Do not commit `.env`; it holds real secrets. Use `.env.example` as the template.
- Render deploy gotchas (see `docs/DEPLOY_RENDER.md`, `render.yaml`):
  `package.json` lives in `backend/`, so the Render service needs
  **Root Directory = `backend`** or the build fails with
  `ENOENT .../src/package.json`. Render sets `NODE_ENV=production`, which makes
  `npm ci` skip devDependencies, so the build command must be
  `npm ci --include=dev && npm run build` (otherwise `tsc: not found`).
  In production, missing `DATABASE_URL`/`JWT_SECRET` throws at boot on purpose.
- Server binds `config.host` (`HOST`, default `0.0.0.0`); startup retries the DB
  `DB_READY_ATTEMPTS` (30) times every `DB_READY_DELAY_MS` (2000ms) so a managed
  database that is still booting does not crash-loop the service.
- UI language is Russian. Theme: dark graphite (`#0A0A0C`/`#121216`) with red
  (`#FF3B30`) and orange (`#FF7A18`) accents.
