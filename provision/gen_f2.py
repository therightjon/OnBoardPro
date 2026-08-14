#!/usr/bin/env python3
"""Author + create F2 (OnBoard - Anchor Dates Changed).

SharePoint-triggered on Candidates modified (polling, 1 min). Recomputes DueDate /
PendingAnchor for the candidate's open tasks, writes only rows that changed (stamped
UpdatedVia: Flow), logs each change as a ChangeLog TaskDue row, and auto-completes an
open "Issue Letter of Offer" task once LOOIssued is set. If LOO is accepted but the
template was never applied, a Compose marks it (the app owns calling F1; notification
lands with F6).

  python3 gen_f2.py create | show
"""
import json
import subprocess
import sys
from pathlib import Path

ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"
SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"
G = json.load(open(Path(__file__).parent / "guids.json"))
CONNREFS = {"shared_sharepointonline": {
    "connectionName": "288fd46092664885aa75c25c64f03c89", "source": "Embedded",
    "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"}}


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
                           "https://service.flow.microsoft.com/", "--query", "accessToken",
                           "-o", "tsv"], capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        tmp = Path("/tmp/f2-body.json")
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


CID = "outputs('CandId')"
ANCHOR_DATE = ("if(equals(coalesce(item()?['Anchor'],'None'),'Fixed'), "
               "coalesce(item()?['FixedDate'],''), "
               "coalesce(outputs('Anchors')?[coalesce(item()?['Anchor'],'None')],''))")


