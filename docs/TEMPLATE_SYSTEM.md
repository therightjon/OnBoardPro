# Template System Business Logic Analysis

## Overview

Your OnBoardPro template system provides a flexible, reusable workflow definition layer for hiring and onboarding processes. Templates define stages and tasks that get applied to candidates, creating a structured pipeline with automatic task generation and intelligent due date calculation.

---

## Core Concepts

### 1. Three-Tier Structure

```
Template (Reusable Definition)
  └─ Template Stages (Ordered hiring stages)
      └─ Template Tasks (Tasks to create at each stage)

When Applied →

Candidate (Individual)
  ├─ Candidate Template Stages (Immutable snapshot)
  └─ Candidate Tasks (Concrete work items with due dates)
```

### 2. Key Design Principles

- **Templates are immutable after application** - Once a template is applied to a candidate, the original template can be modified without affecting existing candidates
- **Snapshots preserve structure** - Stage names and template names are captured at application time
- **Deferred application** - Templates can be "selected" at candidate creation but tasks aren't created until LOO is accepted
- **Flexible due dates** - Tasks can be due relative to key hiring milestones (LOO date, start date) or fixed dates
- **Role-based assignment** - Tasks can be assigned to specific users or roles (including "candidate.self")

---

## Database Schema

### Templates Table
- **Purpose**: Define reusable hiring workflows
- **Key Fields**:
  - `name` - Unique (case-insensitive)
  - `candidateTypeId` - Restricts which candidate types can use this template
  - `isActive` - Controls whether template can be applied to new candidates
  - `archived` - Soft delete flag

### Template Stages Table
- **Purpose**: Organize work into sequential stages within a template
- **Key Fields**:
  - `templateId` - Parent template (CASCADE delete)
  - `stageId` - References `hiringStages` table
  - `orderIndex` - Defines progression sequence (1, 2, 3...)
  - `phase` - 'pre_hire' or 'onboarding'
  - `isActive` - Individual stage toggle

### Template Tasks Table
- **Purpose**: Define tasks that should be created at each stage
- **Key Fields**:
  - `templateId` - Parent template
  - `templateStageId` - Which stage this task belongs to (CASCADE delete)
  - `taskDefId` - References task definition (name, description)
  - **Due Date Configuration**:
    - `dueRuleType` - How due date is calculated (9 rule types)
    - `dueRuleValue` - Days offset for relative rules
    - `fixedDate` - Absolute date for fixed_date rule
  - **Default Assignee**:
    - `defaultAssigneeKind` - 'user' or 'role'
    - `defaultAssigneeUserId` - Specific user if kind='user'
    - `defaultAssigneeRole` - Role name (e.g., 'candidate.self') if kind='role'
  - **Task Defaults**:
    - `defaultPriorityId` - Initial priority
    - `defaultCategoryId` - Task category

---

## Due Date Rules System

One of the most sophisticated aspects of your template system is the flexible due date calculation:

### Rule Types

1. **LOO-Based Rules**
   - `on_loo_date` - Due on Letter of Offer date
   - `days_before_loo` - X days before LOO (e.g., -5 days)
   - `days_after_loo` - X days after LOO (e.g., +3 days)

2. **Start Date-Based Rules**
   - `on_start_date` - Due on anticipated start date
   - `days_before_start` - X days before start
   - `days_after_start` - X days after start

3. **Stage-Based Rules**
   - `days_before_stage` - X days before stage begins
   - `days_after_stage` - X days after stage begins
   - ⚠️ These are NOT estimable (requires actual stage transition date)

4. **Fixed Rules**
   - `fixed_date` - Absolute date regardless of candidate dates

### Anchor Resolution

When a template is applied to a candidate:

1. **LOO Anchor** - Resolves in priority order:
   - `offerLetterAcceptedAt` (preferred)
   - `offerLetterIssuedAt` (fallback)
   - `null` (if neither set)

2. **Start Anchor** - Uses `anticipatedStartDate`

3. **Due Date Calculation**:
   - Applies rule + offset to anchor
   - If anchor is missing, task marked as `pendingAnchor: true`
   - Tasks with pending anchors show "Pending date" in UI

