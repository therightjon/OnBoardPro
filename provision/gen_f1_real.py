#!/usr/bin/env python3
"""Author + drive the production F1 (OnBoard - Apply Template).

  python3 gen_f1_real.py patch test prereq|full   # Recurrence trigger, baked test inputs
  python3 gen_f1_real.py patch final              # PowerAppV2 trigger + Response
  python3 gen_f1_real.py start | run | result
"""
import json
import subprocess
import sys
import time
from pathlib import Path

ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
FID = "37c175f5-b395-f111-8076-3833c5eece6e"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"
SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"
G = json.load(open(Path(__file__).parent / "guids.json"))
TEST_CAND = int(__import__("os").environ.get("F1_TEST_CAND", "1"))

CONNREFS = {"shared_sharepointonline": {
    "connectionName": "288fd46092664885aa75c25c64f03c89",
    "source": "Embedded",
    "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"}}


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
                           "https://service.flow.microsoft.com/", "--query", "accessToken",
                           "-o", "tsv"], capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        tmp = Path("/tmp/f1-body.json")
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


CAND = "body('Get_Candidate')"
COND_OK = ("or(empty(item()?['PrereqCondition']), "
           "equals(item()?['PrereqCondition'],'Always'), "
           "and(equals(item()?['PrereqCondition'],'Requires P&T'), "
           "equals(outputs('PT'), true)))")
ANCHOR_DATE = ("if(equals(coalesce(item()?['Anchor'],'None'),'Fixed'), "
               "coalesce(item()?['FixedDate'],''), "
               "coalesce(outputs('Anchors')?[coalesce(item()?['Anchor'],'None')],''))")
FIRST_STAGE = "first(sort(body('Get_TS')?['value'],'OrderIndex'))"


