#!/usr/bin/env python3
"""Templates editor stage B: add / edit / delete a template task.

Splices an edit modal + a delete confirm into scr_templates and wires the task
rows and an "Add Task" button to them. All names new (Te prefix).

  python3 gen_templates_edit.py
"""
import pathlib

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control

SRC = pathlib.Path(__file__).parent / "src"
SM = "scr_templates.Size = ScreenSize.Small"
SEL = "Coalesce(varSelTemplateId, 0)"
T = f"LookUp(Templates, ID = {SEL})"
E = "varTeTask"

# Readiness is a snapshot, so every write has to refresh it or the checks lie.
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

RESET = ("Reset(txtTeTitle); Reset(cmbTeStage); Reset(cmbTeRole);\n"
         "Reset(cmbTeAnchor); Reset(numTeOffset); Reset(dpTeFixed);\n"
         "Reset(numTeOrder); Reset(cmbTePriority); Reset(cmbTeCategory);\n"
         "Reset(tglTeRequired); Reset(tglTePrereq); Reset(tglTeApproval)")

OPEN_EDIT = (f"=Set({E}, ThisItem);\n"
             "Set(varTeShow, true);\n"
             f"{RESET}")

FIELDS = (
    "{Title: Trim(txtTeTitle.Text),\n"
    " TemplateStage: If(IsBlank(cmbTeStage.Selected), Blank(),\n"
    "     {Id: cmbTeStage.Selected.ID,\n"
    "      Value: Coalesce(cmbTeStage.Selected.Title, cmbTeStage.Selected.Stage.Value)}),\n"
    " AssigneeRole: If(IsBlank(cmbTeRole.Selected), Blank(),\n"
    "     {Value: cmbTeRole.Selected.Value}),\n"
    " Anchor: If(IsBlank(cmbTeAnchor.Selected), Blank(),\n"
    "     {Value: cmbTeAnchor.Selected.Value}),\n"
    " OffsetDays: numTeOffset.Value,\n"
    ' FixedDate: If(Coalesce(cmbTeAnchor.Selected.Value, "") = "Fixed",\n'
    "     dpTeFixed.SelectedDate, Blank()),\n"
    " OrderIndex: numTeOrder.Value,\n"
    " Priority: If(IsBlank(cmbTePriority.Selected), Blank(),\n"
    "     {Value: cmbTePriority.Selected.Value}),\n"
    " Category: If(IsBlank(cmbTeCategory.Selected), Blank(),\n"
    "     {Value: cmbTeCategory.Selected.Value}),\n"
    " IsRequired: tglTeRequired.Checked,\n"
    " IsPrereq: tglTePrereq.Checked,\n"
    " NeedsApproval: tglTeApproval.Checked}")

SAVE = (
    "=IfError(\n"
    f"    If(IsBlank({E}),\n"
    "        Patch(TemplateTasks, Defaults(TemplateTasks),\n"
    f"            {{Template: {{Id: {SEL}, Value: {T}.Title}}}},\n"
    f"            {FIELDS.replace(chr(10), chr(10) + '        ')}),\n"
    f"        Patch(TemplateTasks, {E},\n"
    f"            {FIELDS.replace(chr(10), chr(10) + '        ')})),\n"
    '    Notify("Couldn\'t save the task - " & FirstError.Message\n'
    '        & " Nothing was changed. Try again.", NotificationType.Error),\n'
    "    Set(varTeShow, false);\n"
    f"    {RESTAT};\n"
    '    Notify("Task saved.", NotificationType.Success))')

DELETE = (
    "=IfError(\n"
    f"    RemoveIf(TemplateTasks, ID = {E}.ID),\n"
    '    Notify("Couldn\'t delete the task - " & FirstError.Message\n'
    '        & " Nothing was deleted. Try again.", NotificationType.Error),\n'
    "    Set(varTeConfirmDelete, false);\n"
    "    Set(varTeShow, false);\n"
    f"    {RESTAT};\n"
    '    Notify("Task deleted.", NotificationType.Success))')


def label(key, text):
    return (f"lblTe{key}Cap", ctl("ModernText", {**AUTOZ,
        "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=0",
        "FontWeight": "=FontWeight.Semibold", "Height": "=22",
        "Size": "=UABSize.Secondary", "Text": f'="{text}"', "Wrap": "=false"}))


