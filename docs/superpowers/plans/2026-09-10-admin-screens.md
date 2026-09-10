# Settings Hub + Admin Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings hub (everyone's NotifyChannel preference + HR tiles), an AppPermissions admin screen, and a reference-data admin screen to the OnBoardPro canvas app, with a flow that lets non-HR users write their own preference.

**Architecture:** Three new `.pa.yaml` screens emitted by Python generators on top of the existing `canvas/gen_app.py` helpers; a six-item nav rail stamped from one canonical text onto all eight screens; two named formulas in `App.pa.yaml`; one PowerApps-V2 flow (F8) authored as a REST patch like F1. Subagents author files and run local checks; the orchestrator owns every `compile_canvas` push and its verification; Jon owns portal birth of F8, Studio reloads, and saves.

**Tech Stack:** Power Apps canvas YAML (`.pa.yaml`) via the Canvas Authoring MCP; Power Fx; SharePoint lists (site `https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding`); Power Automate classic REST (`api.flow.microsoft.com`); Python 3 generators; `az` CLI as `jsteen@uab.edu`.

**Spec:** `docs/superpowers/specs/2026-09-10-admin-screens-design.md` — read it first; decisions D1–D9 are not re-argued here.

## Global Constraints

- **Load both skills before touching any file:** `power-platform-ops` and `uab-canvas-design`. Then read `~/.claude/skills/power-platform-ops/references/canvas-mcp-mechanics.md` (YAML authoring rules, push semantics) and `~/.claude/skills/uab-canvas-design/references/components.md` (recipes).
- **Modern controls for every new control** except `Classic/Icon` and classic `Label` as an in-gallery click target. The modern button is `ModernButton`, toggle is `ModernToggle` (what `src` already uses everywhere).
- **Every AutoLayout child gets `LayoutMinHeight: =0` + `LayoutMinWidth: =0`** (`AUTOZ`). **Every new GroupContainer gets an explicit opaque `Fill`** and inner containers `DropShadow: =DropShadow.None` (`NOSHADOW`).
- **Every `Patch`/`Remove` sits inside `IfError(write, <error Notify; user stays put>, <success branch>)`.**
- **Never reuse a control name that exists or existed in `canvas/src`.** Prefixes reserved by this plan: `St` (hub), `Au` (admin users), `Ar` (admin refdata). Nav suffixes: `_Settings`, `_AdmUsers`, `_AdmRef`.
- **Formulas containing `": "` or `#` must be block scalars** — `gen_app.needs_block()` handles this when you emit through `emit_control`; never hand-write those as plain scalars.
- **Parse every generated file with `yaml.safe_load` before it lands** — `gen_app.write()` does this.
- **Column headers that sit over pill columns get `Align: =Align.Center` AND `AlignInContainer: =AlignInContainer.Center`** (Jon's convention, pulled from Studio 2026-09-10).
- **No AI attribution in any artifact name.** Commit messages in first person as Jon; end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Subagents do not call `compile_canvas`, `sync_canvas`, or any `az`/REST write.** Author, verify locally, commit. The orchestrator pushes.
- Delegation-warning baseline before this work: **134**. Record the new number; do not restructure formulas to silence warnings.
- Canvas coordinates: design width 1366 × 768; phone breakpoint `<screen>.Size = ScreenSize.Small`.

## File structure

| File | Responsibility |
|---|---|
| `canvas/rail_stamp.py` (new) | Single source for the nav rail: extracts the canonical rail from `scr_tasklibrary.pa.yaml`, adds the Settings item, stamps it for any screen, splices the Settings item into existing screens, verifies all rails match. |
| `canvas/src/App.pa.yaml` (modify) | `MyPermRow`, `MyNotifyChannel`, `RoleColor()`, `RoleFill()` named formulas. |
| `canvas/src/_EditorState.pa.yaml` (modify) | Append the three new screens to `ScreensOrder`. |
| `canvas/gen_settings.py` (new) → `canvas/src/scr_settings.pa.yaml` (new) | Hub screen generator + output. |
| `canvas/gen_admin_users.py` (new) → `canvas/src/scr_admin_users.pa.yaml` (new) | AppPermissions screen generator + output. |
| `canvas/gen_admin_refdata.py` (new) → `canvas/src/scr_admin_refdata.pa.yaml` (new) | Reference-data screen generator + output. |
| `canvas/src/scr_{candidates,mytasks,new_candidate,tasklibrary,templates}.pa.yaml` (modify) | Settings nav item spliced in. |
| `provision/gen_f8.py` (new), `provision/flows-f8.json` (generated) | F8 definition, patch, start, share, verify. |
| `SESSION-CONTEXT.md`, `provision/INVENTORY.md`, `PLATFORM-REBUILD-PLAN.md` (modify) | Build state, F8 inventory row, §7 Admin row, decision log. |

## Execution protocol (orchestrator)

Authoring tasks 1–6 are independent once Task 1 exists (2–6 need `rail_stamp.py`). Dispatch Task 1 first, then Tasks 2–6 in parallel. Task 7 is the single integration push; Task 8 is docs. F8's portal birth (Jon) can happen any time before Task 7.

Push order in Task 7: `App.pa.yaml` (property-only) first, then all eight screens + `_EditorState` in one structural push, double-pushed per the protocol below.

**Double-push protocol** (copied from `canvas-mcp-mechanics.md`; follow literally):
1. `compile_canvas canvas/src` → clean (warnings OK, zero errors) → this is push #1.
2. `sync_canvas` → scratch **A**.
3. Make a real property change (use the forcing edits named in Task 7).
4. `compile_canvas` → push #2. `sync_canvas` → scratch **B**.
5. `diff -r A B` must be **non-empty**. Empty = gated; change something real and repeat.
6. Verify child order of `NavRail_*` on all eight screens and the top-level child order of each new screen in **B**.
7. Only now copy **B** over `canvas/src` (adopt canonical form) and commit.
8. Tell Jon: **reload the Studio tab before saving**, confirm the new controls are on screen, then File → Save.

---

### Task 1: Nav-rail stamper + Settings item on the five existing screens

**Files:**
- Create: `canvas/rail_stamp.py`
- Modify: `canvas/src/scr_candidates.pa.yaml`, `scr_mytasks.pa.yaml`, `scr_new_candidate.pa.yaml`, `scr_tasklibrary.pa.yaml`, `scr_templates.pa.yaml` (insert one nav item each)
- Modify: `canvas/src/_EditorState.pa.yaml`

**Interfaces:**
- Produces: `rail_stamp.rail_text(screen: str, suffix: str) -> str` — the full `      - NavRail_<suffix>:` block (six items, Settings last) indented for a screen's `Children:` list, ready to prepend to a generated screen's YAML. Tasks 4–6 call this.
- Produces: the five existing screens carrying `conNavSettings_<Sfx>` as the last rail item.

**Facts you need:** In `scr_tasklibrary.pa.yaml` the rail is lines 9–366 (`      - NavRail_TaskLib:` through the `Wrap: =false` that ends `lblNavTaskLib_TaskLib`), and the content root starts at line 367 `      - cntTaskLibRoot:`. The five rails are identical except for the `_<Sfx>` suffix and `scr_tasklibrary.Size` references (verified 2026-09-10). The Task Library item is lines 305–366 and is the template for the Settings item.

- [ ] **Step 1: Write `canvas/rail_stamp.py`**

```python
#!/usr/bin/env python3
"""Stamp the OnBoardPro nav rail.

The rail in canvas/src/scr_tasklibrary.pa.yaml is canonical. Every screen's rail is
that text with the suffix and the screen's .Size references swapped. This module
adds the Settings item (last, visible to everyone, lit for the hub and both spokes)
and can (a) emit the rail for any screen, (b) splice just the Settings item into an
existing screen, (c) verify all rails match.

  python3 rail_stamp.py splice    # add the Settings item to the five existing screens
  python3 rail_stamp.py verify    # every screen's rail == canonical (modulo suffix/screen)
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).parent / "src"
CANON_SCREEN, CANON_SFX = "scr_tasklibrary", "TaskLib"
EXISTING = {"scr_candidates": "Candidates", "scr_mytasks": "MyTasks",
            "scr_new_candidate": "NewCand", "scr_tasklibrary": "TaskLib",
            "scr_templates": "Templates"}
NEW = {"scr_settings": "Settings", "scr_admin_users": "AdmUsers",
       "scr_admin_refdata": "AdmRef"}
ALL = {**EXISTING, **NEW}
ROOT_RE = re.compile(r"^      - cnt\w+Root:$")
SETTINGS_ACTIVE = ("App.ActiveScreen = scr_settings || App.ActiveScreen = scr_admin_users"
                   " || App.ActiveScreen = scr_admin_refdata")


def _lines(screen):
    return (SRC / f"{screen}.pa.yaml").read_text().split("\n")


def _rail_span(lines):
    start = next(i for i, l in enumerate(lines) if l.startswith("      - NavRail_"))
    end = next(i for i, l in enumerate(lines) if ROOT_RE.match(l))
    return start, end


def _canonical_rail_without_settings():
    lines = _lines(CANON_SCREEN)
    s, e = _rail_span(lines)
    return "\n".join(lines[s:e])


def _settings_item(screen, sfx):
    """The Settings item, derived from the Task Library item so the shape stays identical."""
    lines = _lines(CANON_SCREEN)
    s = next(i for i, l in enumerate(lines) if l == "            - conNavTaskLib_TaskLib:")
    # end at the next rail item or the content root — never swallow an already-spliced Settings item
    e = next(i for i in range(s + 1, len(lines))
             if lines[i].startswith("            - conNav") or ROOT_RE.match(lines[i]))
    item = "\n".join(lines[s:e])
    item = item.replace("TaskLib_TaskLib", f"Settings_{sfx}")
    item = item.replace('="Task Library"', '="Settings"')
    item = item.replace("Icon.Notebook", "Icon.Settings")
    item = item.replace("App.ActiveScreen = scr_tasklibrary", SETTINGS_ACTIVE)
    item = item.replace("Navigate(scr_tasklibrary)", "Navigate(scr_settings)")
    item = item.replace("scr_tasklibrary.Size", f"{screen}.Size")
    item = "\n".join(l for l in item.split("\n") if l.strip() != "Visible: =IsHR")
    assert "TaskLib" not in item and "Task Library" not in item, item
    return item


def rail_text(screen, suffix):
    """Full rail block (six items) for `screen`, ready for a screen's Children: list."""
    rail = _canonical_rail_without_settings()
    if "conNavSettings_" not in rail:
        rail = rail + "\n" + _settings_item(CANON_SCREEN, CANON_SFX)
    rail = rail.replace(f"_{CANON_SFX}", f"_{suffix}")
    rail = rail.replace(f"{CANON_SCREEN}.Size", f"{screen}.Size")
    return rail + "\n"


def splice():
    for screen, sfx in EXISTING.items():
        lines = _lines(screen)
        if any("conNavSettings_" in l for l in lines):
            print(f"{screen}: already has Settings item"); continue
        _, root = _rail_span(lines)
        item = _settings_item(screen, sfx).split("\n")
        lines[root:root] = item
        (SRC / f"{screen}.pa.yaml").write_text("\n".join(lines))
        print(f"{screen}: spliced Settings item before line {root + 1}")


def normalized_rail(screen, sfx):
    lines = _lines(screen)
    s, e = _rail_span(lines)
    return "\n".join(lines[s:e]).replace(f"_{sfx}", "_SFX").replace(f"{screen}.Size", "SCREEN.Size")


def verify():
    ref = normalized_rail(CANON_SCREEN, CANON_SFX)
    assert "conNavSettings_SFX" in ref, "canonical rail lacks the Settings item — run splice first"
    ok = True
    for screen, sfx in ALL.items():
        if not (SRC / f"{screen}.pa.yaml").exists():
            print(f"{screen}: (not built yet)"); continue
        same = normalized_rail(screen, sfx) == ref
        ok &= same
        print(f"{screen}: {'OK' if same else 'MISMATCH'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    {"splice": splice, "verify": verify}[sys.argv[1]]()
```

- [ ] **Step 2: Run the splice and verify**

Run: `cd canvas && python3 rail_stamp.py splice && python3 rail_stamp.py verify`
Expected: five `spliced Settings item` lines (or `already has`), then `OK` for all five existing screens and `(not built yet)` for the three new ones, exit 0.

- [ ] **Step 3: Structural checks on one spliced file**

Run:
```bash
cd canvas/src && python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('scr_*.pa.yaml')]; print('yaml ok')"
grep -c "conNavSettings_" scr_*.pa.yaml
grep -n -A3 "icoNavSettings_TaskLib:" scr_tasklibrary.pa.yaml | head -8
```
Expected: `yaml ok`; each of the five files reports `1`; the icon block shows `Icon: =Icon.Settings` and no `Visible: =IsHR` anywhere in the Settings item.

- [ ] **Step 4: Append the new screens to `_EditorState.pa.yaml`**

Edit `canvas/src/_EditorState.pa.yaml` so `ScreensOrder` ends:
```yaml
    - scr_tasklibrary
    - scr_settings
    - scr_admin_users
    - scr_admin_refdata
```

- [ ] **Step 5: Commit**

```bash
git add canvas/rail_stamp.py canvas/src/_EditorState.pa.yaml canvas/src/scr_candidates.pa.yaml canvas/src/scr_mytasks.pa.yaml canvas/src/scr_new_candidate.pa.yaml canvas/src/scr_tasklibrary.pa.yaml canvas/src/scr_templates.pa.yaml
git commit -m "Add the Settings nav item and a rail stamper

rail_stamp.py treats the Task Library rail as canonical and derives the
Settings item from its Task Library item, so every screen's rail stays
byte-identical modulo suffix. Spliced onto the five existing screens;
the three new screens will take rail_text().

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Named formulas in App.pa.yaml

**Files:**
- Modify: `canvas/src/App.pa.yaml` (the `Formulas: |-` block; `MyRole` is at line 22, `MyDivisionId` at line 55)

**Interfaces:**
- Produces: `MyPermRow` (record or blank), `MyNotifyChannel` (Text), `RoleColor(r: Text): Color`, `RoleFill(r: Text): Color`. Tasks 4 and 5 use all four.

- [ ] **Step 1: Add the formulas**

Insert directly after the `IsManagerOrHR = …;` line (line 24):
```
      MyPermRow = LookUp(AppPermissions, Lower(Coalesce(AppUser.Email, "")) = Lower(User().Email));
      MyNotifyChannel = Coalesce(MyPermRow.NotifyChannel.Value, "Email");
      RoleColor(r: Text): Color = Switch(Coalesce(r, ""), "HR", UAB.GoldText, "Manager", UAB.InfoText, UAB.Gray700);
      RoleFill(r: Text): Color = Switch(Coalesce(r, ""), "HR", UAB.GoldTint, "Manager", UAB.InfoTint, UAB.Paper);
```
Do **not** change `MyRole` or `MyDivisionId`.

- [ ] **Step 2: Verify**

Run: `cd canvas/src && python3 -c "import yaml; d=yaml.safe_load(open('App.pa.yaml')); f=d['App']['Properties']['Formulas']; assert 'MyPermRow =' in f and 'RoleFill(r: Text)' in f; print('ok', f.count('\n'), 'lines')"`
Expected: `ok … lines`.

- [ ] **Step 3: Commit**

```bash
git add canvas/src/App.pa.yaml
git commit -m "Add MyPermRow, MyNotifyChannel and role pill UDFs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: F8 — `OnBoard - Set Notify Channel` (generator + REST patch)

**Files:**
- Create: `provision/gen_f8.py`
- Generated: `provision/flows-f8.json`
- Modify (later, Task 8): `provision/INVENTORY.md`

**Interfaces:**
- Consumes: flow ID of the portal-born shell (Jon supplies; see Task 7 prerequisites). The script reads it from `provision/f8-id.txt`, matching the `f2-id.txt … f7-id.txt` convention.
- Produces: Power Fx call `'OnBoard-SetNotifyChannel'.Run(<email text>, <channel text>)` returning `{ok: Boolean, message: Text}`. Task 4's `btnStSave` consumes this exact shape.

**Facts:** F1's generator `provision/gen_f1_real.py` is the template — copy its `token()`, `req()`, `sp()` helpers and `CONNREFS` verbatim (lines 15–59). Trigger property keys map to Power Fx positional args: key `text` = first arg (email), key `text_1` = second (channel). The list GUID is `4832685a-06e1-4daf-8f2e-e1bf2fec9b83` (`provision/guids.json["AppPermissions"]`). Group object IDs: PA `5f9e259c-eaba-449d-9964-46a0066ad722`, Admins `8127ddb5-5c46-45d0-805e-c8026ee2a414`.

- [ ] **Step 1: Write `provision/gen_f8.py`**

```python
#!/usr/bin/env python3
"""Author + drive F8 (OnBoard - Set Notify Channel).

Called from the canvas app's Settings hub: 'OnBoard-SetNotifyChannel'.Run(email, channel).
Runs on the flow owner's SharePoint connection so a Viewer (Read on AppPermissions) can
still change their own NotifyChannel. Trusts `email` from the app's User().Email.

  python3 gen_f8.py dump      # write flows-f8.json, no network
  python3 gen_f8.py patch     # PATCH definition + connectionReferences onto the shell flow
  python3 gen_f8.py start     # turn the flow on
  python3 gen_f8.py share     # run-only (CanView) to both OnBoardPro groups
  python3 gen_f8.py verify    # re-read definition + permissions and print the essentials

Auth: az CLI must hold jsteen@uab.edu (tenant d8999fe4...).
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"
SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"
G = json.load(open(HERE / "guids.json"))
LIST = G["AppPermissions"]
GROUPS = {"OBGYN-OnBoardPro-PA": "5f9e259c-eaba-449d-9964-46a0066ad722",
          "OBGYN-OnBoardPro-Admins-PA": "8127ddb5-5c46-45d0-805e-c8026ee2a414"}
CHANNELS = ["Email", "Teams", "Email + Teams"]

CONNREFS = {"shared_sharepointonline": {
    "connectionName": "288fd46092664885aa75c25c64f03c89",
    "source": "Embedded",
    "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"}}


def fid():
    p = HERE / "f8-id.txt"
    if not p.exists():
        sys.exit("provision/f8-id.txt missing — Jon creates the shell flow in the portal first")
    return p.read_text().strip()


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
                           "https://service.flow.microsoft.com/", "--query", "accessToken",
                           "-o", "tsv"], capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        tmp = Path("/tmp/f8-body.json")
        tmp.write_text(json.dumps(body))
        cmd += ["--data", f"@{tmp}"]
    raw = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(raw) if raw else {}


def sp(uri, method="GET", body_expr=None, run_after=None, merge=False):
    h = {"Accept": "application/json;odata=nometadata",
         "Content-Type": "application/json;odata=nometadata"}
    if merge:
        h.update({"X-HTTP-Method": "MERGE", "IF-MATCH": "*"})
    p = {"dataset": SITE, "parameters/method": method, "parameters/uri": uri,
         "parameters/headers": h}
    if body_expr is not None:
        p["parameters/body"] = body_expr
    return {"runAfter": run_after or {}, "type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                 "connectionName": "shared_sharepointonline", "operationId": "HttpRequest"},
        "parameters": p, "authentication": "@parameters('$authentication')"}}


def setvar(name, value, run_after):
    return {"runAfter": run_after, "type": "SetVariable",
            "inputs": {"name": name, "value": value}}


def build_defn():
    trig = {"manual": {"type": "Request", "kind": "PowerAppV2", "inputs": {"schema": {
        "type": "object", "properties": {
            "text": {"title": "email", "type": "string", "x-ms-dynamically-added": True},
            "text_1": {"title": "channel", "type": "string", "x-ms-dynamically-added": True}},
        "required": ["text", "text_1"]}}}}
    a = {}
    a["Inputs"] = {"runAfter": {}, "type": "Compose", "inputs": {
        "email": "@toLower(coalesce(triggerBody()?['text'], ''))",
        "channel": "@coalesce(triggerBody()?['text_1'], '')"}}
    a["Init_Ok"] = {"runAfter": {"Inputs": ["Succeeded"]}, "type": "InitializeVariable",
                    "inputs": {"variables": [{"name": "ok", "type": "boolean", "value": False}]}}
    a["Init_Msg"] = {"runAfter": {"Init_Ok": ["Succeeded"]}, "type": "InitializeVariable",
                     "inputs": {"variables": [{"name": "msg", "type": "string", "value": "Save failed."}]}}
    a["Valid"] = {"runAfter": {"Init_Msg": ["Succeeded"]}, "type": "Compose",
                  "inputs": "@contains(createArray('Email','Teams','Email + Teams'), outputs('Inputs')?['channel'])"}

    find = sp(f"_api/web/lists(guid'{LIST}')/items?$select=Id,AppUser/EMail&$expand=AppUser"
              "&$filter=AppUser/EMail eq '@{outputs('Inputs')?['email']}'&$top=1")
    update = sp(f"_api/web/lists(guid'{LIST}')/items(@{{first(body('Find_Row')?['value'])?['Id']}})",
                "POST",
                "@string(json(concat('{\"NotifyChannel\":\"', outputs('Inputs')?['channel'], '\"}')))",
                merge=True)
    found_branch = {
        "Update_Row": update,
        "Set_Ok": setvar("ok", True, {"Update_Row": ["Succeeded"]}),
        "Set_Msg_Saved": setvar("msg", "Notification preference saved.", {"Set_Ok": ["Succeeded"]})}
    not_found = {"Set_Msg_NoRow": setvar(
        "msg", "@concat('No app profile for ', outputs('Inputs')?['email'], ' — ask HR to add you.')", {})}
    valid_branch = {
        "Find_Row": find,
        "If_Found": {"runAfter": {"Find_Row": ["Succeeded"]}, "type": "If",
                     "expression": {"and": [{"greaterOrEquals": [
                         "@length(body('Find_Row')?['value'])", 1]}]},
                     "actions": found_branch, "else": {"actions": not_found}}}
    a["If_Valid"] = {"runAfter": {"Valid": ["Succeeded"]}, "type": "If",
                     "expression": {"and": [{"equals": ["@outputs('Valid')", True]}]},
                     "actions": valid_branch,
                     "else": {"actions": {"Set_Msg_Bad": setvar(
                         "msg", "@concat('Unknown channel: ', outputs('Inputs')?['channel'])", {})}}}
    a["Respond"] = {"runAfter": {"If_Valid": ["Succeeded", "Failed", "Skipped", "TimedOut"]},
                    "type": "Response", "kind": "PowerApp",
                    "inputs": {"statusCode": 200,
                               "body": {"ok": "@variables('ok')", "message": "@variables('msg')"},
                               "schema": {"type": "object", "properties": {
                                   "ok": {"type": "boolean"}, "message": {"type": "string"}}}}}
    return {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": trig, "actions": a}


def _assert_connrefs_cover(defn):
    names = set()
    def walk(node):
        if isinstance(node, dict):
            host = node.get("inputs", {}).get("host", {}) if isinstance(node.get("inputs"), dict) else {}
            if "connectionName" in host:
                names.add(host["connectionName"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(defn)
    missing = names - set(CONNREFS)
    assert not missing, f"connectionReferences missing {missing}"
    return names


def dump():
    d = build_defn()
    used = _assert_connrefs_cover(d)
    (HERE / "flows-f8.json").write_text(json.dumps(d, indent=1))
    print(f"wrote flows-f8.json; actions={list(d['actions'])}; connections={sorted(used)}")


def patch():
    d = build_defn()
    _assert_connrefs_cover(d)
    r = req("PATCH", f"{BASE}/flows/{fid()}?{API}",
            {"properties": {"definition": d, "connectionReferences": CONNREFS}})
    if "error" in r:
        sys.exit(f"PATCH failed: {json.dumps(r)[:600]}")
    (HERE / "flows-f8.json").write_text(json.dumps(d, indent=1))
    print("patched", fid())


def start():
    print(req("POST", f"{BASE}/flows/{fid()}/start?{API}") or "started")


def share():
    put = [{"properties": {"principal": {"id": gid, "type": "Group"}, "roleName": "CanView"}}
           for gid in GROUPS.values()]
    print(req("POST", f"{BASE}/flows/{fid()}/modifyPermissions?{API}", {"put": put}) or "shared")


def verify():
    f = req("GET", f"{BASE}/flows/{fid()}?{API}")
    p = f.get("properties", {})
    d = p.get("definition", {})
    print("name   :", p.get("displayName"))
    print("state  :", p.get("state"))
    print("trigger:", list(d.get("triggers", {}).values())[0].get("kind"),
          list(d["triggers"]["manual"]["inputs"]["schema"]["properties"]))
    print("actions:", list(d.get("actions", {})))
    print("conns  :", list((p.get("connectionReferences") or p.get("installedConnectionReferences") or {})))
    perms = req("GET", f"{BASE}/flows/{fid()}/permissions?{API}")
    for v in perms.get("value", []):
        pr = v["properties"]
        print("perm   :", pr["principal"].get("id"), pr["principal"].get("type"), pr.get("roleName"))


if __name__ == "__main__":
    {"dump": dump, "patch": patch, "start": start, "share": share, "verify": verify}[sys.argv[1]]()
```

- [ ] **Step 2: Dump and inspect (no network)**

Run: `cd provision && python3 gen_f8.py dump && python3 -c "import json; d=json.load(open('flows-f8.json')); print(d['triggers']['manual']['inputs']['schema']['properties']); print(d['actions']['If_Valid']['actions']['Find_Row']['inputs']['parameters']['parameters/uri'])"`
Expected: `wrote flows-f8.json; actions=['Inputs', 'Init_Ok', 'Init_Msg', 'Valid', 'If_Valid', 'Respond']; connections=['shared_sharepointonline']`, then the two trigger properties (`text`, `text_1`) and a URI containing `$filter=AppUser/EMail eq '@{outputs('Inputs')?['email']}'&$top=1`.

- [ ] **Step 3: Commit**

```bash
git add provision/gen_f8.py provision/flows-f8.json
git commit -m "Author F8 - Set Notify Channel as a REST patch

Portal-born shell (PowerApps V2 flows the app must see need portal
birth), then this script patches the definition, starts it, and shares
it run-only to both groups.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**Orchestrator, after Jon supplies the flow ID** (Task 7 prerequisites):
- `az account show --query user.name -o tsv` must print `jsteen@uab.edu`; if not, `az account set --subscription d8999fe4-76af-40b3-b435-1d8977abc08c`.
- `echo <FLOW_ID> > provision/f8-id.txt && cd provision && python3 gen_f8.py patch && python3 gen_f8.py start && python3 gen_f8.py share && python3 gen_f8.py verify`
- Expected `verify`: `state : Started`, trigger `PowerAppV2 ['text', 'text_1']`, both group IDs listed with `CanView`.
- Commit `provision/f8-id.txt`.

---

### Task 4: `scr_settings` — the hub

**Files:**
- Create: `canvas/gen_settings.py`
- Generated: `canvas/src/scr_settings.pa.yaml`

**Interfaces:**
- Consumes: `rail_stamp.rail_text("scr_settings", "Settings")`; `gen_app.{con, ctl, emit_screen, content_root, pill, write, AUTOZ, NOSHADOW}`; App formulas `MyPermRow`, `MyNotifyChannel`, `MyRole`, `RoleColor`, `RoleFill`, `FriendlyName`, `IsHR`; flow `'OnBoard-SetNotifyChannel'.Run(email, channel)` → `{ok, message}`.
- Produces: screen `scr_settings`; buttons `btnStOpenUsers` → `Navigate(scr_admin_users)`, `btnStOpenRef` → `Navigate(scr_admin_refdata)`.

**How to build the file.** `gen_app.emit_screen(name, props, children)` returns YAML text for the whole screen where `children` is a list of `(name, node)` and nodes come from `con(props, children)` / `ctl(control, props, children)`. `nav_rail()` in gen_app is **stale** (four items, no accessibility props) — do not call it. Instead emit the screen with only the content root and modals, then prepend the rail text:

```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_screen, content_root, pill, write
from rail_stamp import rail_text

SCREEN, SFX = "scr_settings", "Settings"
SM = f"{SCREEN}.Size = ScreenSize.Small"

def build():
    body = emit_screen(SCREEN, {"Fill": "=UAB.OffWhite", "OnVisible": "=Refresh(AppPermissions)"},
                       [content_root(SCREEN, "cntSettingsRoot", root_children())])
    # emit_screen writes "    Children:\n" once; the rail goes first inside it
    head, _, tail = body.partition("    Children:\n")
    return head + "    Children:\n" + rail_text(SCREEN, SFX) + tail

if __name__ == "__main__":
    write(pathlib.Path(__file__).parent / "src" / f"{SCREEN}.pa.yaml", build())
```

Copy exact property sets from these `src` blocks rather than inventing them: screen title/sub — `scr_tasklibrary.pa.yaml` 385–462 (`cntTlHeader`); white hairline card — 543–557 (`conTlTableCard` props: `BorderColor: =UAB.Line`, `BorderThickness: =1`, `Fill: =UAB.White`, radius 8); label-over-input field — `scr_new_candidate.pa.yaml` 872–918 (`conNcFManager`, both children `FillPortions: =1`); primary/secondary `ModernButton` — `scr_tasklibrary.pa.yaml` 425–451 (`btnTlNew`) and 506–530 (`btnTlClear`).

- [ ] **Step 1: Write `canvas/gen_settings.py` producing this tree**

```
cntSettingsRoot (content_root)
  cntStHeader        con: Fill OffWhite, FillPortions 0, Height 100 (phone 88), vertical, gap 8
    lblStTitle       ModernText: Text ="Settings", Size UABSize.ScreenTitle, Semibold, TextPrimary, Height 44, AutoHeight true, Wrap false
    lblStSub         ModernText: Text =If(IsHR, "Your notification preference and app administration.", "Your notification preference."), Gray500, Body, Height 20, AutoHeight
  conStMeCard        con: white hairline card, FillPortions 0, vertical, gap 12, padding 20, Width =Min(640, Parent.Width)
    lblStEyebrow     ModernText: Text ="MY NOTIFICATIONS", Color UAB.Green, Bold, Size UABSize.Eyebrow, Height 18
    lblStMeName      ModernText: Text =FriendlyName(User().FullName), Size UABSize.SectionHeading, Semibold, TextPrimary, Height 30, Wrap false
    conStMeMeta      con: Fill White, FillPortions 0, horizontal, gap 12, Height 24, LayoutAlignItems Center
      conPillStRole  pill("StRole", 90, "=RoleFill(MyRole)", "=RoleColor(MyRole)", "=MyRole")   ← gen_app.pill
      lblStMeDiv     ModernText: Text =Coalesce(MyPermRow.Division.Value, "All divisions"), Gray700, Secondary, Height 18, AutoHeight, Wrap false
    conStMeRow       con: Fill White, FillPortions 0, Height =If(SM, 132, 66), LayoutDirection =If(SM, Vertical, Horizontal), gap 12, LayoutAlignItems =If(SM, Stretch, End)
      conStMeField   con: Fill White, FillPortions 1, vertical, gap 4, Height 66, LayoutAlignItems Stretch
        lblStChanCap ModernText: Text ="Send my notifications by", Gray700, Semibold, Secondary, Height 22, FillPortions 1, AutoHeight, Wrap false
        cmbStChannel ModernCombobox: Items =["Email", "Teams", "Email + Teams"], ItemDisplayText =ThisItem.Value, SelectMultiple =false, DefaultSelectedItems =[MyNotifyChannel], Height 40, FillPortions 1, AccessibleLabel ="Send my notifications by", DisplayMode =If(IsBlank(MyPermRow), DisplayMode.Disabled, DisplayMode.Edit)
      btnStSave      ModernButton: Text ="Save", BasePaletteColor UAB.Green, Height 40, Width 120, AccessibleLabel ="Save notification preference", DisplayMode =If(IsBlank(MyPermRow), DisplayMode.Disabled, DisplayMode.Edit), OnSelect (below)
    lblStMeNote      ModernText: Text (below), Gray500, Secondary, AutoHeight, Height 40, Wrap true
  conStTiles         con: Fill OffWhite, FillPortions 0, Visible =IsHR, LayoutDirection =If(SM, Vertical, Horizontal), gap 16, Height =If(SM, 296, 140)   ← LAST child of the root
    conStTileUsers   con: white hairline card, FillPortions 1, vertical, gap 8, padding 20, Height 140
      icoStTileUsers Classic/Icon: Icon =Icon.People, Color UAB.Green, Height 28, Width 28, AccessibleLabel ="Users and roles"
      lblStTileUsersT ModernText: Text ="Users & roles", TextPrimary, Semibold, Size UABSize.FieldLabel, Height 24, Wrap false
      lblStTileUsersS ModernText: Text =CountRows(AppPermissions) & " users with an app profile", Gray500, Secondary, Height 18, Wrap false
      btnStOpenUsers ModernButton: Text ="Manage", Appearance =ButtonAppearance.Secondary, BasePaletteColor UAB.Green, Height 32, Width 100, OnSelect =Navigate(scr_admin_users)
    conStTileRef     same shape, names *Ref*: Icon =Icon.Tools, "Reference data", Text =CountRows(Divisions) & " divisions · " & CountRows(FacultyRanks) & " ranks · " & CountRows(Stages) & " stages", btnStOpenRef → Navigate(scr_admin_refdata)
```

`btnStSave.OnSelect` (emit through `emit_control`; it contains `": "` so it must be a block scalar — `needs_block` does that):
```
=IfError(
    With({r: 'OnBoard-SetNotifyChannel'.Run(Lower(User().Email), cmbStChannel.Selected.Value)},
        If(r.ok,
           Refresh(AppPermissions); Notify(r.message, NotificationType.Success),
           Notify("Couldn't save: " & r.message, NotificationType.Error))),
    Notify("Couldn't save your preference - " & FirstError.Message, NotificationType.Error))
```

`lblStMeNote.Text`:
```
=If(IsBlank(MyPermRow),
    "No app profile yet - ask HR to add you.",
    "Assignment, digest, and approval emails always go by email. This setting adds Teams for everything else.")
```

Icons proven in this app so far: `Add, Cancel, Check, ChevronLeft, ChevronRight, DocumentWithContent, Notebook, People`. This plan introduces `Icon.Settings` (rail), `Icon.Tools` (tile), `Icon.Edit` and `Icon.Trash` (row actions, Tasks 5–6) — all standard classic icons. If the compiler rejects one: `Tools` → `Notebook`, `Edit` → `ChevronRight`, `Trash` → `Cancel`; `Settings` has no substitute, report it.

- [ ] **Step 2: Generate and check structure**

Run:
```bash
cd canvas && python3 gen_settings.py && python3 rail_stamp.py verify
grep -n "^      - \|^          - \|^            - " src/scr_settings.pa.yaml | head -40
grep -c "Fill: =" src/scr_settings.pa.yaml; grep -n "OnBoard-SetNotifyChannel" src/scr_settings.pa.yaml
```
Expected: `wrote scr_settings.pa.yaml`, `scr_settings: OK`; the outline shows `NavRail_Settings` then `cntSettingsRoot` with `cntStHeader`, `conStMeCard`, `conStTiles` in that order; the `.Run` line appears once inside a block scalar (`OnSelect: |-`).

- [ ] **Step 3: Layout audits**

Run:
```bash
python3 ~/.claude/skills/power-platform-ops/scripts/audit-canvas-ui.py canvas/src/scr_settings.pa.yaml
python3 ~/.claude/skills/power-platform-ops/scripts/audit-responsive-heights.py canvas/src
```
Expected: no findings on `scr_settings` (fix any container/height finding in the generator, regenerate, re-run — do not hand-edit the YAML).

- [ ] **Step 4: Commit**

```bash
git add canvas/gen_settings.py canvas/src/scr_settings.pa.yaml
git commit -m "Add the Settings hub screen

Everyone gets their notification preference (saved through F8); HR also
gets tiles into Users & roles and Reference data.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `scr_admin_users` — AppPermissions

**Files:**
- Create: `canvas/gen_admin_users.py`
- Generated: `canvas/src/scr_admin_users.pa.yaml`

**Interfaces:**
- Consumes: `rail_stamp.rail_text("scr_admin_users", "AdmUsers")`, gen_app helpers, App formulas `IsHR`, `RoleColor`, `RoleFill`; lists `AppPermissions`, `Divisions`; connector `Office365Users.SearchUser` (already in the app).
- Produces: screen `scr_admin_users`; `btnAuBack` → `Navigate(scr_settings)`.

Page size is **7**, not the spec's 8: Task Library went 8 → 7 in September because eight 56px rows under this same header/filter stack scrolled at design height.

**Template blocks to copy (line numbers in `canvas/src/scr_tasklibrary.pa.yaml`):** header 385–462; filter row 463–530; count label 531–542; table card + Paper header row 543–719 (note each header cell is a fixed-width `GroupContainer` wrapping a `ModernText` with `Align: =Align.Center` + `AlignInContainer: =AlignInContainer.Center`); twin gallery `galTlAll` 720–748 (invisible, `Height: =1`, `Width: =1`, one stub child); page gallery `galTlList` 749–1064 (row template = one AutoLayout wrapper `Height: =Parent.TemplateHeight`, `Width: =Parent.TemplateWidth`, content row + 1px divider **inside** it; opaque `Fill` on the Gallery itself); empty state 1065–1093; pager 1094–1149; bottom spacer 1150–1160; modal scrim + panel 1161–1198; modal head 1199–1242; a field row 1243–1290; actions row 1691–1813; confirm modal 1825–end. Person picker: `scr_new_candidate.pa.yaml` 898–918 (`cmbNcManager`), person record literal 1018–1026.

- [ ] **Step 1: Write `canvas/gen_admin_users.py` producing this tree**

Screen props: `Fill: =UAB.OffWhite`, `OnVisible` (block scalar):
```
=If(!IsHR, Navigate(scr_settings));
Refresh(AppPermissions);
Set(varAuPage, 1)
```

```
cntAdmUsersRoot (content_root)
  cntAuHeader        as cntTlHeader
    conAuTitleRow    horizontal, SpaceBetween
      lblAuTitle     "Users & roles" (ScreenTitle)
      conAuTitleBtns con: Fill OffWhite, FillPortions 0, horizontal, gap 8
        btnAuBack    ModernButton secondary: Text ="Settings", Appearance Secondary, BasePaletteColor UAB.Green, OnSelect =Navigate(scr_settings), Width 110, Height 36
        btnAuNew     ModernButton primary: Text ="Add user", BasePaletteColor UAB.Green, Width 120, Height 36, OnSelect (below)
    lblAuSub         "Who can open the app, what they see, and where their notifications go."
  conAuFilterRow     as conTlFilterRow
    txtAuSearch      ModernTextInput: Placeholder ="Search name or email", AccessibleLabel same, Width =If(SM, 160, 260), OnChange =Set(varAuPage, 1)
    cmbAuRole        ModernCombobox: Items =["HR", "Manager", "Viewer"], ItemDisplayText =ThisItem.Value, SelectMultiple =true, InputTextPlaceholder ="Role", AccessibleLabel ="Filter by role", Width =If(SM, 120, 180), OnChange =Set(varAuPage, 1)
    btnAuClear       ModernButton secondary "Clear": OnSelect =Reset(txtAuSearch); Reset(cmbAuRole); Set(varAuPage, 1)
  lblAuCount         Text =galAuAll.AllItemsCount & If(galAuAll.AllItemsCount = 1, " user", " users"), right-aligned Gray500 Secondary
  conAuTableCard     white hairline card
    conAuHeaderRow   Paper 40px: lblAuColUser ("User", FillPortions 1) · conAuColEmail/lblAuColEmail ("Email", Width =If(SM, 0, 260), Visible =!(SM)) · conAuColRole/lblAuColRole ("Role", Width 110, centered) · conAuColDiv/lblAuColDiv ("Division", Width =If(SM, 0, 200), Visible =!(SM)) · conAuColChan/lblAuColChan ("Notifications", Width =If(SM, 0, 140), Visible =!(SM)) · conAuColActs (Width 88, empty)
    galAuAll         invisible twin, Items (below)
    galAuList        7/page, Fill White, ShowScrollbar false, TemplatePadding 0, TemplateSize =If(SM, 72, 56), Height =Max(If(SM, 72, 56), Min(galAuAll.AllItemsCount, 7) * If(SM, 72, 56)), Items =With({t: galAuAll.AllItems, n: galAuAll.AllItemsCount}, FirstN(LastN(t, n - (Min(Coalesce(varAuPage, 1), Max(1, RoundUp(n / 7, 0))) - 1) * 7), 7))
      conAuListRow   wrapper (TemplateHeight/TemplateWidth)
        conAuRowContent horizontal, gap 12, padding 12/16
          conAuCellMain  vertical, FillPortions 1, JustifyContent Center
            lblAuRowName Label (classic, click target): Text =Coalesce(ThisItem.AppUser.DisplayName, ThisItem.Title), Size UABSize.Body, Semibold, TextPrimary, Wrap false, TabIndex 0, FocusedBorderColor Gold, OnSelect (below: open edit)
            lblAuRowSub  Label: Text =If(SM, Coalesce(ThisItem.AppUser.Email, ""), Coalesce(ThisItem.Division.Value, "All divisions") & " · " & Coalesce(ThisItem.NotifyChannel.Value, "Email")), Gray500, Secondary, Wrap false, Visible =true
          conAuCellEmail Width =If(SM, 0, 260), Visible =!(SM): lblAuCellEmail ModernText =Coalesce(ThisItem.AppUser.Email, ""), Gray700, Secondary, Wrap false
          conAuCellRole  Width 110, JustifyContent Center: conAuPillRole (pill shape as conTlPillActive 24px/999 radius, Width 84, Fill =RoleFill(ThisItem.Role.Value), text Color =RoleColor(ThisItem.Role.Value), Text =Coalesce(ThisItem.Role.Value, "Viewer"))
          conAuCellDiv   Width =If(SM, 0, 200), Visible =!(SM): lblAuCellDiv ModernText =Coalesce(ThisItem.Division.Value, "All divisions")
          conAuCellChan  Width =If(SM, 0, 140), Visible =!(SM): lblAuCellChan ModernText =Coalesce(ThisItem.NotifyChannel.Value, "Email")
          icoAuRowEdit   Classic/Icon: Icon =Icon.Edit, Color UAB.Green, 24×24, TabIndex 0, AccessibleLabel ="Edit " & Coalesce(ThisItem.AppUser.DisplayName, ""), OnSelect (open edit)
          icoAuRowDelete Classic/Icon: Icon =Icon.Trash, Color =If(Lower(Coalesce(ThisItem.AppUser.Email, "")) = Lower(User().Email), UAB.Gray300, UAB.Danger), 24×24, TabIndex 0, AccessibleLabel ="Remove " & …, OnSelect (open confirm)
        conAuListDivider 1px Line
    conAuListEmpty   Text =If(IsBlank(Trim(txtAuSearch.Text)) && Coalesce(CountRows(cmbAuRole.SelectedItems), 0) = 0, "No users yet - add the first one.", "No users match the current filters."), Visible =galAuAll.AllItemsCount = 0
    conAuPager       as conTlPager with varAuPage / galAuAll / page size 7
  lblAuBottomSpacer  as lblTlBottomSpacer
conAuModal (screen-level scrim, Visible =Coalesce(varAuShow, false))
  conAuPanel         content-bounded: NO Height, NO LayoutOverflowY; LayoutMaxHeight =Parent.Height - 32; Width =Min(560, Parent.Width - 32); otherwise as conTlPanel
    conAuModalHead   lblAuModalTitle Text =If(Coalesce(varAuMode, "add") = "edit", "Edit user", "Add user") · icoAuClose (X, Solid border) OnSelect =Set(varAuShow, false)
    conAuRowUser     vertical field, Height =If(Coalesce(varAuMode, "add") = "edit", 0, 66), Visible =Coalesce(varAuMode, "add") = "add"
      lblAuUserCap   "User"
      cmbAuUser      ModernCombobox — copy cmbNcManager's Items/ItemDisplayText/InputTextPlaceholder/SelectMultiple verbatim, replacing every `cmbNcManager` with `cmbAuUser`; AccessibleLabel ="User"
    lblAuEditing     ModernText: Text ="Editing " & Coalesce(varAuEditName, "") & " · " & Coalesce(varAuEditEmail, ""), Gray700, Secondary, Height =If(Coalesce(varAuMode, "add") = "edit", 20, 0), Visible =Coalesce(varAuMode, "add") = "edit", Wrap false
    conAuRowRoleDiv  horizontal, gap 16, Height 66
      conAuFRole     vertical field: lblAuRoleCap "Role" · cmbAuRole1 ModernCombobox Items =["HR", "Manager", "Viewer"], ItemDisplayText =ThisItem.Value, SelectMultiple false, DefaultSelectedItems =[Coalesce(varAuEditRole, "Viewer")], AccessibleLabel "Role"
      conAuFDiv      vertical field: lblAuDivCap "Division (optional)" · cmbAuDivision ModernCombobox Items =SortByColumns(Divisions, "Title"), ItemDisplayText =ThisItem.Title, SelectMultiple false, DefaultSelectedItems =Filter(Divisions, ID = Coalesce(varAuEditDivId, 0)), InputTextPlaceholder ="All divisions", AccessibleLabel "Division"
    conAuRowChannel  vertical field: lblAuChanCap "Notifications" · cmbAuChannel Items =["Email", "Teams", "Email + Teams"], ItemDisplayText =ThisItem.Value, SelectMultiple false, DefaultSelectedItems =[Coalesce(varAuEditChan, "Email")], AccessibleLabel "Notifications"
    conAuActions     horizontal, gap 8: btnAuSave (primary "Save") · btnAuCancel (secondary "Cancel", OnSelect =Set(varAuShow, false))
conAuConfirm (screen-level scrim, Visible =Coalesce(varAuShowConfirm, false))
  conAuConfirmPanel  as conTlConfirmPanel, Width =Min(440, Parent.Width - 32)
    lblAuConfirmTitle Text ="Remove " & Coalesce(varAuDelName, "this user") & "?"
    lblAuConfirmBody  Text (below)
    conAuConfirmActions: btnAuConfirmDelete (BasePaletteColor UAB.Danger, Text ="Remove", DisplayMode =If(Lower(Coalesce(varAuDelEmail, "")) = Lower(User().Email), DisplayMode.Disabled, DisplayMode.Edit)) · btnAuConfirmCancel
```

`galAuAll.Items`:
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

Open-add (`btnAuNew.OnSelect`):
```
=Set(varAuMode, "add"); Set(varAuEditId, 0); Set(varAuEditName, ""); Set(varAuEditEmail, "");
Set(varAuEditRole, "Viewer"); Set(varAuEditDivId, 0); Set(varAuEditChan, "Email");
Reset(cmbAuUser); Reset(cmbAuRole1); Reset(cmbAuDivision); Reset(cmbAuChannel);
Set(varAuShow, true)
```

Open-edit (`lblAuRowName.OnSelect` and `icoAuRowEdit.OnSelect`, identical):
```
=Set(varAuMode, "edit"); Set(varAuEditId, ThisItem.ID);
Set(varAuEditName, Coalesce(ThisItem.AppUser.DisplayName, ThisItem.Title));
Set(varAuEditEmail, Coalesce(ThisItem.AppUser.Email, ""));
Set(varAuEditRole, Coalesce(ThisItem.Role.Value, "Viewer"));
Set(varAuEditDivId, Coalesce(ThisItem.Division.Id, 0));
Set(varAuEditChan, Coalesce(ThisItem.NotifyChannel.Value, "Email"));
Reset(cmbAuRole1); Reset(cmbAuDivision); Reset(cmbAuChannel);
Set(varAuShow, true)
```

Open-confirm (`icoAuRowDelete.OnSelect`):
```
=Set(varAuDelId, ThisItem.ID);
Set(varAuDelName, Coalesce(ThisItem.AppUser.DisplayName, ThisItem.Title));
Set(varAuDelEmail, Coalesce(ThisItem.AppUser.Email, ""));
Set(varAuShowConfirm, true)
```

`btnAuSave.OnSelect` (validation, then one guarded write; note the `": "` strings — block scalar):
```
=With({mode: Coalesce(varAuMode, "add"),
       mail: Lower(Coalesce(cmbAuUser.Selected.Mail, cmbAuUser.Selected.UserPrincipalName, "")),
       dupe: If(Coalesce(varAuMode, "add") = "add",
                !IsBlank(LookUp(AppPermissions,
                    Lower(Coalesce(AppUser.Email, "")) = Lower(Coalesce(cmbAuUser.Selected.Mail, cmbAuUser.Selected.UserPrincipalName, "")))),
                false)},
    If(mode = "add" && IsBlank(cmbAuUser.Selected),
        Notify("Pick a user.", NotificationType.Warning),
       mode = "add" && dupe,
        Notify("That person already has a row - edit it instead.", NotificationType.Warning),
       IsBlank(cmbAuRole1.Selected),
        Notify("Pick a role.", NotificationType.Warning),
       mode = "edit" && Lower(Coalesce(varAuEditEmail, "")) = Lower(User().Email) && cmbAuRole1.Selected.Value <> "HR",
        Notify("You can't change your own role.", NotificationType.Warning),
       IfError(
           If(mode = "add",
              Patch(AppPermissions, Defaults(AppPermissions),
                  {Title: cmbAuUser.Selected.DisplayName,
                   AppUser: {Claims: "i:0#.f|membership|" & mail, Department: "",
                             DisplayName: cmbAuUser.Selected.DisplayName, Email: mail,
                             JobTitle: "", Picture: ""},
                   Role: {Value: cmbAuRole1.Selected.Value},
                   NotifyChannel: {Value: Coalesce(cmbAuChannel.Selected.Value, "Email")},
                   Division: If(IsBlank(cmbAuDivision.Selected), Blank(),
                       {Id: cmbAuDivision.Selected.ID, Value: cmbAuDivision.Selected.Title})}),
              Patch(AppPermissions, LookUp(AppPermissions, ID = varAuEditId),
                  {Title: Coalesce(varAuEditName, ""),
                   Role: {Value: cmbAuRole1.Selected.Value},
                   NotifyChannel: {Value: Coalesce(cmbAuChannel.Selected.Value, "Email")},
                   Division: If(IsBlank(cmbAuDivision.Selected), Blank(),
                       {Id: cmbAuDivision.Selected.ID, Value: cmbAuDivision.Selected.Title})})),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varAuShow, false);
           Notify(If(mode = "add", "User added.", "User updated."), NotificationType.Success))))
```

`lblAuConfirmBody.Text`:
```
=If(Lower(Coalesce(varAuDelEmail, "")) = Lower(User().Email),
    "You can't remove your own access. Another HR user can.",
    "They'll drop to Viewer the next time they open the app. Their group membership is unchanged.")
```

`btnAuConfirmDelete.OnSelect`:
```
=IfError(
    Remove(AppPermissions, LookUp(AppPermissions, ID = varAuDelId)),
    Notify("Couldn't remove: " & FirstError.Message, NotificationType.Error),
    Set(varAuShowConfirm, false);
    Notify("User removed.", NotificationType.Success))
```

- [ ] **Step 2: Generate and check structure**

Run:
```bash
cd canvas && python3 gen_admin_users.py && python3 rail_stamp.py verify
grep -n "^      - " src/scr_admin_users.pa.yaml
grep -c "IfError(" src/scr_admin_users.pa.yaml; grep -c "Patch(\|Remove(" src/scr_admin_users.pa.yaml
grep -n "SearchUser" src/scr_admin_users.pa.yaml; grep -c "cmbNcManager" src/scr_admin_users.pa.yaml
```
Expected: screen-level children in order `NavRail_AdmUsers`, `cntAdmUsersRoot`, `conAuModal`, `conAuConfirm`; `IfError(` count 2, `Patch(|Remove(` count 3 (two Patch, one Remove), every write inside an IfError; one `SearchUser`; zero `cmbNcManager`.

- [ ] **Step 3: Layout audits**

Run the two audit scripts as in Task 4 Step 3 against `scr_admin_users.pa.yaml`. Expected: clean; fix in the generator.

- [ ] **Step 4: Commit**

```bash
git add canvas/gen_admin_users.py canvas/src/scr_admin_users.pa.yaml
git commit -m "Add the Users & roles admin screen

AppPermissions CRUD for HR: people picker via Office 365 Users, role,
division, notification channel; HR can't demote or remove themselves.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `scr_admin_refdata` — Divisions · Faculty Ranks · Stages

**Files:**
- Create: `canvas/gen_admin_refdata.py`
- Generated: `canvas/src/scr_admin_refdata.pa.yaml`

**Interfaces:**
- Consumes: `rail_stamp.rail_text("scr_admin_refdata", "AdmRef")`, gen_app helpers, `IsHR`; lists `Divisions`, `FacultyRanks`, `Stages`, `Departments`, `Candidates`, `AppPermissions`.
- Produces: screen `scr_admin_refdata`; `btnArBack` → `Navigate(scr_settings)`; collection `colArRows` with columns `{ID, Title, Detail, Flag, FlagText, Order}`.

Template blocks: same Task Library ranges as Task 5. Toggle example: `scr_tasklibrary.pa.yaml` 497–505 (`tglTlRetired`, a `ModernToggle` with `BasePaletteColor`). Multi-line input: `txtTlDesc` at 1305–1315 (`Type: =TextInputType.Multiline`, `Height: =68`).

- [ ] **Step 1: Write `canvas/gen_admin_refdata.py` producing this tree**

Screen props: `Fill: =UAB.OffWhite`, `OnVisible`:
```
=If(!IsHR, Navigate(scr_settings));
Set(varArEntity, Coalesce(varArEntity, "Divisions"));
Select(btnArReload)
```

```
NavRail_AdmRef
btnArReload        screen-level ModernButton: Visible =false, Text ="reload", X 0, Y 0, Width 1, Height 1, OnSelect (below)
cntAdmRefRoot (content_root)
  cntArHeader
    conArTitleRow  lblArTitle "Reference data" · conArTitleBtns: btnArBack ("Settings", secondary) · btnArNew (primary, Text =If(varArEntity = "FacultyRanks", "Add rank", "Add division"), Visible =Coalesce(varArEntity, "Divisions") <> "Stages", OnSelect (below))
    lblArSub       "Divisions, faculty ranks, and pipeline stages. Stage order is fixed by the flows."
  conArTabs        con: Fill OffWhite, FillPortions 0, horizontal, gap 8, Height 40
    btnArTabDiv    ModernButton: Text ="Divisions", Appearance =If(Coalesce(varArEntity, "Divisions") = "Divisions", ButtonAppearance.Primary, ButtonAppearance.Secondary), BasePaletteColor UAB.Green, Width =If(SM, 90, 120), OnSelect =Set(varArEntity, "Divisions"); Select(btnArReload)
    btnArTabRank   same, "Faculty ranks", "FacultyRanks", Width =If(SM, 110, 140)
    btnArTabStage  same, "Stages", "Stages", Width =If(SM, 80, 110)
  lblArCount       Text =CountRows(colArRows) & Switch(Coalesce(varArEntity, "Divisions"), "Divisions", " divisions", "FacultyRanks", " ranks", " stages")
  conArTableCard
    conArHeaderRow Paper: lblArColName ("Name", FillPortions 1) · conArColDetail ("Description", Width =If(SM || varArEntity <> "Stages", 0, 320), Visible =!(SM) && varArEntity = "Stages") · conArColFlag ("Status", Width 110, centered, Visible =varArEntity <> "Divisions") · conArColOrder ("Order", Width =If(varArEntity = "Stages", 72, 0), Visible =varArEntity = "Stages", centered) · conArColActs (Width 88)
    galArList      Items =colArRows, Fill White, ShowScrollbar false, TemplatePadding 0, TemplateSize =If(SM, 72, 56), Height =Max(If(SM, 72, 56), Min(CountRows(colArRows), 10) * If(SM, 72, 56)), no twin (≤ 10 rows)
      conArListRow / conArRowContent
        conArCellMain: lblArRowTitle (Label click target, Text =ThisItem.Title, OnSelect open-edit) · lblArRowSub (Label, Text =If(SM && varArEntity = "Stages", Left(ThisItem.Detail, 60), ""), Visible =SM && varArEntity = "Stages")
        conArCellDetail (Width/Visible as header): lblArCellDetail ModernText Text =With({d: ThisItem.Detail}, If(Len(d) > 110, Left(d, 107) & "...", d)), LayoutMaxHeight 40, Wrap true
        conArCellFlag (Width 110, Visible =varArEntity <> "Divisions"): conArPillFlag (pill 24px, Width 96, Fill =If(ThisItem.Flag, UAB.SuccessTint, UAB.Paper), Color =If(ThisItem.Flag, UAB.SuccessText, UAB.Gray500), Text =ThisItem.FlagText)
        conArCellOrder (Width =If(varArEntity = "Stages", 72, 0), Visible =varArEntity = "Stages"): lblArCellOrder ModernText Text =Text(ThisItem.Order), centered
        icoArRowEdit   Classic/Icon Edit, OnSelect open-edit
        icoArRowDelete Classic/Icon Trash, Width =If(Coalesce(varArEntity, "Divisions") = "Stages", 0, 24), Visible =Coalesce(varArEntity, "Divisions") <> "Stages", OnSelect (below)
      conArListDivider
    conArListEmpty Text =Switch(Coalesce(varArEntity, "Divisions"), "Divisions", "No divisions yet - add the first one.", "FacultyRanks", "No ranks yet - add the first one.", "No stages found."), Visible =CountRows(colArRows) = 0
  lblArBottomSpacer
conArModalDiv   scrim Visible =Coalesce(varArShowDiv, false) → conArDivPanel (content-bounded, Width Min(480, …))
  conArDivHead: lblArDivTitle =If(Coalesce(varArEditId, 0) = 0, "Add division", "Edit division") · icoArDivClose
  conArDivRowTitle: lblArDivTitleCap "Name" · txtArDivTitle ModernTextInput Default =Coalesce(varArEditTitle, "")
  conArDivActions: btnArDivSave · btnArDivCancel
conArModalRank  scrim Visible =Coalesce(varArShowRank, false) → conArRankPanel
  conArRankHead: "Add rank"/"Edit rank" · icoArRankClose
  conArRankRowTitle: "Name" · txtArRankTitle Default =Coalesce(varArEditTitle, "")
  conArRankRowPT: tglArRankPT ModernToggle: Label ="Requires promotion & tenure review", Default =Coalesce(varArEditFlag, false), BasePaletteColor UAB.Green
  conArRankActions: btnArRankSave · btnArRankCancel
conArModalStage scrim Visible =Coalesce(varArShowStage, false) → conArStagePanel (Width Min(560, …))
  conArStageHead: "Edit stage" · icoArStageClose
  lblArStageOrder ModernText: Text ="Stage " & Text(Coalesce(varArEditOrder, 0)) & " of " & Text(CountRows(Stages)) & " - order is fixed", Gray500, Secondary
  conArStageRowTitle: "Name" · txtArStageTitle
  conArStageRowDesc: "Description" · txtArStageDesc ModernTextInput Type =TextInputType.Multiline, Height 96, Default =Coalesce(varArEditDetail, "")
  conArStageRowActive: tglArStageActive ModernToggle Label ="Active", Default =Coalesce(varArEditFlag, true), BasePaletteColor UAB.Green
  conArStageActions: btnArStageSave · btnArStageCancel
conArConfirm    scrim Visible =Coalesce(varArShowConfirm, false) → conArConfirmPanel
  lblArConfirmTitle ="Delete " & Coalesce(varArDelTitle, "") & "?"
  lblArConfirmBody (below)
  conArConfirmActions: btnArConfirmDelete (Danger, DisplayMode =If(Coalesce(varArInUse, 0) > 0, DisplayMode.Disabled, DisplayMode.Edit)) · btnArConfirmCancel
```

`btnArReload.OnSelect`:
```
=Switch(Coalesce(varArEntity, "Divisions"),
    "Divisions",
        ClearCollect(colArRows, ForAll(SortByColumns(Divisions, "Title"),
            {ID: ID, Title: Title, Detail: "", Flag: false, FlagText: "", Order: 0})),
    "FacultyRanks",
        ClearCollect(colArRows, ForAll(SortByColumns(FacultyRanks, "Title"),
            {ID: ID, Title: Title, Detail: "", Flag: Coalesce(RequiresPT, false),
             FlagText: If(Coalesce(RequiresPT, false), "Requires P&T", "No P&T"), Order: 0})),
    "Stages",
        ClearCollect(colArRows, ForAll(SortByColumns(Stages, "OrderIndex"),
            {ID: ID, Title: Title, Detail: Coalesce(Description, ""), Flag: Coalesce(IsActive, true),
             FlagText: If(Coalesce(IsActive, true), "Active", "Inactive"), Order: Coalesce(OrderIndex, 0)})))
```

`btnArNew.OnSelect`:
```
=Set(varArEditId, 0); Set(varArEditTitle, ""); Set(varArEditFlag, false); Set(varArEditDetail, ""); Set(varArEditOrder, 0);
Reset(txtArDivTitle); Reset(txtArRankTitle); Reset(tglArRankPT);
If(Coalesce(varArEntity, "Divisions") = "FacultyRanks", Set(varArShowRank, true), Set(varArShowDiv, true))
```

Open-edit (`lblArRowTitle.OnSelect`, `icoArRowEdit.OnSelect`):
```
=Set(varArEditId, ThisItem.ID); Set(varArEditTitle, ThisItem.Title); Set(varArEditFlag, ThisItem.Flag);
Set(varArEditDetail, ThisItem.Detail); Set(varArEditOrder, ThisItem.Order);
Reset(txtArDivTitle); Reset(txtArRankTitle); Reset(tglArRankPT); Reset(txtArStageTitle); Reset(txtArStageDesc); Reset(tglArStageActive);
Switch(Coalesce(varArEntity, "Divisions"),
    "Divisions", Set(varArShowDiv, true),
    "FacultyRanks", Set(varArShowRank, true),
    "Stages", Set(varArShowStage, true))
```

`btnArDivSave.OnSelect`:
```
=With({t: Trim(txtArDivTitle.Text)},
    If(IsBlank(t), Notify("Enter a name.", NotificationType.Warning),
       Coalesce(varArEditId, 0) = 0 && !IsBlank(LookUp(Divisions, Lower(Title) = Lower(t))),
        Notify("A division with that name already exists.", NotificationType.Warning),
       IfError(
           If(Coalesce(varArEditId, 0) = 0,
              Patch(Divisions, Defaults(Divisions),
                  {Title: t, Department: {Id: 1, Value: LookUp(Departments, ID = 1).Title}}),
              Patch(Divisions, LookUp(Divisions, ID = varArEditId), {Title: t})),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varArShowDiv, false); Select(btnArReload);
           Notify("Division saved.", NotificationType.Success))))
