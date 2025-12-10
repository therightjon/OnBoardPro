# Domain Glossary

Common terms for OnBoardPro so client/server/services stay aligned.

## Roles & access
- **system_admin**: Full control, manages settings/users/templates.
- **hr_staff**: Core HR operations, candidate/task/template management.
- **department_admin**: Department-scoped management; elevated visibility.
- **division_leader**: Division-scoped management; elevated visibility.
- **manager**: Manages assigned candidates/tasks; limited admin powers.
- **candidate**: Self-service access for linked candidate users.
- **Scopes**: Department/division/managed-candidate scopes are applied in repositories and middleware for visibility filtering.

## Candidate lifecycle
- **Candidate**: Person moving through onboarding. Key fields: status, currentStageId, department/division, primaryOwnerId, linkedUserId.
- **Status**: `active`, `archived`, plus lifecycle states in shared enums (e.g., hired/rejected). `statusBeforeArchive` tracks rollback state.
- **Stage**: Steps in the hiring pipeline (Drizzle table `hiring_stages`). Stored on candidates as `currentStageId`; history tracked via repositories.
- **Candidate Type**: Classification (faculty/staff/etc.) from `candidate_types`.
- **Followers**: Users subscribed to updates on a candidate.
- **Template Application**: Applying a workflow template to a candidate to materialize stages/tasks.
- **Owner/Manager**: Primary owner (often HR) vs manager; both used in auth visibility checks.

## Templates & tasks
- **Template**: Reusable onboarding workflow; composed of template stages and template tasks.
- **Template Stage**: Grouping of tasks with ordering; can be reordered.
- **Template Task**: Task definition tied to a stage; can include due rules and assignee info.
- **Task Definition**: Reference data used when creating candidate tasks; lives in `task_definitions`.
- **Candidate Task**: Task instantiated for a candidate; status/assignee/due date tracked per candidate.
- **Due Rules**: Rules for task due dates relative to anchor dates; computed via TaskDueDateService.
- **Priority**: Task priority enum (`priorityEnum`).

## Notifications & comments
- **Notification**: Stored notification records keyed by entity (`notificationEntityEnum`); delivered via UI and email outbox.
- **Notification Key**: Prevents duplicates for certain events (`notificationKeys` table).
- **Outbox**: Email outbox entries (`notificationOutbox`) processed by jobs.
- **Comments**: User comments on candidates/tasks with mention support (`mentionKey` on users).

## Auth & identity
- **Auth Providers**: Local, Google, Azure AD, LDAP; configured in auth provider service and routes.
- **Session**: Express-session with Postgres store; cookie `connect.sid`.
- **Mention Key**: Unique per user for mentions in comments/notifications.

## Data/shared
- **Shared schema**: `shared/schema.ts` and `shared/schemas/*.ts` define database tables/enums and Zod schemas reused by client/server.
- **Preferences**: User preference payloads defined in `shared/preferences.ts` and consumed via `/api/me/preferences`.
