#!/usr/bin/env python3
"""Author + create F4 (Comment Posted) and F5 (Approvals). python3 gen_f4_f5.py create"""
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
APPR = "shared-approvals-bad56a70-c7e7-4dd6-a2b0-5575e0dbe1eb"
CONNREFS = {
    "shared_sharepointonline": {"connectionName": "288fd46092664885aa75c25c64f03c89",
        "source": "Embedded", "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"},
    "shared_office365": {"connectionName": O365, "source": "Embedded",
        "id": "/providers/Microsoft.PowerApps/apis/shared_office365"},
    "shared_approvals": {"connectionName": APPR, "source": "Embedded",
        "id": "/providers/Microsoft.PowerApps/apis/shared_approvals"}}


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
        "https://service.flow.microsoft.com/", "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        Path("/tmp/f45-body.json").write_text(json.dumps(body))
        cmd += ["--data", "@/tmp/f45-body.json"]
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


def sptrigger(table_guid, created_only=False, condition=None):
    t = {"type": "OpenApiConnection",
         "recurrence": {"frequency": "Minute", "interval": 1},
         "splitOn": "@triggerOutputs()?['body/value']",
         "inputs": {"host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                             "connectionName": "shared_sharepointonline",
                             "operationId": "GetOnNewItems" if created_only else "GetOnUpdatedItems"},
                    "parameters": {"dataset": SITE, "table": table_guid},
                    "authentication": "@parameters('$authentication')"}}
    if condition:
        t["conditions"] = [{"expression": condition}]
    return t


def wrap(trig_name, trig, actions):
    return {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0",
            "parameters": {"$connections": {"defaultValue": {}, "type": "Object"},
                           "$authentication": {"defaultValue": {}, "type": "SecureObject"}},
            "triggers": {trig_name: trig}, "actions": actions}


# ---------------- F4: Comment Posted ----------------
CM = "body('Get_Cmt')"
CC = "body('Get_Cand')"


def f4_defn():
    a = {}
    a["Get_Cmt"] = sp(
        f"_api/web/lists(guid'{G['Comments']}')/items(@{{triggerBody()?['ID']}})?"
        "$select=Id,Body,Visibility,CandidateId,Author/EMail,Author/Title,NotifyUsers/EMail"
        "&$expand=Author,NotifyUsers")
    a["Get_Cand"] = sp(
        f"_api/web/lists(guid'{G['Candidates']}')/items(@{{{CM}?['CandidateId']}})?"
        "$select=Id,Title,Email,Manager/EMail,Watchers/EMail&$expand=Manager,Watchers",
        run_after={"Get_Cmt": ["Succeeded"]})
    a["N_Mails"] = {"runAfter": {"Get_Cand": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": f"@coalesce({CM}?['NotifyUsers'], json('[]'))",
                   "select": "@coalesce(item()?['EMail'],'')"}}
    a["W_Mails"] = {"runAfter": {"N_Mails": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": f"@coalesce({CC}?['Watchers'], json('[]'))",
                   "select": "@coalesce(item()?['EMail'],'')"}}
    a["Rcpts"] = {"runAfter": {"W_Mails": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": ("@union(body('N_Mails'), body('W_Mails'), "
                            f"createArray(coalesce({CC}?['Manager']?['EMail'],'')))"),
                   "where": ("@and(not(equals(item(),'')), "
                             f"not(equals(item(), coalesce({CM}?['Author']?['EMail'],''))))")}}
    a["If_Send"] = {"runAfter": {"Rcpts": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"greater": ["@length(body('Rcpts'))", 0]}]},
        "actions": {"Mail_Team": mail(
            "@join(body('Rcpts'), ';')",
            f"@concat('[OnBoardPro] New comment on ', {CC}?['Title'])",
            (f"@concat('<p><b>', coalesce({CM}?['Author']?['Title'],'Someone'), "
             f"'</b> commented on <b>', {CC}?['Title'], '</b>:</p>', "
             f"coalesce({CM}?['Body'],''))"))},
        "else": {"actions": {}}}
    a["If_CandVisible"] = {"runAfter": {"If_Send": ["Succeeded"]}, "type": "If",
        "expression": {"and": [
            {"equals": [f"@coalesce({CM}?['Visibility'],'Internal')", "Candidate-Visible"]},
            {"not": {"equals": [f"@coalesce({CC}?['Email'],'')", ""]}}]},
        "actions": {"Mail_Cand": mail(
            f"@{CC}?['Email']",
            "@concat('An update on your onboarding with UAB OBGYN')",
            (f"@concat('<p>Hello ', {CC}?['Title'], ',</p>', coalesce({CM}?['Body'],''), "
             "'<p>— UAB Department of Obstetrics and Gynecology</p>')"))},
        "else": {"actions": {}}}
    return wrap("When_Comment_Posted", sptrigger(G["Comments"], created_only=True), a)


