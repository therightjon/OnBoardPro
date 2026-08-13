#!/usr/bin/env python3
"""Emit cockpit stage 1 (picker + candidate header) into src/scr_candidates.pa.yaml.

DO NOT RE-RUN BLIND — src/scr_candidates.pa.yaml has diverged from this generator
(Jon's Studio-added spacer, the FriendlyName/line-box/caption fixes of 2026-08-12).
The .pa.yaml in src/ is the canonical baseline; this file records how stage 1 was
first built. Apply further changes as targeted edits to src/, not by regenerating.

Replaces the stub content under the existing cntCandidatesRoot (kept, clean) with
all-fresh control names (CK prefix). Also splices the cockpit formulas/OnStart/
StartScreen into src/App.pa.yaml. Run:  python3 gen_cockpit.py
"""
import pathlib

import yaml

from gen_app import (AUTOZ, NOSHADOW, con, ctl, emit_screen, nav_rail,
                     content_root)

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_candidates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelCandId, 0)"
CAND = f"LookUp(Candidates, ID = {SEL})"

PICKER_ITEMS = (
    "=SortByColumns(\n"
    "    Filter(FirstN(Candidates, 500),\n"
    "        (IsBlank(txtCKSearch.Text) || txtCKSearch.Text in Title\n"
    "            || txtCKSearch.Text in Coalesce(Email, \"\")),\n"
    "        (Coalesce(CountRows(cmbCKStatus.SelectedItems), 0) = 0\n"
    "            || CStatus.Value in ShowColumns(cmbCKStatus.SelectedItems, Value)),\n"
    "        (Coalesce(CountRows(cmbCKDivision.SelectedItems), 0) = 0\n"
    "            || Division.Id in ShowColumns(cmbCKDivision.SelectedItems, ID))),\n"
    "    \"Title\", SortOrder.Ascending)")


def cell_date(key, caption):
    field = {"LOI": "LOIDate", "LOOIss": "LOOIssued",
             "LOOAcc": "LOOAccepted", "Start": "StartDate"}[key]
    return (f"conCKDate{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1",
        "LayoutAlignItems": f"=If({SM}, LayoutAlignItems.Center, LayoutAlignItems.Stretch)",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Horizontal, LayoutDirection.Vertical)",
        "LayoutGap": f"=If({SM}, 8, 2)"}, [
        (f"lblCKDate{key}Cap", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500",
            "FillPortions": f"=If({SM}, 1, 0)", "Height": "=16",
            "Size": "=11", "Text": f'="{caption}"', "Wrap": "=false"})),
        (f"lblCKDate{key}Val", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=20",
            "Size": "=UABSize.Body",
            "Text": (f'=If(IsBlank({CAND}.{field}), "—", '
                     f'Text({CAND}.{field}, "mmm d, yyyy"))'),
            "Wrap": "=false"})),
    ]))


def ck_pill(key, width, fill, color, text, visible=None):
    props = {**NOSHADOW, **AUTOZ,
        "Fill": fill, "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "PaddingLeft": "=10", "PaddingRight": "=10",
        "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
        "RadiusTopLeft": "=999", "RadiusTopRight": "=999",
        "Width": f"={width}"}
    if visible:
        props["Visible"] = visible
    return (f"conCKPill{key}", con(props, [
        (f"lblCKPill{key}", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": color,
            "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold",
            "Height": "=18", "Size": "=12", "Text": text})),
    ]))


