# Due Rules & Template System Guide

**A Practical Guide for HR Staff**

---

## What You'll Learn

By the end of this guide, you will be able to:

- ✅ Understand how templates automate your onboarding workflows
- ✅ Create templates with stages and tasks
- ✅ Set up due date rules so tasks are automatically scheduled
- ✅ Configure prerequisite tasks for special approval processes
- ✅ Apply templates to candidates
- ✅ Troubleshoot common issues

---

## Before You Start

You should have:

- Access to OnBoardPro with HR Staff or System Admin permissions
- Basic familiarity with the candidate and task screens

**Time to Complete:** 30-45 minutes

---

## Part 1: What Are Templates?

### The Big Picture

Templates are **reusable onboarding blueprints**. Instead of manually creating the same 15-20 tasks for every new hire, you define them once in a template, then apply that template to each candidate.

```
┌─────────────────────────────────────────────────────────────┐
│  TEMPLATE: "Software Engineer Onboarding"                   │
│                                                              │
│  Stage 1: Offer Review                                      │
│    • Send Welcome Email (due: on offer date)               │
│    • Complete Background Check (due: 5 days after offer)   │
│                                                              │
│  Stage 2: Pre-Start Setup                                   │
│    • Request IT Equipment (due: 10 days before start)      │
│    • Prepare Workstation (due: 2 days before start)        │
│                                                              │
│  Stage 3: First Week                                        │
│    • Complete Orientation (due: on start date)             │
│    • First Week Check-in (due: 5 days after start)         │
└─────────────────────────────────────────────────────────────┘
```

When you apply this template to a new hire named Jane Doe who accepted her offer on February 1st and starts March 1st, the system automatically creates all 6 tasks with the correct due dates calculated for her specific timeline.

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Consistency** | Every hire gets the same complete onboarding experience |
| **Time Savings** | No manual task creation for each candidate |
| **Automatic Scheduling** | Due dates calculated based on offer and start dates |
| **Flexibility** | Different templates for different position types |

### Important Concept: Snapshots

When you apply a template to a candidate, the system creates a **snapshot** (a frozen copy) of that template. This means:

- ✅ You can update a template without affecting candidates already using it
- ✅ Each candidate has their own independent set of tasks
- ✅ Historical accuracy is preserved

---

## Part 2: Understanding Due Date Rules

### What Are Anchor Dates?

Due date rules calculate task deadlines based on **anchor dates** — key milestones in the hiring process:

| Anchor | What It Means | Example |
|--------|---------------|---------|
| **Letter of Intent (LOI)** | When initial intent is communicated | Used for prerequisite tasks |
| **Letter of Offer (LOO)** | When the formal offer is made/accepted | Most common anchor |
| **Start Date** | When the candidate begins work | For onboarding tasks |

### The Due Date Rule Options

When you add a task to a template, you'll choose how its due date should be calculated:

#### Based on Letter of Offer

| Rule | What It Means | Example Use Case |
|------|---------------|------------------|
| **On LOO date** | Due the same day as offer | Send welcome email |
| **X days before LOO** | Due before the offer date | Prepare offer letter |
| **X days after LOO** | Due after the offer date | Complete background check (5 days after) |

> 💡 **Tip:** There are also separate options for "LOO Issued" vs "LOO Accepted" if you need to be specific about which date to use.

#### Based on Start Date

| Rule | What It Means | Example Use Case |
|------|---------------|------------------|
| **On start date** | Due on their first day | Orientation meeting |
| **X days before start** | Due before they arrive | IT setup (5 days before), prepare workstation (2 days before) |
| **X days after start** | Due after they begin | 30-day check-in, first week review |

#### Based on Letter of Intent (LOI)

| Rule | What It Means | Example Use Case |
|------|---------------|------------------|
| **On LOI date** | Due when intent is communicated | Start P&T approval process |
| **X days before/after LOI** | Relative to intent date | Complete P&T review (30 days after LOI) |

> ⚠️ **Note:** LOI-based rules are only for **prerequisite tasks** (explained in Part 5).

#### Other Options

