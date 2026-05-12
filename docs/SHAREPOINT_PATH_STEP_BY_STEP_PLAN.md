# SharePoint Path Step-by-Step Plan

Prepared: 2026-05-12  
Context: SharePoint/Microsoft 365 proof-of-concept path for OnBoardPro

## Purpose

This plan treats the SharePoint path as a **parallel proof-of-concept**, not a migration. The current app is pre-production, so the goal is to show a credible Microsoft 365-native alternative using the concepts from OnBoardPro without moving production data.

The proof point is:

> The onboarding process can live inside Microsoft 365, using Teams as the daily workspace, SharePoint Lists as the data layer, Power Apps as the structured UI, Power Automate as the workflow engine, and Copilot Studio as the conversational front door.

## Big Picture

Use:

- **SharePoint Lists** as the data layer
- **Power Apps** as the structured UI
- **Power Automate** as the workflow engine
- **Copilot Studio** as the conversational front door
- **Teams** as the daily workspace
- **Outlook/Teams approvals** for human review

Build it in this order.

## Step 1: Create The Workspace

Create one dedicated Microsoft Team in the **university tenant**.

Suggested name:

`OnBoardPro Pilot`

Recommended channels:

| Channel | Purpose |
|---|---|
| General | Announcements and pilot notes |
| HR Operations | HR candidate management |
| Template Design | Workflow/template discussions |
| Manager Actions | Manager approvals and task reminders |
| Build Notes | Testing notes, issues, decisions |

Behind that Team, Microsoft automatically creates a SharePoint site. Use that site as the home for the pilot lists.

## Step 2: Create The SharePoint Lists

Start with a small but complete data model. Do not overbuild yet.

Create these lists first:

1. Candidates
2. Candidate Tasks
3. Templates
4. Template Stages
5. Template Tasks
6. Departments
7. Divisions
8. Hiring Stages
9. Audit Log
10. Notification Log

That gives you the same conceptual shape as the current app without PostgreSQL, Express, or a custom React frontend.

## Step 3: Build The Reference Lists First

Start with the lists that feed dropdowns.

### Departments

| Column | Type |
|---|---|
| Title | Single line text |
| Department Code | Single line text |
| Active | Yes/No |

### Divisions

| Column | Type |
|---|---|
| Title | Single line text |
| Department | Lookup to Departments |
| Active | Yes/No |

### Hiring Stages

| Column | Type |
|---|---|
| Title | Single line text |
| Phase | Choice: Pre-Hire, Onboarding |
| Order Index | Number |
| Active | Yes/No |

Seed these manually with a few realistic university examples.

## Step 4: Build The Candidate List

This is the core record.

### Candidates

| Column | Type |
|---|---|
| Title | Single line text, use full candidate name |
| First Name | Single line text |
| Last Name | Single line text |
| Email | Single line text |
| Candidate Type | Choice |
| Department | Lookup to Departments |
| Division | Lookup to Divisions |
| Manager | Person |
| Faculty Rank | Choice |
| Letter of Intent Date | Date |
| Offer Letter Issued Date | Date |
| Offer Letter Accepted Date | Date |
| Anticipated Start Date | Date |
| Status | Choice: Draft, Active, On Hold, Completed, Canceled, Offer Declined, Archived |
| Current Stage | Lookup to Hiring Stages |
| Template | Lookup to Templates |
| Template Applied | Yes/No |
| Template Applied Date | Date/time |
| Blocked By Prior Stage | Yes/No |
| Blocker Summary | Multiple lines text |

Keep **Letter of Intent Date** because the current app depends on it for prerequisite tasks.

## Step 5: Build The Template Lists

These recreate the current template system.

### Templates

| Column | Type |
|---|---|
| Title | Template name |
| Candidate Type | Choice |
| Description | Multiple lines text |
| Active | Yes/No |
| Archived | Yes/No |

### Template Stages

| Column | Type |
|---|---|
| Title | Stage name snapshot |
| Template | Lookup to Templates |
| Hiring Stage | Lookup to Hiring Stages |
| Phase | Choice: Pre-Hire, Onboarding |
| Order Index | Number |
| Active | Yes/No |

### Template Tasks

| Column | Type |
|---|---|
| Title | Task name |
| Template | Lookup to Templates |
| Template Stage | Lookup to Template Stages |
| Hiring Stage | Lookup to Hiring Stages |
| Order Index | Number |
| Description | Multiple lines text |
| Due Rule Type | Choice |
| Due Rule Value | Number |
| Fixed Date | Date |
| Default Assignee Type | Choice: User, Manager, HR, Candidate |
| Default Assignee | Person |
| Priority | Choice: Low, Medium, High, Critical |
| Category | Choice |
| Required | Yes/No |
| Prerequisite | Yes/No |
| Prerequisite Condition | Choice: Always, Requires P&T |
| Active | Yes/No |

