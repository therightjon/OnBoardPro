#!/usr/bin/env python3
"""Author + create F3 (OnBoard - Task Changed). python3 gen_f3.py create|show"""
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
        Path("/tmp/f3-body.json").write_text(json.dumps(body))
        cmd += ["--data", "@/tmp/f3-body.json"]
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


def mail(to_expr, subj_expr, body_expr, run_after=None):
    return {"runAfter": run_after or {}, "type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                 "connectionName": "shared_office365", "operationId": "SendEmailV2"},
        "parameters": {"emailMessage/To": to_expr, "emailMessage/Subject": subj_expr,
                       "emailMessage/Body": body_expr, "emailMessage/Importance": "Normal"},
        "authentication": "@parameters('$authentication')"}}


T = "body('Get_Task')"
C = "body('Get_Cand')"
LINK = f"{SITE}/Lists/Tasks/DispForm.aspx?ID="


def logrow(evt, from_expr, to_expr, run_after=None):
    return sp(f"_api/web/lists(guid'{G['ChangeLog']}')/items", "POST",
        ("@concat('{\"CandidateId\":', string(" + T + "?['CandidateId']), "
         "',\"EventType\":\"" + evt + "\",\"TaskId\":', string(" + T + "?['Id']), "
         "',\"TaskTitle\":\"', replace(coalesce(" + T + "?['Title'],''),'\"',''), "
         "'\",\"FromValue\":\"', " + from_expr + ", "
         "'\",\"ToValue\":\"', " + to_expr + ", "
         "'\",\"ChangedDate\":\"', utcNow(), '\",\"Automated\":false}')"),
        run_after=run_after)


