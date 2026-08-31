#!/usr/bin/env python3
"""Generate utility-flow action payloads that provision the OnBoardPro schema.

The SCHEMA dict below is the source of truth for every list and column
(internal names are the keys — all verified <= 32 chars). Phases:

  python3 genpayloads.py phase1              -> phase1.json (create lists + libraries)
  python3 genpayloads.py guids               -> guids.json  (parse out-phase1/*)
  python3 genpayloads.py phase2              -> phase2-N.json (fields, chunked)
  python3 genpayloads.py phase3              -> phase3.json (read back all fields)
  python3 genpayloads.py verify              -> diff out-phase3/* against SCHEMA
"""
import json
import sys
from pathlib import Path

SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"

CAND_TYPES = ["Staff", "Faculty", "Clinical", "Faculty Clinical", "Other"]
PHASES = ["Pre-Hire", "Onboarding"]
ANCHORS = ["LOI", "LOO Issued", "LOO Accepted", "Start", "Fixed", "None"]
ROLES = ["Person", "Manager", "HR", "Candidate"]
PRIOS = ["Low", "Medium", "High", "Critical"]
CATS = ["Documents", "Meetings", "Admin", "Processing", "Other"]

# type spellings:  text | note | richnote | dateonly | datetime | num | bool | user | usermulti
#                  choice:A|B|C | lookup:ListName      extras: default=X  indexed
TASK_COLS = {
    "Candidate": "lookup:Candidates indexed", "CandName": "text",
    "Stage": "lookup:Stages", "StageName": "text", "StageOrder": "num",
    "Phase": f"choice:{'|'.join(PHASES)}",
    "TStatus": "choice:To Do|In Progress|Blocked|Done|Canceled default=To Do",
    "Priority": f"choice:{'|'.join(PRIOS)} default=Medium",
    "Category": f"choice:{'|'.join(CATS)} default=Other",
    "Assignee": "user indexed", "AssigneeRole": f"choice:{'|'.join(ROLES)}",
    "Anchor": f"choice:{'|'.join(ANCHORS)} default=None",
    "OffsetDays": "num", "FixedDate": "dateonly", "DueDate": "dateonly indexed",
    "PendingAnchor": "bool default=0", "IsRequired": "bool default=1",
    "IsPrereq": "bool default=0", "NeedsApproval": "bool default=0",
    "CompletedDate": "dateonly", "CancelReason": "text", "Notes": "note",
    "DueNotified": "dateonly", "UpdatedVia": "text default=App",
}
CHANGELOG_COLS = {
    "Candidate": "lookup:Candidates indexed",
    "EventType": "choice:Stage|CandidateStatus|TaskStatus|TaskAssignee|TaskDue",
    "TaskId": "num", "TaskTitle": "text", "FromValue": "text", "ToValue": "text",
    "ChangedBy": "user", "ChangedDate": "datetime indexed", "Automated": "bool default=0",
}

