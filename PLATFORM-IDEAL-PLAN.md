# OnBoardPro — The Lean O365-Native Alternative

**Date:** 2026-07-30 · **Rev 2** (reviewed alongside parity plan Rev 4; confidence assessment added — §9) · **Status:** Proposed alternative
**Companion to:** [PLATFORM-REBUILD-PLAN.md](PLATFORM-REBUILD-PLAN.md) (the parity rebuild). Same tenant, same licensing, same data backbone — this document only describes what differs.

---

## 1. Premise

The parity plan faithfully rebuilds the web app's shape: six canvas screens reproducing every surface the old app had. This plan asks a different question: **knowing the intent, what is the least system that delivers the workflow** on SharePoint + canvas apps + Power Automate + O365 + Power BI?

The observation driving it: most of the old app's surface area was screens whose jobs O365 already does.

| Old app surface | O365 already provides |
|---|---|
| Dashboard + analytics page | Power BI (pinned in Teams) |
| Notification center + bell | Outlook + Teams activity feed (email-primary) |
| My Tasks inbox | email digest + a `[Me]`-filtered list view (+ optional Teams cards) |
| Admin CRUD (departments, ranks, stages) | Microsoft Lists UI |
| Template editor | Microsoft Lists UI + a validation flow |
| Sign-off tasks | The Approvals app |

Custom UI earns its place only where the domain demands **guarded, cross-list orchestration**: creating a candidate correctly, and running a candidate's pipeline. Everything else rides native surfaces.

## 2. What stays custom — a two-screen canvas app

1. **New Candidate wizard.** The creation gates genuinely need guarded UI: LOI date + template required, faculty rank required for Faculty types, and the P&T check (a rank that requires P&T must pair with a template containing a Requires-P&T prerequisite task). A native list form can't enforce cross-list rules; the wizard can, and it's one screen.
2. **Candidate cockpit.** The one screen where cross-list context matters: header + status transitions (the enforced matrix — e.g. Completed blocked while required tasks remain open, with the blockers listed), anchor dates (LOO acceptance triggers expansion), tasks-by-stage with inline status/assignee edits, watchers, comments, timeline, the candidate's document folders (Phase 1), and the HR Notes tab (backed by the server-enforced HR-only HRNotes list). This is the old app's 1,600-line centerpiece and it stays — it's the part that was actually valuable.

*(Optional screen 3: My Tasks. Hold it back — the Teams agenda card plus a "My open tasks" list view may make it unnecessary. Let the pilot decide; adding it later is cheap because the Tasks list is already denormalized for exactly that screen.)*

All parity-plan construction rules apply unchanged (IfError on every write, FirstN delegation guards, blank-safe variables, UI audit).

## 3. What goes native

**Template authoring → Microsoft Lists.** HR edits `TemplateTasks` in a grouped-by-stage list view with column validation and choice pills. A **"Validate Template" flow** (button/selected-item trigger) runs the readiness rules — every active stage has ≥1 task, every Fixed rule has a date, every role slot has a role, offsets sane — and either flips the template to Active or posts a Teams card listing what's wrong. Rationale: template authoring is HR-only and happens a few times a year, yet the drag-drop editor is the single most expensive screen in both the old app and the parity plan. A grouped list view plus a validating flow gets 90% of the value for ~5% of the build.

**Reference data → Microsoft Lists.** Departments, divisions, ranks, stages: native forms, version history, done.

**Dashboard → Power BI only.** No canvas KPI screen. The report (pipeline, throughput, workload, history — same four pages as the parity plan) is pinned as a Teams tab and linked from the app; every user can open it, since all users carry A5 licenses (Power BI Pro included). Operational numbers ("due this week") also arrive in the daily digest, below.

**Task inbox → your inbox (email-first, Teams opt-in).** Email is the primary route — everyone has it; Teams usage varies across the team. Each user's `NotifyChannel` (on AppPermissions: **Email** default · Teams · both) picks the route; **critical notifications always email**.
- **Assignment email** when a task is created/assigned: title, candidate, due date, deep links to the cockpit (`Param("candidateId")`) and the list item. Opted-in users get a Teams card too.
- **Daily agenda email** (weekday mornings, one per person with open work): overdue first, then due ≤7 days, grouped by candidate, with links. The Teams variant is a card — deliberately **informational, not interactive**: "wait for a response" cards hold a flow run open per card and take one response, a poor fit for a digest. Links beat embedded buttons.
- **Overdue escalation** (weekly): manager + HR get a rollup of anything overdue >7 days.

**Sign-offs → Approvals** (identical to parity plan §9: fire on stage entry, assign individuals, re-issue on the 28-day timeout).

**Candidate experience → an email drip, not a portal.** Template tasks with `AssigneeRole = Candidate` become scheduled touchpoints from the shared mailbox: welcome-on-acceptance, document requests, first-day info. The candidate "experience" is defined per template, in data — no candidate-facing UI at all.

## 4. A working day