```

`btnArRankSave.OnSelect`:
```
=With({t: Trim(txtArRankTitle.Text)},
    If(IsBlank(t), Notify("Enter a name.", NotificationType.Warning),
       Coalesce(varArEditId, 0) = 0 && !IsBlank(LookUp(FacultyRanks, Lower(Title) = Lower(t))),
        Notify("A rank with that name already exists.", NotificationType.Warning),
       IfError(
           If(Coalesce(varArEditId, 0) = 0,
              Patch(FacultyRanks, Defaults(FacultyRanks), {Title: t, RequiresPT: tglArRankPT.Checked}),
              Patch(FacultyRanks, LookUp(FacultyRanks, ID = varArEditId), {Title: t, RequiresPT: tglArRankPT.Checked})),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varArShowRank, false); Select(btnArReload);
           Notify("Rank saved.", NotificationType.Success))))
```

`btnArStageSave.OnSelect` (never writes `OrderIndex`):
```
=With({t: Trim(txtArStageTitle.Text)},
    If(IsBlank(t), Notify("Enter a name.", NotificationType.Warning),
       IfError(
           Patch(Stages, LookUp(Stages, ID = varArEditId),
               {Title: t, Description: txtArStageDesc.Text, IsActive: tglArStageActive.Checked}),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varArShowStage, false); Select(btnArReload);
           Notify("Stage saved.", NotificationType.Success))))