def build_actions(variant, mode=None):
    a = {}
    if variant == "test":
        a["Inputs"] = {"runAfter": {}, "type": "Compose",
                       "inputs": {"candidateId": TEST_CAND, "mode": mode}}
    else:
        a["Respond_Started"] = {"runAfter": {}, "type": "Response", "kind": "PowerApp",
                                "inputs": {"statusCode": 200,
                                           "body": {"started": True},
                                           "schema": {"type": "object", "properties": {
                                               "started": {"type": "boolean"}}}}}
        a["Inputs"] = {"runAfter": {"Respond_Started": ["Succeeded", "Failed", "Skipped"]},
                       "type": "Compose",
                       "inputs": {"candidateId": "@int(triggerBody()?['number'])",
                                  "mode": "@coalesce(triggerBody()?['text'],'full')"}}
    a["Get_Candidate"] = sp(
        f"_api/web/lists(guid'{G['Candidates']}')/items(@{{outputs('Inputs')?['candidateId']}})",
        run_after={"Inputs": ["Succeeded"]})
    a["PreDone"] = {"runAfter": {"Get_Candidate": ["Succeeded"]}, "type": "Compose",
                    "inputs": f"@not(empty(coalesce({CAND}?['PrereqsExpanded'],'')))"}
    a["Already"] = {"runAfter": {"PreDone": ["Succeeded"]}, "type": "Compose", "inputs":
                    ("@or(and(equals(outputs('Inputs')?['mode'],'full'), "
                     f"not(empty(coalesce({CAND}?['TemplateApplied'],'')))), "
                     "and(equals(outputs('Inputs')?['mode'],'prereq'), "
                     "equals(outputs('PreDone'), true)))")}

    work = {}
    work["Claim"] = {"runAfter": {}, "type": "If",
        "expression": {"and": [{"equals": ["@outputs('Inputs')?['mode']", "full"]}]},
        "actions": {"Claim_Full": sp(
            f"_api/web/lists(guid'{G['Candidates']}')/items(@{{outputs('Inputs')?['candidateId']}})",
            "POST", "@string(json(concat('{\"TemplateApplied\":\"', utcNow('yyyy-MM-dd'), '\"}')))",
            merge=True)},
        "else": {"actions": {"Claim_Prereq": sp(
            f"_api/web/lists(guid'{G['Candidates']}')/items(@{{outputs('Inputs')?['candidateId']}})",
            "POST", "@string(json(concat('{\"PrereqsExpanded\":\"', utcNow('yyyy-MM-dd'), '\"}')))",
            merge=True)}}}
    work["Get_TS"] = sp(
        f"_api/web/lists(guid'{G['TemplateStages']}')/items?$select=Id,StageId,OrderIndex,Phase&$filter=TemplateId eq @{{{CAND}?['TemplateId']}}&$top=50",
        run_after={"Claim": ["Succeeded"]})
    work["Get_Stages"] = sp(
        f"_api/web/lists(guid'{G['Stages']}')/items?$select=Id,Title&$top=50",
        run_after={"Get_TS": ["Succeeded"]})
    work["Get_TT"] = sp(
        f"_api/web/lists(guid'{G['TemplateTasks']}')/items?$select=Id,Title,TemplateStageId,Anchor,OffsetDays,FixedDate,AssigneeRole,DefaultAssigneeId,Priority,Category,OrderIndex,IsRequired,IsPrereq,PrereqCondition,NeedsApproval&$filter=TemplateId eq @{{{CAND}?['TemplateId']}}&$top=200",
        run_after={"Get_Stages": ["Succeeded"]})
    work["Get_Ranks"] = sp(
        f"_api/web/lists(guid'{G['FacultyRanks']}')/items?$select=Id,RequiresPT&$top=50",
        run_after={"Get_TT": ["Succeeded"]})
    work["Rank_Match"] = {"runAfter": {"Get_Ranks": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Ranks')?['value']",
                   "where": f"@equals(item()?['Id'], coalesce({CAND}?['FacultyRankId'], -1))"}}
    work["PT"] = {"runAfter": {"Rank_Match": ["Succeeded"]}, "type": "Compose",
                  "inputs": "@coalesce(first(body('Rank_Match'))?['RequiresPT'], false)"}
    work["Select_St"] = {"runAfter": {"PT": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Get_Stages')?['value']",
                   "select": "@concat('\"', string(item()?['Id']), '\":\"', item()?['Title'], '\"')"}}
    work["StMap"] = {"runAfter": {"Select_St": ["Succeeded"]}, "type": "Compose",
                     "inputs": "@json(concat('{', join(body('Select_St'), ','), '}'))"}
    work["Select_Ts"] = {"runAfter": {"StMap": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Get_TS')?['value']",
                   "select": ("@concat('\"', string(item()?['Id']), '\":{\"sid\":', "
                              "string(item()?['StageId']), ',\"name\":\"', "
                              "outputs('StMap')?[string(item()?['StageId'])], "
                              "'\",\"ord\":', string(item()?['OrderIndex']), "
                              "',\"ph\":\"', coalesce(item()?['Phase'],''), '\"}')")}}
    work["TsMap"] = {"runAfter": {"Select_Ts": ["Succeeded"]}, "type": "Compose",
                     "inputs": "@json(concat('{', join(body('Select_Ts'), ','), '}'))"}
    work["Anchors"] = {"runAfter": {"TsMap": ["Succeeded"]}, "type": "Compose", "inputs": {
        "LOI": f"@coalesce({CAND}?['LOIDate'],'')",
        "LOO Issued": f"@coalesce({CAND}?['LOOIssued'],'')",
        "LOO Accepted": f"@coalesce({CAND}?['LOOAccepted'],'')",
        "Start": f"@coalesce({CAND}?['StartDate'],'')", "None": ""}}
    work["Filter_Applicable"] = {"runAfter": {"Anchors": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_TT')?['value']", "where":
            ("@or(and(equals(outputs('Inputs')?['mode'],'prereq'), "
             f"equals(item()?['IsPrereq'], true), {COND_OK}), "
             "and(equals(outputs('Inputs')?['mode'],'full'), "
             "or(equals(item()?['IsPrereq'], false), "
             "and(equals(item()?['IsPrereq'], true), "
             f"equals(outputs('PreDone'), false), {COND_OK}))))")}}
    work["Select_Payloads"] = {"runAfter": {"Filter_Applicable": ["Succeeded"]},
        "type": "Select", "inputs": {"from": "@body('Filter_Applicable')", "select": {
            "Title": "@item()?['Title']",
            "TStatus": "To Do",
            "CandidateId": "@outputs('Inputs')?['candidateId']",
            "CandName": f"@{CAND}?['Title']",
            "StageId": "@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['sid']",
            "StageName": "@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['name']",
            "StageOrder": "@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['ord']",
            "Phase": "@outputs('TsMap')?[string(item()?['TemplateStageId'])]?['ph']",
            "Priority": "@item()?['Priority']", "Category": "@item()?['Category']",
            "AssigneeId": (f"@if(equals(item()?['AssigneeRole'],'Manager'), {CAND}?['ManagerId'], "
                           "if(equals(item()?['AssigneeRole'],'Person'), "
                           "item()?['DefaultAssigneeId'], null))"),
            "AssigneeRole": "@item()?['AssigneeRole']",
            "Anchor": "@coalesce(item()?['Anchor'],'None')",
            "OffsetDays": "@int(coalesce(item()?['OffsetDays'],0))",
            "FixedDate": "@if(empty(coalesce(item()?['FixedDate'],'')), null, item()?['FixedDate'])",
            "DueDate": (f"@if(or(equals(coalesce(item()?['Anchor'],'None'),'None'), "
                        f"empty({ANCHOR_DATE})), null, "
                        f"formatDateTime(addDays({ANCHOR_DATE}, "
                        "int(coalesce(item()?['OffsetDays'],0))),'yyyy-MM-dd'))"),
            "PendingAnchor": (f"@and(not(equals(coalesce(item()?['Anchor'],'None'),'None')), "
                              f"empty({ANCHOR_DATE}))"),
            "IsRequired": "@item()?['IsRequired']", "IsPrereq": "@item()?['IsPrereq']",
            "NeedsApproval": "@item()?['NeedsApproval']", "UpdatedVia": "Flow"}}}
    work["Each_Create"] = {"runAfter": {"Select_Payloads": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Select_Payloads')",
        "runtimeConfiguration": {"concurrency": {"repetitions": 8}},
        "actions": {"Create_Task": sp(
            f"_api/web/lists(guid'{G['Tasks']}')/items", "POST", "@string(item())")}}
    finish = {}
    finish["Upd_Stage"] = sp(
        f"_api/web/lists(guid'{G['Candidates']}')/items(@{{outputs('Inputs')?['candidateId']}})",
        "POST",
        f"@string(json(concat('{{\"CurrentStageId\":', string({FIRST_STAGE}?['StageId']), '}}')))",
        merge=True)
    finish["Add_ChangeLog"] = sp(
        f"_api/web/lists(guid'{G['ChangeLog']}')/items", "POST",
        ("@string(json(concat('{\"CandidateId\":', string(outputs('Inputs')?['candidateId']), "
         "',\"EventType\":\"Stage\",\"FromValue\":\"\",\"ToValue\":\"', "
         f"outputs('StMap')?[string({FIRST_STAGE}?['StageId'])], "
         f"'\",\"ChangedDate\":\"', substring(coalesce({CAND}?['LOIDate'],utcNow()),0,10), "
         "'T12:00:00Z\",\"Automated\":true}')))"),
        run_after={"Upd_Stage": ["Succeeded"]})
    finish["Mk_Folder_Gen"] = sp(
        "_api/web/folders", "POST",
        ("@string(json(concat('{\"ServerRelativeUrl\":\"/sites/obgyn/OBGYN-Onboarding/Onboarding Documents/', "
         f"replace({CAND}?['Title'],'/','-'), '\"}}')))"),
        run_after={"Add_ChangeLog": ["Succeeded"]})
    finish["Mk_Folder_Restricted"] = sp(
        "_api/web/folders", "POST",
        ("@string(json(concat('{\"ServerRelativeUrl\":\"/sites/obgyn/OBGYN-Onboarding/Onboarding Documents Restricted/', "
         f"replace({CAND}?['Title'],'/','-'), '\"}}')))"),
        run_after={"Mk_Folder_Gen": ["Succeeded"]})
    work["If_Full_Finish"] = {"runAfter": {"Each_Create": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"equals": ["@outputs('Inputs')?['mode']", "full"]}]},
        "actions": finish, "else": {"actions": {"Prereq_Done": {
            "runAfter": {}, "type": "Compose", "inputs": "prereq expansion complete"}}}}

    a["If_NotAlready"] = {"runAfter": {"Already": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"equals": ["@outputs('Already')", False]}]},
        "actions": work,
        "else": {"actions": {"Skipped": {"runAfter": {}, "type": "Compose",
                                         "inputs": "already applied - no action"}}}}
    a["Result"] = {"runAfter": {"If_NotAlready": ["Succeeded"]}, "type": "Compose",
                   "inputs": {"candidateId": "@outputs('Inputs')?['candidateId']",
                              "mode": "@outputs('Inputs')?['mode']",
                              "already": "@outputs('Already')"}}
    return a