def build_defn():
    a = {}
    a["CandId"] = {"runAfter": {}, "type": "Compose",
                   "inputs": "@coalesce(triggerBody()?['ID'], triggerBody()?['Id'])"}
    a["Anchors"] = {"runAfter": {"CandId": ["Succeeded"]}, "type": "Compose", "inputs": {
        "LOI": "@coalesce(triggerBody()?['LOIDate'],'')",
        "LOO Issued": "@coalesce(triggerBody()?['LOOIssued'],'')",
        "LOO Accepted": "@coalesce(triggerBody()?['LOOAccepted'],'')",
        "Start": "@coalesce(triggerBody()?['StartDate'],'')", "None": ""}}
    a["Get_Open"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items?$select=Id,Title,TStatus,Anchor,OffsetDays,FixedDate,DueDate,PendingAnchor&$filter=CandidateId eq @{{{CID}}} and TStatus ne 'Done' and TStatus ne 'Canceled'&$top=300",
        run_after={"Anchors": ["Succeeded"]})
    a["Select_New"] = {"runAfter": {"Get_Open": ["Succeeded"]}, "type": "Select", "inputs": {
        "from": "@body('Get_Open')?['value']", "select": {
            "Id": "@item()?['Id']",
            "Title": "@replace(coalesce(item()?['Title'],''), '\"', '')",
            "TStatus": "@coalesce(item()?['TStatus'],'To Do')",
            "OldDue": ("@if(empty(coalesce(item()?['DueDate'],'')), '', "
                       "substring(item()?['DueDate'],0,10))"),
            "OldPending": "@coalesce(item()?['PendingAnchor'], false)",
            "NewDue": (f"@if(or(equals(coalesce(item()?['Anchor'],'None'),'None'), "
                       f"empty({ANCHOR_DATE})), '', "
                       f"formatDateTime(addDays({ANCHOR_DATE}, "
                       "int(coalesce(item()?['OffsetDays'],0))),'yyyy-MM-dd'))"),
            "NewPending": (f"@and(not(equals(coalesce(item()?['Anchor'],'None'),'None')), "
                           f"empty({ANCHOR_DATE}))")}}}
    a["Filter_Changed"] = {"runAfter": {"Select_New": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Select_New')", "where":
            ("@or(not(equals(item()?['NewDue'], item()?['OldDue'])), "
             "not(equals(item()?['NewPending'], item()?['OldPending'])))")}}
    a["Each_Changed"] = {"runAfter": {"Filter_Changed": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Filter_Changed')",
        "runtimeConfiguration": {"concurrency": {"repetitions": 8}},
        "actions": {
            "Upd_Task": sp(
                f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})", "POST",
                ("@concat('{\"DueDate\":', "
                 "if(equals(item()?['NewDue'],''), 'null', "
                 "concat('\"', item()?['NewDue'], '\"')), "
                 "',\"PendingAnchor\":', if(item()?['NewPending'],'true','false'), "
                 "',\"UpdatedVia\":\"Flow\"}')"), merge=True),
            "Log_Due": sp(
                f"_api/web/lists(guid'{G['ChangeLog']}')/items", "POST",
                ("@concat('{\"CandidateId\":', string(" + CID + "), "
                 "',\"EventType\":\"TaskDue\",\"TaskId\":', string(item()?['Id']), "
                 "',\"TaskTitle\":\"', item()?['Title'], "
                 "'\",\"FromValue\":\"', if(item()?['OldPending'],'pending',item()?['OldDue']), "
                 "'\",\"ToValue\":\"', if(item()?['NewPending'],'pending',item()?['NewDue']), "
                 "'\",\"ChangedDate\":\"', utcNow(), "
                 "'\",\"Automated\":true}')"),
                run_after={"Upd_Task": ["Succeeded"]})}}
    a["Filter_LOO"] = {"runAfter": {"Each_Changed": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Select_New')", "where":
            "@equals(toLower(item()?['Title']), 'issue letter of offer')"}}
    a["If_LOO_Issued"] = {"runAfter": {"Filter_LOO": ["Succeeded"]}, "type": "If",
        "expression": {"and": [
            {"greater": ["@length(body('Filter_LOO'))", 0]},
            {"not": {"equals": ["@outputs('Anchors')?['LOO Issued']", ""]}}]},
        "actions": {"Each_LOO": {"runAfter": {}, "type": "Foreach",
            "foreach": "@body('Filter_LOO')",
            "actions": {
                "Complete_LOO": sp(
                    f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})", "POST",
                    ("@concat('{\"TStatus\":\"Done\",\"CompletedDate\":\"', "
                     "utcNow('yyyy-MM-dd'), '\",\"UpdatedVia\":\"Flow\"}')"), merge=True),
                "Log_LOO": sp(
                    f"_api/web/lists(guid'{G['ChangeLog']}')/items", "POST",
                    ("@concat('{\"CandidateId\":', string(" + CID + "), "
                     "',\"EventType\":\"TaskStatus\",\"TaskId\":', string(item()?['Id']), "
                     "',\"TaskTitle\":\"', item()?['Title'], "
                     "'\",\"FromValue\":\"', item()?['TStatus'], "
                     "'\",\"ToValue\":\"Done\",\"ChangedDate\":\"', utcNow(), "
                     "'\",\"Automated\":true}')"),
                    run_after={"Complete_LOO": ["Succeeded"]})}}},
        "else": {"actions": {}}}
    a["Fallback_Check"] = {"runAfter": {"If_LOO_Issued": ["Succeeded"]}, "type": "Compose",
        "inputs": ("@if(and(not(empty(coalesce(triggerBody()?['LOOAccepted'],''))), "
                   "empty(coalesce(triggerBody()?['TemplateApplied'],''))), "
                   "'ATTENTION: LOO accepted but template not applied - apply from the app', "
                   "'ok')")}
    a["Result"] = {"runAfter": {"Fallback_Check": ["Succeeded"]}, "type": "Compose",
                   "inputs": {"candidateId": f"@{CID}",
                              "recomputed": "@length(body('Filter_Changed'))",
                              "fallback": "@outputs('Fallback_Check')"}}
    return {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": {"When_Candidate_Changes": {
                "type": "OpenApiConnection",
                "recurrence": {"frequency": "Minute", "interval": 1},
                "splitOn": "@triggerOutputs()?['body/value']",
                "inputs": {
                    "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                             "connectionName": "shared_sharepointonline",
                             "operationId": "GetOnUpdatedItems"},
                    "parameters": {"dataset": SITE, "table": G["Candidates"]},
                    "authentication": "@parameters('$authentication')"}}},
            "actions": build_actions_placeholder(a)}


def build_actions_placeholder(a):
    return a


if __name__ == "__main__":
    cmd = sys.argv[1]
    defn = build_defn()
    Path("flows-f2.json").write_text(json.dumps(defn, indent=1))
    if cmd == "show":
        print("written flows-f2.json")
        sys.exit(0)
    r = req("POST", f"{BASE}/flows?{API}", {"properties": {
        "displayName": "OnBoard - Anchor Dates Changed",
        "state": "Started", "definition": defn, "connectionReferences": CONNREFS}})
    if "name" not in r:
        sys.exit(f"create failed: {json.dumps(r)[:600]}")
    print(f"created F2: {r['name']} state={r['properties'].get('state')}")
    Path("f2-id.txt").write_text(r["name"])