def picker_panel():
    filter_block = ("conCKFilters", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8",
        "PaddingBottom": "=12", "PaddingLeft": "=12", "PaddingRight": "=12",
        "PaddingTop": "=12", "Height": "=184"}, [
        ("txtCKSearch", ctl("ModernTextInput", {**AUTOZ,
            "FillPortions": "=0", "Height": "=36",
            "Placeholder": '="Search by name or email"'})),
        ("lblCKStatusCap", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700",
            "FillPortions": "=0", "FontWeight": "=FontWeight.Semibold",
            "Height": "=16", "Size": "=UABSize.Secondary",
            "Text": '="Status"'})),
        ("cmbCKStatus", ctl("ModernCombobox", {**AUTOZ,
            "DefaultSelectedItems": '=Table({Value: "Active"})',
            "FillPortions": "=0", "Height": "=36",
            "ItemDisplayText": "=ThisItem.Value",
            "Items": "=Choices(Candidates.CStatus)",
            "SelectMultiple": "=true"})),
        ("lblCKDivisionCap", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700",
            "FillPortions": "=0", "FontWeight": "=FontWeight.Semibold",
            "Height": "=16", "Size": "=UABSize.Secondary",
            "Text": '="Division"'})),
        ("cmbCKDivision", ctl("ModernCombobox", {**AUTOZ,
            "DefaultSelectedItems": "=Filter(Divisions, ID = MyDivisionId)",
            "FillPortions": "=0", "Height": "=36",
            "ItemDisplayText": "=ThisItem.Title",
            "Items": '=SortByColumns(Divisions, "Title", SortOrder.Ascending)',
            "SelectMultiple": "=true"})),
    ]))

    row_wrap = ("conCKPickRow", con({**NOSHADOW, **AUTOZ,
        "Fill": f"=If(ThisItem.ID = {SEL}, UAB.GoldTint, UAB.White)",
        "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conCKPickRowContent", con({**NOSHADOW, **AUTOZ,
            "Fill": "=RGBA(0, 0, 0, 0)", "FillPortions": "=0", "Height": "=55",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "PaddingLeft": "=12", "PaddingRight": "=12"}, [
            ("conCKPickRowMain", con({**NOSHADOW, **AUTOZ,
                "Fill": "=RGBA(0, 0, 0, 0)", "FillPortions": "=1",
                "LayoutAlignItems": "=LayoutAlignItems.Stretch",
                "LayoutDirection": "=LayoutDirection.Vertical",
                "LayoutGap": "=2",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
                ("lblCKPickName", ctl("Label", {**AUTOZ,
                    "Color": "=UAB.TextPrimary", "Font": "=Font.Arial",
                    "FontWeight": "=FontWeight.Semibold", "Height": "=22",
                    "OnSelect": "=Set(varSelCandId, ThisItem.ID)",
                    "PaddingBottom": "=0", "PaddingLeft": "=0",
                    "PaddingRight": "=0", "PaddingTop": "=0",
                    "Size": "=UABSize.Body",
                    "Text": '=Coalesce(ThisItem.Title, "(unnamed)")',
                    "Wrap": "=false"})),
                ("lblCKPickSub", ctl("Label", {**AUTOZ,
                    "Color": "=UAB.Gray500", "Font": "=Font.Arial",
                    "Height": "=18",
                    "OnSelect": "=Set(varSelCandId, ThisItem.ID)",
                    "PaddingBottom": "=0", "PaddingLeft": "=0",
                    "PaddingRight": "=0", "PaddingTop": "=0",
                    "Size": "=UABSize.Secondary",
                    "Text": ('=Coalesce(ThisItem.CurrentStage.Value, "No stage")'
                             ' & "  ·  " & Coalesce(ThisItem.CStatus.Value, "")'),
                    "Wrap": "=false"})),
            ])),
            ("icoCKPickGo", ctl("Classic/Icon", {**AUTOZ,
                "Color": "=UAB.Gray300", "Height": "=20",
                "Icon": "=Icon.ChevronRight",
                "OnSelect": "=Set(varSelCandId, ThisItem.ID)",
                "Width": "=20"})),
        ])),
        ("conCKPickRowDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galCKCands", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1",
        "OnSelect": "=Set(varSelCandId, ThisItem.ID)",
        "Items": PICKER_ITEMS, "ShowScrollbar": "=true",
        "TemplatePadding": "=0", "TemplateSize": "=56"},
        [row_wrap], variant="Vertical"))

    empty = ("conCKPickEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=56",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galCKCands.AllItemsCount = 0"}, [
        ("lblCKPickEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "Height": "=20",
            "Size": "=UABSize.Secondary",
            "Text": '="No candidates match the current filters."'})),
    ]))

    return ("conCKPicker", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": f"=If({SM}, 420, Parent.Height)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": f"=If({SM}, Parent.Width, 320)"},
        [filter_block, gallery, empty]))


def header_card():
    name_text = (
        f'=Trim(Coalesce({CAND}.Salutation.Value, "") & " "\n'
        f'    & Coalesce({CAND}.FirstName, "") & " " & Coalesce({CAND}.LastName, ""))')
    sub_text = (
        f'=Coalesce({CAND}.CandidateType.Value, "—")\n'
        f'    & "  ·  " & Coalesce({CAND}.Division.Value, "No division")\n'
        f'    & "  ·  " & Coalesce({CAND}.FacultyRank.Value, "No rank")')
    people_text = (
        f'="Manager: " & Coalesce({CAND}.Manager.DisplayName, "—")\n'
        f'    & "     Owner: " & Coalesce({CAND}.PrimaryOwner.DisplayName, "—")')

    dates_row = ("conCKDatesRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 122, 42)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": f"=If({SM}, 6, 16)"}, [
        cell_date("LOI", "LETTER OF INTENT"),
        cell_date("LOOIss", "LOO ISSUED"),
        cell_date("LOOAcc", "LOO ACCEPTED"),
        cell_date("Start", "START DATE"),
    ]))

    return ("conCKHead", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": f"=If({SM}, 372, 284)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutGap": "=12",
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24"}, [
        ("lblCKHeadEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green",
            "FontWeight": "=FontWeight.Bold", "Height": "=18",
            "Size": "=UABSize.Eyebrow", "Text": '="CANDIDATE"'})),
        ("lblCKHeadName", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold",
            "Height": "=38", "Size": "=26", "Text": name_text,
            "Wrap": "=false"})),
        ("lblCKHeadSub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=20",
            "Size": "=UABSize.Body", "Text": sub_text, "Wrap": "=false"})),
        ("conCKPillRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=28",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutGap": "=8"}, [
            ck_pill("Stage", 150, "=UAB.Paper", "=UAB.Gray700",
                    f'=Coalesce({CAND}.CurrentStage.Value, "No stage yet")'),
            ck_pill("Status", 110,
                    f'=CandStatusFill(Coalesce({CAND}.CStatus.Value, ""))',
                    f'=CandStatusColor(Coalesce({CAND}.CStatus.Value, ""))',
                    f'=Coalesce({CAND}.CStatus.Value, "—")'),
            ck_pill("Blocked", 100, "=UAB.DangerTint", "=UAB.Danger",
                    '="Blocked"',
                    visible=f"=Coalesce({CAND}.Blocked, false)"),
        ])),
        ("lblCKHeadPeople", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "Height": "=20",
            "Size": "=UABSize.Secondary", "Text": people_text,
            "Wrap": "=false"})),
        dates_row,
    ]))


