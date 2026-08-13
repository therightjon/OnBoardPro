#!/usr/bin/env python3
"""Emit the OnBoardPro canvas app source (.pa.yaml) into canvas/src/.

Generator-authored per the playbook (hand-editing 1000-line screens is how
indentation bugs happen). Emits App.pa.yaml plus four screens:

  scr_mytasks        - My Tasks (full build: twin-gallery + pager + filters)
  scr_candidates     - stub (cockpit comes next)
  scr_new_candidate  - stub (wizard)
  scr_templates      - stub (template editor)

Every file is yaml.safe_load-validated before it is written. Run:

  python3 gen_app.py
"""
import sys
from pathlib import Path

import yaml

OUT = Path(__file__).parent / "src"

# ---------------------------------------------------------------- emitter


def needs_block(v):
    # A plain YAML scalar dies at any ": " (or "#"); formulas with record
    # literals or With() bindings therefore need the |- block form.
    return ": " in v or "#" in v or "\n" in v


def emit_props(props, pad):
    out = []
    for k in sorted(props):
        v = props[k]
        if needs_block(v):
            out.append(f"{pad}{k}: |-")
            for line in v.split("\n"):
                out.append(f"{pad}  {line}")
        else:
            out.append(f"{pad}{k}: {v}")
    return out


def emit_control(name, node, indent):
    pad = " " * indent
    out = [f"{pad}- {name}:"]
    body = pad + "    "
    out.append(f"{body}Control: {node['Control']}")
    if "Variant" in node:
        out.append(f"{body}Variant: {node['Variant']}")
    if node.get("Properties"):
        out.append(f"{body}Properties:")
        out += emit_props(node["Properties"], body + "  ")
    if node.get("Children"):
        out.append(f"{body}Children:")
        for child_name, child in node["Children"]:
            out += emit_control(child_name, child, indent + 6)
    return out


def emit_screen(screen_name, props, children):
    out = ["Screens:", f"  {screen_name}:", "    Properties:"]
    out += emit_props(props, "      ")
    out.append("    Children:")
    for name, node in children:
        out += emit_control(name, node, 6)
    return "\n".join(out) + "\n"


def con(props, children=None, variant="AutoLayout"):
    node = {"Control": "GroupContainer", "Variant": variant, "Properties": props}
    if children:
        node["Children"] = children
    return node


def ctl(control, props, children=None, variant=None):
    node = {"Control": control, "Properties": props}
    if variant:
        node["Variant"] = variant
    if children:
        node["Children"] = children
    return node


AUTOZ = {"LayoutMinHeight": "=0", "LayoutMinWidth": "=0"}
NOSHADOW = {"DropShadow": "=DropShadow.None"}


# ---------------------------------------------------------------- nav rail

SCREENS = {
    "scr_mytasks": "MyTasks",
    "scr_candidates": "Candidates",
    "scr_new_candidate": "NewCand",
    "scr_templates": "Templates",
}
NAV_ITEMS = [
    # key, label, icon, target screen, extra active screens, visible formula
    ("MyTasks", "My Tasks", "Icon.Check", "scr_mytasks", [], None),
    ("Candidates", "Candidates", "Icon.People", "scr_candidates", [], "=IsManagerOrHR"),
    ("NewCand", "New Candidate", "Icon.Add", "scr_new_candidate", [], "=IsHR"),
    ("Templates", "Templates", "Icon.DocumentWithContent", "scr_templates", [], "=IsHR"),
]


def rail_width(screen):
    return (f"=If({screen}.Size = ScreenSize.Small, "
            "UABLayout.NavRailWidthCollapsed, UABLayout.NavRailWidth)")


