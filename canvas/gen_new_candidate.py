#!/usr/bin/env python3
"""Screen 3: New Candidate.

Replaces the stub body of scr_new_candidate with a guided form (Nc prefix, all new
names). Creating a candidate calls F1 in prereq mode and lands on the cockpit, so
HR's one action produces a record AND its first tasks.

People columns are set WITHOUT the Office 365 Users connector:
  * PrimaryOwner  = the signed-in user, built as a claims record
  * Manager       = an AppPermissions row's AppUser (already a person record)
Adding Office 365 Users would allow picking any employee, but that is a new
tenant connection and needs Jon's go-ahead first.

  python3 gen_new_candidate.py
"""
import pathlib

import yaml

from gen_app import (AUTOZ, NOSHADOW, con, ctl, emit_screen, nav_rail,
                     content_root)

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_new_candidate.Size = ScreenSize.Small"

ME = ('{Claims: "i:0#.f|membership|" & Lower(User().Email),\n'
      '     Department: "", DisplayName: User().FullName, Email: User().Email,\n'
      '     JobTitle: "", Picture: ""}')

REQUIRED = (
    "And(!IsBlank(Trim(txtNcFirst.Text)),\n"
    "    !IsBlank(Trim(txtNcLast.Text)),\n"
    "    IsMatch(Trim(txtNcEmail.Text), Match.Email),\n"
    "    !IsBlank(cmbNcType.Selected),\n"
    "    !IsBlank(cmbNcTemplate.Selected))")

CREATE = (
    "=IfError(\n"
    "    With({rec: Patch(Candidates, Defaults(Candidates),\n"
    "        {Title: Trim(txtNcLast.Text) & \", \" & Trim(txtNcFirst.Text),\n"
    "         FirstName: Trim(txtNcFirst.Text),\n"
    "         LastName: Trim(txtNcLast.Text),\n"
    "         Salutation: If(IsBlank(cmbNcSalutation.Selected), Blank(),\n"
    "             {Value: cmbNcSalutation.Selected.Value}),\n"
    "         Email: Trim(txtNcEmail.Text),\n"
    "         CandidateType: {Value: cmbNcType.Selected.Value},\n"
    "         Department: {Id: 1, Value: \"Obstetrics and Gynecology\"},\n"
    "         Division: If(IsBlank(cmbNcDivision.Selected), Blank(),\n"
    "             {Id: cmbNcDivision.Selected.ID, Value: cmbNcDivision.Selected.Title}),\n"
    "         FacultyRank: If(IsBlank(cmbNcRank.Selected), Blank(),\n"
    "             {Id: cmbNcRank.Selected.ID, Value: cmbNcRank.Selected.Title}),\n"
    "         Template: {Id: cmbNcTemplate.Selected.ID,\n"
    "             Value: cmbNcTemplate.Selected.Title},\n"
    "         Manager: If(IsBlank(cmbNcManager.Selected), Blank(),\n"
    "             cmbNcManager.Selected.AppUser),\n"
    f"         PrimaryOwner: {ME},\n"
    "         CStatus: {Value: \"Active\"},\n"
    "         LOIDate: dpNcLOI.SelectedDate})},\n"
    "        Set(varSelCandId, rec.ID);\n"
    "        'OnBoard-ApplyTemplate'.Run(rec.ID, \"prereq\");\n"
    "        Refresh(Tasks); Refresh(Candidates);\n"
    '        Notify("Candidate created. Prerequisite tasks are being added.",\n'
    "            NotificationType.Success);\n"
    "        Navigate(scr_candidates)),\n"
    '    Notify("Couldn\'t create the candidate - " & FirstError.Message\n'
    '        & " Nothing was saved. Try again.", NotificationType.Error))')

HINT = (
    f"=If({REQUIRED}, \"Creates the record and adds its prerequisite tasks.\",\n"
    "    IsBlank(Trim(txtNcFirst.Text)) || IsBlank(Trim(txtNcLast.Text)),\n"
    '        "Enter the candidate\'s first and last name.",\n'
    "    IsBlank(Trim(txtNcEmail.Text)),\n"
    '        "Enter the candidate\'s email address.",\n'
    "    !IsMatch(Trim(txtNcEmail.Text), Match.Email),\n"
    '        "That email address doesn\'t look right.",\n'
    "    IsBlank(cmbNcType.Selected),\n"
    '        "Choose the candidate type.",\n'
    '    "Choose the template that builds this candidate\'s checklist.")')


def field(key, caption, control, height=40):
    return (f"conNcF{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Height": "=66",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        (f"lblNc{key}Cap", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Semibold", "Height": "=22",
            "Size": "=UABSize.Secondary", "Text": f'="{caption}"', "Wrap": "=false"})),
        control,
    ]))


def row(key, fields, phone_height, height=66):
    return (f"conNcRow{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, {phone_height}, {height})",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": "=12"}, fields))


def card(key, title, phone_height, height, children):
    return (f"conNcCard{key}", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": f"=If({SM}, {phone_height}, {height})",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)"}, [
        (f"lblNc{key}Eyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Bold", "Height": "=22",
            "Size": "=UABSize.Eyebrow", "Text": f'="{title}"', "Wrap": "=false"})),
    ] + children))