SCHEMA = {  # creation order matters: lookups reference earlier lists
    "Departments": {"cols": {}},
    "Divisions": {"cols": {"Department": "lookup:Departments"}},
    "FacultyRanks": {"cols": {"RequiresPT": "bool default=0"}},
    "Stages": {"cols": {"OrderIndex": "num", "IsActive": "bool default=1", "Description": "note"}},
    "Templates": {"cols": {
        "CandidateType": f"choice:{'|'.join(CAND_TYPES)}",
        "TStatus": "choice:Draft|Active|Archived default=Draft",
        "Description": "note", "Version": "num"}},
    "TemplateStages": {"titleOptional": True, "cols": {
        "Template": "lookup:Templates", "Stage": "lookup:Stages",
        "OrderIndex": "num", "Phase": f"choice:{'|'.join(PHASES)} default=Pre-Hire",
        "IsActive": "bool default=1"}},
    "TemplateTasks": {"cols": {
        "Description": "note", "Template": "lookup:Templates",
        "TemplateStage": "lookup:TemplateStages",
        "Anchor": f"choice:{'|'.join(ANCHORS)} default=None", "OffsetDays": "num",
        "FixedDate": "dateonly", "AssigneeRole": f"choice:{'|'.join(ROLES)} default=Person",
        "DefaultAssignee": "user", "Priority": f"choice:{'|'.join(PRIOS)} default=Medium",
        "Category": f"choice:{'|'.join(CATS)} default=Other", "OrderIndex": "num",
        "IsRequired": "bool default=1", "IsPrereq": "bool default=0",
        "PrereqCondition": "choice:Always|Requires P&T", "NeedsApproval": "bool default=0"}},
    # Reusable task definitions shared across templates (added 2026-08-31 via
    # gen_tasklibrary.py; template-agnostic, so no Template/TemplateStage/OrderIndex/FixedDate)
    "TaskLibrary": {"cols": {
        "Description": "note",
        "Category": f"choice:{'|'.join(CATS)} default=Other",
        "Anchor": f"choice:{'|'.join(ANCHORS)} default=None", "OffsetDays": "num",
        "AssigneeRole": f"choice:{'|'.join(ROLES)} default=Person",
        "DefaultAssignee": "user", "Priority": f"choice:{'|'.join(PRIOS)} default=Medium",
        "IsRequired": "bool default=1", "IsPrereq": "bool default=0",
        "PrereqCondition": "choice:Always|Requires P&T", "NeedsApproval": "bool default=0",
        "IsActive": "bool default=1"}},
    "Candidates": {"cols": {
        "FirstName": "text", "LastName": "text",
        "Salutation": "choice:Mr.|Ms.|Mrs.|Dr.|Prof.|Mx.|Other",
        "Email": "text", "CandidateType": f"choice:{'|'.join(CAND_TYPES)}",
        "Department": "lookup:Departments", "Division": "lookup:Divisions",
        "FacultyRank": "lookup:FacultyRanks", "Manager": "user", "PrimaryOwner": "user",
        "Watchers": "usermulti",
        "CStatus": "choice:Draft|Active|On Hold|Completed|Canceled|Offer Declined|Archived default=Active",
        "CurrentStage": "lookup:Stages", "LOIDate": "dateonly", "LOOIssued": "dateonly",
        "LOOAccepted": "dateonly", "StartDate": "dateonly", "Template": "lookup:Templates",
        "TemplateApplied": "dateonly", "PrereqsExpanded": "dateonly",
        "Blocked": "bool default=0", "StatusBeforeArchive": "text",
        "StatusChanged": "dateonly", "Notes": "note"}},
    "Tasks": {"cols": TASK_COLS},
    "TasksArchive": {"cols": TASK_COLS},
    "ChangeLog": {"titleOptional": True, "cols": CHANGELOG_COLS},
    "ChangeLogArchive": {"titleOptional": True, "cols": CHANGELOG_COLS},
    "MetricsSnapshots": {"titleOptional": True, "cols": {
        "SnapDate": "dateonly", "ActiveCount": "num", "DueCount": "num",
        "OverdueCount": "num", "CompletionRate": "num"}},
    "Comments": {"titleOptional": True, "cols": {
        "Candidate": "lookup:Candidates indexed", "Task": "lookup:Tasks",
        "Body": "richnote", "Visibility": "choice:Internal|Candidate-Visible default=Internal",
        "NotifyUsers": "usermulti"}},
    "HRNotes": {"titleOptional": True, "cols": {
        "Candidate": "lookup:Candidates", "Body": "richnote"}},
    "CandidatesPrivate": {"titleOptional": True, "cols": {
        "Candidate": "lookup:Candidates", "HomeAddress": "text",
        "PersonalPhone": "text", "CompNotes": "note"}},
    "AppPermissions": {"titleOptional": True, "cols": {
        "AppUser": "user", "Role": "choice:HR|Manager|Viewer default=Viewer",
        "NotifyChannel": "choice:Email|Teams|Email + Teams default=Email",
        "Division": "lookup:Divisions"}},
}
LIBRARIES = ["Onboarding Documents", "Onboarding Documents Restricted"]
LIB_COLS = {"Candidate": "lookup:Candidates"}


