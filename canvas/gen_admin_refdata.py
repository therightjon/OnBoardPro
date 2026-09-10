#!/usr/bin/env python3
"""Emit scr_admin_refdata.pa.yaml - the Reference data admin screen.

Divisions, Faculty Ranks and Stages behind one three-way selector. The three
SharePoint lists have different schemas, and Power Fx `Switch` cannot return
tables of differing shape, so the gallery is bound to a normalised collection
`colArRows` (ID, Title, Detail, Flag, FlagText, Order) that a hidden
screen-level button, btnArReload, rebuilds. Every tab switch and every
successful save or delete ends with `Select(btnArReload)`.

Stages is edit-only: `OrderIndex` is read for sorting and displayed read-only,
and never written, because the flows key off it.

  python3 gen_admin_refdata.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from gen_app import AUTOZ, NOSHADOW, OUT, con, ctl, content_root, emit_screen, write
from rail_stamp import rail_text

SCREEN, SFX = "scr_admin_refdata", "AdmRef"
SM = f"{SCREEN}.Size = ScreenSize.Small"

ROWS = 10          # gallery caps at ten rows, so no pager and no twin gallery
ROW_H = f"If({SM}, 72, 56)"
ENTITY = 'Coalesce(varArEntity, "Divisions")'

# ---------------------------------------------------------------- formulas

# The compiler refuses Navigate() inside OnVisible ("it would automatically
# always navigate away from this screen"), so the HR guard rides in a hidden
# screen-level button and OnVisible Selects it - the btnArReload idiom.
GUARD = "=If(!IsHR, Navigate(scr_settings))"

ONVISIBLE = """=Select(btnArGuard);
Set(varArEntity, Coalesce(varArEntity, "Divisions"));
Select(btnArReload)"""

RELOAD = """=Switch(Coalesce(varArEntity, "Divisions"),
    "Divisions",
        ClearCollect(colArRows, ForAll(SortByColumns(Divisions, "Title"),
            {ID: ID, Title: Title, Detail: "", Flag: false, FlagText: "", Order: 0})),
    "FacultyRanks",
        ClearCollect(colArRows, ForAll(SortByColumns(FacultyRanks, "Title"),
            {ID: ID, Title: Title, Detail: "", Flag: Coalesce(RequiresPT, false),
             FlagText: If(Coalesce(RequiresPT, false), "Requires P&T", "No P&T"), Order: 0})),
    "Stages",
        ClearCollect(colArRows, ForAll(SortByColumns(Stages, "OrderIndex"),
            {ID: ID, Title: Title, Detail: Coalesce(Description, ""), Flag: Coalesce(IsActive, true),
             FlagText: If(Coalesce(IsActive, true), "Active", "Inactive"), Order: Coalesce(OrderIndex, 0)})))"""

NEW_TASK = """=Set(varArEditId, 0); Set(varArEditTitle, ""); Set(varArEditFlag, false); Set(varArEditDetail, ""); Set(varArEditOrder, 0);
Reset(txtArDivTitle); Reset(txtArRankTitle); Reset(tglArRankPT);
If(Coalesce(varArEntity, "Divisions") = "FacultyRanks", Set(varArShowRank, true), Set(varArShowDiv, true))"""

OPEN_EDIT = """=Set(varArEditId, ThisItem.ID); Set(varArEditTitle, ThisItem.Title); Set(varArEditFlag, ThisItem.Flag);
Set(varArEditDetail, ThisItem.Detail); Set(varArEditOrder, ThisItem.Order);
Reset(txtArDivTitle); Reset(txtArRankTitle); Reset(tglArRankPT); Reset(txtArStageTitle); Reset(txtArStageDesc); Reset(tglArStageActive);
Switch(Coalesce(varArEntity, "Divisions"),
    "Divisions", Set(varArShowDiv, true),
    "FacultyRanks", Set(varArShowRank, true),
    "Stages", Set(varArShowStage, true))"""

DIV_SAVE = """=With({t: Trim(txtArDivTitle.Text)},
    If(IsBlank(t), Notify("Enter a name.", NotificationType.Warning),
       Coalesce(varArEditId, 0) = 0 && !IsBlank(LookUp(Divisions, Lower(Title) = Lower(t))),
        Notify("A division with that name already exists.", NotificationType.Warning),
       IfError(
           If(Coalesce(varArEditId, 0) = 0,
              Patch(Divisions, Defaults(Divisions),
                  {Title: t, Department: {Id: 1, Value: LookUp(Departments, ID = 1).Title}}),
              Patch(Divisions, LookUp(Divisions, ID = varArEditId), {Title: t})),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varArShowDiv, false); Select(btnArReload);
           Notify("Division saved.", NotificationType.Success))))"""

RANK_SAVE = """=With({t: Trim(txtArRankTitle.Text)},
    If(IsBlank(t), Notify("Enter a name.", NotificationType.Warning),
       Coalesce(varArEditId, 0) = 0 && !IsBlank(LookUp(FacultyRanks, Lower(Title) = Lower(t))),
        Notify("A rank with that name already exists.", NotificationType.Warning),
       IfError(
           If(Coalesce(varArEditId, 0) = 0,
              Patch(FacultyRanks, Defaults(FacultyRanks), {Title: t, RequiresPT: tglArRankPT.Checked}),
              Patch(FacultyRanks, LookUp(FacultyRanks, ID = varArEditId), {Title: t, RequiresPT: tglArRankPT.Checked})),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varArShowRank, false); Select(btnArReload);
           Notify("Rank saved.", NotificationType.Success))))"""

STAGE_SAVE = """=With({t: Trim(txtArStageTitle.Text)},
    If(IsBlank(t), Notify("Enter a name.", NotificationType.Warning),
       IfError(
           Patch(Stages, LookUp(Stages, ID = varArEditId),
               {Title: t, Description: txtArStageDesc.Text, IsActive: tglArStageActive.Checked}),
           Notify("Couldn't save: " & FirstError.Message & " Your changes are still on screen - try Save again.", NotificationType.Error),
           Set(varArShowStage, false); Select(btnArReload);
           Notify("Stage saved.", NotificationType.Success))))"""

ROW_DELETE = """=Set(varArDelId, ThisItem.ID); Set(varArDelTitle, ThisItem.Title);
Set(varArInUse,
    Switch(Coalesce(varArEntity, "Divisions"),
        "Divisions", CountRows(Filter(Candidates, Division.Id = ThisItem.ID))
                     + CountRows(Filter(AppPermissions, Division.Id = ThisItem.ID)),
        "FacultyRanks", CountRows(Filter(Candidates, FacultyRank.Id = ThisItem.ID)),
        0));
