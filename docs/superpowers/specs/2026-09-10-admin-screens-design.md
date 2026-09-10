# Settings hub + Admin screens — design

**Date:** 2026-09-10 · **Status:** draft for review · **Approach:** A (hub + 2 spokes), approved in chat.

Delivers plan §7's "Admin" row: AppPermissions management plus reference-data CRUD, and plan §10's
promise that users can change their own NotifyChannel in the app. Three new screens, one nav-rail
item, two named formulas, and one new flow.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Hub + 2 spokes.** `scr_settings` (hub) → `scr_admin_users` (AppPermissions) and `scr_admin_refdata` (Divisions / Faculty Ranks / Stages). | Splits on the real seam — identity vs reference data — and keeps every screen well under the checker's 300-control guideline (estimates §7). One screen per entity would pay the 20-control rail six times; one screen for everything sits at the ceiling on day one. |
| D2 | **Nav item is "Settings", visible to everyone.** Admin tiles on the hub are `IsHR`-gated; spokes guard themselves in `OnVisible`. | Every user reaches the hub for their notification preference, so "Admin" is the wrong label for a Viewer. |
| D3 | **Self-service NotifyChannel writes go through a new flow, F8.** | **Non-HR users have Read on AppPermissions** — the list inherits the site, and `OBGYN-OnBoardPro-PA` sits in Visitors (inventory, "Permission state"). A direct `Patch` from a Viewer 403s. A direct Edit grant on the list would let any user edit any row including `Role`, so the write is brokered by a flow running on the existing SharePoint connection, exactly as F1 is. |
| D4 | **Stages is edit-only: Title, Description, IsActive.** No add, no delete, `OrderIndex` read-only. | F3's advancement is "min later stage with open required work; 5 = done", and every task carries a `StageOrder` snapshot. Reordering or adding stages is a migration across F1/F3 and live Tasks rows, not an admin edit. |
| D5 | **Divisions and Faculty Ranks: add, edit, delete — delete refused when in use.** | SharePoint will not stop a delete that leaves Candidates (and, for divisions, AppPermissions) with dangling lookups. The confirm modal shows the in-use count and disables Delete when it is non-zero. |
| D6 | **Departments is excluded from the reference-data screen.** | One department by decision (plan §2 #11); New Candidate hardcodes `Department: {Id: 1, …}`. A second department is the clone-per-department trigger, not an admin edit. Renaming it is a SharePoint-list job. |
| D7 | **HR can't change or delete their own row.** | Cheapest guarantee that at least one HR row always exists. Another HR does the demotion/offboarding. |
| D8 | **Changing the person on an existing AppPermissions row is not supported** — delete and re-add. | A row is a grant to one identity; "editing" the identity is two operations wearing one form. |
| D9 | **Reference-data listing runs off a normalized collection**, `colArRows`, rebuilt by a hidden reload button. | The three lists have different schemas, and `If`/`Switch` can't return tables of differing shape. Row counts are ≤ 10, so a collection is free; one gallery avoids three Visible-gated galleries reserving each other's space. |

## 2. Named formulas (App.pa.yaml, property-only push)

```
MyPermRow = LookUp(AppPermissions, Lower(Coalesce(AppUser.Email, "")) = Lower(User().Email));
MyNotifyChannel = Coalesce(MyPermRow.NotifyChannel.Value, "Email");
```

`MyRole` and `MyDivisionId` stay exactly as they are — they work, and this is not the push to churn them.

## 3. Nav rail — one new item, eight files

Append `conNavSettings_<Sfx>` after `conNavTaskLib_<Sfx>` in every screen, same four-control shape (item container → bar, icon, label). Differences from the Task Library item:

| Property | Value |
|---|---|
| `Visible` | omitted (everyone) |
| `Icon` | `=Icon.Settings` |
| `Text` / `AccessibleLabel` | `"Settings"` |
| `OnSelect` | `=Navigate(scr_settings)` |
| active-state test (bar Fill, icon/label Color, label FontWeight) | `App.ActiveScreen = scr_settings \|\| App.ActiveScreen = scr_admin_users \|\| App.ActiveScreen = scr_admin_refdata` — spokes keep the parent lit |

Suffixes: existing `_Candidates`, `_MyTasks`, `_NewCand`, `_TaskLib`, `_Templates`; new `_Settings`, `_AdmUsers`, `_AdmRef`. All eight files carry the six-item rail — `scr_new_candidate` proves sub-screens keep the rail, so the spokes do too.

Because the item is appended **last** inside the rail, the creating push's append-last z-order behavior lands it where it belongs; the second push still runs, and child order is verified on every one of the eight files.

Rail height check: app name 56 + six items at 48 with 4px gaps + 32/32 padding ≈ 432px — fits both 768 desktop and phone.

## 4. `scr_settings` — hub

**Purpose:** every user's notification preference; HR's doorway to administration.

```
scr_settings                     OnVisible: Refresh(AppPermissions)
  NavRail_Settings               (stamped rail)
  cntStRoot                      vertical, OffWhite
    cntStHeader                  title "Settings" · sub "Your notification preference" + (IsHR: " and app administration")
    conStMeCard                  white hairline card — "MY NOTIFICATIONS" eyebrow
      lblStMeName                FriendlyName(User().FullName)
      conStMeMeta                horizontal: role pill (MyRole) · division (Coalesce(MyPermRow.Division.Value, "All divisions"))
      conStMeRow                 label-over-input: "Send my notifications by" · cmbStChannel · btnStSave
      lblStMeNote                blank-safe helper text (see below)
    conStTiles                   horizontal, Visible: =IsHR     ← LAST child, so hidden-reserve is unobservable
      conStTileUsers             icon · "Users & roles" · CountRows(AppPermissions) & " users" · btnStOpenUsers → scr_admin_users
      conStTileRef               icon · "Reference data" · counts line · btnStOpenRef → scr_admin_refdata
```

- `cmbStChannel`: `Items: =["Email", "Teams", "Email + Teams"]`, `SelectMultiple: =false`, `DefaultSelectedItems: =[MyNotifyChannel]`, `ItemDisplayText: =ThisItem.Value`.
- **No row:** `IsBlank(MyPermRow)` → `cmbStChannel` and `btnStSave` are `DisplayMode.Disabled`; `lblStMeNote` reads "No app profile yet — ask HR to add you." Otherwise it reads "Assignment, digest, and approval emails always go by email. This setting adds Teams for everything else."
- **Save:**
  ```
  IfError(
      With({r: 'OnBoard-SetNotifyChannel'.Run(Lower(User().Email), cmbStChannel.Selected.Value)},
          If(r.ok,
             Refresh(AppPermissions); Notify("Notification preference saved.", NotificationType.Success),
             Notify("Couldn't save: " & r.message, NotificationType.Error))),
      Notify("Couldn't save your preference - " & FirstError.Message, NotificationType.Error))
  ```
- Tiles use `ModernButton` for the click target (containers have no `OnSelect`). Phone: tiles stack vertically (`LayoutDirection` switches on `ScreenSize.Small`).

Estimated controls: ~55 incl. rail.

## 5. `scr_admin_users` — AppPermissions

**Purpose:** HR adds users, sets role / division / channel, offboards.

```
scr_admin_users                  OnVisible: If(!IsHR, Navigate(scr_settings)); Refresh(AppPermissions); Set(varAuPage, 1)
  NavRail_AdmUsers
  cntAuRoot
    cntAuHeader                  title row: "Users & roles" · btnAuBack ("Settings", subtle) · btnAuNew ("Add user")
    conAuFilterRow               txtAuSearch (name or email) · cmbAuRole (multi, HR/Manager/Viewer, default all) · btnAuClear
    lblAuCount                   "N users"
    conAuTableCard               Paper header row: User · Email · Role · Division · Notifications · (actions)
      galAuAll                   invisible twin — full filtered set
      galAuList                  8/page; row: lblAuRowName (Label, click → edit) / lblAuRowEmail sub · role pill · division · channel · icoAuRowEdit · icoAuRowDelete
      conAuListEmpty             filter-aware empty state
      conAuPager
    lblAuBottomSpacer
  conAuModal → conAuPanel        content-bounded (no Height), 560 cap
    conAuModalHead               "Add user" / "Edit user" · icoAuClose
    conAuRowUser                 Height: =If(varAuMode = "edit", 0, 66) · Visible: =varAuMode = "add"   ← collapses to nothing in edit
      lblAuUserCap · cmbAuUser   Office365Users.SearchUser picker, byte-for-byte the cmbNcManager idiom
    lblAuEditing                 edit mode only: "Editing · <DisplayName> · <email>"  (Height 0 / Visible false in add)
    conAuRowRoleDiv              cmbAuRole1 (single) · cmbAuDivision (single, Divisions sorted, optional)
    conAuRowChannel              cmbAuChannel (single, 3 values)
    conAuActions                 btnAuSave · btnAuCancel
  conAuConfirm → conAuConfirmPanel   "Remove <name>?" · body · btnAuConfirmDelete · btnAuConfirmCancel
```

**Filter** (twin `Items`):
```
=SortByColumns(
    FirstN(Filter(AppPermissions,
        (IsBlank(Trim(txtAuSearch.Text))
           || Trim(txtAuSearch.Text) in AppUser.DisplayName
           || Trim(txtAuSearch.Text) in AppUser.Email)
        && (Coalesce(CountRows(cmbAuRole.SelectedItems), 0) = 0
           || Role.Value in ShowColumns(cmbAuRole.SelectedItems, Value))), 500),
    "Title")
```
`Title` is written as the display name on every save so the list sorts by name without touching the person record.

**Save** — validations first, then one guarded `Patch`:

| Check | Message |
|---|---|
| add: nothing picked | "Pick a user." |
| add: `LookUp(AppPermissions, Lower(AppUser.Email) = Lower(picked email))` exists | "That person already has a row — edit it instead." |
| edit: own row and role ≠ HR (D7) | "You can't change your own role." |
| role unpicked | "Pick a role." |

```
add:  Patch(AppPermissions, Defaults(AppPermissions), {
        Title: <DisplayName>,
        AppUser: {Claims: "i:0#.f|membership|" & Lower(<mail>), Department: "", DisplayName: <DisplayName>,
                  Email: <mail>, JobTitle: "", Picture: ""},
        Role: {Value: cmbAuRole1.Selected.Value},
        NotifyChannel: {Value: Coalesce(cmbAuChannel.Selected.Value, "Email")},
        Division: If(IsBlank(cmbAuDivision.Selected), Blank(), {Id: cmbAuDivision.Selected.ID, Value: cmbAuDivision.Selected.Title})})
edit: same record minus AppUser, against LookUp(AppPermissions, ID = varAuEditId)
```
Wrapped in `IfError(..., Notify(error; user stays in the modal), <close modal; Notify success>)`.

**Delete:** `icoAuRowDelete` sets `varAuDelId` / `varAuDelName` / `varAuDelEmail` and opens the confirm. If `Lower(varAuDelEmail) = Lower(User().Email)` the body reads "You can't remove your own access" and Delete is disabled (D7). Confirm → `IfError(Remove(AppPermissions, LookUp(AppPermissions, ID = varAuDelId)), …)`. Body text for the normal case: "They'll drop to Viewer the next time they open the app. Their group membership is unchanged."

Phone: Email, Division, Notifications columns collapse to width 0; name row absorbs the email as its subline (the My Tasks pattern).

Estimated controls: ~130 incl. rail.

## 6. `scr_admin_refdata` — Divisions · Faculty Ranks · Stages

**Purpose:** HR maintains the three editable reference lists.

```
scr_admin_refdata                OnVisible: If(!IsHR, Navigate(scr_settings)); Set(varArEntity, Coalesce(varArEntity, "Divisions")); Select(btnArReload)
  NavRail_AdmRef
  btnArReload                    screen-level, Visible: =false — rebuilds colArRows (below)
  cntArRoot
    cntArHeader                  "Reference data" · btnArBack · btnArNew (Visible: =varArEntity <> "Stages")
    conArTabs                    three ModernButtons: Divisions · Faculty ranks · Stages — selected = Primary/Green, others Secondary; OnSelect: Set(varArEntity, …); Select(btnArReload)
    lblArCount                   "N divisions" / "N ranks" / "N stages"
    conArTableCard               header row: Name · Detail · Status · Order
      galArList                  Items: =colArRows (no twin; ≤ 10 rows) — row: title (Label, click → edit) · detail (3-line clamp) · flag pill · order · icoArRowEdit · icoArRowDelete
      conArListEmpty
    lblArBottomSpacer
  conArModalDiv → panel          "Add division" / "Edit division": txtArDivTitle · actions
  conArModalRank → panel         "Add rank" / "Edit rank": txtArRankTitle · tglArRankPT ("Requires promotion & tenure review") · actions
  conArModalStage → panel        "Edit stage": lblArStageOrder ("Stage " & Order & " of " & CountRows(Stages) & " — order is fixed") · txtArStageTitle · txtArStageDesc (multi-line) · tglArStageActive · actions
  conArConfirm → panel           "Delete <title>?" · in-use body · btnArConfirmDelete (Disabled when in use) · cancel
```

**`btnArReload.OnSelect`** — one normalized shape `{ID, Title, Detail, Flag, FlagText, Order}`:
```
Switch(varArEntity,
  "Divisions",    ClearCollect(colArRows, ForAll(SortByColumns(Divisions, "Title"),
                      {ID: ID, Title: Title, Detail: "", Flag: false, FlagText: "", Order: 0})),
  "FacultyRanks", ClearCollect(colArRows, ForAll(SortByColumns(FacultyRanks, "Title"),
                      {ID: ID, Title: Title, Detail: "", Flag: Coalesce(RequiresPT, false),
                       FlagText: If(Coalesce(RequiresPT, false), "Requires P&T", "No P&T"), Order: 0})),
  "Stages",       ClearCollect(colArRows, ForAll(SortByColumns(Stages, "OrderIndex"),
                      {ID: ID, Title: Title, Detail: Coalesce(Description, ""), Flag: Coalesce(IsActive, true),
                       FlagText: If(Coalesce(IsActive, true), "Active", "Inactive"), Order: Coalesce(OrderIndex, 0)})))
```
Every successful save/delete ends with `Select(btnArReload)`. Order column and the Stages pill are `Width: =If(varArEntity = "Stages", 72, 0)`; the delete icon is `Width: =If(varArEntity = "Stages", 0, 44)`.

**Saves** (each modal has its own guarded `Patch`):
- Division add: `{Title, Department: {Id: 1, Value: LookUp(Departments, ID = 1).Title}}`. Duplicate-title guard on add (case-insensitive).
- Rank add/edit: `{Title, RequiresPT: tglArRankPT.Checked}`. Duplicate guard on add.
- Stage edit: `{Title, Description, IsActive: tglArStageActive.Checked}` — never `OrderIndex`.

**Delete** — on `icoArRowDelete`:
```
Set(varArInUse,
    Switch(varArEntity,
      "Divisions",    CountRows(Filter(Candidates, Division.Id = ThisItem.ID))
                      + CountRows(Filter(AppPermissions, Division.Id = ThisItem.ID)),
      "FacultyRanks", CountRows(Filter(Candidates, FacultyRank.Id = ThisItem.ID)),
      0))
```
Body: in use → "In use by N candidate(s)/user(s) — reassign them first." and Delete disabled; else "This can't be undone." Confirm → `IfError(Remove(<list>, LookUp(<list>, ID = varArDelId)), …)`.

Estimated controls: ~150 incl. rail.

## 7. Flow F8 — `OnBoard - Set Notify Channel`

Generator-scripted as `provision/gen_f8.py`, created via classic REST with explicit `connectionReferences` (working practice #3), on the existing SharePoint connection `288fd460…`. Portal-born, so it appears in Studio's Add-flow pane.

| Step | Action |
|---|---|
| Trigger | PowerApps V2, named text inputs `email`, `channel` |
| Validate | `channel` ∈ `Email` / `Teams` / `Email + Teams` — else `ok=false`, "Unknown channel" |
| Find | SP HttpRequest `GET …/lists(guid'4832685a-06e1-4daf-8f2e-e1bf2fec9b83')/items?$select=Id,AppUser/EMail&$expand=AppUser&$filter=AppUser/EMail eq '<email>'&$top=1` |
| Update | found → `POST …/items(<id>)` MERGE, `If-Match: *`, body `{"NotifyChannel": "<channel>"}`; not found → `ok=false`, "No app profile for <email>" |
| Respond | single `Response` (kind PowerApp) at the end: `{ok: boolean, message: string}` from variables |

Sub-second, so no respond-first split. **Trust model:** the flow trusts `email` from the app's `User().Email`; canvas users cannot alter that argument, and the flow's run-only share is the only way to invoke it. The channel whitelist stops a bad value reaching the choice column.

**Sharing:** run-only to `OBGYN-OnBoardPro-PA` and `OBGYN-OnBoardPro-Admins-PA` (group-based, never per user). Jon adds it to the app from Studio's flow pane; the stale-registration reload rule applies after.

Not logged to ChangeLog — it isn't a task change.

## 8. Build order & verification
Each numbered step: `compile_canvas` → push → **push again with a real value change** → `sync_canvas` to scratch → grep markers + verify child order → Jon **reloads the Studio tab before saving** (structural pushes) → confirms on screen → **File → Save**.

1. **F8** — `gen_f8.py`, create, manual run against Jon's own row (flip to Teams and back), share run-only. Independent of the app.
2. **F8 into the app** — Jon adds it from Studio's flow pane, reloads; I `connect` fresh and re-sync to confirm the registration is in the session. `btnStSave` references `'OnBoard-SetNotifyChannel'.Run`, so this must land **before** the hub is pushed or the hub won't compile.
3. **App.pa.yaml** — `MyPermRow`, `MyNotifyChannel` (property-only).
4. **Rail re-stamp + hub** — six-item rail on the five existing screens, new `scr_settings` with `btnStSave` fully wired.
5. **`scr_admin_users`.**
6. **`scr_admin_refdata`.**
7. **Audits** — `audit-canvas-ui.py` and `audit-responsive-heights.py` on the three new screens; record App Checker complexity per screen and the new delegation-warning baseline (134 today).
8. **Docs** — SESSION-CONTEXT build state, INVENTORY (F8 id + sharing), PLATFORM-REBUILD-PLAN §7 Admin row + decision log (D3, D4, D6), then commit.

**Functional checks**

| As | Check |
|---|---|
| HR | hub shows card + tiles; add a user → row appears with Role/NotifyChannel/Division set; edit role; own-row change refused; delete other user → confirm → gone; own delete refused |
| HR | refdata: add division → appears in New Candidate's picker; add rank with P&T; edit stage title/description/active; delete refused on an in-use division with the right count; delete succeeds on an unused one |
| HR | change own channel from the hub → F8 run succeeded → list shows new value → card reflects it after Refresh |
| non-HR (the PA-only test account) | Settings item visible; hub shows only the card; tiles absent; direct `Navigate` to a spoke bounces to the hub; channel save succeeds via F8 |
| no row | card disabled with the "ask HR" note |

**Expected post-build numbers:** `scr_candidates` ~429, `scr_templates` ~389 (each +4, already over guideline — unchanged decision), new screens ~55 / ~130 / ~150.

## 9. Runtime checks to verify, not assume

- `Icon.Settings` is a valid classic icon (compile will say).
- `Division: Blank()` on an **edit** `Patch` clears a SharePoint lookup — `null` is expected; confirm in the list.
- `$filter=AppUser/EMail eq '…'` matches the stored case of the UPN; if not, F8 falls back to `siteusers` resolution.
- A `Height: =0` + `Visible: =false` row inside a content-bounded modal really contributes nothing (the app's own column-collapse trick, applied vertically).
- `Select(btnArReload)` from `OnVisible` fires before the gallery first paints; if it flashes empty, move the collect into `OnVisible` directly.

## 10. Out of scope

Departments CRUD (D6) · Stages add / reorder / delete (D4) · changing the person on a row (D8) · Teams-card delivery (still opt-in and unbuilt) · division/manager blocking (plan §6, deferred) · self-service for anything other than NotifyChannel.