def sp_action(uri, method="GET", body=None, headers=None, run_after=None):
    h = {"Accept": "application/json;odata=nometadata"}
    if headers:
        h.update(headers)
    params = {"dataset": SITE, "parameters/method": method, "parameters/uri": uri,
              "parameters/headers": h}
    if body is not None:
        params["parameters/body"] = body
    return {
        "runAfter": run_after or {},
        "type": "OpenApiConnection",
        "inputs": {
            "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                     "connectionName": "shared_sharepointonline", "operationId": "HttpRequest"},
            "parameters": params,
            "authentication": "@parameters('$authentication')"}}


def chain(pairs):
    """pairs: [(name, action)] -> actions dict chained sequentially."""
    out, prev = {}, None
    for name, act in pairs:
        act["runAfter"] = {prev: ["Succeeded"]} if prev else {}
        out[name] = act
        prev = name
    return out


def field_xml(name, spec, guids):
    parts = spec.split()
    kind = parts[0]
    extras = parts[1:]
    attrs = f"Name='{name}' DisplayName='{name}'"
    if "indexed" in extras:
        attrs += " Indexed='TRUE'"
    default = next((e.split("=", 1)[1] for e in extras if e.startswith("default=")), None)
    # rejoin defaults containing spaces (split() broke them)
    if default is not None:
        i = next(i for i, e in enumerate(extras) if e.startswith("default="))
        tail = extras[i + 1:]
        tail = [t for t in tail if t != "indexed"]
        if tail:
            default = default + " " + " ".join(tail)
    inner = ""
    if kind == "text":
        typ = "Text"
    elif kind == "note":
        typ = "Note"
        attrs += " NumLines='6'"
    elif kind == "richnote":
        typ = "Note"
        attrs += " RichText='TRUE' RichTextMode='FullHtml' NumLines='6'"
    elif kind == "dateonly":
        typ = "DateTime"
        attrs += " Format='DateOnly'"
    elif kind == "datetime":
        typ = "DateTime"
        attrs += " Format='DateTime'"
    elif kind == "num":
        typ = "Number"
    elif kind == "bool":
        typ = "Boolean"
    elif kind == "user":
        typ = "User"
        attrs += " UserSelectionMode='PeopleOnly'"
    elif kind == "usermulti":
        typ = "UserMulti"
        attrs += " Mult='TRUE' UserSelectionMode='PeopleOnly'"
    elif kind.startswith("choice:"):
        typ = "Choice"
        choices = kind.split(":", 1)[1].split("|")
        esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        inner += "<CHOICES>" + "".join(f"<CHOICE>{esc(c)}</CHOICE>" for c in choices) + "</CHOICES>"
    elif kind.startswith("lookup:"):
        typ = "Lookup"
        target = kind.split(":", 1)[1]
        attrs += f" List='{{{guids[target]}}}' ShowField='Title'"
    else:
        raise ValueError(f"unknown kind {kind} for {name}")
    if default is not None and typ in ("Boolean", "Choice", "Text"):
        inner += f"<Default>{default}</Default>"
    return f"<Field Type='{typ}' {attrs}>{inner}</Field>"


def load_guids():
    return json.loads(Path("guids.json").read_text())


def cmd_phase1():
    pairs = []
    for lst in SCHEMA:
        body = json.dumps({"__metadata": {"type": "SP.List"}, "BaseTemplate": 100,
                           "Title": lst, "ContentTypesEnabled": False})
        pairs.append((f"Mk_{lst}", sp_action(
            "_api/web/lists", "POST", body,
            {"Content-Type": "application/json;odata=verbose"})))
    for lib in LIBRARIES:
        body = json.dumps({"__metadata": {"type": "SP.List"}, "BaseTemplate": 101,
                           "Title": lib})
        key = lib.replace(" ", "")
        pairs.append((f"Mk_{key}", sp_action(
            "_api/web/lists", "POST", body,
            {"Content-Type": "application/json;odata=verbose"})))
    Path("phase1.json").write_text(json.dumps(chain(pairs), indent=1))
    print(f"phase1.json: {len(pairs)} creates")


