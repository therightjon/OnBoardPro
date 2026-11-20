"""Daily check: catch up on anything F3 missed, at the start of F6's weekday run.

F3 reacts to task changes one at a time. A change can still slip past it: more than 100 changes
in one poll, a full waiting queue, or a failed run. The daily check repeats F3's own logic over
recent changes, so nothing it enforces depends on every change being seen:

- per task (changed in the last DAYS days, not last written by a flow: UpdatedVia Flow *and*
  editor FLOW_ACCOUNT): the
  cancel-without-reason revert, the ChangeLog status/assignee/due rows, the CompletedBy fix;
- per Active candidate: stage advancement (one timeline row per stage passed), the Blocked flag,
  and automatic completion.

The actions are cloned from the live F3 definition (provision/flows-f3.json) and renamed, so the
two can't drift apart: change F3, then rerun `apply`. Rows the check writes carry the Title
"Recorded by the daily check". It sends F3's emails (revert, stage, blocked, complete) but not
the assignment email: a late "you've been assigned" would mislead more than help.

  python3 gen_f6_check.py dry      # writes check-dry.json for the utility flow: writes -> Compose
  python3 gen_f6_check.py apply    # patches the live F6 (definition only) and saves flows-f6.json
"""
import copy
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"
G = json.load(open(HERE / "guids.json"))
DAYS = 4                     # Monday's run reaches back past the weekend
MARK = "Recorded by the daily check"
# The account the flows' SharePoint connection writes as. A row it last wrote with UpdatedVia
# Flow/Approval is a flow write; the same marker from anyone else is a person's edit.
FLOW_ACCOUNT = "jsteen@uab.edu"

TASK_ACTIONS = ["Get_Log", "Get_V1", "L_St", "L_As", "L_Du", "Last", "Cur", "If_Guard",
                "If_StDiff", "If_AsDiff", "If_DuDiff", "If_FixCompletedBy"]
CAND_ACTIONS = ["Get_Stages", "Get_Open", "Stage_Cur", "CurOrd", "Req_Cur", "Req_Later", "LaterOrds",
                "TargetOrd", "Stage_New", "If_Advance", "Blk", "If_BlkDiff", "Req_Open", "If_Complete"]
TASK_SELECT = ("Id,Title,CandidateId,CandName,TStatus,IsRequired,CancelReason,DueDate,StageOrder,"
               "UpdatedVia,Modified,AssigneeId,Assignee/Title,Assignee/EMail,EditorId,Editor/Title,"
               "Editor/EMail,CompletedById")
CAND_SELECT = ("Id,Title,CurrentStageId,Blocked,CStatus,TemplateApplied,Manager/EMail,"
               "PrimaryOwner/EMail,Watchers/EMail")


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
                           "https://service.flow.microsoft.com/", "--query", "accessToken", "-o", "tsv"],
                          capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    args = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}"]
    if body is not None:
        args += ["-H", "Content-Type: application/json", "--data", json.dumps(body)]
    return json.loads(subprocess.run(args + [url], capture_output=True, text=True).stdout or "{}")


def all_names(acts):
    for k, v in acts.items():
        yield k
        yield from all_names(v.get("actions", {}))
        yield from all_names(v.get("else", {}).get("actions", {}))


def rename(acts, prefix, extra):
    """Clone actions with every action name prefixed and references rewritten."""
    names = set(all_names(acts))
    s = json.dumps(acts)
    for old, new in extra:                      # source-specific rewrites first
        s = s.replace(old, new)
    s = re.sub(r"(body|outputs|items|actions)\('([A-Za-z0-9_]+)'\)",
               lambda m: f"{m.group(1)}('{prefix}{m.group(2)}')" if m.group(2) in names else m.group(0), s)
    out = json.loads(s)

    def walk(a):
        res = {}
        for k, v in a.items():
            v["runAfter"] = {prefix + r: st for r, st in v.get("runAfter", {}).items()}
            if "actions" in v:
                v["actions"] = walk(v["actions"])
            if "else" in v:
                v["else"]["actions"] = walk(v["else"].get("actions", {}))
            res[prefix + k] = v
        return res
    return walk(out)


