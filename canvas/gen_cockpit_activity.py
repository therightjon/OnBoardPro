#!/usr/bin/env python3
"""Cockpit stage 2c: comments (post + read) and the timeline (ChangeLog).

Splices two cards in after conDtCard. Targeted insertion; src/*.pa.yaml is canonical.
New names only (Cm / Tl prefixes).

Posting a comment is all the app does — F4 owns the fan-out to NotifyUsers, the
manager, and watchers, and emails the candidate when Visibility is Candidate-Visible.

  python3 gen_cockpit_activity.py
"""
import pathlib

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_candidates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelCandId, 0)"

COMMENT_ITEMS = (
    "=SortByColumns(\n"
    f"    Filter(FirstN(Comments, 500), Candidate.Id = {SEL}),\n"
    '    "Created", SortOrder.Descending)')

POST = (
    "=IfError(\n"
    "    Patch(Comments, Defaults(Comments),\n"
    f"        {{Candidate: {{Id: {SEL}, Value: LookUp(Candidates, ID = {SEL}).Title}},\n"
    "         Body: txtCmBody.Text,\n"
    "         Visibility: {Value: If(tglCmVisible.Checked,\n"
    '             "Candidate-Visible", "Internal")}}),\n'
    '    Notify("Couldn\'t post the comment - " & FirstError.Message\n'
    '        & " Nothing was posted. Try again.", NotificationType.Error),\n'
    "    Reset(txtCmBody);\n"
    "    Set(varCmVisible, false);\n"
    '    Notify(If(tglCmVisible.Checked,\n'
    '        "Posted. The candidate and the team are being notified.",\n'
    '        "Posted. The team is being notified."), NotificationType.Success))')

# ChangeLog rows are written by F1-F7 as well as by hand; say plainly what happened.
TL_LINE = (
    '=Switch(Coalesce(ThisItem.EventType.Value, ""),\n'
    '    "Stage", "Stage moved to " & Coalesce(ThisItem.ToValue, "—"),\n'
    '    "CandidateStatus", "Candidate status " & Coalesce(ThisItem.ToValue, "—"),\n'
    '    "TaskStatus", Coalesce(ThisItem.TaskTitle, "Task") & " — "\n'
    '        & Coalesce(ThisItem.ToValue, "—"),\n'
    '    "TaskAssignee", Coalesce(ThisItem.TaskTitle, "Task") & " assigned to "\n'
    '        & Coalesce(FriendlyName(ThisItem.ToValue), "unassigned"),\n'
    '    "TaskDue", Coalesce(ThisItem.TaskTitle, "Task") & " due "\n'
    '        & Coalesce(ThisItem.ToValue, "—"),\n'
    '    Coalesce(ThisItem.TaskTitle, "Activity"))')

TL_META = (
    '=Text(ThisItem.ChangedDate, "mmm d, h:mm AM/PM")\n'
    '    & "  ·  " & If(Coalesce(ThisItem.Automated, false), "Automatic",\n'
    '        Coalesce(FriendlyName(ThisItem.ChangedBy.DisplayName), "Someone"))\n'
    '    & If(IsBlank(ThisItem.FromValue) || ThisItem.FromValue = "", "",\n'
    '        "  ·  was " & ThisItem.FromValue)')


def card(name, height_sm, height, children):
    return (name, con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SM}, {height_sm}, {height})",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"}, children))


def eyebrow(key, text):
    return (f"lbl{key}Eyebrow", ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=1",
        "FontWeight": "=FontWeight.Bold", "Height": "=22",
        "Size": "=UABSize.Eyebrow", "Text": f'="{text}"', "Wrap": "=false"}))


