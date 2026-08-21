# Security Priorities Checklist

Last Updated: 2026-03-19

## Purpose

This checklist answers a practical question for OnBoardPro:

"What do we need to keep this app secure now, and what should we harden next?"

It is based on the current architecture and codebase:

- Express app with server-side session auth
- PostgreSQL behind the app, not directly exposed to the browser
- app-layer RBAC and scope enforcement
- no PostgreSQL row-level security today

This is not a generic checklist. It is written for how this repository works today.

## Short Answer

OnBoardPro does not need PostgreSQL RLS to be reasonably secure today if:

- the app remains the only path to the database for normal usage
- the existing route, service, and repository authorization stays correct
- production configuration is sound
- regressions in auth logic are tested and reviewed carefully

RLS is still strongly recommended as a next hardening step because it adds defense in depth around sensitive candidate and task data.

## Current Security Position

### Strengths Already Present

The repo already has meaningful security controls:

- authenticated session-based access in `server/features/auth/services/auth.service.ts`
- role and scope authorization in `server/services/authorization/AuthorizationService.ts`
- route guards in `server/middleware/authorization.ts`
- candidate and task scope filtering in repositories and services
- candidate self-view sanitization in `server/utils/sanitization.utils.ts`
- CSRF protection in `server/middleware/csrf.ts`
- security headers in `server/config/security-headers.ts`
- DB-backed rate limiting in `server/services/rate-limit.service.ts`
- audit logging in `server/services/shared/audit-logger.ts`
- authorization-focused tests in `server/tests/auth/*` and `server/tests/services/AuthorizationService.test.ts`

These controls matter. This app is not relying on "security by hiding URLs."

### Important Current Weakness

Authorization is enforced mostly in application code, not in PostgreSQL itself.

That means the main failure mode is not "RLS missing." The main failure mode is:

- a route forgets a guard
- a repository query misses a scope filter
- a detail query fetches a row before verifying scope
- a future internal script or job reads protected rows too broadly

For this codebase, RLS is best understood as protection against those mistakes.

## Priority Buckets

## 1. Must Be True in Production

These are the items that matter most right now. If any of these are weak, fix them before treating RLS as the main priority.

- Keep PostgreSQL inaccessible from end users and untrusted networks.
  - This app is designed around app-mediated access, not client-to-database access.
- Keep `SESSION_SECRET`, DB credentials, and provider secrets strong and environment-specific.
- Keep HTTPS and proxy configuration correct in production.
- Keep session cookies secure and HTTP-only.
- Keep CSRF enabled on state-changing endpoints.
- Keep auth and authorization tests passing on every release.
- Keep privileged/admin endpoints limited to trusted roles.
- Keep audit logging functioning for sensitive actions and access denials.
- Keep dependencies and Node/Postgres versions updated with security fixes.

Operationally, this bucket matters more than RLS for immediate real-world safety.

## 2. Secure Enough Now Checklist

If the following are true, the app is in a reasonable security posture without RLS:

- All user access to candidate/task data goes through the Express API.
- No one is using shared SQL consoles or ad hoc scripts against production data outside controlled admin workflows.
- Route guards and authorization helpers remain mandatory review points for any new endpoint.
- Candidate and task queries continue to use the current scope-aware patterns.
- Candidate-facing responses continue to use the existing sanitizers where needed.
- Background jobs and internal services remain trusted server-side code only.
- The team treats authorization regressions as high severity.

That is enough for "secure enough to operate" in the current architecture.

## 3. Should Do Next

These are the next security priorities I recommend for this repository.

### 3.1 Add PostgreSQL RLS for Candidate and Task Core Tables

Priority: High

Why:

- candidate and task data are the most sensitive row-scoped data in the app
- current authorization is repeated across routes, repositories, and services
- some reads are broad enough that mistakes could leak data if app logic regresses

Recommended starting scope:

- `candidates`
- `candidate_tasks`
- `candidate_stage_history`
- `candidate_template_stages`
- `candidate_followers`
- `notifications`
- `notification_keys`
- `user_preferences`

Status:

- strongly recommended hardening
- not a strict blocker for basic security

Companion doc:

- `docs/RLS_IMPLEMENTATION_PLAN.md`

### 3.2 Add DB-Backed Integration Tests for Authorization Boundaries

Priority: High

Why:

- many current tests validate route and service behavior through mocks or app-layer logic
- RLS and DB-level authorization need real database coverage

Recommended additions:

- candidate visibility tests by role/scope
- task visibility and assignee tests
- internal/system bypass path tests
- notification ownership tests

### 3.3 Make Auth-Sensitive Code Review Rules Explicit

Priority: High

Why:

- this codebase’s biggest risk is accidental regression in manual authorization logic

Recommended team rule:

- any change touching `server/routes`, `server/repositories`, `server/services/authorization`, or candidate/task visibility must be reviewed with a security lens

### 3.4 Reduce Fetch-Before-Authorize Patterns Where Practical

Priority: Medium-High

Why:

- some current code loads a row and then checks scope afterward
- this is safer once RLS exists, but still worth reducing over time

Goal:

- prefer queries that are already scope-bounded at read time

## 4. Important but Not Urgent

These are worthwhile hardening steps, but they are below the items above.

### 4.1 Extend RLS to Comments Only After Core Candidate/Task RLS Is Stable

Priority: Medium

Why:

- comments have both row scope and `internal` vs `external` visibility rules
- they are more complex than candidate/task core access

Recommendation:

- keep comments app-layer first
- revisit after core RLS is implemented and proven stable

### 4.2 Review Background Job and Internal Script Access Paths

Priority: Medium

Why:

- internal jobs in notifications, deadlines, template expansion, and events are trusted today
- once RLS exists, they need a clean system path
- even before RLS, these are worth documenting and limiting carefully

### 4.3 Add Query Performance Checks Around Security-Critical Reads

Priority: Medium

Why:

- hardening measures that slow down candidate/task list and dashboard queries too much can create pressure to bypass them later

Recommendation:

- benchmark before and after RLS
- keep the needed indexes in place

## 5. Later Hardening

These are useful, but they are not where I would spend the next unit of effort unless requirements change.

- moving every admin/reference table under RLS
- rewriting the whole authorization model around database-only enforcement
- replacing the existing policy and sanitizer layers
- pushing comments/search/analytics into RLS before candidate/task core is done

Those changes are higher cost and lower immediate security return for this repo.

## When RLS Becomes Closer to Necessary

RLS moves from "recommended" toward "needed" if any of these become true:

- more engineers are frequently changing repository and route code
- production data is especially sensitive from a compliance or audit perspective
- more internal jobs or sidecar services query the same database
- direct SQL access becomes more common for operations or reporting
- the app grows more integrations or external automation paths

The more code paths and operators touch protected data, the more valuable DB-enforced boundaries become.

## Recommended Order of Work

If security work is being prioritized now, I recommend this order:

1. Verify production configuration and secrets are solid.
2. Keep auth, CSRF, session, and route protection green in CI.
3. Add DB-backed authorization integration tests.
4. Implement RLS for candidate/task core tables.
5. Extend RLS to user-owned tables like notifications and preferences.
6. Reassess comments and more complex derived-access surfaces later.

## Practical Decision

If the question is:

"Can we operate securely without RLS right now?"

The answer is:

- yes, if the current app-layer controls remain disciplined and production configuration is sound

If the question is:

"What is the next meaningful security improvement for sensitive HR/candidate data?"

The answer is:

- add PostgreSQL RLS as defense in depth, starting with candidate and task core tables

## Related Docs

- `docs/RLS_IMPLEMENTATION_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/WEB_APPLICATION_SECURITY_QUESTIONNAIRE.md`
- `docs/SECURITY_RISK_ACCEPTANCE.md`
