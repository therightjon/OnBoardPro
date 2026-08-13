#!/usr/bin/env python3
"""Cockpit stage 2b: key dates + template + Apply Template (F1).

Splices a card in after conTkCard. Targeted insertion; src/*.pa.yaml is canonical.
All names new (Dt prefix). F1 resolves which template to expand from the candidate's
TemplateId, so the template picker has to live next to the button that calls it.

  python3 gen_cockpit_dates.py
"""
import pathlib

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_candidates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelCandId, 0)"
C = f"LookUp(Candidates, ID = {SEL})"

FIELDS = [("LOI", "Letter of Intent", "LOIDate"),
          ("LOOIss", "LOO Issued", "LOOIssued"),
          ("LOOAcc", "LOO Accepted", "LOOAccepted"),
          ("Start", "Start Date", "StartDate")]

# Blank on either side is never a violation — partly-filled records stay saveable.
ORDER_OK = (
    "And(\n"
    "    Or(IsBlank(dpDtLOI.SelectedDate), IsBlank(dpDtLOOIss.SelectedDate),\n"
    "        dpDtLOOIss.SelectedDate >= dpDtLOI.SelectedDate),\n"
    "    Or(IsBlank(dpDtLOOIss.SelectedDate), IsBlank(dpDtLOOAcc.SelectedDate),\n"
    "        dpDtLOOAcc.SelectedDate >= dpDtLOOIss.SelectedDate),\n"
    "    Or(IsBlank(dpDtLOOAcc.SelectedDate), IsBlank(dpDtStart.SelectedDate),\n"
    "        dpDtStart.SelectedDate >= dpDtLOOAcc.SelectedDate))")

SAVE = (
    "=IfError(\n"
    f"    Patch(Candidates, {C},\n"
    "        {LOIDate: dpDtLOI.SelectedDate,\n"
    "         LOOIssued: dpDtLOOIss.SelectedDate,\n"
    "         LOOAccepted: dpDtLOOAcc.SelectedDate,\n"
    "         StartDate: dpDtStart.SelectedDate,\n"
    "         Template: If(IsBlank(cmbDtTemplate.Selected), Blank(),\n"
    "             {Id: cmbDtTemplate.Selected.ID, Value: cmbDtTemplate.Selected.Title})}),\n"
    '    Notify("Couldn\'t save the dates - " & FirstError.Message\n'
    '        & " Nothing was changed. Try again.", NotificationType.Error),\n'
    '    Notify("Saved. Due dates recalculate within a minute.",\n'
    "        NotificationType.Success))")

# prereq at creation, full once the offer is accepted (F1's two modes)
MODE = f'If(IsBlank({C}.LOOAccepted), "prereq", "full")'

APPLY = (
    "=IfError(\n"
    "    With({r: 'OnBoard - Apply Template'.Run(" + SEL + ", " + MODE + ")},\n"
    "        Refresh(Tasks); Refresh(Candidates);\n"
    '        Notify("Checklist updated. Open tasks appear below.",\n'
    "            NotificationType.Success)),\n"
    '    Notify("Couldn\'t apply the template - " & FirstError.Message\n'
    '        & " Nothing was changed. Try again.", NotificationType.Error))')

APPLY_TEXT = (
    f'=If(IsBlank({C}.LOOAccepted), "Apply prerequisites", "Build full checklist")')

APPLY_ENABLED = (
    f"And({SEL} > 0,\n"
    "    !IsBlank(cmbDtTemplate.Selected),\n"
    f"    If(IsBlank({C}.LOOAccepted),\n"
    f"        IsBlank({C}.PrereqsExpanded),\n"
    f"        IsBlank({C}.TemplateApplied)))")

HINT = (
    "=If(IsBlank(cmbDtTemplate.Selected),\n"
    '        "Choose a template, then save, before building the checklist.",\n'
    f"    !IsBlank({C}.TemplateApplied),\n"
    f'        "Full checklist built " & Text({C}.TemplateApplied, "mmm d, yyyy") & ".",\n'
    f"    IsBlank({C}.LOOAccepted) && !IsBlank({C}.PrereqsExpanded),\n"
    '        "Prerequisites applied. The full checklist unlocks once the offer is accepted.",\n'
    f"    IsBlank({C}.LOOAccepted),\n"
    '        "Adds the prerequisite tasks only — the rest follows offer acceptance.",\n'
    '    "Builds every remaining task from the template.")')


def clear_icon(key):
    return (f"icoDtClear{key}", ctl("Classic/Icon", {**AUTOZ,
        "Color": "=UAB.Gray500", "FillPortions": "=0", "Height": "=20",
        "Icon": "=Icon.Cancel",
        # ModernDatePicker cannot be blanked programmatically: flag + Reset is the cure
        "OnSelect": f"=Set(varDtClear{key}, true);\nReset(dpDt{key})",
        "Tooltip": '="Clear this date"', "Width": "=20"}))


