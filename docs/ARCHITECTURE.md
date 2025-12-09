# Architecture

This doc explains how the system is structured so changes stay aligned across the API, background jobs, and the React client. Keep this in sync with `docs/AI_DOC_AUDIT.md`.

## Runtime overview
- Request flow: Express (`server/index.ts`) loads env and DB, configures middleware (helmet, compression, request-id, sessions, rate limiting), mounts routers (`server/routes.ts`), then hands off to services/repositories. Errors bubble to `server/utils/error-handler.ts`.
- Dev vs prod: In development, Vite middleware (`server/vite.ts`) serves the SPA; production serves static assets from `dist/public` and the bundled server from `dist/index.js`.
- Data access: Drizzle ORM against PostgreSQL (`server/config/database.config.ts`), schema/types in `shared/schema.ts` and `shared/schemas/*.ts`. Pool SSL auto-enabled for Neon hosts.
- Auth: Passport local strategy plus optional Google/Azure/LDAP providers (see `server/features/auth/services`). Sessions stored in Postgres via `connect-pg-simple`; roles/scopes resolved per request.
- Events + jobs: Domain events via `server/events/*` feed notification handlers. Background jobs in `server/jobs/*` handle deadline scans, email outbox, and notification cleanup (toggle with env flags).
- API docs: Swagger UI served at `/api/docs`; OpenAPI source in `server/docs/openapi-spec.ts` and config at `server/config/swagger.config.ts` (consolidation recommended).

## Backend layout
- Entry: `server/index.ts` and `server/routes.ts`.
- Config: `server/config/*.ts` for env validation, DB connection, swagger options.
- Routers (under `/api`): `server/routes/*.routes.ts` for auth, candidates, tasks, templates, notifications/comments, users, organizations, settings, reference-data, search/dashboard. Health checks in `server/routes/health.ts`, docs in `server/routes/docs.ts`.
- Middleware: `server/middleware/*` (authorization, rate limiting, request-id).
- Services: `server/services/**` encapsulate business logic. A dependency-injection factory (`server/services/service-factory.ts`) wires services to repositories and DB.
- Repositories: `server/repositories/**` wrap Drizzle queries and auth-scoped filtering. `BaseRepository` handles cursor/pagination helpers.
- Utilities: `server/utils/*` for auth helpers, notifications, dates, sanitization, error handling.
- Observability: `server/observability/authMetrics.ts` for auth-deny reporting; request logging inline in `server/index.ts`.
- Tests: `server/tests/**` with route/service/repository coverage and mock factories.

## Frontend layout
- Entry: `client/src/main.tsx` mounts `client/src/App.tsx`.
- Routing: `wouter` with protected routes via `client/src/lib/protected-route.tsx`. Pages live under `client/src/app/(dashboard)/**` and `client/src/app/auth/page.tsx`.
- Data layer: TanStack Query with shared `queryClient` (`client/src/lib/queryClient.ts`). Helpers for cache keys/invalidations in `client/src/lib/*`.
- Features: Domain-specific UI and hooks in `client/src/features/**` (auth, candidates, tasks, templates, settings, notifications, comments).
- Shared UI: `client/src/shared/components` (theme provider, sidebar, shadcn/radix components), shared hooks in `client/src/shared/hooks`.
- Styling: Tailwind with `tailwind.config.ts` and `client/src/index.css` / `global.css`.

## Shared contracts
- Types and schema: `shared/schema.ts` and `shared/schemas/*.ts` define Drizzle tables, enums, and Zod insert/select schemas reused via the `@shared` alias.
- Preferences/utilities: `shared/preferences.ts` plus validation helpers consumed by both client and server.

## Background jobs and events
- Jobs: `server/jobs/scan-deadlines.ts` (deadline emitter), `server/jobs/notification-email.ts` (outbox processing), `server/jobs/notification-cleanup.ts` (cleanup). Controlled by `DISABLE_*` env flags.
- Events: `server/events/*` defines types/factories, middleware, and notification handlers. Services and routes publish events (candidate/task/template/user changes) consumed by notification flows.

## API surface (top-level)
- Auth & identity: `/api/auth/login`, `/api/auth/logout`, `/api/user`, invitations `/api/invitations/accept`, provider/LDAP config endpoints.
- Candidates: `/api/candidates` CRUD, status/stage updates, restore, tasks, stage history, comments, template application, due-date recompute.
- Tasks: `/api/tasks`, `/api/tasks/mine`, `/api/tasks/dashboard`, CRUD, bulk update, comments.
- Templates: `/api/templates` CRUD, readiness/status, estimate, stage/task CRUD (`/template-tasks`, `/template-stages`, reorder, create-with-task`).
- Notifications & comments: `/api/notifications`, mark-all-read, comment edit/delete.
- Users & prefs: `/api/me/preferences`, `/api/users` CRUD, roles, enable/disable, task-count, manager/assignable lookups.
- Orgs/reference: `/api/departments`, `/api/divisions`, `/api/task-definitions`, `/api/hiring-stages`, `/api/task-categories`, `/api/task-priorities`, `/api/candidate-types`, `/api/faculty-ranks`.
- Settings/search: `/api/system-settings`, `/api/settings/email`, `/api/dashboard/*`, `/api/search/*`.

## Dev/build/test flow
- Dev: `npm run dev` boots Express with Vite middleware; live reload on both API and client. Uses env from `.env`.
- Build: `npm run build` runs Vite client build to `dist/public` and esbuild bundles `server/index.ts` to `dist/index.js`.
- Start (prod): `npm start` runs the bundled server, serving static assets from `dist/public`.
- Tests: `npm run test:backend` (`tsx --test server/tests/**`), `npm run test:frontend` (`vitest run` with happy-dom), `npm run check` for type safety.

## Notes for contributors
- Prefer adding TSDoc/module headers to complex files (routes, services, repositories, and the largest React pages) to explain WHY/HOW, not WHAT.
- Keep OpenAPI definitions aligned with actual routes; consolidate to a single source when possible.
- When adding new domains or routes, register them in `server/routes.ts`, add types in `shared/`, and document them in the API section above.
