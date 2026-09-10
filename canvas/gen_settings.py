#!/usr/bin/env python3
"""Emit scr_settings.pa.yaml — the Settings hub.

Everyone lands here from the Settings nav item: a "My notifications" card
(role pill, division, and the NotifyChannel picker saved through
'OnBoard-SetNotifyChannel') plus, for HR only, two tiles into the admin
screens.

gen_app.nav_rail() is stale (four items, no accessibility props) — the rail
comes from rail_stamp.rail_text() so every screen carries the same six-item
block byte-for-byte.

  python3 gen_settings.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_screen, content_root, pill, write
from rail_stamp import rail_text

SCREEN, SFX = "scr_settings", "Settings"
SM = f"{SCREEN}.Size = ScreenSize.Small"

# The card is capped at 640 but the content root stretches its children, so the
# cap only bites with an explicit AlignInContainer (the modal recipe's rule:
# "panels have rendered full-width without it").
START = {"AlignInContainer": "=AlignInContainer.Start"}

CARD = {**NOSHADOW, **AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1", "Fill": "=UAB.White",
        "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8"}

# Primary/secondary ModernButton chrome, copied from btnTlNew / btnTlClear.
BTN = {**AUTOZ, "Align": "=Align.Center", "BasePaletteColor": "=UAB.Green",
       "FontWeight": '=""', "PaddingBottom": "=5", "PaddingLeft": "=12",
       "PaddingRight": "=12", "PaddingTop": "=5",
       "RadiusBottomLeft": "=4", "RadiusBottomRight": "=4",
       "RadiusTopLeft": "=4", "RadiusTopRight": "=4",
       "VerticalAlign": "=VerticalAlign.Middle"}

PERM_GATE = "=If(IsBlank(MyPermRow), DisplayMode.Disabled, DisplayMode.Edit)"

SAVE_CHANNEL = (
    "=IfError(\n"
    "    With({r: 'OnBoard-SetNotifyChannel'.Run(cmbStChannel.Selected.Value)},\n"
    "        If(r.ok,\n"
    "           Refresh(AppPermissions); Notify(r.message, NotificationType.Success),\n"
    "           Notify(\"Couldn't save: \" & r.message, NotificationType.Error))),\n"
    "    Notify(\"Couldn't save your preference - \" & FirstError.Message, NotificationType.Error))")

NOTE_TEXT = (
    "=If(IsBlank(MyPermRow),\n"
    '    "No app profile yet - ask HR to add you.",\n'
    '    "Assignment, digest, and approval emails always go by email.'
    ' This setting adds Teams for everything else.")')

SUB_TEXT = ('=If(IsHR, "Your notification preference and app administration.",'
            ' "Your notification preference.")')

# 20 padding top+bottom (40) + icon 28 + title 29 + sub 22 + button 32 + 3 * 8
# gap = 175. The brief's 140 predates that sum; audit-canvas-ui R8 and
# audit-responsive-heights both measure it, so the tile is 176 and the strip
# holding two of them is 2 * 176 + 16 on the phone.
TILE_H = 176
# Collapsed to 0 when the strip is hidden: a Visible: =false AutoLayout child
# still reserves its height, which left a Viewer 368px of dead scroll on a phone.
TILES_H = f"=If(IsHR, If({SM}, {TILE_H * 2 + 16}, {TILE_H}), 0)"


# ---------------------------------------------------------------- header


def header():
    return ("cntStHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 88, 100)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8"}, [
        ("lblStTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": '="Settings"',
            "Wrap": "=false"})),
        ("lblStSub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=20",
            "Size": "=UABSize.Body", "Text": SUB_TEXT})),
    ]))


# ---------------------------------------------------------------- me card


def me_card():
    meta = ("conStMeMeta", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=24",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=12"}, [
        pill("StRole", 90, "=RoleFill(MyRole)", "=RoleColor(MyRole)", "=MyRole"),
        # FillPortions 1 so the division absorbs the row's slack instead of
        # collapsing — a Wrap:=false label in a non-Stretch parent otherwise
        # renders narrower than its own text (audit rule R2).
        ("lblStMeDiv", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
            "Height": "=18", "Size": "=UABSize.Secondary",
            "Text": '=Coalesce(MyPermRow.Division.Value, "All divisions")',
            "Wrap": "=false"})),
    ]))

    field = ("conStMeField", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Height": "=66",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        ("lblStChanCap", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Semibold", "Height": "=22",
            "Size": "=UABSize.Secondary", "Text": '="Send my notifications by"',
            "Wrap": "=false"})),
        ("cmbStChannel", ctl("ModernCombobox", {**AUTOZ,
            "AccessibleLabel": '="Send my notifications by"',
            "DefaultSelectedItems": "=[MyNotifyChannel]",
            "DisplayMode": PERM_GATE,
            "FillPortions": "=1", "Height": "=40",
            "ItemDisplayText": "=ThisItem.Value",
            "Items": '=["Email", "Teams", "Email + Teams"]',
            "SelectMultiple": "=false"})),
    ]))

    row = ("conStMeRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, 132, 66)",
        "LayoutAlignItems": (f"=If({SM}, LayoutAlignItems.Stretch,"
                             " LayoutAlignItems.End)"),
        "LayoutDirection": (f"=If({SM}, LayoutDirection.Vertical,"
                            " LayoutDirection.Horizontal)"),
        "LayoutGap": "=12"}, [
        field,
        # conStMeRow stretches its children on the phone, which would blow the
        # 120px Save button out to full width; End keeps it right-aligned under
        # the field on the phone and bottom-aligned beside it on the desktop.
        ("btnStSave", ctl("ModernButton", {**BTN,
            "AccessibleLabel": '="Save notification preference"',
            "AlignInContainer": "=AlignInContainer.End",
            "DisplayMode": PERM_GATE, "Height": "=40",
            "OnSelect": SAVE_CHANNEL, "Text": '="Save"', "Width": "=120"})),
    ]))

    return ("conStMeCard", con({**CARD, **START,
        "FillPortions": "=0",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": "=20", "PaddingLeft": "=20", "PaddingRight": "=20",
        "PaddingTop": "=20", "Width": "=Min(640, Parent.Width)"}, [
        ("lblStEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green",
            "FontWeight": "=FontWeight.Bold", "Height": "=18",
            "Size": "=UABSize.Eyebrow", "Text": '="MY NOTIFICATIONS"',
            "Wrap": "=false"})),
        ("lblStMeName", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=30",
            "Size": "=UABSize.SectionHeading",
            "Text": "=FriendlyName(User().FullName)", "Wrap": "=false"})),
        meta,
        row,
        ("lblStMeNote", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=40",
            "Size": "=UABSize.Secondary", "Text": NOTE_TEXT, "Wrap": "=true"})),
    ]))


# ---------------------------------------------------------------- HR tiles


def tile(key, icon, title, sub, accessible, target):
    return (f"conStTile{key}", con({**CARD,
        "FillPortions": "=1", "Height": f"={TILE_H}",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8",
        "PaddingBottom": "=20", "PaddingLeft": "=20", "PaddingRight": "=20",
        "PaddingTop": "=20"}, [
        (f"icoStTile{key}", ctl("Classic/Icon", {**AUTOZ, **START,
            "AccessibleLabel": f'="{accessible}"', "Color": "=UAB.Green",
            "Height": "=28", "Icon": f"={icon}", "Width": "=28"})),
        (f"lblStTile{key}T", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=24",
            "Size": "=UABSize.FieldLabel", "Text": f'="{title}"',
            "Wrap": "=false"})),
        (f"lblStTile{key}S", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=18",
            "Size": "=UABSize.Secondary", "Text": sub, "Wrap": "=false"})),
        (f"btnStOpen{key}", ctl("ModernButton", {**BTN, **START,
            "AccessibleLabel": f'="{accessible}"',
            "Appearance": "=ButtonAppearance.Secondary", "Height": "=32",
            "OnSelect": f"=Navigate({target})", "Text": '="Manage"',
            "Width": "=100"})),
    ]))


def tiles():
    # Last real block of the content root on purpose (only the 6px spacer follows):
    # a hidden AutoLayout child still reserves its space, so a Visible-gated block
    # is only safe at the tail - and its Height collapses to 0 for non-HR anyway.
    return ("conStTiles", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": TILES_H,
        # The tiles are FillPortions 1 along the main axis; Stretch is what makes
        # them fill the width on the cross axis once the strip stacks vertically.
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": (f"=If({SM}, LayoutDirection.Vertical,"
                            " LayoutDirection.Horizontal)"),
        "LayoutGap": "=16", "Visible": "=IsHR"}, [
        tile("Users", "Icon.People", "Users & roles",
             '=CountRows(AppPermissions) & " users with an app profile"',
             "Users and roles", "scr_admin_users"),
        tile("Ref", "Icon.Tools", "Reference data",
             ('=CountRows(Divisions) & " divisions · " & CountRows(FacultyRanks)'
              ' & " ranks · " & CountRows(Stages) & " stages"'),
             "Reference data", "scr_admin_refdata"),
    ]))


# ---------------------------------------------------------------- assembly


def bottom_spacer():
    # Property-for-property copy of lblAuBottomSpacer on scr_admin_users: a 6px
    # tail so the last block clears the content root's bottom padding on scroll.
    return ("lblStBottomSpacer", ctl("ModernText", {**AUTOZ,
        "Align": "=Align.Center", "AutoHeight": "=true", "Color": "=UAB.OffWhite",
        "Height": "=6", "Size": "=2", "Text": '=""', "Wrap": "=false"}))


def root_children():
    return [header(), me_card(), tiles(), bottom_spacer()]


def build():
    body = emit_screen(SCREEN,
                       {"Fill": "=UAB.OffWhite",
                        "OnVisible": "=Refresh(AppPermissions)"},
                       [content_root(SCREEN, "cntSettingsRoot", root_children())])
    # emit_screen writes "    Children:\n" once; the rail goes first inside it
    head, _, tail = body.partition("    Children:\n")
    return head + "    Children:\n" + rail_text(SCREEN, SFX) + tail


if __name__ == "__main__":
    write(pathlib.Path(__file__).parent / "src" / f"{SCREEN}.pa.yaml", build())
