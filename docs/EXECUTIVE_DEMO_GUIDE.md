# OnBoardPro Executive Demo Guide

A non-technical overview of OnBoardPro's key features and screens for demonstration purposes.

---

## What is OnBoardPro?

OnBoardPro is a **hiring pipeline management system** designed to streamline the candidate onboarding process. It helps organizations:

- Track candidates from initial offer through their first day and beyond
- Assign and monitor onboarding tasks across teams
- Ensure nothing falls through the cracks during the hiring process
- Provide visibility into pipeline progress across departments

---

## Role-Based Access Control (RBAC)

OnBoardPro uses a **role-based security model** to ensure users only see information relevant to their responsibilities.

### User Roles

| Role | Access Level | Description |
|------|--------------|-------------|
| **System Admin** | Full Access | Complete system access, manages all settings and users |
| **HR Staff** | Full Access | Full access to all candidates and administrative functions |
| **Department Admin** | Department Scope | Sees candidates within their assigned department(s) |
| **Division Leader** | Division Scope | Sees candidates within their assigned division(s) |
| **Manager** | Individual Scope | Sees only candidates they directly manage |
| **Candidate** | Self Only | Can view only their own onboarding information |

### Key Security Features

- **Automatic Data Filtering**: Users automatically see only the data they're authorized to access
- **Action Gates**: Create, edit, and delete operations are restricted by role
- **Navigation Controls**: Menu options are shown/hidden based on user permissions

---

## Main Screens Overview

### 1. Dashboard

**Purpose**: The home screen providing a quick snapshot of hiring pipeline status.

**What You'll See**:

| Section | Description |
|---------|-------------|
| **Welcome Header** | Personalized greeting with quick action buttons |
| **Metrics Cards** | Four key numbers at a glance |
| **Upcoming Starts** | Candidates with nearest start dates |
| **Urgent Tasks** | Overdue tasks needing immediate attention |
| **Recent Activity** | Latest events across the system |
| **Division Overview** | Active candidate counts by division |

**Metrics Displayed**:
- **Active Candidates** — Total candidates currently in the pipeline
- **Tasks Due (7 days)** — Tasks requiring attention this week
- **Overdue Tasks** — Tasks past their due date
- **Completion Rate** — Percentage of candidates who completed onboarding

**Quick Actions**:
- Create a new candidate
- Export dashboard data as a report

---

### 2. Candidates

**Purpose**: Manage and track all candidates in the hiring pipeline.

#### List View

**Table Information**:
| Column | Description |
|--------|-------------|
| Name | Candidate's full name (click to view details) |
| Email | Contact email address |
| Type | Candidate category (Faculty, Staff, etc.) |
| Status | Current state (Active, Draft, Completed, etc.) |
| Stage | Current hiring stage with task progress |
| Days Since LOO | Time since Letter of Offer sent |
| Anticipated Start | Expected first day of work |
| Created | When the candidate was added |

**Filters Available**:
- Search by name or email
- Filter by status, type, or current stage
- Toggle archived/completed/canceled visibility

#### Detail View

**Header**: Candidate name with editable status badge

**Information Cards**:
- **Contact**: Email and communication details
- **Employment**: Key dates (LOI, LOO issued, LOO accepted, start date)
- **Organization**: Department, division, and manager assignments
- **Progress**: Current stage and estimated completion timeline

**Tabs**:
| Tab | Content |
|-----|---------|
| **Tasks** | All onboarding tasks grouped by hiring stage |
| **Comments** | Internal notes and discussions about the candidate |
| **Timeline** | History of stage transitions and key events |

**Hiring Progress Stepper**: Visual pipeline showing:
1. LOI Issued
2. Offer Pending (LOO sent, awaiting acceptance)
3. Pre-hire Tasks
4. Onboarding Tasks
5. Completed

---

### 3. My Tasks

**Purpose**: Personal task management for the logged-in user.

**Summary Cards** (at top):
| Card | Meaning |
|------|---------|
| **To Do** | Tasks not yet started |
| **In Progress** | Tasks currently being worked on |
| **Due Soon** | Tasks due within 7 days |
| **Overdue** | Tasks past their due date |

**Task Table Columns**:
| Column | Description |
|--------|-------------|
| Task | Task name and description |
| Candidate | Which candidate this task belongs to |
| Priority | Critical, High, Medium, or Low |
| Status | To Do, In Progress, Blocked, Done, or Canceled |
| Due Date | When the task should be completed |
| Comments | Number of comments on the task |

**Task Status Options**:
- **To Do** — Not yet started
- **In Progress** — Currently being worked on
- **Blocked** — Waiting on something else
- **Done** — Completed
- **Canceled** — No longer needed (requires reason)

**User Actions**:
- Change task status inline
- Add comments to tasks
- Navigate to candidate detail page

---

### 4. Task Library

