# Due Rules & Template System Tutorial

**A Hands-On Guide to Building Automated Onboarding Workflows**

---

## What You'll Learn

By the end of this tutorial, you will be able to:

- ✅ Understand the template system architecture and its three-tier structure
- ✅ Create templates with stages, tasks, and due date rules
- ✅ Configure all 18 due date rule types correctly
- ✅ Set up prerequisite tasks that trigger before the main workflow
- ✅ Apply templates to candidates with automatic task generation
- ✅ Troubleshoot common issues with pending anchors and missing dates
- ✅ Use template estimation for timeline planning

---

## Prerequisites

Before starting this tutorial, you should:

- Have the OnBoardPro development environment running (`npm run dev`)
- Understand basic concepts: candidates, tasks, and stages
- Have access to an HR Staff or System Admin account

**Time Estimate:** 45-60 minutes

---

## Part 1: Understanding the Template System

### 1.1 The Three-Tier Structure

The template system uses a hierarchical model that separates reusable definitions from concrete work items:

```
┌─────────────────────────────────────────────────────────────┐
│  TEMPLATE (Reusable Definition)                             │
│  "Software Engineer Onboarding"                             │
│                                                              │
│  ├── Template Stage: "Application" (orderIndex: 1)         │
│  │   └── Template Task: "Background Check"                  │
│  │       └── Due: 5 days after LOO                         │
│  │                                                          │
│  ├── Template Stage: "Pre-Start" (orderIndex: 2)           │
│  │   └── Template Task: "IT Setup Request"                  │
│  │       └── Due: 2 days before start                      │
│  │                                                          │
│  └── Template Stage: "First Day" (orderIndex: 3)           │
│      └── Template Task: "Orientation Meeting"               │
│          └── Due: on start date                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Apply to Candidate
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  CANDIDATE: "Jane Doe"                                      │
│  LOO Accepted: Feb 1, 2024 | Start Date: Mar 1, 2024       │
│                                                              │
│  ├── Candidate Task: "Background Check"                     │
│  │   └── Due: Feb 6, 2024 ✓                                │
│  │                                                          │
│  ├── Candidate Task: "IT Setup Request"                     │
│  │   └── Due: Feb 27, 2024 ✓                               │
│  │                                                          │
│  └── Candidate Task: "Orientation Meeting"                  │
│      └── Due: Mar 1, 2024 ✓                                │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight:** When a template is applied, it creates a **snapshot**. Modifying the original template does NOT affect candidates who already had it applied.

### 1.2 Core Design Principles

| Principle | Description |
|-----------|-------------|
| **Immutability** | Once applied, the template snapshot is frozen for that candidate |
| **Flexible Due Dates** | Tasks can be due relative to multiple anchor dates |
| **Role-Based Assignment** | Tasks can auto-assign to specific users or roles like `candidate.self` |
| **Deferred Application** | Templates can be selected at creation but applied later |
| **Phase Separation** | Stages can be grouped into "pre_hire" and "onboarding" phases |

---

## Part 2: The Due Date Rules System

### 2.1 Understanding Anchor Dates

Due date rules calculate task deadlines relative to **anchor dates**. OnBoardPro supports five anchor types:

| Anchor | Field | Description |
|--------|-------|-------------|
| **LOI** | `letterOfIntentDate` | Letter of Intent date (prerequisite tasks only) |
| **LOO** | `offerLetterAcceptedAt` → `offerLetterIssuedAt` | Letter of Offer with fallback logic |
| **LOO Issued** | `offerLetterIssuedAt` | Explicit issued date (no fallback) |
| **LOO Accepted** | `offerLetterAcceptedAt` | Explicit accepted date (no fallback) |
| **Start** | `anticipatedStartDate` | Candidate's expected start date |

**Resolution Priority for Generic LOO Rules:**
```typescript
loo = offerLetterAcceptedAt ?? offerLetterIssuedAt ?? null
```

### 2.2 The 18 Due Date Rule Types

Due date rules are defined in [shared/schemas/task.enums.ts](../shared/schemas/task.enums.ts):

#### LOI-Based Rules (Prerequisite Tasks Only)

| Rule Type | Calculation | Example |
|-----------|-------------|---------|
| `on_loi_date` | LOI date + 0 days | Due on LOI date |
| `days_before_loi` | LOI date - N days | 5 days before LOI → Due 5 days early |
| `days_after_loi` | LOI date + N days | 30 days after LOI → Due in 30 days |

> ⚠️ **Important:** LOI-based rules can ONLY be used with prerequisite tasks. The system enforces this with validation.

#### LOO-Based Rules (Generic with Fallback)

| Rule Type | Calculation | Example |
|-----------|-------------|---------|
| `on_loo_date` | LOO date + 0 days | Due on offer acceptance |
| `days_before_loo` | LOO date - N days | Background check due 3 days before |
| `days_after_loo` | LOO date + N days | Welcome email 1 day after |

#### LOO-Based Rules (Explicit Accepted)

| Rule Type | Calculation | Use Case |
|-----------|-------------|----------|
| `on_loo_accepted_date` | Accepted date + 0 | When timing must be from acceptance |
| `days_before_loo_accepted` | Accepted - N days | Pre-acceptance prep |
| `days_after_loo_accepted` | Accepted + N days | Post-acceptance tasks |

#### LOO-Based Rules (Explicit Issued)

| Rule Type | Calculation | Use Case |
|-----------|-------------|----------|
| `on_loo_issued_date` | Issued date + 0 | Tasks tied to offer issuance |
| `days_before_loo_issued` | Issued - N days | Pre-issue preparation |
| `days_after_loo_issued` | Issued + N days | Post-issue follow-up |

#### Start Date-Based Rules

| Rule Type | Calculation | Example |
|-----------|-------------|---------|
| `on_start_date` | Start date + 0 days | First day orientation |
| `days_before_start` | Start date - N days | IT setup 5 days before |
| `days_after_start` | Start date + N days | 30-day check-in |

#### Stage-Relative Rules

| Rule Type | Calculation | Note |
|-----------|-------------|------|
| `days_before_stage` | Stage entry - N days | ⚠️ Non-estimable |
| `days_after_stage` | Stage entry + N days | ⚠️ Non-estimable |

> ⚠️ **Warning:** Stage-relative rules cannot be pre-calculated because they depend on when the candidate actually enters that stage. These tasks show "Pending date" until the stage transition occurs.

#### Fixed Date Rule

| Rule Type | Calculation | Example |
|-----------|-------------|---------|
| `fixed_date` | Specific date | Training on March 15, 2024 |

---

## Part 3: Hands-On Exercise - Creating Your First Template

### 3.1 Setting Up the Template

**Step 1: Create a New Template**

Navigate to `/templates` and click "New Template". Fill in:

```
Name: Developer Onboarding
Candidate Type: Full-Time Employee
Description: Standard onboarding for software developers
```

Your template starts in **Draft** status.

**Step 2: Add Stages**

Add three stages in this order:

| Stage | Phase | Order |
|-------|-------|-------|
| Offer Review | pre_hire | 1 |
| Pre-Start Setup | pre_hire | 2 |
| First Week | onboarding | 3 |

### 3.2 Adding Tasks with Due Rules

Now add tasks to each stage. This is where due rules become important.

**Offer Review Stage Tasks:**

```
Task 1: Send Welcome Email
├── Due Rule: on_loo_date
├── Days Value: (not needed)
├── Assignee: HR Staff (role)
└── Priority: High

