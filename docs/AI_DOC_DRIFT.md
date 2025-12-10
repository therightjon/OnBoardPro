# AI Documentation Drift Report

## 1) Terminology mismatches
- OpenAPI “Further Documentation” now points to `docs/ARCHITECTURE.md` and `docs/BOUNDED_CONTEXTS.md`; `ARCHITECTURE_REVIEW.md` remains intentionally absent.
- “app/(dashboard)” routes are described variably as “dashboard/protected routes” and remain undocumented in a dedicated FRONTEND guide.

## 2) README vs architecture inconsistencies
- Canonical API spec path documented as `/api/docs.json`; `/api/docs/spec.json` remains for backward compatibility. Keep both docs aligned if behavior changes.
- Seed/init data now noted in `docs/ARCHITECTURE.md` and README; keep them in sync if init process changes.
- ARCHITECTURE and README both note the single OpenAPI source; ensure future edits stay aligned.

## 3) Suspected stale comments/docstrings
- OpenAPI intro may still be drifting from exact middleware rules (rate limits/auth) even though links are fixed.
- Legacy mentions of “digest aggregator” should be removed wherever they linger outside the main ARCHITECTURE diagram.

## 4) High-risk areas likely to drift
- Multiple `/api/docs*.json` endpoints exist; `/api/docs.json` is canonical but spec.json may linger in clients.
- Large route files (`server/routes/candidates.routes.ts`, `tasks.routes.ts`, `templates.routes.ts`) and complex React pages (`client/src/app/(dashboard)/templates/[id]/page.tsx`, `candidates/[id]/page.tsx`) still mix concerns; comments/headers may lag behind changes.
- Service factory + test doubles: constructor changes can silently break tests if not mirrored in docs (`server/services/service-factory.ts`, `server/tests/utils/mockServiceFactory.ts`).
- Background jobs and event/notification flows: behavior not fully documented; changes to deadlines/email cleanup/notification outbox could diverge from descriptions.
- Error-handling expectations in `client/src/lib/queryClient.ts` vs backend responses; drift risks UX regressions if conventions change.

## 5) Recommended small follow-ups (file-level)
- `server/docs/openapi-spec.ts`: keep intro aligned with current auth/rate-limit behavior; links now point to `docs/ARCHITECTURE.md` and `docs/BOUNDED_CONTEXTS.md`.
- `README.md` / `docs/ARCHITECTURE.md`: keep the canonical JSON path (`/api/docs.json`) in sync and note seed/init data where setup is described.
- `docs/DOMAIN_GLOSSARY.md`: link from README/ARCHITECTURE; verify roles/status terms align with enums in `shared/schemas`.
- `client/src/app/(dashboard)/templates/[id]/page.tsx` and `candidates/[id]/page.tsx`: maintain #WHY/#HOW notes around backend side effects and data choreography to limit drift.
- `server/routes/*` (candidates/tasks/templates): concise comments on auth branches and notification/event side effects, referencing the consolidated OpenAPI.
