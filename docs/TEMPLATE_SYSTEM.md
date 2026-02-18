# Template System

Current-state reference for template business logic and runtime behavior.

Last Updated: 2026-02-18

## Overview

Templates model reusable onboarding workflows that are expanded into candidate-specific tasks.

Model shape:

- `templates`
- `template_stages`
- `template_tasks`
- runtime expansion targets:
  - `candidate_template_stages`
  - `candidate_tasks`

Key behavior:

- template selection can happen at candidate creation
- non-prerequisite tasks expand when template is applied
- prerequisite tasks can expand earlier (at candidate creation)
- due dates are rule-driven and anchor-based

## Three-Layer Data Pattern

1. Definition layer:
   - template, stage, task definition rows
2. Snapshot layer:
   - candidate stage snapshots at apply time
3. Runtime layer:
   - candidate tasks with concrete assignees, status, and due dates

## Due Rule System

Due rule enum lives in `shared/schemas/task.enums.ts` (`due_rule_type`).

Supported rule groups:

- LOI-based:
  - `on_loi_date`, `days_before_loi`, `days_after_loi`
- LOO generic fallback:
  - `on_loo_date`, `days_before_loo`, `days_after_loo`
- LOO accepted explicit:
  - `on_loo_accepted_date`, `days_before_loo_accepted`, `days_after_loo_accepted`
- LOO issued explicit:
  - `on_loo_issued_date`, `days_before_loo_issued`, `days_after_loo_issued`
- Start date:
  - `on_start_date`, `days_before_start`, `days_after_start`
- Stage-relative:
  - `days_before_stage`, `days_after_stage`
- Fixed:
  - `fixed_date`

Date resolution utilities are in `server/utils/date.utils.ts`.

## Anchor Resolution

Runtime anchor values are computed from candidate data:

- LOI: `letterOfIntentDate`
- LOO generic: `offerLetterAcceptedAt ?? offerLetterIssuedAt`
- LOO accepted: `offerLetterAcceptedAt`
- LOO issued: `offerLetterIssuedAt`
- Start: `anticipatedStartDate`

If a required anchor is missing, candidate task is created with `pendingAnchor=true`.

## Prerequisite Tasks

Template tasks can be marked:

- `isPrerequisite=true`
- `prerequisiteCondition`: `requires_pt` or `always`

Condition evaluation is implemented by:

- `server/services/templates/prerequisite-conditions.service.ts`

Prerequisite expansion entrypoint:

- `TemplateExpansionService.expandPrerequisites()` in `server/services/templates/template-expansion.service.ts`

## Template Lifecycle

### Create and Edit

Routes:

- `POST /api/templates`
- `PATCH /api/templates/:id`
- `DELETE /api/templates/:id`

Services:

- `TemplateService` (`server/services/templates/template.service.ts`)

### Build Structure

- stages:
  - `GET/POST /api/templates/:id/template-stages`
  - `PATCH /api/template-stages/:id`
  - `DELETE /api/template-stages/:id`
  - `PATCH /api/templates/:id/stages/reorder`
- tasks:
  - `GET/POST /api/templates/:id/template-tasks`
  - `PATCH /api/template-tasks/:id`
  - `DELETE /api/template-tasks/:id`
  - `PATCH /api/templates/:templateId/template-tasks/reorder`

### Readiness and Status

- readiness endpoint:
  - `GET /api/templates/:id/readiness`
- status endpoint:
  - `PATCH /api/templates/:id/status` (`draft`, `active`, `archived`)

Readiness checks currently enforce:

- at least one stage
- each active stage has at least one task
- fixed-date tasks include `fixedDate`
- role assignments include `defaultAssigneeRole`

### Estimate Timeline

- `GET /api/templates/:id/estimate`
- query inputs: `loiDate`, `looDate`, `startDate`, `candidateId`, `businessDays`
- implemented by `TemplateEstimationService`

## Candidate Integration

Candidate create/update flow is in `server/routes/candidates.routes.ts` and `client/src/features/candidates/components/new-candidate-dialog.tsx`.

Current pattern:

1. Candidate is created with `templateId` (stored as selected template link).
2. Prerequisites may expand immediately.
3. Full template expansion runs when apply conditions are met (including manual apply endpoint or date-driven flow).
4. Expansion creates candidate tasks and stage snapshots, then locks template state for that candidate.

Manual apply endpoint:

- `POST /api/candidates/:id/apply-template`

## Core Files

Backend:

- `server/services/templates/template.service.ts`
- `server/services/templates/template-expansion.service.ts`
- `server/services/templates/template-estimation.service.ts`
- `server/services/templates/prerequisite-conditions.service.ts`
- `server/routes/templates.routes.ts`
- `server/routes/candidates.routes.ts`

Frontend:

- `client/src/app/(dashboard)/templates/page.tsx`
- `client/src/app/(dashboard)/templates/[id]/page.tsx`
- `client/src/features/templates/components/*`
- `client/src/features/candidates/components/new-candidate-dialog.tsx`

Shared contracts:

- `shared/schemas/template.schema.ts`
- `shared/schemas/task.enums.ts`
- `shared/schemas/candidate.schema.ts`
