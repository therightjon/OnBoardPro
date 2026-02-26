# Bounded Contexts

Purpose: describe the current domain boundaries in OnBoardPro and map each boundary to the code that implements it.

Last Updated: 2026-02-18
Status: Active

## Overview

OnBoardPro is organized into 8 practical bounded contexts:

1. Candidate Lifecycle
2. Task Management
3. Template Management
4. Identity, Authentication, and Access Control
5. Organization and Reference Data
6. Notification and Email Delivery
7. Collaboration (Comments and Mentions)
8. Audit and Operational Controls

Cross-context coordination uses:

- Service layer orchestration in `server/services/`
- Repository boundaries in `server/repositories/`
- Domain events in `server/events/`
- Feature routes in `server/routes/` and `server/features/**`

## 1) Candidate Lifecycle

Purpose: own candidate records, stage progression, template assignment state, and candidate-level timeline behavior.

Primary data:

- `candidates`
- `candidate_stage_history`
- `candidate_template_stages`
- `candidate_followers`
- candidate lifecycle enums in `shared/schemas/candidate.schema.ts`

Core services:

- `server/services/candidates/candidate.service.ts`
- `server/services/candidates/stage-advancement.service.ts`

Core repositories:

- `server/repositories/candidates/CandidateRepository.ts`
- `server/repositories/candidates/CandidateStageRepository.ts`
- `server/repositories/candidates/CandidateFollowerRepository.ts`

Routes:

- `server/routes/candidates.routes.ts`
- key endpoint families: `/api/candidates`, `/api/candidates/:id/stages`, `/api/candidates/:id/stage-history`, `/api/candidates/:id/apply-template`

Published domain events (examples):

- `candidate.created`
- `candidate.status_changed`
- `candidate.stage_changed`
- `candidate.template_applied`
- `candidate.archived`
- `candidate.restored`

## 2) Task Management

Purpose: own candidate task execution, status transitions, assignee resolution, and due date recalculation.

Primary data:

- `candidate_tasks`
- `task_definitions` (reference-backed)
- due rule and status enums from `shared/schemas/task.enums.ts`

Core services:

- `server/services/tasks/task.service.ts`
- `server/services/tasks/task-due-date.service.ts`
- `server/features/tasks/services/advance-stage.service.ts`

Core repositories:

- `server/repositories/candidates/CandidateTaskRepository.ts`

Routes:

- `server/routes/tasks.routes.ts`
- key endpoint families: `/api/tasks`, `/api/tasks/mine`, `/api/tasks/:id/comments`

Published domain events (examples):

- `task.created`
- `task.assigned`
- `task.status_changed`
- `task.completed`
- `task.due_date_changed`
- `task.deleted`

## 3) Template Management

Purpose: own reusable onboarding workflow definitions, readiness checks, expansion logic, and timeline estimation.

Primary data:

- `templates`
- `template_stages`
- `template_tasks`
- prerequisite fields on template tasks (`is_prerequisite`, `prerequisite_condition`)

Core services:

- `server/services/templates/template.service.ts`
- `server/services/templates/template-expansion.service.ts`
- `server/services/templates/template-estimation.service.ts`
- `server/services/templates/prerequisite-conditions.service.ts`

Core repositories:

- `server/repositories/templates/TemplateRepository.ts`
- `server/repositories/templates/TemplateStageRepository.ts`
- `server/repositories/templates/TemplateTaskRepository.ts`

Routes:

- `server/routes/templates.routes.ts`
- key endpoint families: `/api/templates`, `/api/templates/:id/readiness`, `/api/templates/:id/estimate`, `/api/template-tasks/:id`, `/api/template-stages/:id`

Published domain events (examples):

- `template.created`
- `template.updated`
- `template.cloned`
- `candidate.template_applied` (when expansion completes)

## 4) Identity, Authentication, and Access Control

Purpose: authenticate users, manage provider configuration, maintain role/scope grants, and enforce authorization.

Primary data:

- `users`
- `user_identities`
- `user_roles`
- `user_department_scopes`
- `user_division_scopes`
- `manager_candidate_scopes`
- `invitations`
- `auth_providers`
- `rate_limit_counters`

Core services:

- `server/features/auth/services/auth.service.ts`
- `server/services/auth/auth-provider.service.ts`
- `server/services/users/user.service.ts`
- `server/services/users/invitation.service.ts`
- `server/services/authorization/AuthorizationService.ts`

Core repositories:

- `server/repositories/users/UserRepository.ts`
- `server/repositories/users/UserIdentityRepository.ts`
- `server/repositories/users/UserPreferencesRepository.ts`
- `server/repositories/users/InvitationRepository.ts`

Middleware and policy enforcement:

- `server/middleware/authorization.ts`
- `server/services/authorization/CandidatePolicy.ts`
- `server/services/authorization/TaskPolicy.ts`

Routes:

- `server/routes/auth.routes.ts`
- `server/routes/users.routes.ts`

## 5) Organization and Reference Data

Purpose: own organization structure and reusable lookup catalogs consumed by candidates/tasks/templates.

Primary data:

- `departments`
- `divisions`
- `hiring_stages`
- `task_categories`
- `task_priorities`
- `candidate_types`
- `faculty_ranks`

Core services:

- `server/services/organization/organization.service.ts`
- `server/services/reference/reference-data.service.ts`

Core repositories:

- `server/repositories/organizational/DepartmentRepository.ts`
- `server/repositories/organizational/DivisionRepository.ts`
- `server/repositories/reference/ReferenceDataRepository.ts`
- `server/repositories/reference/HiringStageRepository.ts`
- `server/repositories/reference/TaskDefinitionRepository.ts`

Routes:

- `server/routes/organizations.routes.ts`
- `server/routes/reference-data.routes.ts`

## 6) Notification and Email Delivery

Purpose: create in-app notifications from domain events and deliver email (immediate + digest) through outbox workers.

Primary data:

- `notifications`
- `notification_keys`
- `notification_outbox`
- `smtp_settings`
- `user_preferences` (email/digest controls)

Core services:

- `server/services/shared/notification.service.ts`
- `server/features/notifications/services/notify.ts`
- `server/features/email/outbox.service.ts`
- `server/features/email/smtp-settings.service.ts`

Background workers:

- `server/jobs/notification-email.ts`
- `server/jobs/notification-cleanup.ts`
- `server/jobs/scan-deadlines.ts`

Event handlers:

- `server/events/handlers/notification-handler.ts`

Routes:

- `server/routes/notifications.routes.ts`
- SMTP settings routes in `server/routes/settings.routes.ts`

## 7) Collaboration (Comments and Mentions)

Purpose: support candidate/task discussion, mentions, and comment-driven notification fanout.

Primary data:

- comments tables and schemas from `shared/schemas/comments.schema.ts`

Core services:

- `server/services/shared/comment.service.ts`

Core repositories:

- `server/repositories/CommentRepository.ts`

Routes:

- comment endpoints are split between:
  - `server/routes/candidates.routes.ts`
  - `server/routes/tasks.routes.ts`
  - `server/routes/notifications.routes.ts` (comment update/delete)

Published domain events:

- `comment.created`

## 8) Audit and Operational Controls

Purpose: track privileged/system activity and expose operational health/settings controls.

Primary data:

- `audit_log`
- `system_settings`

Core services:

- `server/services/audit/audit.service.ts`
- `server/services/settings/system-settings.service.ts`
- `server/services/shared/audit-logger.ts`

Routes:

- `server/routes/audit.routes.ts`
- `server/routes/settings.routes.ts`
- health endpoints in `server/routes/health.ts`

## Integration Style

The codebase follows a layered integration style:

- Routes validate/authenticate/authorize and orchestrate request/response
- Services own business rules and event publication
- Repositories own DB persistence details
- Event handlers react asynchronously and trigger cross-context side effects

This separation is implemented consistently through `server/services/service-factory.ts`, which wires repository dependencies into service singletons.
