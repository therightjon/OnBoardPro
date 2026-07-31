# OnBoardPro — User Stories

**Date:** 2026-07-30 · Companion to [PLATFORM-REBUILD-PLAN.md](PLATFORM-REBUILD-PLAN.md) and [PLATFORM-IDEAL-PLAN.md](PLATFORM-IDEAL-PLAN.md)

The stories are **identical in both plans** — parity vs. lean only changes the *delivery surface*. Each story notes where it lands in the lean build; parity differences are noted in parentheses. Notification stories reflect the **email-primary** policy: email is the default route for everyone, Teams is per-user opt-in, and critical notifications always email.

**Personas:** HR coordinator (Admins group, HR role) · Hiring manager (Manager role) · Task assignee (any staff user) · Approver · Candidate (external recipient, not a user) · Leadership · Maker/owner (Jon).

---

## HR coordinator

### HR-1 · Create a candidate correctly
*As HR, I want to create a candidate with LOI date, type, department, rank, and template in one guarded step, so nothing enters the pipeline half-configured.*
**Surface:** New Candidate wizard (canvas, both plans).
**Acceptance criteria**
- [ ] Cannot save without: first/last name, email, candidate type, department, LOI date, template.
- [ ] Faculty / Faculty Clinical types force a faculty rank selection.
- [ ] A rank with `RequiresPT = yes` is rejected unless the selected template contains ≥1 prerequisite task with condition *Requires P&T* — with an error message naming the rule, not a generic failure.
- [ ] On save: prerequisite tasks exist within seconds, dated from the LOI anchor; `PrereqsExpanded` stamped; template locked (no swap after create).
- [ ] LOI date is not editable after creation.
- [ ] A failed save leaves the wizard populated and shows the error (no silent green "Saved").

### HR-2 · Trigger the pipeline on offer acceptance
*As HR, I want the full checklist to materialize the moment I record the accepted offer, so due dates come from real dates.*
**Surface:** Candidate cockpit date field → flow `OnBoard - Apply Template`.
**Acceptance criteria**
- [ ] Setting LOO Accepted expands the template exactly once (re-entry safe; `TemplateApplied` guards).
- [ ] Every task's DueDate = anchor date + OffsetDays; tasks whose anchor is missing are created with `PendingAnchor = yes` and no due date, shown as "Pending date".
- [ ] Candidate lands in the template's first stage; the first ChangeLog stage row is **dated at the LOI date** (truthful timeline), marked automated.
- [ ] The candidate's folder exists in Onboarding Documents (created at candidate creation).
- [ ] Denormalized fields (CandName, StageName, StageOrder, Phase) populated on every task row.
- [ ] Assignees resolved: Person → person; Manager → candidate's manager; HR → unassigned + HR-flagged; Candidate → email-drip touchpoint, no assignee.
- [ ] An open task titled "Send Offer Letter" is auto-completed and credited to the acting user.
- [ ] App remains responsive throughout (respond-first flow; UI refresh shows tasks when done).

### HR-3 · Fix a date once, not thirty times
*As HR, I want changing an anchor date to recompute every affected due date automatically.*
**Surface:** cockpit → `OnBoard - Anchor Dates Changed`.
**Acceptance criteria**
- [ ] Only open (not Done/Canceled) tasks recompute; completed history is untouched.
- [ ] Pending-anchor tasks whose anchor just arrived get real due dates and drop the pending flag.
- [ ] Rows whose computed values didn't change are not rewritten (no churn in version history).

### HR-4 · Control candidate status honestly
*As HR, I want status changes constrained to legal transitions, so the record can't lie.*
**Surface:** cockpit status control.
**Acceptance criteria**
- [ ] Only legal transitions offered (e.g. Canceled → Active only; Completed → Archived only).
- [ ] → Completed blocked while any required task is open, **listing the blockers**.
- [ ] → Canceled cancels all open tasks; reactivation reopens them to To Do and clears completion stamps.
- [ ] Archive records prior status; restore returns to it.

### HR-5 · Author a hiring process
*As HR, I want to define stages and tasks with human-readable due rules ("2 weeks before start"), and only activate a template that's complete.*
**Surface (lean):** Microsoft Lists grouped-by-stage view + `OnBoard - Validate Template` flow. **(Parity: custom template editor screen.)**
**Acceptance criteria**
- [ ] Due rules are Anchor (LOI / LOO Issued / LOO Accepted / Start / Fixed) + signed OffsetDays.
- [ ] Validation blocks activation and names each gap: active stage with zero tasks, Fixed rule without a date, role slot without a role, Person slot without a person.
- [ ] Validation result arrives as a card/email to the requester; a passing template flips to Active.
- [ ] Cloning a template copies stages + tasks; version increments.

