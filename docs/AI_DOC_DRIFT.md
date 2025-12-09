# AI Documentation Drift Report

## 1) Terminology mismatches
- API docs split: Swagger references “Bounded Contexts” and “Architecture Review” files that don’t exist; glossary is now `docs/DOMAIN_GLOSSARY.md`. Risk of readers following stale links.
- “Digest aggregator” mentioned in older diagrams/comments (e.g., prior ARCHITECTURE drafts) doesn’t appear in current jobs list.
- “app/(dashboard)” routes are sometimes described as “dashboard” or “protected routes” inconsistently; not yet documented in a dedicated FRONTEND guide.

## 2) README vs architecture inconsistencies
- README and ARCHITECTURE both cite `/api/docs/spec.json`, while the code serves `/api/docs.json` and `/api/docs/spec.json` via different routers (`server/routes/docs.ts` vs `server/index.ts`). Needs a single canonical path in docs and code.
- README highlights `docker-compose up db` with `initdb/phase5_sample_data.sql`, but ARCHITECTURE doesn’t mention seeds/initial data.
- ARCHITECTURE notes API docs split between `server/docs/openapi-spec.ts` and `server/config/swagger.config.ts`; README implies Swagger lives at `/api/docs` but doesn’t warn about dual sources.

## 3) Suspected stale comments/docstrings
- Swagger/OpenAPI descriptions in `server/config/swagger.config.ts` reference non-existent docs (`ARCHITECTURE_REVIEW.md`, `BOUNDED_CONTEXTS.md`) and may not reflect current routes/tests.
- OpenAPI summary text in `server/docs/openapi-spec.ts` references “Bounded Contexts” doc that doesn’t exist; also may be drifting from actual router behavior (e.g., rate limits, auth flows).
- Legacy mentions of “digest aggregator” (jobs) are absent from current job files—likely leftover narrative.

## 4) High-risk areas likely to drift
- Dual OpenAPI sources (`server/docs/openapi-spec.ts` vs `server/config/swagger.config.ts`) and multiple `/api/docs*.json` endpoints; easy to get out of sync with routes/tests.
- Large route files (`server/routes/candidates.routes.ts`, `tasks.routes.ts`, `templates.routes.ts`) and complex React pages (`client/src/app/(dashboard)/templates/[id]/page.tsx`, `candidates/[id]/page.tsx`) that mix concerns; comments and headers may lag behind changes.
- Service factory + test doubles: constructor signature changes can silently break tests if not mirrored in docs (`server/services/service-factory.ts`, `server/tests/utils/mockServiceFactory.ts`).
- Background jobs and event/notification flows: behavior not fully documented; changes to deadlines/email cleanup/notification outbox could diverge from descriptions.
- Error-handling expectations in `client/src/lib/queryClient.ts` vs backend responses; drift risks UX regressions if conventions change.

## 5) Recommended small follow-ups (file-level)
- `server/config/swagger.config.ts` & `server/docs/openapi-spec.ts`: add a short header noting which is canonical and remove/replace references to missing docs; align served endpoints (`/api/docs.json` vs `/api/docs/spec.json`).
- `README.md` and `docs/ARCHITECTURE.md`: explicitly state the canonical Swagger JSON endpoint and note dual sources until consolidated; mention seed data path if relevant.
- `docs/DOMAIN_GLOSSARY.md`: link from README/ARCHITECTURE to avoid terminology drift; ensure roles/statuses match enums in `shared/schemas`.
- `client/src/app/(dashboard)/templates/[id]/page.tsx` and `candidates/[id]/page.tsx`: add brief inline #WHY/#HOW notes where business rules or backend side effects are assumed (e.g., cascade deletes, duplicate guard) to reduce future drift.
- `server/routes/*` (candidates/tasks/templates): add concise comments where authorization branches and notification/event side effects are non-obvious, referencing the canonical OpenAPI once consolidated.