| Rule | What It Means | Example Use Case |
|------|---------------|------------------|
| **Fixed date** | A specific calendar date | Company-wide training on March 15th |
| **Days before/after stage** | Relative to entering a stage | ⚠️ Use sparingly — dates can't be previewed |

### Visual Example: How Due Dates Calculate

If a candidate has:
- **LOO Accepted:** February 1, 2024
- **Start Date:** March 1, 2024

Then tasks calculate as:

| Task | Rule | Calculated Due Date |
|------|------|---------------------|
| Send Welcome Email | On LOO date | February 1 |
| Background Check | 5 days after LOO | February 6 |
| Request IT Equipment | 10 days before start | February 19 |
| Prepare Workstation | 2 days before start | February 27 |
| Orientation | On start date | March 1 |
| First Week Check-in | 5 days after start | March 6 |

---

## Part 3: Creating a Template

### Step 1: Start a New Template

1. Navigate to **Templates** in the main menu
2. Click **"New Template"**
3. Fill in the basic information:
   - **Name:** Give it a clear, descriptive name (e.g., "Faculty Onboarding - Tenure Track")
   - **Candidate Type:** Select which type of positions this template applies to
   - **Description:** Optional notes about when to use this template

Your template starts in **Draft** status — it can't be applied to candidates until you activate it.

### Step 2: Add Stages

Stages organize your tasks into logical groups that represent phases of the hiring/onboarding process.

1. Click **"Add Stage"**
2. Select a hiring stage from the dropdown
3. Choose the phase:
   - **Pre-hire:** Tasks before the candidate starts
   - **Onboarding:** Tasks after the candidate starts
4. Repeat for each stage you need

**Example Stage Setup:**

| Order | Stage Name | Phase |
|-------|------------|-------|
| 1 | Offer Review | Pre-hire |
| 2 | Pre-Start Preparation | Pre-hire |
| 3 | First Day | Onboarding |
| 4 | First Week | Onboarding |
| 5 | First Month | Onboarding |

> 💡 **Tip:** You can drag and drop stages to reorder them.

### Step 3: Add Tasks to Each Stage

For each stage, add the tasks that should happen during that phase:

1. Click **"Add Task"** on a stage
2. **Select Task Definition:** Choose from pre-defined task types
3. **Set Due Date Rule:** Pick when this task should be due
   - Choose the rule type (e.g., "Days after LOO")
   - Enter the number of days if applicable
4. **Set Default Assignee:** Who should handle this task?
   - Specific user
   - "Candidate" (the new hire themselves)
   - Leave blank to assign later
5. **Set Priority:** Low, Medium, High, or Critical
6. Click **Save**

### Step 4: Validate and Activate

Before a template can be used, it must pass validation:

**Validation Checklist:**
- ✅ Template has at least 1 stage
- ✅ Each stage has at least 1 task
- ✅ All tasks with "days before/after" rules have the number of days filled in
- ✅ All tasks with "fixed date" rules have a date selected
- ✅ All tasks assigned to a specific user have a user selected

**To activate:**
1. Click the **"Activate"** button
2. If validation fails, you'll see a message explaining what needs to be fixed
3. Once activated, the template is available to apply to candidates

---

## Part 4: Applying Templates to Candidates

### Option A: During Candidate Creation

When creating a new candidate:

1. Fill in the candidate's information
2. Enter the **LOO Accepted Date** (when they accepted the offer)
3. Enter the **Anticipated Start Date**
4. Select a **Template** from the dropdown
5. **Preview Due Dates:** The system shows you all the tasks with their calculated due dates
6. Click **Create**

The template applies immediately, creating all tasks with calculated due dates.

### Option B: Deferred Application

If you don't have all the dates yet:

1. Create the candidate with basic information
2. Select a template
3. Leave the LOO Accepted Date blank
4. The template is "selected" but not yet "applied"
5. Later, when the offer is accepted, edit the candidate and add the date
6. The system automatically applies the template and creates all tasks

> 💡 **Why Deferred?** This allows you to create candidate records early in the process while ensuring tasks have accurate due dates once the offer is finalized.

