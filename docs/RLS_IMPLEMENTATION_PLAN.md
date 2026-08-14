# PostgreSQL RLS Implementation Plan

Last Updated: 2026-03-19

## Summary

OnBoardPro does not currently use PostgreSQL row-level security. Access control is enforced in the Express, service, and repository layers using:

- `hydrateAuthUser()` session hydration in `server/features/auth/services/auth.service.ts`
- `AuthorizationService.buildContext()` in `server/services/authorization/AuthorizationService.ts`
- route guards in `server/routes/*.ts`
- repository-level scope filters in `server/repositories/base/BaseRepository.ts`, `server/repositories/candidates/CandidateRepository.ts`, `server/repositories/candidates/CandidateTaskRepository.ts`, and `server/services/dashboard/dashboard.service.ts`
- response sanitizers in `server/utils/sanitization.utils.ts`

The right fit for this codebase is not a full replacement of the current authorization model. The right fit is a staged hybrid model:

1. Use PostgreSQL RLS to enforce row visibility and baseline write scope for candidate-scoped data.
2. Keep the existing route, service, policy, validation, and sanitization layers for action-level rules, field-level redaction, and business workflows.
3. Reuse the current role and scope model instead of inventing new authorization concepts.

## Project Review

### 1. Runtime and Auth Model Today

- The app uses one shared `pg.Pool` and one shared Drizzle database object from `server/config/database.config.ts`.
- Repositories are constructed once in `server/services/service-factory.ts` and receive the shared `db` and `pool`.
- User session state is hydrated on login and deserialization by `hydrateAuthUser()` in `server/features/auth/services/auth.service.ts`.
- The hydrated session already contains the exact scope information that an RLS rollout should reuse:
  - `roles`
  - `departmentScopes`
  - `divisionScopes`
  - `managedCandidateIds`
- `AuthorizationService.buildContext()` converts the session user into the `AuthorizationContext` used everywhere else.

This is important because it means the repo already has a stable authorization vocabulary. RLS should consume that vocabulary. It should not introduce a second, different model.

### 2. How Authorization Is Enforced Today

Candidate and task access is enforced manually in several layers:

- Candidate list visibility is filtered in `server/repositories/candidates/CandidateRepository.ts`.
- Candidate detail visibility is checked after loading the row in `server/repositories/candidates/CandidateRepository.ts`.
- Task visibility is filtered in `server/repositories/candidates/CandidateTaskRepository.ts`.
- Dashboard metrics reimplement scope filters in `server/services/dashboard/dashboard.service.ts`.
- Route handlers also apply role and scope guards in `server/routes/candidates.routes.ts`, `server/routes/tasks.routes.ts`, `server/routes/users.routes.ts`, and `server/routes/search.routes.ts`.
- Candidate self-access still requires field-level redaction via `sanitizeCandidateForCandidateUser()` and `sanitizeTaskForCandidateUser()` in `server/utils/sanitization.utils.ts`.

This has two consequences:

1. RLS will reduce the risk of missing a repository filter or loading a row before checking scope.
2. RLS will not replace the existing route and service rules, because many of those rules are not just row visibility rules.

### 3. Current Scope Tables and Reusable Data Structures

The existing schema already contains the core inputs needed for RLS:

- `user_roles`
- `user_department_scopes`
- `user_division_scopes`
- `manager_candidate_scopes`
- `candidates.manager_id`
- `candidates.linked_user_id`
- `candidate_tasks.assignee_user_id`

These are defined in:

- `shared/schemas/auth.schema.ts`
- `shared/schemas/candidate.schema.ts`
- `shared/schemas/task.schema.ts`

This is the strongest argument for reusing the current model rather than redesigning authorization from scratch.

### 4. System and Background Paths That Must Keep Working

Several internal flows query protected tables without a request user:

- deadline scanning in `server/jobs/scan-deadlines.ts`
- deadline notification queries in `server/features/notifications/deadline-helpers.ts`
- template expansion in `server/services/templates/template-expansion.service.ts`
- event handlers in `server/events/handlers/notification-handler.ts`
- audit logging in `server/services/shared/audit-logger.ts` and `server/services/audit/audit.service.ts`