def build_defn():
    a = {}
    a["Get_Task"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items(@{{triggerBody()?['ID']}})?"
        "$select=Id,Title,CandidateId,TStatus,IsRequired,CancelReason,DueDate,StageOrder,"
        "AssigneeId,Assignee/Title,Assignee/EMail,Editor/Title,Editor/EMail"
        "&$expand=Assignee,Editor")
    a["Get_Cand"] = sp(
        f"_api/web/lists(guid'{G['Candidates']}')/items(@{{{T}?['CandidateId']}})?"
        "$select=Id,Title,CurrentStageId,Blocked,Manager/EMail,PrimaryOwner/EMail,"
        "Watchers/EMail&$expand=Manager,PrimaryOwner,Watchers",
        run_after={"Get_Task": ["Succeeded"]})
    a["Get_Log"] = sp(
        f"_api/web/lists(guid'{G['ChangeLog']}')/items?$select=Id,EventType,ToValue&"
        f"$filter=TaskId eq @{{{T}?['Id']}}&$orderby=Id desc&$top=40",
        run_after={"Get_Cand": ["Succeeded"]})
    for evt, name in [("TaskStatus", "L_St"), ("TaskAssignee", "L_As"), ("TaskDue", "L_Du")]:
        a[name] = {"runAfter": {"Get_Log": ["Succeeded"]}, "type": "Query",
                   "inputs": {"from": "@body('Get_Log')?['value']",
                              "where": f"@equals(item()?['EventType'],'{evt}')"}}
    a["Last"] = {"runAfter": {"L_St": ["Succeeded"], "L_As": ["Succeeded"],
                              "L_Du": ["Succeeded"]}, "type": "Compose", "inputs": {
        "status": "@coalesce(first(body('L_St'))?['ToValue'], 'To Do')",
        "assignee": "@coalesce(first(body('L_As'))?['ToValue'], '')",
        "due": "@coalesce(first(body('L_Du'))?['ToValue'], '')"}}
    a["Cur"] = {"runAfter": {"Last": ["Succeeded"]}, "type": "Compose", "inputs": {
        "status": f"@coalesce({T}?['TStatus'],'To Do')",
        "assignee": f"@coalesce({T}?['Assignee']?['Title'],'')",
        "assigneeEmail": f"@coalesce({T}?['Assignee']?['EMail'],'')",
        "due": f"@if(empty(coalesce({T}?['DueDate'],'')),'',substring({T}?['DueDate'],0,10))",
        "editorEmail": f"@coalesce({T}?['Editor']?['EMail'],'')"}}
    # -------- guard: required task canceled without a reason -> revert --------
    a["If_Guard"] = {"runAfter": {"Cur": ["Succeeded"]}, "type": "If",
        "expression": {"and": [
            {"equals": ["@outputs('Cur')?['status']", "Canceled"]},
            {"equals": [f"@coalesce({T}?['IsRequired'],false)", True]},
            {"equals": [f"@empty(coalesce({T}?['CancelReason'],''))", True]}]},
        "actions": {
            "Revert": sp(f"_api/web/lists(guid'{G['Tasks']}')/items(@{{{T}?['Id']}})", "POST",
                ("@concat('{\"TStatus\":\"', outputs('Last')?['status'], "
                 "'\",\"UpdatedVia\":\"Flow\"}')"), merge=True),
            "Log_Revert": logrow("TaskStatus", "'Canceled (reverted: no reason)'",
                "outputs('Last')?['status']", {"Revert": ["Succeeded"]}),
            "Mail_Editor": {**mail(
                "@outputs('Cur')?['editorEmail']",
                f"@concat('[OnBoardPro] Cancellation reverted: ', {T}?['Title'])",
                ("@concat('<p>Canceling a required task needs a reason. The task <b>', "
                 f"{T}?['Title'], '</b> for ', {C}?['Title'], "
                 "' was returned to its previous status. Add a cancel reason and try again.</p>')"),
                {"Log_Revert": ["Succeeded"]}),
                "runtimeConfiguration": {"staticResult": None}} if False else mail(
                "@outputs('Cur')?['editorEmail']",
                f"@concat('[OnBoardPro] Cancellation reverted: ', {T}?['Title'])",
                ("@concat('<p>Canceling a required task needs a reason. The task <b>', "
                 f"{T}?['Title'], '</b> for ', {C}?['Title'], "
                 "' was returned to its previous status. Add a cancel reason and try again.</p>')"),
                {"Log_Revert": ["Succeeded"]}),
            "Stop": {"runAfter": {"Mail_Editor": ["Succeeded"]}, "type": "Terminate",
                     "inputs": {"runStatus": "Succeeded"}}},
        "else": {"actions": {}}}
    # -------- diff logging --------
    a["If_StDiff"] = {"runAfter": {"If_Guard": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"not": {"equals": [
            "@outputs('Cur')?['status']", "@outputs('Last')?['status']"]}}]},
        "actions": {"Log_St": logrow("TaskStatus", "outputs('Last')?['status']",
                                     "outputs('Cur')?['status']")},
        "else": {"actions": {}}}
    a["If_AsDiff"] = {"runAfter": {"If_StDiff": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"not": {"equals": [
            "@outputs('Cur')?['assignee']", "@outputs('Last')?['assignee']"]}}]},
        "actions": {
            "Log_As": logrow("TaskAssignee", "outputs('Last')?['assignee']",
                             "outputs('Cur')?['assignee']"),
            "If_Notify": {"runAfter": {"Log_As": ["Succeeded"]}, "type": "If",
                "expression": {"and": [{"not": {"equals": [
                    "@outputs('Cur')?['assigneeEmail']", ""]}}]},
                "actions": {"Mail_Assignee": mail(
                    "@outputs('Cur')?['assigneeEmail']",
                    f"@concat('[OnBoardPro] Task assigned: ', {T}?['Title'])",
                    (f"@concat('<p>You have been assigned <b>', {T}?['Title'], "
                     f"'</b> for candidate <b>', {C}?['Title'], '</b>', "
                     "if(equals(outputs('Cur')?['due'],''), '', "
                     "concat(', due ', outputs('Cur')?['due'])), "
                     f"'.</p><p><a href=\"{LINK}', string({T}?['Id']), "
                     "'\">Open the task</a></p>')"))},
                "else": {"actions": {}}}},
        "else": {"actions": {}}}
    a["If_DuDiff"] = {"runAfter": {"If_AsDiff": ["Succeeded"]}, "type": "If",
        "expression": {"and": [
            {"not": {"equals": ["@outputs('Cur')?['due']", "@outputs('Last')?['due']"]}},
            {"not": {"equals": ["@outputs('Cur')?['due']", ""]}}]},
        "actions": {"Log_Du": logrow("TaskDue", "outputs('Last')?['due']",
                                     "outputs('Cur')?['due']")},
        "else": {"actions": {}}}
    # -------- advancement + blocked (only when a task closed) --------
    adv = {}
    adv["Get_Stages"] = sp(f"_api/web/lists(guid'{G['Stages']}')/items?$select=Id,Title,OrderIndex&$top=50")
    adv["Get_Open"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items?$select=Id,StageId,StageOrder,IsRequired,TStatus&"
        f"$filter=CandidateId eq @{{{T}?['CandidateId']}} and TStatus ne 'Done' and TStatus ne 'Canceled'&$top=300",
        run_after={"Get_Stages": ["Succeeded"]})
    adv["Stage_Cur"] = {"runAfter": {"Get_Open": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Stages')?['value']",
                   "where": f"@equals(item()?['Id'], coalesce({C}?['CurrentStageId'],0))"}}
    adv["CurOrd"] = {"runAfter": {"Stage_Cur": ["Succeeded"]}, "type": "Compose",
        "inputs": "@int(coalesce(first(body('Stage_Cur'))?['OrderIndex'], 1))"}
    adv["Req_Cur"] = {"runAfter": {"CurOrd": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Open')?['value']", "where":
            ("@and(equals(coalesce(item()?['IsRequired'],false), true), "
             "equals(int(coalesce(item()?['StageOrder'],0)), outputs('CurOrd')))")}}
    adv["Req_Later"] = {"runAfter": {"Req_Cur": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Open')?['value']", "where":
            ("@and(equals(coalesce(item()?['IsRequired'],false), true), "
             "greater(int(coalesce(item()?['StageOrder'],0)), outputs('CurOrd')))")}}
    adv["LaterOrds"] = {"runAfter": {"Req_Later": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Req_Later')",
                   "select": "@int(coalesce(item()?['StageOrder'],0))"}}
    adv["TargetOrd"] = {"runAfter": {"LaterOrds": ["Succeeded"]}, "type": "Compose",
        "inputs": ("@if(greater(length(body('Req_Cur')), 0), outputs('CurOrd'), "
                   "if(greater(length(body('LaterOrds')), 0), min(body('LaterOrds')), 5))")}
    adv["Stage_New"] = {"runAfter": {"TargetOrd": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Stages')?['value']",
                   "where": "@equals(int(coalesce(item()?['OrderIndex'],0)), outputs('TargetOrd'))"}}
    adv["If_Advance"] = {"runAfter": {"Stage_New": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"not": {"equals": ["@outputs('TargetOrd')", "@outputs('CurOrd')"]}}]},
        "actions": {
            "Upd_CandStage": sp(
                f"_api/web/lists(guid'{G['Candidates']}')/items(@{{{C}?['Id']}})", "POST",
                ("@concat('{\"CurrentStageId\":', string(first(body('Stage_New'))?['Id']), '}')"),
                merge=True),
            "Log_Stage": sp(f"_api/web/lists(guid'{G['ChangeLog']}')/items", "POST",
                ("@concat('{\"CandidateId\":', string(" + C + "?['Id']), "
                 "',\"EventType\":\"Stage\",\"FromValue\":\"', "
                 "coalesce(first(body('Stage_Cur'))?['Title'],''), "
                 "'\",\"ToValue\":\"', coalesce(first(body('Stage_New'))?['Title'],''), "
                 "'\",\"ChangedDate\":\"', utcNow(), '\",\"Automated\":true}')"),
                run_after={"Upd_CandStage": ["Succeeded"]}),
            "W_Mails": {"runAfter": {"Log_Stage": ["Succeeded"]}, "type": "Select",
                "inputs": {"from": f"@coalesce({C}?['Watchers'], json('[]'))",
                           "select": "@coalesce(item()?['EMail'],'')"}},
            "Mail_Stage": mail(
                (f"@join(union(body('W_Mails'), createArray("
                 f"coalesce({C}?['Manager']?['EMail'],''), "
                 f"coalesce({C}?['PrimaryOwner']?['EMail'],''))), ';')"),
                f"@concat('[OnBoardPro] ', {C}?['Title'], ' moved to ', first(body('Stage_New'))?['Title'])",
                (f"@concat('<p><b>', {C}?['Title'], '</b> advanced from <b>', "
                 "coalesce(first(body('Stage_Cur'))?['Title'],'—'), '</b> to <b>', "
                 "first(body('Stage_New'))?['Title'], "
                 "'</b> (all required tasks in the prior stage are complete).</p>')"),
                {"W_Mails": ["Succeeded"]})},
        "else": {"actions": {}}}
    adv["Blk"] = {"runAfter": {"If_Advance": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Open')?['value']", "where":
            "@less(int(coalesce(item()?['StageOrder'],99)), outputs('TargetOrd'))"}}
    adv["If_BlkDiff"] = {"runAfter": {"Blk": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"not": {"equals": [
            "@greater(length(body('Blk')), 0)", f"@coalesce({C}?['Blocked'], false)"]}}]},
        "actions": {
            "Upd_Blk": sp(f"_api/web/lists(guid'{G['Candidates']}')/items(@{{{C}?['Id']}})",
                "POST", ("@concat('{\"Blocked\":', "
                         "if(greater(length(body('Blk')),0),'true','false'), '}')"),
                merge=True),
            "If_NowBlocked": {"runAfter": {"Upd_Blk": ["Succeeded"]}, "type": "If",
                "expression": {"and": [{"greater": ["@length(body('Blk'))", 0]}]},
                "actions": {"Mail_Blocked": mail(
                    f"@coalesce({C}?['PrimaryOwner']?['EMail'], {C}?['Manager']?['EMail'], '')",
                    f"@concat('[OnBoardPro] Blocked: ', {C}?['Title'])",
                    (f"@concat('<p><b>', {C}?['Title'], '</b> has ', "
                     "string(length(body('Blk'))), "
                     "' open task(s) in earlier stages. Review the candidate.</p>')"))},
                "else": {"actions": {}}}},
        "else": {"actions": {}}}
    a["If_Closed"] = {"runAfter": {"If_DuDiff": ["Succeeded"]}, "type": "If",
        "expression": {"and": [
            {"not": {"equals": ["@outputs('Cur')?['status']", "@outputs('Last')?['status']"]}},
            {"or": [{"equals": ["@outputs('Cur')?['status']", "Done"]},
                    {"equals": ["@outputs('Cur')?['status']", "Canceled"]}]}]},
        "actions": adv, "else": {"actions": {}}}
    return {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": {"When_Task_Changes": {
                "type": "OpenApiConnection",
                "recurrence": {"frequency": "Minute", "interval": 1},
                "splitOn": "@triggerOutputs()?['body/value']",
                "conditions": [{"expression":
                    "@not(equals(coalesce(triggerBody()?['UpdatedVia'],'App'), 'Flow'))"}],
                "inputs": {
                    "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                             "connectionName": "shared_sharepointonline",
                             "operationId": "GetOnUpdatedItems"},
                    "parameters": {"dataset": SITE, "table": G["Tasks"]},
                    "authentication": "@parameters('$authentication')"}}},
            "actions": build_defn_actions(a)}


def build_defn_actions(a):
    return a


if __name__ == "__main__":
    defn = build_defn()
    Path("flows-f3.json").write_text(json.dumps(defn, indent=1))
    if sys.argv[1] == "show":
        print("written flows-f3.json")
        sys.exit(0)
    r = req("POST", f"{BASE}/flows?{API}", {"properties": {
        "displayName": "OnBoard - Task Changed", "state": "Started",
        "definition": defn, "connectionReferences": CONNREFS}})
    if "name" not in r:
        sys.exit(f"create failed: {json.dumps(r)[:600]}")
    print(f"created F3: {r['name']} state={r['properties'].get('state')}")
    Path("f3-id.txt").write_text(r["name"])
