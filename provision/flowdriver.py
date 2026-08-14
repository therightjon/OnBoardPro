#!/usr/bin/env python3
"""Drive the kept SharePoint schema-ops utility flow for OnBoardPro provisioning.

Usage:
  python3 flowdriver.py patch <actions.json>   # replace the flow's actions, keep trigger/params
  python3 flowdriver.py run                    # fire the Recurrence trigger
  python3 flowdriver.py result [outdir]        # poll latest run, dump each action's output
  python3 flowdriver.py cycle <actions.json> [outdir]   # patch + run + result

Auth: az CLI must be signed in as jsteen@uab.edu (UAB tenant). The driver
re-reads the flow before every patch (stale-snapshot clobber rule) and builds
connectionReferences from installedConnectionReferences (the reliable source).
"""
import json
import subprocess
import sys
import time
from pathlib import Path

ENV = "Default-d8999fe4-76af-40b3-b435-1d8977abc08c"
FLOW = "1c26b238-f07a-4540-b221-317903202eb5"
BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV}"
API = "api-version=2016-11-01"


def token():
    out = subprocess.run(
        ["az", "account", "get-access-token", "--resource",
         "https://service.flow.microsoft.com/", "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, check=True)
    return out.stdout.strip()


def req(method, url, body=None):
    # curl throughout: this Mac's python.org build fails SSL verification (per playbook)
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        tmp = Path("/tmp/flowdriver-body.json")
        tmp.write_text(json.dumps(body))
        cmd += ["--data", f"@{tmp}"]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True)
    raw = out.stdout.strip()
    return json.loads(raw) if raw else {}


def curl(url):
    # outputsLink URIs fail SSL verification under urllib on this Mac - use curl
    out = subprocess.run(["curl", "-s", url], capture_output=True, text=True, check=True)
    return out.stdout


def get_flow():
    return req("GET", f"{BASE}/flows/{FLOW}?{API}")


def patch(actions_path):
    actions = json.loads(Path(actions_path).read_text())
    flow = get_flow()  # fresh fetch immediately before generating the patch
    p = flow["properties"]
    defn = p["definition"]
    defn["actions"] = actions
    icr = p.get("installedConnectionReferences") or {}
    connrefs = {
        k: {"connectionName": v["connectionName"], "source": v.get("source", "Embedded"), "id": v["id"]}
        for k, v in icr.items() if v.get("connectionName")}
    body = {"properties": {"definition": defn, "connectionReferences": connrefs}}
    result = req("PATCH", f"{BASE}/flows/{FLOW}?{API}", body)
    got = list(result.get("properties", {}).get("definition", {}).get("actions", {}).keys())
    print(f"patched; actions now: {got}")
    return got


def run():
    req("POST", f"{BASE}/flows/{FLOW}/triggers/Recurrence/run?{API}")
    print("run fired")


def result(outdir="out"):
    Path(outdir).mkdir(exist_ok=True)
    for attempt in range(60):
        runs = req("GET", f"{BASE}/flows/{FLOW}/runs?{API}").get("value", [])
        if not runs:
            time.sleep(2)
            continue
        latest = runs[0]
        status = latest["properties"]["status"]
        if status in ("Succeeded", "Failed", "Cancelled"):
            break
        time.sleep(3)
    name = latest["name"]
    print(f"run {name}: {status}")
    acts = req("GET", f"{BASE}/flows/{FLOW}/runs/{name}/actions?{API}").get("value", [])
    ok = True
    for a in sorted(acts, key=lambda x: x["properties"].get("startTime", "")):
        an = a["name"]
        st = a["properties"]["status"]
        code = a["properties"].get("code", "")
        print(f"  {an}: {st} {code}")
        if st != "Succeeded":
            ok = False
            err = a["properties"].get("error", {})
            if err:
                print(f"    error: {json.dumps(err)[:400]}")
        link = a["properties"].get("outputsLink", {}).get("uri")
        if link:
            body = curl(link)
            Path(outdir, f"{an}.json").write_text(body)
            print(f"    -> {outdir}/{an}.json ({len(body)} bytes)")
    return ok and status == "Succeeded"


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "patch":
        patch(sys.argv[2])
    elif cmd == "run":
        run()
    elif cmd == "result":
        sys.exit(0 if result(*sys.argv[2:3]) else 1)
    elif cmd == "cycle":
        patch(sys.argv[2])
        time.sleep(3)
        run()
        time.sleep(5)
        sys.exit(0 if result(*(sys.argv[3:4] or ["out"])) else 1)
    else:
        sys.exit(f"unknown command {cmd}")
