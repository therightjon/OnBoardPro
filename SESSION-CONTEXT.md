# OnBoardPro — Session Context (read me first)

**Updated 2026-08-11.** This repo's custom web app is being **rebuilt on SharePoint + Power
Platform** (the web app stalled at security approval). This doc is the resume point: state,
working practices, and what's next. Read it with:

- [PLATFORM-REBUILD-PLAN.md](PLATFORM-REBUILD-PLAN.md) — master plan (Rev 5): data model §5, security §6, flows §8, **decision log §2** (14 decisions), scalability §15, caveats checklist §16
- [PLATFORM-IDEAL-PLAN.md](PLATFORM-IDEAL-PLAN.md) — the **chosen build shape** (lean, Rev 3): four-screen canvas app
- [USER-STORIES.md](USER-STORIES.md) — acceptance criteria
- [provision/INVENTORY.md](provision/INVENTORY.md) — **every provisioned artifact**: site, list GUIDs, group/principal IDs, flow IDs, verification records, demo data

## Build state (plan §17 sequence)

| Step | Status |
|---|---|
| 1–2 Site, groups, lists, permissions | ✅ Done + verified (non-HR denial test passed; PA in Visitors) |
| 3 Reference data + pilot templates | ✅ Seeded; **two strawman templates (Draft) awaiting HR markup** — [provision/TEMPLATE-REVIEW.md](provision/TEMPLATE-REVIEW.md) |
| 4 Flows F1–F7 | ✅ **All seven live and individually verified** against real data (see inventory) |
| 5 Canvas app | 🔨 **IN PROGRESS** — app **"OnBoard Pro"** `75df6b41-2049-4423-890c-e7e3e6d506f9` (responsive template, 13 SharePoint data sources connected, F1 added by Jon). **Scaffold + My Tasks pushed and server-verified 2026-08-11** (double-push protocol, diff-proven; child order clean; Screen1 gone). `canvas/src/` = **canonical server baseline** (adopted post-push); [canvas/gen_app.py](canvas/gen_app.py) generated the initial scaffold — future screens go on top of the canonical files. Contents: App.pa.yaml (UAB tokens, MyRole/IsHR/IsManagerOrHR off AppPermissions, task status/due pill UDFs, StartScreen=scr_mytasks) + scr_mytasks (twin-gallery 8/page, All/Overdue/7-day filters, one-tap Done via Classic/Icon + IfError + `UpdatedVia: "App"`, HR sees unassigned HR-role tasks, **phone-responsive**: ScreenSize.Small collapses rail to 64px + Due/Status columns to width 0, subline absorbs due text and turns Danger when overdue) + 3 stubs (scr_candidates/scr_new_candidate/scr_templates, HR-gated nav items ordered last). My Tasks polished per Jon's review (header wrap-clip fixed, phone filter widths, 72px phone rows, stage dropped from phone subline, 5px scroll spacer; Jon's convention: center column headers over pill columns). **Cockpit stage 1 pushed + verified 2026-08-11** ([canvas/gen_cockpit.py](canvas/gen_cockpit.py)): picker (search + Status multi-select defaulting Active + Division defaulting to MyDivisionId, gold-tint selected row with conditional opaque fills — transparent fills get stripped) + header card (name/type/division/rank, stage + CandStatus + Blocked pills, Manager/Owner, 4 anchor dates as columns desktop / caption-value rows phone); selection = varSelCandId; deep link live: `Param("candidateId")` → StartScreen routes to cockpit + preselects. Delegation baseline: 22. **Header polished 2026-08-12**: every child sized to its real line box (26pt name needs 44px, not 38) and the card grown to 300/400 — the dates row was being clipped; `FriendlyName()` UDF reduces UAB's `"Last, First Middle (Campus)"` Entra display names to `"First Last"` for Manager/Owner (registered in the playbook's uab-environment.md; picker rows deliberately keep Last, First for surname scanning); phone stacks Manager/Owner on two lines and shortens the date captions. **`canvas/src/*.pa.yaml` is canonical** — it has diverged from [canvas/gen_cockpit.py](canvas/gen_cockpit.py) (Jon's Studio spacer + these fixes); apply targeted edits, never regenerate. Stage 2 next: tasks-by-stage with inline edits, anchor-date editing + status matrix, then comments/timeline, then HR Notes/documents/watchers |
| 6 Notifications/approvals | ✅ Built into F3–F6 (email-primary; functional-plain templates) |
| 7 Power BI | ⏭️ After app; MetricsSnapshots already accumulating (weekdays) |
| 8 Pilot | Zztest candidates 1–3 are live demo data |

## Working practices (hard-won today — follow these)

1. **Identity first**: `az account show` must say `jsteen@uab.edu` / tenant `d8999fe4…`. A
   `jsteen365@uab365.onmicrosoft.com` alias is also cached and CANNOT drive the flows API
   (`ConnectionAuthorizationFailed`). Switch: `az account set --subscription d8999fe4-76af-40b3-b435-1d8977abc08c`.
2. **All SharePoint ops** go through the schema-ops utility flow via
   [provision/flowdriver.py](provision/flowdriver.py) (`cycle <actions.json> <outdir>`).
   **Always `patch idle.json` after** — leave the flow as found.
3. **Flow authoring** is generator-scripted (`provision/gen_f*.py`), created/patched via
   classic REST with explicit `connectionReferences`. Connections: SharePoint `288fd460…`
   (Embedded), O365 Outlook `shared-office365-fbc5363a…` (jsteen, delivery-verified),
   Approvals `shared-approvals-bad56a70…`.
4. **Sentinel discipline**: every flow write to Tasks sets `UpdatedVia: "Flow"` (F3's trigger
   skips those) — except deliberate handoffs that set `"App"` so F3 processes them (F5 does
   this after approvals). Every flow that changes tasks logs its own ChangeLog rows.
5. **Set choice columns explicitly on every REST create** — defaults don't apply (TStatus
   came back null until F1 set "To Do").