def mark(body_expr):
    """Prefix a ChangeLog POST body with the daily-check Title."""
    head = "@concat('{\"CandidateId\":'"
    assert body_expr.startswith(head), body_expr[:60]
    return f"@concat('{{\"Title\":\"{MARK}\",\"CandidateId\":'" + body_expr[len(head):]


def sp_get(uri, run_after):
    return {"runAfter": run_after, "type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                 "connectionName": "shared_sharepointonline", "operationId": "HttpRequest"},
        "parameters": {"dataset": "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding",
                       "parameters/method": "GET", "parameters/uri": uri,
                       "parameters/headers": {"Accept": "application/json;odata=nometadata"}},
        "authentication": "@parameters('$authentication')"}}


def build(f3):
    A = copy.deepcopy(f3["actions"])
    # ---------- per task ----------
    task = {k: A[k] for k in TASK_ACTIONS}
    task["Get_Log"]["runAfter"] = {}
    g = task["If_Guard"]
    g["actions"].pop("Stop")                     # Terminate isn't allowed in a loop; the else branch replaces it
    task["If_AsDiff"]["actions"].pop("If_Notify")   # no late assignment email
    rest = {k: task.pop(k) for k in ("If_StDiff", "If_AsDiff", "If_DuDiff", "If_FixCompletedBy")}
    rest["If_StDiff"]["runAfter"] = {}
    rest["If_FixCompletedBy"]["runAfter"] = {"If_DuDiff": ["Succeeded"]}   # F3 runs it after If_Closed
    g["else"] = {"actions": rest}
    for k in ("If_StDiff", "If_AsDiff", "If_DuDiff"):
        log = next(v for n, v in rest[k]["actions"].items() if n.startswith("Log_"))
        p = log["inputs"]["parameters"]
        p["parameters/body"] = mark(p["parameters/body"]).replace(
            "'\",\"ChangedDate\":\"', utcNow()", "'\",\"ChangedDate\":\"', body('Get_Task')?['Modified']")
        assert "['Modified']" in p["parameters/body"], k
    lr = g["actions"]["Log_Revert"]["inputs"]["parameters"]
    lr["parameters/body"] = mark(lr["parameters/body"])
    task = rename(task, "CT_", [
        ("triggerBody()?['UpdatedVia']", "items('CT_Each')?['UpdatedVia']"),
        ("triggerBody()?['Editor']?['Email']", "items('CT_Each')?['Editor']?['EMail']"),
        ("body('Get_Cand')?['Title']", "items('CT_Each')?['CandName']"),
        ("body('Get_Task')", "items('CT_Each')"),
    ])
    # ---------- per candidate ----------
    cand = {k: copy.deepcopy(A["If_Closed"]["actions"][k]) for k in CAND_ACTIONS}
    cand["Get_Stages"]["runAfter"] = {}
    for st in ("Log_Stage",):
        p = cand["If_Advance"]["actions"]["Each_Pass"]["actions"][st]["inputs"]["parameters"]
        p["parameters/body"] = mark(p["parameters/body"])
    p = cand["If_Complete"]["actions"]["Log_CStatus"]["inputs"]["parameters"]
    p["parameters/body"] = mark(p["parameters/body"])
    cand = rename(cand, "CC_", [
        ("body('Get_Task')?['CandidateId']", "items('CC_Each')?['Id']"),
        ("body('Get_Cand')", "items('CC_Each')"),
    ])
    # ---------- the scope ----------
    since = "@{formatDateTime(addDays(utcNow(), -%d), 'yyyy-MM-ddTHH:mm:ssZ')}" % DAYS
    scope = {
        "CT_Tasks": sp_get(f"_api/web/lists(guid'{G['Tasks']}')/items?$select={TASK_SELECT}"
                           f"&$expand=Assignee,Editor&$filter=Modified ge datetime'{since}'&$top=2000", {}),
        "CT_People": {"runAfter": {"CT_Tasks": ["Succeeded"]}, "type": "Query", "inputs": {
            "from": "@body('CT_Tasks')?['value']",
            "where": ("@not(and(equals(coalesce(item()?['UpdatedVia'], 'App'), 'Flow'), "
                      f"equals(toLower(coalesce(item()?['Editor']?['EMail'], '')), '{FLOW_ACCOUNT}')))")}},
        "CT_Each": {"runAfter": {"CT_People": ["Succeeded"]}, "type": "Foreach",
                    "foreach": "@body('CT_People')",
                    "runtimeConfiguration": {"concurrency": {"repetitions": 1}},
                    "actions": task},
        "CC_Cands": sp_get(f"_api/web/lists(guid'{G['Candidates']}')/items?$select={CAND_SELECT}"
                           "&$expand=Manager,PrimaryOwner,Watchers&$filter=CStatus eq 'Active'&$top=500",
                           {"CT_Each": ["Succeeded", "Failed", "Skipped", "TimedOut"]}),
        "CC_Each": {"runAfter": {"CC_Cands": ["Succeeded"]}, "type": "Foreach",
                    "foreach": "@body('CC_Cands')?['value']",
                    "runtimeConfiguration": {"concurrency": {"repetitions": 1}},
                    "actions": cand},
    }
    return {"Daily_Check": {"runAfter": {}, "type": "Scope", "actions": scope}}


