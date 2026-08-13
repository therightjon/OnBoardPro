#!/usr/bin/env python3
"""Flag fixed-height AutoLayout containers whose children don't fit — at BOTH breakpoints.

The playbook's audit-canvas-ui.py skips any container whose Height/Size is an
`If(<screen>.Size = ScreenSize.Small, a, b)` formula, because it can't evaluate one.
Every responsive container is therefore invisible to its R8/R3 rules — which is how a
42px date row holding a 47px caption+value stack shipped and clipped every date value
(OnBoardPro cockpit, 2026-08-12). This resolves each formula per breakpoint first.

  python3 audit_responsive.py [src_dir]
"""
import re
import sys
import pathlib

import yaml

PT = 1.7  # same line-box model as audit-canvas-ui.py: points * 1.7 -> px
SIZE = {"UABSize.ScreenTitle": 32, "UABSize.SectionHeading": 22,
        "UABSize.FieldLabel": 17, "UABSize.Eyebrow": 13, "UABSize.Body": 15,
        "UABSize.Secondary": 13, "UABSize.ButtonLabel": 15}


def num(v, small):
    """Resolve a property to a number for the chosen breakpoint (None if not numeric)."""
    if v is None:
        return None
    s = str(v).lstrip("=").strip()
    m = re.match(r"^If\(.*?ScreenSize\.Small,\s*(.+?),\s*(.+?)\)$", s)
    if m:
        s = (m.group(1) if small else m.group(2)).strip()
    if s in SIZE:
        return SIZE[s]
    try:
        return float(s)
    except ValueError:
        return None


def is_vertical(v, small):
    """LayoutDirection is itself often responsive — resolve it per breakpoint.

    Reading the raw formula would match "Vertical" inside
    `If(..., LayoutDirection.Vertical, LayoutDirection.Horizontal)` at BOTH
    breakpoints and mis-sum every responsive row.
    """
    if v is None:
        return True                      # AutoLayout default
    s = str(v).lstrip("=").strip()
    m = re.match(r"^If\(.*?ScreenSize\.Small,\s*(.+?),\s*(.+?)\)$", s)
    if m:
        s = (m.group(1) if small else m.group(2)).strip()
    return "Vertical" in s


def walk(node, name, small, out):
    props = node.get("Properties", {}) or {}
    kids = node.get("Children") or []
    height = num(props.get("Height"), small)
    if height and kids and node.get("Variant") == "AutoLayout":
        vertical = is_vertical(props.get("LayoutDirection"), small)
        gap = num(props.get("LayoutGap"), small) or 0
        pad_t = num(props.get("PaddingTop"), small) or 0
        pad_b = num(props.get("PaddingBottom"), small) or 0
        need, shown = pad_t + pad_b, 0
        for child in kids:
            cname = list(child)[0]
            cprops = child[cname].get("Properties", {}) or {}
            if str(cprops.get("Visible", "=true")).strip() == "=false":
                continue  # hidden-but-reserving is a separate trap; see SKILL.md
            if (num(cprops.get("FillPortions"), small) or 0) >= 1:
                continue          # flexes to share the parent's height
            ch = num(cprops.get("Height"), small) or 0
            size = num(cprops.get("Size"), small)
            if size:
                ch = max(ch, round(size * PT))  # a label never renders below its line box
            need = need + ch if vertical else max(need, ch + pad_t + pad_b)
            shown += 1
        if vertical and shown:
            need += gap * (shown - 1)
        if need > height:
            out.append((name, int(height), int(need)))
    for child in kids:
        cname = list(child)[0]
        walk(child[cname], cname, small, out)


def main(src):
    findings = 0
    for path in sorted(pathlib.Path(src).glob("scr_*.pa.yaml")):
        doc = yaml.safe_load(path.read_text())
        for screen in doc.get("Screens", {}).values():
            for small in (False, True):
                out = []
                for child in screen.get("Children", []):
                    cname = list(child)[0]
                    walk(child[cname], cname, small, out)
                for name, height, need in out:
                    label = "phone  " if small else "desktop"
                    # The line-box model (pt * 1.7) is approximate, so a few px
                    # can be noise on a hand-tuned container. It is NOT safe to
                    # ignore outright: the OnBoardPro date row clipped at 5px.
                    mark = "  [marginal — check visually]" if need - height <= 5 else ""
                    print(f"{path.name:26} {label} {name:26} "
                          f"H={height:<5} needs {need:<5} short {need - height}{mark}")
                    findings += 1
    print(f"\n{findings} squeezed responsive container(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "src"))
