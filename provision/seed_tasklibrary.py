#!/usr/bin/env python3
"""Seed the TaskLibrary from the live base templates, then standardize the templates from it.

Steps (run in order; each reads the previous step's flow output):
  python3 seed_tasklibrary.py read      -> seedlib-read.json   (GET live TemplateTasks rows)
  python3 flowdriver.py cycle seedlib-read.json out-seedlib
  python3 seed_tasklibrary.py seed      -> seedlib-create-N.json (dedupe + create rows, chunked)
  python3 flowdriver.py cycle seedlib-create-1.json out-seedlib   (then -2, ...)
  python3 seed_tasklibrary.py backfill  -> seedlib-backfill.json (MERGE rows whose standard
                                           fields drifted from the library; may be empty)
  python3 flowdriver.py cycle seedlib-backfill.json out-seedlib
  python3 flowdriver.py patch idle.json   # always leave the flow as found

Dedupe is by trimmed, case-insensitive Title across both base templates; the Clinical copy
(Templates/1) is canonical where a title appears in both. Three same-title tasks carry
intentionally track-specific descriptions, so the library entry gets a merged role-neutral
description (map below); the templates keep their own. Backfill never touches Description,
Template, TemplateStage, OrderIndex, or FixedDate.
"""
import json
import sys
from pathlib import Path

from genpayloads import chain, sp_action

G = json.load(open(Path(__file__).parent / "guids.json"))
TT, TL = G["TemplateTasks"], G["TaskLibrary"]
BASE_TEMPLATES = [1, 2]  # Faculty Hire - Clinical, Faculty Hire - Research
NOMETA = {"Content-Type": "application/json;odata=nometadata"}
MERGE = {"Content-Type": "application/json;odata=nometadata",
         "X-HTTP-Method": "MERGE", "IF-MATCH": "*"}
SELECT = ("Id,Title,Description,OffsetDays,IsRequired,IsPrereq,NeedsApproval,"
          "Anchor,AssigneeRole,Priority,Category,PrereqCondition,TemplateId,TemplateStageId")
# Fields the library standardizes across templates (Description deliberately excluded)
STD_FIELDS = ["Category", "Anchor", "OffsetDays", "AssigneeRole", "Priority",
              "IsRequired", "IsPrereq", "PrereqCondition", "NeedsApproval"]

MERGED_DESC = {
    "divisional admin setup":
        "Lab coats (as applicable); business cards; mail; assign admin support.",
    "physical access (keys, codes, one card)":
        "Hospital perimeter; office (order keys); other clinical/research locations as "
        "needed. Clinical adult faculty add: WIC clinical locations; OR; OR locker room; "
        "physician lounge.",
    "schedule leadership meetings":
        "Chair (Warner Huh); Executive Administrator (Taylor Sisson); Division Director + "
        "divisional admin support staff. Clinical faculty add: AVP Women's Health Service "
        "Line (Jennifer Kelley); VC of Clinical Affairs (Todd Jenkins); Operations "
        "Administrator (Tim McElroy).",
}


def load_rows():
    d = json.load(open("out-seedlib/Get_TemplateTasks.json"))
    rows = d.get("body", d)["value"]
    return [r for r in rows if r.get("TemplateId") in BASE_TEMPLATES]


def canon_key(title):
    return " ".join((title or "").split()).lower()


def dedupe(rows):
    """Return {key: canonical row}, preferring Templates/1, plus divergence notes."""
    canon, notes = {}, []
    for tpl in BASE_TEMPLATES:  # template 1 first -> its copy wins
        for r in rows:
            if r["TemplateId"] != tpl:
                continue
            k = canon_key(r["Title"])
            if not k:
                notes.append(f"SKIPPED unnamed task Id={r['Id']} (template {tpl})")
                continue
            if k not in canon:
                canon[k] = r
            else:
                c = canon[k]
                for f in STD_FIELDS:
                    if r.get(f) != c.get(f):
                        notes.append(f"ATTR DIVERGENCE '{r['Title']}' {f}: "
                                     f"tpl{c['TemplateId']}={c.get(f)!r} vs tpl{tpl}={r.get(f)!r}"
                                     " -> library takes the Clinical value")
                if (r.get("Description") or "") != (c.get("Description") or ""):
                    tag = "merged desc" if k in MERGED_DESC else "kept Clinical desc (no merge entry)"
                    notes.append(f"DESC DIVERGENCE '{r['Title']}' -> {tag}")
    return canon, notes