def dry(scope):
    """Same actions, but every write and email becomes a Compose of what it would send."""
    s = copy.deepcopy(scope)

    def walk(acts):
        for k, v in list(acts.items()):
            if v.get("type") == "OpenApiConnection":
                p = v["inputs"]["parameters"]
                if v["inputs"]["host"]["connectionName"] == "shared_office365":
                    acts[k] = {"runAfter": v["runAfter"], "type": "Compose",
                               "inputs": {"to": p.get("emailMessage/To"), "subject": p.get("emailMessage/Subject")}}
                elif p.get("parameters/method") != "GET":
                    acts[k] = {"runAfter": v["runAfter"], "type": "Compose",
                               "inputs": {"uri": p["parameters/uri"], "body": p.get("parameters/body")}}
            walk(v.get("actions", {}))
            walk(v.get("else", {}).get("actions", {}))
    walk(s)
    return s


if __name__ == "__main__":
    cmd = sys.argv[1]
    f3 = json.load(open(HERE / "flows-f3.json"))
    scope = build(f3)
    if cmd == "dry":
        Path(HERE / "check-dry.json").write_text(json.dumps(dry(scope), indent=1))
        print("wrote check-dry.json")
    elif cmd == "apply":
        fid = (HERE / "f6-id.txt").read_text().strip()
        live = req("GET", f"{BASE}/flows/{fid}?{API}")["properties"]
        d = copy.deepcopy(live["definition"])
        d["actions"] = {k: v for k, v in d["actions"].items() if k != "Daily_Check"}
        if list(d["actions"]["Today"]["runAfter"]) == ["Daily_Check"]:   # rerun: detach the old check
            d["actions"]["Today"]["runAfter"] = {}
        d["actions"].update(scope)
        first = [k for k, v in d["actions"].items() if k != "Daily_Check" and not v.get("runAfter")]
        assert first == ["Today"], first
        d["actions"]["Today"]["runAfter"] = {"Daily_Check": ["Succeeded", "Failed", "Skipped", "TimedOut"]}
        refs = live["connectionReferences"]
        assert {"shared_sharepointonline", "shared_office365"} <= set(refs), refs
        r = req("PATCH", f"{BASE}/flows/{fid}?{API}",
                {"properties": {"definition": d, "connectionReferences": refs}})
        if "error" in r:
            sys.exit(json.dumps(r["error"])[:800])
        back = req("GET", f"{BASE}/flows/{fid}?{API}")["properties"]
        assert back["definition"] == d, "live F6 differs from what was sent"
        (HERE / "flows-f6.json").write_text(json.dumps(back["definition"], indent=1))
        print("F6 patched:", back["state"], sorted(back["connectionReferences"]))
    else:
        sys.exit(f"unknown command {cmd}")
