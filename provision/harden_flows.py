"""Escape user text where the flows splice it into email HTML or a JSON request body.

Task and candidate titles, comments and cancel reasons are typed by people (Tasks and Comments
carry a direct Edit grant), and the flows build email HTML and SharePoint JSON bodies with
concat(). Unescaped, a title ending in a backslash makes the JSON invalid (the write fails and
the rest of the run is skipped), and markup in a comment lands in other people's email.

Rules, applied to every flow and safe to run again (already-escaped text is left alone):
- HTML (email bodies and the digest rows built by Select): each user-text reference X becomes
  replace(replace(replace(coalesce(X,''),'&','&amp;'),'<','&lt;'),'>','&gt;').
- JSON (SharePoint POST/MERGE bodies): F3's old quote-stripping becomes proper escaping of
  backslash and quote, and a raw reference X becomes the same escaped form.
- F3's Last.status (the status a cancel-without-reason revert writes back) is limited to the five
  real choices.

  python3 harden_flows.py check          # report what would change, write nothing
  python3 harden_flows.py apply f3 f4 …  # patch those live flows (definition only), save flows-*.json

F6's daily check is cloned from F3: harden F3, rerun `gen_f6_check.py apply`, then harden F6.
"""
import copy
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
BASE = ("https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/"
        "Default-d8999fe4-76af-40b3-b435-1d8977abc08c")
API = "api-version=2016-11-01"
FLOWS = {"f1": ("37c175f5-b395-f111-8076-3833c5eece6e", "flows-f1-final.json")}
for n in ("f2", "f3", "f4", "f5", "f6", "f7"):
    FLOWS[n] = ((HERE / f"{n}-id.txt").read_text().strip(), f"flows-{n}.json")

FIELDS = "Title|CandName|Body|Comment|CancelReason|Notes|TaskTitle"
REF = re.compile(
    r"(?:first\()?(?:body|items|outputs|triggerBody)\((?:'[A-Za-z0-9_]+')?\)\)?(?:\?\['[A-Za-z]+'\])*"
    rf"\?\['(?:{FIELDS})'\]"
    rf"|item\(\)\?\['(?:{FIELDS})'\]")
HTML_DONE = "'&amp;'"
OLD_STRIP = re.compile(r"replace\((coalesce\((?:[^()]|\([^()]*\))*\)),'\"',''\)")
STATUSES = "createArray('To Do','In Progress','Blocked','Done','Canceled')"


def html(ref):
    return f"replace(replace(replace(coalesce({ref},''),'&','&amp;'),'<','&lt;'),'>','&gt;')"


def jsn(inner):
    return f"replace(replace({inner},'\\','\\\\'),'\"','\\\"')"


def token():
    return subprocess.run(["az", "account", "get-access-token", "--resource",
                           "https://service.flow.microsoft.com/", "--query", "accessToken", "-o", "tsv"],
                          capture_output=True, text=True, check=True).stdout.strip()


def req(method, url, body=None):
    args = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {token()}"]
    if body is not None:
        args += ["-H", "Content-Type: application/json", "--data", json.dumps(body)]
    return json.loads(subprocess.run(args + [url], capture_output=True, text=True).stdout or "{}")


def wrap_refs(s, fn):
    """Wrap every user-text reference not already inside a coalesce(...) we produced."""
    out, i = [], 0
    for m in REF.finditer(s):
        out.append(s[i:m.start()])
        out.append(fn(m.group(0)))
        i = m.end()
    out.append(s[i:])
    return "".join(out)


def harden(defn, log):
    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                p = f"{path}/{k}"
                if isinstance(v, str) and v.startswith("@"):
                    nv = fix(p, k, v)
                    if nv != v:
                        log.append(p.split("/actions/")[-1])
                        o[k] = nv
                else:
                    walk(v, p)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{path}[{i}]")

    def fix(path, key, s):
        if key == "emailMessage/Body" or (key == "select" and "<" in s):
            if HTML_DONE in s or not REF.search(s):
                return s
            return wrap_refs(s, html)
        if key == "parameters/body" and REF.search(s):
            if "'\\\\'" in s:                      # already escaped
                return s
            s2 = OLD_STRIP.sub(lambda m: jsn(m.group(1)), s)
            if s2 != s:
                return s2
            return wrap_refs(s, lambda r: jsn(f"coalesce({r},'')"))
        if path.endswith("/Last/inputs/status") and STATUSES not in s:
            inner = s[1:]
            return f"@if(contains({STATUSES}, {inner}), {inner}, 'To Do')"
        return s
    walk(defn["actions"], "")


def load_repo(fname):
    d = json.load(open(HERE / fname))
    return d.get("properties", {}).get("definition", d.get("definition", d))


if __name__ == "__main__":
    cmd, names = sys.argv[1], sys.argv[2:] or list(FLOWS)
    for n in names:
        fid, fname = FLOWS[n]
        live = req("GET", f"{BASE}/flows/{fid}?{API}")["properties"]
        d = copy.deepcopy(live["definition"])
        log = []
        harden(d, log)
        print(f"{n}: {len(log)} change(s)", log)
        if cmd != "apply" or not log:
            continue
        r = req("PATCH", f"{BASE}/flows/{fid}?{API}",
                {"properties": {"definition": d, "connectionReferences": live["connectionReferences"]}})
        if "error" in r:
            sys.exit(f"{n}: {json.dumps(r['error'])[:600]}")
        back = req("GET", f"{BASE}/flows/{fid}?{API}")["properties"]
        assert back["definition"] == d, f"{n}: live differs from what was sent"
        (HERE / fname).write_text(json.dumps(back["definition"], indent=1))
        print(f"   patched: {back['state']}, connections {sorted(back['connectionReferences'])}")
