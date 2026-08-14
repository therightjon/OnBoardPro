# Authorization and Visibility Fix Plan

Last Updated: 2026-03-20

## Summary

This plan fixes the current authorization and visibility issues in OnBoardPro without changing the overall architecture and without pursuing PostgreSQL RLS.

The focus is on four concrete problem areas:

- task update responses that can leak unsanitized candidate data
- comment and mention notifications that do not re-check recipient access
- candidate-facing aggregates that do not match task visibility rules
- helper and repository paths that still fetch data before access is fully proven

The goal is to tighten the current application-layer model, not replace it.

## Goals

- Fix the confirmed current leak in `PATCH /api/tasks/:id`.
- Scope comment and mention notifications to users who can actually see the source entity.
- Make candidate task visibility consistent across detail routes, list routes, estimates, metrics, and comment stats.
- Reuse the existing architecture:
  - `AuthorizationService`
  - `CandidatePolicy`
  - `TaskPolicy`
  - route helpers in `server/utils/authorization.utils.ts`
  - sanitizers in `server/utils/sanitization.utils.ts`
  - current repository/service boundaries
- Preserve current response shapes and hidden-resource behavior unless an explicit product decision says otherwise.

## Non-Goals

- No PostgreSQL RLS rollout.
- No replacement of the current service/repository architecture.
- No new frontend patterns, forms, hooks, or UI abstractions.
- No deliberate widening of route permissions as part of this fix set.

## Guardrails

1. Reuse existing helpers, policies, services, and repository patterns before introducing anything new.
2. Prefer extending existing helpers over creating parallel authorization code paths.
3. Keep hidden resources returning `404`, not `403`, unless there is an explicit decision to change that behavior.
4. Keep service-level auth optional for internal/background callers until those flows are deliberately migrated.
5. If a fix changes product-visible behavior, resolve the open question first instead of silently shipping the change.

## Current Intent To Preserve

### Task Route Intent

`PATCH /api/tasks/:id` in [server/routes/tasks.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/tasks.routes.ts) is trying to:

- authorize access
- allow admins or the assignee to update the task
- recompute candidate blocked state and stage advancement
- return a backward-compatible payload that includes both flat task fields and `{ task, candidate?, advancement, recompute }`

The fix should preserve that response contract unless a deliberate breaking change is approved.

### Notification Intent

Comment routes in:

- [server/routes/tasks.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/tasks.routes.ts)
- [server/routes/candidates.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/candidates.routes.ts)

currently authorize comment creation against the target entity, create the comment, then publish a lean `comment.created` event. Fanout is intentionally delegated to the notification layer.

The fix should preserve:

- event-driven fanout
- split watcher vs mention notifications
- preference and visibility filtering in `createNotifications()`

while adding recipient access validation before notifications are created.

### Visibility Intent

The codebase is already trying to separate candidate visibility from task visibility:

- candidate visibility is broader and candidate-scoped
- task visibility is narrower and includes assignee-specific rules
- candidate self-access is effectively reduced in some places to tasks assigned to the linked candidate user

The fix should make those rules consistent instead of inventing a new model.

## Implementation Plan

### 1. Fix Task Update Candidate Leakage And Tighten Shared Task Access

Goal:

- stop returning unsanitized candidate data from `PATCH /api/tasks/:id`
- make task detail/update/comment routes rely on a single shared access path

Primary files:

- [server/routes/tasks.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/tasks.routes.ts)
- [server/utils/authorization.utils.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/utils/authorization.utils.ts)
- [server/services/authorization/AuthorizationService.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/authorization/AuthorizationService.ts)
- [server/services/authorization/TaskPolicy.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/authorization/TaskPolicy.ts)
- [server/services/tasks/task.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/tasks/task.service.ts)
- [server/repositories/candidates/CandidateTaskRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/candidates/CandidateTaskRepository.ts)
- [server/utils/sanitization.utils.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/utils/sanitization.utils.ts)

Changes:

1. Refactor `fetchTaskWithAccess()` in `authorization.utils.ts` into the shared HTTP gate for task detail, update, delete, and task comment routes.
2. Internally route that helper through `authorizationService.authorizeTaskOrRespond(...)` so task policy, not candidate-only access, becomes the deciding path.
3. Extend the task repository with a protected single-task read that returns the task plus the minimum candidate context needed for task policy evaluation.
4. Keep the current raw/system single-task read for internal callers that do not pass `authContext`.
5. In `PATCH /api/tasks/:id`, build `authContext` once and reuse it for any candidate refresh after stage advancement.
6. Preserve the current response shape, but ensure any returned `candidate` object follows the same candidate sanitization rule already used in candidate routes.
7. Continue sanitizing task payloads for candidate users exactly as today.
8. Optionally add a tiny wrapper in `sanitization.utils.ts` to centralize the current "candidate self gets sanitized candidate" rule instead of duplicating it in routes.

Acceptance:

- `PATCH /api/tasks/:id` no longer returns internal candidate fields to candidate users.
- task detail and task comment routes reuse the same authorization helper path.
- hidden tasks still return `404`.
- existing route payload shape remains intact.

