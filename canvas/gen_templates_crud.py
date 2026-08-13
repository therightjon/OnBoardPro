#!/usr/bin/env python3
"""Templates editor stage C: create/edit a template, and manage its stages.

Adds to scr_templates:
  * New Template button (picker header) + Edit Details on the header card
  * a template modal (name / candidate type / description)
  * a STAGES card listing the template's stages, with add and remove
  * a stage modal (stage / phase / order)

All names new (Tm = template modal, Sg = stages).

  python3 gen_templates_crud.py
"""
import pathlib

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_templates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelTemplateId, 0)"
T = f"LookUp(Templates, ID = {SEL})"
TM = "varTmTemplate"
SG = "varSgStage"

RESTAT = (
    "Set(varTpStats,\n"
    f"    With({{t: Filter(TemplateTasks, Template.Id = {SEL})}},\n"
    f"        {{stages: CountRows(Filter(TemplateStages, Template.Id = {SEL})),\n"
    "         tasks: CountRows(t),\n"
    "         unnamed: CountRows(Filter(t, IsBlank(Trim(Title)))),\n"
    "         stageless: CountRows(Filter(t, IsBlank(TemplateStage.Id))),\n"
    '         fixedNoDate: CountRows(Filter(t, Anchor.Value = "Fixed", IsBlank(FixedDate))),\n'
    "         prereqs: CountRows(Filter(t, IsPrereq)),\n"
    "         approvals: CountRows(Filter(t, NeedsApproval))}))")

TM_RESET = "Reset(txtTmName); Reset(cmbTmType); Reset(txtTmDesc)"
SG_RESET = "Reset(cmbSgStage); Reset(cmbSgPhase); Reset(numSgOrder)"

TM_SAVE = (
    "=IfError(\n"
    f"    With({{rec: If(IsBlank({TM}),\n"
    "            Patch(Templates, Defaults(Templates),\n"
    "                {Title: Trim(txtTmName.Text),\n"
    "                 CandidateType: If(IsBlank(cmbTmType.Selected), Blank(),\n"
    "                     {Value: cmbTmType.Selected.Value}),\n"
    "                 Description: txtTmDesc.Text,\n"
    '                 TStatus: {Value: "Draft"},\n'
    "                 Version: 1}),\n"
    f"            Patch(Templates, {TM},\n"
    "                {Title: Trim(txtTmName.Text),\n"
    "                 CandidateType: If(IsBlank(cmbTmType.Selected), Blank(),\n"
    "                     {Value: cmbTmType.Selected.Value}),\n"
    "                 Description: txtTmDesc.Text}))},\n"
    "        Set(varSelTemplateId, rec.ID)),\n"
    '    Notify("Couldn\'t save the template - " & FirstError.Message\n'
    '        & " Nothing was changed. Try again.", NotificationType.Error),\n'
    "    Set(varTmShow, false);\n"
    f"    {RESTAT};\n"
    '    Notify("Template saved.", NotificationType.Success))')

SG_SAVE = (
    "=IfError(\n"
    f"    If(IsBlank({SG}),\n"
    "        Patch(TemplateStages, Defaults(TemplateStages),\n"
    f"            {{Template: {{Id: {SEL}, Value: {T}.Title}},\n"
    "             Title: cmbSgStage.Selected.Title,\n"
    "             Stage: {Id: cmbSgStage.Selected.ID, Value: cmbSgStage.Selected.Title},\n"
    "             Phase: {Value: cmbSgPhase.Selected.Value},\n"
    "             OrderIndex: numSgOrder.Value,\n"
    "             IsActive: true}),\n"
    f"        Patch(TemplateStages, {SG},\n"
    "            {Title: cmbSgStage.Selected.Title,\n"
    "             Stage: {Id: cmbSgStage.Selected.ID, Value: cmbSgStage.Selected.Title},\n"
    "             Phase: {Value: cmbSgPhase.Selected.Value},\n"
    "             OrderIndex: numSgOrder.Value})),\n"
    '    Notify("Couldn\'t save the stage - " & FirstError.Message\n'
    '        & " Nothing was changed. Try again.", NotificationType.Error),\n'
    "    Set(varSgShow, false);\n"
    f"    {RESTAT};\n"
    '    Notify("Stage saved.", NotificationType.Success))')

# Removing a stage that still holds tasks would orphan them, so it is blocked.
SG_TASKS = f"CountRows(Filter(TemplateTasks, TemplateStage.Id = Coalesce({SG}.ID, 0)))"
SG_DELETE = (
    "=IfError(\n"
    f"    RemoveIf(TemplateStages, ID = {SG}.ID),\n"
    '    Notify("Couldn\'t remove the stage - " & FirstError.Message\n'
    '        & " Nothing was removed. Try again.", NotificationType.Error),\n'
    "    Set(varSgShow, false);\n"
    f"    {RESTAT};\n"
    '    Notify("Stage removed.", NotificationType.Success))')


