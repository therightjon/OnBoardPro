# OnBoardPro — The Lean O365-Native Alternative

**Date:** 2026-08-02 · **Rev 3** (template editor committed — HR usability; responsive layout; exec report subscriptions) · **Status:** Proposed alternative
**Companion to:** [PLATFORM-REBUILD-PLAN.md](PLATFORM-REBUILD-PLAN.md) (the parity rebuild). Same tenant, same licensing, same data backbone — this document only describes what differs.

---

## 1. Premise

The parity plan faithfully rebuilds the web app's shape: six canvas screens reproducing every surface the old app had. This plan asks a different question: **knowing the intent, what is the least system that delivers the workflow** on SharePoint + canvas apps + Power Automate + O365 + Power BI?

The observation driving it: most of the old app's surface area was screens whose jobs O365 already does.

| Old app surface | O365 already provides |
|---|---|
| Dashboard + analytics page | Power BI (pinned in Teams) |
| Notification center + bell | Outlook + Teams activity feed (email-primary) |
| My Tasks inbox | the digest is native push; the live view stays custom (§2 — promoted after review) |
| Admin CRUD (departments, ranks, stages) | Microsoft Lists UI |
| Template editor | *stays custom — reversed 2026-08-02 for HR usability (§2)* |
| Sign-off tasks | The Approvals app |

Custom UI earns its place only where the domain demands **guarded, cross-list orchestration**: creating a candidate correctly, and running a candidate's pipeline. Everything else rides native surfaces.

## 2. What stays custom — a four-screen canvas app

