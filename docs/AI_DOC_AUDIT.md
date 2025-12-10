# AI Documentation Audit

## 1) Repo summary (stack, structure, entry points)
- Stack: TypeScript monorepo with Express 4 + passport session auth, Drizzle ORM on PostgreSQL, Vite + React 18 (wouter router, TanStack Query), Tailwind/shadcn-style UI, Vitest/tsx test harnesses. OpenAPI/Swagger served from `/api/docs`.
- Entry points: Backend bootstraps via `server/index.ts` (loads env, DB config, auth middleware, routes, jobs, Vite/ static serving). Frontend mounts at `client/src/main.tsx` with providers in `client/src/App.tsx`; dev server proxied via `server/vite.ts`.
- Structure: `server/` (config, routes, services, repositories, events, jobs, middleware, utils, tests), `client/` (app pages, features, shared UI/hooks, lib utilities, tests), `shared/` (Drizzle schema + enums reused by server/client), `migrations/` (Drizzle outputs), `scripts/` (DB/import/reset helpers), `dist/` (build output), `docker-compose.yml` (local Postgres). No existing root README/docs.
- Build/test: `npm run build` bundles client (Vite) + server (esbuild). `npm run dev` runs server with Vite middleware. Tests split into backend (`tsx --test server/tests/**`) and frontend (`vitest` with happy-dom).
- Data: PostgreSQL schema defined in `shared/schema.ts` & `shared/schemas/*.ts`; Drizzle connection in `server/config/database.config.ts`. Feature flags/env validated in `server/config/env.ts`.

## 2) Architecture map (modules/domains + responsibilities)
- Backend HTTP layer: Express app (`server/index.ts`) wires helmet/compression, request-id logging, error handler, Swagger UI, and mounts modular routers via `server/routes.ts`.
- Auth domain: `server/features/auth/services/auth.service.ts` sets up passport local auth, session store (connect-pg-simple), password hashing (bcrypt/scrypt), multi-provider hooks (Google/Azure/LDAP via provider registry). Authorization helpers in `server/middleware/authorization.ts` and `server/services/authorization/AuthorizationService.ts`.
- Domain routers (all under `/api`): `auth.routes.ts`, `candidates.routes.ts`, `tasks.routes.ts`, `templates.routes.ts`, `notifications.routes.ts`, `users.routes.ts`, `organizations.routes.ts`, `settings.routes.ts`, `reference-data.routes.ts`, `search.routes.ts`, plus `docs.ts` and `health.ts`.
- Service/repository layer: Dependency injection via `server/services/service-factory.ts`. Domain services (`server/services/{candidates,tasks,templates,users,settings,reference,organization,auth,shared}/…`) orchestrate repositories, validation, and events. Repositories under `server/repositories/**` encapsulate Drizzle queries, pagination, and auth-scoped filtering (e.g., `BaseRepository`, `candidates`, `templates`, `users`, `reference`, `organizational`).
- Events + jobs: Event bus (`server/events/*`) with factories/types, middleware logging, notification handlers. Background jobs in `server/jobs/scan-deadlines.ts`, `notification-email.ts`, `notification-cleanup.ts` emit deadlines, outbox processing, cleanup. Notifications helpers in `server/utils/notification.utils.ts` and features/notifications services.
- Shared contracts: `shared/` houses DB schema, enums, insert/select types, and Zod helpers reused on both sides via path alias `@shared`. Preferences and validation logic shared in `shared/preferences.ts`, `shared/schemas/*.ts`.
- Frontend composition: Routing in `client/src/App.tsx` (wouter + ProtectedRoute). Pages live in `client/src/app/(dashboard)/**` for dashboard, candidates, tasks, templates, analytics, settings, notifications; `client/src/app/auth/page.tsx` for login. Feature modules (`client/src/features/**`) wrap domain UI/state, while `client/src/shared/components` contains UI kit/layout (sidebar, theme provider, toaster, tooltip). Data fetching centralized in `client/src/lib/queryClient.ts` and helpers (`query-invalidate.ts`, `task-status.ts`, `search.ts`).
- Observability/config: Request logging inline in `server/index.ts`, auth-deny metrics in `server/observability/authMetrics.ts`. Rate limiting middleware in `server/middleware/rate-limiter.ts`.

## 3) Public API inventory (what should be documented first)
- Auth & identity: `/api/auth/login`, `/api/auth/logout`, `/api/user` profile, invitation acceptance `/api/invitations/accept`, provider configs `/api/auth/providers`, LDAP endpoints, password reset/status flows. High priority because UI boot/auth depends on them.
- Candidates: `/api/candidates` CRUD, status/stage updates, restore, associated tasks `/candidates/:id/tasks`, stages/history, comments, template application, due-date recompute. Largest surface; needs clear auth rules and side effects (events/notifications).
- Tasks: `/api/tasks` list with filters, `/tasks/mine`, `/tasks/dashboard`, CRUD, bulk update, comments. Drives dashboard/my-tasks pages.
- Templates: `/api/templates` CRUD, readiness/status toggles, estimates, stage/task CRUD (`/template-tasks`, `/template-stages`, reorder, create-with-task). Critical for workflow generation.
- Notifications & comments: `/api/notifications` list/update/mark-all-read, comment edit/delete endpoints under the same router. Clarify entity scopes and notification-key usage.
- Users & preferences: `/api/me/preferences` read/update/test-email; `/api/users` CRUD, roles, enable/disable, task-count, manager/assignable lookups.
- Organizations/reference data: `/api/departments`, `/api/divisions`, `/api/task-definitions`, `/api/hiring-stages`, `/api/task-categories`, `/api/task-priorities`, `/api/candidate-types`, `/api/faculty-ranks`.
- Settings/search/docs: `/api/system-settings`, `/api/settings/email` + test, dashboard metrics `/api/dashboard/*`, search endpoints `/api/search/*`, Swagger at `/api/docs` and `/api/docs/spec.json`.