```

`icoArRowDelete.OnSelect`:
```
=Set(varArDelId, ThisItem.ID); Set(varArDelTitle, ThisItem.Title);
Set(varArInUse,
    Switch(Coalesce(varArEntity, "Divisions"),
        "Divisions", CountRows(Filter(Candidates, Division.Id = ThisItem.ID))
                     + CountRows(Filter(AppPermissions, Division.Id = ThisItem.ID)),
        "FacultyRanks", CountRows(Filter(Candidates, FacultyRank.Id = ThisItem.ID)),
        0));
Set(varArShowConfirm, true)
```

`lblArConfirmBody.Text`:
```
=If(Coalesce(varArInUse, 0) > 0,
    "In use by " & Text(varArInUse) & If(varArInUse = 1, " record", " records") & " - reassign them first.",
    "This can't be undone.")
```

`btnArConfirmDelete.OnSelect`:
```
=IfError(
    If(Coalesce(varArEntity, "Divisions") = "FacultyRanks",
       Remove(FacultyRanks, LookUp(FacultyRanks, ID = varArDelId)),
       Remove(Divisions, LookUp(Divisions, ID = varArDelId))),
    Notify("Couldn't delete: " & FirstError.Message, NotificationType.Error),
    Set(varArShowConfirm, false); Select(btnArReload);
    Notify("Deleted.", NotificationType.Success))