def nav_item(screen, suffix, key, label, icon, target, extra, visible):
    actives = " || ".join([f"App.ActiveScreen = {t}" for t in [target] + extra])
    active_fill = f"=If({actives}, UAB.Gold, RGBA(0, 0, 0, 0))"
    active_color = f"=If({actives}, UAB.White, UAB.NavInactive)"
    active_weight = f"=If({actives}, FontWeight.Semibold, FontWeight.Normal)"
    item_props = {**NOSHADOW, **AUTOZ,
                  "Fill": "=UAB.Green", "FillPortions": "=0", "Height": "=48",
                  "LayoutAlignItems": "=LayoutAlignItems.Center",
                  "LayoutDirection": "=LayoutDirection.Horizontal"}
    if visible:
        item_props["Visible"] = visible
    return (f"conNav{key}_{suffix}", con(item_props, [
        (f"conNavBar{key}_{suffix}", con({**NOSHADOW, **AUTOZ,
            "Fill": active_fill, "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Horizontal", "Width": "=4"})),
        (f"icoNav{key}_{suffix}", ctl("Classic/Icon", {**AUTOZ,
            "AlignInContainer": "=AlignInContainer.Center",
            "Color": active_color, "Height": "=44", "Icon": f"={icon}",
            "OnSelect": f"=Navigate({target})", "PaddingLeft": "=12",
            "Width": "=44"})),
        (f"lblNav{key}_{suffix}", ctl("Label", {**AUTOZ,
            "AlignInContainer": "=AlignInContainer.Stretch",
            "Color": active_color, "FillPortions": "=1", "Font": "=Font.Arial",
            "FontWeight": active_weight, "OnSelect": f"=Navigate({target})",
            "PaddingBottom": "=0", "PaddingLeft": "=8", "PaddingRight": "=0",
            "PaddingTop": "=0", "Size": "=UABSize.Body", "Text": f'="{label}"',
            "Visible": f"={screen}.Size <> ScreenSize.Small",
            "Wrap": "=false"})),
    ]))


def nav_rail(screen):
    suffix = SCREENS[screen]
    children = [
        (f"lblAppName_{suffix}", ctl("Label", {**AUTOZ,
            "AlignInContainer": "=AlignInContainer.Stretch", "Color": "=UAB.White",
            "Font": "=Font.Arial", "FontWeight": "=FontWeight.Bold", "Height": "=56",
            "PaddingBottom": "=0", "PaddingLeft": "=20", "PaddingRight": "=0",
            "PaddingTop": "=0", "Size": "=20", "Text": '="OnBoardPro"',
            "Visible": f"={screen}.Size <> ScreenSize.Small", "Wrap": "=false"})),
        (f"lblAppSub_{suffix}", ctl("Label", {**AUTOZ,
            "AlignInContainer": "=AlignInContainer.Stretch", "Color": "=UAB.Gold",
            "Font": "=Font.Arial", "Height": "=24",
            "PaddingBottom": "=0", "PaddingLeft": "=20", "PaddingRight": "=0",
            "PaddingTop": "=0", "Size": "=11", "Text": '="OBGYN Onboarding"',
            "Visible": f"={screen}.Size <> ScreenSize.Small", "Wrap": "=false"})),
    ]
    for key, label, icon, target, extra, visible in NAV_ITEMS:
        children.append(nav_item(screen, suffix, key, label, icon, target, extra, visible))
    return (f"NavRail_{suffix}", con({**NOSHADOW,
        "Fill": "=UAB.Green", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4",
        "PaddingBottom": "=32", "PaddingTop": "=32",
        "Width": rail_width(screen)}, children))


def content_root(screen, name, children):
    w = rail_width(screen)[1:]  # strip leading =
    side_pad = f"=If({screen}.Size = ScreenSize.Small, 12, 24)"
    return (name, con({**NOSHADOW,
        "Fill": "=UAB.OffWhite", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=16",
        "LayoutOverflowY": "=LayoutOverflow.Scroll",
        "PaddingBottom": "=24", "PaddingLeft": side_pad, "PaddingRight": side_pad,
        "PaddingTop": "=24",
        "Width": f"=Parent.Width - {w}", "X": f"={w}"}, children))


# ---------------------------------------------------------------- pills


def pill(name_suffix, width, fill, color, text):
    return (f"conPill{name_suffix}", con({**NOSHADOW, **AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center", "Fill": fill,
        "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "PaddingLeft": "=10", "PaddingRight": "=10",
        "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
        "RadiusTopLeft": "=999", "RadiusTopRight": "=999",
        "Width": f"={width}"}, [
        (f"lblPill{name_suffix}", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": color,
            "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold",
            "Height": "=18", "Size": "=12", "Text": text})),
    ]))


# ---------------------------------------------------------------- My Tasks

SIZE = 8  # rows per page
SM = "scr_mytasks.Size = ScreenSize.Small"  # phone breakpoint (< 600)

MT_FILTER = (
    "=SortByColumns(\n"
    "    Filter(FirstN(Tasks, 500),\n"
    "        (Assignee.Email = User().Email\n"
    "            || (IsHR && IsBlank(Assignee) && AssigneeRole.Value = \"HR\")),\n"
    "        TStatus.Value <> \"Done\" && TStatus.Value <> \"Canceled\",\n"
    "        Coalesce(varMyTasksFilter, \"All\") = \"All\"\n"
    "            || (varMyTasksFilter = \"Overdue\" && !IsBlank(DueDate) && DueDate < Today())\n"
    "            || (varMyTasksFilter = \"Week\" && !IsBlank(DueDate) && DueDate <= Today() + 7)),\n"
    "    \"DueDate\", SortOrder.Ascending)")

