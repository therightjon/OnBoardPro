#!/usr/bin/env python3
"""Author + create F6 (Daily Deadline Scan) and F7 (Archive Sweep). python3 gen_f6_f7.py create"""
import json
import subprocess
import sys
from pathlib import Path

ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"
SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"
G = json.load(open(Path(__file__).parent / "guids.json"))
O365 = open(Path(__file__).parent / "o365-conn.txt").read().strip()
CONNREFS = {
    "shared_sharepointonline": {"connectionName": "288fd46092664885aa75c25c64f03c89",
        "source": "Embedded", "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"},
    "shared_office365": {"connectionName": O365, "source": "Embedded",
        "id": "/providers/Microsoft.PowerApps/apis/shared_office365"}}


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
        "https://service.flow.microsoft.com/", "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        Path("/tmp/f67-body.json").write_text(json.dumps(body))
        cmd += ["--data", "@/tmp/f67-body.json"]
    raw = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(raw) if raw else {}


def sp(uri, method="GET", body_expr=None, run_after=None, merge=False, delete=False):
    h = {"Accept": "application/json;odata=nometadata",
         "Content-Type": "application/json;odata=nometadata"}
    if merge:
        h.update({"X-HTTP-Method": "MERGE", "IF-MATCH": "*"})
    if delete:
        h.update({"IF-MATCH": "*"})
    p = {"dataset": SITE, "parameters/method": method, "parameters/uri": uri,
         "parameters/headers": h}
    if body_expr is not None:
        p["parameters/body"] = body_expr
    return {"runAfter": run_after or {}, "type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                 "connectionName": "shared_sharepointonline", "operationId": "HttpRequest"},
        "parameters": p, "authentication": "@parameters('$authentication')"}}


def mail(to_expr, subj_expr, body_expr, run_after=None):
    return {"runAfter": run_after or {}, "type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                 "connectionName": "shared_office365", "operationId": "SendEmailV2"},
        "parameters": {"emailMessage/To": to_expr, "emailMessage/Subject": subj_expr,
                       "emailMessage/Body": body_expr, "emailMessage/Importance": "Normal"},
        "authentication": "@parameters('$authentication')"}}


