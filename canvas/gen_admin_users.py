#!/usr/bin/env python3
"""Emit canvas/src/scr_admin_users.pa.yaml - the Users & roles admin screen.

HR-only listing + modal over the AppPermissions list: who can open the app,
what role they hold, which division they see, and where their notifications
go. Shape is copied from scr_tasklibrary (header, filter row, count, Paper
header row, twin gallery + 7-per-page gallery, empty state, pager, modal,
delete confirm); the people picker is the Office 365 Users combobox from
scr_new_candidate.

Page size is 7, not 8: eight 56px rows under this header/filter stack scroll
at design height (Task Library went 8 -> 7 in September for the same reason).

  python3 gen_admin_users.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from gen_app import (AUTOZ, NOSHADOW, con, ctl, emit_screen, content_root,  # noqa: E402
                     write)
from rail_stamp import rail_text  # noqa: E402

OUT = pathlib.Path(__file__).parent / "src"

SCREEN, SFX = "scr_admin_users", "AdmUsers"
SM = f"{SCREEN}.Size = ScreenSize.Small"
SIZE = 7                      # rows per page
ROW = f"If({SM}, 72, 56)"     # row height, phone / desktop
PAGES = f"Max(1, RoundUp(galAuAll.AllItemsCount / {SIZE}, 0))"


# ---------------------------------------------------------------- formulas

# Navigate() is rejected inside OnVisible ("it would automatically always navigate
# away from this screen"), so the HR guard runs through Select() of a hidden
# screen-level button - the same idiom btnArReload uses on the Reference data screen.
ONVISIBLE = (
    "=Select(btnAuGuard);\n"
    "Refresh(AppPermissions);\n"
    "Set(varAuPage, 1)")

AU_FILTER = (
    "=SortByColumns(\n"
    "    Filter(FirstN(AppPermissions, 500),\n"
    "        (IsBlank(Trim(txtAuSearch.Text))\n"
    "           || Trim(txtAuSearch.Text) in AppUser.DisplayName\n"
    "           || Trim(txtAuSearch.Text) in AppUser.Email)\n"
    "        && (Coalesce(CountRows(cmbAuRole.SelectedItems), 0) = 0\n"
    "           || Role.Value in ShowColumns(cmbAuRole.SelectedItems, Value))),\n"
    "    \"Title\")")

# A dumb one-page view of the twin - never put filter logic here. `n` is the
# With() binding, not galAuAll.AllItemsCount spelled out again.
AU_WINDOW = (
    "=With({t: galAuAll.AllItems, n: galAuAll.AllItemsCount},\n"
    f"    FirstN(LastN(t, n - (Min(Coalesce(varAuPage, 1), Max(1, RoundUp(n / {SIZE}, 0))) - 1)"
    f" * {SIZE}), {SIZE}))")

OPEN_ADD = (
    "=Set(varAuMode, \"add\"); Set(varAuEditId, 0); Set(varAuEditName, \"\"); Set(varAuEditEmail, \"\");\n"
    "Set(varAuEditRole, \"Viewer\"); Set(varAuEditDivId, 0); Set(varAuEditChan, \"Email\");\n"
    "Reset(cmbAuUser); Reset(cmbAuRole1); Reset(cmbAuDivision); Reset(cmbAuChannel);\n"
    "Set(varAuShow, true)")

OPEN_EDIT = (
    "=Set(varAuMode, \"edit\"); Set(varAuEditId, ThisItem.ID);\n"
    "Set(varAuEditName, Coalesce(ThisItem.AppUser.DisplayName, ThisItem.Title));\n"
    "Set(varAuEditEmail, Coalesce(ThisItem.AppUser.Email, \"\"));\n"
    "Set(varAuEditRole, Coalesce(ThisItem.Role.Value, \"Viewer\"));\n"
    "Set(varAuEditDivId, Coalesce(ThisItem.Division.Id, 0));\n"
    "Set(varAuEditChan, Coalesce(ThisItem.NotifyChannel.Value, \"Email\"));\n"
    "Reset(cmbAuRole1); Reset(cmbAuDivision); Reset(cmbAuChannel);\n"
    "Set(varAuShow, true)")

OPEN_CONFIRM = (
    "=Set(varAuDelId, ThisItem.ID);\n"
    "Set(varAuDelName, Coalesce(ThisItem.AppUser.DisplayName, ThisItem.Title));\n"
    "Set(varAuDelEmail, Coalesce(ThisItem.AppUser.Email, \"\"));\n"
    "Set(varAuShowConfirm, true)")

SAVE = (
    "=With({mode: Coalesce(varAuMode, \"add\"),\n"
    "       mail: Lower(Coalesce(cmbAuUser.Selected.Mail, cmbAuUser.Selected.UserPrincipalName, \"\")),\n"
    "       dupe: If(Coalesce(varAuMode, \"add\") = \"add\",\n"
    "                !IsBlank(LookUp(AppPermissions,\n"
    "                    Lower(Coalesce(AppUser.Email, \"\")) = Lower(Coalesce(cmbAuUser.Selected.Mail, cmbAuUser.Selected.UserPrincipalName, \"\")))),\n"
    "                false)},\n"
    "    If(mode = \"add\" && IsBlank(cmbAuUser.Selected),\n"
    "        Notify(\"Pick a user.\", NotificationType.Warning),\n"
    "       mode = \"add\" && dupe,\n"
    "        Notify(\"That person already has a row - edit it instead.\", NotificationType.Warning),\n"
    "       IsBlank(cmbAuRole1.Selected),\n"
    "        Notify(\"Pick a role.\", NotificationType.Warning),\n"
    "       mode = \"edit\" && Lower(Coalesce(varAuEditEmail, \"\")) = Lower(User().Email) && cmbAuRole1.Selected.Value <> \"HR\",\n"
    "        Notify(\"You can't change your own role.\", NotificationType.Warning),\n"
    "       IfError(\n"
    "           If(mode = \"add\",\n"
    "              Patch(AppPermissions, Defaults(AppPermissions),\n"
    "                  {Title: cmbAuUser.Selected.DisplayName,\n"
    "                   AppUser: {Claims: \"i:0#.f|membership|\" & mail, Department: \"\",\n"
    "                             DisplayName: cmbAuUser.Selected.DisplayName, Email: mail,\n"
    "                             JobTitle: \"\", Picture: \"\"},\n"
    "                   Role: {Value: cmbAuRole1.Selected.Value},\n"
    "                   NotifyChannel: {Value: Coalesce(cmbAuChannel.Selected.Value, \"Email\")},\n"
    "                   Division: If(IsBlank(cmbAuDivision.Selected), Blank(),\n"
    "                       {Id: cmbAuDivision.Selected.ID, Value: cmbAuDivision.Selected.Title})}),\n"
    "              Patch(AppPermissions, LookUp(AppPermissions, ID = varAuEditId),\n"
    "                  {Title: Coalesce(varAuEditName, \"\"),\n"
    "                   Role: {Value: cmbAuRole1.Selected.Value},\n"
    "                   NotifyChannel: {Value: Coalesce(cmbAuChannel.Selected.Value, \"Email\")},\n"
    "                   Division: If(IsBlank(cmbAuDivision.Selected), Blank(),\n"
    "                       {Id: cmbAuDivision.Selected.ID, Value: cmbAuDivision.Selected.Title})})),\n"
    "           Notify(\"Couldn't save: \" & FirstError.Message & \" Your changes are still on screen - try Save again.\", NotificationType.Error),\n"
    "           Set(varAuShow, false);\n"
    "           Notify(If(mode = \"add\", \"User added.\", \"User updated.\"), NotificationType.Success))))")

CONFIRM_BODY = (
    "=If(Lower(Coalesce(varAuDelEmail, \"\")) = Lower(User().Email),\n"
    "    \"You can't remove your own access. Another HR user can.\",\n"
    "    \"They'll drop to Viewer the next time they open the app. Their group membership is unchanged.\")")

CONFIRM_DELETE = (
    "=IfError(\n"
    "    Remove(AppPermissions, LookUp(AppPermissions, ID = varAuDelId)),\n"
    "    Notify(\"Couldn't remove: \" & FirstError.Message, NotificationType.Error),\n"
    "    Set(varAuShowConfirm, false);\n"
    "    Notify(\"User removed.\", NotificationType.Success))")

# cmbNcManager's picker, verbatim, with every cmbNcManager -> cmbAuUser.
PICKER_ITEMS = (
    "=AddColumns(\n"
    "    Filter(\n"
    "        Office365Users.SearchUser(\n"
    "            {searchTerm: Trim(cmbAuUser.SearchText), top: 50}),\n"
    "        Len(Trim(cmbAuUser.SearchText)) >= 2,\n"
    "        !IsBlank(Surname),\n"
    "        !StartsWith(DisplayName, \"!\"),\n"
    "        !IsBlank(Coalesce(Mail, UserPrincipalName))),\n"
    "    PickerLabel,\n"
    "    Surname & \", \" & GivenName & \"  ·  \" & Coalesce(Mail, UserPrincipalName))")


# ---------------------------------------------------------------- builders

BTN_CHROME = {"Align": "=Align.Center", "FontWeight": '=""',
              "PaddingBottom": "=5", "PaddingLeft": "=12", "PaddingRight": "=12",
              "PaddingTop": "=5", "RadiusBottomLeft": "=4", "RadiusBottomRight": "=4",
              "RadiusTopLeft": "=4", "RadiusTopRight": "=4",
              "VerticalAlign": "=VerticalAlign.Middle"}


def button(name, text, onselect, width, height=40, label=None,
           secondary=False, palette="=UAB.Green", extra=None):
    props = {**AUTOZ, **BTN_CHROME, "BasePaletteColor": palette,
             "Height": f"={height}", "OnSelect": onselect,
             "Text": text, "Width": f"={width}"}
    if label:
        props["AccessibleLabel"] = f'="{label}"'
    if secondary:
        props["Appearance"] = "=ButtonAppearance.Secondary"
    if extra:
        props.update(extra)
    return (name, ctl("ModernButton", props))


def mtext(name, text, color="=UAB.Gray700", size="=UABSize.Secondary",
          height=18, extra=None):
    """A ModernText. AutoHeight is never optional - unset, it clips and scrolls."""
    props = {**AUTOZ, "AutoHeight": "=true", "Color": color,
             "Height": f"={height}" if isinstance(height, int) else height,
             "Size": size, "Text": text}
    if extra:
        props.update(extra)
    return (name, ctl("ModernText", props))


def col_header(con_name, lbl_name, text, width, collapse=True):
    """A fixed-width Paper header cell wrapping a centred ModernText."""
    props = {**NOSHADOW, **AUTOZ, "Fill": "=UAB.Paper", "FillPortions": "=0",
             "LayoutDirection": "=LayoutDirection.Horizontal", "Width": width}
    if collapse:
        props["Visible"] = f"=!({SM})"
    return (con_name, con(props, [
        mtext(lbl_name, f'="{text}"', extra={
            "Align": "=Align.Center",
            "AlignInContainer": "=AlignInContainer.Center",
            "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold"}),
    ]))


def row_cell(con_name, lbl_name, text, width, collapse=True):
    """A fixed-width white row cell wrapping a centred ModernText."""
    props = {**NOSHADOW, **AUTOZ, "Fill": "=UAB.White", "FillPortions": "=0",
             "LayoutAlignItems": "=LayoutAlignItems.Stretch",
             "LayoutDirection": "=LayoutDirection.Vertical",
             "LayoutJustifyContent": "=LayoutJustifyContent.Center",
             "Width": width}
    if collapse:
        props["Visible"] = f"=!({SM})"
    return (con_name, con(props, [
        mtext(lbl_name, text, extra={"Align": "=Align.Center", "Wrap": "=false"}),
    ]))


def field(con_name, cap_name, caption, control, height=66, extra=None):
    """A modal field: caption over control, in a vertical white block."""
    props = {**NOSHADOW, **AUTOZ, "Fill": "=UAB.White", "FillPortions": "=0",
             "Height": f"={height}" if isinstance(height, int) else height,
             "LayoutAlignItems": "=LayoutAlignItems.Stretch",
             "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}
    if extra:
        props.update(extra)
    return (con_name, con(props, [
        mtext(cap_name, f'="{caption}"', height=22,
              extra={"FontWeight": "=FontWeight.Semibold", "Wrap": "=false"}),
        control,
    ]))


def combo(name, label, items, display, multiple, extra=None):
    props = {**AUTOZ, "AccessibleLabel": f'="{label}"', "FillPortions": "=1",
             "Height": "=40", "ItemDisplayText": display, "Items": items,
             "SelectMultiple": f"={'true' if multiple else 'false'}"}
    if extra:
        props.update(extra)
    return (name, ctl("ModernCombobox", props))


# ---------------------------------------------------------------- regions


def header():
    return ("cntAuHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=92",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        ("conAuTitleRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=54",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "LayoutJustifyContent": "=LayoutJustifyContent.SpaceBetween"}, [
            mtext("lblAuTitle", '="Users & roles"', color="=UAB.TextPrimary",
                  size="=UABSize.ScreenTitle", height=44,
                  extra={"FillPortions": "=1",
                         "FontWeight": "=FontWeight.Semibold"}),
            # Width is not optional: a FillPortions:=0 container with no Width
            # defaults to 500px and shoves the title off the row. 110 + 8 + 120.
            ("conAuTitleBtns", con({**NOSHADOW, **AUTOZ,
                "Fill": "=UAB.OffWhite", "FillPortions": "=0",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Horizontal",
                "LayoutGap": "=8", "Width": "=238"}, [
                button("btnAuBack", '="Settings"', "=Navigate(scr_settings)", 110,
                       height=36, secondary=True,
                       label="Back to Settings"),
                button("btnAuNew", '="Add user"', OPEN_ADD, 120, height=36,
                       label="Add a user to the app"),
            ])),
        ])),
        mtext("lblAuSub",
              '="Who can open the app, what they see, and where their notifications go."',
              color="=UAB.Gray500", height=23, extra={"Wrap": "=false"}),
    ]))


def filter_row():
    return ("conAuFilterRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 136, 40)",
        "LayoutAlignItems": (f"=If({SM}, LayoutAlignItems.Stretch, "
                             "LayoutAlignItems.Center)"),
        "LayoutDirection": (f"=If({SM}, LayoutDirection.Vertical, "
                            "LayoutDirection.Horizontal)"),
        "LayoutGap": "=8"}, [
        ("txtAuSearch", ctl("ModernTextInput", {**AUTOZ,
            "AccessibleLabel": '="Search name or email"',
            "FillPortions": "=0", "Height": "=40",
            "OnChange": "=Set(varAuPage, 1)",
            "Placeholder": '="Search name or email"',
            "Width": f"=If({SM}, 160, 260)"})),
        combo("cmbAuRole", "Filter by role", '=["HR", "Manager", "Viewer"]',
              "=ThisItem.Value", True,
              extra={"FillPortions": "=0",
                     "InputTextPlaceholder": '="Role"',
                     "OnChange": "=Set(varAuPage, 1)",
                     "Width": f"=If({SM}, 120, 180)"}),
        button("btnAuClear", '="Clear"',
               "=Reset(txtAuSearch); Reset(cmbAuRole);\nSet(varAuPage, 1)",
               90, secondary=True, label="Clear the user filters"),
    ]))


def header_row():
    return ("conAuHeaderRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Paper", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)",
        "PaddingRight": f"=If({SM}, 12, 16)"}, [
        mtext("lblAuColUser", '="User"', height=18,
              extra={"FillPortions": "=1", "FontWeight": "=FontWeight.Semibold"}),
        col_header("conAuColEmail", "lblAuColEmail", "Email",
                   f"=If({SM}, 0, 260)"),
        col_header("conAuColRole", "lblAuColRole", "Role", "=110",
                   collapse=False),
        col_header("conAuColDiv", "lblAuColDiv", "Division",
                   f"=If({SM}, 0, 200)"),
        col_header("conAuColChan", "lblAuColChan", "Notifications",
                   f"=If({SM}, 0, 140)"),
        ("conAuColActs", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Paper", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "Width": f"=If({SM}, 56, 60)"})),
    ]))


def twin():
    # Same shape as galTlAll on scr_tasklibrary: hidden but a real row height,
    # and no Width at all. A 1px twin has never been run in this app.
    return ("galAuAll", ctl("Gallery", {**AUTOZ,
        "AccessibleLabel": '="App permission data, not shown on screen"',
        "FillPortions": "=0", "Height": "=56", "Items": AU_FILTER,
        "ShowScrollbar": "=false", "TemplatePadding": "=0", "TemplateSize": "=56",
        "Visible": "=false"}, [
        mtext("lblAuAllStub", '=""'),
    ], variant="Vertical"))


def row_name_label(name, text, color, size, height, onselect=None):
    """Classic Label - the only in-gallery click target that does not garble
    the template (ModernText.OnSelect does)."""
    props = {**AUTOZ, "Color": color, "FocusedBorderColor": "=UAB.Gold",
             "FocusedBorderThickness": "=2", "Font": "=Font.Arial",
             "Height": f"={height}", "PaddingBottom": "=0", "PaddingLeft": "=0",
             "PaddingRight": "=0", "PaddingTop": "=0", "Size": size,
             "TabIndex": "=0", "Text": text, "Wrap": "=false"}
    if onselect:
        props["OnSelect"] = onselect
    return (name, ctl("Label", props))


def list_gallery():
    row_content = ("conAuRowContent", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 71, 55)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)",
        "PaddingRight": f"=If({SM}, 12, 16)"}, [
        ("conAuCellMain", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutGap": f"=If({SM}, 4, 2)",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
            row_name_label("lblAuRowName",
                           "=Coalesce(ThisItem.AppUser.DisplayName, ThisItem.Title)",
                           "=UAB.TextPrimary", "=UABSize.Body", 25,
                           onselect=OPEN_EDIT),
            row_name_label("lblAuRowSub",
                           (f"=If({SM}, Coalesce(ThisItem.AppUser.Email, \"\"),\n"
                            "    Coalesce(ThisItem.Division.Value, \"All divisions\")\n"
                            "        & \" · \" & Coalesce(ThisItem.NotifyChannel.Value, \"Email\"))"),
                           "=UAB.Gray500", "=UABSize.Secondary", 22),
        ])),
        row_cell("conAuCellEmail", "lblAuCellEmail",
                 '=Coalesce(ThisItem.AppUser.Email, "")', f"=If({SM}, 0, 260)"),
        ("conAuCellRole", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center",
            "Width": "=110"}, [
            ("conAuPillRole", con({**NOSHADOW, **AUTOZ,
                "AlignInContainer": "=AlignInContainer.Center",
                "Fill": "=RoleFill(ThisItem.Role.Value)", "FillPortions": "=0",
                "Height": "=24",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Horizontal",
                "LayoutJustifyContent": "=LayoutJustifyContent.Center",
                "PaddingLeft": "=10", "PaddingRight": "=10",
                "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
                "RadiusTopLeft": "=999", "RadiusTopRight": "=999",
                "Width": "=84"}, [
                mtext("lblAuPillRole", '=Coalesce(ThisItem.Role.Value, "Viewer")',
                      color="=RoleColor(ThisItem.Role.Value)", size="=12",
                      height=16, extra={
                          "Align": "=Align.Center",
                          "AlignInContainer": "=AlignInContainer.Stretch",
                          "FontWeight": "=FontWeight.Semibold", "Wrap": "=false"}),
            ])),
        ])),
        row_cell("conAuCellDiv", "lblAuCellDiv",
                 '=Coalesce(ThisItem.Division.Value, "All divisions")',
                 f"=If({SM}, 0, 200)"),
        row_cell("conAuCellChan", "lblAuCellChan",
                 '=Coalesce(ThisItem.NotifyChannel.Value, "Email")',
                 f"=If({SM}, 0, 140)"),
        ("icoAuRowEdit", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Edit " & Coalesce(ThisItem.AppUser.DisplayName, "")',
            "Color": "=UAB.Green", "FocusedBorderColor": "=UAB.Gold",
            "Height": "=24", "Icon": "=Icon.Edit", "OnSelect": OPEN_EDIT,
            "TabIndex": "=0", "Width": "=24"})),
        ("icoAuRowDelete", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Remove " & Coalesce(ThisItem.AppUser.DisplayName, "")',
            "Color": ('=If(Lower(Coalesce(ThisItem.AppUser.Email, "")) = Lower(User().Email),'
                      " UAB.Gray300, UAB.Danger)"),
            "DisplayMode": ('=If(Lower(Coalesce(ThisItem.AppUser.Email, "")) = Lower(User().Email),'
                            " DisplayMode.Disabled, DisplayMode.Edit)"),
            "FocusedBorderColor": "=UAB.Gold",
            "Height": "=24", "Icon": "=Icon.Trash", "OnSelect": OPEN_CONFIRM,
            "TabIndex": "=0", "Width": "=24"})),
    ]))

    divider = ("conAuListDivider", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1",
        "LayoutDirection": "=LayoutDirection.Horizontal"}))

    # ONE template child: the wrapper holds the row content AND the divider.
    return ("galAuList", ctl("Gallery", {**AUTOZ,
        "AccessibleLabel": '="App users"',
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=Max({ROW}, Min(galAuAll.AllItemsCount, {SIZE}) * {ROW})",
        "Items": AU_WINDOW, "ShowScrollbar": "=false", "TabIndex": "=0",
        "TemplatePadding": "=0", "TemplateSize": f"={ROW}"}, [
        ("conAuListRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "Width": "=Parent.TemplateWidth"}, [row_content, divider])),
    ], variant="Vertical"))


def empty_state():
    return ("conAuListEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(galAuAll.AllItemsCount = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galAuAll.AllItemsCount = 0"}, [
        mtext("lblAuListEmpty",
              ('=If(IsBlank(Trim(txtAuSearch.Text)) && Coalesce(CountRows(cmbAuRole.SelectedItems), 0) = 0,\n'
               '    "No users yet - add the first one.",\n'
               '    "No users match the current filters.")'),
              color="=UAB.Gray500", size="=UABSize.Body", height=20,
              extra={"Align": "=Align.Center"}),
    ]))


def pager():
    return ("conAuPager", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=12",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": f"=galAuAll.AllItemsCount > {SIZE}"}, [
        ("icoAuPagerPrev", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Previous page of users"',
            "Color": "=If(Coalesce(varAuPage, 1) <= 1, UAB.Gray300, UAB.Green)",
            "DisplayMode": ("=If(Coalesce(varAuPage, 1) <= 1, "
                            "DisplayMode.Disabled, DisplayMode.Edit)"),
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24",
            "Icon": "=Icon.ChevronLeft",
            "OnSelect": (f"=Set(varAuPage, Max(1, Min(Coalesce(varAuPage, 1), "
                         f"{PAGES}) - 1))"),
            "TabIndex": "=0", "Width": "=24"})),
        mtext("lblAuPager",
              (f'="Page " & Min(Coalesce(varAuPage, 1), {PAGES})'
               f' & " of " & {PAGES}'),
              extra={"Align": "=Align.Center", "Width": "=110"}),
        ("icoAuPagerNext", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Next page of users"',
            "Color": (f"=If(Coalesce(varAuPage, 1) >= {PAGES}, "
                      "UAB.Gray300, UAB.Green)"),
            "DisplayMode": (f"=If(Coalesce(varAuPage, 1) >= {PAGES}, "
                            "DisplayMode.Disabled, DisplayMode.Edit)"),
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24",
            "Icon": "=Icon.ChevronRight",
            "OnSelect": (f"=Set(varAuPage, Min({PAGES}, "
                         "Coalesce(varAuPage, 1) + 1))"),
            "TabIndex": "=0", "Width": "=24"})),
    ]))


def table_card():
    return ("conAuTableCard", con({**NOSHADOW, **AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": (f"=40 + Max({ROW}, Min(galAuAll.AllItemsCount, {SIZE}) * {ROW})"
                   f" + If(galAuAll.AllItemsCount > {SIZE}, 48, 0)"
                   " + If(galAuAll.AllItemsCount = 0, 44, 0)"),
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical"},
        [header_row(), twin(), list_gallery(), empty_state(), pager()]))


def root_children():
    return [
        header(),
        filter_row(),
        mtext("lblAuCount",
              ('=galAuAll.AllItemsCount & If(galAuAll.AllItemsCount = 1, '
               '" user", " users")'),
              color="=UAB.Gray500", height=18,
              extra={"Align": "=Align.Right", "Wrap": "=false"}),
        table_card(),
        mtext("lblAuBottomSpacer", '=""', color="=UAB.OffWhite", size="=2",
              height=6, extra={"Align": "=Align.Center", "Wrap": "=false"}),
    ]


# ---------------------------------------------------------------- modals

MODE = 'Coalesce(varAuMode, "add")'


def modal():
    panel = ("conAuPanel", con({
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "LayoutMaxHeight": "=Parent.Height - 32",
        **AUTOZ,
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24", "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": "=Min(560, Parent.Width - 32)"}, [
        ("conAuModalHead", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=34",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "PaddingLeft": "=2", "PaddingRight": "=2"}, [
            mtext("lblAuModalTitle",
                  f'=If({MODE} = "edit", "Edit user", "Add user")',
                  color="=UAB.TextPrimary", size="=20", height=31,
                  extra={"FillPortions": "=1",
                         "FontWeight": "=FontWeight.Semibold", "Wrap": "=false"}),
            ("icoAuClose", ctl("Classic/Icon", {**AUTOZ,
                "AccessibleLabel": '="Close the user editor"',
                "BorderColor": "=UAB.Line", "BorderStyle": "=BorderStyle.Solid",
                "BorderThickness": "=1", "Color": "=UAB.Gray500",
                "FocusedBorderColor": "=UAB.Gold", "Height": "=28",
                "Icon": "=Icon.Cancel", "OnSelect": "=Set(varAuShow, false)",
                "TabIndex": "=0", "Width": "=28"})),
        ])),
        # The picker collapses in edit mode - height AND visibility, because a
        # hidden AutoLayout child still reserves its space.
        field("conAuRowUser", "lblAuUserCap", "User",
              combo("cmbAuUser", "User", PICKER_ITEMS, "=ThisItem.PickerLabel",
                    False,
                    extra={"InputTextPlaceholder":
                           '="Type at least 2 letters of a name"'}),
              height=f'=If({MODE} = "edit", 0, 66)',
              extra={"Visible": f'={MODE} = "add"'}),
        mtext("lblAuEditing",
              ('="Editing " & Coalesce(varAuEditName, "")'
               ' & " · " & Coalesce(varAuEditEmail, "")'),
              color="=UAB.Gray700",
              height=f'=If({MODE} = "edit", 20, 0)',
              extra={"Visible": f'={MODE} = "edit"', "Wrap": "=false"}),
        ("conAuRowRoleDiv", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=66",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutGap": "=16"}, [
            # These two share the row, so they flex (FillPortions 1). A
            # FillPortions:=0 field with no Width would render 500px.
            field("conAuFRole", "lblAuRoleCap", "Role",
                  combo("cmbAuRole1", "Role", '=["HR", "Manager", "Viewer"]',
                        "=ThisItem.Value", False,
                        extra={"DefaultSelectedItems":
                               '=[Coalesce(varAuEditRole, "Viewer")]'}),
                  extra={"FillPortions": "=1"}),
            field("conAuFDiv", "lblAuDivCap", "Division (optional)",
                  combo("cmbAuDivision", "Division",
                        '=SortByColumns(Divisions, "Title")',
                        "=ThisItem.Title", False,
                        extra={"DefaultSelectedItems":
                               "=Filter(Divisions, ID = Coalesce(varAuEditDivId, 0))",
                               "InputTextPlaceholder": '="All divisions"'}),
                  extra={"FillPortions": "=1"}),
        ])),
        field("conAuRowChannel", "lblAuChanCap", "Notifications",
              combo("cmbAuChannel", "Notifications",
                    '=["Email", "Teams", "Email + Teams"]',
                    "=ThisItem.Value", False,
                    extra={"DefaultSelectedItems":
                           '=[Coalesce(varAuEditChan, "Email")]'})),
        ("conAuActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutGap": "=8"}, [
            button("btnAuSave", '="Save"', SAVE, 140,
                   label="Save this user"),
            button("btnAuCancel", '="Cancel"', "=Set(varAuShow, false)", 120,
                   secondary=True, label="Cancel and close the user editor",
                   extra={"FillPortions": "=1"}),
        ])),
    ]))

    return con({**NOSHADOW,
        "Fill": "=RGBA(32, 38, 45, 0.4)", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=Coalesce(varAuShow, false)", "Width": "=Parent.Width"},
        [panel])


def confirm():
    panel = ("conAuConfirmPanel", con({
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        **AUTOZ,
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24", "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": "=Min(440, Parent.Width - 32)"}, [
        mtext("lblAuConfirmTitle",
              '="Remove " & Coalesce(varAuDelName, "this user") & "?"',
              color="=UAB.TextPrimary", size="=20", height=30,
              extra={"FontWeight": "=FontWeight.Semibold", "Wrap": "=false"}),
        mtext("lblAuConfirmBody", CONFIRM_BODY, size="=UABSize.Body", height=66),
        ("conAuConfirmActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutGap": "=8"}, [
            button("btnAuConfirmDelete", '="Remove"', CONFIRM_DELETE, 150,
                   palette="=UAB.Danger",
                   label="Remove this user's access",
                   extra={"DisplayMode": (
                       '=If(Lower(Coalesce(varAuDelEmail, "")) = Lower(User().Email),'
                       " DisplayMode.Disabled, DisplayMode.Edit)")}),
            button("btnAuConfirmCancel", '="Cancel"',
                   "=Set(varAuShowConfirm, false)", 120, secondary=True,
                   label="Keep this user and close the dialog",
                   extra={"FillPortions": "=1"}),
        ])),
    ]))

    return con({**NOSHADOW,
        "Fill": "=RGBA(32, 38, 45, 0.4)", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=Coalesce(varAuShowConfirm, false)",
        "Width": "=Parent.Width"}, [panel])


# ---------------------------------------------------------------- main


def guard_button():
    """Hidden screen-level HR guard. OnVisible Selects it instead of Navigating."""
    return ctl("ModernButton", {
        "AccessibleLabel": '="HR guard"', "Height": "=1",
        "LayoutMinHeight": "=0", "LayoutMinWidth": "=0",
        "OnSelect": "=If(!IsHR, Navigate(scr_settings))", "Text": '="guard"',
        "Visible": "=false", "Width": "=1", "X": "=0", "Y": "=0"})


def build():
    # btnAuGuard sits after cntAdmUsersRoot, never before it: rail_stamp._rail_span()
    # reads the rail as every line from "- NavRail_" up to the "- cnt…Root:" line, so
    # anything in that gap is counted as rail and `rail_stamp.py verify` reports
    # MISMATCH. The button is invisible and 1x1, so its z-order is immaterial.
    body = emit_screen(SCREEN, {"Fill": "=UAB.OffWhite", "OnVisible": ONVISIBLE},
                       [content_root(SCREEN, "cntAdmUsersRoot", root_children()),
                        ("btnAuGuard", guard_button()),
                        ("conAuModal", modal()), ("conAuConfirm", confirm())])
    head, _, tail = body.partition("    Children:\n")
    return head + "    Children:\n" + rail_text(SCREEN, SFX) + tail


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write(OUT / f"{SCREEN}.pa.yaml", build())