6. **Python on this Mac has no SSL certs** — use curl for all HTTPS (flowdriver does).

## Deferred / parked (do not lose)

- **HR template markup** → apply to TemplateTasks lists, flip templates Active (activation = app-era readiness check)
- **Shared mailbox** `obgynonboarding@uab.edu` → create, then the **swap checklist in plan §10** (F4 Mail_Cand + F6 Mail_Touch actions move to `Send from shared mailbox (V2)`)
- **Email restyle to UAB design** — Jon's explicit decision: after the full build, one pass over ALL templates (assignment, stage-change, blocked, revert, comment, digest, touchpoint, approval-reject, F7 warn)
- **Teams cards** (NotifyChannel opt-in), **role-based edit guard** (needs app UpdatedVia semantics), **F2's unapplied-template alert email**, **manager email at expansion (F1)** — all deferred by design, recorded in inventory
- **Zztest cleanup before go-live**: candidates 1–3 + tasks + ChangeLog + archive rows + folders
- Optional: UAB IT **service account** for flow ownership; **HR co-owner** on app + flows as they're created
- **F5 timeout re-issue nudge**: P25D timeout clears ApprovalStarted; nothing re-fires it until the candidate row is next touched — consider a weekly touch in F6/F7 era

## Canvas-app phase notes (before starting)

- Plugin updated 2026-08-11: canvas-apps fixes landed for compile_canvas w/ component
  libraries (#111), skills stalling at compile (#112), session lifecycle docs (#113), MCP
  config scope (#120), codegen syntax (#97/#98/#100). **Re-verify the double-push rule
  empirically before assuming it's still required** — playbook discipline stands until observed otherwise.
- Load `power-platform-ops` + `uab-canvas-design` skills at session start (global rule).
- App name: **OnBoardPro** (clean name, no AI attribution). Add F1 (`OnBoard - Apply Template`,
  PowerAppV2: number=candidateId, text=mode) via Studio's flow pane — it was portal-born so it
  will appear. After adding, remember the stale-registration reload rules.
- Deep links target `.../Lists/Tasks/DispForm.aspx?ID=n` today — repoint digest/assignment
  links to the app (`Param("candidateId")`) once it exists.
- **From the Jul/Aug 2026 platform update** (blog, 2026-08-06):
  1. **Data Grid modern control went GA** — built-in search, sortable columns, row selection,
     rich column types, theming. Candidate to replace hand-built gallery grids for **My Tasks**
     and the cockpit's tasks-by-stage — *if* the coauthoring MCP compiles it; try it first,
     fall back to the playbook's twin-gallery patterns if not.
  2. **Modern-control property renames standardized** (FontColor→Color, FontSize→Size; toggle/
     checkbox GA'd; DisplayMode.View works now). The `uab-canvas-design` recipes may reference
     old property names — expect and fix compile errors from renames rather than assuming the
     recipe is wrong.
  3. **Modern icon library grew ~56 → ~180** (classic parity) and Modern Form's data-card/
     ResetForm fixes went GA — the wizard could use Modern Form instead of a hand-built form;
     decide at build time.
  (Flow Groups licensing GA is irrelevant here — all seven flows are standard-connector,
  user-context.)

## Flow architecture in one paragraph

F1 (app-called, respond-first) expands templates: prereq mode at creation, full mode on LOO
acceptance; idempotent via TemplateApplied/PrereqsExpanded claims; creates tasks with
denormalized CandName/Stage fields + folders + ChangeLog stage row dated at LOI. F2
(Candidates trigger) recomputes due dates diff-only, logs TaskDue rows, auto-completes
"Issue Letter of Offer" when LOOIssued arrives. F3 (Tasks trigger, skips Flow writes) is the
engine: ChangeLog diffs vs last-logged, cancel-without-reason revert guard, loop-free stage
advancement (min later stage with open required work; 5 = done), Blocked recompute,
assignment/stage/blocked emails. F4 (Comments trigger) fans out to NotifyUsers+manager+
watchers minus author; Candidate-Visible also emails the candidate. F5 (Candidates trigger)
starts Basic approvals for stage-current NeedsApproval tasks (ApprovalStarted = idempotency,
approver = assignee ?? first HR row), completes via App-sentinel handoff to F3. F6 (weekday
7am CT) sends standing-agenda digests + DueNotified-deduped candidate touchpoints + the
MetricsSnapshots row. F7 (Sun 10pm CT) archives Tasks+ChangeLog of 30-day-terminal
candidates (StatusChanged) with a verify pass.