```

- [ ] **Step 2: Generate and check structure**

Run:
```bash
cd canvas && python3 gen_admin_refdata.py && python3 rail_stamp.py verify
grep -n "^      - " src/scr_admin_refdata.pa.yaml
grep -c "IfError(" src/scr_admin_refdata.pa.yaml; grep -c "Patch(\|Remove(" src/scr_admin_refdata.pa.yaml
grep -c "OrderIndex" src/scr_admin_refdata.pa.yaml
```
Expected: screen-level children `NavRail_AdmRef`, `btnArReload`, `cntAdmRefRoot`, `conArModalDiv`, `conArModalRank`, `conArModalStage`, `conArConfirm`; `IfError(` = 4; `Patch(|Remove(` = 7 (5 Patch, 2 Remove); `OrderIndex` appears exactly once (the `SortByColumns` in the reload) — never inside a `Patch`.

- [ ] **Step 3: Layout audits** — as Task 4 Step 3, against `scr_admin_refdata.pa.yaml`.

- [ ] **Step 4: Commit**

```bash
git add canvas/gen_admin_refdata.py canvas/src/scr_admin_refdata.pa.yaml
git commit -m "Add the Reference data admin screen

Divisions and Faculty Ranks get add/edit/delete (delete refused while in
use); Stages is edit-only with OrderIndex read-only, since F3 keys off it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Integration push and verification (orchestrator + Jon)

**Files:** everything under `canvas/src/`; `provision/f8-id.txt`.

**Prerequisites (Jon):**
1. In the Power Automate portal, open `OnBoard - Apply Template` → **Save As** → name exactly `OnBoard - Set Notify Channel` → send me the new flow's ID from its URL.
2. After I run the patch (Task 3 orchestrator block): in the portal, **Test → Manually**, inputs `email` = your `@uab.edu` address, `channel` = `Teams` → expect `ok: true`; check the AppPermissions list shows `Teams`; run again with `Email` to restore.
3. In Studio: Power Automate pane → **Add flow** → `OnBoard - Set Notify Channel`; then **reload the tab**. Tell me when done.

- [ ] **Step 1: Confirm F8 is registered in the session**

`connect` fresh; `sync_canvas` to scratch; `grep -rl "OnBoard-SetNotifyChannel" <scratch>` should hit nothing yet (no formula uses it) — instead confirm `list_data_sources` output or the synced `App.pa.yaml` shows no regression, and ask Jon to confirm the flow is in the pane. If a later compile reports `'OnBoard-SetNotifyChannel' isn't recognized`, the registration isn't in the session: Jon reloads Studio, I `connect` again.

- [ ] **Step 2: Push `App.pa.yaml` (property-only)**

`compile_canvas canvas/src` — expected zero errors. Then double-push per protocol using this forcing edit: none needed if push #2 is the structural push in Step 3 (a changed file set is a real change). `sync_canvas` to scratch and `grep MyPermRow <scratch>/App.pa.yaml` must hit.

- [ ] **Step 3: Structural push — eight screens + editor state**

1. `compile_canvas canvas/src`. Fix any error by editing the **generator** (or the splice) and regenerating; re-run until zero errors. Record the delegation-warning count.
2. `sync_canvas` → scratch **A**. `grep -c conNavSettings_ A/*.pa.yaml` = 1 in all eight; `ls A` lists the three new screens.
3. Forcing edit for push #2 — bump `lblStMeNote.Height` from 40 to 44 in `gen_settings.py`, regenerate.
4. `compile_canvas` → `sync_canvas` → scratch **B**. `diff -r A B` non-empty.
5. In **B**, verify order: for each of the eight screens, the sequence of `conNav*_<Sfx>` names must be `NewCand, Candidates, MyTasks, Templates, TaskLib, Settings`; for the new screens the top-level children must be in the order listed in Tasks 4–6.
6. Copy **B** over `canvas/src`; `python3 canvas/rail_stamp.py verify` → all eight `OK`; `git diff --stat`; commit `"Adopt the server canonical form after the Settings push"`.

- [ ] **Step 4: Jon — reload before saving**

Reload the Studio tab. Confirm the Settings item shows on every screen, and that `scr_settings`, `scr_admin_users`, `scr_admin_refdata` all render (no grey rectangle, no black blocks). **If the canvas is grey: close the tab without saving, reopen, tell me — never Cmd+S on grey.** When it renders, **File → Save**.

- [ ] **Step 5: Functional checks (Jon as HR)**

| # | Do | Expect |
|---|---|---|
| 1 | Settings → change channel to Teams → Save | green "Notification preference saved."; list row shows Teams; F8 run history shows a run |
| 2 | Users & roles → Add user → pick a colleague, Manager, a division, Email → Save | row appears; list shows Role/Division/NotifyChannel populated, Title = display name |
| 3 | Edit that row → Viewer, clear division → Save | row updates; Division blank in the list (runtime check §9) |
| 4 | Edit your own row → Viewer → Save | "You can't change your own role." |
| 5 | Trash on your own row | Remove button disabled, body explains |
| 6 | Trash on the colleague → Remove | row gone |
| 7 | Reference data → Divisions → Add "Zztest Division" | appears; New Candidate's division picker lists it |
| 8 | Trash on Maternal-Fetal Medicine (in use) | Remove disabled, body shows the count |
| 9 | Trash on Zztest Division | deleted |
| 10 | Faculty ranks → edit Professor, toggle P&T off then on → Save | pill updates |
| 11 | Stages → edit stage 3 description → Save | list shows it; OrderIndex unchanged |
| 12 | App Checker → read complexity for the three new screens + candidates + templates | paste numbers to me |
| 13 | Spec §9 runtime checks while doing the above | check 3 leaves Division blank in the list; Reference data shows rows on first open (no empty flash); the Settings rail item is lit on both spokes; the edit modal on Users shows no dead band where the user picker was |

- [ ] **Step 6: Functional checks (Jon with the PA-only account)**

Settings item visible; hub shows the card only (no tiles); channel save works via F8; typing a spoke into the URL / any path to a spoke bounces to the hub.

- [ ] **Step 7: Fix-ups**

Any defect → fix in the generator → regenerate → property-only push (with a forcing change) → Jon reloads → Save. Commit each.

---

### Task 8: Documentation

**Files:**
- Modify: `SESSION-CONTEXT.md` (build-state row 5, "Deferred / parked" list), `provision/INVENTORY.md` (flows table + AppPermissions note), `PLATFORM-REBUILD-PLAN.md` (§2 decision log, §7 Admin row, §17 build sequence)
- Modify (skill repo, symlinked): `~/.claude/skills/power-platform-ops/references/uab-environment.md` — F8 ID under OnBoardPro flows.

- [ ] **Step 1: SESSION-CONTEXT.md**

In the step-5 row, append a paragraph beginning `**Settings hub + Admin screens added 2026-09-<dd>**` covering: three screens (`scr_settings` / `scr_admin_users` / `scr_admin_refdata`), the six-item rail stamped by `canvas/rail_stamp.py` (canonical = Task Library rail; run `verify` after any rail change), F8 and why (Read-only PA on AppPermissions), Stages edit-only, Departments excluded, the App Checker numbers from check 12, and the new delegation baseline. Remove "AppPermissions management" from the parked list if present; add "Departments CRUD / Stages reorder — by decision, not built".

- [ ] **Step 2: provision/INVENTORY.md**

Flows table: add `| OnBoard - Set Notify Channel (F8) | <id> | **Live** — PowerAppV2 (text=email, text_1=channel); updates the caller's AppPermissions.NotifyChannel; run-only to both groups; generator gen_f8.py |`. Under "Permission state", add a line: `AppPermissions — inherits the site (PA = Read); self-service NotifyChannel writes go through F8.`

- [ ] **Step 3: PLATFORM-REBUILD-PLAN.md**

Decision log: append 15 (Settings hub + spokes; F8 broker), 16 (Stages edit-only, OrderIndex fixed), 17 (Departments out of the admin surface). §7: replace the Admin row's contents with the built shape. §17: add step 9 "Settings + Admin screens — ✅ <date>".

- [ ] **Step 4: uab-environment.md** — add F8 to the OnBoardPro flow list; commit in `~/Documents/GitHub/claude-config` and push.

- [ ] **Step 5: Commit**

```bash
git add SESSION-CONTEXT.md provision/INVENTORY.md PLATFORM-REBUILD-PLAN.md provision/f8-id.txt
git commit -m "Record the Settings hub, admin screens and F8

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