---

## Template Lifecycle

### 1. Creation Phase

**API**: `POST /api/templates`

- Template created in "Draft" status (`isActive: false`)
- Must specify `name`, `candidateTypeId`
- Can optionally clone from existing template via `cloneFromTemplateId`
- Cloned templates copy all stages and tasks but start inactive

### 2. Building Phase

**Adding Stages**: `POST /api/templates/:id/template-stages`
- Select a hiring stage
- Assign phase ('pre_hire' or 'onboarding')
- Stage gets next available `orderIndex`

**Adding Tasks**: `POST /api/templates/:id/template-tasks`
- Select task definition
- Choose which stage this task belongs to
- Configure due date rule
- Set default assignee (user or role)
- Set priority and category

**Reordering Stages**: `PATCH /api/templates/:id/stages/reorder`
- Drag-and-drop interface
- Sends `stageIdsInOrder` array
- Atomically updates all `orderIndex` values

### 3. Validation Phase

**Readiness Check**: `GET /api/templates/:id/readiness`

Template must meet these requirements to activate:
- ✅ At least 1 stage exists
- ✅ Each active stage has at least 1 active task
- ✅ All tasks have required fields filled:
  - If using relative rules → `dueRuleValue` must be set
  - If using `fixed_date` → `fixedDate` must be set
  - If `defaultAssigneeKind='user'` → `defaultAssigneeUserId` must be set
  - If `defaultAssigneeKind='role'` → `defaultAssigneeRole` must be set

### 4. Activation Phase

**API**: `PATCH /api/templates/:id/status` (body: `{ status: 'active' }`)

- Runs validation via `checkTemplateReadiness()`
- If validation fails, returns 400 with reason
- If successful, sets `isActive: true`
- Publishes `templateUpdated` event
- Template now available for candidate assignment

### 5. Usage Phase

Templates can be applied to candidates in two ways:

**A. During Candidate Creation**
```
POST /api/candidates
{
  firstName: "Jane",
  lastName: "Doe",
  templateId: "uuid",
  offerLetterAcceptedAt: "2024-01-15"  // If set, auto-applies immediately
}
```

**B. Manual Application**
```
POST /api/candidates/:candidateId/apply-template
{
  template_id: "uuid"
}
```

### 6. Application Process (Template Expansion)

When a template is applied, the `TemplateExpansionService` orchestrates a 7-phase process:

**Phase 1: Validation**
- Candidate exists and has no prior template
- No existing tasks for candidate
- Template exists and is active

**Phase 2: Data Retrieval**
- Fetch all template stages and tasks
- Load task definitions
- Get task categories for fallbacks

**Phase 3: Anchor Resolution**
- Resolve LOO date (accepted > issued > null)
- Resolve anticipated start date
- These power due date calculations

**Phase 4: Task Creation**
- For each template task:
  - Compute actual due date using `computeDueFromRule()`
  - Resolve assignee (handles "candidate.self" role → linked user)
  - Create `candidateTasks` record with all metadata
- Bulk insert all tasks

**Phase 5: Stage Snapshot**
- Create `candidateTemplateStages` records
- Capture immutable snapshots of stage names and order
- Update tasks with `stageOrderIndex` for sorting

**Phase 6: Candidate Update**
- Set `templateAppliedFromId` and `templateAppliedAt`
- Set `templateLocked = true` (prevents template changes)
- Snapshot template name and version
- Set `currentStageId` to first template stage

**Phase 7: History Recording**
- Record initial stage transition in `candidateStageHistory`
- Tracks who applied template and when

---

## Two-Phase Application Pattern

Your system supports a clever deferred application pattern:

### Phase 1: Template Selection (at candidate creation)
- User selects template in "New Candidate" dialog
- Candidate created with:
  - `templateAppliedFromId` = template UUID ✅ (selected)
  - `templateAppliedAt` = null ❌ (not yet applied)
  - `templateLocked` = true 🔒 (can't change selection)

### Phase 2: Deferred Application (when LOO accepted)
- When `offerLetterAcceptedAt` is set (via candidate edit)
- System detects change via `shouldAutoApplyTemplate()` check
- Automatically calls `TemplateExpansionService.expandTemplate()`
- Creates all tasks, snapshots stages, records history
- Sets `templateAppliedAt` = now() ✅ (marked as applied)

**Why This Pattern?**
- Tasks can have more accurate due dates if LOO date is known
- Prevents creating tasks with pending anchors
- Allows candidate record to exist before full workflow begins

---

## Frontend Workflows

### Template Editor (`/templates/:id`)

**UI Sections**:

1. **Template Info**
   - Edit name, description
   - View candidate type, dates
   - Status control (Draft → Active → Archived)

2. **Stages Section**
   - Drag-and-drop reordering (via `@dnd-kit/core`)
   - Phase grouping (Pre Hire vs Onboarding)
   - Stage index badges (1, 2, 3...)
   - Remove button (soft delete)

3. **Tasks Section**
   - Table listing all template tasks
   - Columns: Task name, Stage, Due rule, Assignee, Priority
   - Add/Edit/Delete task dialogs

4. **Add Task Dialog**
   - Task definition selector
   - Stage selector (filtered to active stages)
   - Due date rule picker with conditional fields:
     - If relative rule → show days offset input
     - If fixed_date → show date picker
   - Assignee selector (user or candidate.self)
   - Priority and category dropdowns

### Candidate Creation Dialog

**Template Application Flow**:

1. User selects template (filtered by candidate type, active only)
2. **Due Date Preview Section**:
   - Fetches template tasks
   - Calculates preview due dates based on entered LOO/start dates
   - Updates reactively as user changes dates
   - Shows task name, stage, due date, priority
3. User creates candidate
4. If LOO accepted date filled → template auto-applies immediately
5. Otherwise → template selected but deferred

---

## Estimation System

### Template Estimation API
**Endpoint**: `GET /api/templates/:id/estimate`

**Query Params**:
- `looDate` - Override LOO date for calculation
- `startDate` - Override start date for calculation
- `businessDays` - Set to 'true' to include business day calculations

**Returns**:
```json
{
  "totalCalendarDays": 45,
  "totalBusinessDays": 32,
  "perPhase": {
    "pre_hire": { "latestOffsetDays": 10, "taskCount": 5 },
    "onboarding": { "latestOffsetDays": 35, "taskCount": 12 }
  },
  "perStage": [
    { "stageName": "Application", "latestOffsetDays": 5, "taskCount": 3 },
    { "stageName": "Interview", "latestOffsetDays": 10, "taskCount": 2 }
  ],
  "nonEstimable": [
    { "taskName": "Schedule meeting", "reason": "uses_stage_relative_rule" }
  ]
}
```

**Non-Estimable Tasks**:
- Tasks with missing anchors (no LOO or start date)
- Tasks using stage-relative rules (`days_before_stage`, `days_after_stage`)
- Tasks with no due date configured

---

## Key Business Rules

### Template Readiness Validation
✅ **Ready to Activate** if:
- Template has at least 1 stage
- Each active stage has at least 1 active task
- All required fields filled based on configuration:
  - Relative rules → `dueRuleValue` set
  - Fixed date → `fixedDate` set
  - User assignee → `defaultAssigneeUserId` set
  - Role assignee → `defaultAssigneeRole` set

### Template Locking
🔒 **Immutability Rules**:
- Once template applied to candidate → `templateLocked = true`
- Template modifications don't affect existing candidates
- Candidate sees snapshot of template at application time
- Template name preserved in `templateNameSnapshot`
- Stage names preserved in `candidateTemplateStages.stageNameSnapshot`

### Cascade Deletions
When deleting:
- Template → All template stages and tasks deleted (CASCADE)
- Template Stage → All template tasks for that stage deleted (CASCADE)
- Does NOT affect candidates (they have snapshots)

### Auto-Resolution
When creating/updating template tasks:
- If `templateStageId` not provided, auto-resolves by looking up active template stage for that template+stage combo
- If `stageId` changes on update, auto-resolves new `templateStageId`
- Throws error if template stage doesn't exist

---

## Authorization & Audit

### Permissions
- **View Templates**: HR staff, system admin
- **Create/Edit Templates**: HR staff, system admin
- **Apply Template**: HR staff, department admin, system admin
- **Activate/Deactivate**: HR staff, system admin

### Events Published
- `templateCreated` - Template first created
- `templateCloned` - Template cloned from another
- `templateUpdated` - Template modified
- `templateApplied` - Template applied to candidate
- `taskCreated` - For each task created from template expansion

### Audit Logging
All template operations logged to `activityLog` with:
- Actor (who made the change)
- Action type
- Metadata (template ID, name, clone source, etc.)
- Timestamp

---

## Common Use Cases

### Use Case 1: Creating a New Hire Template
1. Navigate to `/templates`
2. Click "New Template"
3. Name it "Software Engineer Onboarding"
4. Select candidate type "Full-Time"
5. Add stages: Application → Interview → Offer → Pre-Start → First Day → First Week → First Month
6. For each stage, add tasks with appropriate due rules:
   - "Background Check" → due 5 days after LOO accepted
   - "IT Setup" → due 2 days before start date
   - "Manager 1:1" → due on start date
7. Assign tasks to appropriate roles
8. Activate template
9. Now available for all Software Engineer candidates

### Use Case 2: Applying Template to New Candidate
1. Click "New Candidate"
2. Fill in candidate info (name, email, etc.)
3. Enter LOO accepted date (e.g., "2024-02-01")
4. Enter anticipated start date (e.g., "2024-03-01")
5. Select "Software Engineer Onboarding" template
6. **Preview section shows**:
   - "Background Check" → due 2024-02-06 (5 days after LOO)
   - "IT Setup" → due 2024-02-27 (2 days before start)
   - "Manager 1:1" → due 2024-03-01 (on start date)
7. Create candidate → template expands immediately
8. All 15 tasks created with computed due dates
9. Candidate placed in first stage ("Application")

### Use Case 3: Deferred Template Application
1. Create candidate without LOO accepted date
2. Select template in creation dialog
3. Candidate created with template "selected" but not applied
4. Later, hiring manager accepts offer
5. Edit candidate → set `offerLetterAcceptedAt`
6. On save, system detects template should apply
7. Template expands automatically
8. Success notification: "Template applied, 15 tasks created"

### Use Case 4: Estimating Template Timeline
1. Open template editor
2. Click "Estimate" button
3. Enter sample dates (LOO: 2024-02-01, Start: 2024-03-01)
4. System calculates:
   - Total duration: 45 calendar days
   - Pre-hire phase: 10 days (5 tasks)
   - Onboarding phase: 35 days (12 tasks)
5. Shows non-estimable tasks: "Schedule meeting" (stage-relative rule)
6. Use this to optimize task timing

---

## Technical Implementation Details

### Key Files

**Backend Services**:
- `server/services/templates/template.service.ts` - Template CRUD & status management (321 lines)
- `server/services/templates/template-expansion.service.ts` - Template → candidate task expansion (210+ lines)
- `server/services/templates/template-estimation.service.ts` - Timeline calculations

**Backend Routes**:
- `server/routes/templates.routes.ts` - Template API endpoints
- `server/routes/candidates.routes.ts` - Candidate creation & template application

**Frontend Components**:
- `client/src/app/(dashboard)/templates/page.tsx` - Template list
- `client/src/app/(dashboard)/templates/[id]/page.tsx` - Template editor
- `client/src/features/templates/components/TemplateStagesList.tsx` - Drag-and-drop stages
- `client/src/features/candidates/components/new-candidate-dialog.tsx` - Candidate creation

**Utilities**:
- `shared/utils/date.utils.ts` - `computeDueFromRule()`, anchor resolution

### Database Indexes

- `templates_name_unique` - Case-insensitive unique on `lower(name)`
- `uniq_candidate_stage` - One entry per candidate-stage pair
- `idx_candidate_stage_order` - Ensures consistent stage ordering

---

## Questions You Might Have

Now that I've analyzed the template system, I'm ready to answer any questions you have about:

- Business logic and workflows
- Due date calculation rules
- Template application patterns
- Database schema and relationships
- Frontend/backend implementation
- Edge cases and validation rules
- Optimization opportunities
- Feature enhancements

What would you like to know?