MT_WINDOW = (
    "=With({t: galMyTasksAll.AllItems, n: galMyTasksAll.AllItemsCount},\n"
    f"    FirstN(LastN(t, n - (Min(Coalesce(varMyTasksPage, 1), Max(1, RoundUp(n / {SIZE}, 0))) - 1) * {SIZE}), {SIZE}))")

MT_PAGES = f"Max(1, RoundUp(galMyTasksAll.AllItemsCount / {SIZE}, 0))"

MT_SUB = (
    "=With({t: Filter(FirstN(Tasks, 500),\n"
    "        (Assignee.Email = User().Email\n"
    "            || (IsHR && IsBlank(Assignee) && AssigneeRole.Value = \"HR\")),\n"
    "        TStatus.Value <> \"Done\" && TStatus.Value <> \"Canceled\")},\n"
    "    CountRows(t) & \" open task\" & If(CountRows(t) = 1, \"\", \"s\")\n"
    "        & \" · \" & CountRows(Filter(t, !IsBlank(DueDate) && DueDate < Today())) & \" overdue\")")

MT_DONE = (
    "=IfError(\n"
    "    Patch(Tasks, ThisItem,\n"
    "        {TStatus: {Value: \"Done\"}, CompletedDate: Today(), UpdatedVia: \"App\"}),\n"
    "    Notify(\"Couldn't update the task - \" & FirstError.Message\n"
    "        & \" Nothing was changed. Try again.\", NotificationType.Error),\n"
    "    Notify(\"Task marked done.\", NotificationType.Success))")


def mt_filter_button(key, label, filter_val, small_label=None):
    text = (f'=If({SM}, "{small_label}", "{label}")' if small_label
            else f'="{label}"')
    return (f"btnMTFilter{key}", ctl("Button", {**AUTOZ,
        "Appearance": (f"=If(Coalesce(varMyTasksFilter, \"All\") = \"{filter_val}\", "
                       "'ButtonCanvas.Appearance'.Primary, 'ButtonCanvas.Appearance'.Secondary)"),
        "BasePaletteColor": "=UAB.Green", "FillPortions": "=0", "Height": "=36",
        "OnSelect": f"=Set(varMyTasksFilter, \"{filter_val}\");\nSet(varMyTasksPage, 1)",
        "Text": text, "Width": f"=If({SM}, 96, 130)"}))