### HR-6 · Cancel with accountability
*As HR, I want canceling a required task to demand a reason and leave a trail.*
**Surface:** cockpit.
**Acceptance criteria**
- [ ] Cancel requires a non-empty reason; stored on the task; visible in the cockpit.
- [ ] Only HR can cancel a *required* task.
- [ ] Version history shows who/when.

### HR-7 · Collect candidate documents
*As HR, I want each candidate to have a document folder where staff file licenses, certifications, and signed letters, so documents live with the record.*
**Surface:** `Onboarding Documents` library (Phase 1), folder per candidate; **Documents** tab on the cockpit.
**Acceptance criteria**
- [ ] Folder auto-created at candidate creation, named for the candidate.
- [ ] Cockpit Documents tab opens the folder; Documents-category tasks link to it.
- [ ] General library readable by app users; identifier-bearing documents go in the **Restricted** library (HR-only, server-enforced).

### HR-8 · Keep sensitive material HR-only
*As HR, I want notes and restricted documents that only HR can open — enforced by the platform, not just hidden by the app.*
**Surface:** `HRNotes` list, `CandidatesPrivate` list, `Onboarding Documents – Restricted` library — all behind list-level permission breaks (Admins group only).
**Acceptance criteria**
- [ ] A non-HR user opening any HR-only container by direct URL is denied by SharePoint (verified with a test account at provisioning).
- [ ] The cockpit shows the HR Notes tab and Restricted documents only to HR-role users.
- [ ] Sensitive candidate fields live in CandidatesPrivate, not the main Candidates list.
- [ ] Training rule: sensitive material goes in the HR-only containers, nowhere else.

## Hiring manager

### MGR-1 · See my candidates at a glance
*As a manager, I want a live view of where each of my candidates sits and what's blocking them.*
**Surface:** cockpit (scoped list) + Power BI pipeline page.
**Acceptance criteria**
- [ ] Manager sees candidates where they are Manager, PrimaryOwner, or a Watcher.
- [ ] Blocked candidates visibly flagged with the earliest blocking stage.
- [ ] Scoping is honest UX for operational data (group membership is that boundary); sensitive content is server-enforced HR-only (HR-8). Manager-scoped candidate visibility is deferred by decision — revisit on stakeholder pushback.

### MGR-2 · Hear about movement without asking
*As a manager, I want notified when my candidate changes stage or completes a task, so I never chase status.*
**Surface:** `OnBoard - Task Changed` → email (default) / Teams per preference.
**Acceptance criteria**
- [ ] Stage change and task completion notify manager + watchers, minus whoever acted.
- [ ] Message names candidate, stage/task, actor; links to the cockpit.
- [ ] Delivered per the recipient's NotifyChannel; email when no preference set.