def label(prefix, key, text):
    return (f"lbl{prefix}{key}Cap", ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=0",
        "FontWeight": "=FontWeight.Semibold", "Height": "=22",
        "Size": "=UABSize.Secondary", "Text": f'="{text}"', "Wrap": "=false"}))


def field(prefix, key, caption, control, height=66):
    return (f"con{prefix}F{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Height": f"={height}",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"},
        [label(prefix, key, caption), control]))


def modal(name, panel_name, height, width, children, visible):
    panel = (panel_name, con({**AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": height,
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24",
        "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": f"=Min({width}, Parent.Width - 32)"}, children))
    return (name, con({**NOSHADOW, **AUTOZ,
        "Fill": "=RGBA(32, 38, 45, 0.4)", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": visible, "Width": "=Parent.Width"}, [panel]))


def template_modal():
    children = [
        ("lblTmTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Semibold", "Height": "=30", "Size": "=20",
            "Text": f'=If(IsBlank({TM}), "New Template", "Edit Template")',
            "Wrap": "=false"})),
        field("Tm", "Name", "Template name", ("txtTmName", ctl("ModernTextInput", {**AUTOZ,
            "Default": f'=Coalesce({TM}.Title, "")', "FillPortions": "=1",
            "Height": "=40", "Placeholder": '="e.g. Faculty Hire - Clinical"'}))),
        field("Tm", "Type", "Applies to candidate type", ("cmbTmType", ctl("ModernCombobox", {**AUTOZ,
            "DefaultSelectedItems": ("=Filter(Choices(Templates.CandidateType),\n"
                                     f'    Value = Coalesce({TM}.CandidateType.Value, ""))'),
            "FillPortions": "=1", "Height": "=40",
            "ItemDisplayText": "=ThisItem.Value",
            "Items": "=Choices(Templates.CandidateType)",
            "SelectMultiple": "=false"}))),
        field("Tm", "Desc", "When to use this template",
              ("txtTmDesc", ctl("ModernTextInput", {**AUTOZ,
                  "Default": f'=Coalesce({TM}.Description, "")', "FillPortions": "=1",
                  "Height": "=76", "Placeholder": '="Optional"',
                  "Type": "=TextInputType.Multiline"})), height=102),
        ("conTmActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("btnTmSave", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Primary",
                "BasePaletteColor": "=UAB.Green",
                "DisplayMode": ("=If(And(!IsBlank(Trim(txtTmName.Text)),\n"
                                "        !IsBlank(cmbTmType.Selected)),\n"
                                "    DisplayMode.Edit, DisplayMode.Disabled)"),
                "FillPortions": "=0", "Height": "=40", "OnSelect": TM_SAVE,
                "Text": '="Save Template"', "Width": "=170"})),
            ("btnTmCancel", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Green", "FillPortions": "=1",
                "Height": "=40", "OnSelect": "=Set(varTmShow, false)",
                "Text": '="Cancel"', "Width": "=120"})),
        ])),
        ("lblTmHint", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "FillPortions": "=0",
            "Height": "=22", "Size": "=UABSize.Secondary",
            "Text": ('="New templates start as a draft. Add stages and tasks, '
                     'then activate."'),
            "Wrap": "=false"})),
    ]
    # 48 pad + 30 title + 66 + 66 + 102 + 44 + 22 + 6 gaps of 12
    return modal("conTmModal", "conTmPanel", "=450", 520, children,
                 "=Coalesce(varTmShow, false)")