Task 2: Complete Background Check
├── Due Rule: days_after_loo
├── Days Value: 5
├── Assignee: HR Staff (role)
└── Priority: Critical
```

**Pre-Start Setup Stage Tasks:**

```
Task 3: Request IT Equipment
├── Due Rule: days_before_start
├── Days Value: 10
├── Assignee: Manager (role)
└── Priority: High

Task 4: Prepare Workstation
├── Due Rule: days_before_start
├── Days Value: 2
├── Assignee: IT Support (user)
└── Priority: Medium
```

**First Week Stage Tasks:**

```
Task 5: Complete Orientation
├── Due Rule: on_start_date
├── Days Value: (not needed)
├── Assignee: candidate.self (role)
└── Priority: High

Task 6: First Week Check-in
├── Due Rule: days_after_start
├── Days Value: 5
├── Assignee: Manager (role)
└── Priority: Medium
```

### 3.3 Understanding the Code Behind Due Rules

The due date calculation happens in [server/utils/date.utils.ts](../server/utils/date.utils.ts). Here's the core function:

```typescript
export function computeDueFromRule(
  ruleType: string | null | undefined,
  ruleValue: number | null | undefined,
  fixedDate: Date | string | null | undefined,
  anchors: AnchorDates
): DueComputationResult {
  const applyAnchor = (anchorKey: AnchorKey, offsetDays: number): DueComputationResult => {
    const anchor = anchors[anchorKey];
    if (!anchor) {
      // Missing anchor = task is pending
      return { dueAt: null, pendingAnchor: true, missingAnchor: anchorKey };
    }
    return { dueAt: addDays(anchor, offsetDays), pendingAnchor: false, anchorType: anchorKey };
  };

  switch (ruleType) {
    case "on_loo_date":
      return applyAnchor("loo", 0);
    case "days_before_loo":
      return applyAnchor("loo", -1 * (ruleValue ?? 0));
    case "days_after_loo":
      return applyAnchor("loo", ruleValue ?? 0);
    case "on_start_date":
      return applyAnchor("start", 0);
    case "days_before_start":
      return applyAnchor("start", -1 * (ruleValue ?? 0));
    case "days_after_start":
      return applyAnchor("start", ruleValue ?? 0);
    case "fixed_date": {
      const date = ensureDate(fixedDate);
      if (!date) {
        return { dueAt: null, pendingAnchor: true };
      }
      return { dueAt: date, pendingAnchor: false };
    }
    // ... more cases
    default:
      return { dueAt: null, pendingAnchor: false };
  }
}
```

**Key Insight:** When an anchor is missing, the function returns `pendingAnchor: true` instead of throwing an error. This allows tasks to be created even before all dates are known.

---

## Part 4: Prerequisite Tasks

### 4.1 What Are Prerequisites?

Prerequisite tasks are special template tasks that:

1. **Expand immediately** when a candidate is created (not when LOO is accepted)
2. **Use LOI date** as their anchor (not LOO date)
3. **Are conditional** based on candidate attributes
4. **Are separate** from the main template expansion

### 4.2 Use Case Example

For Associate Professor positions, a Promotion & Tenure (P&T) approval must happen BEFORE the Letter of Offer can be issued. Since P&T takes ~30 days:

```
┌─────────────────────────────────────────────────────────────┐
│  Timeline for Associate Professor Hiring                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Day 0: LOI Date (Letter of Intent)                        │
│    └── Prerequisite tasks created immediately               │
│        ├── "Initiate P&T Review" (due: on LOI)             │
│        └── "Complete P&T Approval" (due: 30 days after LOI)│
│                                                              │
│  Day 30-35: LOO Issued (after P&T approval)                 │
│                                                              │
│  Day 35-40: LOO Accepted                                    │
│    └── Main template tasks created                          │
│        ├── "Background Check" (due: 5 days after LOO)      │
│        └── ... other onboarding tasks                       │
│                                                              │
│  Day 60+: Start Date                                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Configuring Prerequisite Tasks

