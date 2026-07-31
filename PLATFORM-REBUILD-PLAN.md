# OnBoardPro — SharePoint + Power Platform Rebuild Plan

**Date:** 2026-07-30 · **Rev 4** (full review: decision log consolidated, sentinel/audit mechanics reconciled, confidence assessment added — §18) · **Status:** Proposed — no tenant changes made yet
**Companion:** [PLATFORM-IDEAL-PLAN.md](PLATFORM-IDEAL-PLAN.md) — a leaner, O365-native alternative on the same data backbone
**Target stack:** SharePoint Lists · Power Apps (canvas) · Power Automate · O365 (Outlook, Teams, Approvals) · Power BI · Entra security groups
**Future path:** Dataverse migration possible but not planned for (§14)

---

## 1. Executive summary

OnBoardPro is a hiring/onboarding pipeline manager: HR defines reusable **templates** of stages and tasks; when a candidate accepts an offer, the template **expands** into a dated, assigned checklist; candidates auto-advance through stages as required tasks complete; watchers get notified.

The custom web app (React/Express/PostgreSQL) stalled at security approval — the gating items were an external pentest and findings concentrated in the parts the app had to build itself: authentication, sessions, SMTP, secrets management, invitation tokens. **Rebuilding on SharePoint + Power Platform makes almost all of that surface disappear**: identity is Entra, transport is O365, there is no server, no stored credentials, no session cookies, no SMTP config. The approval conversation becomes standard M365 governance instead of a pentest engagement.

What carries over is the domain logic, which is genuinely good: anchor-based due-date rules, deferred template expansion, prerequisite/P&T gating, stage auto-advancement, and a clear event → recipient notification matrix (now delivered via Teams + Outlook + Approvals instead of a bespoke notification engine).

## 2. Scope, assumptions, open decisions

**Assumptions**
- Deploys to the **UAB tenant default environment**, same as MOMPOD / IRB / Supply Order. All connectors used are **standard** (SharePoint, Office 365 Outlook, Teams, Approvals, Office 365 Users) — no premium licensing needed. **All users carry UAB A5 licenses (Power BI Pro included)**, so every user can view the shared Power BI report — no capacity purchase or per-viewer licensing work.
- **All app users are campus (`@uab.edu`) accounts.** UAB gives every employee a campus account with Entra + O365; hospital-side employees' campus mailbox is disabled *for sending* but **forwarded to their UABMC mailbox, so delivery to `@uab.edu` addresses works for everyone**. This app is built campus-only regardless — Office 365 Outlook is the only email connector in the design (no Mail-connector fallback).
- Department-scale volume: tens of hires/year, templates of ~20–40 tasks. The data design assumes **active lists stay under ~500 rows** (the delegation stance all the existing apps use), with an archival flow keeping the Tasks list small (§5.3).
- Candidates are **data records, not app users**. Pre-hire people don't have tenant accounts; they get email touchpoints instead of logins. (The old app's optional candidate self-service login is dropped — see §12.)

