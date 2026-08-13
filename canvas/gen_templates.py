#!/usr/bin/env python3
"""Screen 4: Templates editor (stage A — browse, inspect, readiness, activate).

Replaces the stub body of scr_templates. All names new (Tp prefix).

HR is not going to open SharePoint lists, so this screen has to answer three
questions on its own: what does this template contain, is it safe to use, and
how do I turn it on. Editing individual tasks comes in stage B.

  python3 gen_templates.py
"""
import pathlib

import yaml

from gen_app import (AUTOZ, NOSHADOW, con, ctl, emit_screen, nav_rail,
                     content_root)

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_templates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelTemplateId, 0)"
T = f"LookUp(Templates, ID = {SEL})"
TASKS = f"Filter(TemplateTasks, Template.Id = {SEL})"
STAGES = f"Filter(TemplateStages, Template.Id = {SEL})"

# Readiness reads a snapshot captured when the template is selected. Querying
# TemplateTasks live in every check meant ~112 delegation warnings and a dozen
# re-queries per render on a 44-task template.
S = "Coalesce(varTpStats, {stages: 0, tasks: 0, unnamed: 0, stageless: 0, fixedNoDate: 0, prereqs: 0, approvals: 0})"

STATS = (
    "Set(varTpStats,\n"
    "    With({t: Filter(TemplateTasks, Template.Id = ThisItem.ID)},\n"
    "        {stages: CountRows(Filter(TemplateStages, Template.Id = ThisItem.ID)),\n"
    "         tasks: CountRows(t),\n"
    "         unnamed: CountRows(Filter(t, IsBlank(Trim(Title)))),\n"
    "         stageless: CountRows(Filter(t, IsBlank(TemplateStage.Id))),\n"
    '         fixedNoDate: CountRows(Filter(t, Anchor.Value = "Fixed", IsBlank(FixedDate))),\n'
    "         prereqs: CountRows(Filter(t, IsPrereq)),\n"
    "         approvals: CountRows(Filter(t, NeedsApproval))}))")

PICK = f"=Set(varSelTemplateId, ThisItem.ID);\n{STATS}"

# Each rule is a thing that breaks a real hire if it is wrong when F1 expands.
CHECKS = [
    ("Stages", f"{S}.stages > 0",
     '"At least one stage"',
     f'{S}.stages & If({S}.stages = 1, " Stage", " Stages")',
     '"No stages — add stages before activating"'),
    ("Tasks", f"{S}.tasks > 0",
     '"At least one task"',
     f'{S}.tasks & If({S}.tasks = 1, " Task", " Tasks")',
     '"No tasks — this template would create an empty checklist"'),
    ("Titles", f"{S}.unnamed = 0",
     '"Every task is named"',
     '"All Tasks Named"',
     f'{S}.unnamed & " tasks have no name"'),
    ("Stageless", f"{S}.stageless = 0",
     '"Every task sits in a stage"',
     '"All Tasks Assigned to a Stage"',
     f'{S}.stageless & " tasks are not in a stage"'),
    ("Fixed", f"{S}.fixedNoDate = 0",
     '"Fixed-date tasks have a date"',
     '"Fixed Dates Present"',
     f'{S}.fixedNoDate & " fixed-date tasks have no date"'),
]

READY = "And(\n    " + ",\n    ".join(c[1] for c in CHECKS) + ")"


def pill(key, width, fill, color, text, visible=None):
    props = {**NOSHADOW, **AUTOZ,
             "AlignInContainer": "=AlignInContainer.Center", "Fill": fill,
             "FillPortions": "=0", "Height": "=24",
             "LayoutAlignItems": "=LayoutAlignItems.Center",
             "LayoutDirection": "=LayoutDirection.Horizontal",
             "LayoutJustifyContent": "=LayoutJustifyContent.Center",
             "PaddingLeft": "=10", "PaddingRight": "=10",
             "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
             "RadiusTopLeft": "=999", "RadiusTopRight": "=999",
             "Width": f"={width}"}
    if visible:
        props["Visible"] = visible
    return (f"conTpPill{key}", con(props, [
        (f"lblTpPill{key}", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": color,
            "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold",
            "Height": "=18", "Size": "=12", "Text": text})),
    ]))


