#!/usr/bin/env python3
"""Build, run, validate, and delete a connection-free logic-test flow for F1.

The test embeds the real clinical-template rows and runs the exact Filter/Select
expressions the production F1 will use, across four scenarios:
  S1 full mode, all anchors known, PT rank, prereqs already expanded
  S2 full mode, StartDate missing, no PT rank, prereqs NOT yet expanded
  S3 prereq mode, PT rank            -> only the P&T task
  S4 prereq mode, no PT rank         -> empty set
Outputs are validated against an independent Python reimplementation.
"""
import json
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"


def token():
    return subprocess.run(
        ["az", "account", "get-access-token", "--resource",
         "https://service.flow.microsoft.com/", "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        tmp = Path("/tmp/f1test-body.json")
        tmp.write_text(json.dumps(body))
        cmd += ["--data", f"@{tmp}"]
    raw = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(raw) if raw else {}


def curl(url):
    return subprocess.run(["curl", "-s", url], capture_output=True, text=True,
                          check=True).stdout


# ---- fixtures from the live read-back ----
def body(f):
    d = json.load(open(f))
    return d.get("body", d).get("value", [])

TT = [r for r in body("out-readtpl/R_TT.json") if r.get("TemplateId") == 1]
TS = [r for r in body("out-readtpl/R_TS.json") if r.get("TemplateId") == 1]
ST = body("out-readtpl/R_St.json")

SCEN = {
    "S1": {"mode": "full", "pt": True, "prereqsDone": True, "managerId": 6,
           "anchors": {"LOI": "2026-08-01", "LOO Issued": "2026-09-15",
                       "LOO Accepted": "2026-10-01", "Start": "2027-01-05", "None": ""}},
    "S2": {"mode": "full", "pt": False, "prereqsDone": False, "managerId": 6,
           "anchors": {"LOI": "2026-08-01", "LOO Issued": "2026-09-15",
                       "LOO Accepted": "2026-10-01", "Start": "", "None": ""}},
    "S3": {"mode": "prereq", "pt": True, "prereqsDone": False, "managerId": 6,
           "anchors": {"LOI": "2026-08-01", "LOO Issued": "", "LOO Accepted": "",
                       "Start": "", "None": ""}},
    "S4": {"mode": "prereq", "pt": False, "prereqsDone": False, "managerId": 6,
           "anchors": {"LOI": "2026-08-01", "LOO Issued": "", "LOO Accepted": "",
                       "Start": "", "None": ""}},
}


# ---- the shared expressions (identical strings will go into the real F1) ----
def cond_ok(pt):
    return ("or(empty(item()?['PrereqCondition']), "
            "equals(item()?['PrereqCondition'],'Always'), "
            f"and(equals(item()?['PrereqCondition'],'Requires P&T'), {json.dumps(pt)}))")


def where_expr(mode, pt, prereqs_done):
    if mode == "prereq":
        return f"@and(equals(item()?['IsPrereq'], true), {cond_ok(pt)})"
    if prereqs_done:
        return "@equals(item()?['IsPrereq'], false)"
    return (f"@or(equals(item()?['IsPrereq'], false), "
            f"and(equals(item()?['IsPrereq'], true), {cond_ok(pt)}))")


def select_map(scen_name):
    anchors = f"outputs('Anchors_{scen_name}')"
    anchor_date = (f"if(equals(item()?['Anchor'],'Fixed'), coalesce(item()?['FixedDate'],''), "
                   f"coalesce({anchors}?[coalesce(item()?['Anchor'],'None')],''))")
    return {
        "Title": "@item()?['Title']",
        "StageName": f"@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['name']",
        "StageOrder": f"@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['ord']",
        "Phase": f"@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['ph']",
        "DueDate": (f"@if(or(equals(coalesce(item()?['Anchor'],'None'),'None'), "
                    f"empty({anchor_date})), '', "
                    f"formatDateTime(addDays({anchor_date}, "
                    f"int(coalesce(item()?['OffsetDays'],0))),'yyyy-MM-dd'))"),
        "PendingAnchor": (f"@and(not(equals(coalesce(item()?['Anchor'],'None'),'None')), "
                          f"empty({anchor_date}))"),
        "AssigneeId": (f"@if(equals(item()?['AssigneeRole'],'Manager'), "
                       f"outputs('Cand_{scen_name}')?['managerId'], "
                       f"if(equals(item()?['AssigneeRole'],'Person'), "
                       f"item()?['DefaultAssigneeId'], null))"),
        "AssigneeRole": "@item()?['AssigneeRole']",
        "IsRequired": "@item()?['IsRequired']",
        "IsPrereq": "@item()?['IsPrereq']",
    }


def build_defn():
    st_map = {str(r["Id"]): r["Title"] for r in ST}
    ts_map = {str(r["Id"]): {"sid": r["StageId"], "name": st_map[str(r["StageId"])],
                             "ord": r["OrderIndex"], "ph": r.get("Phase", "")}
              for r in TS}
    actions = {
        "TT": {"runAfter": {}, "type": "Compose", "inputs": TT},
        "TsMap": {"runAfter": {"TT": ["Succeeded"]}, "type": "Compose", "inputs": ts_map},
    }
    prev = "TsMap"
    for name, s in SCEN.items():
        actions[f"Cand_{name}"] = {"runAfter": {prev: ["Succeeded"]}, "type": "Compose",
                                   "inputs": {"managerId": s["managerId"]}}
        actions[f"Anchors_{name}"] = {"runAfter": {f"Cand_{name}": ["Succeeded"]},
                                      "type": "Compose", "inputs": s["anchors"]}
        actions[f"Filter_{name}"] = {
            "runAfter": {f"Anchors_{name}": ["Succeeded"]}, "type": "Query",
            "inputs": {"from": "@outputs('TT')",
                       "where": where_expr(s["mode"], s["pt"], s["prereqsDone"])}}
        actions[f"Out_{name}"] = {
            "runAfter": {f"Filter_{name}": ["Succeeded"]}, "type": "Select",
            "inputs": {"from": f"@body('Filter_{name}')", "select": select_map(name)}}
        prev = f"Out_{name}"
    return {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                       "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
        "triggers": {"Recurrence": {"recurrence": {"frequency": "Month", "interval": 12},
                                    "type": "Recurrence"}},
        "actions": actions,
    }


# ---- independent python reimplementation for validation ----
def expected(scen):
    s = SCEN[scen]
    st_map = {r["Id"]: r["Title"] for r in ST}
    ts_map = {r["Id"]: r for r in TS}
    out = []
    for t in TT:
        prereq = bool(t.get("IsPrereq"))
        cond = t.get("PrereqCondition") or ""
        cond_pass = cond in ("", "Always") or (cond == "Requires P&T" and s["pt"])
        if s["mode"] == "prereq":
            if not (prereq and cond_pass):
                continue
        else:
            if prereq and (s["prereqsDone"] or not cond_pass):
                continue
        anchor = t.get("Anchor") or "None"
        a_date = (t.get("FixedDate") or "") if anchor == "Fixed" else s["anchors"].get(anchor, "")
        if anchor == "None" or not a_date:
            due = ""
        else:
            d = date.fromisoformat(a_date[:10]) + timedelta(days=int(t.get("OffsetDays") or 0))
            due = d.isoformat()
        pending = anchor != "None" and not a_date
        role = t.get("AssigneeRole")
        assignee = s["managerId"] if role == "Manager" else (
            t.get("DefaultAssigneeId") if role == "Person" else None)
        tsr = ts_map[t["TemplateStageId"]]
        out.append({"Title": t["Title"], "StageName": st_map[tsr["StageId"]],
                    "StageOrder": tsr["OrderIndex"], "Phase": tsr.get("Phase", ""),
                    "DueDate": due, "PendingAnchor": pending, "AssigneeId": assignee,
                    "AssigneeRole": role, "IsRequired": t.get("IsRequired"),
                    "IsPrereq": t.get("IsPrereq")})
    return out


def main():
    defn = build_defn()
    flow = req("POST", f"{BASE}/flows?{API}", {"properties": {
        "displayName": "OnBoard - Apply Template (logic test)",
        "state": "Started", "definition": defn, "connectionReferences": {}}})
    fid = flow.get("name")
    if not fid:
        sys.exit(f"create failed: {json.dumps(flow)[:400]}")
    print(f"test flow created: {fid}")
    try:
        time.sleep(3)
        req("POST", f"{BASE}/flows/{fid}/triggers/Recurrence/run?{API}")
        for _ in range(40):
            runs = req("GET", f"{BASE}/flows/{fid}/runs?{API}").get("value", [])
            if runs and runs[0]["properties"]["status"] in ("Succeeded", "Failed"):
                break
            time.sleep(3)
        run = runs[0]
        print(f"run: {run['properties']['status']}")
        acts = req("GET", f"{BASE}/flows/{fid}/runs/{run['name']}/actions?{API}").get("value", [])
        got = {}
        for a in acts:
            if a["name"].startswith("Out_"):
                link = a["properties"].get("outputsLink", {}).get("uri")
                got[a["name"][4:]] = json.loads(curl(link)).get("body", [])
            if a["properties"]["status"] != "Succeeded":
                print(f"  ACTION FAILED {a['name']}: "
                      f"{json.dumps(a['properties'].get('error', {}))[:300]}")
        fails = 0
        for scen in SCEN:
            exp = expected(scen)
            act_rows = got.get(scen, [])
            def norm(rows):
                return sorted(
                    [{k: (v if v is not None else None) for k, v in r.items()} for r in rows],
                    key=lambda r: r["Title"])
            if norm(exp) == norm(act_rows):
                print(f"  {scen}: MATCH ({len(exp)} tasks)")
            else:
                fails += 1
                print(f"  {scen}: MISMATCH — expected {len(exp)}, got {len(act_rows)}")
                e, g = norm(exp), norm(act_rows)
                for i in range(max(len(e), len(g))):
                    ee = e[i] if i < len(e) else None
                    gg = g[i] if i < len(g) else None
                    if ee != gg:
                        print(f"    exp: {json.dumps(ee)[:180]}")
                        print(f"    got: {json.dumps(gg)[:180]}")
                        break
        sys.exit(1 if fails else 0)
    finally:
        req("DELETE", f"{BASE}/flows/{fid}?{API}")
        print("test flow deleted")


if __name__ == "__main__":
    main()
