# Home screen — design

**Date:** 2026-11-20 · **Status:** draft for review · **Decided in chat:** everyone lands on Home with
role-aware content; managers see only their own candidates; "Home" is the first nav item.

Adds `scr_home`, the app's new landing screen: a live "what needs attention now" view, different per
role. It reverses the lean plan's "no canvas KPI screen" call (PLATFORM-IDEAL-PLAN), but only for
the operational slice — trends, throughput and history stay with Power BI.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| H1 | **Everyone lands on Home**, content by `MyRole`. Links carrying `candidateId` still open the cockpit. | One front door; the email deep link from F3 keeps working. |
| H2 | **HR sees the whole department; Managers only candidates where they are Manager, PrimaryOwner or a Watcher; Viewers only their own tasks.** | Chosen in chat. Matches plan §6: scoping is focus, not confidentiality (anyone can still read the pipeline). |
| H3 | **All numbers are live and exact — no snapshot.** | SharePoint delegates `Filter` with `=` on choice values (joined with `Or`) and `<`/`>` on dates; only `CountRows` runs locally, over a filtered set that stays small. The trap is "not Done" — `<>` never delegates, so open-task filters spell out `To Do` / `In Progress` / `Blocked`. MetricsSnapshots stays Power BI's history. |
| H4 | **Candidate drill-down stays on Home.** Tiles and stage counts filter Home's own list; a row opens the cockpit. Task tiles open My Tasks on its matching filter. | The Candidates picker only filters by search, status and division; adding stage/blocked filters means more controls on the app's heaviest screen (425 vs the 300 guideline). My Tasks already takes a preset through `varMyTasksFilter`. |
| H5 | **Home is the first rail item** on all nine screens, stamped by `rail_stamp.py`. | Chosen in chat. |
| H6 | **Not on Home:** trends, time-in-stage, completion rates, anything historical. | Power BI's job (plan §11, decision 13). |

## 2. Data (loaded in `OnVisible`)

`me = Lower(User().Email)`. Candidates is small (well under 500 rows), so it is read with
`FirstN(Candidates, 500)` and scoped locally; Tasks is filtered on the server.

```
// candidates in scope: Active only
ClearCollect(colHmCands,
    Filter(FirstN(Candidates, 500), CStatus.Value = "Active"
        && (MyRole = "HR"
            || Lower(Manager.Email) = me || Lower(PrimaryOwner.Email) = me
            || me in Lower(Watchers.Email))));         // Watchers: local, multi-person

// overdue open tasks, department-wide — delegable filter, small result
ClearCollect(colHmOverdue,
    Filter(Tasks, DueDate < Today()
        && (TStatus.Value = "To Do" || TStatus.Value = "In Progress" || TStatus.Value = "Blocked")));

// Viewers only: my open tasks — delegable (Person Email "=", choice "=", dates)
ClearCollect(colHmMine,
    Filter(Tasks, Assignee.Email = User().Email
        && (TStatus.Value = "To Do" || TStatus.Value = "In Progress" || TStatus.Value = "Blocked")));
```

`Assignee.Email = User().Email` matches My Tasks' existing filter exactly, so the counts agree with
the screen the tiles open. Only the collections a role needs are loaded (HR/Manager skip
`colHmMine`; Viewers skip the candidate pair).

## 3. Layout

```
scr_home                          OnVisible: load collections (§2); Set(varHmFilter, Coalesce(varHmFilter, "All"))
  NavRail_Home                    (stamped rail, Home first and lit)
  cntHomeRoot
    cntHmHeader                   "Home" · greeting "Good morning, <FriendlyName>" · sub line by role
    conHmTiles                    4 tiles, 2×2 on phone
    conHmStages                   HR + Manager: one chip per active stage (Stages sorted by OrderIndex), "<n> <stage>"; scrolls sideways on phone
    conHmListCard                 HR + Manager: candidate list · Viewer: next 5 tasks
    lblHmBottomSpacer
```

**Tiles**

| Role | Tile 1 | Tile 2 | Tile 3 | Tile 4 |
|---|---|---|---|---|
| HR / Manager | Active — `CountRows(colHmCands)` | Blocked — `Blocked = true` | Overdue tasks — overdue rows whose candidate is in `colHmCands` | Starting ≤30 days — `StartDate` today…+30 |
| Viewer | Overdue — `colHmMine`, `DueDate < Today()` | Due this week — `DueDate` today…+7 | Open — `CountRows(colHmMine)` | (none — 3 tiles) |