**Decision log (running, as of 2026-07-30)**
1. **Site — Jon creates it.** **"OBGYN Onboarding"** at `/sites/OBGYN-Onboarding`, a **private Team site without an M365 group** — membership managed solely by the two security groups, no parallel roster to drift. Avoid a bare "HR …" name (reads as central UAB HR's namespace; department-scoped ages better).
2. **Groups — Jon creates them.** **`OBGYN-OnBoardPro-PA`** (all app users) and **`OBGYN-OnBoardPro-Admins-PA`** (HR tier), matching the `OBGYN-IRBStudyManager-PA` convention. Assigned membership, never per-user grants.
3. **Shared mailbox — decided.** Candidate-facing email sends from a shared onboarding mailbox via `Send an email from a shared mailbox (V2)`. Prerequisite: create it and grant the flow-owner account access before the notification flows are built.
4. **Email-primary notifications** — per-user `NotifyChannel` choice (Email default · Teams · both); critical notifications always email (§10).
5. **All users carry A5** — Power BI Pro included; the report serves every app user with no extra licensing (§11).
6. **Task-level audit** — unified `ChangeLog` (stage, candidate-status, and task-level events), reportable in Power BI (§5.1).
7. **Documents in Phase 1** — two libraries (general + HR-only Restricted), folder per candidate (§5.1).
8. **HR co-owner** on the app and every flow; a UAB IT service account is the optional step further (§15).
9. **Manager-scoped candidate visibility — deferred.** Not a requirement today; revisit on stakeholder pushback. Mechanism recorded in §6.

## 3. What the current app does (functional intent, compressed)

- **Entities:** candidates (with LOI / offer-issued / offer-accepted / start dates), templates → template stages → template tasks, a global stage library, runtime tasks, comments, stage history, watchers, org reference data (departments, divisions, faculty ranks, candidate types).
- **Lifecycle:** candidate created with LOI date + template selected → **prerequisite tasks** expand immediately (LOI-anchored; P&T prerequisites only when the faculty rank requires it) → offer accepted → **full template expansion** (due dates computed from anchors; tasks missing their anchor are created as "pending date" and recompute when the anchor arrives) → tasks complete → **stage auto-advances** when a stage has no open required tasks → candidate completed (blocked unless every required task is done/canceled).
- **Status machine:** draft / active / on-hold / completed / canceled / offer-declined / archived with an enforced transition matrix; cancel closes open tasks; reactivate reopens them.
- **Tasks:** priority, category, required flag, assignee (person or role, including "the candidate"), cancel-requires-reason, auto-claim on status change by an unassigned user, cancel-required-task restricted to HR.
- **Notifications:** event matrix (created/assigned/completed/comment/mention/stage-change/due-soon/overdue/owner-change) → assignee + manager + watchers, with dedupe keys so a task never nags twice for the same due date.
- **Roles:** admin, HR, department admin, division leader, manager, candidate — with scope tables limiting non-privileged users to their departments/divisions/candidates.
- **Reporting:** KPI dashboard (active candidates, tasks due 7 days, overdue, completion rate), division overview, recent activity, one CSV export. The analytics page was never built.

## 4. Target architecture

```
Entra security groups ──► SharePoint site (17 lists + 2 libraries)
        │                        ▲                ▲
        │                        │ (SharePoint    │ (scheduled import,
        ▼                        │  connector)    │  8 refreshes/day)
  Canvas app (UAB design) ───────┘                └── Power BI report
        │  Power Fx reads/writes; calls flows for bulk/notification work
        ▼
  Power Automate flows ──► Outlook email · Teams messages/cards · Approvals
```

- The **canvas app** is the working UI (dashboard, candidates, candidate detail, my tasks, template editor, admin).
- **Flows** own everything cross-cutting: template expansion, stage advancement, the notification matrix, approvals, deadline scans, archival.
- **Power BI** replaces the never-built analytics page and the CSV/PDF export story.
- **SharePoint version history** + a unified ChangeLog list (stage moves *and* task-level changes) + flow run history replace the audit log.

## 5. Data model — SharePoint lists

Naming: internal names are **immutable and truncate silently at 32 characters**, so every column below is deliberately short and must be created with these exact internal names (display names can be friendlier). Choice columns replace small lookup tables wherever the values are stable.

### 5.1 Lists

**`Candidates`** — one row per person being hired
| Column | Type | Notes |
|---|---|---|
| Title | text | Full name ("Last, First" — computed at save) |
| FirstName / LastName / Salutation | text / text / choice | Salutation: Mr., Ms., Mrs., Dr., Prof., Mx., Other |
| Email | text | candidate's contact email — stays here (touchpoint flows read it); extra-sensitive contact/comp fields live in CandidatesPrivate |
| CandidateType | choice | Staff, Faculty, Clinical, Faculty Clinical, Other |
| Department / Division | lookup | to Departments / Divisions |
| FacultyRank | lookup | to FacultyRanks; **required in-app when type is Faculty / Faculty Clinical** |
| Manager / PrimaryOwner | person | |
| Watchers | person (multi) | replaces the followers table — **and gets UI this time** |
| CStatus | choice | Draft, Active, On Hold, Completed, Canceled, Offer Declined, Archived |
| CurrentStage | lookup | to Stages |
| LOIDate / LOOIssued / LOOAccepted / StartDate | date-only | the four anchors; LOI required at create, immutable in-app after |
| Template | lookup | to Templates; locked in-app after create |
| TemplateApplied | date | blank = selected but not expanded |
| PrereqsExpanded | date | |
| Blocked | yes/no | open tasks exist in an earlier stage |
| StatusBeforeArchive | text | faithful restore |
| StatusChanged | date | stamped on every status transition — drives F7's 30-day archival window |
| Notes | multiline | |

Person + lookup columns total 9 — safely under SharePoint's 12-lookup view limit.

**`Tasks`** — one row per work item (kept small; see archival)
| Column | Type | Notes |
|---|---|---|
| Title | text | task title |
| Candidate | lookup | to Candidates |
| CandName | text | **denormalized** candidate name — see §5.2 |
| Stage | lookup | to Stages |
| StageName / StageOrder / Phase | text / number / choice | denormalized snapshots (Phase: Pre-Hire, Onboarding) |
| TStatus | choice | To Do, In Progress, Blocked, Done, Canceled |
| Priority / Category | choice / choice | Low, Medium, High, Critical · Documents, Meetings, Admin, Processing, Other |
| Assignee | person | |
| AssigneeRole | choice | Person, Manager, HR, Candidate — role slots resolve when possible |
| Anchor | choice | LOI, LOO Issued, LOO Accepted, Start, Fixed, None |
| OffsetDays | number | signed: −7 = a week before the anchor |
| FixedDate / DueDate | date-only | DueDate computed by flow from Anchor+Offset |
| PendingAnchor | yes/no | rule exists but anchor date missing |
| IsRequired / IsPrereq | yes/no | |
| NeedsApproval | yes/no | drives the Approvals flow (§9) |
| CompletedDate / CancelReason / Notes | date / text / multiline | cancel requires a reason, enforced in-app |
| DueNotified | date | idempotency stamp — replaces the notification-keys table |
| UpdatedVia | text | sentinel — flows stamp their writes (`Flow`) so F3's trigger condition skips them; the app writes `App` |

**`TasksArchive`** — same shape as Tasks; rows moved here when a candidate reaches a terminal status (§5.3).

**`Templates`** — Title, CandidateType (choice), TStatus (choice: Draft, Active, Archived), Description, Version (number).

**`TemplateStages`** — Template (lookup), Stage (lookup), OrderIndex (number), Phase (choice), IsActive (yes/no).

**`TemplateTasks`** — Title, Description, Template (lookup), TemplateStage (lookup), Anchor, OffsetDays, FixedDate, AssigneeRole, DefaultAssignee (person), Priority, Category, OrderIndex, IsRequired, IsPrereq, PrereqCondition (choice: Always, Requires P&T), NeedsApproval.

**`Stages`** — Title, OrderIndex, IsActive, Description. (The global stage library; phase stays per-template, as the original deliberately migrated it.)

**`ChangeLog`** — the unified audit trail. Candidate (lookup), EventType (choice: Stage, CandidateStatus, TaskStatus, TaskAssignee, TaskDue), TaskId (number, blank for stage/candidate events), TaskTitle (text), FromValue (**text snapshot** — history must survive stage/library edits), ToValue (text), ChangedBy (person), ChangedDate, Automated (yes/no). Append-only; indexed on Candidate + ChangedDate; default view filtered to the last 90 days. Who writes what: the app's status control writes CandidateStatus rows; F1/F3 write Stage rows; F3 writes task rows; F2 writes its own TaskDue rows (see §8).

**`ChangeLogArchive`** — same shape; receives an archived candidate's rows in the weekly sweep.

**`MetricsSnapshots`** — one row per night, appended by the deadline-scan flow: SnapDate, ActiveCount, DueCount, OverdueCount, CompletionRate. Makes the KPI cards' 30-day deltas exact instead of approximated, and feeds Power BI trend lines. ~365 rows/year.

**`Comments`** — Candidate (lookup), Task (lookup, optional), Body (multiline, rich text), Visibility (choice: Internal, Candidate-Visible), NotifyUsers (person, multi — replaces @mention parsing). Author/date = Created By/Created. Staff-visible working chatter; anything sensitive belongs in HRNotes.

**`HRNotes`** (HR-only) — Candidate (lookup), Body (multiline, rich text). Lives behind a **list-level permission break**: only the Admins group can read it, enforced by SharePoint, not the app.

**`CandidatesPrivate`** (HR-only) — 1:1 companion to Candidates (Candidate lookup + the fields HR designates as restricted: home address, personal phone, anything salary-adjacent). Same list-level permission break. The main Candidates list keeps what the pipeline needs — including the candidate's contact email, which the touchpoint flows read.

**`AppPermissions`** — User (person), Role (choice: HR, Manager, Viewer), NotifyChannel (choice: Email, Teams, Email + Teams; **default Email**). The in-app role source, same pattern as the Supply Order app's permissions list, doubling as the one notification preference. Security groups control *access*; this list controls *what the app shows* and *where notifications go*. Every app user gets a row at onboarding.

**`Departments`** — Title. **`Divisions`** — Title, Department (lookup). **`FacultyRanks`** — Title, RequiresPT (yes/no).

**`Onboarding Documents`** (document library, **Phase 1**) — folder per candidate (created by the expansion flow at candidate creation), Candidate lookup column; for working documents all app users may see (checklists, orientation packets). **`Onboarding Documents – Restricted`** (second library, HR-only via permission break) — same folder-per-candidate pattern, for licenses, signed letters, and anything carrying identifiers. The canvas Attachments control only works inside SharePoint forms, so the library + folder pattern (as in IRB) is the right fit.

### 5.2 Structural decisions and why

- **Due rules: 18 enum values → 2 columns (`Anchor` + `OffsetDays`).** "3 days before LOO accepted" = Anchor: LOO Accepted, Offset: −3. "On start date" = Start, 0. This covers 16 of the original 18 rules exactly; the two stage-relative rules (`days_before_stage` / `days_after_stage`) were never resolvable by the original estimation engine and are dropped.
- **Task definitions library folded into TemplateTasks.** A separate reuse library is over-normalization at this scale; titles/descriptions live on the template task row. Cloning a template clones its tasks.
- **Candidate stage-snapshot table dropped.** Tasks already carry StageName/StageOrder snapshots; the candidate's pipeline view derives from its own tasks.
- **Denormalize `CandName` (and stage fields) onto Tasks at creation.** SharePoint expands lookups **exactly one level** — a My Tasks list that needed Task → Candidate → Department would silently return blank on the second hop. Snapshot columns make every heavy screen single-list and delegation-friendly. The expansion flow writes them; a candidate name change triggers a small fix-up flow.
- **Watchers as a multi-person column** instead of a junction list — one Patch to follow/unfollow, direct fanout read in flows, and it closes the original's known gap (followers had no UI or API).
- **One unified `ChangeLog`** for stage moves *and* task-level changes (status, assignee, due date), stored as text snapshots so renames/deletions in the stage library never rewrite history. From→to values are captured by comparing each incoming change against the task's last logged value — SharePoint triggers don't supply prior state, so the log itself is the memory.
- **Partition by sensitivity, not by item.** SharePoint permissions are fragile at the item level but stable and server-enforced at the list level — so sensitive content gets its own HR-only containers (HRNotes, CandidatesPrivate, the Restricted library) instead of per-row trimming inside shared lists.

### 5.3 Volume + archival

The operational list that grows is Tasks (≈ hires/year × template size ≈ 600–1,500 rows/year). The archival flow moves a candidate's tasks to `TasksArchive` when the candidate hits Completed/Canceled/Archived + 30 days, keeping the active list well under the 500-row delegation stance. Power BI reads both lists, so reporting sees full history. `ChangeLog` grows fastest (~5–8k rows/year with task-level auditing) — it's append-only, indexed, default view filtered to 90 days, and the same sweep moves an archived candidate's rows to `ChangeLogArchive`. `MetricsSnapshots` adds one row per night. All other lists stay naturally small. (SharePoint's view threshold is 5,000 **per query**, not per list — archive lists live past it behind indexed, filtered views, and Power BI imports them whole regardless.)