def mytasks_screen():
    header = ("cntMTHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=76",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        ("lblMTTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": '="My Tasks"'})),
        ("lblMTSub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=20",
            "Size": "=UABSize.Secondary", "Text": MT_SUB})),
    ]))

    filters = ("conMTFilterRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=44",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        mt_filter_button("All", "All open", "All", small_label="All"),
        mt_filter_button("Overdue", "Overdue", "Overdue"),
        mt_filter_button("Week", "Due in 7 days", "Week", small_label="7 days"),
    ]))

    header_row = ("conMTHeaderRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Paper", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)",
        "PaddingRight": f"=If({SM}, 12, 16)"}, [
        ("lblMTColTask", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Semibold", "Height": "=18",
            "Size": "=UABSize.Secondary", "Text": '="Task"'})),
        ("conMTColDue", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Paper", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 120)"}, [
            ("lblMTColDue", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
                "FontWeight": "=FontWeight.Semibold", "Height": "=18",
                "Size": "=UABSize.Secondary", "Text": '="Due"'})),
        ])),
        ("conMTColStatus", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Paper", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 110)"}, [
            ("lblMTColStatus", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
                "FontWeight": "=FontWeight.Semibold", "Height": "=18",
                "Size": "=UABSize.Secondary", "Text": '="Status"'})),
        ])),
        ("conMTColAction", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Paper", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Horizontal", "Width": "=40"}, [
            ("lblMTColAction", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
                "FontWeight": "=FontWeight.Semibold", "Height": "=18",
                "Size": "=UABSize.Secondary", "Text": '=""'})),
        ])),
    ]))

    twin = ("galMyTasksAll", ctl("Gallery", {**AUTOZ,
        "FillPortions": "=0", "Height": "=56", "Items": MT_FILTER,
        "ShowScrollbar": "=false", "TemplatePadding": "=0", "TemplateSize": "=56",
        "Visible": "=false"}, [
        ("lblMTAllStub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Height": "=18", "Text": '=""'})),
    ], variant="Vertical"))

    # On phone the Due/Status columns collapse, so the subline absorbs the due
    # text (and turns red when overdue).
    row_sub = (
        f'=If({SM},\n'
        '    TaskDueText(ThisItem.DueDate, ThisItem.PendingAnchor) & "  ·  ", "")\n'
        '    & Coalesce(ThisItem.CandName, "") & "  ·  " & Coalesce(ThisItem.StageName, "")\n'
        '    & If(Coalesce(ThisItem.Priority.Value, "") = "High"\n'
        '            || Coalesce(ThisItem.Priority.Value, "") = "Critical",\n'
        '        "  ·  " & ThisItem.Priority.Value & " priority", "")')
    row_sub_color = (
        f'=If({SM}\n'
        '        && TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor) = "Overdue",\n'
        '    UAB.Danger, UAB.Gray500)')
    row_title = (
        '=With({t: Trim(Coalesce(ThisItem.Title, ""))},\n'
        '    If(Len(t) > 70, Trim(Left(t, 69)) & "…", t))')

    gallery = ("galMyTasks", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=Max(56, Min(galMyTasksAll.AllItemsCount, {SIZE}) * 56)",
        "Items": MT_WINDOW, "ShowScrollbar": "=false", "TemplatePadding": "=0",
        "TemplateSize": "=56"}, [
        ("conMTRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "Width": "=Parent.TemplateWidth"}, [
            ("conMTRowContent", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=55",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Horizontal",
                "LayoutGap": f"=If({SM}, 8, 12)",
                "PaddingLeft": f"=If({SM}, 12, 16)",
                "PaddingRight": f"=If({SM}, 12, 16)"}, [
                ("conMTCellMain", con({**NOSHADOW, **AUTOZ,
                    "Fill": "=UAB.White", "FillPortions": "=1",
                    "LayoutAlignItems": "=LayoutAlignItems.Stretch",
                    "LayoutDirection": "=LayoutDirection.Vertical",
                    "LayoutGap": "=2",
                    "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
                    ("lblMTRowTitle", ctl("ModernText", {**AUTOZ,
                        "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
                        "FontWeight": "=FontWeight.Semibold", "Height": "=20",
                        "Size": "=UABSize.Body", "Text": row_title,
                        "Wrap": "=false"})),
                    ("lblMTRowSub", ctl("ModernText", {**AUTOZ,
                        "AutoHeight": "=true", "Color": row_sub_color,
                        "Height": "=18", "Size": "=UABSize.Secondary",
                        "Text": row_sub, "Wrap": "=false"})),
                ])),
                ("conMTCellDue", con({**NOSHADOW, **AUTOZ,
                    "Fill": "=UAB.White", "FillPortions": "=0",
                    "LayoutDirection": "=LayoutDirection.Vertical",
                    "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                    "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 120)"}, [
                    pill("MTDue", 120,
                         "=TaskDueFill(TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor))",
                         "=TaskDueColor(TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor))",
                         "=TaskDueText(ThisItem.DueDate, ThisItem.PendingAnchor)"),
                ])),
                ("conMTCellStatus", con({**NOSHADOW, **AUTOZ,
                    "Fill": "=UAB.White", "FillPortions": "=0",
                    "LayoutDirection": "=LayoutDirection.Vertical",
                    "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                    "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 110)"}, [
                    pill("MTStatus", 110,
                         '=TaskStatusFill(Coalesce(ThisItem.TStatus.Value, "To Do"))',
                         '=TaskStatusColor(Coalesce(ThisItem.TStatus.Value, "To Do"))',
                         '=Coalesce(ThisItem.TStatus.Value, "To Do")'),
                ])),
                ("conMTCellAction", con({**NOSHADOW, **AUTOZ,
                    "Fill": "=UAB.White", "FillPortions": "=0",
                    "LayoutAlignItems": "=LayoutAlignItems.Center",
                    "LayoutDirection": "=LayoutDirection.Vertical",
                    "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                    "Width": "=40"}, [
                    ("icoMTDone", ctl("Classic/Icon", {**AUTOZ,
                        "Color": "=UAB.Green", "Height": "=28",
                        "Icon": "=Icon.Check", "OnSelect": MT_DONE,
                        "Tooltip": '="Mark this task done"', "Width": "=28"})),
                ])),
            ])),
            ("conMTRowDivider", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
        ])),
    ], variant="Vertical"))

    empty = ("conMTEmptyRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=56",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galMyTasksAll.AllItemsCount = 0"}, [
        ("lblMTEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": "=UAB.Gray500",
            "Height": "=20", "Size": "=UABSize.Body",
            "Text": ('=If(Coalesce(varMyTasksFilter, "All") = "All",\n'
                     '    "Nothing on your plate — no open tasks.",\n'
                     '    "No tasks match this filter.")')})),
    ]))

    pager = ("conPagerMT", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=12",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": f"=galMyTasksAll.AllItemsCount > {SIZE}"}, [
        ("icoPagerPrevMT", ctl("Classic/Icon", {**AUTOZ,
            "Color": "=If(Coalesce(varMyTasksPage, 1) <= 1, UAB.Gray300, UAB.Green)",
            "DisplayMode": ("=If(Coalesce(varMyTasksPage, 1) <= 1, "
                            "DisplayMode.Disabled, DisplayMode.Edit)"),
            "Height": "=24", "Icon": "=Icon.ChevronLeft",
            "OnSelect": (f"=Set(varMyTasksPage, Max(1, Min(Coalesce(varMyTasksPage, 1), "
                         f"{MT_PAGES}) - 1))"),
            "Width": "=24"})),
        ("lblPagerMT", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": "=UAB.Gray700",
            "Height": "=18", "Size": "=UABSize.Secondary",
            "Text": (f'="Page " & Min(Coalesce(varMyTasksPage, 1), {MT_PAGES})'
                     f' & " of " & {MT_PAGES}'),
            "Width": "=110"})),
        ("icoPagerNextMT", ctl("Classic/Icon", {**AUTOZ,
            "Color": (f"=If(Coalesce(varMyTasksPage, 1) >= {MT_PAGES}, "
                      "UAB.Gray300, UAB.Green)"),
            "DisplayMode": (f"=If(Coalesce(varMyTasksPage, 1) >= {MT_PAGES}, "
                            "DisplayMode.Disabled, DisplayMode.Edit)"),
            "Height": "=24", "Icon": "=Icon.ChevronRight",
            "OnSelect": (f"=Set(varMyTasksPage, Min({MT_PAGES}, "
                         "Coalesce(varMyTasksPage, 1) + 1))"),
            "Width": "=24"})),
    ]))

    card = ("conMTTableCard", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": (f"=40 + Max(56, Min(galMyTasksAll.AllItemsCount, {SIZE}) * 56)"
                   f" + If(galMyTasksAll.AllItemsCount > {SIZE}, 48, 0)"),
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical"},
        [header_row, twin, gallery, empty, pager]))

    props = {
        "Fill": "=UAB.OffWhite",
        "OnVisible": "=Set(varMyTasksPage, 1)",
    }
    return emit_screen("scr_mytasks", props,
                       [nav_rail("scr_mytasks"),
                        content_root("scr_mytasks", "cntMyTasksRoot",
                                     [header, filters, card])])