def build_defn(variant, mode=None):
    if variant == "test":
        trig = {"Recurrence": {"recurrence": {"frequency": "Month", "interval": 12},
                               "type": "Recurrence"}}
    else:
        trig = {"manual": {"type": "Request", "kind": "PowerAppV2", "inputs": {"schema": {
            "type": "object", "properties": {
                "number": {"title": "candidateId", "type": "number",
                           "x-ms-dynamically-added": True},
                "text": {"title": "mode", "type": "string",
                         "x-ms-dynamically-added": True}},
            "required": ["number", "text"]}}}}
    return {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": trig, "actions": build_actions(variant, mode)}


def patch(variant, mode=None):
    flow = req("GET", f"{BASE}/flows/{FID}?{API}")  # fresh fetch before patch
    props = {"definition": build_defn(variant, mode), "connectionReferences": CONNREFS}
    r = req("PATCH", f"{BASE}/flows/{FID}?{API}", {"properties": props})
    if "error" in r:
        sys.exit(f"PATCH failed: {json.dumps(r)[:500]}")
    print(f"patched {variant}" + (f" mode={mode}" if mode else ""))
    Path(f"flows-f1-{variant}{'-' + mode if mode else ''}.json").write_text(
        json.dumps(props["definition"], indent=1))


def run_and_report():
    trigger = "Recurrence"
    req("POST", f"{BASE}/flows/{FID}/triggers/{trigger}/run?{API}")
    print("fired")
    for _ in range(50):
        runs = req("GET", f"{BASE}/flows/{FID}/runs?{API}").get("value", [])
        if runs and runs[0]["properties"]["status"] in ("Succeeded", "Failed"):
            break
        time.sleep(4)
    run = runs[0]
    print(f"run: {run['properties']['status']}")
    acts = req("GET", f"{BASE}/flows/{FID}/runs/{run['name']}/actions?{API}").get("value", [])
    for act_ in sorted(acts, key=lambda x: x["properties"].get("startTime", "")):
        st = act_["properties"]["status"]
        if st not in ("Succeeded", "Skipped"):
            print(f"  {act_['name']}: {st} "
                  f"{json.dumps(act_['properties'].get('error', {}))[:300]}")
    return run["properties"]["status"] == "Succeeded"


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "patch":
        patch(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == "start":
        req("POST", f"{BASE}/flows/{FID}/start?{API}")
        print("started")
    elif cmd == "run":
        sys.exit(0 if run_and_report() else 1)
