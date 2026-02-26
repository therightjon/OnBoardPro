# OnBoardPro

OnBoardPro is a TypeScript monorepo for candidate onboarding workflows.

- Backend: Express + Drizzle ORM + PostgreSQL
- Frontend: React 18 + Vite + TanStack Query + Wouter
- Shared contracts: `@shared/schemas` for enums/types/schemas used across client and server
- Auth: session-based auth (passport), with configurable local + LDAP + OAuth providers
- Async workflows: event bus + background jobs for deadlines, notifications, and email delivery

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill required values:

```bash
cp .env.example .env
```

3. Start Postgres (optional for local dev, recommended):

```bash
docker-compose up db -d
```

The DB container seeds from `initdb/phase5_sample_data.sql` on first initialization.

4. Start the app:

```bash
npm run dev
```

5. Open the app/API:

- App + API: `http://localhost:5000`
- Swagger UI: `http://localhost:5000/api/docs`
- OpenAPI JSON: `http://localhost:5000/api/docs.json`

Note: if the requested port is busy, the server can fall back to the next available port.

## Scripts

### Core

- `npm run dev` - Start Express in development mode with Vite middleware
- `npm run build` - Build client to `dist/public` and server bundle to `dist/`
- `npm start` - Run production bundle from `dist/index.js`
- `npm run check` - TypeScript type-check

### Testing

- `npm test` - Run backend + frontend tests
- `npm run test:backend` - Backend tests (`tsx --test`) for auth/routes/repositories/services/utils scopes
- `npm run test:frontend` - Frontend tests (`vitest run`)
- `npm run test:auth` - Backend auth test subset
- `npm run test:routes` - Backend routes test subset
- `npm run test:db` - Backend DB test subset (path is currently included in script, even if no db test directory exists)
- `npm run test:watch` - Vitest watch mode
- `npm run test:ui` - Vitest UI
- `npm run test:coverage` - Vitest coverage report

### Database & Maintenance

- `npm run db:push` - Apply Drizzle schema changes (`drizzle-kit push`)
- `npm run db:run-sql -- <file1.sql> [file2.sql...]` - Run one or more SQL files via `scripts/runSqlFiles.ts`
- `npm run db:migrate-file -- <file.sql>` - Run a single SQL file via `scripts/runMigration.ts`
- `npm run db:clear` - Clear database data
- `npm run db:clear:dry-run` - Show what `db:clear` would remove
- `npm run user:set-password` - Set a local user password
- `npm run script:clear-candidates` - Clear candidate data helper
- `npm run script:seed-candidates` - Seed test candidates

### Known Script Drift

- `npm run db:import` currently references `scripts/importDatabaseExport.ts`, which is not present in this repository.

## Environment

Environment validation is centralized in `server/config/env.ts`.

### Required

- `DATABASE_URL`
- `SESSION_SECRET` (minimum 32 chars)

### Common

- `NODE_ENV` (`development` | `production` | `test`, default `development`)
- `PORT` (default `5000`)
- `COOKIE_DOMAIN` (optional)
- `TRUSTED_PROXIES` (comma-separated trusted proxy list, or `loopback`)

### Rate Limiting

- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX` (default `200`)
- `SENSITIVE_RATE_LIMIT_WINDOW_MS` (optional; falls back to `RATE_LIMIT_WINDOW_MS`)
- `SENSITIVE_RATE_LIMIT_MAX` (default `60`)

### Session Timeout Defaults

- `SESSION_IDLE_TIMEOUT_HOURS` (default `2`)
- `SESSION_ABSOLUTE_TIMEOUT_HOURS` (default `24`)

### Background Job Flags

Set to `1` to disable:

- `DISABLE_DEADLINE_SCANNER`
- `DISABLE_EMAIL_JOBS`
- `DISABLE_NOTIFICATION_CLEANUP`

### Authentication Provider Config

- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- LDAP: `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_BASE_DN`, `LDAP_USER_FILTER`, `LDAP_ATTR_*`
- Legacy LDAP aliases are still accepted (`LDAP_SEARCH_BASE`, `LDAP_SEARCH_FILTER`, etc.)

### Email Link Base URL

`server/utils/app-url.ts` resolves app links from first non-empty value in:

- `APP_BASE_URL`
- `PUBLIC_URL`
- `CLIENT_URL`
- `VITE_APP_URL`

Fallback is `http://localhost:5173`.

## Project Structure

- `client/` - React app (routes/pages/components)
- `server/` - Express app (routes/services/repositories/middleware/events/jobs)
- `shared/schemas/` - Canonical schema + types + enums
- `shared/schema.ts` - Legacy aggregate schema export used by some tooling/imports
- `scripts/` - DB and operational scripts
- `migrations/` - SQL migrations
- `initdb/` - Local DB bootstrap SQL
- `docs/` - Architecture, domain, operational, and product docs (`docs/README.md` is the index)

## Development Notes

- Path aliases:
  - `@/*` -> `client/src/*`
  - `@shared/*` -> `shared/*`
- API docs are served from `server/routes/docs.ts` and generated from `server/docs/openapi-spec.ts`
- CSRF protection is applied on `/api` with specific exclusions in `server/routes.ts`
- Rate limiting is DB-backed (`rate_limit_counters`) and wired in `server/middleware/rate-limiter.ts`

## License

MIT (`package.json`)