def picker_panel():
    row = ("conTpPickRow", con({**NOSHADOW, **AUTOZ,
        "Fill": f"=If(ThisItem.ID = {SEL}, UAB.GoldTint, UAB.White)",
        "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conTpPickRowContent", con({**NOSHADOW, **AUTOZ,
            "Fill": f"=If(ThisItem.ID = {SEL}, UAB.GoldTint, UAB.White)",
            "FillPortions": "=0", "Height": "=63",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "PaddingLeft": "=12", "PaddingRight": "=12"}, [
            ("conTpPickRowMain", con({**NOSHADOW, **AUTOZ,
                "Fill": f"=If(ThisItem.ID = {SEL}, UAB.GoldTint, UAB.White)",
                "FillPortions": "=1",
                "LayoutAlignItems": "=LayoutAlignItems.Stretch",
                "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=2",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
                ("lblTpPickName", ctl("Label", {**AUTOZ,
                    "Color": "=UAB.TextPrimary", "Font": "=Font.Arial",
                    "FontWeight": "=FontWeight.Semibold", "Height": "=25",
                    "OnSelect": PICK,
                    "PaddingBottom": "=0", "PaddingLeft": "=0",
                    "PaddingRight": "=0", "PaddingTop": "=0",
                    "Size": "=UABSize.Body",
                    "Text": '=Coalesce(ThisItem.Title, "(untitled)")',
                    "Wrap": "=false"})),
                ("lblTpPickSub", ctl("Label", {**AUTOZ,
                    "Color": "=UAB.Gray500", "Font": "=Font.Arial", "Height": "=22",
                    "OnSelect": PICK,
                    "PaddingBottom": "=0", "PaddingLeft": "=0",
                    "PaddingRight": "=0", "PaddingTop": "=0",
                    "Size": "=UABSize.Secondary",
                    "Text": ('=Coalesce(ThisItem.CandidateType.Value, "Any type")\n'
                             '    & "  ·  " & Coalesce(ThisItem.TStatus.Value, "Draft")'),
                    "Wrap": "=false"})),
            ])),
            ("icoTpPickGo", ctl("Classic/Icon", {**AUTOZ,
                "Color": "=UAB.Gray300", "Height": "=20",
                "Icon": "=Icon.ChevronRight",
                "OnSelect": PICK, "Width": "=20"})),
        ])),
        ("conTpPickRowDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galTpTemplates", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1",
        "Items": '=SortByColumns(Templates, "Title", SortOrder.Ascending)',
        "OnSelect": PICK,
        "TemplatePadding": "=0", "TemplateSize": "=64"},
        [row], variant="Vertical"))

    return ("conTpPicker", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": f"=If({SM}, 300, Parent.Height)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": f"=If({SM}, Parent.Width, 300)"}, [gallery]))


def header_card():
    return ("conTpHead", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SM}, 240, 200)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"}, [
        ("lblTpEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Bold", "Height": "=22",
            "Size": "=UABSize.Eyebrow", "Text": '="TEMPLATE"', "Wrap": "=false"})),
        ("lblTpName", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Semibold", "Height": "=38", "Size": "=24",
            "Text": f'=Coalesce({T}.Title, "")', "Wrap": "=false"})),
        ("conTpPillRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=28",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            pill("Status", 100,
                 f'=TemplateStatusFill(Coalesce({T}.TStatus.Value, "Draft"))',
                 f'=TemplateStatusColor(Coalesce({T}.TStatus.Value, "Draft"))',
                 f'=Coalesce({T}.TStatus.Value, "Draft")'),
            pill("Type", 150, "=UAB.Paper", "=UAB.Gray700",
                 f'=Coalesce({T}.CandidateType.Value, "Any Type")'),
            pill("Ready", 130,
                 f"=If({READY}, UAB.SuccessTint, UAB.DangerTint)",
                 f"=If({READY}, UAB.SuccessText, UAB.Danger)",
                 f'=If({READY}, "Ready to Use", "Needs Attention")'),
        ])),
        ("lblTpCounts", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "FillPortions": "=0",
            "Height": "=22", "Size": "=UABSize.Secondary",
            "Text": (f'={S}.stages & " stages  ·  "\n'
                     f'    & {S}.tasks & " tasks  ·  "\n'
                     f'    & {S}.prereqs & " prerequisites  ·  "\n'
                     f'    & {S}.approvals & " need approval"'),
            "Wrap": "=false"})),
    ]))