These flows make a pure "every query must be user-scoped" rollout unsafe. The implementation needs an explicit internal/system execution path.

### 5. Surfaces That Are Easy vs. Hard for RLS

Good first-phase RLS candidates:

- `candidates`
- `candidate_tasks`
- `candidate_stage_history`
- `candidate_template_stages`
- `candidate_followers`
- `notifications`
- `notification_keys`
- `user_preferences`

Harder, later-phase candidates:

- `comments`
  - polymorphic `entity_type` plus `entity_id`
  - candidate/task inherited visibility
  - additional `internal` vs `external` visibility rules
- search and analytics queries that currently use custom SQL and route-level scoping

Tables that should remain app-layer/admin-controlled for now:

- `users`
- `user_roles`
- `user_department_scopes`
- `user_division_scopes`
- `manager_candidate_scopes`
- `departments`
- `divisions`
- `candidate_types`
- `faculty_ranks`
- `hiring_stages`
- `templates`
- `template_stages`
- `template_tasks`
- `task_categories`
- `task_priorities`
- `task_definitions`
- `auth_providers`
- `invitations`
- `system_settings`
- `smtp_settings`
- `email_templates`
- `email_global_settings`
- `notification_outbox`
- `rate_limit_counters`
- `audit_log`

## Recommended Target Architecture

### Keep the Existing App Authorization Model

Retain all of the following:

- `AuthorizationService`
- `CandidatePolicy`
- `TaskPolicy`
- route-level `requireAuth()` and `requireRole()`
- current Zod validation and business-rule checks
- current candidate/task sanitizers

RLS should become the base row-enforcement layer underneath those patterns. It should not replace them.

### Add a Thin DB Context Layer

Add a small, focused database helper instead of replacing the repository/service structure. The helper should:

- pin a single DB connection for a query block
- set local PostgreSQL settings for the current request
- run the protected query block on that same connection

Recommended new helper:

- `server/db/rls-context.ts`

Recommended helper shape:

- `withAuthorizationContext(authContext, callback)`
- `withSystemContext(callback)`

The helper should set request-scoped PostgreSQL settings such as:

- `app.user_id`
- `app.roles`
- `app.department_ids`
- `app.division_ids`
- `app.managed_candidate_ids`
- `app.is_privileged`
- `app.is_candidate`
- `app.is_system`

Use JSON strings for array settings. That matches the current TypeScript session shape and avoids inventing a new serialization format.

### Reuse Existing `AuthorizationContext`

Do not create a new auth payload type for the database layer. Use the current `AuthorizationContext` from `server/repositories/base/types.ts` as the source of truth for:

- DB session settings
- repository helper signatures
- tests

### Preferred Database Identity Model

There are two viable implementation paths.

Preferred path:

- Introduce a dedicated runtime DB role for application traffic.
- Keep a separate migration/admin role for migrations and privileged maintenance.
- Run protected application queries as the non-owner runtime role.

Fallback path:

- Keep the current single runtime credential.
- Use `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on protected tables.
- Provide a controlled `app.is_system = true` bypass for internal flows.

Recommendation:

- Prefer the split-role model if deployment can support a second DB credential.
- Use the single-role fallback only if operational simplicity is more important than the stronger security boundary.

Reason:

- Without a non-owner runtime role, RLS is still valuable, but the security story is less clean and operational mistakes are easier to make.

## Implementation Plan

### Phase 0: Foundations and Decisions

Goal:

- prepare the codebase for RLS without changing every repository at once

Changes:

1. Decide between:
   - preferred split-role model
   - single-role plus `FORCE RLS` fallback
2. Add env/config support if the preferred model is chosen:
   - keep `DATABASE_URL` for runtime
   - add a second credential for admin or migration use, such as `DATABASE_ADMIN_URL`
3. Add `server/db/rls-context.ts`.
4. Add a small SQL helper migration, likely starting at `0028_*`, to create:
   - helper functions for reading request settings
   - helper functions for parsing JSON arrays into `uuid[]` and `text[]`
   - helper functions for candidate visibility and task visibility
5. Update `docs/MIGRATIONS.md` with the RLS migration workflow and operational notes.
6. Update `.env.example` if new DB credentials or feature flags are introduced.

Likely files:

- `server/config/database.config.ts`
- `server/db/connection.ts`
- `server/db/rls-context.ts`
- `.env.example`
- `docs/MIGRATIONS.md`
- `migrations/0028_rls_base.sql` or equivalent

Acceptance criteria:

- request-scoped DB context can be set on a single pinned connection
- system/internal work has an explicit bypass path
- migration workflow documents how RLS-enabled environments are provisioned

### Phase 1: Candidate and Task Core RLS

Goal:

- move the main candidate and task visibility rules into PostgreSQL while preserving current route/service behavior

Tables:

- `candidates`
- `candidate_tasks`
- `candidate_stage_history`
- `candidate_template_stages`
- `candidate_followers`

Recommended SQL helpers:

- `app.current_user_id()`
- `app.current_roles()`
- `app.current_department_ids()`
- `app.current_division_ids()`
- `app.current_managed_candidate_ids()`
- `app.is_privileged()`
- `app.is_candidate()`
- `app.is_system()`
- `app.can_view_candidate(candidate_id, department_id, division_id, manager_id, linked_user_id)`
- `app.can_update_candidate(candidate_id, department_id, division_id, manager_id, linked_user_id)`
- `app.can_view_task(candidate_id, assignee_user_id)`
- `app.can_update_task(candidate_id, assignee_user_id)`

Recommended policies:

1. `candidates`
   - `SELECT`:
     - privileged users can see all rows
     - department admins can see matching departments
     - division leaders can see matching divisions
     - managers can see rows they manage or rows in `manager_candidate_scopes`
     - candidates can see rows where `linked_user_id = app.user_id`
     - system context can bypass
   - `INSERT`:
     - match current route behavior, not generic policy behavior
     - allow privileged users
     - allow scoped candidate creation only if the requested department or division is in scope
   - `UPDATE`:
     - allow privileged users
     - allow scoped admins and leaders
     - do not allow candidate self-update
   - `DELETE`:
     - likely keep denied and continue soft-delete/archive semantics in app code

2. `candidate_tasks`
   - `SELECT`:
     - visible if parent candidate is visible
     - assignee can also view their own task
   - `INSERT`:
     - match current route behavior for who can create tasks
   - `UPDATE`:
     - allow candidate/task admins based on candidate scope
     - allow assignee self-update for allowed task fields
     - keep field-level restrictions in app code
   - `DELETE`:
     - keep current privileged/archive behavior

3. child candidate tables
   - `candidate_stage_history`, `candidate_template_stages`, `candidate_followers`
   - policies should inherit candidate visibility via `candidate_id`

App changes:

1. Add a small protected-query helper to `BaseRepository` or a nearby shared DB helper.
2. Update protected repository methods to execute inside `withAuthorizationContext(...)` instead of the plain shared `db` when an auth context is supplied.
3. Keep unprotected methods and internal/system methods on the current system path.
4. Update `CandidateRepository`, `CandidateTaskRepository`, and `DashboardService` first.
5. Update `fetchTaskWithAccess()` and `fetchCandidateWithAccess()` in `server/utils/authorization.utils.ts` so protected reads use the auth-aware DB path.

Important non-goal:

- Do not remove route-level validation, workflow rules, or field sanitization in this phase.

Acceptance criteria:

- protected candidate and task reads still return the same user-visible data
- a missing repository filter no longer leaks out-of-scope rows
- background jobs still work through the explicit system path

### Phase 2: User-Owned Tables

Goal:

- move obvious self-owned tables to simple owner-based RLS

Tables:

- `notifications`
- `notification_keys`
- `user_preferences`

Why these are good next:

- ownership is already explicit via `user_id`
- current routes already pass `req.user.id`
- policies are simple and low risk

Recommended policies:

- user can `SELECT`, `UPDATE`, and in limited cases `DELETE` only their own rows
- system context can bypass for notification producers and cleanup jobs

Likely files:

- `shared/schemas/notifications.schema.ts`
- `server/repositories/NotificationRepository.ts`
- `server/services/shared/notification.service.ts`
- `server/routes/notifications.routes.ts`
- user preferences repositories and routes
- new migration such as `0029_rls_user_owned.sql`

Acceptance criteria:

- notifications remain user-specific without relying solely on repository predicates
- mark-read and mark-all-read continue to work unchanged from the UI perspective

### Phase 3: Comments and Complex Derived Access

Goal:

- decide whether comments should move under RLS or remain app-layer for longer

Why comments are harder:

- `comments` is polymorphic (`entity_type`, `entity_id`)
- visibility is not only candidate scope, but also `internal` vs `external`
- candidate users may see only a subset of comment rows

Recommendation:

- keep comment write rules and visibility composition in the service and route layers initially
- only move comment row visibility into RLS after the candidate/task core has been stable in production

If implemented later, comment RLS should:

- map candidate comments through candidate visibility
- map task comments through task visibility
- preserve the existing `internal` vs `external` rule set

Likely files:

- `shared/schemas/comments.schema.ts`
- `server/repositories/CommentRepository.ts`
- `server/services/shared/comment.service.ts`
- comment routes under `server/routes/candidates.routes.ts`, `server/routes/tasks.routes.ts`, and `server/routes/notifications.routes.ts`

### Phase 4: Cleanup, Performance Tuning, and Partial De-Duplication

Goal:

- simplify only the filters that become true duplicates after RLS is proven stable

Do:

- remove obviously redundant repository predicates where the database now guarantees the same rule
- keep explicit route checks for:
  - business actions
  - field-level rules
  - archive/delete semantics
  - candidate self-sanitization
  - admin-only surfaces

Do not:

- remove `AuthorizationService`
- remove `CandidatePolicy` or `TaskPolicy`
- remove response sanitization for candidate users
- remove business-specific write checks from routes and services

## Overview of Required Changes

### Database and Migrations

Expected additions:

- helper SQL functions for request context parsing
- helper SQL functions for candidate and task access decisions
- `ENABLE ROW LEVEL SECURITY` and likely `FORCE ROW LEVEL SECURITY` on protected tables
- policies on candidate-scoped and user-owned tables
- supporting indexes for policy predicates

Expected index work:

- verify or add indexes on:
  - `candidates.department_id`
  - `candidates.division_id`
  - `candidates.manager_id`
  - `candidates.linked_user_id`
  - `candidate_tasks.candidate_id`
  - `candidate_tasks.assignee_user_id`
  - `candidate_tasks.archived`
  - `candidate_tasks.status`
- keep existing scope-table indexes because they already align well with RLS predicate lookups

### Server Runtime

Expected additions:

- a request-scoped DB context runner
- an explicit system DB context runner
- optional admin-vs-runtime credential support

Expected modifications:

- protected repository methods accept or reuse `AuthorizationContext`
- candidate/task/dashboard paths run through the auth-aware helper
- background jobs and event handlers run through the system helper

### Repositories and Services

Phase 1 files most likely to change:

- `server/repositories/base/BaseRepository.ts`
- `server/repositories/candidates/CandidateRepository.ts`
- `server/repositories/candidates/CandidateTaskRepository.ts`
- `server/repositories/candidates/CandidateFollowerRepository.ts`
- `server/services/dashboard/dashboard.service.ts`
- `server/utils/authorization.utils.ts`
- `server/services/candidates/candidate.service.ts`
- `server/services/tasks/task.service.ts`

Phase 2 and 3 files likely to change:

- `server/repositories/NotificationRepository.ts`
- `server/repositories/CommentRepository.ts`
- `server/services/shared/notification.service.ts`
- `server/services/shared/comment.service.ts`
- search-related repositories and routes

### Routes

Routes should keep their current responsibilities:

- role gating
- input validation
- business rule enforcement
- response shaping and sanitization

This means RLS is an addition, not a replacement, for route code in:

- `server/routes/candidates.routes.ts`
- `server/routes/tasks.routes.ts`
- `server/routes/notifications.routes.ts`
- `server/routes/users.routes.ts`
- `server/routes/search.routes.ts`

### Tests and Tooling

Important observation:

- many current route tests use mock service factories and do not exercise the real database

Result:

- existing tests are still useful for route and service behavior
- they are not enough to prove RLS correctness

Required test additions:

1. DB-backed integration tests for policy behavior
2. DB-backed integration tests for request-context helpers
3. DB-backed integration tests for system bypass paths
4. regression tests for candidate self-sanitization after RLS is enabled
5. query-plan checks for the heaviest candidate/task/dashboard queries

Recommended new test files:

- `server/tests/db/rls-candidates.integration.test.ts`
- `server/tests/db/rls-tasks.integration.test.ts`
- `server/tests/db/rls-system-bypass.integration.test.ts`

## Tradeoffs

### 1. Split Runtime Role vs Single Runtime Role

Preferred:

- split runtime and migration roles

Benefits:

- cleaner security boundary
- easier to reason about what can bypass RLS
- stronger production posture

Costs:

- extra credential management
- more operational setup work

Fallback:

- single runtime role plus `FORCE RLS`

Benefits:

- fewer deployment changes
- easier initial rollout

Costs:

- weaker separation of duties
- easier to misconfigure
- more care required around internal bypass rules

### 2. Hybrid Enforcement vs Full Authorization Rewrite

Recommendation:

- hybrid enforcement

Benefits:

- reuses existing components, hooks, utilities, and patterns
- lower migration risk
- preserves current business-rule behavior

Costs:

- some authorization logic will continue to exist in both SQL and TypeScript
- there is less conceptual purity than a full rewrite

### 3. Session-GUC Context vs Per-User DB Roles

Recommendation:

- session settings backed by the current `AuthorizationContext`

Benefits:

- fits the current session-based app design
- does not require mapping every web user to a database role
- easy to derive from `hydrateAuthUser()`

Costs:

- protected queries must run on a pinned connection
- debugging requires inspecting both SQL policies and request context

### 4. RLS vs Field-Level Sanitization

RLS solves:

- which rows are visible
- which rows are writable

RLS does not solve:

- which columns candidate users should see in API responses
- which derived fields should be hidden or reshaped

Therefore the current sanitizers in `server/utils/sanitization.utils.ts` should remain.

### 5. Comments and Derived Visibility

Comments are the clearest example of why a staged rollout is better:

- they depend on candidate/task access
- they also depend on comment visibility rules
- they are not a simple owner-scoped table

This is a good area to leave app-layer first and only move later if the benefit is worth the complexity.

### 6. Performance and Query Planning

RLS will add predicate work to many candidate and task queries.

Mitigations:

- add the right indexes before enabling policies broadly
- benchmark dashboard and task-list queries
- inspect execution plans before and after rollout
- remove only the most obviously redundant app-side filters after confidence is high

## Recommended Rollout Order

1. Decide on split-role vs single-role deployment.
2. Build the DB context helper and SQL helper functions.
3. Enable RLS for candidate and task core tables in a feature branch.
4. Update candidate/task/dashboard repositories to use the auth-aware DB path.
5. Add DB-backed integration tests.
6. Roll out notifications and preferences next.
7. Reassess comments after the first rollout is stable.
8. Only then remove clearly redundant repository predicates.

## Open Decisions

These should be resolved before implementation starts:

1. Should production adopt a dedicated runtime DB role, or should the rollout use the simpler single-role plus `FORCE RLS` model?
2. Should notifications and user preferences ship with phase 1 or phase 2?
3. Should comments remain app-layer indefinitely, or should they be scheduled as a later RLS phase?

## Bottom Line

RLS is a good fit for OnBoardPro if it is introduced as a focused, staged hardening layer around the existing candidate and task scope model.

The safest plan is:

- keep the current app authorization model
- add a thin DB request-context layer
- implement RLS first on candidate and task core tables
- preserve explicit system bypass paths for internal jobs
- keep sanitization and business-rule checks in application code

That approach gives the project meaningful defense-in-depth without forcing a repo-wide rewrite or breaking the system patterns that are already working.