def detail_panel():
    no_sel = ("conCKNoSelection", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SEL} = 0, 120, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": f"={SEL} = 0",
        "BorderColor": "=UAB.Line", "BorderThickness": "=1"}, [
        ("lblCKNoSelection", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "Height": "=20", "Size": "=UABSize.Body",
            "Text": '="Select a candidate to see their pipeline."'})),
    ]))

    head = header_card()
    head[1]["Properties"]["Visible"] = f"={SEL} > 0"

    coming = ("lblCKComing", ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=20",
        "Size": "=UABSize.Secondary",
        "Text": '="Tasks, comments, and timeline are being built — coming next."',
        "Visible": f"={SEL} > 0"}))

    return ("conCKDetail", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=1",
        "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=16",
        "LayoutOverflowY": "=LayoutOverflow.Scroll"},
        [no_sel, head, coming]))


def build():
    header = ("cntCKHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=60",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical"}, [
        ("lblCKTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": '="Candidates"'})),
    ]))

    split = ("conCKSplit", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 960, Max(560, scr_candidates.Height - 132))",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": "=16"},
        [picker_panel(), detail_panel()]))

    spacer = ("lblCKBottomSpacer", ctl("ModernText", {**AUTOZ,
        "Align": "=Align.Center", "Color": "=UAB.OffWhite", "Height": "=5",
        "Size": "=2", "Text": '=""', "Wrap": "=false"}))

    return emit_screen("scr_candidates", {"Fill": "=UAB.OffWhite"},
                       [nav_rail("scr_candidates"),
                        content_root("scr_candidates", "cntCandidatesRoot",
                                     [header, split, spacer])])


APP_FORMULA_ADD = """;
// ---- Cockpit ----
MyDivisionId = Coalesce(LookUp(AppPermissions, Lower(Coalesce(AppUser.Email, "")) = Lower(User().Email)).Division.Id, 0);
CandStatusColor(s: Text): Color = Switch(Coalesce(s, ""), "Active", UAB.SuccessText, "Draft", UAB.Gray700, "On Hold", UAB.GoldText, "Completed", UAB.InfoText, UAB.Gray500);
CandStatusFill(s: Text): Color = Switch(Coalesce(s, ""), "Active", UAB.SuccessTint, "Draft", UAB.Paper, "On Hold", UAB.GoldTint, "Completed", UAB.InfoTint, UAB.Paper)"""


def splice_app():
    p = SRC / "App.pa.yaml"
    t = p.read_text()
    if "MyDivisionId" in t:
        print("App.pa.yaml already spliced"); return
    old_tail = ('TaskDueFill(bucket: Text): Color = Switch(Coalesce(bucket, ""), '
                '"Overdue", UAB.DangerTint, "Soon", UAB.GoldTint, "Pending", '
                "UAB.InfoTint, UAB.Paper)")
    assert old_tail in t
    add = APP_FORMULA_ADD.replace("\n", "\n      ")
    t = t.replace(old_tail, old_tail + add)
    old_start = "Set(varMyTasksPage, 1)"
    assert old_start in t
    t = t.replace(old_start, old_start
                  + ';\n      Set(varSelCandId, If(IsBlank(Param("candidateId")), '
                    'Blank(), Value(Param("candidateId"))))')
    old_ss = "StartScreen: =scr_mytasks"
    assert old_ss in t
    t = t.replace(old_ss, 'StartScreen: |-\n      =If(IsBlank(Param("candidateId")), scr_mytasks, scr_candidates)')
    yaml.safe_load(t)
    p.write_text(t)
    print("App.pa.yaml spliced")


if __name__ == "__main__":
    text = build()
    yaml.safe_load(text)
    (SRC / "scr_candidates.pa.yaml").write_text(text)
    print(f"wrote scr_candidates.pa.yaml ({len(text.splitlines())} lines)")
    splice_app()
