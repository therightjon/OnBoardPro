# OnBoardPro Templates System - Comprehensive Analysis

## Overview

The **Templates** system in OnBoardPro is a blueprint mechanism for automating candidate onboarding and hiring workflows. Templates define a reusable set of **stages** and **tasks** that get "expanded" (instantiated) onto a candidate when the template is applied.

---

## Core Entities

### 1. **Templates** (`templates`)
| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `name` | Unique template name (case-insensitive) |
| `candidateTypeId` | FK linking to candidate types (e.g., "Full-Time", "Contractor") |
| `description` | Optional description |
| `isActive` | Whether template is available for use |
| `archived` | Soft-delete flag |
| `createdBy` | User who created the template |

**Status Logic:**
```typescript
function getTemplateStatus(template: Template): "draft" | "active" | "archived" {
  if (template.archived) return "archived";
  if (template.isActive) return "active";
  return "draft";
}
```

### 2. **Template Stages** (`templateStages`)
| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `templateId` | FK to parent template |
| `stageId` | FK to global `hiring_stages` catalog |
| `orderIndex` | Position in the pipeline (0-based) |
| `isActive` | Soft-delete/toggle flag |
| `phase` | Either `"pre_hire"` or `"onboarding"` |

**Key Concept:** Stages come from a **global catalog** (`hiring_stages`) but each template can select a **subset** and define its own **ordering** and **phase assignments**.

