#!/usr/bin/env python3
"""Stamp the OnBoardPro nav rail.

The rail in canvas/src/scr_tasklibrary.pa.yaml is canonical. Every screen's rail is
that text with the suffix and the screen's .Size references swapped. This module
adds the Settings item (last, visible to everyone, lit for the hub and both spokes) and
the Home item (first, visible to everyone, lit on scr_home), and can (a) emit the rail for
any screen, (b) splice an item into existing screens, (c) verify all rails match.

  python3 rail_stamp.py splice        # add the Settings item to the five original screens
  python3 rail_stamp.py splice-home   # add the Home item, first, to every built screen
  python3 rail_stamp.py verify        # every screen's rail == canonical (modulo suffix/screen)
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
       "scr_admin_refdata": "AdmRef", "scr_home": "Home"}
ALL = {**EXISTING, **NEW}
ROOT_RE = re.compile(r"^      - cnt\w+Root:$")
HOME_ICON = "Icon.Home"
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


def _derived_item(screen, sfx, key, label, icon, active, target):
    """A rail item derived from the Task Library item so the shape stays identical:
    visible to everyone, lit when `active` (a Power Fx condition) is true."""
    lines = _lines(CANON_SCREEN)
    s = next(i for i, l in enumerate(lines) if l == "            - conNavTaskLib_TaskLib:")
    # end at the next rail item or the content root — never swallow an already-spliced Settings item
    e = next(i for i in range(s + 1, len(lines))
             if lines[i].startswith("            - conNav") or ROOT_RE.match(lines[i]))
    item = "\n".join(lines[s:e])
    item = item.replace("TaskLib_TaskLib", f"{key}_{sfx}")
    item = item.replace('="Task Library"', f'="{label}"')
    item = item.replace("Icon.Notebook", icon)
    item = item.replace("App.ActiveScreen = scr_tasklibrary", active)
    item = item.replace("Navigate(scr_tasklibrary)", f"Navigate({target})")
    item = item.replace("scr_tasklibrary.Size", f"{screen}.Size")
    item = "\n".join(l for l in item.split("\n") if l.strip() != "Visible: =IsHR")
    # "NavTaskLib", not bare "TaskLib": the _<Sfx> suffix is legitimately "TaskLib" on the
    # canonical screen itself. Every unswapped control name is of the form ...NavTaskLib_.
    assert "NavTaskLib" not in item and "Task Library" not in item, item
    return item


def _settings_item(screen, sfx):
    return _derived_item(screen, sfx, "Settings", "Settings", "Icon.Settings",
                         SETTINGS_ACTIVE, "scr_settings")


def _home_item(screen, sfx):
    return _derived_item(screen, sfx, "Home", "Home", HOME_ICON,
                         "App.ActiveScreen = scr_home", "scr_home")


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


def splice_home():
    """Insert the Home item before the first rail item on every built screen."""
    for screen, sfx in ALL.items():
        if not (SRC / f"{screen}.pa.yaml").exists() or screen == "scr_home":
            continue
        lines = _lines(screen)
        if any("conNavHome_" in l for l in lines):
            print(f"{screen}: already has Home item"); continue
        first = next(i for i, l in enumerate(lines) if l.startswith("            - conNav"))
        lines[first:first] = _home_item(screen, sfx).split("\n")
        (SRC / f"{screen}.pa.yaml").write_text("\n".join(lines))
        print(f"{screen}: spliced Home item before line {first + 1}")


def normalized_rail(screen, sfx):
    lines = _lines(screen)
    s, e = _rail_span(lines)
    return "\n".join(lines[s:e]).replace(f"_{sfx}", "_SFX").replace(f"{screen}.Size", "SCREEN.Size")


def verify():
    ref = normalized_rail(CANON_SCREEN, CANON_SFX)
    assert "conNavSettings_SFX" in ref, "canonical rail lacks the Settings item — run splice first"
    assert "conNavHome_SFX" in ref, "canonical rail lacks the Home item — run splice-home first"
    ok = True
    for screen, sfx in ALL.items():
        if not (SRC / f"{screen}.pa.yaml").exists():
            print(f"{screen}: (not built yet)"); continue
        same = normalized_rail(screen, sfx) == ref
        ok &= same
        print(f"{screen}: {'OK' if same else 'MISMATCH'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    {"splice": splice, "splice-home": splice_home, "verify": verify}[sys.argv[1]]()