When adding a template task, check the "Prerequisite" checkbox. You'll need to:

1. **Select a prerequisite condition:**
   - `requires_pt` - Associate Professor or higher positions
   - `always` - Apply prerequisites for all candidates using this template

2. **Use LOI-based due rules:**
   - `on_loi_date`
   - `days_before_loi`
   - `days_after_loi`

```typescript
// Validation enforces this rule:
if (data.isPrerequisite && !loiRules.includes(data.dueRuleType)) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Prerequisite tasks must use Letter of Intent (LOI) based due rules",
    path: ["dueRuleType"],
  });
}
```

### 4.4 How Prerequisites Expand

When a candidate is created with a template that has prerequisites:

1. System checks if any prerequisite conditions are met
2. For each matching prerequisite task:
   - Resolves LOI anchor from candidate's `letterOfIntentDate`
   - Computes due date using LOI-based rule
   - Creates candidate task with `isPrerequisiteTask: true`
3. Sets `templatePrerequisitesExpandedAt` timestamp on candidate

```typescript
// In template-expansion.service.ts
const anchors: AnchorDates = {
  loi: resolveLoiAnchor(candidate), // Available for prerequisites
  loo: null, // Not available yet
  start: null, // Not available yet
};
```

---

## Part 5: Template Application Workflow