## 6. Security model — Entra groups

**Groups** (assigned membership, per the app-per-group UAB pattern). Access is granted **per list, never site-wide** — the default for any new list is no access until deliberately granted:

| Group | Grants |
|---|---|
| `OBGYN-OnBoardPro-PA` | App **User** · **Edit on Tasks + Comments**, **Read on the operational lists** (Candidates, Stages, the Templates set, ChangeLog, reference data) and the general Onboarding Documents library · **no access to the HR-only containers** · run-only on app-called flows |
| `OBGYN-OnBoardPro-Admins-PA` | App User · **Edit on all lists**, including HRNotes, CandidatesPrivate, and the Restricted library · flow co-ownership stays individual |

**In-app roles** come from the `AppPermissions` list (HR / Manager / Viewer), checked on app start — the Supply Order pattern, avoiding a Graph/Groups connector call (which would be a new-connection decision at UAB). Six original roles collapse to three:

| Original | Rebuild |
|---|---|
| system_admin, hr_staff | **HR** — full candidate/template/admin surface |
| department_admin, division_leader, manager | **Manager** — sees candidates where they're Manager, PrimaryOwner, or a Watcher; works tasks |
| (any assignee) | **Viewer** — My Tasks + read-only candidate context |
| candidate | dropped as an app role (candidates are records; §12) |