## 4) Complexity hotspots (files/functions likely needing docs/comments)
- `server/routes/candidates.routes.ts` (~967 lines): dense auth checks, filtering, pagination, notifications, comment handling, template application.
- `server/routes/tasks.routes.ts` and `server/routes/templates.routes.ts` (~600–580 lines): multiple code paths, bulk updates, nested resource handling.
- `server/repositories/candidates/CandidateRepository.ts` (~616 lines) and `server/tests/utils/mockServiceFactory.ts` (~895 lines): intricate query construction, cursor handling, extensive test doubles.
- `server/features/auth/services/auth.service.ts`: multi-provider setup, session configuration, password migration (bcrypt/scrypt) logic.
- `server/services/candidates/candidate.service.ts` and `server/utils/notification.utils.ts`: business rules, event publishing, notification composition.
- `server/docs/openapi-spec.ts` (3k lines) and `server/config/swagger.config.ts`: duplicated/hand-written API docs prone to drift.
- Frontend large pages: `client/src/app/(dashboard)/templates/[id]/page.tsx` (~2k lines), `client/src/app/(dashboard)/candidates/[id]/page.tsx` (~1.7k), dashboard page (~1k), `features/settings/components/UsersSection.tsx`, `features/candidates/components/new-candidate-dialog.tsx`, `app/(dashboard)/tasks/*` pages, `shared/components/ui/sidebar.tsx`. Many contain business logic + UI state without separation.
- Cross-cutting utilities: `client/src/lib/queryClient.ts` (error parsing), `client/src/lib/task-status.ts` (status resolution), `server/utils/business-day.utils.ts` and deadline scanners.

## 5) Documentation gaps (README, architecture docs, module headers, docstrings)
- No root README or quickstart; environment variables and workflows only implied by scripts/env schema.
- Architecture docs referenced in Swagger (`ARCHITECTURE_REVIEW.md`, `BOUNDED_CONTEXTS.md`, `server/services/README.md`) do not exist.
- API docs split between `server/docs/openapi-spec.ts` and `server/config/swagger.config.ts` with potential divergence; not obviously generated from source or tests.
- No frontend architecture/readme to explain routing conventions (`(dashboard)` segments, lazy loading) or shared UI patterns.
- Minimal inline docstrings in service/repo layers and complex React pages; background jobs and event handlers lack high-level descriptions.
- No glossary of domain terms (roles, candidate statuses/stages, template terminology, notification keys).
- No guidance on testing strategy (backend vs frontend) or how to seed DB (`initdb/phase5_sample_data.sql`, `scripts/resetDomainData.ts`).

## 6) Commenting recommendations (where #WHY/#HOW would be helpful)
- `server/routes/candidates.routes.ts`: document authorization branches, notification emission, and filtering/pagination rules to avoid regressions when adjusting scopes.
- `server/features/auth/services/auth.service.ts`: explain password format migration flow (bcrypt vs scrypt), provider validation, and session cookie settings for security reviews.
- `server/services/template-*` and `template-expansion`/`template-estimation`: clarify business rules for readiness/estimation and stage/task creation side effects.
- `server/jobs/*`: note schedules/triggers, retry/backoff behavior, and relationships to notification outbox.
- `client/src/app/(dashboard)/templates/[id]/page.tsx` and `candidates/[id]/page.tsx`: annotate data-loading choreography, optimistic updates, and derived-state helpers (notes parsing, status pills) to guide future splits into hooks.
- `client/src/lib/queryClient.ts`: clarify error parsing expectations and URL assembly rules to prevent accidental changes that break caching.
- `server/utils/business-day.utils.ts` and deadline scanners: document assumptions about working days/holidays/time zones.

