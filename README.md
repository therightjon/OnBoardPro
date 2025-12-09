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
  - `npm run db:run-sql` — run SQL files from `scripts/runSqlFiles.mjs`.
- Auth helper: `npm run user:set-password` — set a local user password.

## Environment
Env validation lives in `server/config/env.ts`. Required or common keys:
- `NODE_ENV` (`development` | `production` | `test`, default `development`)
- `PORT` (default `5000`)
- `DATABASE_URL` (Postgres connection string; SSL auto-enabled for Neon hosts)
- `SESSION_SECRET` (>=32 chars)
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
- API docs: Swagger UI served at `/api/docs`; JSON at `/api/docs.json` or `/api/docs/spec.json`.
- Background jobs: deadline scanner, email notification sender, notification cleanup (toggle via env flags).
- Rate limiting: default and “sensitive” limiters applied in routers (see `server/middleware/rate-limiter.ts`).

## Testing
- Backend tests use `tsx --test` (see `server/tests/**`). Requires `NODE_ENV=test` and typically `SKIP_AUTH_SETUP=1` for isolated routes.
- Frontend tests run with Vitest + happy-dom (`client/tests/setup.ts`).
- Prefer running `npm test` for the full suite before shipping changes.

## Licensing
MIT (see `package.json`).