# ---------------- F5: Approvals ----------------
def f5_defn():
    a = {}
    a["Get_Stages"] = sp(f"_api/web/lists(guid'{G['Stages']}')/items?$select=Id,OrderIndex&$top=50")
    a["Stage_Cur"] = {"runAfter": {"Get_Stages": ["Succeeded"]}, "type": "Query",
        "inputs": {"from": "@body('Get_Stages')?['value']",
                   "where": "@equals(item()?['Id'], coalesce(triggerBody()?['CurrentStageId'], 0))"}}
    a["CurOrd"] = {"runAfter": {"Stage_Cur": ["Succeeded"]}, "type": "Compose",
        "inputs": "@int(coalesce(first(body('Stage_Cur'))?['OrderIndex'], 0))"}
    a["Get_Appr"] = sp(
        f"_api/web/lists(guid'{G['Tasks']}')/items?"
        "$select=Id,Title,TStatus,Assignee/EMail&$expand=Assignee&"
        "$filter=CandidateId eq @{triggerBody()?['ID']} and NeedsApproval eq 1 and "
        "ApprovalStarted eq null and TStatus ne 'Done' and TStatus ne 'Canceled' and "
        "StageOrder eq @{outputs('CurOrd')}&$top=20",
        run_after={"CurOrd": ["Succeeded"]})
    a["Get_HR"] = sp(
        f"_api/web/lists(guid'{G['AppPermissions']}')/items?"
        "$select=Id,AppUser/EMail&$expand=AppUser&$filter=Role eq 'HR'&$top=10",
        run_after={"Get_Appr": ["Succeeded"]})
    each = {}
    each["Stamp"] = sp(f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})", "POST",
        "@concat('{\"ApprovalStarted\":\"', utcNow('yyyy-MM-dd'), '\",\"UpdatedVia\":\"Flow\"}')",
        merge=True)
    each["Approver"] = {"runAfter": {"Stamp": ["Succeeded"]}, "type": "Compose",
        "inputs": ("@coalesce(item()?['Assignee']?['EMail'], "
                   "first(body('Get_HR')?['value'])?['AppUser']?['EMail'])")}
    each["Appr"] = {"runAfter": {"Approver": ["Succeeded"]},
        "type": "OpenApiConnectionWebhook",
        "limit": {"timeout": "P25D"},
        "inputs": {"host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_approvals",
                            "connectionName": "shared_approvals",
                            "operationId": "StartAndWaitForAnApproval"},
                   "parameters": {"approvalType": "Basic",
                       "WebhookApprovalCreationInput/title":
                           "@concat('Approve: ', item()?['Title'], ' — ', triggerBody()?['Title'])",
                       "WebhookApprovalCreationInput/assignedTo": "@outputs('Approver')",
                       "WebhookApprovalCreationInput/details":
                           ("@concat('Candidate: ', triggerBody()?['Title'], "
                            "'\n\nTask: ', item()?['Title'], "
                            "'\n\nApprove to mark the task complete; reject to block it.')"),
                       "WebhookApprovalCreationInput/enableNotifications": True,
                       "WebhookApprovalCreationInput/enableReassignment": True},
                   "authentication": "@parameters('$authentication')"}}
    each["If_Outcome"] = {"runAfter": {"Appr": ["Succeeded"]}, "type": "If",
        "expression": {"and": [{"equals": ["@body('Appr')?['outcome']", "Approve"]}]},
        "actions": {"Complete": sp(
            f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})", "POST",
            ("@concat('{\"TStatus\":\"Done\",\"CompletedDate\":\"', utcNow('yyyy-MM-dd'), "
             "'\",\"UpdatedVia\":\"App\"}')"), merge=True)},
        "else": {"actions": {
            "Block": sp(f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})", "POST",
                "'{\"TStatus\":\"Blocked\",\"UpdatedVia\":\"App\"}'", merge=True),
            "Mail_Reject": mail(
                ("@join(body('HR_Mails'), ';')"),
                "@concat('[OnBoardPro] Approval rejected: ', item()?['Title'])",
                ("@concat('<p>The approval for <b>', item()?['Title'], '</b> (', "
                 "triggerBody()?['Title'], ') was <b>rejected</b> by ', "
                 "coalesce(first(body('Appr')?['responses'])?['responder']?['displayName'],'the approver'), "
                 "'.</p><p>Comments: ', "
                 "coalesce(first(body('Appr')?['responses'])?['comments'],'(none)'), '</p>')"),
                {"Block": ["Succeeded"]})}}}
    each["If_Timeout"] = {"runAfter": {"If_Outcome": ["Skipped", "Failed"]}, "type": "If",
        "expression": {"and": [{"equals": ["@actions('Appr')?['status']", "Failed"]}]},
        "actions": {"Unstamp": sp(
            f"_api/web/lists(guid'{G['Tasks']}')/items(@{{item()?['Id']}})", "POST",
            "'{\"ApprovalStarted\":null,\"UpdatedVia\":\"Flow\"}'", merge=True)},
        "else": {"actions": {}}}
    a["HR_Mails"] = {"runAfter": {"Get_HR": ["Succeeded"]}, "type": "Select",
        "inputs": {"from": "@body('Get_HR')?['value']",
                   "select": "@coalesce(item()?['AppUser']?['EMail'],'')"}}
    a["Each_Appr"] = {"runAfter": {"HR_Mails": ["Succeeded"]}, "type": "Foreach",
        "foreach": "@body('Get_Appr')?['value']",
        "runtimeConfiguration": {"concurrency": {"repetitions": 1}},
        "actions": each}
    return wrap("When_Candidate_Changes", sptrigger(G["Candidates"]), a)


if __name__ == "__main__":
    for name, defn, idfile in [("OnBoard - Comment Posted", f4_defn(), "f4-id.txt"),
                               ("OnBoard - Stage Approvals", f5_defn(), "f5-id.txt")]:
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
