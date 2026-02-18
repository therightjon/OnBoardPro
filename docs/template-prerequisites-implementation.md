# Template Prerequisites Implementation

Current implementation reference for prerequisite template tasks.

Last Updated: 2026-02-18

## What Prerequisites Are

Prerequisites are template tasks that can be created at candidate creation time, before full template expansion.

Use case:

- tasks that must begin from LOI timing rather than LOO acceptance timing
- conditional tasks for specific faculty ranks (for example P&T approval flows)

## Schema and Enum Support

Primary fields:

- `template_tasks.is_prerequisite` (`boolean`)
- `template_tasks.prerequisite_condition` (`prerequisite_condition` enum)
- `candidate_tasks.is_prerequisite_task` (`boolean`)
- `candidates.template_prerequisites_expanded_at` (`timestamp`)
- `candidates.letter_of_intent_date` (`date`)

Enum values (`shared/schemas/task.enums.ts`):

- `requires_pt`
- `always`

Related migrations:

- `0016_loi_date_and_deferred_template.sql`
- `0022_template_prerequisites.sql`
- `0023_loo_issued_accepted_rules.sql`

## Runtime Flow

### 1) Candidate Creation

`POST /api/candidates` enforces:

- `letterOfIntentDate` required
- `templateId` required

For faculty ranks where `requiresPT=true`, the route validates the chosen template includes at least one prerequisite task with `prerequisiteCondition="requires_pt"`.

Implementation: `server/routes/candidates.routes.ts`.

### 2) Prerequisite Expansion

After candidate creation, route logic calls:

- `TemplateExpansionService.expandPrerequisites(candidateId, templateId)`

Implementation: `server/services/templates/template-expansion.service.ts`.

Behavior:

- skips if prerequisites already expanded (`templatePrerequisitesExpandedAt`)
- requires candidate LOI date
- filters template tasks where `isPrerequisite=true`
- evaluates `prerequisiteCondition` via `PrerequisiteConditionsService`
- creates candidate tasks with `isPrerequisiteTask=true`
- stamps `templatePrerequisitesExpandedAt`

### 3) Condition Evaluation

`PrerequisiteConditionsService` supports:

- `requires_pt`: true if candidate's loaded faculty rank has `requiresPT=true`
- `always`: unconditional true

Implementation: `server/services/templates/prerequisite-conditions.service.ts`.

### 4) Full Template Expansion Later

Non-prerequisite tasks are expanded by full template application flow (`expandTemplate`) and explicitly exclude prerequisite tasks to avoid duplicates.

## Due Rules for Prerequisite Tasks

Prerequisites commonly use LOI-based rules:

- `on_loi_date`
- `days_before_loi`
- `days_after_loi`

These are resolved through shared date utilities in `server/utils/date.utils.ts`.

## API Surfaces Involved

- Candidate creation: `POST /api/candidates`
- Manual full apply: `POST /api/candidates/:id/apply-template`
- Template task CRUD:
  - `GET/POST /api/templates/:id/template-tasks`
  - `PATCH /api/template-tasks/:id`

## Frontend Behavior

Candidate create form (`client/src/features/candidates/components/new-candidate-dialog.tsx`):

- requires LOI date and template selection
- applies date cascade validation (LOI -> LOO issued -> LOO accepted -> start)
- when rank requires P&T, blocks template selection unless a matching prerequisite task exists

Template editor UI (`client/src/app/(dashboard)/templates/[id]/page.tsx` + template components) supports configuring prerequisite fields on template tasks.

## Operational Notes

- prerequisite expansion failures are logged but do not block candidate creation
- full template expansion can still proceed later
- prerequisite tasks are marked distinctly, so downstream logic can filter/report separately

## Key Files

- `server/services/templates/template-expansion.service.ts`
- `server/services/templates/prerequisite-conditions.service.ts`
- `server/routes/candidates.routes.ts`
- `shared/schemas/template.schema.ts`
- `shared/schemas/candidate.schema.ts`
- `shared/schemas/task.schema.ts`
- `shared/schemas/task.enums.ts`