### What Happens When a Template is Applied

When you apply a template:

1. **Tasks are created** — Each template task becomes a candidate task
2. **Due dates are calculated** — Based on the candidate's actual dates
3. **Assignees are set** — Either to specific users or roles
4. **Stage history begins** — Candidate is placed in the first stage
5. **Template is locked** — You can't change to a different template

---

## Part 5: Prerequisite Tasks

### What Are Prerequisites?

Some positions require approval processes that must happen **before** the offer letter can even be issued. For example:

- **Promotion & Tenure (P&T) Review** for Associate Professors and above
- **Credential Verification** for medical positions
- **Security Clearance** for certain government-related roles

These tasks need to start when you first identify the candidate (Letter of Intent), not when the offer is accepted.

### How Prerequisites Work

```
Timeline for Associate Professor Hiring:

Day 0: Letter of Intent (LOI)
  └── Prerequisite tasks created immediately
      • "Initiate P&T Review" (due: on LOI date)
      • "Complete P&T Approval" (due: 30 days after LOI)

Day 30-35: LOO Issued (after P&T approval)

Day 35-40: LOO Accepted
  └── Regular template tasks created
      • "Background Check" (due: 5 days after LOO)
      • ... other onboarding tasks

Day 60+: Start Date
```

### Setting Up Prerequisite Tasks

When adding a task to a template:

1. Check the **"Prerequisite"** checkbox
2. Select the **Prerequisite Condition:**
   - **Requires P&T:** Only applies to Associate Professor or higher
   - **Always:** Applies to all candidates using this template
3. Choose an **LOI-based due rule:**
   - On LOI date
   - X days before LOI
   - X days after LOI

> ⚠️ **Important:** Prerequisite tasks can ONLY use LOI-based due rules. The system enforces this.

### When Prerequisites Expand

When you create a candidate with a template that has prerequisites:

1. System checks if the candidate meets the prerequisite conditions
2. If conditions are met AND the candidate has an LOI date, prerequisite tasks are created immediately
3. These tasks are separate from the main template expansion
4. They're marked as "prerequisite tasks" in the task list

---

## Part 6: Understanding "Pending Date" Tasks

### What Does "Pending Date" Mean?

Sometimes a task can't have its due date calculated because the required anchor date isn't set yet. These tasks show **"Pending date"** instead of an actual due date.

**Common causes:**
- Task uses "days before start" but no start date is entered
- Task uses "days after LOO" but LOO date is missing

### How to Fix Pending Dates

1. Edit the candidate
2. Add the missing date (LOO Accepted Date or Anticipated Start Date)
3. Save the candidate
4. The system automatically recalculates all pending due dates

> 💡 **Good to Know:** Tasks with pending dates still exist and can be viewed, but they'll show prominently that a date is needed.

---

## Part 7: Estimating Template Timelines

### Preview Before Applying

Before applying a template to a candidate, you can preview the timeline:

1. In the candidate creation dialog, after entering dates and selecting a template
2. The **Due Date Preview** section shows all tasks with their calculated dates
3. Review to ensure the timeline looks correct
4. Adjust dates if needed before creating

### Template Estimation View

In the template editor, you can estimate how long the full process takes:

1. Open a template
2. Click **"Estimate"**
3. Enter sample dates (LOO and Start)
4. View:
   - Total duration in calendar days
   - Business days (excluding weekends)
   - Breakdown by phase and stage
   - Any tasks that can't be estimated

This helps you:
- Optimize your template timing
- Identify if any tasks might overlap problematically
- Understand the lead time needed before start date

---

## Part 8: Best Practices

### Template Design Tips

| Tip | Why It Matters |
|-----|----------------|
| **Use descriptive names** | "Faculty Onboarding - Tenure Track" is better than "Template 1" |
| **Group related tasks** | Keep tasks in logical stages for easier tracking |
| **Set realistic due dates** | Allow buffer time for dependencies |
| **Assign to roles when possible** | More flexible than specific users who might be unavailable |
| **Test with sample dates** | Use estimation before activating |

### Due Rule Selection Guide