**Purpose**: Central repository of reusable task definitions.

**What It Is**: A "recipe book" of task types that can be added to templates. These are the building blocks for onboarding workflows.

**Example Task Definitions**:
- "Complete Background Check"
- "Set Up Computer and Accounts"
- "Schedule Orientation Meeting"
- "Complete Benefits Enrollment"

**Available Actions** (HR Staff/System Admin only):
| Action | Description |
|--------|-------------|
| **Create** | Add a new task type with name and description |
| **Edit** | Modify task name or description |
| **Archive** | Remove from active use (can be restored) |

**Key Concept**: Task Library items are definitions, not actual work items. They become concrete tasks only when a template is applied to a candidate.

---

### 5. Templates

**Purpose**: Define reusable onboarding workflows.

**What Templates Do**:
- Define the **stages** a candidate progresses through
- Specify which **tasks** should be created at each stage
- Configure **when tasks are due** (based on key dates)
- Set **default assignees** for each task

**Template Structure**:

```
Template (e.g., "Faculty Onboarding")
   │
   ├── Stage 1: Pre-Hire Paperwork
   │      ├── Task: Complete Background Check (Due: 5 days after LOO)
   │      └── Task: Sign Contract (Due: 10 days after LOO)
   │
   ├── Stage 2: Account Setup
   │      ├── Task: Create Email Account (Due: 3 days before start)
   │      └── Task: Assign Office Space (Due: 1 day before start)
   │
   └── Stage 3: First Week
          └── Task: Schedule Orientation (Due: On start date)
```

**Due Date Rules** — Tasks can be scheduled relative to:
- **LOI Date** — Letter of Intent date (for pre-offer tasks)
- **LOO Date** — Letter of Offer issued or accepted
- **Start Date** — Anticipated first day of work

Examples:
- "5 days before start date"
- "On the day LOO is accepted"
- "3 days after LOO is issued"

**Template Status Lifecycle**:
| Status | Meaning |
|--------|---------|
| **Draft** | Being created/edited, not available for use |
| **Active** | Ready to apply to candidates |
| **Archived** | Retired, no longer available for new candidates |

**How Templates Connect to Candidates**:
1. When creating a candidate, select a template
2. Template is "selected" but waits until LOO is accepted
3. Once LOO is accepted, tasks are automatically created
4. Each task gets its due date calculated based on the rules
5. Candidate progresses through stages as tasks are completed

---

## Demo Flow Suggestions

### Quick Overview (5 minutes)

1. **Dashboard** — Show metrics and recent activity
2. **Candidates** — Click into one active candidate
3. **Candidate Detail** — Show tasks and progress stepper

### Feature Deep Dive (15 minutes)

1. **Dashboard** — Explain each metric card
2. **Candidates List** — Demonstrate filtering
3. **Candidate Detail** — Walk through tabs and status changes
4. **My Tasks** — Show personal task management
5. **Templates** — Show how workflows are defined

### Administrative Demo (10 minutes)

1. **Task Library** — Create a new task type
2. **Templates** — Show template stages and tasks
3. **Templates** — Demonstrate due date rules configuration_
4. **Candidates** — Create a new candidate with template

---

## Key Terminology

| Term | Definition |
|------|------------|
| **Candidate** | A person going through the hiring/onboarding process |
| **Stage** | A phase in the hiring pipeline (e.g., Pre-Hire, Onboarding) |
| **Task** | A specific action item that needs to be completed |
| **Template** | A reusable workflow defining stages and tasks |
| **LOI** | Letter of Intent — initial offer communication |
| **LOO** | Letter of Offer — formal employment offer |
| **Anchor Date** | Key date used to calculate task due dates |
| **Phase** | High-level category: Pre-hire or Onboarding |

---

## Access Summary by Screen

| Screen | System Admin | HR Staff | Dept Admin | Division Leader | Manager | Candidate |
|--------|:------------:|:--------:|:----------:|:---------------:|:-------:|:---------:|
| Dashboard | ✓ Full | ✓ Full | ✓ Partial | ✓ Partial | ✓ Partial | ✓ Limited |
| Candidates | ✓ | ✓ | ✓ Scoped | ✓ Scoped | ✓ Scoped | ✓ Self Only |
| My Tasks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Task Library | ✓ | ✓ | — | — | — | — |
| Templates | ✓ | ✓ | — | — | — | — |

---

## Questions This System Answers

**For Executives**:
- How many candidates are currently in the pipeline?
- What is our onboarding completion rate?
- Which departments have the most active hires?

**For HR Staff**:
- Which tasks are overdue?
- What candidates are starting soon?
- Are all required pre-employment tasks completed?

**For Managers**:
- What tasks are assigned to me?
- What's the status of my new hire's onboarding?
- When should tasks be completed?

**For Candidates**:
- What tasks do I need to complete?
- What's my current onboarding progress?