def field(key, caption, control):
    return (f"conTeF{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=1", "Height": "=66",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"},
        [label(key, caption), control]))


def row(key, fields, phone_h):
    return (f"conTeRow{key}", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({SM}, {phone_h}, 66)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
        "LayoutGap": "=12"}, fields))


def choice_combo(key, column, default_expr):
    return (f"cmbTe{key}", ctl("ModernCombobox", {**AUTOZ,
        "DefaultSelectedItems": default_expr, "FillPortions": "=1", "Height": "=40",
        "ItemDisplayText": "=ThisItem.Value",
        "Items": f"=Choices(TemplateTasks.{column})",
        "SelectMultiple": "=false"}))


def toggle(key, caption, checked):
    return (f"tglTe{key}", ctl("Toggle", {**AUTOZ,
        "BasePaletteColor": "=UAB.Green", "Checked": checked, "FillPortions": "=1",
        "Height": "=40", "Label": f'="{caption}"'}))


def modal():
    panel_children = [
        ("conTeHead", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=34",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("lblTeTitle", ctl("ModernText", {**AUTOZ,
                "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=1",
                "FontWeight": "=FontWeight.Semibold", "Height": "=30", "Size": "=20",
                "Text": f'=If(IsBlank({E}), "Add Task", "Edit Task")', "Wrap": "=false"})),
            ("icoTeClose", ctl("Classic/Icon", {**AUTOZ,
                "BorderColor": "=UAB.Line", "BorderStyle": "=BorderStyle.Solid",
                "BorderThickness": "=1", "Color": "=UAB.Gray500", "FillPortions": "=0",
                "Height": "=28", "Icon": "=Icon.Cancel",
                "OnSelect": "=Set(varTeShow, false)", "Width": "=28"})),
        ])),
        row("Title", [
            field("Title", "Task name", ("txtTeTitle", ctl("ModernTextInput", {**AUTOZ,
                "Default": f'=Coalesce({E}.Title, "")', "FillPortions": "=1",
                "Height": "=40", "Placeholder": '="Required"'}))),
        ], 66),
        row("Stage", [
            field("Stage", "Stage", ("cmbTeStage", ctl("ModernCombobox", {**AUTOZ,
                "DefaultSelectedItems": (f"=Filter(TemplateStages, "
                                         f"ID = Coalesce({E}.TemplateStage.Id, 0))"),
                "FillPortions": "=1", "Height": "=40",
                "ItemDisplayText": "=ThisItem.PickerLabel",
                "Items": ("=AddColumns(\n"
                          f"    SortByColumns(Filter(TemplateStages, Template.Id = {SEL}),\n"
                          '        "OrderIndex", SortOrder.Ascending),\n'
                          "    PickerLabel, Coalesce(Stage.Value, Title))"),
                "SelectMultiple": "=false"}))),
            field("Role", "Assigned to", choice_combo("Role", "AssigneeRole",
                f'=Filter(Choices(TemplateTasks.AssigneeRole), Value = Coalesce({E}.AssigneeRole.Value, ""))')),
        ], 144),
        row("Anchor", [
            field("Anchor", "Due date anchor", choice_combo("Anchor", "Anchor",
                f'=Filter(Choices(TemplateTasks.Anchor), Value = Coalesce({E}.Anchor.Value, "None"))')),
            field("Offset", "Days from anchor", ("numTeOffset", ctl("ModernNumberInput", {**AUTOZ,
                "Default": f"=Coalesce({E}.OffsetDays, 0)", "FillPortions": "=1",
                "Height": "=40"}))),
        ], 144),
        row("Fixed", [
            field("Fixed", "Fixed date", ("dpTeFixed", ctl("ModernDatePicker", {**AUTOZ,
                "DefaultDate": f"={E}.FixedDate",
                # kept visible but disabled: a hidden sibling still reserves its width
                "DisplayMode": ('=If(Coalesce(cmbTeAnchor.Selected.Value, "") = "Fixed",\n'
                                "    DisplayMode.Edit, DisplayMode.Disabled)"),
                "FillPortions": "=1", "Height": "=40"}))),
            field("Order", "Order in stage", ("numTeOrder", ctl("ModernNumberInput", {**AUTOZ,
                "Default": f"=Coalesce({E}.OrderIndex, 0)", "FillPortions": "=1",
                "Height": "=40"}))),
        ], 144),
        row("Class", [
            field("Priority", "Priority", choice_combo("Priority", "Priority",
                f'=Filter(Choices(TemplateTasks.Priority), Value = Coalesce({E}.Priority.Value, "Medium"))')),
            field("Category", "Category", choice_combo("Category", "Category",
                f'=Filter(Choices(TemplateTasks.Category), Value = Coalesce({E}.Category.Value, "Other"))')),
        ], 144),
        ("conTeToggles", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "Height": f"=If({SM}, 144, 48)",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": f"=If({SM}, LayoutDirection.Vertical, LayoutDirection.Horizontal)",
            "LayoutGap": "=12"}, [
            toggle("Required", "Required", f"=Coalesce({E}.IsRequired, true)"),
            toggle("Prereq", "Prerequisite", f"=Coalesce({E}.IsPrereq, false)"),
            toggle("Approval", "Needs Approval", f"=Coalesce({E}.NeedsApproval, false)"),
        ])),
        ("lblTeHint", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray500", "FillPortions": "=0",
            "Height": f"=If({SM}, 44, 22)", "Size": "=UABSize.Secondary",
            "Text": ('=If(IsBlank(Trim(txtTeTitle.Text)),\n'
                     '        "Give the task a name.",\n'
                     "    IsBlank(cmbTeStage.Selected),\n"
                     '        "Choose which stage this task belongs to.",\n'
                     '    Coalesce(cmbTeAnchor.Selected.Value, "None") = "None",\n'
                     '        "No anchor — this task will have no due date.",\n'
                     '    Coalesce(cmbTeAnchor.Selected.Value, "") = "Fixed",\n'
                     '        "Due on the fixed date above.",\n'
                     '    "Due " & numTeOffset.Value & " days from " '
                     "& cmbTeAnchor.Selected.Value & \".\")"),
            "Wrap": f"=If({SM}, true, false)"})),
        ("conTeActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("btnTeSave", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Primary",
                "BasePaletteColor": "=UAB.Green",
                "DisplayMode": ("=If(And(!IsBlank(Trim(txtTeTitle.Text)),\n"
                                "        !IsBlank(cmbTeStage.Selected)),\n"
                                "    DisplayMode.Edit, DisplayMode.Disabled)"),
                "FillPortions": "=0", "Height": "=40", "OnSelect": SAVE,
                "Text": '="Save Task"', "Width": "=140"})),
            ("btnTeCancel", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Green", "FillPortions": "=1",
                "Height": "=40", "OnSelect": "=Set(varTeShow, false)",
                "Text": '="Cancel"', "Width": "=120"})),
            ("btnTeDelete", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Danger",
                "FillPortions": "=0", "Height": "=40",
                "OnSelect": "=Set(varTeConfirmDelete, true)",
                "Text": '="Delete"', "Visible": f"=!IsBlank({E})", "Width": "=110"})),
        ])),
        ("lblTeSpacer", ctl("ModernText", {**AUTOZ,
            "Align": "=Align.Center", "Color": "=UAB.White", "FillPortions": "=0",
            "Height": "=5", "Size": "=2", "Text": '=""', "Wrap": "=false"})),
    ]

    panel = ("conTePanel", con({**AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular", "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": f"=If({SM}, Min(760, Parent.Height - 32), 560)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "LayoutOverflowY": "=LayoutOverflow.Scroll",
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24",
        "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": "=Min(640, Parent.Width - 32)"}, panel_children))

    return ("conTeModal", con({**NOSHADOW, **AUTOZ,
        "Fill": "=RGBA(32, 38, 45, 0.4)", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=Coalesce(varTeShow, false)", "Width": "=Parent.Width"},
        [panel]))


def confirm():
    panel = ("conTeConfirmPanel", con({**AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular", "Fill": "=UAB.White",
        "FillPortions": "=0", "Height": "=190",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "PaddingBottom": "=24", "PaddingLeft": "=24", "PaddingRight": "=24",
        "PaddingTop": "=24",
        "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": "=Min(440, Parent.Width - 32)"}, [
        ("lblTeConfirmTitle", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.TextPrimary", "FillPortions": "=0",
            "FontWeight": "=FontWeight.Semibold", "Height": "=30", "Size": "=20",
            "Text": '="Delete This Task?"', "Wrap": "=false"})),
        ("lblTeConfirmBody", ctl("ModernText", {**AUTOZ,
            "AutoHeight": "=true", "Color": "=UAB.Gray700", "FillPortions": "=0",
            "Height": "=48", "Size": "=UABSize.Body",
            "Text": (f'="Remove " & Coalesce({E}.Title, "this task")\n'
                     '    & " from the template? Candidates already created keep their copy."'),
            "Wrap": "=true"})),
        ("conTeConfirmActions", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8"}, [
            ("btnTeConfirmDelete", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Primary",
                "BasePaletteColor": "=UAB.Danger", "FillPortions": "=0",
                "Height": "=40", "OnSelect": DELETE, "Text": '="Delete Task"',
                "Width": "=150"})),
            ("btnTeConfirmCancel", ctl("Button", {**AUTOZ,
                "Appearance": "='ButtonCanvas.Appearance'.Secondary",
                "BasePaletteColor": "=UAB.Green", "FillPortions": "=1",
                "Height": "=40", "OnSelect": "=Set(varTeConfirmDelete, false)",
                "Text": '="Keep It"', "Width": "=120"})),
        ])),
    ]))

    return ("conTeConfirm", con({**NOSHADOW, **AUTOZ,
        "Fill": "=RGBA(32, 38, 45, 0.4)", "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=Coalesce(varTeConfirmDelete, false)", "Width": "=Parent.Width"},
        [panel]))