| Scenario | Recommended Rule |
|----------|------------------|
| Must happen before offer goes out | Days before LOO issued |
| Immediately after offer accepted | On LOO date or days after LOO |
| Equipment/access setup | Days before start (give IT time) |
| First day activities | On start date |
| Check-ins and follow-ups | Days after start |
| Approval processes before LOO | Use prerequisite with LOI rules |
| Company-wide training dates | Fixed date |

### Common Mistakes to Avoid

| Mistake | Problem | Solution |
|---------|---------|----------|
| Too many fixed dates | Doesn't adapt to different start dates | Use relative rules when possible |
| Tasks due on same day | Overwhelming for assignees | Spread tasks over multiple days |
| No buffer for weekends | Due dates might fall on weekends | The system counts calendar days, plan accordingly |
| Prerequisite without LOI date | Tasks stuck as pending | Ensure LOI date is captured for prerequisite-enabled templates |

---

## Part 9: Troubleshooting

### Template Won't Activate

**Check:**
- Does the template have at least one stage?
- Does each stage have at least one task?
- Are all required fields filled in for each task?
  - Days value for relative rules
  - Date for fixed date rules
  - User for user-assigned tasks

### Tasks Show "Pending Date"

**Cause:** The anchor date needed for the due rule isn't set

**Fix:**
1. Identify which date is missing (look at the task's due rule)
2. Edit the candidate to add the missing date
3. Dates recalculate automatically

### Prerequisite Tasks Didn't Appear

**Check:**
- Is the task marked as a prerequisite in the template?
- Does the candidate meet the prerequisite condition?
- Does the candidate have a Letter of Intent date entered?
- Is the due rule LOI-based (not LOO or start)?

### Can't Change Template After Selection

**Why:** Once a template is selected (locked) or applied, it can't be changed

**Options:**
- If only selected (not applied), you may be able to have an admin unlock it
- If already applied with tasks created, those tasks remain even if template is changed

### Due Dates Seem Wrong

**Check:**
1. Verify the candidate's LOO and start dates are correct
2. Confirm the task's due rule and days value in the template
3. Remember: rules like "5 days before start" means 5 calendar days, not business days

---

## Quick Reference Card

### Due Rule Types at a Glance

| Category | Rules Available |
|----------|-----------------|
| **Letter of Offer** | On LOO, Days before LOO, Days after LOO |
| **LOO Issued** | On LOO issued, Days before/after LOO issued |
| **LOO Accepted** | On LOO accepted, Days before/after LOO accepted |
| **Start Date** | On start date, Days before start, Days after start |
| **Letter of Intent** | On LOI, Days before/after LOI *(prerequisites only)* |
| **Other** | Fixed date, Days before/after stage |

### Template Status Flow

```
Draft → Active → Archived
  │        │
  │        └── Can be applied to candidates
  │
  └── Cannot be applied, still editing
```

### Key Terms

| Term | Definition |
|------|------------|
| **Template** | A reusable workflow blueprint with stages and tasks |
| **Template Stage** | A phase in the template (e.g., "Pre-Start Setup") |
| **Template Task** | A task definition within a stage, with due rule configuration |
| **Candidate Task** | An actual task created for a specific candidate from a template |
| **Anchor Date** | A key date (LOI, LOO, Start) used to calculate due dates |
| **Due Rule** | The formula for calculating when a task is due |
| **Prerequisite** | A task that expands before the main template (using LOI) |
| **Pending Anchor** | A task waiting for a date to calculate its due date |

---

## Summary

You've learned how to:

1. **Create templates** that define reusable onboarding workflows
2. **Configure due rules** so tasks automatically schedule based on candidate dates
3. **Set up prerequisites** for approval processes that must happen before the offer
4. **Apply templates** to candidates with automatic task creation
5. **Handle pending dates** and troubleshoot common issues

Templates save time, ensure consistency, and automatically adapt to each candidate's unique timeline.

---

## Getting Help

If you need assistance:

- Check the troubleshooting section above
- Contact your System Administrator for template configuration questions
- Reach out to IT Support for technical issues with the system
