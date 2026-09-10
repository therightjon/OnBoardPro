#!/usr/bin/env python3
"""Author + drive F8 (OnBoard - Set Notify Channel).

Called from the canvas app's Settings hub: 'OnBoard-SetNotifyChannel'.Run(channel).
Runs on the flow owner's SharePoint connection so a Viewer (Read on AppPermissions) can
still change their own NotifyChannel. The caller is identified from the trigger's
x-ms-user-email-encoded header, never from an argument, so a run-only user cannot
target anyone else's row.

  python3 gen_f8.py dump      # write flows-f8.json, no network
  python3 gen_f8.py patch     # PATCH definition + connectionReferences onto the shell flow
  python3 gen_f8.py start     # turn the flow on
  python3 gen_f8.py install   # flip installationStatus to Installed (what a designer save does);
                              # Studio registers only Installed flows with their real signature.
                              # Re-run `patch` afterwards: install can blank the trigger schema.
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
ARR = "createArray(" + ", ".join(f"'{c}'" for c in CHANNELS) + ")"   # single source for the whitelist

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
            "text": {"title": "channel", "type": "string", "x-ms-dynamically-added": True}},
        "required": ["text"]}}}}
    a = {}
    hdr = "triggerOutputs()?['headers']?['x-ms-user-email-encoded']"
    a["Inputs"] = {"runAfter": {}, "type": "Compose", "inputs": {
        "caller": f"@toLower(if(empty({hdr}), '', base64ToString({hdr})))",
        "channel": "@coalesce(triggerBody()?['text'], '')"}}
    a["Init_Ok"] = {"runAfter": {"Inputs": ["Succeeded"]}, "type": "InitializeVariable",
                    "inputs": {"variables": [{"name": "ok", "type": "boolean", "value": False}]}}
    a["Init_Msg"] = {"runAfter": {"Init_Ok": ["Succeeded"]}, "type": "InitializeVariable",
                     "inputs": {"variables": [{"name": "msg", "type": "string", "value": "Save failed."}]}}
    a["Valid"] = {"runAfter": {"Init_Msg": ["Succeeded"]}, "type": "Compose",
                  "inputs": (f"@and(contains({ARR}, outputs('Inputs')?['channel']),"
                             " not(empty(outputs('Inputs')?['caller'])),"
                             " not(contains(outputs('Inputs')?['caller'], '''')))")}

    find = sp(f"_api/web/lists(guid'{LIST}')/items?$select=Id,AppUser/EMail&$expand=AppUser"
              "&$filter=AppUser/EMail eq '@{outputs('Inputs')?['caller']}'&$top=1")
    update = sp(f"_api/web/lists(guid'{LIST}')/items(@{{first(body('Find_Row')?['value'])?['Id']}})",
                "POST",
                "@string(json(concat('{\"NotifyChannel\":\"', outputs('Inputs')?['channel'], '\"}')))",
                merge=True)
    found_branch = {
        "Update_Row": update,
        "Set_Ok": setvar("ok", True, {"Update_Row": ["Succeeded"]}),
        "Set_Msg_Saved": setvar("msg", "Notification preference saved.", {"Set_Ok": ["Succeeded"]})}
    not_found = {"Set_Msg_NoRow": setvar(
        "msg", "@concat('No app profile for ', outputs('Inputs')?['caller'], ' - ask HR to add you.')", {})}
    valid_branch = {
        "Find_Row": find,
        "If_Found": {"runAfter": {"Find_Row": ["Succeeded"]}, "type": "If",
                     "expression": {"and": [
                         {"greaterOrEquals": ["@length(body('Find_Row')?['value'])", 1]},
                         {"equals": ["@toLower(coalesce(first(body('Find_Row')?['value'])?['AppUser']?['EMail'], ''))",
                                     "@outputs('Inputs')?['caller']"]}]},
                     "actions": found_branch, "else": {"actions": not_found}}}
    a["If_Valid"] = {"runAfter": {"Valid": ["Succeeded"]}, "type": "If",
                     "expression": {"and": [{"equals": ["@outputs('Valid')", True]}]},
                     "actions": valid_branch,
                     "else": {"actions": {"Set_Msg_Bad": setvar(
                         "msg", (f"@if(contains({ARR}, outputs('Inputs')?['channel']),"
                                 " 'Could not identify you - open Settings from the OnBoardPro app and try again.',"
                                 " concat('Unknown channel: ', outputs('Inputs')?['channel']))"), {})}}}
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


def install():
    # Verified 2026-09-10: a Save As shell stays installationStatus=Uninstalled after patch/start,
    # Studio then registers it as Run() with no inputs/outputs. This endpoint flips it to
    # Installed (200, returns flowTriggerUri) but rewrote the trigger schema to {} - so patch again.
    r = req("POST", f"{BASE}/flows/{fid()}/install?{API}")
    print("installed" if "flowTriggerUri" in json.dumps(r) else r)


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
    {"dump": dump, "patch": patch, "start": start, "install": install, "share": share, "verify": verify}[sys.argv[1]]()