### 5.1 The Seven-Phase Expansion Process

When you apply a template to a candidate, the `TemplateExpansionService` orchestrates:

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: VALIDATION                                        │
│  ├── Candidate exists?                                      │
│  ├── No existing template applied?                          │
│  ├── No existing tasks?                                     │
│  └── Template active?                                       │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: DATA RETRIEVAL                                    │
│  ├── Fetch all template stages                              │
│  ├── Fetch all template tasks                               │
│  └── Load task definitions & categories                     │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: ANCHOR RESOLUTION                                 │
│  ├── Resolve LOO anchor (accepted → issued fallback)       │
│  └── Resolve start date anchor                              │
├─────────────────────────────────────────────────────────────┤
│  Phase 4: TASK CREATION                                     │
│  ├── For each template task:                                │
│  │   ├── Compute due date via computeDueFromRule()         │
│  │   ├── Resolve assignee (handle candidate.self)          │
│  │   └── Create InsertCandidateTask payload                │
│  └── Bulk insert all tasks                                  │
├─────────────────────────────────────────────────────────────┤
│  Phase 5: STAGE SNAPSHOT                                    │
│  ├── Create candidate_template_stages records               │
│  └── Update tasks with stage_order_index                    │
├─────────────────────────────────────────────────────────────┤
│  Phase 6: CANDIDATE UPDATE                                  │
│  ├── Set templateAppliedFromId                              │
│  ├── Set templateAppliedAt = now()                          │
│  ├── Set templateLocked = true                              │
│  └── Set currentStageId to first stage                      │
├─────────────────────────────────────────────────────────────┤
│  Phase 7: HISTORY RECORDING                                 │
│  └── Record initial stage transition                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Two-Phase Application Pattern

OnBoardPro supports **deferred template application**:

**Phase A: Template Selection (at candidate creation)**
```typescript
// Candidate created with:
{
  templateAppliedFromId: "uuid",  // ✅ Template selected
  templateAppliedAt: null,        // ❌ Not yet applied
  templateLocked: true            // 🔒 Can't change selection
}
```

**Phase B: Automatic Application (when LOO accepted)**
```typescript
// When offerLetterAcceptedAt is set:
// System detects change, auto-applies template
{
  templateAppliedFromId: "uuid",
  templateAppliedAt: new Date(),  // ✅ Now applied
  templateLocked: true
}
```

**Why This Pattern?**
- Tasks have accurate due dates when LOO date is known
- Avoids creating many tasks with "Pending date"
- Allows candidate record to exist before full workflow begins

---

## Part 6: Handling Pending Anchors

### 6.1 What Causes Pending Anchors?

When a due date rule references an anchor that doesn't exist yet:

```typescript
// Candidate has no start date set
const anchors = {
  loo: new Date("2024-02-01"),
  start: null  // Missing!
};

// Task with days_before_start rule
const result = computeDueFromRule("days_before_start", 5, null, anchors);
// Result: { dueAt: null, pendingAnchor: true, missingAnchor: "start" }
```

### 6.2 UI Display

Tasks with pending anchors show:
- "Pending date" instead of a due date
- Visual indicator that the task is waiting for information

### 6.3 Automatic Resolution

When the missing date is added to the candidate, the `TaskDueDateService` automatically recalculates all pending due dates:

```typescript
// In task-due-date.service.ts
async recomputeCandidateDueDates(candidateId: string): Promise<{ updated: number }> {
  // Get fresh anchor dates from candidate
  const candidate = await this.candidateRepository.getCandidate(candidateId);
  const anchors: AnchorDates = {
    loi: resolveLoiAnchor(candidate),
    loo: resolveLooAnchor(candidate),
    loo_issued: resolveLooIssuedAnchor(candidate),
    loo_accepted: resolveLooAcceptedAnchor(candidate),
    start: resolveStartAnchor(candidate),
  };

  // Recalculate each task
  for (const task of tasks) {
    const dueComputation = computeDueFromRule(
      task.dueRuleType,
      task.dueRuleValue,
      task.fixedDate,
      anchors
    );
    
    // Update if changed
    if (dueChanged || task.pendingAnchor !== dueComputation.pendingAnchor) {
      updates.push({ id: task.id, dueAt: dueComputation.dueAt, pendingAnchor: dueComputation.pendingAnchor });
    }
  }
  
  // Batch update in transaction
  await this.db.transaction(async (tx) => { /* ... */ });
}
```

---

## Part 7: Template Estimation

### 7.1 Previewing Timeline Before Application

The estimation API lets you preview what the timeline would look like:

```
GET /api/templates/:id/estimate?looDate=2024-02-01&startDate=2024-03-01&businessDays=true
```

**Response:**
```json
{
  "templateId": "uuid",
  "taskCount": 6,
  "anchors": {
    "loi": null,
    "loo": "2024-02-01",
    "start": "2024-03-01"
  },
  "baselineDate": "2024-02-01",
  "lastDueDate": "2024-03-06",
  "totalCalendarDays": 34,
  "totalBusinessDays": 24,
  "leadTimes": {
    "loi": 0,
    "loo": 0,
    "looIssued": 0,
    "looAccepted": 0,
    "start": 10
  },
  "perPhase": [
    { "phase": "pre_hire", "taskCount": 4, "lastDueDate": "2024-02-27" },
    { "phase": "onboarding", "taskCount": 2, "lastDueDate": "2024-03-06" }
  ],
  "perStage": [
    { "stageId": "1", "stageName": "Offer Review", "taskCount": 2, "lastDueDate": "2024-02-06" },
    { "stageId": "2", "stageName": "Pre-Start Setup", "taskCount": 2, "lastDueDate": "2024-02-27" },
    { "stageId": "3", "stageName": "First Week", "taskCount": 2, "lastDueDate": "2024-03-06" }
  ],
  "nonEstimable": [
    {
      "taskId": "uuid",
      "rule": "days_after_stage",
      "reason": "Stage-relative rules cannot be pre-calculated",
      "stageId": "1",
      "stageName": "Offer Review",
      "phase": "pre_hire"
    }
  ]
}
```

### 7.2 Lead Time Requirements

The `leadTimes` object tells you how far in advance you need to prepare:

```json
{
  "start": 10  // Earliest task is due 10 days BEFORE start date
}
```

This means: if the start date is March 1st, you need to have things ready by February 19th.

---

## Part 8: Troubleshooting Guide

### Common Issue #1: Template Won't Activate

**Symptoms:** "Activate" button is disabled or returns error

**Checklist:**
1. ✅ Template has at least 1 stage
2. ✅ Each stage has at least 1 active task
3. ✅ All relative rules have `dueRuleValue` set
4. ✅ All fixed_date rules have a date selected
5. ✅ All user-assigned tasks have a user selected
6. ✅ All role-assigned tasks have a role specified

**Debug API:**
```
GET /api/templates/:id/readiness
```

### Common Issue #2: Tasks Show "Pending Date"

**Cause:** The anchor date for the due rule isn't set on the candidate

**Fix:**
1. Check which anchor is missing (LOO vs Start)
2. Update the candidate with the missing date
3. System automatically recalculates due dates

### Common Issue #3: Prerequisite Tasks Not Created

**Symptoms:** Expected P&T tasks don't appear when candidate is created