def stage_modal():
    children = [
        ("lblSgTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Semibold", "Height": "=30", "Size": "=20",
            "Text": f'=If(IsBlank({SG}), "Add Stage", "Edit Stage")', "Wrap": "=false"})),
        field("Sg", "Stage", "Hiring stage", ("cmbSgStage", ctl("ModernCombobox", {**AUTOZ,
            "DefaultSelectedItems": f"=Filter(Stages, ID = Coalesce({SG}.Stage.Id, 0))",
            "FillPortions": "=1", "Height": "=40",
            "ItemDisplayText": "=ThisItem.Title",
            "Items": '=SortByColumns(Stages, "OrderIndex", SortOrder.Ascending)',
            "SelectMultiple": "=false"}))),
        field("Sg", "Phase", "Phase", ("cmbSgPhase", ctl("ModernCombobox", {**AUTOZ,
            "DefaultSelectedItems": ("=Filter(Choices(TemplateStages.Phase),\n"
                                     f'    Value = Coalesce({SG}.Phase.Value, "Pre-Hire"))'),
            "FillPortions": "=1", "Height": "=40",
            "ItemDisplayText": "=ThisItem.Value",
            "Items": "=Choices(TemplateStages.Phase)",
            "SelectMultiple": "=false"}))),
        field("Sg", "Order", "Order", ("numSgOrder", ctl("ModernNumberInput", {**AUTOZ,
            "Default": (f"=Coalesce({SG}.OrderIndex,\n"
                        f"    CountRows(Filter(TemplateStages, Template.Id = {SEL})) + 1)"),
            "FillPortions": "=1", "Height": "=40"}))),
        ("lblSgHint", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true",
            "Color": f"=If({SG_TASKS} > 0, UAB.Danger, UAB.Gray500)",
            "FillPortions": "=0", "Height": "=44", "Size": "=UABSize.Secondary",
            "Text": (f"=If(IsBlank({SG}),\n"
                     '        "Pre-hire stages run before the start date; onboarding after.",\n'
                     f"    {SG_TASKS} > 0,\n"
                     f'        "This stage holds " & {SG_TASKS} & " tasks. '
                     'Move them to another stage before removing it.",\n'
                     '    "This stage has no tasks, so it can be removed safely.")'),
            "Wrap": "=true"})),
        ("conSgActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("btnSgSave", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Primary",
                "BasePaletteColor": "=UAB.Green",
                "DisplayMode": ("=If(!IsBlank(cmbSgStage.Selected),\n"
                                "    DisplayMode.Edit, DisplayMode.Disabled)"),
                "FillPortions": "=0", "Height": "=40", "OnSelect": SG_SAVE,
                "Text": '="Save Stage"', "Width": "=140"})),
            ("btnSgCancel", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Green", "FillPortions": "=1",
                "Height": "=40", "OnSelect": "=Set(varSgShow, false)",
                "Text": '="Cancel"', "Width": "=110"})),
            ("btnSgDelete", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Danger",
                "DisplayMode": (f"=If({SG_TASKS} = 0, DisplayMode.Edit, "
                                "DisplayMode.Disabled)"),
                "FillPortions": "=0", "Height": "=40", "OnSelect": SG_DELETE,
                "Text": '="Remove"', "Visible": f"=!IsBlank({SG})", "Width": "=110"})),
        ])),
    ]
    # 48 pad + 30 + 66 + 66 + 66 + 44 + 44 + 6 gaps of 12
    return modal("conSgModal", "conSgPanel", "=436", 480, children,
                 "=Coalesce(varSgShow, false)")


def stages_card():
    head = ("conSgHead", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        ("lblSgEyebrow", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Bold", "Height": "=22",
            "Size": "=UABSize.Eyebrow", "Text": '="STAGES"', "Wrap": "=false"})),
        ("btnSgAdd", ctl("Button", {**AUTOZ,
            "Appearance": "='ButtonCanvas.Appearance'.Secondary",
            "BasePaletteColor": "=UAB.Green",
            "DisplayMode": f"=If({SEL} > 0, DisplayMode.Edit, DisplayMode.Disabled)",
            "FillPortions": "=0", "Height": "=36",
            "OnSelect": (f"=Set({SG}, Blank());\n"
                         "Set(varSgShow, true);\n"
                         f"{SG_RESET}"),
            "Text": '="Add Stage"', "Width": "=120"})),
    ]))

    row = ("conSgRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth"}, [
        ("conSgRowContent", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=47",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
            "PaddingLeft": "=4", "PaddingRight": "=4"}, [
            ("lblSgRowName", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=1",
                "Height": "=25",
                "OnSelect": (f"=Set({SG}, ThisItem);\n"
                             "Set(varSgShow, true);\n"
                             f"{SG_RESET}"),
                "Size": "=UABSize.Body",
                "Text": ('=Coalesce(ThisItem.OrderIndex, 0) & ".  "\n'
                         '    & Coalesce(ThisItem.Stage.Value, ThisItem.Title, "(no stage)")'),
                "Wrap": "=false"})),
            ("lblSgRowMeta", ctl("ModernText", {**AUTOZ,
                "Align": "=Align.Right", "AutoHeight": "=true", "Color": "=UAB.Gray500",
                "FillPortions": "=0", "Height": "=22",
                "OnSelect": (f"=Set({SG}, ThisItem);\n"
                             "Set(varSgShow, true);\n"
                             f"{SG_RESET}"),
                "Size": "=UABSize.Secondary",
                "Text": ('=Coalesce(ThisItem.Phase.Value, "Pre-Hire") & "  ·  "\n'
                         '    & CountRows(Filter(TemplateTasks,\n'
                         '        TemplateStage.Id = ThisItem.ID)) & " tasks"'),
                "Width": "=190", "Wrap": "=false"})),
        ])),
        ("conSgRowDivider", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1"})),
    ]))

    gallery = ("galSgStages", ctl("Gallery", {**AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1",
        "Items": ("=SortByColumns(\n"
                  f"    Filter(TemplateStages, Template.Id = {SEL}),\n"
                  '    "OrderIndex", SortOrder.Ascending)'),
        "TemplatePadding": "=0", "TemplateSize": "=48"},
        [row], variant="Vertical"))

    empty = ("conSgEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": "=If(galSgStages.AllItemsCount = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=galSgStages.AllItemsCount = 0"}, [
        ("lblSgEmpty", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "AutoHeight": "=true", "Color": "=UAB.Gray500",
            "Height": "=25", "Size": "=UABSize.Body",
            "Text": '="No stages yet — add the first one."'})),
    ]))

    return ("conSgCard", con({**AUTOZ,
        "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "DropShadow": "=DropShadow.None", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": ("=With({n: Coalesce(varTpStats.stages, 0)},\n"
                   f"    If({SM}, 96, 104) + Min(n, 6) * 48 + If(n = 0, 44, 0))"),
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": f"=If({SM}, 16, 24)",
        "PaddingLeft": f"=If({SM}, 16, 24)",
        "PaddingRight": f"=If({SM}, 16, 24)",
        "PaddingTop": f"=If({SM}, 16, 24)",
        "Visible": f"={SEL} > 0"}, [head, gallery, empty]))