def lib_fields(r):
    k = canon_key(r["Title"])
    f = {"Title": " ".join(r["Title"].split()),
         "Description": MERGED_DESC.get(k, r.get("Description") or ""),
         "Category": r.get("Category") or "Other",
         "Anchor": r.get("Anchor") or "None",
         "OffsetDays": r.get("OffsetDays") if r.get("OffsetDays") is not None else 0,
         "AssigneeRole": r.get("AssigneeRole") or "Person",
         "Priority": r.get("Priority") or "Medium",
         "IsRequired": bool(r.get("IsRequired")),
         "IsPrereq": bool(r.get("IsPrereq")),
         "NeedsApproval": bool(r.get("NeedsApproval")),
         "IsActive": True}
    if r.get("IsPrereq"):
        f["PrereqCondition"] = r.get("PrereqCondition") or "Always"
    return f


def cmd_read():
    pairs = [("Get_TemplateTasks", sp_action(
        f"_api/web/lists(guid'{TT}')/items?$select={SELECT}&$top=500"))]
    Path("seedlib-read.json").write_text(json.dumps(chain(pairs), indent=1))
    print("seedlib-read.json: 1 action")


def cmd_seed(chunk_size=40):
    rows = load_rows()
    canon, notes = dedupe(rows)
    print(f"{len(rows)} live rows across templates {BASE_TEMPLATES} -> {len(canon)} unique titles")
    for n in notes:
        print(" ", n)
    pairs = []
    for i, r in enumerate(sorted(canon.values(), key=lambda x: canon_key(x["Title"])), 1):
        pairs.append((f"Mk_Lib_{i:02d}", sp_action(
            f"_api/web/lists(guid'{TL}')/items", "POST",
            json.dumps(lib_fields(r)), NOMETA)))
    chunks = [pairs[i:i + chunk_size] for i in range(0, len(pairs), chunk_size)]
    for i, ch in enumerate(chunks, 1):
        if i == len(chunks):  # verify count on the last chunk
            ch.append(("V_LibCount", sp_action(
                f"_api/web/lists(guid'{TL}')/items?$select=Id,Title&$top=500")))
        Path(f"seedlib-create-{i}.json").write_text(json.dumps(chain(ch), indent=1))
    print(f"{len(pairs)} creates across {len(chunks)} file(s)")


def cmd_backfill():
    rows = load_rows()
    canon, _ = dedupe(rows)
    lib = {k: lib_fields(r) for k, r in canon.items()}
    pairs, report = [], []
    for r in rows:
        k = canon_key(r["Title"])
        if k not in lib:
            continue
        want = lib[k]
        delta = {}
        for f in STD_FIELDS:
            have = r.get(f)
            target = want.get(f, None)
            if f == "OffsetDays":
                have = have if have is not None else 0
            if f == "PrereqCondition":
                target = want.get("PrereqCondition")
                if not want["IsPrereq"]:
                    target = None
            if f in ("IsRequired", "IsPrereq", "NeedsApproval"):
                have = bool(have)
            if have != target and not (have is None and target is None):
                delta[f] = target
        if delta:
            report.append(f"Id={r['Id']} tpl{r['TemplateId']} '{r['Title']}': {delta}")
            pairs.append((f"BF_{r['Id']}", sp_action(
                f"_api/web/lists(guid'{TT}')/items({r['Id']})", "POST",
                json.dumps(delta), MERGE)))
    if pairs:
        pairs.append(("V_Backfill", sp_action(
            f"_api/web/lists(guid'{TT}')/items?$select={SELECT}&$top=500")))
        Path("seedlib-backfill.json").write_text(json.dumps(chain(pairs), indent=1))
    print(f"{len(report)} row(s) need backfill")
    for line in report:
        print(" ", line)
    if not pairs:
        print("nothing to backfill - templates already match the library")


if __name__ == "__main__":
    {"read": cmd_read, "seed": cmd_seed, "backfill": cmd_backfill}[sys.argv[1]]()
