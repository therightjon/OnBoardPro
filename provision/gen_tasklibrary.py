#!/usr/bin/env python3
"""Provision the TaskLibrary list (reusable task definitions shared across templates).

Reverses plan decision "task definitions folded into TemplateTasks" — the library
gives HR one place to keep task definitions standard; the template editor copies
rows from here into TemplateTasks.

  python3 gen_tasklibrary.py            -> tasklibrary.json (create + fields + verify)
  python3 flowdriver.py cycle tasklibrary.json out-tasklibrary
  python3 flowdriver.py patch idle.json   # always leave the flow as found

Fields address the list by title (getbytitle) so create + columns chain in one run.
"""
import json
from pathlib import Path

from genpayloads import ANCHORS, CATS, PRIOS, ROLES, chain, field_xml, sp_action

LIST = "TaskLibrary"

COLS = {
    "Description": "note",
    "Category": f"choice:{'|'.join(CATS)} default=Other",
    "Anchor": f"choice:{'|'.join(ANCHORS)} default=None",
    "OffsetDays": "num",
    "AssigneeRole": f"choice:{'|'.join(ROLES)} default=Person",
    "DefaultAssignee": "user",
    "Priority": f"choice:{'|'.join(PRIOS)} default=Medium",
    "IsRequired": "bool default=1",
    "IsPrereq": "bool default=0",
    "PrereqCondition": "choice:Always|Requires P&T",
    "NeedsApproval": "bool default=0",
    "IsActive": "bool default=1",
}


def main():
    pairs = []
    body = json.dumps({"__metadata": {"type": "SP.List"}, "BaseTemplate": 100,
                       "Title": LIST, "ContentTypesEnabled": False})
    pairs.append((f"Mk_{LIST}", sp_action(
        "_api/web/lists", "POST", body,
        {"Content-Type": "application/json;odata=verbose"})))
    for col, spec in COLS.items():
        fbody = json.dumps({"parameters": {
            "SchemaXml": field_xml(col, spec, {}), "Options": 10}})
        pairs.append((f"F_{LIST}_{col}", sp_action(
            f"_api/web/lists/getbytitle('{LIST}')/fields/createfieldasxml", "POST", fbody,
            {"Content-Type": "application/json;odata=verbose"})))
    pairs.append((f"V_{LIST}_fields", sp_action(
        f"_api/web/lists/getbytitle('{LIST}')/fields?$select=InternalName,Title,TypeAsString,Hidden&$filter=Hidden eq false")))
    Path("tasklibrary.json").write_text(json.dumps(chain(pairs), indent=1))
    print(f"tasklibrary.json: {len(pairs)} actions (1 create, {len(COLS)} fields, 1 verify)")


if __name__ == "__main__":
    main()