# ---------------------------------------------------------------- stubs


def stub_screen(screen, root_name, title, note):
    header = (f"cntStubHeader_{SCREENS[screen]}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=100",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8"}, [
        (f"lblStubTitle_{SCREENS[screen]}", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": f'="{title}"'})),
        (f"lblStubNote_{SCREENS[screen]}", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=20",
            "Size": "=UABSize.Body", "Text": f'="{note}"'})),
    ]))
    return emit_screen(screen, {"Fill": "=UAB.OffWhite"},
                       [nav_rail(screen),
                        content_root(screen, root_name, [header])])


# ---------------------------------------------------------------- App


APP_FORMULAS = """UAB = {
    Green: RGBA(26, 86, 50, 1),        GreenDark: RGBA(3, 51, 25, 1),
    Gold: RGBA(253, 185, 19, 1),       GoldTint: RGBA(255, 248, 232, 1),
    OffWhite: RGBA(250, 249, 246, 1),  White: RGBA(255, 255, 255, 1),
    Paper: RGBA(244, 242, 236, 1),     Line: RGBA(227, 225, 218, 1),
    Gray300: RGBA(201, 198, 189, 1),   Gray500: RGBA(110, 109, 104, 1),
    Gray700: RGBA(58, 58, 55, 1),      TextPrimary: RGBA(3, 51, 25, 1),
    Success: RGBA(23, 176, 69, 1),     SuccessTint: RGBA(232, 247, 237, 1),
    SuccessText: RGBA(13, 138, 52, 1),
    Info: RGBA(66, 202, 240, 1),       InfoTint: RGBA(237, 249, 253, 1),
    InfoText: RGBA(15, 127, 163, 1),
    GoldText: RGBA(140, 100, 10, 1),
    Danger: RGBA(207, 69, 32, 1),      DangerTint: RGBA(207, 69, 32, 0.1),
    NavInactive: RGBA(255, 255, 255, 0.8)
};
UABSize = { ScreenTitle: 32, SectionHeading: 22, FieldLabel: 17, Eyebrow: 13, Body: 15, Secondary: 13, ButtonLabel: 15 };
UABLayout = { NavRailWidth: 220, NavRailWidthCollapsed: 64, ScreenPadding: 48, SectionGap: 32, BlockGap: 24, FieldGap: 16, RowGap: 12, TightGap: 8 };
// ---- Role model (AppPermissions list; unknown users are Viewers) ----
MyRole = Coalesce(LookUp(AppPermissions, Lower(Coalesce(AppUser.Email, "")) = Lower(User().Email)).Role.Value, "Viewer");
IsHR = MyRole = "HR";
IsManagerOrHR = MyRole = "HR" || MyRole = "Manager";
// ---- Task status pills ----
TaskStatusColor(s: Text): Color = Switch(Coalesce(s, ""), "Done", UAB.SuccessText, "In Progress", UAB.InfoText, "Blocked", UAB.Danger, "Canceled", UAB.Gray500, UAB.Gray700);
TaskStatusFill(s: Text): Color = Switch(Coalesce(s, ""), "Done", UAB.SuccessTint, "In Progress", UAB.InfoTint, "Blocked", UAB.DangerTint, "Canceled", UAB.Paper, UAB.Paper);
// ---- Due-date buckets (PendingAnchor tasks are waiting on a candidate date) ----
TaskDueBucket(d: Date, pending: Boolean): Text =
    If(Coalesce(pending, false), "Pending",
       IsBlank(d), "None",
       d < Today(), "Overdue",
       d <= Today() + 7, "Soon",
       "OK");
TaskDueText(d: Date, pending: Boolean): Text =
    Switch(TaskDueBucket(d, pending),
        "Pending", "Awaiting date",
        "None", "No due date",
        "Overdue", "Overdue " & Text(d, "mmm d"),
        "Soon", "Due " & Text(d, "mmm d"),
        Text(d, "mmm d"));
TaskDueColor(bucket: Text): Color = Switch(Coalesce(bucket, ""), "Overdue", UAB.Danger, "Soon", UAB.GoldText, "Pending", UAB.InfoText, UAB.Gray700);
TaskDueFill(bucket: Text): Color = Switch(Coalesce(bucket, ""), "Overdue", UAB.DangerTint, "Soon", UAB.GoldTint, "Pending", UAB.InfoTint, UAB.Paper)"""