### 2. Scope Comment And Mention Notifications To Actual Recipient Access

Goal:

- ensure watchers and mentioned users only receive notifications if they can actually see the candidate/task/comment context

Primary files:

- [server/events/handlers/notification-handler.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/events/handlers/notification-handler.ts)
- [server/features/notifications/services/notify.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/notifications/services/notify.ts)
- [server/services/authorization/AuthorizationService.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/authorization/AuthorizationService.ts)
- [server/features/auth/services/auth.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/auth.service.ts)
- [server/repositories/users/UserRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/users/UserRepository.ts)
- [server/events/event-types.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/events/event-types.ts)
- [server/events/event-factory.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/events/event-factory.ts)
- [shared/schemas/comments.schema.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/shared/schemas/comments.schema.ts)

Changes:

1. Refactor the `comment.created` notification handler so it loads entity context once, builds raw watcher and mention recipient candidates, then runs both through a shared recipient-scoping helper before calling `createNotifications()`.
2. Extend `notify.ts` with a comment-specific recipient scoping helper rather than creating a new notification architecture elsewhere.
3. Add a reusable way to build `AuthorizationContext` for arbitrary user IDs so notification recipient checks can reuse the same auth model as request paths.
4. Reuse or extract the same role/scope hydration logic currently used by `hydrateAuthUser()` so session and notification auth contexts cannot drift.
5. Add a batch-oriented user repository method that returns the auth inputs needed for many recipients at once, avoiding N+1 auth lookups during fanout.
6. Normalize the comment event contract from `candidate_visible` to `external` so event types match the actual comment schema and repository behavior.
7. Keep watcher notifications and mention notifications separate, but dedupe recipients after scope filtering and continue suppressing self-notifications.

Acceptance:

- out-of-scope mentioned users do not receive comment previews or candidate/task context
- out-of-scope watchers do not receive comment notifications
- generic preference and visibility filtering still runs after access filtering
- event payload visibility naming matches the schema (`internal` / `external`)

### 3. Unify Candidate Task Visibility Across Lists, Aggregates, And Comment Stats

Goal:

- make candidate users see the same task set everywhere, instead of one rule for task routes and a different rule for metrics, estimates, and stats

Primary files:

- [server/services/authorization/TaskPolicy.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/authorization/TaskPolicy.ts)
- [server/repositories/base/BaseRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/base/BaseRepository.ts)
- [server/repositories/candidates/CandidateRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/candidates/CandidateRepository.ts)
- [server/repositories/candidates/CandidateTaskRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/candidates/CandidateTaskRepository.ts)
- [server/routes/candidates.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/candidates.routes.ts)
- [server/routes/search.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/search.routes.ts)
- [server/services/dashboard/dashboard.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/dashboard/dashboard.service.ts)
- [server/services/templates/template-estimation.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/templates/template-estimation.service.ts)
- [server/repositories/CommentRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/CommentRepository.ts)
- [server/services/shared/comment.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/shared/comment.service.ts)
- [server/tests/utils/mockServiceFactory.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/utils/mockServiceFactory.ts)

Changes:

1. Make task view/comment/update decisions use an explicit shared task-visibility rule instead of inheriting all candidate self-access.
2. Add reusable scope-condition builders in `BaseRepository.ts` so repositories stop reimplementing task visibility in ad hoc JS filters.
3. Move `CandidateRepository.getCandidate()` visibility from post-query checks into shared SQL scope filters, while preserving a raw/internal-by-id read for trusted internal flows.
4. Move `CandidateTaskRepository.getCandidateTasks()` away from post-query JS filtering into query-level conditions.
5. Add a reusable "visible task ids for this candidate and auth context" path so estimates, metrics, and comment stats can reuse the same rule instead of writing their own approximations.
6. Update `/candidates/:id/estimate` and `/candidates/:id/comment-stats` to pass auth context into the estimation/comment paths so candidate-facing aggregates use visible tasks only.
7. Keep the current route/service architecture, but start passing `authContext` into service methods where doing so improves consistency without breaking internal callers.
8. Align mock service factory behavior with the real task visibility rules so tests stop masking the inconsistency.

Acceptance:

- candidate task list, task detail, task comments, estimate, dashboard metrics, and comment stats all agree on which tasks a candidate user can see
- manager and scoped staff behavior stays unchanged unless an explicit open question is resolved differently
- internal callers without auth context keep their current trusted behavior

### 4. Reduce Fetch-Before-Authorize And ID-Only Mutation Risk Inside The Current Architecture

Goal:

- make the existing app-layer authorization harder to bypass accidentally

Primary files:

- [server/utils/authorization.utils.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/utils/authorization.utils.ts)
- [server/services/candidates/candidate.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/candidates/candidate.service.ts)
- [server/services/tasks/task.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/services/tasks/task.service.ts)
- [server/repositories/candidates/CandidateRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/candidates/CandidateRepository.ts)
- [server/repositories/candidates/CandidateTaskRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/candidates/CandidateTaskRepository.ts)

