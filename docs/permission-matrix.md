# Permission Matrix

This document enumerates authorization behaviour for high-sensitivity API surfaces.
See also `docs/authorization-runbook.md` for operational guidance and monitoring hooks.
Each entry maps an endpoint to its expected access controls, data exposure, and
the automated regression coverage that validates the rule. Update this matrix on any
route, scope, or role change and ensure the referenced tests reflect the new behaviour.

## Candidate APIs

| Endpoint | Allowed Roles & Scope Conditions | Data Surface | Automated Coverage |
| --- | --- | --- | --- |
| `GET /api/candidates` | `system_admin`, `hr_staff` (all records); `department_admin` limited to departments in `user_department_scopes`; `division_leader` limited to divisions in `user_division_scopes`; `manager` limited to direct reports plus `manager_candidate_scopes`; `candidate` limited to linked candidate record | Full candidate projection for privileged roles; candidates receive sanitized record with minimized fields | `server/tests/auth/candidateRoutesAuthorization.test.ts` — `hr staff can list all candidates`, `department admin limited to their department`, `division leader limited to their division`, `manager sees direct reports and scoped candidates`, `candidate sees only their record with sanitized fields` |
| `GET /api/candidates/:id` | Same role and scope rules as index route; responds with 404 when caller lacks scope | Full candidate record for privileged roles; candidates receive sanitized view | `server/tests/auth/candidateRoutesAuthorization.test.ts` — `manager can view candidate detail in scope`, `manager cannot view candidate outside scope` |
| `GET /api/candidates/:id/tasks` | Requires authentication with candidate visibility; non-privileged users get sanitized task payload | Task payload (sanitized for candidates/managers) | `server/tests/auth/candidateRoutesAuthorization.test.ts` — `candidate task detail is sanitized` |
| `GET /api/tasks/mine` | Any authenticated user; result filtered by `buildAuthorizationContext` scope checks | Task list for caller with candidate/task level minimization for non-privileged users | `server/tests/auth/candidateRoutesAuthorization.test.ts` — `manager task feed respects scopes` |

## Updating the Matrix

1. Add a new row (or update an existing one) when you modify authorization logic.
2. Reference the corresponding automated test(s) that enforce the rule.
3. Run `npm run test:auth` to confirm regression coverage before merging.
4. Copy the matrix entry into the relevant PR description for reviewer visibility.

## Pending Coverage

- Template, settings/auth provider, and rate-limited administrative endpoints require
  similar matrix entries once their dedicated tests land.