Set(varArShowConfirm, true)"""

CONFIRM_BODY = """=If(Coalesce(varArInUse, 0) > 0,
    "In use by " & Text(varArInUse) & If(varArInUse = 1, " record", " records") & " - reassign them first.",
    "This can't be undone.")"""

CONFIRM_DELETE = """=IfError(
    If(Coalesce(varArEntity, "Divisions") = "FacultyRanks",
       Remove(FacultyRanks, LookUp(FacultyRanks, ID = varArDelId)),
       Remove(Divisions, LookUp(Divisions, ID = varArDelId))),
    Notify("Couldn't delete: " & FirstError.Message, NotificationType.Error),
    Set(varArShowConfirm, false); Select(btnArReload);
    Notify("Deleted.", NotificationType.Success))"""

# ---------------------------------------------------------------- helpers

BTN_CHROME = {
    "Align": "=Align.Center", "FontWeight": '=""',
    "PaddingBottom": "=5", "PaddingLeft": "=12", "PaddingRight": "=12",
    "PaddingTop": "=5",
    "RadiusBottomLeft": "=4", "RadiusBottomRight": "=4",
    "RadiusTopLeft": "=4", "RadiusTopRight": "=4",
    "VerticalAlign": "=VerticalAlign.Middle",
}


def head_label(name, text, extra=None):
    """A Paper column-header caption."""
    props = {**AUTOZ, "AutoHeight": "=true", "Color": "=UAB.Gray700",
             "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold",
             "Height": "=18", "Size": "=UABSize.Secondary", "Text": text}
    if extra:
        props.update(extra)
    return (name, ctl("ModernText", props))


CENTERED = {"Align": "=Align.Center",
            "AlignInContainer": "=AlignInContainer.Center"}


def head_col(name, width, label, visible=None, centered=False):
    props = {**NOSHADOW, **AUTOZ, "Fill": "=UAB.Paper", "FillPortions": "=0",
             "LayoutAlignItems": "=LayoutAlignItems.Stretch",
             "LayoutDirection": "=LayoutDirection.Horizontal", "Width": width}
    if visible:
        props["Visible"] = visible
    return (name, con(props, [label if not centered else
                              (label[0], ctl("ModernText",
                                             {**label[1]["Properties"], **CENTERED}))]))


def caption(name, text):
    return (name, ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true", "Color": "=UAB.Gray700",
        "FontWeight": "=FontWeight.Semibold", "Height": "=22",
        "Size": "=UABSize.Secondary", "Text": f'="{text}"', "Wrap": "=false"}))


def field_row(name, cap, control, height=66):
    """Caption over an input, in a fixed-height vertical block."""
    return (name, con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": f"={height}",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"},
        [cap, control]))


def modal_head(con_name, lbl_name, ico_name, title, close_var, label):
    return (con_name, con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=34",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
        "PaddingLeft": "=2", "PaddingRight": "=2"}, [
        (lbl_name, ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Semibold", "Height": "=31", "Size": "=20",
            "Text": title, "Wrap": "=false"})),
        (ico_name, ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": f'="Close the {label} editor"',
            "BorderColor": "=UAB.Line", "BorderStyle": "=BorderStyle.Solid",
            "BorderThickness": "=1", "Color": "=UAB.Gray500",
            "FocusedBorderColor": "=UAB.Gold", "Height": "=28", "Icon": "=Icon.Cancel",
            "OnSelect": f"=Set({close_var}, false)", "TabIndex": "=0", "Width": "=28"})),
    ]))


def scrim(name, visible, panel):
    return (name, con({**NOSHADOW,
        "Fill": "=RGBA(32, 38, 45, 0.4)", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": visible, "Width": "=Parent.Width"}, [panel]))


def panel(name, cap, children):
    """Content-bounded modal panel: no Height, no scroll, so it hugs its content."""
    return (name, con({**AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "LayoutMaxHeight": "=Parent.Height - 32",
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24",
        "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": f"=Min({cap}, Parent.Width - 32)"}, children))


def actions(name, save, cancel):
    return (name, con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"},
        [save, cancel]))


def save_button(name, label, formula, width=140):
    return (name, ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
        "AccessibleLabel": f'="{label}"', "BasePaletteColor": "=UAB.Green",
        "Height": "=40", "OnSelect": formula, "Text": '="Save"',
        "Width": f"={width}"}))


def cancel_button(name, label, close_var, width=120):
    return (name, ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
        "AccessibleLabel": f'="{label}"', "Appearance": "=ButtonAppearance.Secondary",
        "BasePaletteColor": "=UAB.Green", "FillPortions": "=1", "Height": "=40",
        "OnSelect": f"=Set({close_var}, false)", "Text": '="Cancel"',
        "Width": f"={width}"}))


def toggle_row(row_name, tgl_name, label, default):
    return (row_name, con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal"}, [
        (tgl_name, ctl("ModernToggle", {**AUTOZ,
            "BasePaletteColor": "=UAB.Green", "Default": default,
            "FillPortions": "=1", "Height": "=40", "Label": f'="{label}"'})),
    ]))


# ---------------------------------------------------------------- header

def hidden_button(text, on_select):
    """A 1x1 invisible screen-level button, run with Select() from a formula."""
    return ctl("ModernButton", {
        "Height": "=1", "OnSelect": on_select, "Text": f'="{text}"',
        "Visible": "=false", "Width": "=1", "X": "=0", "Y": "=0"})


def tab_button(name, label, value, width):
    return (name, ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
        "AccessibleLabel": f'="Show {label.lower()}"',
        "Appearance": (f'=If({ENTITY} = "{value}", '
                       "ButtonAppearance.Primary, ButtonAppearance.Secondary)"),
        "BasePaletteColor": "=UAB.Green", "FillPortions": "=0", "Height": "=36",
        "OnSelect": f'=Set(varArEntity, "{value}");\nSelect(btnArReload)',
        "Text": f'="{label}"', "Width": width}))


def header():
    title_btns = ("conArTitleBtns", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
        "Width": f"=If({SM}, 208, 258)"}, [
        ("btnArBack", ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
            "AccessibleLabel": '="Back to Settings"',
            "Appearance": "=ButtonAppearance.Secondary",
            "BasePaletteColor": "=UAB.Green", "Height": "=40",
            "OnSelect": "=Navigate(scr_settings)", "Text": '="Settings"',
            "Width": f"=If({SM}, 90, 110)"})),
        ("btnArNew", ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
            "AccessibleLabel": '="Add a reference record"',
            "BasePaletteColor": "=UAB.Green", "Height": "=40",
            "OnSelect": NEW_TASK,
            "Text": '=If(varArEntity = "FacultyRanks", "Add rank", "Add division")',
            "Visible": f'={ENTITY} <> "Stages"',
            "Width": f"=If({SM}, 110, 140)"})),
    ]))

    title_row = ("conArTitleRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 102, 54)",
        "LayoutAlignItems": (f"=If({SM}, LayoutAlignItems.Stretch, "
                             "LayoutAlignItems.Center)"),
        "LayoutDirection": (f"=If({SM}, LayoutDirection.Vertical, "
                            "LayoutDirection.Horizontal)"),
        "LayoutGap": "=8"}, [
        ("lblArTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": '="Reference data"'})),
        title_btns,
    ]))

    return ("cntArHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 129, 92)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        title_row,
        ("lblArSub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=23",
            "Size": "=UABSize.Secondary",
            "Text": ('="Divisions, faculty ranks, and pipeline stages. '
                     'Stage order is fixed by the flows."'),
            "Wrap": "=false"})),
    ]))


def tabs():
    return ("conArTabs", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        tab_button("btnArTabDiv", "Divisions", "Divisions", f"=If({SM}, 90, 120)"),
        tab_button("btnArTabRank", "Faculty ranks", "FacultyRanks",
                   f"=If({SM}, 110, 140)"),
        tab_button("btnArTabStage", "Stages", "Stages", f"=If({SM}, 80, 110)"),
    ]))


# ---------------------------------------------------------------- table

DETAIL_W = f'=If({SM} || varArEntity <> "Stages", 0, 320)'
DETAIL_VIS = f'=!({SM}) && varArEntity = "Stages"'
FLAG_W = '=If(varArEntity = "Divisions", 0, 110)'
FLAG_VIS = '=varArEntity <> "Divisions"'
ORDER_W = '=If(varArEntity = "Stages", 72, 0)'
ORDER_VIS = '=varArEntity = "Stages"'
# The trailing icons in a row measure edit 24 + gap 12 + delete 24 = 60, and on
# Stages icoArRowDelete collapses to 0 while its gap stays, leaving 36. Anything
# wider here pushes the Status and Order captions right of the cells they label.
ACTS_W = f'=If({ENTITY} = "Stages", 36, 60)'


def header_row():
    return ("conArHeaderRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Paper", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)",
        "PaddingRight": f"=If({SM}, 12, 16)"}, [
        head_label("lblArColName", '="Name"'),
        head_col("conArColDetail", DETAIL_W,
                 head_label("lblArColDetail", '="Description"'), DETAIL_VIS),
        head_col("conArColFlag", FLAG_W,
                 head_label("lblArColFlag", '="Status"'), FLAG_VIS, centered=True),
        head_col("conArColOrder", ORDER_W,
                 head_label("lblArColOrder", '="Order"'), ORDER_VIS, centered=True),
        head_col("conArColActs", ACTS_W, head_label("lblArColActs", '=""')),
    ]))


def row_template():
    cell_main = ("conArCellMain", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutGap": f"=If({SM}, 4, 2)",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
        ("lblArRowTitle", ctl("Label", {**AUTOZ,
            "Color": "=UAB.TextPrimary", "FocusedBorderColor": "=UAB.Gold",
            "FocusedBorderThickness": "=2", "Font": "=Font.Arial",
            "FontWeight": "=FontWeight.Semibold", "Height": "=25",
            "OnSelect": OPEN_EDIT,
            "PaddingBottom": "=0", "PaddingLeft": "=0", "PaddingRight": "=0",
            "PaddingTop": "=0", "Size": "=UABSize.Body", "TabIndex": "=0",
            "Text": "=ThisItem.Title", "Wrap": "=false"})),
        ("lblArRowSub", ctl("Label", {**AUTOZ,
            "Color": "=UAB.Gray500", "Font": "=Font.Arial", "Height": "=22",
            "PaddingBottom": "=0", "PaddingLeft": "=0", "PaddingRight": "=0",
            "PaddingTop": "=0", "Size": "=UABSize.Secondary",
            "Text": (f'=If({SM} && varArEntity = "Stages", '
                     "Left(ThisItem.Detail, 60), \"\")"),
            "Visible": f'={SM} && varArEntity = "Stages"',
            "Wrap": "=false"})),
    ]))

    cell_detail = ("conArCellDetail", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": DETAIL_VIS, "Width": DETAIL_W}, [
        ("lblArCellDetail", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "Height": "=18",
            "LayoutMaxHeight": "=40", "Size": "=UABSize.Secondary",
            "Text": ("=With({d: ThisItem.Detail},\n"
                     '    If(Len(d) > 110, Left(d, 107) & "...", d))'),
            "Wrap": "=true"})),
    ]))

    cell_flag = ("conArCellFlag", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": FLAG_VIS, "Width": FLAG_W}, [
        ("conArPillFlag", con({**NOSHADOW, **AUTOZ,
            "AlignInContainer": "=AlignInContainer.Center",
            "Fill": "=If(ThisItem.Flag, UAB.SuccessTint, UAB.Paper)",
            "FillPortions": "=0", "Height": "=24",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center",
            "PaddingLeft": "=10", "PaddingRight": "=10",
            "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
            "RadiusTopLeft": "=999", "RadiusTopRight": "=999", "Width": "=96"}, [
            ("lblArPillFlag", ctl("ModernText", {**AUTOZ,
                "Align": "=Align.Center",
                "AlignInContainer": "=AlignInContainer.Stretch",
                "AutoHeight": "=true",
                "Color": "=If(ThisItem.Flag, UAB.SuccessText, UAB.Gray500)",
                "FontWeight": "=FontWeight.Semibold", "Height": "=16",
                "Size": "=12", "Text": "=ThisItem.FlagText", "Wrap": "=false"})),
        ])),
    ]))

    cell_order = ("conArCellOrder", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": ORDER_VIS, "Width": ORDER_W}, [
        ("lblArCellOrder", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray700", "Height": "=18",
            "Size": "=UABSize.Secondary", "Text": "=Text(ThisItem.Order)",
            "Wrap": "=false"})),
    ]))

    row_content = ("conArRowContent", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 71, 55)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)",
        "PaddingRight": f"=If({SM}, 12, 16)"}, [
        cell_main, cell_detail, cell_flag, cell_order,
        ("icoArRowEdit", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Edit this record"', "Color": "=UAB.Gray500",
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24",
            "Icon": "=Icon.Edit", "OnSelect": OPEN_EDIT, "TabIndex": "=0",
            "Width": "=24"})),
        ("icoArRowDelete", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Delete this record"', "Color": "=UAB.Danger",
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24",
            "Icon": "=Icon.Trash", "OnSelect": ROW_DELETE, "TabIndex": "=0",
            "Visible": f'={ENTITY} <> "Stages"',
            "Width": f'=If({ENTITY} = "Stages", 0, 24)'})),
    ]))

    # ONE template child, with the divider in-flow inside it (gallery idiom).
    return ("conArListRow", con({**NOSHADOW,
        "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        row_content,
        ("conArListDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1",
            "LayoutDirection": "=LayoutDirection.Horizontal"})),
    ]))


def table_card():
    gallery = ("galArList", ctl("Gallery", {**AUTOZ,
        "AccessibleLabel": '="Reference records"', "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": (f"=Max({ROW_H}, Min(CountRows(colArRows), {ROWS}) * {ROW_H})"),
        "Items": "=colArRows", "ShowScrollbar": "=false", "TabIndex": "=0",
        "TemplatePadding": "=0", "TemplateSize": f"={ROW_H}"},
        [row_template()], variant="Vertical"))

    empty = ("conArListEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(CountRows(colArRows) = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=CountRows(colArRows) = 0"}, [
        ("lblArListEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true",
            "Color": "=UAB.Gray500", "Height": "=20", "Size": "=UABSize.Body",
            "Text": ('=Switch(Coalesce(varArEntity, "Divisions"),\n'
                     '    "Divisions", "No divisions yet - add the first one.",\n'
                     '    "FacultyRanks", "No ranks yet - add the first one.",\n'
                     '    "No stages found.")')})),
    ]))

    return ("conArTableCard", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": (f"=40 + Max({ROW_H}, Min(CountRows(colArRows), {ROWS}) * {ROW_H})"
                   " + If(CountRows(colArRows) = 0, 44, 0)"),
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical"},
        [header_row(), gallery, empty]))


# ---------------------------------------------------------------- modals

def modal_div():
    return scrim("conArModalDiv", "=Coalesce(varArShowDiv, false)",
                 panel("conArDivPanel", 480, [
        modal_head("conArDivHead", "lblArDivTitle", "icoArDivClose",
                   '=If(Coalesce(varArEditId, 0) = 0, "Add division", "Edit division")',
                   "varArShowDiv", "division"),
        field_row("conArDivRowTitle", caption("lblArDivTitleCap", "Name"),
                  ("txtArDivTitle", ctl("ModernTextInput", {**AUTOZ,
                      "AccessibleLabel": '="Division name"',
                      "Default": '=Coalesce(varArEditTitle, "")',
                      "FillPortions": "=1", "Height": "=40",
                      "Placeholder": '="Required"'}))),
        actions("conArDivActions",
                save_button("btnArDivSave", "Save this division", DIV_SAVE),
                cancel_button("btnArDivCancel",
                              "Cancel and close the division editor",
                              "varArShowDiv")),
    ]))


def modal_rank():
    return scrim("conArModalRank", "=Coalesce(varArShowRank, false)",
                 panel("conArRankPanel", 480, [
        modal_head("conArRankHead", "lblArRankTitle", "icoArRankClose",
                   '=If(Coalesce(varArEditId, 0) = 0, "Add rank", "Edit rank")',
                   "varArShowRank", "rank"),
        field_row("conArRankRowTitle", caption("lblArRankTitleCap", "Name"),
                  ("txtArRankTitle", ctl("ModernTextInput", {**AUTOZ,
                      "AccessibleLabel": '="Rank name"',
                      "Default": '=Coalesce(varArEditTitle, "")',
                      "FillPortions": "=1", "Height": "=40",
                      "Placeholder": '="Required"'}))),
        toggle_row("conArRankRowPT", "tglArRankPT",
                   "Requires promotion & tenure review",
                   "=Coalesce(varArEditFlag, false)"),
        actions("conArRankActions",
                save_button("btnArRankSave", "Save this rank", RANK_SAVE),
                cancel_button("btnArRankCancel",
                              "Cancel and close the rank editor",
                              "varArShowRank")),
    ]))


def modal_stage():
    return scrim("conArModalStage", "=Coalesce(varArShowStage, false)",
                 panel("conArStagePanel", 560, [
        modal_head("conArStageHead", "lblArStageTitle", "icoArStageClose",
                   '="Edit stage"', "varArShowStage", "stage"),
        ("lblArStageOrder", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=22",
            "Size": "=UABSize.Secondary",
            "Text": ('="Stage " & Text(Coalesce(varArEditOrder, 0)) & " of "'
                     ' & Text(CountRows(Stages)) & " - order is fixed"'),
            "Wrap": "=false"})),
        field_row("conArStageRowTitle", caption("lblArStageTitleCap", "Name"),
                  ("txtArStageTitle", ctl("ModernTextInput", {**AUTOZ,
                      "AccessibleLabel": '="Stage name"',
                      "Default": '=Coalesce(varArEditTitle, "")',
                      "FillPortions": "=1", "Height": "=40",
                      "Placeholder": '="Required"'}))),
        field_row("conArStageRowDesc", caption("lblArStageDescCap", "Description"),
                  ("txtArStageDesc", ctl("ModernTextInput", {**AUTOZ,
                      "AccessibleLabel": '="Stage description"',
                      "Default": '=Coalesce(varArEditDetail, "")',
                      "FillPortions": "=1", "Height": "=96",
                      "Placeholder": '="What happens in this stage (optional)"',
                      "Type": "=TextInputType.Multiline"})),
                  height=122),
        toggle_row("conArStageRowActive", "tglArStageActive", "Active",
                   "=Coalesce(varArEditFlag, true)"),
        actions("conArStageActions",
                save_button("btnArStageSave", "Save this stage", STAGE_SAVE),
                cancel_button("btnArStageCancel",
                              "Cancel and close the stage editor",
                              "varArShowStage")),
    ]))


def confirm():
    return scrim("conArConfirm", "=Coalesce(varArShowConfirm, false)",
                 panel("conArConfirmPanel", 440, [
        ("lblArConfirmTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=30", "Size": "=20",
            "Text": '="Delete " & Coalesce(varArDelTitle, "") & "?"',
            "Wrap": "=false"})),
        ("lblArConfirmBody", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "Height": "=44",
            "Size": "=UABSize.Body", "Text": CONFIRM_BODY, "Wrap": "=true"})),
        ("conArConfirmActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("btnArConfirmDelete", ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
                "AccessibleLabel": '="Delete this record permanently"',
                "BasePaletteColor": "=UAB.Danger",
                "DisplayMode": ("=If(Coalesce(varArInUse, 0) > 0, "
                                "DisplayMode.Disabled, DisplayMode.Edit)"),
                "Height": "=40", "OnSelect": CONFIRM_DELETE, "Text": '="Delete"',
                "Width": "=150"})),
            ("btnArConfirmCancel", ctl("ModernButton", {**AUTOZ, **BTN_CHROME,
                "AccessibleLabel": '="Keep it and close this dialog"',
                "Appearance": "=ButtonAppearance.Secondary",
                "BasePaletteColor": "=UAB.Green", "FillPortions": "=1",
                "Height": "=40", "OnSelect": "=Set(varArShowConfirm, false)",
                "Text": '="Keep It"', "Width": "=120"})),
        ])),
    ]))


# ---------------------------------------------------------------- assembly

def root_children():
    return [
        header(),
        tabs(),
        ("lblArCount", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Right", "AutoHeight": "=true", "Color": "=UAB.Gray500",
            "Height": "=18", "Size": "=UABSize.Secondary",
            "Text": ('=CountRows(colArRows) & Switch(Coalesce(varArEntity, "Divisions"), '
                     '"Divisions", " divisions", "FacultyRanks", " ranks", " stages")'),
            "Wrap": "=false"})),
        table_card(),
        ("lblArBottomSpacer", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "Color": "=UAB.OffWhite", "Height": "=6",
            "Size": "=2", "Text": '=""', "Wrap": "=false"})),
    ]


def build():
    # btnArGuard and btnArReload sit AFTER the content root, not between the rail
    # and it: rail_stamp._rail_span() reads the rail as every line from "- NavRail_"
    # up to the "- cnt…Root:" line, so anything in that gap is counted as part of
    # the rail and `rail_stamp.py verify` reports MISMATCH. Both buttons are
    # invisible and 1x1, so their z-order among the screen's children is immaterial.
    body = emit_screen(SCREEN, {"Fill": "=UAB.OffWhite", "OnVisible": ONVISIBLE},
                       [content_root(SCREEN, "cntAdmRefRoot", root_children()),
                        ("btnArGuard", hidden_button("guard", GUARD)),
                        ("btnArReload", hidden_button("reload", RELOAD)),
                        ("conArModalDiv", modal_div()[1]),
                        ("conArModalRank", modal_rank()[1]),
                        ("conArModalStage", modal_stage()[1]),
                        ("conArConfirm", confirm()[1])])
    head, _, tail = body.partition("    Children:\n")
    return head + "    Children:\n" + rail_text(SCREEN, SFX) + tail


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write(OUT / f"{SCREEN}.pa.yaml", build())
