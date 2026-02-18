# Getting Started with OnBoardPro

> **A Step-by-Step Tutorial for First-Time Administrators**

Welcome to OnBoardPro! This tutorial walks you through everything you need to know to start managing your hiring pipeline and onboarding workflows. By the end, you'll confidently create candidates, build reusable task templates, and track progress from offer to onboarding.

Last Updated: 2026-02-18

---

## Table of Contents

1. [Quick Glossary](#quick-glossary)
2. [Part 1: Create a Candidate](#part-1-create-a-candidate)
   - [Navigate to Candidates](#11-navigate-to-candidates)
   - [Open the New Candidate Dialog](#12-open-the-new-candidate-dialog)
   - [Fill in Candidate Details](#13-fill-in-candidate-details)
   - [Assign a Template](#14-assign-a-template)
   - [Save and Confirm](#15-save-and-confirm)
3. [Part 2: Create a Task in the Task Library](#part-2-create-a-task-in-the-task-library)
   - [Navigate to the Task Library](#21-navigate-to-the-task-library)
   - [Understand Task Fields](#22-understand-task-fields)
   - [Create Your First Task Definition](#23-create-your-first-task-definition)
   - [Edit and Deactivate Tasks](#24-edit-and-deactivate-tasks)
4. [Part 3: Create a Template](#part-3-create-a-template)
   - [What Is a Template?](#31-what-is-a-template)
   - [Create a New Template](#32-create-a-new-template)
   - [Add Stages to Your Template](#33-add-stages-to-your-template)
   - [Add Tasks to Stages](#34-add-tasks-to-stages)
   - [Configure Due Date Rules](#35-configure-due-date-rules)
   - [Publish and Activate Your Template](#36-publish-and-activate-your-template)
5. [Part 4: Working With Candidates (End-to-End Flow)](#part-4-working-with-candidates-end-to-end-flow)
   - [Assign a Template to a Candidate](#41-assign-a-template-to-a-candidate)
   - [Generate Candidate Tasks](#42-generate-candidate-tasks)
   - [Update Task Statuses](#43-update-task-statuses)
   - [Handle Changes](#44-handle-changes)
   - [Track Progress](#45-track-progress)
6. [Common Issues & Fixes](#common-issues--fixes)
7. [10-Minute Practice Walkthrough](#10-minute-practice-walkthrough)

---

## Quick Glossary

Before we dive in, here are the key terms you'll encounter:

| Term | Definition |
|------|------------|
| **Candidate** | A person moving through your hiring or onboarding pipeline. Each candidate has a status, assigned department, and tracked tasks. |
| **Task Library** | A catalog of reusable task definitions. Think of these as "templates for tasks" that can be added to multiple workflow templates. |
| **Template** | A reusable workflow blueprint containing stages and tasks. When applied to a candidate, it generates the actual work items they need to complete. |
| **Anchor Date** | A key milestone date used to calculate task due dates. Common anchors include: Letter of Offer (LOO) Issued, LOO Accepted, and Start Date. |
| **Dependency** | When one task must be completed before another can begin. Used to enforce logical ordering. |
| **Owner/Assignee** | The person responsible for completing a task. Can be a specific user or a role (like "HR Staff" or even "Candidate"). |

---

## Part 1: Create a Candidate

Creating a candidate is usually your first step when someone enters your hiring pipeline.

### 1.1 Navigate to Candidates

1. Log in to OnBoardPro
2. Click **Candidates** in the left sidebar navigation

[Screenshot: Sidebar navigation with Candidates highlighted]

**What you should see:** A list of existing candidates (or an empty state if you're just starting out).

---

### 1.2 Open the New Candidate Dialog

1. Click the **+ New Candidate** button in the top right corner

[Screenshot: Candidates page with New Candidate button highlighted]

**What you should see:** A dialog/form opens with fields for entering candidate information.

---

### 1.3 Fill in Candidate Details

Complete the form with the following information:

#### Required Fields (marked with *)

| Field | Description | Example |
|-------|-------------|---------|
| **Salutation** | Title/prefix | Dr., Mr., Ms., etc. |
| **First Name** | Candidate's first name | Jane |
| **Last Name** | Candidate's last name | Smith |
| **Email** | Contact email address | jane.smith@email.com |
| **Candidate Type** | Classification (Faculty, Staff, etc.) | Faculty |
| **Department** | Organizational department | Computer Science |
| **Letter of Intent Date** | Date LOI was signed (required, immutable) | 01/15/2026 |
| **Template** | Onboarding workflow to apply | Faculty Onboarding |

#### Optional Fields

| Field | Description | When to Use |
|-------|-------------|-------------|
| **Division** | Sub-unit within department | If your org uses divisions |
| **Manager** | Candidate's supervisor | For manager notifications |
| **Faculty Rank** | Academic rank (Faculty types only) | Assistant Professor, etc. |
| **Offer Letter Issued** | Date LOO was sent | If already sent |
| **Offer Letter Accepted** | Date LOO was signed | Triggers task generation |
| **Anticipated Start Date** | Expected first day | For due date calculations |

[Screenshot: Candidate Create Screen with fields labeled]

> **💡 Tip:** The Candidate Type you select determines which templates are available. Templates are tied to specific candidate types.

---

### 1.4 Assign a Template

1. In the **Template** dropdown, select the appropriate workflow template
2. If dates are entered, a **Due Date Preview** section appears showing when tasks will be due

[Screenshot: Template selection dropdown with preview]

**What you should see:** A preview table showing task names, stages, and calculated due dates based on your entered dates.

> **💡 Tip:** Template selection is required at candidate creation. Full task expansion happens when the Offer Letter is accepted (or via manual apply when applicable).

---

### 1.5 Save and Confirm

1. Click the **Create Candidate** button
2. You'll be redirected to the candidate's detail page

[Screenshot: New candidate created success message]

**What you should see:** 
- A success notification appears
- The candidate's profile page loads with their information
- If LOO Accepted was set, tasks should appear in the Tasks section

**✅ Checkpoint:** Your candidate is created! Look for:
- Candidate name in the header
- Department and Type displayed in the sidebar
- Timeline/history showing "Candidate created"

---

## Part 2: Create a Task in the Task Library

The Task Library stores reusable task definitions that can be added to any template. Creating tasks here first saves time when building multiple templates.

### 2.1 Navigate to the Task Library

1. Click **Task Library** in the left sidebar navigation

[Screenshot: Sidebar with Task Library highlighted]

**What you should see:** A list of existing task definitions, or an empty state with a prompt to create your first task.

---

### 2.2 Understand Task Fields

When creating a task definition, here's what each field means:

| Field | Description | Required? |
|-------|-------------|-----------|
| **Name** | Short, descriptive title | ✅ Yes |
| **Description** | Detailed instructions or notes | Optional |

> **Note:** Task definitions in the library are intentionally simple—just name and description. The detailed settings (due dates, assignees, etc.) are configured when you add the task to a template.

---

### 2.3 Create Your First Task Definition

Let's create a realistic onboarding task:

1. Click **+ New Task Definition** button
2. Fill in the fields:

| Field | Value |
|-------|-------|
| **Name** | Complete Background Check Authorization |
| **Description** | New hire must complete and sign the background check authorization form. HR will process once received. Contact hr@company.com if you have questions. |

3. Click **Create**

[Screenshot: New Task Definition dialog filled out]

**What you should see:**
- Success notification
- New task appears in the Task Library list

#### More Example Tasks to Create

Here are more realistic tasks you might add:

| Task Name | Description |
|-----------|-------------|
| Set Up Email Account | IT creates company email and provides login credentials |
| Complete I-9 Verification | New hire brings required documents for employment eligibility |
| Assign Office/Workspace | Facilities assigns desk, keys, and parking |
| Enroll in Benefits | HR schedules benefits orientation and enrollment |
| Complete Safety Training | Mandatory safety orientation video and quiz |
| Manager Introduction Meeting | 30-minute intro call with hiring manager |

---

### 2.4 Edit and Deactivate Tasks

#### To Edit a Task:

1. Find the task in the Task Library list
2. Click the **Edit** (pencil icon) button in the row
3. Modify the name or description
4. Click **Save**

[Screenshot: Edit task dialog]

#### To Deactivate (Archive) a Task:

1. Click the **Archive** button on the task row
2. Confirm the action

> **Note:** Archived tasks are hidden from the list but not deleted. They won't appear when adding tasks to templates, but existing uses remain intact.

#### To View Archived Tasks:

1. Toggle **Show Archived** in the filter options
2. You can restore archived tasks by editing and unchecking the archived status

**✅ Checkpoint:** You should now have at least one task definition in your Task Library!

---

## Part 3: Create a Template

Templates are the heart of OnBoardPro's automation. They define what tasks need to happen, when they're due, and who's responsible.

### 3.1 What Is a Template?

A template is a **reusable workflow blueprint** that contains:

- **Stages** – Logical groupings of tasks (like "Pre-Hire Documents" or "First Week")
- **Tasks** – Specific work items assigned to each stage
- **Due Date Rules** – When tasks are due relative to key dates
- **Default Assignees** – Who should complete each task

**When to create a new template:**
- Different candidate types need different onboarding steps
- Departments have unique requirements
- You want to separate "Pre-Hire" tasks from "Onboarding" tasks

---

### 3.2 Create a New Template

1. Click **Templates** in the left sidebar
2. Click **+ New Template** button
3. Fill in the required fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Descriptive template name | Staff Onboarding 2026 |
| **Candidate Type** | Which candidate type uses this | Staff |
| **Description** | Optional notes about this template | Standard onboarding for non-faculty staff |

4. Click **Create**

[Screenshot: New Template dialog]

**What you should see:**
- Template created in "Draft" (inactive) status
- You're taken to the template detail/editor page
- Empty "Stages" and "Tasks" sections

> **💡 Tip:** Templates start as "Draft" (inactive). Candidates can't use a template until you activate it.

---

### 3.3 Add Stages to Your Template

Stages organize tasks into logical phases. Let's create a simple two-stage template:

1. In the template editor, find the **Add Stage** section
2. Select a **Hiring Stage** from the dropdown (e.g., "Documentation")
3. Choose a **Phase**:
   - **Pre-hire** – Tasks before the candidate's start date
   - **Onboarding** – Tasks on or after the start date
4. Click **Add Stage**

[Screenshot: Add Stage form]

Repeat to add a second stage (e.g., "First Week Setup" as Onboarding phase).

**What you should see:**
- Stages appear in numbered order (1, 2, 3...)
- Each stage shows its phase (Pre-hire or Onboarding)
- You can drag stages to reorder them

---

### 3.4 Add Tasks to Stages

Now let's populate our stages with tasks from the Task Library:

1. Click **+ Add Task** button (or use the Add Task dialog)
2. Configure the task:

| Field | Description | Example |
|-------|-------------|---------|
| **Task Definition** | Select from Task Library | Complete Background Check Authorization |
| **Stage** | Which stage this belongs to | Documentation |
| **Due Date Rule** | How to calculate due date | (See next section) |
| **Default Assignee** | Who handles this task | Specific user OR role (HR Staff, Candidate) |
| **Priority** | Urgency level | High, Medium, Low |
| **Category** | Task classification | HR, IT, Facilities, etc. |
| **Required** | Must complete to advance? | ✅ Yes / ☐ No |

3. Click **Save**

[Screenshot: Add Task to Template dialog]

Repeat for each task you want in the template.

---

### 3.5 Configure Due Date Rules

Due date rules determine when tasks are due based on **anchor dates**. This is powerful automation!

#### Available Anchor Types

| Anchor | Based On | Use Case |
|--------|----------|----------|
| **LOO Date** | Letter of Offer Accepted (or Issued as fallback) | Pre-hire paperwork |
| **LOO Issued Date** | Specifically when offer was sent | Quick-turnaround tasks |
| **LOO Accepted Date** | Specifically when offer was accepted | Post-acceptance tasks |
| **Start Date** | Anticipated Start Date | Onboarding activities |
| **Fixed Date** | Specific calendar date | Compliance deadlines |

#### Rule Types

| Rule | Example | Result |
|------|---------|--------|
| **On LOO Date** | Due exactly on LOO date | Due: Jan 15 (if LOO = Jan 15) |
| **X Days Before LOO** | 3 days before LOO | Due: Jan 12 |
| **X Days After LOO** | 5 days after LOO | Due: Jan 20 |
| **On Start Date** | Due on first day | Due: Feb 1 (if Start = Feb 1) |
| **X Days Before Start** | 1 week before start | Due: Jan 25 |
| **X Days After Start** | 3 days into job | Due: Feb 4 |
| **Fixed Date** | Specific date | Due: Mar 15, 2026 |

[Screenshot: Due Date Rule configuration]

> **💡 Pro Tip:** Use LOO-based rules for pre-hire paperwork and start-date rules for actual onboarding activities.

---

### 3.6 Publish and Activate Your Template

Before candidates can use your template, it must be **activated**. OnBoardPro validates your template first:

#### Activation Requirements

✅ At least 1 stage exists  
✅ Each stage has at least 1 task  
✅ All relative due date rules have a days value set  
✅ All assignee fields are properly configured  

#### To Activate:

1. Review the template's **Readiness Status** (shown on the template page)
2. Click **Activate Template** or toggle the status to "Active"
3. If validation fails, you'll see an error explaining what's missing

[Screenshot: Template activation toggle]

**What you should see:**
- Status changes from "Draft" to "Active"
- Template now appears in candidate creation dropdowns

> **⚠️ Note:** You can deactivate a template later. Existing candidates keep their tasks—only new candidates won't see it.

**✅ Checkpoint:** Your template is live! It should show:
- ✅ "Active" status badge
- Stage count and task count displayed
- Visible when creating new candidates of the matching type

---

## Part 4: Working With Candidates (End-to-End Flow)

Now let's use everything together! This section covers the day-to-day workflow of managing candidates through your pipeline.

### 4.1 Assign a Template to a Candidate

Templates can be assigned:

**Option A: At Candidate Creation**
- Select the template in the New Candidate dialog
- Tasks generate automatically when LOO is accepted

**Option B: After Creation**
1. Open the candidate's profile
2. If no template is applied, you may see an "Apply Template" option
3. Select a template and confirm

[Screenshot: Candidate profile showing template assignment]

> **Note:** Templates become "locked" after application—you can't change which template was applied, but you can add or modify individual tasks.

---

### 4.2 Generate Candidate Tasks

Tasks are generated (expanded from the template) when:

1. **Offer Letter Accepted date is set** (automatic trigger)
2. **Manual application** if needed

**What happens during task generation:**

| Step | Action |
|------|--------|
| 1 | System reads all template tasks |
| 2 | Due dates calculated based on candidate's dates |
| 3 | Assignees resolved (roles → specific users where possible) |
| 4 | Tasks created in candidate's task list |
| 5 | Candidate's current stage is set to Stage 1 |

[Screenshot: Candidate with expanded tasks visible]

**What you should see:**
- Tasks appear in the candidate's Tasks section
- Each task shows: Title, Stage, Due Date, Status, Assignee
- Tasks grouped by stage

---

### 4.3 Update Task Statuses

Tasks move through these statuses:

| Status | Icon Color | Meaning |
|--------|------------|---------|
| **To Do** | Gray | Not started |
| **In Progress** | Blue | Work has begun |
| **Blocked** | Red | Stuck/waiting on something |
| **Done** | Green | Completed! |
| **Canceled** | Muted | No longer needed |

#### To Update a Task Status:

1. Navigate to the candidate's profile
2. Find the task in the task list
3. Click the status dropdown
4. Select the new status

[Screenshot: Task status dropdown]

**Automatic Stage Progression:**
When all **required** tasks in a stage are marked Done, the candidate automatically advances to the next stage!

> **💡 Tip:** Mark tasks as "Blocked" when waiting on external factors, so your team knows there's a holdup.

---

### 4.4 Handle Changes

Real-world situations require flexibility. Here's how to handle common changes:

#### If Start Date Changes:

1. Edit the candidate (click Edit in their profile)
2. Update the **Anticipated Start Date**
3. Save changes
4. Task due dates automatically recalculate!

[Screenshot: Editing candidate dates]

#### If You Need to Reassign a Task:

1. Find the task
2. Click the assignee dropdown
3. Select a different user
4. The new assignee is notified automatically

#### If You Need to Add a New Task:

1. In the candidate's profile, click **+ Add Task**
2. You can:
   - Select from the Task Library, or
   - Create a custom one-off task
3. Assign it to a stage and set the due date
4. Save

#### If You Need to Remove or Cancel a Task:

1. Find the task
2. Change status to **Canceled**
3. Provide a reason (required)
4. The task remains for historical tracking but won't block progress

#### If You Need to Reopen a Completed Task:

1. Find the done task
2. Change status back to **In Progress** or **To Do**
3. The task is now active again

---

### 4.5 Track Progress

OnBoardPro provides several views to monitor your pipeline:

#### Candidate Profile View

The primary place to see one candidate's status:

- **Stage indicator** – Current stage in the pipeline
- **Task progress** – Count of done vs. total tasks
- **Timeline** – History of stage changes and key events
- **Dates** – LOI, LOO, and Start Date milestones

[Screenshot: Candidate detail page with progress indicators]

#### Candidates List

See all candidates at a glance:

- Filter by: Status, Type, Stage, Phase
- Sort by: Name, Date Created, etc.
- Quick actions: Archive, View

[Screenshot: Candidates list with filters]

#### My Tasks View

For individual task owners:

1. Click **My Tasks** in the sidebar
2. See all tasks assigned to you across all candidates
3. Filter by status, due date, etc.

[Screenshot: My Tasks page]

#### Dashboard

For a high-level overview:

1. Click **Dashboard** in the sidebar
2. View metrics: Tasks due soon, overdue tasks, candidates by status
3. Quick links to action items

[Screenshot: Dashboard with metrics]

**✅ Checkpoint:** You now know how to:
- Create and manage candidates
- Build reusable templates
- Update task statuses
- Track progress across your pipeline

---

## Common Issues & Fixes

Here are the most frequent issues and how to resolve them:

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Template cannot be activated"** | A stage has no tasks | Add at least one task to every stage |
| **Tasks show "Pending Date"** | Anchor date missing (LOO or Start Date not set) | Edit candidate and add the missing date; tasks will update automatically |
| **Can't change candidate's template** | Template is locked after application | Add/remove individual tasks instead; the base template can't be swapped |
| **Task due dates didn't update** | Manual refresh needed | Due dates recalculate when you edit candidate dates; refresh the page if needed |
| **Candidate stuck at a stage** | Required tasks not complete | Check all required tasks in the current stage are "Done" |
| **Template not showing for candidate type** | Type mismatch | Templates are filtered by candidate type—ensure the template's type matches |
| **Can't find a task in Task Library** | Task is archived | Toggle "Show Archived" in the filters to find and restore it |
| **Assignee dropdown is empty** | No users in department/division | Ensure users are assigned to the same department as the candidate |

---

## 10-Minute Practice Walkthrough

Let's tie everything together with a hands-on exercise. Follow along to build a complete workflow:

### Minute 1-2: Create a Task Definition

1. Go to **Task Library**
2. Click **+ New Task Definition**
3. Enter:
   - **Name:** Complete New Hire Paperwork
   - **Description:** Fill out W-4, I-9, and direct deposit forms
4. Click **Create**

### Minute 3-5: Create a Template

1. Go to **Templates**
2. Click **+ New Template**
3. Enter:
   - **Name:** Practice Template
   - **Candidate Type:** (Select any available type)
4. Click **Create**
5. Add a stage:
   - Select a hiring stage (e.g., "Onboarding" or "Documentation")
   - Phase: **Pre-hire**
   - Click **Add Stage**
6. Add your task:
   - Click **+ Add Task**
   - Task Definition: **Complete New Hire Paperwork**
   - Stage: (Your stage)
   - Due Rule: **5 Days After LOO**
   - Priority: **High**
   - Required: **Yes**
   - Click **Save**
7. Click **Activate Template**

### Minute 6-8: Create a Test Candidate

1. Go to **Candidates**
2. Click **+ New Candidate**
3. Enter:
   - **Salutation:** Ms.
   - **First Name:** Test
   - **Last Name:** Candidate
   - **Email:** test.candidate@example.com
   - **Candidate Type:** (Same type as your template)
   - **Department:** (Select any)
   - **Letter of Intent Date:** Today's date
   - **Offer Letter Accepted:** Today's date
   - **Start Date:** 2 weeks from today
   - **Template:** Practice Template
4. Click **Create**

### Minute 9-10: Update Task and Verify

1. Open your new candidate's profile
2. Find the "Complete New Hire Paperwork" task
3. Notice the due date is 5 days after today (LOO date)
4. Change status: **To Do** → **In Progress** → **Done**
5. Watch the candidate progress!

🎉 **Congratulations!** You've completed the OnBoardPro Getting Started tutorial!

---

## Next Steps

Now that you've mastered the basics:

- **Explore notifications:** Configure email alerts for due dates and assignments
- **Set up your team:** Invite colleagues and assign appropriate roles
- **Build production templates:** Create real workflows for your organization
- **Customize stages:** Work with your admin to add custom hiring stages

Need help? Contact your system administrator or refer to the full documentation.

---

*Last updated: January 2026*
