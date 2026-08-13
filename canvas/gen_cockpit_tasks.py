#!/usr/bin/env python3
"""Cockpit stage 2a: the checklist card (tasks for the selected candidate).

Splices a new card into src/scr_candidates.pa.yaml immediately after conCKHead,
inside conCKDetail. Targeted insertion — the .pa.yaml is canonical and is NOT
regenerated (see gen_cockpit.py's header).

All control names are new (Tk prefix) per the never-reuse-a-name rule.

  python3 gen_cockpit_tasks.py
"""
import pathlib

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_candidates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelCandId, 0)"

# Tasks carries denormalized StageName/StageOrder/CandName, so the checklist reads
# one list with no joins (the whole reason the schema denormalizes them).
TASK_ITEMS = (
    "=SortByColumns(\n"
    "    Filter(FirstN(Tasks, 500),\n"
    f"        Candidate.Id = {SEL},\n"
    "        (Coalesce(CountRows(cmbTkStage.SelectedItems), 0) = 0\n"
    "            || StageName in ShowColumns(cmbTkStage.SelectedItems, Title)),\n"
    "        (!tglTkOpen.Checked\n"
    '            || (TStatus.Value <> "Done" && TStatus.Value <> "Canceled"))),\n'
    '    "StageOrder", SortOrder.Ascending, "DueDate", SortOrder.Ascending)')

# Counts describe the whole candidate, never the filtered view — otherwise the
# summary changes meaning every time someone touches a filter.
TASK_COUNTS = (
    "=With(\n"
    f"    {{t: Filter(FirstN(Tasks, 500), Candidate.Id = {SEL})}},\n"
    "    With({open: Filter(t, TStatus.Value <> \"Done\" && TStatus.Value <> \"Canceled\")},\n"
    "        CountRows(t) & \" task\" & If(CountRows(t) = 1, \"\", \"s\")\n"
    "            & \"  ·  \" & CountRows(open) & \" open\"\n"
    "            & \"  ·  \" & CountRows(Filter(open, !IsBlank(DueDate) && DueDate < Today()))\n"
    "            & \" overdue\"))")

MARK_DONE = (
    "=IfError(\n"
    "    Patch(Tasks, ThisItem,\n"
    '        {TStatus: {Value: "Done"}, CompletedDate: Today(), UpdatedVia: "App"}),\n'
    '    Notify("Couldn\'t update the task - " & FirstError.Message\n'
    '        & " Nothing was changed. Try again.", NotificationType.Error),\n'
    '    Notify("Task marked done.", NotificationType.Success))')

ROW_SUB = (
    f"=If({SM},\n"
    "    TaskDueText(ThisItem.DueDate, ThisItem.PendingAnchor) & \"  ·  \"\n"
    '        & Coalesce(FriendlyName(ThisItem.Assignee.DisplayName), "Unassigned"),\n'
    '    Coalesce(ThisItem.StageName, "No stage") & "  ·  "\n'
    '        & Coalesce(FriendlyName(ThisItem.Assignee.DisplayName), "Unassigned"))')

ROW_SUB_COLOR = (
    f"=If({SM}\n"
    '        && TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor) = "Overdue",\n'
    "    UAB.Danger, UAB.Gray500)")

DONE = 'Coalesce(ThisItem.TStatus.Value, "To Do") = "Done" ' \
       '|| Coalesce(ThisItem.TStatus.Value, "") = "Canceled"'


def pill(key, width, fill, color, text):
    return (f"conTkPill{key}", con({**NOSHADOW, **AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center", "Fill": fill,
        "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "PaddingLeft": "=10", "PaddingRight": "=10",
        "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
        "RadiusTopLeft": "=999", "RadiusTopRight": "=999",
        "Width": f"={width}"}, [
        (f"lblTkPill{key}", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": color,
            "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold",
            "Height": "=18", "Size": "=12", "Text": text})),
    ]))


def col_head(key, caption, width):
    return (f"conTkCol{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Paper", "FillPortions": "=0",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, {width})"}, [
        (f"lblTkCol{key}", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray700", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Semibold", "Height": "=19",
            "Size": "=UABSize.Secondary", "Text": f'="{caption}"'})),
    ]))