def checks_card():
    children = [("lblTpChecksEyebrow", ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=0",
        "FontWeight": "=FontWeight.Bold", "Height": "=22",
        "Size": "=UABSize.Eyebrow", "Text": '="READINESS"', "Wrap": "=false"}))]

    for key, cond, label, ok_text, bad_text in CHECKS:
        children.append((f"conTpChk{key}", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=26",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            (f"icoTpChk{key}", ctl("Classic/Icon", {**AUTOZ,
                "Color": f"=If({cond}, UAB.SuccessText, UAB.Danger)",
                "FillPortions": "=0", "Height": "=18",
                "Icon": f"=If({cond}, Icon.Check, Icon.Cancel)", "Width": "=18"})),
            (f"lblTpChk{key}", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true",
                "Color": f"=If({cond}, UAB.Gray700, UAB.Danger)",
                "FillPortions": "=1", "Height": "=22", "Size": "=UABSize.Secondary",
                "Text": f"=If({cond}, {ok_text}, {bad_text})", "Wrap": "=false"})),
        ])))

    activate = (
        "=IfError(\n"
        f"    Patch(Templates, {T},\n"
        f'        {{TStatus: {{Value: If(Coalesce({T}.TStatus.Value, "Draft") = "Active",\n'
        '            "Draft", "Active")}}),\n'
        '    Notify("Couldn\'t change the template - " & FirstError.Message\n'
        '        & " Nothing was changed. Try again.", NotificationType.Error),\n'
        f'    Notify(If(Coalesce({T}.TStatus.Value, "Draft") = "Active",\n'
        '        "Template activated. It can now be used for new candidates.",\n'
        '        "Template set back to draft."), NotificationType.Success))')

    children.append(("conTpActions", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        ("btnTpActivate", ctl("Button", {**AUTOZ,
            "Appearance": "='ButtonCanvas.Appearance'.Primary",
            "BasePaletteColor": "=UAB.Green",
            # only a ready template may be switched on; switching off is always allowed
            "DisplayMode": (f'=If(Coalesce({T}.TStatus.Value, "Draft") = "Active" '
                            f"|| {READY}, DisplayMode.Edit, DisplayMode.Disabled)"),
            "FillPortions": f"=If({SM}, 1, 0)", "Height": "=40",
            "OnSelect": activate,
            "Text": (f'=If(Coalesce({T}.TStatus.Value, "Draft") = "Active",\n'
                     '    "Set Back to Draft", "Activate Template")'),
            "Width": f"=If({SM}, 180, 190)"})),
        ("lblTpActionHint", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "FillPortions": "=1",
            "Height": "=22", "Size": "=UABSize.Secondary",
            "Text": (f'=If(Coalesce({T}.TStatus.Value, "Draft") = "Active",\n'
                     '    "In use for new candidates.",\n'
                     f"    {READY},\n"
                     '    "Everything checks out — activate when you are ready.",\n'
                     '    "Fix the items above before activating.")'),
            "Wrap": "=false"})),
    ])))

    return ("conTpChecks", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SM}, 285, 300)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"}, children))