Candidate tiles set `varHmFilter` ("All" / "Blocked" / "Overdue" / "Soon"); the selected tile is
gold-tinted, like the cockpit picker's selected row. Viewer tiles do
`Set(varMyTasksFilter, "Overdue" | "Week" | "All"); Navigate(scr_mytasks)`.

**Stage chips** set `varHmFilter` to `"Stage:" & ID`; a second click clears back to "All". Counts:
`CountRows(Filter(colHmCands, CurrentStage.Id = ThisItem.ID))`. Inactive stages are hidden.

**Candidate list** (HR / Manager) — `colHmCands` filtered by `varHmFilter`, sorted overdue-first then by
start date. Row: name (`FriendlyName`-style "Last, First" kept, matching the picker), stage pill,
Blocked pill when set, "<n> overdue" in Danger when > 0, start date. Row click:
`Set(varSelCandId, ThisItem.ID); Navigate(scr_candidates)`. Twin-gallery pagination, 7 per page,
same as Task Library. Filter-aware empty state ("No blocked candidates." / "No candidates yet").

**Viewer list** — next 5 of `colHmMine` by `DueDate` (blank due dates last): task, candidate, due
pill (the existing `TaskDueText/Color/Fill` UDFs). Row click opens My Tasks.

**Empty app** (zero candidates, as today): tiles show 0; the list says "No candidates yet", and HR
gets a "New Candidate" button there.

## 4. Changes outside the screen

| What | Change |
|---|---|
| `App.pa.yaml` | `StartScreen: =If(IsBlank(Param("candidateId")), scr_home, scr_candidates)`. `OnStart` unchanged. |
| `canvas/rail_stamp.py` | Add the Home item **first** (after the app name, before New Candidate), derived from the canonical item like Settings; `Icon.Home` (fallback `Icon.Waffle`); lit only on `scr_home`; visible to everyone. Re-stamp all nine screens; `verify` must pass. |
| `canvas/gen_home.py` | New generator for `scr_home`, same structure as the admin generators. |
| `_EditorState.pa.yaml` | Add `scr_home` first. |
| Docs | SESSION-CONTEXT (build state + what's left), PLATFORM-REBUILD-PLAN (decision 18: Home screen; §7 Dashboard row → built shape). |

Every rail item adds 4 controls per screen: Candidates 429 → 433, Templates 389 → 393 — both
already over the checker's guideline; that decision is unchanged (see SESSION-CONTEXT step 5).
Home itself: ~130–160 controls.

## 5. Build and verification

1. `rail_stamp.py`: Home item + splice + verify (all nine).
2. `gen_home.py` → `scr_home.pa.yaml`; layout audits (`audit-canvas-ui.py`, `audit-responsive-heights.py`); every container sized explicitly (the modal lesson of 2026-11-11).
3. `App.pa.yaml` StartScreen + `_EditorState`.
4. Compile = push #1 → sync A → a real forcing change → push #2 → sync B → `diff A B` non-empty → verify rail order on all nine and Home's child order → adopt canonical form → commit.
5. You reload Studio, check Home renders, Save + Publish.

**Tests (you)** — the app is empty, so create 2–3 candidates first via New Candidate (F1 builds their tasks).

| As | Check |
|---|---|
| HR | Home opens first; tiles match the candidates you made; each tile and stage chip filters the list; a row opens that candidate in the cockpit; New Candidate shows on an empty list |
| HR | An F3 assignment email link still opens the cockpit, not Home |
| Manager | Only candidates where you're manager/owner/watcher. Testing needs a second account, or another HR user to set your role to Manager — you can't change your own role (D7) |
| Viewer | Three task tiles; each opens My Tasks on the matching filter; counts agree with My Tasks |
| Phone | Tiles 2×2, stage chips scroll sideways, nothing clipped |

## 6. Runtime checks to verify, not assume

- `Icon.Home` compiles (fallback `Icon.Waffle`).
- `me in Lower(Watchers.Email)` works on a multi-person column inside `Filter` over a local `FirstN` result.
- The delegable task filters return the same counts as My Tasks for the same user.
- Navigating with `varSelCandId` set opens the cockpit on that candidate even when its status is excluded by the picker's filter.