Changes:

1. Prefer protected read helpers from routes instead of raw repository reads for HTTP-facing flows.
2. Extend task service methods with optional `authContext` inputs so route calls can authorize inside the service without breaking internal/background callers.
3. Keep raw repository/service methods available for internal jobs, template expansion, due-date recompute, and other trusted flows, but make their use explicit.
4. Where possible, replace "read row, then check scope in JS" with scoped repository reads or protected helper paths.
5. Keep route-level role restrictions unchanged unless there is an explicit product decision to widen them.

Acceptance:

- fewer HTTP paths rely on raw by-id reads followed by later authorization
- service auth is additive and optional, not a breaking rewrite
- internal/background flows remain functional

## Test Plan

### Route Regressions

- [server/tests/routes/tasks.test.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/routes/tasks.test.ts)
  - candidate user updates own task and stage advancement occurs
  - `response.body.task` stays sanitized
  - `response.body.candidate` is either omitted or sanitized, depending on the final behavior decision
  - out-of-scope user still gets `404`
  - task detail and task comment routes follow the same authorization behavior
- [server/tests/routes/candidates.test.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/routes/candidates.test.ts)
  - candidate self `/estimate`
  - candidate self `/comment-stats`
  - candidate self `/tasks`
  - all reflect the same visible task set

### Authorization Coverage

- [server/tests/services/AuthorizationService.test.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/services/AuthorizationService.test.ts)
  - candidate self denied for hidden task
  - candidate self allowed for visible task
  - task comment authorization parity
  - arbitrary-user auth context hydration parity if that helper is added

### Notification Coverage

- [server/tests/notifications.test.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/notifications.test.ts)
  - mentioned user in scope is kept
  - mentioned user out of scope is skipped
  - watcher out of scope is skipped
  - candidate recipients only survive for `external`
  - skipped reasons are deterministic
- New file: `server/tests/events/comment-notification-scoping.test.ts`
  - publish `comment.created`
  - assert only scoped recipients reach `createNotifications()`

### Repository And Fixture Coverage

- add repository-focused tests for task visibility and comment-stat visibility if practical
- update [server/tests/utils/mockServiceFactory.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/utils/mockServiceFactory.ts) so the mock follows the same visibility rules as production code
- extend [server/tests/utils/seedAuthorizationFixtures.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/utils/seedAuthorizationFixtures.ts) only as needed to create:
  - out-of-scope mentioned users
  - out-of-scope followers
  - candidate-visible and candidate-hidden task combinations

## Recommended Rollout Order

1. Add regression tests for the task patch leak and notification scoping gaps.
2. Fix the task patch leak and shared task access helper.
3. Fix comment and mention recipient scoping.
4. Unify task visibility across aggregates and comment stats.
5. Clean up helper/repository paths and align mocks with production behavior.

Keep these as small, reviewable batches instead of one large auth refactor.

## Rollout Risks

- candidate users may lose access to fields or counts they are receiving today, even if that current behavior is accidental
- tightening notification recipients will suppress some notifications that currently go out
- moving repository filtering into SQL can change pagination/order in subtle ways if the old post-query filter was masking rows
- adding auth-aware service methods can break internal jobs if auth becomes mandatory instead of optional
- aligning mocks with real behavior will surface previously hidden test failures

## Open Questions Before Implementation

1. Should `PATCH /api/tasks/:id` continue returning `candidate` for candidate users after advancement, just sanitized, or can it omit `candidate` entirely? Safest compatibility path: keep it and sanitize it.
2. For task detail/comments, should behavior follow current route semantics or `TaskPolicy` semantics? Today the routes effectively require candidate access, but `TaskPolicy` allows assignee fallback.
3. For candidate self-access, should the canonical task rule be:
   - only directly assigned tasks, or
   - directly assigned tasks plus unresolved `assigneeRole = candidate.self` tasks?
4. Should `/api/candidates/:id/estimate` and `/comment-stats` reflect only visible tasks for candidate users, or intentionally show full onboarding progress even when some tasks stay hidden?
5. When an author mentions an out-of-scope user, should the system silently skip that notification or surface it back to the author/admin? Recommended default: silent skip plus structured logging.
6. Should the notification fix be forward-only, or should it include cleanup/filtering for already stored out-of-scope `comment.created` and `mention` rows?
7. Should `POST /api/tasks` remain `system_admin` / `hr_staff` only, or should any future service-level authorization honor the broader create permissions implied by `TaskPolicy`? Safest compatibility path: keep the current route restriction.
8. For template expansion, due-date recompute, deadline jobs, and other non-request callers, should missing `authContext` continue to mean trusted internal execution? Recommended default: yes.

## Assumptions

1. The current application-layer authorization model is staying in place.
2. Internal/background jobs are trusted server-side callers unless the team explicitly decides otherwise.
3. The frontend and tests currently rely on response shapes more than hidden-field access, so preserving payload shape is more important than preserving accidental overexposure.
4. The docs in `docs/` should remain actively maintained and aligned with the current source tree.
