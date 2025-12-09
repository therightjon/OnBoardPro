# AGENT GUIDE

Use this as a quick-start for future AI-assisted work in this repo.

## Project overview
OnBoardPro is a TypeScript monorepo: Express + Drizzle/PostgreSQL API with session-based auth, and a Vite + React 18 client that shares schema/types via `@shared`. Domain focus is candidate onboarding with templates, tasks, notifications, and role-based access. Background jobs handle deadline scanning, email outbox processing, and notification cleanup.

## Boundaries and ownership
- `server/`: Express entry (`index.ts`), routers (`server/routes*.ts`), middleware, services, repositories, events, jobs, utils, tests.
- `client/`: Vite React SPA (`src/main.tsx`, `src/App.tsx`), routes under `src/app/(dashboard)/**`, feature modules in `src/features/**`, shared UI/hooks in `src/shared/**`.
- `shared/`: Drizzle schema and enums (`shared/schema.ts`, `shared/schemas/*.ts`), shared preference/types.
- `docs/`: Architecture/glossary/audit docs; keep in sync with `docs/AI_DOC_AUDIT.md`.
- Ignore entirely: `.claude`, `.codacy`, `.github`, `.serena`, `.vscode`.

## Setup commands (verified)
- Install: `npm install`
- Dev: `npm run dev` (Express + Vite middleware, uses `.env`, PORT default 5000)
- Build: `npm run build` (client to `dist/public`, server bundle to `dist/index.js`)
- Start (prod): `npm start` (requires prior build)
- Type-check: `npm run check`
- Tests: `npm test` (or `npm run test:backend`, `npm run test:frontend`, `npm run test:coverage`)
- DB tooling: `npm run db:push`, `npm run db:import`, `npm run db:run-sql`
- Auth helper: `npm run user:set-password`

## Documentation standards
- Align with `docs/AI_DOC_AUDIT.md` priorities. Update `README.md`, `docs/ARCHITECTURE.md`, and `docs/DOMAIN_GLOSSARY.md` when interfaces or flows change. Keep Swagger/OpenAPI (`server/docs/openapi-spec.ts`) consistent with routes.
- When adding features, document the API surface, env flags, and background side effects. Prefer single sources of truth for API descriptions.

## Commenting standards (#WHY/#HOW)
- Add comments sparingly to explain WHY/HOW (business rules, auth decisions, side effects), not WHAT. Targets: complex routes (`server/routes/*`), services/repositories with business rules, background jobs, and the largest React pages/hooks. Use TSDoc where appropriate.

## Things to avoid
- Avoid restating code or adding noisy comments. Do not introduce commands/scripts that are not present in `package.json`. Keep docs in sync with actual behavior. Do not edit ignored directories. Avoid duplicating API specs; update the canonical source instead.

## Hard ignore list
- `.claude`
- `.codacy`
- `.github`
- `.serena`
- `.vscode`
