# TODO Comments Tracking

**Last Updated:** 2025-01-15
**Status:** Active tracking document for technical debt

---

## Overview

This document tracks all TODO comments in the codebase. TODOs are categorized by priority and status.

---

## Completed / Removed TODOs

These TODOs have been addressed and the comments have been removed from the codebase:

| File | Original TODO | Resolution |
|------|---------------|------------|
| `template.service.ts:164` | "Implement template application logic" | Method removed - implemented in `TemplateExpansionService.expandTemplate()` |
| `template.service.ts:190-196` | "Get actual count" / "Return actual count" | Deprecated `applyTemplate` method removed; actual implementation in expansion service |
| `candidate.service.ts:118` | "Implement template application logic" | Updated comment - handled via routes using `templateExpansionService.expandTemplate()` |
| `candidate.service.ts:178,182` | "Get stage name from repository" | Fixed - stage name now fetched from `stageRepo.getCandidateTemplateStageById()` |
| `candidate.service.ts:306` | "Publish candidateArchived event" | Fixed - event now published using `candidateArchived()` factory |
| `candidate.service.ts:328` | "Publish candidateFollowed event" | Fixed - event now published using `candidateFollowed()` factory |
| `candidate.service.ts:347` | "Publish candidateUnfollowed event" | Fixed - event now published using `candidateUnfollowed()` factory |
| `task.service.ts:254` | "Publish taskDeleted event" | Fixed - event now published using `taskDeleted()` factory |
| `notification-handler.ts:105` | "Also notify followers (requires follower query)" | Fixed - followers notified using `candidateService.getFollowers()` |
| `notification-handler.ts:263` | "Also notify followers" | Fixed - followers notified using `candidateService.getFollowers()` |

---

## Remaining TODOs

### P2 - Medium Priority (This Month)

#### 1. Add Check for Stages in Use
**File:** [server/services/reference/reference-data.service.ts](../server/services/reference/reference-data.service.ts) (Line 140)
**TODO:** `// TODO: Add check for stages in use`
**Context:** The `deleteHiringStage` method should verify the stage isn't referenced by templates or candidates before deletion.
**Effort:** Medium
**Impact:** Data integrity - prevents orphaned references

#### 2. Add Check for Definitions in Use
**File:** [server/services/reference/reference-data.service.ts](../server/services/reference/reference-data.service.ts) (Line 188)
**TODO:** `// TODO: Add check for definitions in use`
**Context:** The `archiveTaskDefinition` method should verify the definition isn't used by template tasks before archiving.
**Effort:** Medium
**Impact:** Data integrity - prevents issues with templates using archived definitions

#### 3. Publish templateArchived Event
**File:** [server/services/templates/template.service.ts](../server/services/templates/template.service.ts)
**Note:** Comment updated to reference tracking doc. Event type needs to be created.
**Context:** Requires creating `TemplateArchivedEvent` type and factory function first.
**Effort:** Low
**Dependencies:** Create event type and factory
**Impact:** Enables future notification/audit integrations for template archival

#### 4. Publish taskArchived Event
**File:** [server/services/tasks/task.service.ts](../server/services/tasks/task.service.ts)
**Note:** Comment updated to reference tracking doc. Event type needs to be created.
**Context:** Requires creating `TaskArchivedEvent` type and factory function first.
**Effort:** Low
**Dependencies:** Create event type and factory
**Impact:** Enables future notification/audit integrations for task archival

### P3 - Low Priority (Backlog)

#### 5. Determine Actual Phase from Current Stage
**File:** [server/utils/hiring-phase.utils.ts](../server/utils/hiring-phase.utils.ts) (Line 131)
**TODO:** `// TODO: Could determine actual phase (pre_hire vs onboarding) from current stage`
**Context:** Enhancement to determine phase from template stage's `phase` field rather than defaulting to `pre_hire`.
**Effort:** Low
**Impact:** More accurate phase display - nice to have

---

## Creating New Event Types

For items #3 and #4, the following patterns should be followed:

### TemplateArchivedEvent (to be created)

```typescript
// In event-types.ts
export interface TemplateArchivedEvent extends DomainEvent {
  type: "template.archived";
  aggregateType: "template";
  payload: {
    templateId: string;
    templateName: string;
  };
}

// In event-factory.ts
export function templateArchived(
  templateId: string,
  payload: { templateName: string },
  context?: EventContext
): TemplateArchivedEvent {
  return createBaseEvent<TemplateArchivedEvent>(
    "template.archived",
    templateId,
    "template",
    { templateId, ...payload },
    context
  );
}
```

### TaskArchivedEvent (to be created)

```typescript
// In event-types.ts
export interface TaskArchivedEvent extends DomainEvent {
  type: "task.archived";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    taskTitle: string;
  };
}

// In event-factory.ts
export function taskArchived(
  taskId: string,
  payload: { candidateId: string; taskTitle: string },
  context?: EventContext
): TaskArchivedEvent {
  return createBaseEvent<TaskArchivedEvent>(
    "task.archived",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}
```

---

## Progress History

| Date | Action |
|------|--------|
| 2025-01-15 | Initial TODO audit; removed/fixed 10 completed TODOs; documented 5 remaining |