## 7) Proposed phased implementation plan (Phases 2–6 with file-level targets)
- Phase 2 – Baseline repo docs: Add `README.md` (setup, scripts, env table, run/test/build), `docs/ARCHITECTURE.md` stub linking backend/frontend sections, and `docs/DOMAIN_GLOSSARY.md` covering roles/statuses/stages/template terms. Note DB setup using `docker-compose.yml`, `drizzle.config.ts`, and `initdb/phase5_sample_data.sql`.
- Phase 3 – API documentation alignment: Consolidate Swagger/OpenAPI into a single source (prefer `server/docs/openapi-spec.ts`), remove duplication in `server/config/swagger.config.ts`, and document auth/session/roles plus key endpoints from section 3. Add lightweight `docs/API_CHANGELOG.md` to track route changes.
- Phase 4 – Backend architecture deep dive: Document service/repo patterns in `docs/ARCHITECTURE.md` (service-factory, repositories, events, jobs, middleware chain). Add module headers to `server/routes/*`, `server/services/*`, `server/repositories/*`, and `server/jobs/*` summarizing responsibilities and cross-module dependencies.
- Phase 5 – Frontend structure and usage: Create `docs/FRONTEND.md` outlining routing (`App.tsx`, ProtectedRoute), data fetching conventions (TanStack Query + `queryClient`), shared UI components, and feature module boundaries. Add inline TSDoc on key hooks (`client/src/features/auth/hooks/use-auth.ts`, `client/src/lib/*`) and headers atop large pages to explain layout/data flow.
- Phase 6 – Hotspot refactors with inline guidance: Add focused `README.md` files or comment blocks near hotspots (`client/src/app/(dashboard)/templates/[id]/page.tsx`, `candidates.routes.ts`, `tasks.routes.ts`, `CandidateRepository.ts`) describing state machines/side effects. Document background-job operations and notification/event flows in `docs/ARCHITECTURE.md` appendices. Ensure tests reference docs where assumptions are codified.

## 8) Templates
- README skeleton:
````markdown
# OnBoardPro
- **Stack:** Express + Drizzle (PostgreSQL), React 18 + Vite, TypeScript
- **Quick start:** `npm install`, `docker-compose up db`, `npm run dev`
- **Env vars:** NODE_ENV, PORT, DATABASE_URL, SESSION_SECRET, SMTP_*, OAuth/LDAP flags…
- **Scripts:** dev, build, start, test (backend/frontend), db:push/import/run-sql
- **Architecture:** server (routes/services/repositories/events/jobs), client (app/pages/features/shared), shared (schemas)
- **Testing:** backend via `npm run test:backend`, frontend via `npm run test:frontend`
- **Links:** /api/docs, docs/ARCHITECTURE.md, docs/DOMAIN_GLOSSARY.md
`````

- ARCHITECTURE.md outline:
````markdown
# Architecture
## Runtime overview
- Request flow: Express middleware → routers → services → repositories → DB/events → response
- Dev/build flow: Vite middleware in dev; esbuild bundle for server + Vite build for client
## Backend
- Config/env, DB connection, service factory
- Auth (passport/session/providers), authorization model (roles/scopes)
- Domain modules: candidates, tasks, templates, notifications, users, orgs, reference-data, settings, search
- Events/jobs: event bus, notification handlers, deadline/email/cleanup jobs
## Frontend
- Routing (`App.tsx`, ProtectedRoute, lazy pages), data fetching (TanStack Query conventions), state management
- UI system (shared components, theme, sidebar layout), feature modules
## Shared contracts
- Drizzle schema, enums, shared types; migration strategy
## Operations
- Local dev (docker-compose), testing strategy, build/deploy expectations
`````

- DOMAIN_GLOSSARY.md outline (if needed):
````markdown
# Domain Glossary
- Roles: system_admin, hr_staff, department_admin, division_leader, manager, candidate (permissions summary)
- Candidate lifecycle: statuses, stages, followers, linked user, primary owner
- Templates: template, stage, task definition, readiness, estimation
- Tasks: assignment, due rules, priorities, comments/mentions
- Notifications: notification keys/entities, outbox, channels
`````

- Module/file header pattern:
````markdown
/*
 * <Module name> — purpose and scope.
 * Dependencies: <key services/repos/utils>.
 * Side effects: <events emitted, jobs scheduled, notifications>.
 * Notes: <auth/validation assumptions or data shape expectations>.
 */
`````

- TSDoc/JSDoc examples:
````ts
/**
 * Fetch candidate list with optional role-scoped filters.
 * @param filters Department/division/manager filters already validated.
 * @returns Candidates visible to the current authorization context.
 */
async function listCandidates(filters: CandidateFilters, auth: AuthorizationContext) { … }

/**
 * React hook: returns cached dashboard metrics and loading state.
 * Uses TanStack Query keyed by `/api/dashboard/metrics`.
 */
export function useDashboardMetrics() { … }
`````

## 9) Risk notes (areas likely to drift or become stale)
- Dual OpenAPI sources (`server/docs/openapi-spec.ts` vs `server/config/swagger.config.ts`) can diverge from actual routes/tests; needs single source of truth.
- Large route files and pages mix business logic with rendering; without docs they are hard to split/refactor and easy to regress (especially candidate/task/template flows).
- Service factory and test mocks must stay aligned with repository/service constructor signatures; undocumented changes break tests.
- Event/notification flows and background jobs lack diagrams; side effects may be forgotten when modifying candidate/task lifecycles.
- Error-handling conventions in `queryClient` and authorization/rate-limiting rules could drift from UI expectations if undocumented.
- Missing root docs increase onboarding risk and environment misconfiguration (DATABASE_URL/SESSION_SECRET/feature flags).