def splice():
    p = SRC / "scr_templates.pa.yaml"
    text = p.read_text()
    assert "conTeModal" not in text, "already spliced"
    lines = text.split("\n")

    # 1. task rows open the editor
    n = 0
    for i, line in enumerate(lines):
        if line.strip() == "- lblTpTaskTitle:" or line.strip() == "- lblTpTaskSub:":
            n += 1
    assert n == 2, f"expected the two task-row labels, found {n}"
    out = []
    for line in lines:
        out.append(line)
    lines = out

    def add_prop(anchor, prop, value):
        i = next(k for k, l in enumerate(lines) if l.strip() == anchor)
        ind = len(lines[i]) - len(lines[i].lstrip())
        pad = " " * (ind + 6)
        pi = next(k for k in range(i, i + 8) if lines[k].strip() == "Properties:")
        block = ([f"{pad}{prop}: {value}"] if "\n" not in value
                 else [f"{pad}{prop}: |-"] + [f"{pad}  {v}" for v in value.split("\n")])
        k = pi + 1
        while (k < len(lines) and lines[k].startswith(pad)
               and lines[k].strip().split(":")[0] < prop):
            k += 1
            while k < len(lines) and lines[k].startswith(pad + "  "):
                k += 1
        lines[k:k] = block

    add_prop("- lblTpTaskTitle:", "OnSelect", OPEN_EDIT)
    add_prop("- lblTpTaskSub:", "OnSelect", OPEN_EDIT)

    # 2. an Add Task button in the tasks-card header
    i = next(k for k, l in enumerate(lines) if l.strip() == "- lblTpTasksEyebrow:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    j = i + 1
    while j < len(lines) and (not lines[j].strip()
                              or len(lines[j]) - len(lines[j].lstrip()) > ind):
        j += 1
    add_btn = ("btnTpAddTask", ctl("Button", {**AUTOZ,
        "Appearance": "='ButtonCanvas.Appearance'.Secondary",
        "BasePaletteColor": "=UAB.Green",
        "DisplayMode": f"=If({SEL} > 0, DisplayMode.Edit, DisplayMode.Disabled)",
        "FillPortions": "=0", "Height": "=36",
        "OnSelect": (f"=Set({E}, Blank());\n"
                     "Set(varTeShow, true);\n"
                     f"{RESET}"),
        "Text": '="Add Task"', "Width": "=120"}))
    lines[j:j] = emit_control(add_btn[0], add_btn[1], ind)

    # 3. modals as the last screen children (appended last = on top)
    i = next(k for k, l in enumerate(lines) if l.strip() == "- cntTemplatesRoot:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    j = i + 1
    while j < len(lines) and (not lines[j].strip()
                              or len(lines[j]) - len(lines[j].lstrip()) > ind):
        j += 1
    block = []
    for name, node in (modal(), confirm()):
        block += emit_control(name, node, ind)
    lines[j:j] = block

    out = "\n".join(lines)
    yaml.safe_load(out)
    p.write_text(out)
    print(f"spliced editor modal + delete confirm ({len(block)} lines)")


if __name__ == "__main__":
    splice()