def date_field(key, caption, column):
    return (f"conDtField{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Height": "=68",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        (f"conDtLabelRow{key}", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=22",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            (f"lblDt{key}Cap", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
                "FontWeight": "=FontWeight.Semibold", "Height": "=22",
                "Size": "=UABSize.Secondary", "Text": f'="{caption}"',
                "Wrap": "=false"})),
            clear_icon(key),
        ])),
        (f"dpDt{key}", ctl("ModernDatePicker", {**AUTOZ,
            "DefaultDate": (f"=If(Coalesce(varDtClear{key}, false), Blank(), "
                            f"{C}.{column})"),
            "FillPortions": "=0", "Height": "=40"})),
    ]))


def build_card():
    head = ("conDtHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal"}, [
        ("lblDtEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Bold", "Height": "=22",
            "Size": "=UABSize.Eyebrow", "Text": '="KEY DATES & TEMPLATE"',
            "Wrap": "=false"})),
    ]))

    grid = ("conDtGrid", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 308, 68)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": f"=If({SM}, 12, 16)"},
        [date_field(k, c, col) for k, c, col in FIELDS]))

    template = ("conDtTemplate", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=66",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        ("lblDtTemplateCap", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Semibold", "Height": "=22",
            "Size": "=UABSize.Secondary", "Text": '="Template"', "Wrap": "=false"})),
        ("cmbDtTemplate", ctl("ModernCombobox", {**AUTOZ,
            "DefaultSelectedItems": f"=Filter(Templates, ID = Coalesce({C}.Template.Id, 0))",
            "FillPortions": "=0", "Height": "=40",
            "ItemDisplayText": "=ThisItem.Title",
            "Items": '=SortByColumns(Templates, "Title", SortOrder.Ascending)',
            "SelectMultiple": "=false"})),
    ]))

    actions = ("conDtActions", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        ("btnDtSave", ctl("Button", {**AUTOZ,
            "Appearance": "='ButtonCanvas.Appearance'.Primary",
            "BasePaletteColor": "=UAB.Green",
            "DisplayMode": (f"=If(And({SEL} > 0, {ORDER_OK}), "
                            "DisplayMode.Edit, DisplayMode.Disabled)"),
            "FillPortions": f"=If({SM}, 1, 0)", "Height": "=40",
            "OnSelect": SAVE, "Text": '="Save dates"',
            "Width": f"=If({SM}, 130, 150)"})),
        ("btnDtApply", ctl("Button", {**AUTOZ,
            "Appearance": "='ButtonCanvas.Appearance'.Secondary",
            "BasePaletteColor": "=UAB.Green",
            "DisplayMode": (f"=If({APPLY_ENABLED}, "
                            "DisplayMode.Edit, DisplayMode.Disabled)"),
            "FillPortions": f"=If({SM}, 1, 0)", "Height": "=40",
            "OnSelect": APPLY, "Text": APPLY_TEXT,
            "Width": f"=If({SM}, 130, 190)"})),
    ]))

    hint = ("lblDtHint", ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true",
        "Color": (f"=If(And({SEL} > 0, Not({ORDER_OK})), UAB.Danger, UAB.Gray500)"),
        "FillPortions": "=0", "Height": f"=If({SM}, 44, 22)",
        "Size": "=UABSize.Secondary",
        "Text": (f"=If(And({SEL} > 0, Not({ORDER_OK})),\n"
                 '        "Check the order — each date should fall on or after the one before it.",\n'
                 f"    {HINT[1:]})"),
        "Wrap": f"=If({SM}, true, false)"}))

    return ("conDtCard", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SM}, 590, 320)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"},
        [head, grid, template, actions, hint]))


RESET = ("Set(varDtClearLOI, false);\nSet(varDtClearLOOIss, false);\n"
         "Set(varDtClearLOOAcc, false);\nSet(varDtClearStart, false)")


def splice():
    p = SRC / "scr_candidates.pa.yaml"
    lines = p.read_text().split("\n")
    text = "\n".join(lines)
    assert "conDtCard" not in text, "already spliced"

    # Selecting a different candidate must drop the per-field clear flags, or a
    # cleared date stays blank on the next record.
    old = "OnSelect: =Set(varSelCandId, ThisItem.ID)"
    n = text.count(old)
    assert n >= 3, f"expected the picker select handlers, found {n}"
    for i, line in enumerate(lines):
        if line.strip() == old:
            pad = line[:len(line) - len(line.lstrip())]
            lines[i] = (f"{pad}OnSelect: |-\n{pad}  =Set(varSelCandId, ThisItem.ID);\n"
                        + "\n".join(f"{pad}  {r}" for r in RESET.split("\n")))
    lines = "\n".join(lines).split("\n")

    i = next(k for k, l in enumerate(lines) if l.strip() == "- conTkCard:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    j = i + 1
    while j < len(lines) and (not lines[j].strip()
                              or len(lines[j]) - len(lines[j].lstrip()) > ind):
        j += 1
    name, node = build_card()
    block = emit_control(name, node, ind)
    lines[j:j] = block
    out = "\n".join(lines)
    yaml.safe_load(out)
    p.write_text(out)
    print(f"spliced conDtCard after conTkCard ({len(block)} lines); "
          f"{n} select handlers now reset the clear flags")


if __name__ == "__main__":
    splice()
