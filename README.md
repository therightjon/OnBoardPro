# OnBoardPro

OnBoardPro is a TypeScript monorepo for managing candidate onboarding. The stack pairs an Express/Drizzle/PostgreSQL API with a Vite + React 18 SPA, sharing types and schema definitions across client and server. Session-based auth (passport) supports local logins plus optional SSO/LDAP, and background jobs drive notification and deadline workflows.

## Quick start
1) Prereqs: Node 22+, npm, Docker (for Postgres).  
2) Install deps: `npm install` (root).  
3) Start database: `docker-compose up db` (uses `initdb/phase5_sample_data.sql`).  
4) Copy `.env` and fill values (see Environment).  
5) Dev server: `npm run dev` (Express + Vite middleware on PORT, defaults to 5000).  
6) Open API docs at `http://localhost:5000/api/docs` once the server is running.

## Scripts (verified)
- `npm run dev` — start Express in development with Vite middleware.
- `npm run build` — Vite build for client to `dist/public` and esbuild bundle for server to `dist/`.
- `npm start` — run the bundled server (expects `dist` from build).
- `npm run check` — TypeScript type-check.
- `npm test` — run backend and frontend test suites.
  - `npm run test:backend` — `tsx --test server/tests/**` (happy-dom disabled).
  - `npm run test:frontend` — `vitest run` (happy-dom).
  - `npm run test:coverage` — Vitest coverage for frontend.
- Database utilities:
  - `npm run db:push` — apply Drizzle migrations.
  - `npm run db:import` — import `database_export.sql`.
  - `npm run db:run-sql` — run SQL files using `npx tsx scripts/runSqlFiles.ts`.
  - `npm run db:migrate-file` — run a single SQL file using `npx tsx scripts/runMigration.ts`.

Running SQL migrations manually
-----------------------------

You can apply a single SQL migration file or multiple SQL files using the TypeScript scripts in `scripts/`.

- Apply a single migration with `runMigration.ts` (executes the SQL within a transaction and detects Neon SSL):

  ```bash
  npx tsx scripts/runMigration.ts migrations/0018_crud_audit.sql
  # or using the npm helper
  npm run db:migrate-file -- migrations/0018_crud_audit.sql
  ```

- If you don't have a `.env` file, set `DATABASE_URL` inline:

  ```bash
  DATABASE_URL="postgresql://db_user:password@localhost:5432/onboardpro" \
  npx tsx scripts/runMigration.ts migrations/0018_crud_audit.sql
  ```

- Run multiple SQL files (runs each file in a transaction):
  ```bash
  npx tsx scripts/runSqlFiles.ts migrations/0001_initial.sql migrations/0002_prior_stage_blocking.sql
  # or using the npm helper
  npm run db:run-sql -- migrations/0001_initial.sql migrations/0002_prior_stage_blocking.sql
  ```

Notes and safety tips
---------------------
- Backup your DB before running manual migrations (for Postgres, `pg_dump` is a convenient option).
- `runMigration.ts` expects `DATABASE_URL` to be set and will exit with an error if it is missing.
- The scripts use `dotenv/config`, so placing a `.env` at the repo root works automatically.
- The repository currently documents `npm run db:run-sql` as calling a `mjs` script; you can instead call the TypeScript script directly with `npx tsx` as shown above if you prefer working with TS runtime.
- For Neon-managed databases, the script automatically enables SSL by detecting `neon.tech` in the host name.

- Auth helper: `npm run user:set-password` — set a local user password.

## Environment
Env validation lives in `server/config/env.ts`. Required or common keys:
- `NODE_ENV` (`development` | `production` | `test`, default `development`)
- `PORT` (default `5000`)
- `DATABASE_URL` (Postgres connection string; SSL auto-enabled for Neon hosts)
- `SESSION_SECRET` (>=32 chars)
- Session timeouts: `SESSION_IDLE_TIMEOUT_HOURS` (default `2`), `SESSION_ABSOLUTE_TIMEOUT_HOURS` (default `24`)
- Proxy configuration: `TRUSTED_PROXIES` (comma-separated list of trusted proxy IPs, or `loopback` for localhost; required for proper client IP resolution behind load balancers)
- Rate limits: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `SENSITIVE_RATE_LIMIT_WINDOW_MS`, `SENSITIVE_RATE_LIMIT_MAX`
- Feature flags/jobs: `DISABLE_DEADLINE_SCANNER`, `DISABLE_EMAIL_JOBS`, `DISABLE_NOTIFICATION_CLEANUP`
- SMTP (optional): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- OAuth/SSO (optional): `GOOGLE_CLIENT_ID/SECRET`, `AZURE_CLIENT_ID/SECRET`, `AZURE_TENANT_ID`
- LDAP (optional): `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_SEARCH_BASE`, `LDAP_SEARCH_FILTER`

## Project structure
- `server/` — Express app entry (`index.ts`), config, routes, middleware, services, repositories, events, background jobs, tests.
- `client/` — Vite React SPA (`src/main.tsx`, `src/App.tsx`) with routes under `src/app/(dashboard)` and feature modules in `src/features`.
- `shared/` — Drizzle schema, enums, and shared types reused via the `@shared` alias.
- `docs/` — documentation (architecture, glossary, audits).
- `scripts/` — database and maintenance utilities.
- `initdb/` — seed SQL for local Postgres.
- `dist/` — build output (server bundle + static client).

## Development notes
- Path aliases: `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`.
- API docs: Swagger UI served at `/api/docs`; canonical JSON at `/api/docs.json` (single OpenAPI source in `server/docs/openapi-spec.ts`).
- Background jobs: deadline scanner, email notification sender, notification cleanup (toggle via env flags).
- Rate limiting: default and "sensitive" limiters applied in routers (see `server/middleware/rate-limiter.ts`).
- Password security: Consolidated utilities in `server/utils/passwords.ts` for hashing (bcrypt/scrypt), constant-time comparison to prevent timing attacks, and a 10,000+ entry common password blocklist sourced from [SecLists](https://github.com/danielmiessler/SecLists).
## Testing
- Backend tests use `tsx --test` (see `server/tests/**`). Requires `NODE_ENV=test` and typically `SKIP_AUTH_SETUP=1` for isolated routes.
- Frontend tests run with Vitest + happy-dom (`client/tests/setup.ts`).
- Prefer running `npm test` for the full suite before shipping changes.

## Licensing
MIT (see `package.json`).