**Checklist:**
1. ✅ Task marked as `isPrerequisite: true` in template
2. ✅ Prerequisite condition matches candidate (e.g., Associate Professor rank)
3. ✅ Candidate has `letterOfIntentDate` set
4. ✅ Using LOI-based due rule (not LOO-based)

### Common Issue #4: Wrong Due Dates After LOO Change

**Cause:** Due dates don't automatically recalculate when dates change

**Solution:** The system should auto-recalculate. If not happening, check that the event listener for candidate updates is triggering `TaskDueDateService.recomputeCandidateDueDates()`.

---

## Part 9: Quick Reference

### Due Rule Type Decision Tree

```
Is this a prerequisite task?
├── YES → Use LOI rules
│   ├── on_loi_date (due on intent date)
│   ├── days_before_loi (due N days before)
│   └── days_after_loi (due N days after)
│
└── NO → What's the anchor?
    │
    ├── Letter of Offer?
    │   ├── Generic (with fallback): on_loo_date, days_before_loo, days_after_loo
    │   ├── Explicit Accepted: on_loo_accepted_date, days_before_loo_accepted, days_after_loo_accepted
    │   └── Explicit Issued: on_loo_issued_date, days_before_loo_issued, days_after_loo_issued
    │
    ├── Start Date?
    │   ├── on_start_date
    │   ├── days_before_start
    │   └── days_after_start
    │
    ├── Stage Entry?
    │   ├── days_before_stage (⚠️ non-estimable)
    │   └── days_after_stage (⚠️ non-estimable)
    │
    └── Specific Date?
        └── fixed_date
```

### Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Due rule enum definition | [shared/schemas/task.enums.ts](../shared/schemas/task.enums.ts) |
| Due date calculation | [server/utils/date.utils.ts](../server/utils/date.utils.ts) |
| Template expansion logic | [server/services/templates/template-expansion.service.ts](../server/services/templates/template-expansion.service.ts) |
| Due date recalculation | [server/services/tasks/task-due-date.service.ts](../server/services/tasks/task-due-date.service.ts) |
| Timeline estimation | [server/services/templates/template-estimation.service.ts](../server/services/templates/template-estimation.service.ts) |
| Template task form UI | [client/src/features/templates/components/TemplateTaskFormDialog.tsx](../client/src/features/templates/components/TemplateTaskFormDialog.tsx) |
| Database schema | [shared/schema.ts](../shared/schema.ts) |

### API Endpoints

| Action | Endpoint | Method |
|--------|----------|--------|
| Create template | `/api/templates` | POST |
| Get template readiness | `/api/templates/:id/readiness` | GET |
| Activate template | `/api/templates/:id/status` | PATCH |
| Estimate timeline | `/api/templates/:id/estimate` | GET |
| Apply to candidate | `/api/candidates/:id/apply-template` | POST |
| Recalculate due dates | (internal service) | - |

---

## Summary

You've learned how OnBoardPro's template system provides:

1. **Reusable Workflows** - Define once, apply to many candidates
2. **Flexible Due Dates** - 18 rule types covering LOI, LOO, and start date anchors
3. **Prerequisite Tasks** - Pre-workflow tasks for special approval processes
4. **Automatic Calculation** - Due dates computed and recalculated automatically
5. **Deferred Application** - Templates can wait until dates are known
6. **Timeline Estimation** - Preview schedules before committing

---

## Next Steps

1. **Practice:** Create a template for your department's most common hire type
2. **Explore:** Use the estimation API to optimize task timing
3. **Customize:** Add prerequisite tasks for positions requiring special approvals
4. **Integrate:** Connect template application to your existing candidate workflows

---

## Additional Resources

- [Template System Business Logic](TEMPLATE_SYSTEM.md) - Deep technical reference
- [Domain Glossary](DOMAIN_GLOSSARY.md) - Term definitions
- [Architecture Guide](ARCHITECTURE.md) - System overview
- [Prerequisite Implementation](template-prerequisites-implementation.md) - Detailed prerequisite docs