Recommended **Due Rule Type** choices:

- On LOI Date
- Days Before LOI
- Days After LOI
- On Offer Issued Date
- Days Before Offer Issued
- Days After Offer Issued
- On Offer Accepted Date
- Days Before Offer Accepted
- Days After Offer Accepted
- On Start Date
- Days Before Start
- Days After Start
- Fixed Date

Skip stage-relative rules in the first SharePoint pilot unless they are truly required. They are harder to keep clean in Power Automate.

## Step 6: Build Candidate Tasks

### Candidate Tasks

| Column | Type |
|---|---|
| Title | Task title |
| Candidate | Lookup to Candidates |
| Template Task | Lookup to Template Tasks |
| Stage | Lookup to Hiring Stages |
| Phase | Choice: Pre-Hire, Onboarding |
| Assigned To | Person |
| Assignee Role | Choice |
| Due Date | Date |
| Due Rule Type | Choice |
| Due Rule Value | Number |
| Pending Anchor | Yes/No |
| Status | Choice: To Do, In Progress, Blocked, Done, Canceled |
| Priority | Choice |
| Category | Choice |
| Required | Yes/No |
| Prerequisite Task | Yes/No |
| Notes | Multiple lines text |
| Completed Date | Date/time |

This list becomes the main operational checklist.

## Step 7: Build The First Power App

Create a Power Apps canvas app first. Model-driven apps are not available without Dataverse, so canvas is the practical SharePoint path.

Recommended screens:

1. Dashboard
2. Candidate List
3. Candidate Detail
4. New Candidate
5. Candidate Tasks
6. Template List
7. Template Detail
8. My Tasks
9. Admin Reference Data

The first usable version should let you:

- Create a candidate
- Pick a template
- See generated tasks
- Update task status
- Filter My Tasks
- See overdue tasks
- See candidate stage/status

## Step 8: Build The Template Expansion Flow

This is the most important flow.

Power Automate flow:

`OBP - Apply Template To Candidate`

Trigger options:

- Manual button from Power App
- Or when Candidate item is modified and `Offer Letter Accepted Date` is filled

Flow logic:

1. Get Candidate.
2. Get selected Template.
3. Get Template Stages.
4. Get Template Tasks where `Prerequisite = No`.
5. For each Template Task:
   - Determine anchor date.
   - Calculate due date.
   - If anchor missing, set `Pending Anchor = Yes`.
   - Resolve assignee.
   - Create Candidate Task.
6. Mark Candidate as `Template Applied = Yes`.
7. Set `Template Applied Date`.
8. Write to Audit Log.
9. Notify HR/manager in Teams.

This preserves the core value of OnBoardPro.

## Step 9: Build The Prerequisite Flow

Power Automate flow:

`OBP - Expand Prerequisites`

Trigger:

- When Candidate is created
- Or manual button from Power App

Flow logic:

1. Get Candidate.
2. Check selected Template.
3. Check LOI Date exists.
4. Get Template Tasks where `Prerequisite = Yes`.
5. For each task:
   - If condition is `Always`, create it.
   - If condition is `Requires P&T`, check Faculty Rank.
6. Calculate due date from LOI.
7. Create Candidate Task with `Prerequisite Task = Yes`.
8. Write Audit Log.
9. Notify assignee.

This demonstrates that the SharePoint version can still handle advanced pre-offer logic.

## Step 10: Build Due Date Recalculation

Power Automate flow:

`OBP - Recalculate Pending Due Dates`

Trigger:

- Candidate modified
- Specifically when offer/start dates are updated

Flow logic:

1. Get Candidate.
2. Get Candidate Tasks where `Pending Anchor = Yes`.
3. For each task:
   - Re-evaluate its due rule.
   - If anchor now exists, calculate due date.
   - Set `Pending Anchor = No`.
4. Notify assigned users if dates became active.
5. Log changes.

This avoids a common SharePoint pilot failure: tasks get created but date logic gets stale.

## Step 11: Build Task Completion And Stage Progression

Power Automate flow:

`OBP - Check Stage Completion`

Trigger:

- Candidate Task modified
- When Status changes to Done or Canceled

Flow logic:

1. Get task's Candidate.
2. Get all open required tasks for the Candidate's current stage.
3. If no required tasks remain:
   - Move Candidate to next Hiring Stage.
   - Write Stage History.
   - Notify manager/HR.
4. If required tasks remain:
   - Update blocker summary.

This recreates the current stage advancement idea.

## Step 12: Build Teams Notifications

Use Teams adaptive cards where possible.

