# Domain Glossary

Common terms used across OnBoardPro's client, server, and shared schemas.

Last Updated: 2026-02-18

## Roles and Access

- `system_admin`: Full system administration, including auth provider and SMTP/security settings.
- `hr_staff`: Broad operational access across candidates, templates, tasks, users, and org data.
- `department_admin`: Department-scoped management.
- `division_leader`: Division-scoped management.
- `manager`: Manager-scoped candidate/task access.
- `candidate`: Self-service access for linked candidate users.
- Scope tables: `user_department_scopes`, `user_division_scopes`, `manager_candidate_scopes`.

## Candidate Lifecycle

- Candidate: person moving through a hiring/onboarding process (`candidates`).
- Candidate status enum:
  - `draft`, `active`, `on_hold`, `completed`, `canceled`, `offer_declined`, `archived`.
- Letter of Intent date: `letterOfIntentDate`; required at candidate creation and treated as immutable.
- LOO dates: `offerLetterIssuedAt`, `offerLetterAcceptedAt`.
- Template selection vs application:
  - selected via `templateAppliedFromId`
  - fully applied when `templateAppliedAt` is set
- Stage history: transition trail in `candidate_stage_history`.
- Followers: watchers in `candidate_followers`.

## Templates and Tasks

- Template: reusable workflow definition (`templates`).
- Template stage: ordered stage row in `template_stages` with `phase` (`pre_hire` or `onboarding`).
- Template task: task blueprint in `template_tasks`, including due rule and assignee defaults.
- Candidate task: runtime task instance in `candidate_tasks`.
- Prerequisite task: template task with `isPrerequisite=true`, expanded at candidate creation.
- Prerequisite condition enum:
  - `requires_pt`, `always`.
- Due rules: 18 values in `due_rule_type` enum (`shared/schemas/task.enums.ts`).
- Pending anchor: task has a rule but missing required anchor date (`pendingAnchor=true`).

## Notifications and Email

- Notification: in-app event record (`notifications`).
- Notification key: idempotency key for de-duping (`notification_keys`).
- Notification outbox: email delivery queue (`notification_outbox`).
- Digest frequency: user preference (`immediate`, `hourly`, `daily`, `weekly`, `none`).
- SMTP settings: encrypted transport config in `smtp_settings`.

## Comments and Mentions

- Comment: collaboration entry attached to candidate/task.
- Mention key: user lookup token (`users.mentionKey`) for mention parsing.
- Mention notification: created as `type="mention"` in notifications flow.

## Authentication and Identity

- Auth providers: `local`, `ldap`, `google`, `azuread` (`auth_providers`).
- Session: server-side session with `connect.sid` cookie.
- User identity: provider-linked identity in `user_identities`.
- Invitation: pre-provisioned onboarding token in `invitations`.

## Audit and Operations

- Audit log: immutable admin/system audit entries (`audit_log`).
- System settings: JSON-backed key/value controls (`system_settings`).
- Security settings: session timeout values managed via `/api/settings/security`.
- Health endpoints:
  - `/health`
  - `/health/ready`
  - `/health/live`
  - `/ping`

## Shared Contracts

- Canonical schemas: `shared/schemas/*.ts`.
- Legacy aggregate schema export: `shared/schema.ts`.
- Preferences contract: `shared/preferences.ts`.

## Migration Utilities

- SQL migrations: `migrations/*.sql`.
- Single file migration runner: `scripts/runMigration.ts`.
- Multi-file SQL runner: `scripts/runSqlFiles.ts`.
- Script wrappers:
  - `npm run db:migrate-file -- <file.sql>`
  - `npm run db:run-sql -- <file1.sql> [file2.sql...]`