1. **New Candidate wizard.** The creation gates genuinely need guarded UI: LOI date + template required, faculty rank required for Faculty types, and the P&T check (a rank that requires P&T must pair with a template containing a Requires-P&T prerequisite task). A native list form can't enforce cross-list rules; the wizard can, and it's one screen.
2. **Candidate cockpit.** With no separate list screen, the cockpit doubles as browse + detail: it opens on a candidate picker (search by name; filter by status/stage/division, defaulting to the user's division when AppPermissions sets one), then shows the one screen where cross-list context matters: header + status transitions (the enforced matrix — e.g. Completed blocked while required tasks remain open, with the blockers listed), anchor dates (LOO acceptance triggers expansion), tasks-by-stage with inline status/assignee edits, watchers, comments, timeline, the candidate's document folders (Phase 1), and the HR Notes tab (backed by the server-enforced HR-only HRNotes list). This is the old app's 1,600-line centerpiece and it stays — it's the part that was actually valuable.

3. **My Tasks.** Committed (decided 2026-08-01, previously held back for the pilot): a push digest can't answer *did my completion register, what's left, what arrived since this morning* — people want live eyes on their own work, and that's pull, not push. It's also the cheapest screen in the design by construction: the Tasks list is denormalized precisely so this screen reads one list with no joins. Digest links land here.
4. **Template editor.** Committed (decided 2026-08-02, previously the plan's biggest cut): the HR staff are not tech-savvy, and template authoring is their one recurring build-like activity — a raw Lists view was the wrong ask for exactly the users who'd do it. Same spec as parity §7: ordered, phase-tagged stages; per-task due rules, assignees, and flags; **in-app readiness validation** with failures named inline; clone-from-existing. It is the most expensive screen in the design — accepting that cost is the point of the decision.

All parity-plan construction rules apply unchanged (IfError on every write, FirstN delegation guards, blank-safe variables, UI audit).

## 3. What goes native

**Template authoring — stays custom (reversed 2026-08-02).** This was originally the plan's biggest cut: authoring in a grouped Microsoft Lists view with a validation flow. Reversed by decision — the HR staff are not tech-savvy, and a raw list view was the wrong ask for the one recurring HR activity that most resembles building something. The template editor screen joins the lean scope (§2, item 4), with readiness validation in-app.

**Reference data → Microsoft Lists.** Departments, divisions, ranks, stages: native forms, version history, done.

**Dashboard → Power BI only.** No canvas KPI screen. The report (pipeline, throughput, workload, history — same four pages as the parity plan) is pinned as a Teams tab and linked from the app; every user can open it, since all users carry A5 licenses (Power BI Pro included). Executives get it pushed: **Power BI email subscriptions** send a scheduled snapshot of the Pipeline page to leadership inboxes — native, zero build, A5-covered. Operational numbers ("due this week") also arrive in the daily digest, below.

**Task inbox → your inbox (email-first, Teams opt-in).** Email is the primary route — everyone has it; Teams usage varies across the team. Each user's `NotifyChannel` (on AppPermissions: **Email** default · Teams · both) picks the route; **critical notifications always email**.
- **Assignment email** when a task is created/assigned: title, candidate, due date, deep links to the cockpit (`Param("candidateId")`) and the list item. Opted-in users get a Teams card too.
- **Daily agenda email** (weekday mornings, one per person with open work): overdue first, then due ≤7 days, grouped by candidate, linking into the **My Tasks screen** (single tasks deep-link to the cockpit). It's a **standing agenda** — overdue items keep appearing daily until resolved; the `DueNotified` stamp governs only one-time event alerts, never the agenda. The Teams variant is a card — deliberately **informational, not interactive**: "wait for a response" cards hold a flow run open per card and take one response, a poor fit for a digest. Links beat embedded buttons.
- **Overdue escalation** (weekly): manager + HR get a rollup of anything overdue >7 days.

**Sign-offs → Approvals** (identical to parity plan §9: fire on stage entry, assign individuals, re-issue on the 28-day timeout).

**Candidate experience → an email drip, not a portal.** Template tasks with `AssigneeRole = Candidate` become scheduled touchpoints from the shared mailbox: welcome-on-acceptance, document requests, first-day info. The candidate "experience" is defined per template, in data — no candidate-facing UI at all.

## 4. A working day

HR creates a candidate in the wizard → prerequisite tasks appear and the P&T reviewer gets an Approval when that stage arrives. Offer accepted → HR sets one date in the cockpit; the checklist materializes; every assignee gets an assignment email (Teams card if they opted in). People work from morning agenda emails into their My Tasks screen; sign-offs are decided from the approval email or the Teams Approvals app; the candidate gets their document-request email without anyone sending it. HR watches the cockpit and the Power BI tab. **Most participants never open the canvas app at all** — only HR and managers do, and only for the two screens that earn it.

## 5. Flow set

F1–F7 carry over exactly as specified in the parity plan — including the `UpdatedVia` sentinel discipline and each flow's ChangeLog duties (expansion, anchor recompute, task-change/advancement, comments, approvals, deadline scan, archive sweep). F6 absorbs the **agenda digest** (email; Teams card for opt-ins) and candidate-drip sends, as in parity. The formerly planned F8 validate-template flow is gone — the in-app editor (§2) carries the readiness check, same as parity.

Net: identical flow set to parity; two fewer screens.

## 6. Cost and trade-offs

| | Parity plan | Lean plan |
|---|---|---|
| Canvas screens | 6 (dashboard, candidates, cockpit, my tasks, templates, admin) | **4** (wizard, cockpit, my tasks, template editor) |
| Flows | 7 | 7 (F8 dropped with the editor decision) |
| Native Lists config | minimal | reference data + AppPermissions only |
| Power BI | 4 pages | same 4 pages, now the *only* dashboard (+ exec subscriptions) |
| Build effort | the canvas app is the long pole (per MOMPOD/IRB experience) | cuts roughly a **third** of the canvas effort (the dashboard, candidates-list, and admin screens) |

Honest trade-offs:

1. **Reference data still lives in the Lists UI** — departments, divisions, ranks, stages, AppPermissions. Rare, admin-level edits, realistically the maker's job rather than HR's; if even that proves awkward, the parity Admin screen is the add. *(The bigger version of this trade-off — template authoring in Lists — was retired 2026-08-02 by committing the template editor.)*
2. **Less branded polish** for leadership demos — the cockpit and the Power BI report carry the demo instead of a full app.
3. **Notification fatigue is real either way.** Email-primary with per-user `NotifyChannel` opt-ins keeps the default in the tool everyone reads; the digest pattern (one morning email, not one per task) is what keeps it tolerable.

## 7. Considered and rejected

- **Planner as the task store** — no custom fields (anchors, offsets, stages, required/prereq flags), weak reporting, no delegable queries. The domain outgrows it immediately. A **one-way mirror** of assigned tasks into Planner/To Do (standard connector) is feasible if the pilot shows people living in those tools — but it creates a second source of truth and a sync/mapping burden, so it's a post-pilot consideration, not a v1 feature.
- **The out-of-box "New employee onboarding" SharePoint template** — a communications site for new-hire content, not a pipeline tracker. Could complement later; doesn't compete.
- **Dataverse / Power Pages candidate portal** — premium licensing and outside the stated constraints; remains the §14 escape hatch in the parity plan.
- **Interactive agenda cards with completion buttons** — each "wait for response" card parks an open flow run and takes one response only; wrong shape for a daily digest (see §3).

## 8. Recommendation

**These plans aren't rivals — they share the backbone.** Identical lists, identical flows F1–F7, identical security model (including the sensitivity partition — HR-only containers are server-enforced in both), identical caveats checklist (parity plan §16 applies to the platform, not the screens). The only real question is how much custom UI to build, and when.

Start lean: wizard + cockpit + My Tasks + template editor + flows + Power BI + native Lists for reference data. Pilot with one real hire. The only parity extras left are the Dashboard and Admin screens — add either on demand; neither blocks anything.

That sequencing also front-loads the approval story: the pilot exists weeks earlier, and everything a reviewer would scrutinize (identity, mail, storage) is native M365 either way.

## 9. Confidence assessment (Rev 2 review)

**Overall: 8.3 / 10** — the template-editor decision removed the plan's biggest unknown and narrowed the gap to parity; what remains lean is a smaller, fully known trade.

| Dimension | Confidence | Basis |
|---|---|---|
| Shared backbone (lists, flows, security, scale) | inherits parity §18 scores | identical by construction |
| Execution risk | 8/10 | Four screens instead of six still trims the schedule, but the template editor's return brings back the single most expensive screen — the biggest remaining build risk |
| Template authoring | 8.5/10 | The untested Lists-UI bet was removed by decision (2026-08-02) — the in-app editor is a known quantity; the cost moved into the build |
| Email digest / task-inbox adoption | 8/10 | Email-primary matches the team's stated habits; the committed My Tasks screen supplies the pull surface (the digest is just the prompt), leaving digest fatigue as the remaining watch item |
| Reversibility | 9.5/10 | Every lean choice upgrades to its parity equivalent without rework — same data, same flows; screens are additive |

The two plans now share ~90% of their risk profile — the backbone was always identical, and the template-editor decision removed the last big divergence. What's left of "lean" is a smaller, known trade: three fewer screens (dashboard, candidates list, admin), each replaced by a native surface, each addable later without rework. Recommendation unchanged: **start lean, let the pilot vote on the remaining three.**