def comments_card():
    head = ("conCmHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal"},
        [eyebrow("Cm", "COMMENTS")]))

    compose = ("conCmCompose", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 210, 158)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8"}, [
        ("txtCmBody", ctl("ModernTextInput", {**AUTOZ,
            "FillPortions": "=0", "Height": "=76", "Type": "=TextInputType.Multiline",
            "Placeholder": '="Add a note for the team…"'})),
        ("conCmOptions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "Height": f"=If({SM}, 96, 44)",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
            "LayoutGap": "=8"}, [
            ("tglCmVisible", ctl("Toggle", {**AUTOZ,
                "BasePaletteColor": "=UAB.Green", "FillPortions": "=1",
                "Height": "=40", "Label": '="Send to the candidate too"'})),
            ("btnCmPost", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Primary",
                "BasePaletteColor": "=UAB.Green",
                "DisplayMode": (f"=If(And({SEL} > 0, !IsBlank(Trim(txtCmBody.Text))), "
                                "DisplayMode.Edit, DisplayMode.Disabled)"),
                "FillPortions": "=0", "Height": "=40", "OnSelect": POST,
                "Text": '="Post comment"', "Width": f"=If({SM}, 150, 150)"})),
        ])),
        ("lblCmHint", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "FillPortions": "=0",
            "Height": f"=If({SM}, 40, 22)", "Size": "=UABSize.Secondary",
            "Text": ('=If(tglCmVisible.Checked,\n'
                     '    "The candidate will receive this by email.",\n'
                     '    "Internal only — the candidate never sees this.")'),
            "Wrap": f"=If({SM}, true, false)"})),
    ]))

    row = ("conCmRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conCmRowBody", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=87",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center",
            "PaddingLeft": "=4", "PaddingRight": "=4"}, [
            ("lblCmRowMeta", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=22",
                "Size": "=UABSize.Secondary",
                "Text": ('=Coalesce(FriendlyName(ThisItem.\'Created By\'.DisplayName), "Someone")\n'
                         '    & "  ·  " & Text(ThisItem.Created, "mmm d, h:mm AM/PM")\n'
                         '    & If(Coalesce(ThisItem.Visibility.Value, "") = "Candidate-Visible",\n'
                         '        "  ·  shared with candidate", "")'),
                "Wrap": "=false"})),
            ("lblCmRowBody", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "Height": "=50",
                "LayoutMaxHeight": "=50", "Size": "=UABSize.Body",
                "Text": ('=With({t: Trim(Coalesce(PlainText(ThisItem.Body), ""))},\n'
                         '    If(Len(t) > 180, Trim(Left(t, 179)) & "…", t))'),
                "Wrap": "=true"})),
        ])),
        ("conCmRowDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galCmComments", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Items": COMMENT_ITEMS,
        "TemplatePadding": "=0", "TemplateSize": "=88"},
        [row], variant="Vertical"))

    empty = ("conCmEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(galCmComments.AllItemsCount = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galCmComments.AllItemsCount = 0"}, [
        ("lblCmEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "Height": "=25", "Size": "=UABSize.Body",
            "Text": '="No comments yet."'})),
    ]))

    return card("conCmCard", 700, 560, [head, compose, gallery, empty])


def timeline_card():
    head = ("conTlHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal"},
        [eyebrow("Tl", "TIMELINE")]))

    row = ("conTlRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conTlRowBody", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=63",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=2",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center",
            "PaddingLeft": "=4", "PaddingRight": "=4"}, [
            ("lblTlRowLine", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "Height": "=25",
                "Size": "=UABSize.Body", "Text": TL_LINE, "Wrap": "=false"})),
            ("lblTlRowMeta", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=22",
                "Size": "=UABSize.Secondary", "Text": TL_META, "Wrap": "=false"})),
        ])),
        ("conTlRowDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galTlLog", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1",
        "Items": ("=SortByColumns(\n"
                  f"    Filter(FirstN(ChangeLog, 500), Candidate.Id = {SEL}),\n"
                  '    "ChangedDate", SortOrder.Descending)'),
        "TemplatePadding": "=0", "TemplateSize": "=64"},
        [row], variant="Vertical"))

    empty = ("conTlEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(galTlLog.AllItemsCount = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galTlLog.AllItemsCount = 0"}, [
        ("lblTlEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "Height": "=25", "Size": "=UABSize.Body",
            "Text": '="Nothing has happened yet."'})),
    ]))

    return card("conTlCard", 460, 420, [head, gallery, empty])


def splice():
    p = SRC / "scr_candidates.pa.yaml"
    lines = p.read_text().split("\n")
    assert "conCmCard" not in "\n".join(lines), "already spliced"
    i = next(k for k, l in enumerate(lines) if l.strip() == "- conDtCard:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    j = i + 1
    while j < len(lines) and (not lines[j].strip()
                              or len(lines[j]) - len(lines[j].lstrip()) > ind):
        j += 1
    block = []
    for name, node in (comments_card(), timeline_card()):
        block += emit_control(name, node, ind)
    lines[j:j] = block
    out = "\n".join(lines)
    yaml.safe_load(out)
    p.write_text(out)
    print(f"spliced conCmCard + conTlCard after conDtCard ({len(block)} lines)")


if __name__ == "__main__":
    splice()