def cmd_guids():
    guids = {}
    for f in Path("out-phase1").glob("Mk_*.json"):
        d = json.loads(f.read_text())
        b = d.get("body", d)
        if "Id" in b:
            guids[b["Title"]] = b["Id"]
    Path("guids.json").write_text(json.dumps(guids, indent=1))
    print(json.dumps(guids, indent=1))


def cmd_phase2(chunk_size=48):
    guids = load_guids()
    pairs = []
    for lst, meta in SCHEMA.items():
        gid = guids[lst]
        for col, spec in meta["cols"].items():
            body = json.dumps({"parameters": {
                "SchemaXml": field_xml(col, spec, guids), "Options": 10}})
            pairs.append((f"F_{lst}_{col}", sp_action(
                f"_api/web/lists(guid'{gid}')/fields/createfieldasxml", "POST", body,
                {"Content-Type": "application/json;odata=verbose"})))
        if meta.get("titleOptional"):
            body = json.dumps({"__metadata": {"type": "SP.FieldText"}, "Required": False})
            pairs.append((f"T_{lst}_TitleOpt", sp_action(
                f"_api/web/lists(guid'{gid}')/fields/getbyinternalnameortitle('Title')",
                "POST", body,
                {"Content-Type": "application/json;odata=verbose",
                 "X-HTTP-Method": "MERGE", "IF-MATCH": "*"})))
    for lib in LIBRARIES:
        gid = guids[lib]
        for col, spec in LIB_COLS.items():
            body = json.dumps({"parameters": {
                "SchemaXml": field_xml(col, spec, guids), "Options": 10}})
            key = lib.replace(" ", "")
            pairs.append((f"F_{key}_{col}", sp_action(
                f"_api/web/lists(guid'{gid}')/fields/createfieldasxml", "POST", body,
                {"Content-Type": "application/json;odata=verbose"})))
    chunks = [pairs[i:i + chunk_size] for i in range(0, len(pairs), chunk_size)]
    for i, ch in enumerate(chunks, 1):
        Path(f"phase2-{i}.json").write_text(json.dumps(chain(ch), indent=1))
    print(f"{len(pairs)} field actions across {len(chunks)} files")


def cmd_phase3():
    guids = load_guids()
    pairs = []
    for name, gid in guids.items():
        key = name.replace(" ", "")
        pairs.append((f"V_{key}", sp_action(
            f"_api/web/lists(guid'{gid}')/fields?$select=InternalName,Title,TypeAsString,Required,Indexed&$filter=Hidden eq false")))
    Path("phase3.json").write_text(json.dumps(chain(pairs), indent=1))
    print(f"phase3.json: {len(pairs)} reads")


def cmd_verify():
    guids = load_guids()
    problems = []
    for lst, meta in SCHEMA.items():
        f = Path("out-phase3") / f"V_{lst}.json"
        d = json.loads(f.read_text())
        fields = {x["InternalName"]: x for x in d.get("body", d).get("value", [])}
        for col in meta["cols"]:
            if col not in fields:
                problems.append(f"{lst}: MISSING {col} (have: {sorted(k for k in fields if not k.startswith('_'))})")
        if meta.get("titleOptional") and fields.get("Title", {}).get("Required"):
            problems.append(f"{lst}: Title still required")
    for lib in LIBRARIES:
        f = Path("out-phase3") / f"V_{lib.replace(' ', '')}.json"
        d = json.loads(f.read_text())
        fields = {x["InternalName"] for x in d.get("body", d).get("value", [])}
        for col in LIB_COLS:
            if col not in fields:
                problems.append(f"{lib}: MISSING {col}")
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"VERIFIED: all {sum(len(m['cols']) for m in SCHEMA.values()) + len(LIBRARIES)*len(LIB_COLS)} columns present across {len(guids)} lists/libraries")


if __name__ == "__main__":
    {"phase1": cmd_phase1, "guids": cmd_guids, "phase2": cmd_phase2,
     "phase3": cmd_phase3, "verify": cmd_verify}[sys.argv[1]]()