### MGR-3 · Watch a candidate I care about
*As any staff user, I want to follow a candidate and receive its updates.*
**Surface:** Watchers picker on the cockpit.
**Acceptance criteria**
- [ ] Add/remove self (or others, HR) in one action; takes effect on the next event.
- [ ] Watchers receive stage changes, completions, and comment notifications.
- [ ] (This closes the original app's gap: followers existed in data but had no UI.)

## Task assignee

### ASN-1 · Know what landed on me
*As an assignee, I want to be told the moment a task is assigned to me, with a link straight to the work.*
**Surface:** `OnBoard - Task Changed` → **email (always — critical)**, plus Teams card if opted in.
**Acceptance criteria**
- [ ] Fires on create-with-assignee and on reassignment; never to the person who did the assigning.
- [ ] Contains task, candidate, due date, deep link (cockpit via `Param("candidateId")` and/or list item).

### ASN-2 · Start my day with a list
*As an assignee, I want one morning digest of everything due soon or overdue, so I don't monitor an app.*
**Surface:** `OnBoard - Daily Deadline Scan` → **email digest (default)**; Teams agenda card for opt-ins. **(Parity adds a My Tasks screen; lean holds it for pilot feedback.)**
**Acceptance criteria**
- [ ] Weekday mornings, one message per person with open work: overdue first, then due ≤7 days, grouped by candidate, with links.
- [ ] Deduped via `DueNotified`: a task reappears only in the digest cadence or if its due date changed.
- [ ] No open work = no message.

### ASN-3 · Close the loop cheaply
*As an assignee, I want to mark my task done and have the system react.*
**Surface:** cockpit or `[Me]`-filtered list view; advancement via `OnBoard - Task Changed`.
**Acceptance criteria**
- [ ] Completing the last open required task in the current stage advances the candidate automatically (looping past empty stages), writes the ChangeLog stage row (automated), and notifies manager + watchers.
- [ ] An assignee changing status on an unassigned task auto-claims it.
- [ ] Completion stamps CompletedDate; un-completing clears it.

### ALL-1 · Choose my notification route
*As any staff user, I want to choose email, Teams, or both — with email the default — so notifications arrive where I'll actually see them.*
**Surface:** `NotifyChannel` choice on my AppPermissions row (self-service in the app; HR can set it too).
**Acceptance criteria**
- [ ] No action needed to get email — it's the default, including for users with no preference row.
- [ ] **Critical notifications always email regardless of preference:** assignment (ASN-1), the deadline digest (ASN-2), approvals (APR-1), blocked-candidate alerts.
- [ ] Teams opt-in adds cards for the same events; opting out of Teams never silences email.
- [ ] Change takes effect from the next event (flows read the preference per send).

## Approver

### APR-1 · Decide from the notification
*As an approver, I want sign-offs (offer, P&T, credentialing) to arrive as real Approvals, decided in place, with the decision recorded.*
**Surface:** `OnBoard - Approvals` → Power Automate Approvals (actionable email + Teams Approvals app).
**Acceptance criteria**
- [ ] Approval fires when the task's stage becomes current — not at expansion (28-day approval timeout vs. long hiring timelines).
- [ ] Assigned to a resolved individual, never a group (group approvals lose Teams notification; only mail-enabled groups get email).
- [ ] Approve → task Done with decision note; Reject → task Blocked, HR notified with comments.
- [ ] A timed-out approval re-issues automatically and notes the re-issue.

## Candidate (recipient, not a user)

### CAND-1 · Be told what I need to do
*As a candidate, I want clear emails at the right moments — welcome on acceptance, document requests, first-day info — without needing an account.*
**Surface:** email drip from the **shared mailbox**, defined per template as `AssigneeRole = Candidate` tasks.
**Acceptance criteria**
- [ ] Touchpoints are template data, not code: adding a candidate-role task adds a touchpoint.
- [ ] Sent from the shared onboarding mailbox (survives staff turnover; replies land somewhere monitored).
- [ ] Candidate never receives internal-visibility content; candidate-visible comments only.
- [ ] HTML templates authored as checked-in preview files; rendered preview approved before anything sends to a real person.

## Leadership

### LEAD-1 · Judge the process, not anecdotes
*As leadership, I want throughput and workload trends — time-in-stage, LOI-to-start lead time, overdue by owner — over full history.*
**Surface:** Power BI (Tasks + TasksArchive unioned; ChangeLog for durations), pinned as a Teams tab.
**Acceptance criteria**
- [ ] Four pages: Pipeline, Throughput, Workload, History; scheduled refresh (≤8/day, shared capacity).
- [ ] KPI deltas and trends read MetricsSnapshots — exact 30-day comparisons, not approximations.
- [ ] Row-level security roles scope viewers (HR: all; managers: their own candidates), enforced in the report regardless of list permissions.
- [ ] Archived candidates included in history; active lists stay small (archival flow).
- [ ] Exportable to PDF/PPT for meetings — replaces the never-built PDF export.

## Maker / owner

### MAKER-1 · Onboard a user in one move
*As the owner, I want onboarding to be group membership plus one row, never per-user grants.*
**Acceptance criteria**
- [ ] `OBGYN-OnBoardPro-PA` membership = app access + list permissions + flow run-only.
- [ ] One AppPermissions row sets Role (HR / Manager / Viewer) and NotifyChannel (defaults: Viewer, Email).
- [ ] Removing group membership removes access; no per-user SharePoint grants exist.

### MAKER-2 · Trust the record
*As the owner, I want every consequential change traceable without a custom audit system.*
**Acceptance criteria**
- [ ] Stage hops **and task-level changes** (status, assignee, due date) in ChangeLog — who, when, from→to, automated flag — as text snapshots that survive stage-library edits, reportable in Power BI rather than only browsable.
- [ ] Other field-level changes in SharePoint version history; flow runs as the processing log.
- [ ] Cancellations carry reasons (HR-6); status transitions constrained (HR-4).