def build_card():
    head = ("conTkHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        ("lblTkEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green",
            "FillPortions": "=1", "FontWeight": "=FontWeight.Bold",
            "Height": "=22", "Size": "=UABSize.Eyebrow",
            "Text": '="CHECKLIST"', "Wrap": "=false"})),
        ("lblTkCounts", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Right", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "FillPortions": "=0", "Height": "=22",
            "Size": "=UABSize.Secondary", "Text": TASK_COUNTS,
            "Width": f"=If({SM}, 190, 240)", "Wrap": "=false"})),
    ]))

    filters = ("conTkFilters", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 104, 56)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": "=12"}, [
        ("cmbTkStage", ctl("ModernCombobox", {**AUTOZ,
            "FillPortions": "=1", "Height": "=40",
            "ItemDisplayText": "=ThisItem.Title",
            "Items": '=SortByColumns(Stages, "OrderIndex", SortOrder.Ascending)',
            "SelectMultiple": "=true"})),
        ("conTkOpenWrap", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=40",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "Width": "=170"}, [
            ("tglTkOpen", ctl("Toggle", {**AUTOZ,
                "BasePaletteColor": "=UAB.Green", "Checked": "=true",
                "FillPortions": "=0", "Height": "=32",
                "Label": '="Open only"'})),
        ])),
    ]))

    col_heads = ("conTkColHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Paper", "FillPortions": "=0",
        "Height": f"=If({SM}, 0, 40)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=12",
        "PaddingLeft": "=16", "PaddingRight": "=16",
        "Visible": f"=!({SM})"}, [
        ("lblTkColTask", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Semibold", "Height": "=19",
            "Size": "=UABSize.Secondary", "Text": '="Task"'})),
        col_head("Due", "Due", 120),
        col_head("Status", "Status", 110),
        col_head("Act", "", 40),
    ]))

    row = ("conTkRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conTkRowContent", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "Height": f"=If({SM}, 71, 55)",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutGap": f"=If({SM}, 8, 12)",
            "PaddingLeft": f"=If({SM}, 12, 16)",
            "PaddingRight": f"=If({SM}, 12, 16)"}, [
            ("conTkCellMain", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=1",
                "LayoutAlignItems": "=LayoutAlignItems.Stretch",
                "LayoutDirection": "=LayoutDirection.Vertical",
                "LayoutGap": f"=If({SM}, 4, 2)",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
                ("lblTkRowTitle", ctl("ModernText", {**AUTOZ,
                    "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
                    "FontWeight": "=FontWeight.Semibold", "Height": "=25",
                    "Size": "=UABSize.Body",
                    "Text": ('=With({t: Trim(Coalesce(ThisItem.Title, ""))},\n'
                             '    If(Len(t) > 70, Trim(Left(t, 69)) & "…", t))'),
                    "Wrap": "=false"})),
                ("lblTkRowSub", ctl("ModernText", {**AUTOZ,
                    "AutoHeight": "=true", "Color": ROW_SUB_COLOR,
                    "Height": "=22", "Size": "=UABSize.Secondary",
                    "Text": ROW_SUB, "Wrap": "=false"})),
            ])),
            ("conTkCellDue", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=0",
                "LayoutDirection": "=LayoutDirection.Vertical",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 120)"}, [
                pill("Due", 120,
                     "=TaskDueFill(TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor))",
                     "=TaskDueColor(TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor))",
                     "=TaskDueText(ThisItem.DueDate, ThisItem.PendingAnchor)"),
            ])),
            ("conTkCellStatus", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=0",
                "LayoutDirection": "=LayoutDirection.Vertical",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 110)"}, [
                pill("Status", 110,
                     '=TaskStatusFill(Coalesce(ThisItem.TStatus.Value, "To Do"))',
                     '=TaskStatusColor(Coalesce(ThisItem.TStatus.Value, "To Do"))',
                     '=Coalesce(ThisItem.TStatus.Value, "To Do")'),
            ])),
            ("conTkCellAct", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=0",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Vertical",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                "Width": "=40"}, [
                # Always present (a hidden sibling would still reserve its width);
                # completed rows simply disable it.
                ("icoTkDone", ctl("Classic/Icon", {**AUTOZ,
                    "Color": f"=If({DONE}, UAB.Gray300, UAB.Green)",
                    "DisplayMode": f"=If({DONE}, DisplayMode.Disabled, DisplayMode.Edit)",
                    "Height": "=28", "Icon": "=Icon.Check", "OnSelect": MARK_DONE,
                    "Tooltip": '="Mark this task done"', "Width": "=28"})),
            ])),
        ])),
        ("conTkRowDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galTkTasks", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Items": TASK_ITEMS,
        "TemplatePadding": "=0", "TemplateSize": f"=If({SM}, 72, 56)"},
        [row], variant="Vertical"))

    empty = ("conTkEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(galTkTasks.AllItemsCount = 0, 56, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galTkTasks.AllItemsCount = 0"}, [
        ("lblTkEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "Height": "=25", "Size": "=UABSize.Body",
            "Text": ('=If(tglTkOpen.Checked\n'
                     '        || Coalesce(CountRows(cmbTkStage.SelectedItems), 0) > 0,\n'
                     '    "No tasks match these filters.",\n'
                     '    "No tasks yet — apply a template to build the checklist.")')})),
    ]))

    return ("conTkCard", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SM}, 620, 560)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"},
        [head, filters, col_heads, gallery, empty]))


def splice():
    p = SRC / "scr_candidates.pa.yaml"
    lines = p.read_text().split("\n")
    assert "conTkCard" not in "\n".join(lines), "already spliced"
    i = next(n for n, l in enumerate(lines) if l.strip() == "- conCKHead:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    j = i + 1
    while j < len(lines) and (not lines[j].strip()
                              or len(lines[j]) - len(lines[j].lstrip()) > ind):
        j += 1
    name, node = build_card()
    lines[j:j] = emit_control(name, node, ind)
    text = "\n".join(lines)
    yaml.safe_load(text)          # parse BEFORE writing
    p.write_text(text)
    print(f"spliced conTkCard after conCKHead ({len(emit_control(name, node, ind))} lines)")


if __name__ == "__main__":
    splice()
