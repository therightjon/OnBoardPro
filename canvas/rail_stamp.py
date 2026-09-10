#!/usr/bin/env python3
"""Stamp the OnBoardPro nav rail.

The rail in canvas/src/scr_tasklibrary.pa.yaml is canonical. Every screen's rail is
that text with the suffix and the screen's .Size references swapped. This module
adds the Settings item (last, visible to everyone, lit for the hub and both spokes)
and can (a) emit the rail for any screen, (b) splice just the Settings item into an
existing screen, (c) verify all rails match.

  python3 rail_stamp.py splice    # add the Settings item to the five existing screens
  python3 rail_stamp.py verify    # every screen's rail == canonical (modulo suffix/screen)
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).parent / "src"
CANON_SCREEN, CANON_SFX = "scr_tasklibrary", "TaskLib"
EXISTING = {"scr_candidates": "Candidates", "scr_mytasks": "MyTasks",
            "scr_new_candidate": "NewCand", "scr_tasklibrary": "TaskLib",
            "scr_templates": "Templates"}
NEW = {"scr_settings": "Settings", "scr_admin_users": "AdmUsers",
       "scr_admin_refdata": "AdmRef"}
ALL = {**EXISTING, **NEW}
ROOT_RE = re.compile(r"^      - cnt\w+Root:$")
SETTINGS_ACTIVE = ("App.ActiveScreen = scr_settings || App.ActiveScreen = scr_admin_users"
                   " || App.ActiveScreen = scr_admin_refdata")


def _lines(screen):
    return (SRC / f"{screen}.pa.yaml").read_text().split("\n")


def _rail_span(lines):
    start = next(i for i, l in enumerate(lines) if l.startswith("      - NavRail_"))
    end = next(i for i, l in enumerate(lines) if ROOT_RE.match(l))
    return start, end


def _canonical_rail_without_settings():
    lines = _lines(CANON_SCREEN)
    s, e = _rail_span(lines)
    return "\n".join(lines[s:e])


def _settings_item(screen, sfx):
    """The Settings item, derived from the Task Library item so the shape stays identical."""
    lines = _lines(CANON_SCREEN)
    s = next(i for i, l in enumerate(lines) if l == "            - conNavTaskLib_TaskLib:")
    # end at the next rail item or the content root — never swallow an already-spliced Settings item
    e = next(i for i in range(s + 1, len(lines))
             if lines[i].startswith("            - conNav") or ROOT_RE.match(lines[i]))
    item = "\n".join(lines[s:e])
    item = item.replace("TaskLib_TaskLib", f"Settings_{sfx}")
    item = item.replace('="Task Library"', '="Settings"')
    item = item.replace("Icon.Notebook", "Icon.Settings")
    item = item.replace("App.ActiveScreen = scr_tasklibrary", SETTINGS_ACTIVE)
    item = item.replace("Navigate(scr_tasklibrary)", "Navigate(scr_settings)")
    item = item.replace("scr_tasklibrary.Size", f"{screen}.Size")
    item = "\n".join(l for l in item.split("\n") if l.strip() != "Visible: =IsHR")
    # "NavTaskLib", not bare "TaskLib": the _<Sfx> suffix is legitimately "TaskLib" on the
    # canonical screen itself. Every unswapped control name is of the form ...NavTaskLib_.
    assert "NavTaskLib" not in item and "Task Library" not in item, item
    return item


def rail_text(screen, suffix):
    """Full rail block (six items) for `screen`, ready for a screen's Children: list."""
    rail = _canonical_rail_without_settings()
    if "conNavSettings_" not in rail:
        rail = rail + "\n" + _settings_item(CANON_SCREEN, CANON_SFX)
    rail = rail.replace(f"_{CANON_SFX}", f"_{suffix}")
    rail = rail.replace(f"{CANON_SCREEN}.Size", f"{screen}.Size")
    return rail + "\n"


def splice():
    for screen, sfx in EXISTING.items():
        lines = _lines(screen)
        if any("conNavSettings_" in l for l in lines):
            print(f"{screen}: already has Settings item"); continue
        _, root = _rail_span(lines)
        item = _settings_item(screen, sfx).split("\n")
        lines[root:root] = item
        (SRC / f"{screen}.pa.yaml").write_text("\n".join(lines))
        print(f"{screen}: spliced Settings item before line {root + 1}")


def normalized_rail(screen, sfx):
    lines = _lines(screen)
    s, e = _rail_span(lines)
    return "\n".join(lines[s:e]).replace(f"_{sfx}", "_SFX").replace(f"{screen}.Size", "SCREEN.Size")


def verify():
    ref = normalized_rail(CANON_SCREEN, CANON_SFX)
    assert "conNavSettings_SFX" in ref, "canonical rail lacks the Settings item — run splice first"
    ok = True
    for screen, sfx in ALL.items():
        if not (SRC / f"{screen}.pa.yaml").exists():
            print(f"{screen}: (not built yet)"); continue
        same = normalized_rail(screen, sfx) == ref
        ok &= same
        print(f"{screen}: {'OK' if same else 'MISMATCH'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    {"splice": splice, "verify": verify}[sys.argv[1]]()