**Say it plainly — the enforced boundaries and the UX ones.** The *operational pipeline* (who's being hired, stages, tasks) is readable by every app user, by design — that visibility is half the point. *Sensitive content* (HRNotes, CandidatesPrivate, the Restricted library) is HR-only and **server-enforced**: a non-HR user hitting the list URL directly is denied by SharePoint, not just hidden by the app. What remains UX-only: the app's manager-scoped filtering (any app user can read any candidate row directly), and Edit on Tasks means a user could edit someone else's task via the list UI — mitigated by the F3 write-path guard (§8), which reverts rule-violating edits from ChangeLog and notifies. **Item-level permission trimming (managers see only their own candidates) is deliberately deferred** — not a requirement today; if stakeholders push back, the SharePoint connector's `Grant access to an item or a folder` action supports it at this scale on the Candidates list only, at the cost of a permission-sync flow. If enforced row-level security across the board ever becomes a hard requirement, that is the Dataverse trigger (§14).

Onboarding a user = adding them to the group + one AppPermissions row (Role + NotifyChannel; defaults Viewer, Email). Never per-user grants.

## 7. Canvas app

UAB design system (`uab-canvas-design`), same construction discipline as MOMPOD/IRB. Screens:

| Screen | Contents |
|---|---|
| **Dashboard** | KPI cards (Active Candidates, Due ≤7 Days, Overdue, Completion Rate), Upcoming Starts, Urgent Tasks, Recent Activity (from ChangeLog + recent tasks/candidates) |
| **Candidates** | search + filters (status, type, stage, phase); New Candidate dialog with the original's validation gates: LOI required, template required, rank required for Faculty types, **P&T check** (rank requires P&T → template must contain a Requires-P&T prerequisite task); restricted fields captured here write to CandidatesPrivate |
| **Candidate detail** | header + status control (enforcing the transition matrix in-app: e.g. Canceled → Active only; Completed blocked while required tasks remain open — with the remaining list shown); anchor-date editing (LOO accepted triggers expansion); progress bar by stage; **Tasks-by-stage** tab; **Comments** tab (flat, visibility flag, NotifyUsers picker); **Timeline** tab (ChangeLog: stage moves + task-level changes); **Documents** tab (the candidate's folders — general and, for HR, Restricted); **HR Notes** tab (HR-only list — hidden for others in the app, and server-enforced regardless); Watchers management |
| **My Tasks** | counters (To Do / In Progress / Due Soon / Overdue), search, status+priority filters — reads only Tasks (denormalized columns; no joins) |
| **Templates** | list + editor: stages (ordered, phase-tagged) → tasks (anchor/offset due rules, assignee kind, priority, category, required/prereq/approval flags); activation readiness check (≥1 stage, every stage has a task, every Fixed rule has a date, every role slot has a role); clone-from-existing |
| **Admin** | Departments/Divisions/Ranks/Stages CRUD; AppPermissions management (role + NotifyChannel; users can change their own channel) |

Construction rules applied from the playbook (non-negotiable, each one a verified failure class):
- **Every `Patch`/`Remove` wrapped in `IfError`** with the user left in place on failure (the unguarded green-"Saved"-that-lost-data trap).
- Control-dependent `Filter` sources wrapped in **`FirstN(list, 500)`**; delegation-warning count tracked as a baseline, not "fixed".
- Choice columns read `.Value`; lookups written as `{Id, Value}` records; **no two-hop lookup paths anywhere** (denormalized columns exist so none are needed).
- Blank-safe guards on every variable and `ComboBox.SelectedItems`; `Coalesce` on any yes/no column added after rows exist (defaults don't back-fill; blank ≠ false).
- Twin-gallery pagination where a list view needs counts/exports.
- Derived statuses (due-soon buckets, pipeline progress) computed by UDF from dates, never stored.
- Layout audited with `audit-canvas-ui.py` before any screen is called done.

## 8. Power Automate flows

All flow names clean and descriptive (no tooling/AI attribution, per standing rule). Standard connectors only. Flow-design rules from the playbook: app-called flows use the **respond-first pattern** (Response within seconds, work chained on `[Succeeded, Failed, Skipped]` — the 120-second wall fails the *response*, not the work); SharePoint connector writes use flat `item/Field` keys and `item/X_LookupId` for lookups; every rename greps the whole definition; adaptive cards built as Compose **objects** and posted via `string()` (splicing text into card JSON breaks intermittently on quotes/newlines).

**F1 — `OnBoard - Apply Template`** (PowerAppsV2: candidateId, mode)
Called at candidate create (mode = prerequisites) and on LOO acceptance (mode = full; also the manual re-apply path). Responds immediately, then: reads template stages + tasks → computes DueDate per task from Anchor/Offset against the candidate's dates (missing anchor → PendingAnchor = yes) → resolves assignee (Person → person; Manager → candidate's manager; HR → unassigned+HR-flagged; Candidate → unassigned, candidate-touchpoint emails handle it) → bulk-creates Tasks with denormalized columns → stamps TemplateApplied / PrereqsExpanded → sets CurrentStage to first stage → writes the initial ChangeLog stage row **dated at the LOI date** (the original's deliberate truthful-timeline behavior) → creates the candidate's folder in Onboarding Documents → fires assignment notifications. Every row F1 writes is stamped `UpdatedVia: Flow`, so F3 stays quiet during expansion — F1 owns its own notifications (otherwise F3 would double-fire on every created task). ~30 creates ≈ seconds (creates are cheap; deletes are the throttled direction).

**F2 — `OnBoard - Anchor Dates Changed`** (SharePoint modified-trigger on Candidates, trigger condition on the three anchor columns via a hash column, or app-called on date save — decide during build; app-called is simpler and avoids trigger-loop guards)
Recomputes DueDate/PendingAnchor for all the candidate's open tasks; only writes rows that changed. If LOO Accepted was newly set and TemplateApplied is blank → calls the F1 logic (defensive fallback, as the original had). Auto-completes a task titled "Send Offer Letter" if present and open. F2 stamps its writes `UpdatedVia: Flow` and appends its own ChangeLog TaskDue rows — F3 skips flow-authored writes, so any flow that changes tasks must log what it changed.

**F3 — `OnBoard - Task Changed`** (SharePoint created/modified trigger on Tasks, with trigger conditions skipping flow-authored writes via the `UpdatedVia` sentinel column)
On assignment → notify assignee (§10). Every status/assignee/due-date change is appended to **ChangeLog** (from-value = the task's last logged value, since SharePoint triggers don't carry prior state). On completion/cancel of a required task → **stage advancement check**: if the candidate's current stage has zero open required tasks, advance to the next stage with open required work (loop), write the ChangeLog stage row (`Automated: yes`), notify manager + watchers; recompute `Blocked` if open tasks exist in earlier stages (auto-regress from the original is dropped — HR handles regressions manually). F3 also carries the **write-path guard**: an out-of-app edit that breaks a rule the app enforces (required task canceled without a reason; status changed by someone who is neither the assignee nor HR) is reverted from the task's last ChangeLog value (the revert itself stamped `UpdatedVia: Flow` so it doesn't re-trigger) and generates a notification — direct-list bypass becomes a visible, self-healing event instead of silent drift.

**F4 — `OnBoard - Comment Posted`** (created trigger on Comments)
Notifies NotifyUsers + candidate's manager + watchers (minus the author). Candidate-visible comments additionally email the candidate.

**F5 — `OnBoard - Approvals`** (see §9).

**F6 — `OnBoard - Daily Deadline Scan`** (recurrence, weekday mornings)
Due-soon (≤7 days, not yet stamped) and overdue tasks → one **email digest** per assignee listing their items (plus a Teams card for opt-ins); stamps `DueNotified` so a task never re-nags unless its due date changes (the original's idempotency-key semantics, one column instead of a table). Also: the candidate-touchpoint pass — candidate-role tasks due soon generate the external email to the candidate — and the nightly `MetricsSnapshots` append (active, due, overdue, completion rate) that powers exact 30-day KPI deltas.

**F7 — `OnBoard - Archive Sweep`** (recurrence, weekly)
Moves tasks of 30-day-terminal candidates to TasksArchive, and their ChangeLog rows to ChangeLogArchive (create-then-delete; deletes throttled ~10s/row at concurrency 8 — budget minutes, verify end-state with a read-back pass, per playbook).

Build-order caveat (verified failure class): after any change to an app-called flow's **connections**, and after any **definition patch made outside Studio while a coauthoring session is open**, the maker must refresh/reload Studio or `.Run()` fails silently with **no run in history**. Patch flows before app testing sessions, and read run history before touching formulas when "the button does nothing."

## 9. Approvals

Kept deliberately thin: an approval is a property of a task, not a parallel system.

- Template tasks flagged **NeedsApproval** (e.g. offer sign-off, P&T review, credentialing sign-off).
- When such a task's stage becomes current, F3 hands the newly-current stage's NeedsApproval tasks to F5, which sends **`Start and wait for an approval`** (Approve/Reject) to the task's resolved assignee. Approve → task marked Done (audit note in task Notes); Reject → task set Blocked, HR notified with the comments.
- **Checked against current docs:** approval waits die at **28 days** — hiring timelines exceed that, which is exactly why approvals fire on *stage entry*, not at expansion. F5 still wraps the wait in a timeout branch that re-issues a fresh approval and notes the re-issue, so a slow approver never strands the flow.
- **Assign to individuals, not groups**: per current Microsoft docs, group-assigned approvals send **no Teams notification** and only mail-enabled groups get email. F5 resolves the concrete person first (falling back to the HR list from AppPermissions, expanded to individuals).
- Approvers act from the Teams Approvals app or the actionable email; the default approval email is left on (the known adaptive-card-staleness mismatch in Teams is cosmetic and acceptable).

## 10. Notifications through O365

Replaces the entire custom engine (in-app center, outbox, digests, quiet hours, SMTP, email-template editor). **Email is the primary channel** — everyone has it and reads it, while Teams adoption varies across the team. Each user picks their route via **`NotifyChannel`** on their AppPermissions row (**Email** default · Teams · Email + Teams); users can flip it themselves in the app, and flows look it up per recipient, falling back to Email when no row exists. **Critical notifications always email regardless of preference** — assignment, the deadline digest, approvals, blocked-candidate alerts. Teams is the opt-in accelerator, not the default.

| Event | Recipients (minus the actor) | Delivery |
|---|---|---|
| Task assigned | assignee | **email (always — critical)** + Teams card if opted in |
| Task completed | manager + watchers | per NotifyChannel (email default) |
| Stage changed | manager + watchers | per NotifyChannel; PrimaryOwner always emailed |
| Comment posted | NotifyUsers + manager + watchers | per NotifyChannel (email default) |
| Comment (candidate-visible) | + candidate | email (shared mailbox) |
| Due soon / overdue | assignee (daily digest, deduped) | **email digest (always — critical)** + Teams card if opted in |
| Approval needed | task assignee (individual) | Approvals — **actionable email (always)** + Teams Approvals app |
| Blocked candidate | HR + PrimaryOwner | **email (always — critical)** |
| Candidate touchpoints (offer accepted welcome, candidate-task reminders) | the candidate | email from shared mailbox |

Rules carried over from the original: actor never notifies themselves; dedupe by due-date stamp; candidate sees only candidate-visible content. Dropped: the rest of the per-user preference engine (per-event subscriptions, digest frequencies, quiet hours) — `NotifyChannel` is the one knob kept; Outlook rules cover the rest (§12).

**Email plumbing:** all mail via **Office 365 Outlook** (`SendEmailV2`, 300 calls/60s; set `Importance: Normal` explicitly — unset, it defaults to Low and mail arrives flagged "Low importance"). Candidate-facing mail from a **shared mailbox** via `Send an email from a shared mailbox (V2)`. The Mail connector (`shared_sendmail`) is deliberately **not** in this design — it exists for cases where senders or recipients lack usable mailboxes, which a campus-only user base doesn't have. HTML bodies follow the playbook rules: checked-in preview templates, Compose-object variable islands, inline images ≤100 KB quantized PNG (over the cap they silently arrive as broken boxes while the run reports Succeeded).

## 11. Power BI

Replaces the "Coming Soon" analytics page and the CSV/PDF export ambitions. Import mode over the SharePoint lists (Tasks + TasksArchive unioned), scheduled refresh (up to 8/day on shared capacity — hourly-business-day cadence is fine for this domain). All users are A5-licensed (Power BI Pro included), so the report serves every app user directly. **Row-level security** in the semantic model scopes what viewers see (HR: everything; managers: their own candidates) — enforced for report viewers regardless of list permissions, since the dataset reads with the author's credentials. Report pages:

1. **Pipeline** — candidates by stage/status, funnel, upcoming starts
2. **Throughput** — time-in-stage (from ChangeLog), LOI→start lead time vs. template estimate
3. **Workload** — open/overdue tasks by assignee, category, priority
4. **History** — completion-rate trend, hires by type/division over time

Power BI's export (PDF/PPT) covers the reporting-artifact need natively. The canvas dashboard keeps its live KPI cards for the operational at-a-glance view; deep analysis lives here.

## 12. Deliberately dropped or simplified (with rationale)

| Original | Decision | Why |
|---|---|---|
| Local/LDAP/OAuth auth, sessions, CSRF, rate limiting, invitations, SMTP settings + encryption | **Gone** | Entra + O365 own all of it — this was ~40% of the codebase and ~100% of the security findings (SBP-001/002/004 vanish; SBP-003's TLS risk-acceptance becomes moot) |
| In-app notification center, outbox, digests, quiet hours, per-user preference engine | **Gone, except one knob** | Outlook + Teams are the notification center; the only preference kept is `NotifyChannel` (email default) on AppPermissions |
| Email template editor + branding settings | **Simplified** | Flow-embedded HTML templates, authored as checked-in preview files (playbook pattern) |
| Threaded comments + @mention parsing | **Simplified** | Flat comments + a NotifyUsers person picker (explicit > regex) |
| Six roles + department/division/manager scope tables | **Simplified to 3** | At department scale, scoping collapses; group membership is the real boundary (§6) |
| Auto-regress-on-prior-open toggle | **Dropped** | Forward advance + a Blocked flag; regression is a human decision |
| Candidate self-service login (`linkedUserId`, sanitized views, `candidate.self` resolution) | **Deferred** | Candidates get email touchpoints; if self-service returns, it's a separate lightweight surface (or the Dataverse/Power Pages trigger) |
| Stage-relative due rules | **Dropped** | Unimplementable in the original too (its own docs warned dates couldn't be previewed) |
| Task-definition library, stage-snapshot table, audit_log table | **Folded/replaced** | §5.2; ChangeLog (stage + task-level, reportable) + version history + run history cover audit needs |

## 13. Improvements over the original

1. **Watchers actually work** — multi-person column + UI; the original's followers table had no way to be populated.
2. **Analytics exists** — Power BI instead of a placeholder page.
3. **Approvals are real approvals** — auditable Teams/Outlook approvals instead of ordinary tasks for sign-offs.
4. **Due rules are comprehensible** — Anchor + Offset reads exactly like HR thinks ("2 weeks before start").
5. **Notifications are actionable** — approvals are decided right in the actionable email or Teams card, and every notification deep-links into the work; the custom app's emails were read-only.
6. **Zero credential surface** — nothing to pentest, rotate, or risk-accept.
7. **Task-level audit is reportable** — every status, assignee, and due-date change lands in ChangeLog and is queryable in Power BI; the original's audit table had no reporting surface.

## 14. Dataverse path (unlikely, kept cheap)

Triggers that would justify it: hard row-level security requirements, multi-department expansion beyond list-scale volume, candidate self-service via Power Pages, or offline/mobile needs. The design keeps the door open: choice values match original enums, lookups map to relationships 1:1, flows isolate all write logic (only connectors change), and the canvas app's data layer is the standard swap. No speculative abstraction beyond that — porting this design to Dataverse later is mostly mechanical: mirrored tables, a Power Query dataflow for the bulk move (SharePoint → Dataverse is well-trodden), connector swap in the flows, app rebind, Power BI repoint.

The honest cost is licensing, not migration: A5 does **not** include Dataverse rights, so every user would need a Power Apps per-app or per-user premium license. Azure SQL is technically possible (also a premium connector) but forfeits the native canvas/flow integration — if this platform is ever outgrown, Dataverse is the move; SQL only if an external system must share the database.

## 15. Scalability & known limits

**Metric parity.** Every dashboard metric from the original is reproducible. Counts and filters are trivial at this scale; the one addition is **`MetricsSnapshots`** (one nightly row), which makes the KPI cards' 30-day deltas exact instead of approximated and gives Power BI its trend lines for free. Task-level auditing via ChangeLog goes *beyond* the original, whose audit table had no reporting surface.

**Capacity.** The governing number is the **active Tasks list**, not the candidate count:

| Tier | Active tasks | ≈ concurrent candidates (30-task template) | What it takes |
|---|---|---|---|
| Comfortable (the design) | < 500 | ~15–25 in flight | Nothing — everything evaluates locally |
| Fine with care | ≤ 2,000 | ~60–100 in flight | Raise the app row limit to 2,000; keep filters on indexed columns |
| Wrong platform | beyond | thousands in flight | Dataverse (§14) |

Lifetime volume is a non-issue for Candidates (decades to 5,000 rows at this hiring rate). Archive lists cross 5,000 in a few years and live happily past it behind indexed, filtered views; Power BI imports them whole regardless.

**Users.** Not a constraint. Group-shared canvas apps handle hundreds of users without design change; Patch sends deltas, so concurrent edits on different fields coexist; the O365 Outlook connector (300 calls/60s) clears even a 200-person digest in under a minute. This app's realistic 10–40 users leave an order of magnitude of headroom.

**Ownership & continuity (decided: HR co-owner).** An HR co-owner is added to the app and every flow. That is the real continuity mechanism: flows run on their owner's connections, and a co-owner can re-save them under their own connections if the primary account is ever disabled. A step further is a **licensed service account** from UAB IT owning the flows and their connections (it pairs naturally with the shared mailbox); true service principals can only own flows inside Dataverse solutions and still can't hold O365/SharePoint connections, so they don't apply here. Pursue the service account if IT offers one; the co-owner covers continuity meanwhile.

**Blind spots to manage (not solved by design):**
1. **Residual permission coarseness.** After partitioning (§6), what's still broadly readable is the operational pipeline — any app user can read any candidate's row, tasks, and staff comments via SharePoint directly. Sensitive content is server-enforced HR-only (HRNotes, CandidatesPrivate, the Restricted library), so the training rule shrinks to: *sensitive material goes in the HR-only containers, nowhere else.* Manager-scoped candidate visibility is **deferred by decision** (not a requirement today; revisit on stakeholder pushback — §6 records the mechanism if it comes). If enforced row-level security across the board ever becomes a requirement, it's the Dataverse trigger.
2. **Expansion idempotency is deliberate engineering.** F1 must check-and-set `TemplateApplied` and re-verify before bulk-creating; 30 creates aren't transactional, so the flow ends with a verify/upsert pass that makes re-running safe.
3. **Trigger-loop discipline.** F2 writes Tasks and F3 triggers on Tasks; F3 writes Candidates and F2 can trigger on Candidates. Sentinel columns + trigger conditions must be right on day one — the failure symptom is echo notifications and runaway runs.
4. **Notifications are near-real-time, not instant** — SharePoint triggers poll (~1–5 min). Set the expectation up front so it isn't reported as a bug.
5. **Editing an Active template doesn't touch in-flight candidates** — expansion snapshots by design. Correct behavior, but HR will ask; it belongs in training and the template guidance.

## 16. Caveats & gotchas checklist (plan verified against the playbook)

| # | Caveat | Where handled |
|---|---|---|
| 1 | Lists <500 rows by design; `FirstN` wrapping; delegation-warning baseline | §5.3 archival, §7 |
| 2 | SharePoint expands lookups exactly one level; collections don't hydrate | §5.2 denormalized columns — no two-hop paths exist |
| 3 | UAB: schema changes only via the kept utility flow (Graph/SPO REST blocked) | §17 build sequence |
| 4 | Internal names ≤32 chars, immutable, silently truncated | §5 naming; create-time verification against the field list |
| 5 | New-column defaults don't back-fill; Blank ≠ false | §7 Coalesce guards |
| 6 | Every Patch/Remove guarded with IfError | §7 |
| 7 | 120s Response wall on app-called flows → respond-first | §8 F1 |
| 8 | Deletes throttled ~10× harder than creates; verify end-state | §8 F7 |
| 9 | Flow lookup writes are `item/X_LookupId` (Id only), flat slash-keys | §8 |
| 10 | Stale flow registration after connection/definition changes → silent no-op; read run history first | §8 build-order caveat |
| 11 | Approvals: 28-day wait cap; group assignment loses Teams notification | §9 stage-entry timing, individual assignees |
| 12 | Adaptive cards as Compose objects + `string()` | §8 preamble |
| 13 | O365 Outlook only (campus-only user base; no Mail connector); Importance defaults Low — set Normal; inline images ≤100 KB quantized | §10 |
| 14 | No cascade delete in SharePoint → archive-not-delete everywhere | §5, §8 F7 |
| 15 | Attachments control only works in SharePoint forms | §5.1 library pattern instead |
| 16 | Canvas layout defects invisible to checkers → run the UI audit script | §7 |
| 17 | No new UAB connections/sites/groups without explicit sign-off | §2 decision log — nothing provisioned by this plan |
| 18 | No AI/tooling attribution in any artifact name | §8 flow names; applies to lists/apps too |
| 19 | Patch sends deltas — concurrent edits on different fields coexist; don't design around imagined clobbers | §7 (no extra locking built) |
| 20 | Power BI shared-capacity limits (8 refreshes/day, 2h refresh window) | §11 cadence fits |

## 17. Build sequence

1. **Provisioning prep** — Jon creates the site ("OBGYN Onboarding"), the two groups, and the shared onboarding mailbox (§2).
2. **Provision** — the 17 lists and the two document libraries via the schema-ops utility-flow route (snapshot → create → verify field internal names → diff), AppPermissions seed, **per-list permission wiring** (HR-only containers restricted to the Admins group — verify a non-HR test account is denied on each); add the HR co-owner to the app and flows as they're created.
3. **Reference data** — stages, departments/divisions, ranks; build one real template (the current Faculty hire process) as the pilot.
4. **Flows F1–F3** — expansion, anchor recompute, task-change/advancement. Test headlessly (connection-free clones / `resubmit`) before the app exists.
5. **Canvas app** — screens in §7 order (Dashboard last); Save/Publish checkpoints after every verified push; UI audit per screen.
6. **Notifications + approvals (F4–F6)** — with rendered-preview email sign-off before anything sends to a real person.
7. **F7 + Power BI** — archival sweep, report over live lists.
8. **Pilot** — one real candidate end-to-end (create → prereqs → LOO accepted → expansion → advance → complete), then group rollout.

Each phase lands independently; the app is useful from phase 5 even before approvals/BI exist.

## 18. Confidence assessment (Rev 4 review)

**Overall: 8.5 / 10** — buildable as specified; the residual risk is concentrated in the novel flow compositions, and every known risk is named in §15 with its mitigation.

| Dimension | Confidence | Basis |
|---|---|---|
| Fit to the original intent | 9/10 | Built from a full functional analysis of the canonical schema, routes, services, and docs — including behaviors the original's own docs got wrong |
| Data model on SharePoint | 9/10 | Every load-bearing pattern (denormalization, snapshots, archival, sensitivity partition) is either playbook-verified at runtime or standard platform behavior |
| Flows & automation | 7.5/10 | Respond-first, sentinel discipline, throttling, and email mechanics are runtime-verified; the ChangeLog compare-to-last mechanism and the F3 write-guard are sound but **novel compositions, unproven until the pilot** |
| Notifications & approvals | 8/10 | Email/Teams mechanics doc-checked 2026-07-30; the 28-day approval re-issue loop is designed but untested in this tenant |
| Security model | 8.5/10 | List-level permission breaks are well-understood and server-enforced; reaches 9+ only after the non-HR denial test (§17 step 2) passes |
| Scale & licensing claims | 9/10 | Verified against current Microsoft Learn: delegation, view threshold, connector limits, A5/Pro licensing |
| Effort estimate | 7/10 | The canvas app is the long pole and screens historically run over (MOMPOD/IRB experience); the six-screen scope is the schedule risk — which is the lean plan's argument |

What would raise the score fastest: a passing pilot of F1–F3 (expansion idempotency, advancement, write guard) plus the §17 step-2 denial test — together they cover the majority of the open risk.

---

*Sources: repo functional analysis (canonical `shared/schemas/*`, routes, services, docs/ — including the security cluster and pentest checklist); `power-platform-ops` playbook (runtime-verified caveats); Microsoft Learn (checked 2026-07-30: approvals limits & group behavior, canvas sharing with Entra groups, SharePoint delegation, connector limits, Power BI refresh).*