HR creates a candidate in the wizard → prerequisite tasks appear and the P&T reviewer gets an Approval when that stage arrives. Offer accepted → HR sets one date in the cockpit; the checklist materializes; every assignee gets an assignment email (Teams card if they opted in). People work from morning agenda emails; sign-offs are decided from the approval email or the Teams Approvals app; the candidate gets their document-request email without anyone sending it. HR watches the cockpit and the Power BI tab. **Most participants never open the canvas app at all** — only HR and managers do, and only for the two screens that earn it.

## 5. Flow set

F1–F7 carry over exactly as specified in the parity plan — including the `UpdatedVia` sentinel discipline and each flow's ChangeLog duties (expansion, anchor recompute, task-change/advancement, comments, approvals, deadline scan, archive sweep). Add:

- **F8 — `OnBoard - Validate Template`** (selected-item trigger on Templates): the readiness check that replaces the in-app editor's validation.
- F6 absorbs the **agenda digest** (email; Teams card for opt-ins) and candidate-drip sends (it already scans deadlines daily).

Net: one more flow than parity, several fewer screens.

## 6. Cost and trade-offs

| | Parity plan | Lean plan |
|---|---|---|
| Canvas screens | 6 (dashboard, candidates, cockpit, my tasks, templates, admin) | **2** (wizard, cockpit) |
| Flows | 7 | 8 |
| Native Lists config | minimal | grouped views, validation, formatting |
| Power BI | 4 pages | same 4 pages, now the *only* dashboard |
| Build effort | the canvas app is the long pole (per MOMPOD/IRB experience) | roughly **halves** the canvas effort |

Honest trade-offs:

1. **Native list editing is less guarded than app forms.** Column validation + the validate flow + version history mitigate, but a determined editor can enter odd template data that only surfaces at validation time. (The parity plan's editor prevents it at entry.)
2. **Two UIs for HR** — Lists for authoring, the app for operating. Acceptable for a few-times-a-year activity, but it is a context switch and a training note.
3. **Less branded polish** for leadership demos — the cockpit and the Power BI report carry the demo instead of a full app.
4. **Notification fatigue is real either way.** Email-primary with per-user `NotifyChannel` opt-ins keeps the default in the tool everyone reads; the digest pattern (one morning email, not one per task) is what keeps it tolerable.

## 7. Considered and rejected

- **Planner as the task store** — no custom fields (anchors, offsets, stages, required/prereq flags), weak reporting, no delegable queries. The domain outgrows it immediately. A **one-way mirror** of assigned tasks into Planner/To Do (standard connector) is feasible if the pilot shows people living in those tools — but it creates a second source of truth and a sync/mapping burden, so it's a post-pilot consideration, not a v1 feature.
- **The out-of-box "New employee onboarding" SharePoint template** — a communications site for new-hire content, not a pipeline tracker. Could complement later; doesn't compete.
- **Dataverse / Power Pages candidate portal** — premium licensing and outside the stated constraints; remains the §14 escape hatch in the parity plan.
- **Interactive agenda cards with completion buttons** — each "wait for response" card parks an open flow run and takes one response only; wrong shape for a daily digest (see §3).

## 8. Recommendation

**These plans aren't rivals — they share the backbone.** Identical lists, identical flows F1–F7, identical security model (including the sensitivity partition — HR-only containers are server-enforced in both), identical caveats checklist (parity plan §16 applies to the platform, not the screens). The only real question is how much custom UI to build, and when.

Start lean: wizard + cockpit + flows + Power BI + native Lists. Pilot with one real hire. Then let observed friction — not speculation — justify each additional screen, in the order the parity plan already specifies (My Tasks first if assignees ask for it; the template editor last, and probably never).

That sequencing also front-loads the approval story: the pilot exists weeks earlier, and everything a reviewer would scrutinize (identity, mail, storage) is native M365 either way.

## 9. Confidence assessment (Rev 2 review)

**Overall: 8 / 10** — wider variance than the parity plan, and higher expected value if the pilot-first premise holds.

| Dimension | Confidence | Basis |
|---|---|---|
| Shared backbone (lists, flows, security, scale) | inherits parity §18 scores | identical by construction |
| Execution risk | 9/10 | Two screens instead of six removes the parity plan's biggest schedule risk (the canvas app is historically the long pole) |
| Lists-based template authoring | 6.5/10 | Mechanically sound, but HR acceptance of the Lists UI is the one genuinely untested UX bet; the validate-flow safety net bounds the damage |
| Email digest / task-inbox adoption | 7.5/10 | Email-primary matches the team's stated habits; digest fatigue is the watch item |
| Reversibility | 9.5/10 | Every lean choice upgrades to its parity equivalent without rework — same data, same flows; screens are additive |

The two plans share ~80% of their risk profile because they share the backbone. The lean plan trades a **known cost** (six screens of canvas work) for one **unknown** (will HR accept Lists-based template authoring?) — an unknown the pilot resolves with its first real template. Recommendation unchanged: **start lean, let the pilot vote.**