### 3. **Template Tasks** (`templateTasks`)
| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `templateId` | FK to parent template |
| `taskDefId` | FK to global `task_definitions` catalog |
| `stageId` | FK to `hiring_stages` |
| `templateStageId` | FK to `template_stages` (enforces task belongs to template's stage) |
| `dueRuleType` | How due date is calculated |
| `dueRuleValue` | Number of days (for relative rules) |
| `fixedDate` | Specific date (for fixed_date rule) |
| `defaultAssigneeKind` | `"user"` or `"role"` |
| `defaultAssigneeUserId` | Specific user assignment |
| `defaultAssigneeRole` | Role-based assignment (e.g., `"candidate.self"`) |
| `defaultPriorityId` | Default task priority |
| `defaultCategoryId` | Default task category |
| `isRequired` | Whether task blocks stage advancement |
| `archived` | Soft-delete flag |

---

## Due Date Rule System

The `dueRuleTypeEnum` defines **9 rule types**:

| Rule Type | Anchor | Description |
|-----------|--------|-------------|
| `on_loo_date` | LOO | Due on offer letter acceptance date |
| `days_before_loo` | LOO | N days before LOO date |
| `days_after_loo` | LOO | N days after LOO date |
| `on_start_date` | Start | Due on anticipated start date |
| `days_before_start` | Start | N days before start date |
| `days_after_start` | Start | N days after start date |
| `days_before_stage` | Stage | N days before stage transition |
| `days_after_stage` | Stage | N days after stage transition |
| `fixed_date` | None | Specific calendar date |

### Anchor Resolution (`date.utils.ts`)
```typescript
// LOO anchor: Prefer accepted date, fallback to issued date
resolveLooAnchor(candidate) → candidate.offerLetterAcceptedAt ?? candidate.offerLetterIssuedAt

// Start anchor: Use anticipated start date
resolveStartAnchor(candidate) → candidate.anticipatedStartDate
```

---

## Template Application Process

When a template is applied to a candidate via `TemplateExpansionService`:

### 1. **Validation Phase**
- Candidate exists and has no template already applied (`templateLocked = false`)
- Candidate has no existing tasks
- Template exists and `isActive = true`
- Template has at least one task

### 2. **Data Retrieval**
- Fetch all template stages and build a lookup map
- Fetch all template tasks
- Fetch task definitions for task names/descriptions

### 3. **Anchor Resolution**
```typescript
const anchors: AnchorDates = {
  loo: resolveLooAnchor(candidate),
  start: resolveStartAnchor(candidate),
};
```

### 4. **Task Creation**
For each template task:
1. Compute due date using `computeDueFromRule()`
2. Resolve priority from `defaultPriorityId`
3. Handle special assignee roles (e.g., `candidate.self` → linked user)
4. Create `InsertCandidateTask` payload
5. Bulk insert all tasks

### 5. **Stage Snapshot**
- Create `candidate_template_stages` records (immutable snapshot)
- Update `candidate_tasks.stage_order_index` for sorting

### 6. **Candidate Update**
```typescript
await candidateRepo.updateCandidate(candidateId, {
  templateAppliedFromId: templateId,
  templateAppliedAt: new Date(),
  templateLocked: true,           // Prevents re-application
  currentStageId: firstStageId,   // Initialize to first stage
  templateNameSnapshot: template.name,
  templateVersion: 1,
});
```

### 7. **History Recording**
- Insert initial stage transition into `candidate_stage_history`

---

## Pipeline Duration Estimation

The `TemplateEstimationService` calculates timeline estimates:

### Calculation Logic
1. For each task, compute due date from rule + anchors
2. Identify **non-estimable tasks**:
   - `stage_relative` rules (depend on dynamic stage timing)
   - `missing_anchor` (LOO or start date not provided)
   - `no_due_date` (invalid rule configuration)
3. Calculate offsets from baseline (earliest anchor)
4. Aggregate by phase and stage

### Output Structure
```typescript
interface TemplateEstimationResult {
  templateId: string;
  taskCount: number;
  anchors: { loo: string | null; start: string | null };
  baselineDate: string | null;
  lastDueDate: string | null;
  totalCalendarDays: number;
  totalBusinessDays: number | null;
  nonEstimable: NonEstimableTask[];
  perPhase: PhaseSummary[];
  perStage: StageSummary[];
}
```

---

## Stage Advancement Logic

The `advanceStageIfComplete` function handles automatic stage progression:

### Rules
1. **Only candidates with applied templates** can auto-advance
2. **Template-specific stage ordering** is used (not global `hiring_stages.orderIndex`)
3. Advancement happens when **all required tasks** in current stage are `done` or `canceled`
4. System can advance through **multiple stages** in one operation (loop advance)

### Blocking Logic
- If a task in a **prior stage** is reopened:
  - `isBlockedByPriorStage = true` is set on candidate
  - Optional `auto_regress_on_prior_open` setting can regress stage

### History Tracking
- Each stage transition creates a `candidate_stage_history` record
- Multiple hops create multiple records with incrementing timestamps

---

## Business Rules & Constraints

### Template Readiness
A template can only be activated if:
1. Has at least **one active stage**
2. (Originally) Each stage has at least **one non-archived task** (relaxed in later updates)

### Stage-First, Then Tasks
- Cannot add a task unless the stage already exists on the template
- Removing the last task from a stage **auto-removes** the stage (trigger-based)
- UI enforces this by requiring task selection when adding a stage

### Template Independence
- Once applied, the candidate's stages/tasks are **snapshots** (immutable copies)
- Editing the master template does **not** affect existing candidates
- Stored as `templateNameSnapshot`, `stage_name_snapshot` in candidate tables

---

## UI Components (Template Detail Page)

The template detail page (`/templates/[id]/page.tsx`) includes:

1. **Template Info Card** - Name (editable), candidate type, description
2. **Pipeline Estimate Section** - Interactive date inputs, duration calculations
3. **Template Stages Card** - Ordered list with drag-reorder, phase labels
4. **Template Tasks Table** - Task definitions, stages, due rules, priorities, assignees

### Add Stage Form
- Stage selection (excludes already-added stages)
- Phase toggle (Pre-hire / Onboarding)
- Multi-select task definitions
- Shared due rule defaults for batch task creation

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/schemas/template.schema.ts` | Template, TemplateStage, TemplateTask schemas |
| `shared/schemas/task.enums.ts` | Due rule type enum |
| `server/services/templates/template.service.ts` | Template CRUD operations |
| `server/services/templates/template-expansion.service.ts` | Apply template to candidate |
| `server/services/templates/template-estimation.service.ts` | Pipeline duration calculation |
| `server/features/tasks/services/advance-stage.service.ts` | Stage advancement logic |
| `server/utils/date.utils.ts` | Anchor resolution and due date computation |
| `client/src/app/(dashboard)/templates/[id]/page.tsx` | Template detail UI |