APP_ONSTART = """Set(varMyTasksFilter, "All");
Set(varMyTasksPage, 1)"""


def app_yaml():
    out = ["App:", "  Properties:", "    Formulas: |-"]
    lines = APP_FORMULAS.split("\n")
    out.append("      =" + lines[0])
    out += ["      " + line for line in lines[1:]]
    out.append("    OnStart: |-")
    onstart = APP_ONSTART.split("\n")
    out.append("      =" + onstart[0])
    out += ["      " + line for line in onstart[1:]]
    out.append("    StartScreen: =scr_mytasks")
    out.append("    Theme: =PowerAppsTheme")
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------- main


def write(path, text):
    yaml.safe_load(text)  # parse BEFORE writing; a broken file never lands
    path.write_text(text)
    print(f"wrote {path.name} ({len(text.splitlines())} lines)")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write(OUT / "App.pa.yaml", app_yaml())
    write(OUT / "scr_mytasks.pa.yaml", mytasks_screen())
    write(OUT / "scr_candidates.pa.yaml", stub_screen(
        "scr_candidates", "cntCandidatesRoot", "Candidates",
        "The candidate cockpit is being built - check back soon."))
    write(OUT / "scr_new_candidate.pa.yaml", stub_screen(
        "scr_new_candidate", "cntNewCandRoot", "New Candidate",
        "The new-candidate wizard is being built - check back soon."))
    write(OUT / "scr_templates.pa.yaml", stub_screen(
        "scr_templates", "cntTemplatesRoot", "Templates",
        "The template editor is being built - check back soon."))
    print("done")