def tasks_card():
    head = ("conTpTasksHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=26",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        ("lblTpTasksEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Bold", "Height": "=22",
            "Size": "=UABSize.Eyebrow", "Text": '="TASKS IN THIS TEMPLATE"',
            "Wrap": "=false"})),
    ]))

    row = ("conTpTaskRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conTpTaskRowContent", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=63",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "PaddingLeft": "=4", "PaddingRight": "=4"}, [
            ("conTpTaskMain", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=1",
                "LayoutAlignItems": "=LayoutAlignItems.Stretch",
                "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=2",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
                ("lblTpTaskTitle", ctl("ModernText", {**AUTOZ,
                    "AutoHeight": "=true",
                    "Color": ('=If(IsBlank(Trim(ThisItem.Title)), UAB.Danger, '
                              "UAB.TextPrimary)"),
                    "Height": "=25", "Size": "=UABSize.Body",
                    "Text": '=Coalesce(Trim(ThisItem.Title), "(unnamed task)")',
                    "Wrap": "=false"})),
                ("lblTpTaskSub", ctl("ModernText", {**AUTOZ,
                    "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=22",
                    "Size": "=UABSize.Secondary",
                    "Text": ('=Coalesce(ThisItem.TemplateStage.Value, "No stage")\n'
                             '    & "  ·  " & Coalesce(ThisItem.AssigneeRole.Value, "No role")\n'
                             '    & If(Coalesce(ThisItem.Anchor.Value, "None") = "None", "",\n'
                             '        "  ·  " & ThisItem.Anchor.Value\n'
                             '            & If(Coalesce(ThisItem.OffsetDays, 0) = 0, "",\n'
                             '                " " & If(ThisItem.OffsetDays > 0, "+", "")\n'
                             '                    & ThisItem.OffsetDays & "d"))'),
                    "Wrap": "=false"})),
            ])),
            ("conTpTaskFlags", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=0",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=6",
                "Width": "=210"}, [
                pill("Prereq", 100, "=UAB.InfoTint", "=UAB.InfoText",
                     '="Prerequisite"', visible="=ThisItem.IsPrereq"),
                pill("Appr", 100, "=UAB.GoldTint", "=UAB.GoldText",
                     '="Approval"', visible="=ThisItem.NeedsApproval"),
            ])),
        ])),
        ("conTpTaskDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galTpTasks", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1",
        "Items": ("=SortByColumns(\n"
                  f"    {TASKS},\n"
                  '    "OrderIndex", SortOrder.Ascending)'),
        "TemplatePadding": "=0", "TemplateSize": "=64"},
        [row], variant="Vertical"))

    empty = ("conTpTasksEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(galTpTasks.AllItemsCount = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galTpTasks.AllItemsCount = 0"}, [
        ("lblTpTasksEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": "=UAB.Gray500",
            "Height": "=25", "Size": "=UABSize.Body",
            "Text": '="This template has no tasks yet."'})),
    ]))

    # Hug the row count so a short template does not leave a field of white.
    return ("conTpTasksCard", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": (f"=With({{n: {S}.tasks}},\n"
                   f"    If({SM}, 82, 90) + Min(n, 8) * 64 + If(n = 0, 44, 0))"),
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"}, [head, gallery, empty]))


def build():
    header = ("cntTpHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=84",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        ("lblTpTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": '="Templates"'})),
        ("lblTpSub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=22",
            "Size": "=UABSize.Secondary",
            "Text": ('="A template is the checklist a new candidate starts with. '
                     'Only active templates can be used."'),
            "Wrap": "=false"})),
    ]))

    no_sel = ("conTpNoSelection", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SEL} = 0, 120, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": f"={SEL} = 0"}, [
        ("lblTpNoSelection", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": "=UAB.Gray500",
            "Height": "=25", "Size": "=UABSize.Body",
            "Text": '="Select a template to see what it contains."'})),
    ]))

    detail = ("conTpDetail", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=1", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=16",
        "LayoutOverflowY": "=LayoutOverflow.Scroll"},
        [no_sel, header_card(), checks_card(), tasks_card()]))

    split = ("conTpSplit", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 1400, Max(620, scr_templates.Height - 140))",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": "=16"},
        [picker_panel(), detail]))

    spacer = ("lblTpSpacer", ctl("ModernText", {**AUTOZ,
        "Align": "=Align.Center", "Color": "=UAB.OffWhite", "Height": "=24",
        "Size": "=2", "Text": '=""', "Wrap": "=false"}))

    return emit_screen("scr_templates", {"Fill": "=UAB.OffWhite"},
                       [nav_rail("scr_templates"),
                        content_root("scr_templates", "cntTemplatesRoot",
                                     [header, split, spacer])])


APP_ADD = """;
TemplateStatusColor(s: Text): Color = Switch(Coalesce(s, ""), "Active", UAB.SuccessText, "Archived", UAB.Gray500, UAB.Gray700);
TemplateStatusFill(s: Text): Color = Switch(Coalesce(s, ""), "Active", UAB.SuccessTint, "Archived", UAB.Paper, UAB.GoldTint)"""


def splice_app():
    p = SRC / "App.pa.yaml"
    t = p.read_text()
    if "TemplateStatusColor" in t:
        print("App.pa.yaml already has the template pill UDFs")
        return
    anchor = ('TaskDueFill(bucket: Text): Color = Switch(Coalesce(bucket, ""), '
              '"Overdue", UAB.DangerTint, "Soon", UAB.GoldTint, "Pending", '
              "UAB.InfoTint, UAB.Paper)")
    assert anchor in t
    t = t.replace(anchor, anchor + APP_ADD.replace("\n", "\n      "))
    yaml.safe_load(t)
    p.write_text(t)
    print("App.pa.yaml: template status pill UDFs added")


if __name__ == "__main__":
    text = build()
    yaml.safe_load(text)
    (SRC / "scr_templates.pa.yaml").write_text(text)
    print(f"wrote scr_templates.pa.yaml ({len(text.splitlines())} lines)")
    splice_app()