| Event | Recipient |
|---|---|
| Candidate created | HR Operations channel |
| Template applied | Manager and HR |
| Task assigned | Assigned user |
| Task overdue | Assigned user and optionally manager |
| Stage ready to advance | HR or manager |
| Candidate completed | HR Operations channel |

Start with simple messages. Add adaptive card buttons later.

Useful card buttons:

- Mark Done
- View Candidate
- Open Task
- Request Help
- Approve Stage Move

## Step 13: Add Human Review

This mirrors the core concept from the Copilot Studio AI Workflow Designer video.

Use human review for:

1. Candidate creation from Copilot
2. Template application
3. Stage advancement
4. Candidate-visible communication

In Power Automate, this can be:

- Teams adaptive card
- Outlook approval
- Power Automate approval action

For the pilot, use Teams adaptive cards for normal task confirmations and Power Automate approvals for formal approvals.

## Step 14: Build The Copilot Studio Agent

Create one agent:

`OnBoardPro Assistant`

Initial topics/tools:

| User asks | Agent action |
|---|---|
| "Create a candidate" | Calls candidate intake flow |
| "Show my tasks" | Reads Candidate Tasks assigned to user |
| "What is overdue?" | Queries overdue tasks |
| "What is the status of Jane Smith?" | Looks up Candidate and tasks |
| "Apply a template" | Calls template application flow |
| "What is missing for this candidate?" | Summarizes pending anchors/blockers |

For candidate creation, use the video's pattern:

1. User types natural language.
2. Prompt node extracts candidate data.
3. Agent checks missing fields.
4. Agent asks follow-up questions.
5. Human review card goes to HR.
6. Flow creates SharePoint item.

## Step 15: Ground The Agent In Approved Knowledge

Add SharePoint knowledge sources for:

- Onboarding policy
- HR process guide
- Faculty onboarding rules
- Template instructions
- FAQ for managers
- FAQ for candidates

Keep knowledge separate from transactional data.

The agent should answer "how do I..." questions from documents, but use flows/tools for "do this" actions.

## Step 16: Add Power BI Or Simple Dashboards

For the pilot, start with SharePoint views and Power Apps dashboards.

Useful dashboard metrics:

| Metric | Why it matters |
|---|---|
| Active candidates | Workload |
| Candidates by department | Adoption |
| Overdue tasks | Risk |
| Tasks due in 7 days | Planning |
| Average days from LOI to offer accepted | Process speed |
| Average days from offer accepted to start | Onboarding lead time |
| Blocked candidates | Escalation |
| Tasks by assignee | Load balancing |

Power BI can come later once the data stabilizes.

## Step 17: Put It In Teams

Pin these tabs in the `OnBoardPro Pilot` Team:

1. Power App
2. Candidate List
3. Candidate Tasks List
4. Dashboard
5. OnBoardPro Assistant
6. Build Notes

This is important politically. The value proposition becomes:

> The onboarding system lives where people already work.

## Step 18: Pilot With One Realistic Workflow

Do not pilot every candidate type.

Pick one:

- Faculty onboarding
- Staff onboarding
- Faculty with P&T prerequisites
- Department-specific onboarding

Choose the workflow that causes meaningful pain but has the fewest edge cases.

Pilot script:

1. Create one candidate manually in Power App.
2. Apply template.
3. Confirm tasks are generated.
4. Complete a task from Power App.
5. Complete a task from Teams.
6. Update offer accepted/start date.
7. Confirm pending dates recalculate.
8. Ask Copilot "what is missing?"
9. Ask Copilot "what is overdue?"
10. Complete stage and verify advancement.

## Step 19: Define What This Proves

Because this is an alternative path in response to pushback, be explicit about what the SharePoint path proves.

It proves:

- The process can live inside Microsoft 365.
- HR does not need a custom frontend for every workflow.
- Teams can be the operational workspace.
- Copilot can reduce form friction.
- Power Automate can replace some backend workflow logic.
- SharePoint can support a pilot.

It does **not** prove:

- SharePoint is the best long-term database.
- Complex security will be easy.
- The solution will scale indefinitely.
- Dataverse is unnecessary forever.

That distinction matters.

## Step 20: Decide After The Pilot

At the end, compare three paths:

| Path | When to choose |
|---|---|
| Keep current custom app | If custom UX, complex workflow, and engineering control matter most |
| SharePoint path | If the organization wants low-code, Teams-first, lower infrastructure |
| Dataverse path | If this becomes multi-department, security-heavy, audit-heavy, or long-term production |

## Recommendation

Use the SharePoint path as a **working demonstration and political bridge**. If it gets traction, the cleaner long-term Microsoft-native version is probably Dataverse. SharePoint is the fastest way to show what the Microsoft 365 version could feel like, but it should be treated as a pilot unless the requirements stay simple.