def wrap(trig, actions):
    return {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": {"Recurrence": trig}, "actions": actions}


DUE10 = "substring(coalesce(item()?['DueDate'],''),0,10)"
ROW = ("@concat('<tr><td>', item()?['Title'], '</td><td>', "
       "coalesce(item()?['CandName'],''), '</td><td>', " + DUE10 + ", '</td></tr>')")
TBL = "<table border=1 cellpadding=4 cellspacing=0><tr><th>Task</th><th>Candidate</th><th>Due</th></tr>"


def f6_defn():
    a = {}
    a["Today"] = {"runAfter": {}, "type": "Compose", "inputs": "@utcNow('yyyy-MM-dd')"}
    a["Cutoff"] = {"runAfter": {"Today": ["Succeeded"]}, "type": "Compose",
                   "inputs": "@formatDateTime(addDays(utcNow(),7),'yyyy-MM-dd')"}
    a["Get_Open"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items?"
        "$select=Id,Title,CandidateId,CandName,DueDate,DueNotified,AssigneeRole,"
        "Assignee/EMail&$expand=Assignee&"
        "$filter=TStatus ne 'Done' and TStatus ne 'Canceled'&$top=500",
        run_after={"Cutoff": ["Succeeded"]})
    a["Get_Cands"] = sp(
        f"_api/web/lists(guid'{G['Candidates']}')/items?"
        "$select=Id,Title,Email,CStatus&$top=200", run_after={"Get_Open": ["Succeeded"]})
    a["Win"] = {"runAfter": {"Get_Cands": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Open')?['value']", "where":
            ("@and(not(empty(coalesce(item()?['DueDate'],''))), "
             f"lessOrEquals({DUE10}, outputs('Cutoff')))")}}
    a["A_Mails"] = {"runAfter": {"Win": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Win')",
                   "select": "@coalesce(item()?['Assignee']?['EMail'],'')"}}
    a["People"] = {"runAfter": {"A_Mails": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@union(body('A_Mails'), body('A_Mails'))",
                   "where": "@not(equals(item(),''))"}}
    person = {}
    person["Mine"] = {"runAfter": {}, "type": "Query",
        "inputs": {"from": "@body('Win')", "where":
            "@equals(coalesce(item()?['Assignee']?['EMail'],''), items('Each_Person'))"}}
    person["Late"] = {"runAfter": {"Mine": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Mine')",
                   "where": f"@less({DUE10}, outputs('Today'))"}}
    person["Soon"] = {"runAfter": {"Late": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Mine')",
                   "where": f"@greaterOrEquals({DUE10}, outputs('Today'))"}}
    person["LateRows"] = {"runAfter": {"Soon": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Late')", "select": ROW}}
    person["SoonRows"] = {"runAfter": {"LateRows": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Soon')", "select": ROW}}
    person["Mail_Digest"] = mail(
        "@items('Each_Person')",
        ("@concat('[OnBoardPro] Your onboarding tasks: ', "
         "string(length(body('Late'))), ' overdue, ', "
         "string(length(body('Soon'))), ' due this week')"),
        ("@concat("
         "if(greater(length(body('Late')),0), "
         f"concat('<p><b>Overdue</b></p>{TBL}', join(body('LateRows'),''), '</table>'), ''), "
         "if(greater(length(body('Soon')),0), "
         f"concat('<p><b>Due in the next 7 days</b></p>{TBL}', join(body('SoonRows'),''), '</table>'), ''), "
         "'<p>This is your daily agenda; items repeat until resolved.</p>')"),
        {"SoonRows": ["Succeeded"]})
    a["Each_Person"] = {"runAfter": {"People": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('People')",
        "runtimeConfiguration": {"concurrency": {"repetitions": 4}}, "actions": person}
    # candidate touchpoints: candidate-role tasks in window, not yet notified for this due date
    a["Touch"] = {"runAfter": {"Each_Person": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Win')", "where":
            ("@and(equals(coalesce(item()?['AssigneeRole'],''),'Candidate'), "
             f"not(equals({DUE10}, substring(coalesce(item()?['DueNotified'],'0000-00-00T00'),0,10))))")}}
    tp = {}
    tp["CandRow"] = {"runAfter": {}, "type": "Query",
        "inputs": {"from": "@body('Get_Cands')?['value']",
                   "where": "@equals(item()?['Id'], items('Each_Touch')?['CandidateId'])"}}
    tp["If_Mail"] = {"runAfter": {"CandRow": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"not": {"equals": [
            "@coalesce(first(body('CandRow'))?['Email'],'')", ""]}}]},
        "actions": {
            "Mail_Touch": mail(
                "@first(body('CandRow'))?['Email']",
                "@concat('A reminder from UAB OBGYN onboarding: ', items('Each_Touch')?['Title'])",
                ("@concat('<p>Hello ', first(body('CandRow'))?['Title'], ',</p>"
                 "<p>A quick reminder about: <b>', items('Each_Touch')?['Title'], "
                 "'</b> (due ', substring(coalesce(items('Each_Touch')?['DueDate'],''),0,10), "
                 "').</p><p>— UAB Department of Obstetrics and Gynecology</p>')")),
            "Stamp_Touch": sp(
                f"_api/web/lists(guid'{G['Tasks']}')/items(@{{items('Each_Touch')?['Id']}})",
                "POST",
                ("@concat('{\"DueNotified\":\"', "
                 "substring(coalesce(items('Each_Touch')?['DueDate'],''),0,10), "
                 "'\",\"UpdatedVia\":\"Flow\"}')"),
                run_after={"Mail_Touch": ["Succeeded"]}, merge=True)},
        "else": {"actions": {}}}
    a["Each_Touch"] = {"runAfter": {"Touch": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Touch')",
        "runtimeConfiguration": {"concurrency": {"repetitions": 1}}, "actions": tp}
    # nightly metrics snapshot
    a["ActiveC"] = {"runAfter": {"Each_Touch": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Cands')?['value']",
                   "where": "@equals(coalesce(item()?['CStatus'],''),'Active')"}}
    a["DoneC"] = {"runAfter": {"ActiveC": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Cands')?['value']",
                   "where": "@equals(coalesce(item()?['CStatus'],''),'Completed')"}}
    a["LateAll"] = {"runAfter": {"DoneC": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Win')", "where": f"@less({DUE10}, outputs('Today'))"}}
    a["Snap"] = sp(f"_api/web/lists(guid'{G['MetricsSnapshots']}')/items", "POST",
        ("@concat('{\"SnapDate\":\"', outputs('Today'), "
         "'\",\"ActiveCount\":', string(length(body('ActiveC'))), "
         "',\"DueCount\":', string(sub(length(body('Win')), length(body('LateAll')))), "
         "',\"OverdueCount\":', string(length(body('LateAll'))), "
         "',\"CompletionRate\":', string(if(equals(length(body('Get_Cands')?['value']),0), 0, "
         "div(mul(100, length(body('DoneC'))), length(body('Get_Cands')?['value'])))), '}')"),
        run_after={"LateAll": ["Succeeded"]})
    trig = {"type": "Recurrence", "recurrence": {
        "frequency": "Week", "interval": 1, "timeZone": "Central Standard Time",
        "schedule": {"weekDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                     "hours": [7], "minutes": [0]}}}
    return wrap(trig, a)


TASK_FIELDS = ["Title", "CandidateId", "CandName", "StageId", "StageName", "StageOrder",
               "Phase", "TStatus", "Priority", "Category", "AssigneeId", "AssigneeRole",
               "Anchor", "OffsetDays", "FixedDate", "DueDate", "PendingAnchor", "IsRequired",
               "IsPrereq", "NeedsApproval", "CompletedDate", "CancelReason", "Notes",
               "DueNotified", "ApprovalStarted", "UpdatedVia"]
CL_FIELDS = ["CandidateId", "EventType", "TaskId", "TaskTitle", "FromValue", "ToValue",
             "ChangedById", "ChangedDate", "Automated"]


def f7_defn():
    a = {}
    a["Cut30"] = {"runAfter": {}, "type": "Compose",
                  "inputs": "@formatDateTime(addDays(utcNow(),-30),'yyyy-MM-dd')"}
    a["Get_Term"] = sp(
        f"_api/web/lists(guid'{G['Candidates']}')/items?"
        "$select=Id,Title,CStatus,StatusChanged&"
        "$filter=(CStatus eq 'Completed' or CStatus eq 'Canceled' or CStatus eq 'Archived') "
        "and StatusChanged le '@{outputs('Cut30')}'&$top=50",
        run_after={"Cut30": ["Succeeded"]})
    per = {}
    per["Get_T"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items?"
        f"$select=Id,{','.join(TASK_FIELDS)}&"
        "$filter=CandidateId eq @{items('Each_Cand')?['Id']}&$top=500")
    per["Each_T"] = {"runAfter": {"Get_T": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Get_T')?['value']",
        "runtimeConfiguration": {"concurrency": {"repetitions": 4}},
        "actions": {
            "Cp_T": sp(f"_api/web/lists(guid'{G['TasksArchive']}')/items", "POST",
                "@string(removeProperty(removeProperty(item(),'Id'),'ID'))"),
            "Del_T": sp(f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})",
                "DELETE", run_after={"Cp_T": ["Succeeded"]}, delete=True)}}
    per["Get_L"] = sp(
        f"_api/web/lists(guid'{G['ChangeLog']}')/items?"
        f"$select=Id,{','.join(CL_FIELDS)}&"
        "$filter=CandidateId eq @{items('Each_Cand')?['Id']}&$top=500",
        run_after={"Each_T": ["Succeeded"]})
    per["Each_L"] = {"runAfter": {"Get_L": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Get_L')?['value']",
        "runtimeConfiguration": {"concurrency": {"repetitions": 4}},
        "actions": {
            "Cp_L": sp(f"_api/web/lists(guid'{G['ChangeLogArchive']}')/items", "POST",
                "@string(removeProperty(removeProperty(item(),'Id'),'ID'))"),
            "Del_L": sp(f"_api/web/lists(guid'{G['ChangeLog']}')/items(@{{item()?['Id']}})",
                "DELETE", run_after={"Cp_L": ["Succeeded"]}, delete=True)}}
    per["Verify"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items?$select=Id&"
        "$filter=CandidateId eq @{items('Each_Cand')?['Id']}&$top=5",
        run_after={"Each_L": ["Succeeded"]})
    per["If_Left"] = {"runAfter": {"Verify": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"greater": ["@length(body('Verify')?['value'])", 0]}]},
        "actions": {"Mail_Warn": mail(
            "jsteen@uab.edu",
            "@concat('[OnBoardPro] Archive sweep left rows behind: ', items('Each_Cand')?['Title'])",
            "@concat('<p>Verify pass found remaining Tasks rows for candidate ', items('Each_Cand')?['Title'], '. Re-run or inspect.</p>')")},
        "else": {"actions": {}}}
    a["Each_Cand"] = {"runAfter": {"Get_Term": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Get_Term')?['value']",
        "runtimeConfiguration": {"concurrency": {"repetitions": 1}}, "actions": per}
    trig = {"type": "Recurrence", "recurrence": {
        "frequency": "Week", "interval": 1, "timeZone": "Central Standard Time",
        "schedule": {"weekDays": ["Sunday"], "hours": [22], "minutes": [0]}}}
    return wrap(trig, a)


if __name__ == "__main__":
    for name, defn, idfile in [("OnBoard - Daily Deadline Scan", f6_defn(), "f6-id.txt"),
                               ("OnBoard - Archive Sweep", f7_defn(), "f7-id.txt")]:
        Path(f"flows-{idfile.replace('-id.txt','')}.json").write_text(json.dumps(defn, indent=1))
        if sys.argv[1] == "show":
            continue
        r = req("POST", f"{BASE}/flows?{API}", {"properties": {
            "displayName": name, "state": "Started",
            "definition": defn, "connectionReferences": CONNREFS}})
        if "name" not in r:
            sys.exit(f"create failed for {name}: {json.dumps(r)[:600]}")
        print(f"created {name}: {r['name']}")
        Path(idfile).write_text(r["name"])