def splice():
    p = SRC / "scr_templates.pa.yaml"
    lines = p.read_text().split("\n")
    assert "conTmModal" not in "\n".join(lines), "already spliced"

    def block_of(anchor):
        i = next(k for k, l in enumerate(lines) if l.strip() == anchor)
        ind = len(lines[i]) - len(lines[i].lstrip())
        j = i + 1
        while j < len(lines) and (not lines[j].strip()
                                  or len(lines[j]) - len(lines[j].lstrip()) > ind):
            j += 1
        return i, j, ind

    # 1. New Template + Edit Details buttons on the header card
    i, j, ind = block_of("- lblTpEyebrow:")
    new_btn = ("btnTpNew", ctl("Button", {**AUTOZ,
        "Appearance": "='ButtonCanvas.Appearance'.Secondary",
        "BasePaletteColor": "=UAB.Green", "FillPortions": "=0", "Height": "=36",
        "OnSelect": (f"=Set({TM}, Blank());\n"
                     "Set(varTmShow, true);\n"
                     f"{TM_RESET}"),
        "Text": '="New Template"', "Width": "=150"}))
    edit_btn = ("btnTpEditDetails", ctl("Button", {**AUTOZ,
        "Appearance": "='ButtonCanvas.Appearance'.Secondary",
        "BasePaletteColor": "=UAB.Green",
        "DisplayMode": f"=If({SEL} > 0, DisplayMode.Edit, DisplayMode.Disabled)",
        "FillPortions": "=0", "Height": "=36",
        "OnSelect": (f"=Set({TM}, {T});\n"
                     "Set(varTmShow, true);\n"
                     f"{TM_RESET}"),
        "Text": '="Edit Details"', "Width": "=140"}))
    # the eyebrow must yield its slack so the buttons sit right
    hdr_row = ("conTpHeadRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
        ("lblTpEyebrow2", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Green", "FillPortions": "=1",
            "FontWeight": "=FontWeight.Bold", "Height": "=22",
            "Size": "=UABSize.Eyebrow", "Text": '="TEMPLATE"', "Wrap": "=false"})),
        edit_btn, new_btn,
    ]))
    lines[i:j] = emit_control(hdr_row[0], hdr_row[1], ind)

    # header card grows by the button row (22 -> 40)
    i2, j2, _ = block_of("- conTpHead:")
    pad = " " * (len(lines[i2]) - len(lines[i2].lstrip()) + 6)
    k = next(x for x in range(i2, j2) if lines[x].startswith(pad + "Height:"))
    end = k + 1
    while end < j2 and lines[end].startswith(pad + "  "):
        end += 1
    lines[k:end] = [f"{pad}Height: |-",
                    f"{pad}  =If({SM}, 258, 218)"]

    # 2. stages card, before the tasks card
    i3, _, ind3 = block_of("- conTpTasksCard:")
    name, node = stages_card()
    lines[i3:i3] = emit_control(name, node, ind3)

    # 3. the two modals last, after the existing ones
    i4 = next(k for k, l in enumerate(lines) if l.strip() == "- conTeConfirm:")
    ind4 = len(lines[i4]) - len(lines[i4].lstrip())
    j4 = i4 + 1
    while j4 < len(lines) and (not lines[j4].strip()
                               or len(lines[j4]) - len(lines[j4].lstrip()) > ind4):
        j4 += 1
    block = []
    for nm, nd in (template_modal(), stage_modal()):
        block += emit_control(nm, nd, ind4)
    lines[j4:j4] = block

    out = "\n".join(lines)
    yaml.safe_load(out)
    p.write_text(out)
    print("spliced template modal, stages card, stage modal")


if __name__ == "__main__":
    splice()
