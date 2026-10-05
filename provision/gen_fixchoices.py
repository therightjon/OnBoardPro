#!/usr/bin/env python3
"""Repair the choice columns that genpayloads' old whitespace split truncated at creation.

  python3 gen_fixchoices.py read   # fixchoices-read.json: live choices + values in use (GET only)
  python3 gen_fixchoices.py fix    # fixchoices-fix.json: MERGE each column's Choices, then re-read

Run either through the utility flow:  python3 flowdriver.py cycle <json> <outdir>
then restore it:                       python3 flowdriver.py patch idle.json

Target choices come from genpayloads (the schema source of truth), not from this file.
Only the choice list changes; DefaultValue was never truncated and is left alone.
"""
import json
import re
import sys
from pathlib import Path

import genpayloads as gp

HERE = Path(__file__).parent
SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"
G = json.load(open(HERE / "guids.json"))

# list -> truncated columns (from out-audit, 2026-09-10)
BROKEN = {
    "Candidates": ["CStatus", "CandidateType"],
    "Templates": ["CandidateType"],
    "Tasks": ["TStatus", "Anchor"],
    "TasksArchive": ["TStatus", "Anchor"],
    "TemplateTasks": ["Anchor", "PrereqCondition"],
    "TaskLibrary": ["Anchor", "PrereqCondition"],
}


def spec(lst, col):
    """The column's intended choices, parsed from genpayloads' SCHEMA spec string."""
    s = gp.SCHEMA[lst]["cols"][col] if "cols" in gp.SCHEMA[lst] else gp.SCHEMA[lst][col]
    body = re.sub(r"\s+default=.*$", "", s[len("choice:"):])
    return [v.strip() for v in body.split("|")]


def http(name, method, uri, after, body=None):
    params = {"dataset": SITE, "parameters/method": method, "parameters/uri": uri}
    if method == "GET":
        params["parameters/headers"] = {"Accept": "application/json;odata=nometadata"}
    else:
        params["parameters/headers"] = {
            "Accept": "application/json;odata=verbose",
            "Content-Type": "application/json;odata=verbose",
            "X-HTTP-Method": "MERGE", "IF-MATCH": "*"}
        params["parameters/body"] = json.dumps(body)
    return name, {
        "runAfter": {after: ["Succeeded"]} if after else {},
        "type": "OpenApiConnection",
        "inputs": {
            "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                     "connectionName": "shared_sharepointonline", "operationId": "HttpRequest"},
            "parameters": params,
            "authentication": "@parameters('$authentication')"}}


def fields_uri(lst):
    return (f"_api/web/lists(guid'{G[lst]}')/fields?$filter=TypeAsString eq 'Choice'"
            f"&$select=InternalName,Choices,DefaultValue")


def chain(steps):
    out, prev = {}, None
    for name, method, uri, body in steps:
        k, v = http(name, method, uri, prev, body)
        out[k], prev = v, k
    return out


def read():
    steps = []
    for lst, cols in BROKEN.items():
        steps.append((f"F_{lst}", "GET", fields_uri(lst), None))
        sel = ",".join(["ID"] + cols)
        steps.append((f"I_{lst}", "GET",
                      f"_api/web/lists(guid'{G[lst]}')/items?$select={sel}&$top=5000", None))
    return chain(steps)


def fix():
    steps = []
    for lst, cols in BROKEN.items():
        for col in cols:
            steps.append((f"U_{lst}_{col}", "POST",
                          f"_api/web/lists(guid'{G[lst]}')/fields/getbyinternalnameortitle('{col}')",
                          {"__metadata": {"type": "SP.FieldChoice"},
                           "Choices": {"results": spec(lst, col)}}))
    for lst in BROKEN:
        steps.append((f"A_{lst}", "GET", fields_uri(lst), None))
    return chain(steps)


if __name__ == "__main__":
    mode = sys.argv[1]
    for lst, cols in BROKEN.items():
        for col in cols:
            print(f"{lst}.{col}: {spec(lst, col)}")
    payload = {"read": read, "fix": fix}[mode]()
    out = HERE / f"fixchoices-{mode}.json"
    out.write_text(json.dumps(payload, indent=1))
    print(f"wrote {out.name}: {len(payload)} actions")