def build():
    header = ("cntNcHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=84",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        ("lblNcTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
            "FontWeight": "=FontWeight.Semibold", "Height": "=44",
            "Size": "=UABSize.ScreenTitle", "Text": '="New Candidate"'})),
        ("lblNcSub", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=22",
            "Size": "=UABSize.Secondary",
            "Text": ('="Creating a candidate also starts their checklist. '
                     'You can change any of this later."'),
            "Wrap": "=false"})),
    ]))

    person = card("Person", "CANDIDATE", 412, 260, [
        row("Name", [
            field("Salutation", "Title", ("cmbNcSalutation", ctl("ModernCombobox", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "ItemDisplayText": "=ThisItem.Value",
                "Items": "=Choices(Candidates.Salutation)",
                "SelectMultiple": "=false"}))),
            field("First", "First name", ("txtNcFirst", ctl("ModernTextInput", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40", "Placeholder": '="Required"'}))),
            field("Last", "Last name", ("txtNcLast", ctl("ModernTextInput", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40", "Placeholder": '="Required"'}))),
        ], phone_height=222),
        row("Email", [
            field("Email", "Email address", ("txtNcEmail", ctl("ModernTextInput", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "Placeholder": '="name@uab.edu"'}))),
        ], phone_height=66),
    ])

    position = card("Position", "POSITION", 366, 148, [
        row("Pos", [
            field("Type", "Candidate type", ("cmbNcType", ctl("ModernCombobox", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "ItemDisplayText": "=ThisItem.Value",
                "Items": "=Choices(Candidates.CandidateType)",
                "SelectMultiple": "=false"}))),
            field("Division", "Division", ("cmbNcDivision", ctl("ModernCombobox", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "ItemDisplayText": "=ThisItem.Title",
                "Items": '=SortByColumns(Divisions, "Title", SortOrder.Ascending)',
                "SelectMultiple": "=false"}))),
            field("Rank", "Faculty rank", ("cmbNcRank", ctl("ModernCombobox", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "ItemDisplayText": "=ThisItem.Title",
                "Items": "=FacultyRanks", "SelectMultiple": "=false"}))),
            field("Template", "Template", ("cmbNcTemplate", ctl("ModernCombobox", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "ItemDisplayText": "=ThisItem.Title",
                "Items": '=SortByColumns(Templates, "Title", SortOrder.Ascending)',
                "SelectMultiple": "=false"}))),
        ], phone_height=300),
    ])

    process = card("Process", "PEOPLE & DATES", 210, 148, [
        row("Proc", [
            field("Manager", "Hiring manager", ("cmbNcManager", ctl("ModernCombobox", {**AUTOZ,
                "FillPortions": "=0", "Height": "=40",
                "ItemDisplayText": "=ThisItem.AppUser.DisplayName",
                "Items": "=AppPermissions", "SelectMultiple": "=false"}))),
            field("LOI", "Letter of Intent date", ("dpNcLOI", ctl("ModernDatePicker", {**AUTOZ,
                "DefaultDate": "=Blank()",
                "FillPortions": "=0", "Height": "=40"}))),
        ], phone_height=144),
    ])

    actions = ("conNcActions", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 110, 78)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=8"}, [
        ("conNcButtons", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": "=44",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("btnNcCreate", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Primary",
                "BasePaletteColor": "=UAB.Green",
                "DisplayMode": (f"=If({REQUIRED}, DisplayMode.Edit, "
                                "DisplayMode.Disabled)"),
                "FillPortions": f"=If({SM}, 1, 0)", "Height": "=40",
                "OnSelect": CREATE, "Text": '="Create candidate"',
                "Width": f"=If({SM}, 160, 190)"})),
            ("btnNcCancel", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Green",
                "FillPortions": f"=If({SM}, 1, 0)", "Height": "=40",
                "OnSelect": "=Navigate(scr_candidates)", "Text": '="Cancel"',
                "Width": f"=If({SM}, 110, 120)"})),
        ])),
        ("lblNcHint", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true",
            "Color": f"=If({REQUIRED}, UAB.Gray500, UAB.Gray700)",
            "FillPortions": "=0", "Height": f"=If({SM}, 48, 24)",
            "Size": "=UABSize.Secondary", "Text": HINT,
            "Wrap": f"=If({SM}, true, false)"})),
    ]))

    spacer = ("lblNcSpacer", ctl("ModernText", {**AUTOZ,
        "Align": "=Align.Center", "Color": "=UAB.OffWhite", "Height": "=24",
        "Size": "=2", "Text": '=""', "Wrap": "=false"}))

    props = {
        "Fill": "=UAB.OffWhite",
        # a form left half-filled must not greet the next hire
        "OnVisible": ("=Reset(txtNcFirst); Reset(txtNcLast); Reset(txtNcEmail);\n"
                      "Reset(cmbNcSalutation); Reset(cmbNcType); Reset(cmbNcDivision);\n"
                      "Reset(cmbNcRank); Reset(cmbNcTemplate); Reset(cmbNcManager);\n"
                      "Reset(dpNcLOI)"),
    }
    return emit_screen("scr_new_candidate", props,
                       [nav_rail("scr_new_candidate"),
                        content_root("scr_new_candidate", "cntNewCandRoot",
                                     [header, person, position, process,
                                      actions, spacer])])


if __name__ == "__main__":
    text = build()
    yaml.safe_load(text)
    (SRC / "scr_new_candidate.pa.yaml").write_text(text)
    print(f"wrote scr_new_candidate.pa.yaml ({len(text.splitlines())} lines)")
