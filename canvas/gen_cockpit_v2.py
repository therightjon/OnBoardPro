"""Cockpit additions: candidate email, a clickable status, ad-hoc tasks, comment notifies.

Four changes to scr_candidates, all app-only - no schema or flow work:

1. The candidate's email on the header card. HR reads it out constantly and was
   going to the SharePoint list for it.
2. The status pill becomes a button that opens a picker with the five TStatus
   values the list already defines (To Do, In Progress, Blocked, Done, Canceled).
   Canceled demands a reason, because F3 reverts a cancel that arrives without
   one - the guard would otherwise silently undo the user's click.
3. Add Task on the checklist, writing a candidate-specific task the template did
   not carry. Denormalised CandName/StageName/StageOrder/Phase are stamped the
   same way F1 stamps them, and UpdatedVia "App" hands logging to F3.
4. A Notify picker on the comment composer, filling Comments.NotifyUsers - the
   column the plan added in place of parsing @mentions out of the body.

src/*.pa.yaml is canonical; this splices rather than regenerates.
"""
import pathlib

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control

SRC = pathlib.Path(__file__).parent / "src" / "scr_candidates.pa.yaml"
SMALL = "scr_candidates.Size = ScreenSize.Small"
CAND = "LookUp(Candidates, ID = Coalesce(varSelCandId, 0))"
STATUSES = ["To Do", "In Progress", "Blocked", "Done", "Canceled"]

lines = SRC.read_text().split("\n")


def set_prop(anchor, prop, value):
    a = next(k for k, l in enumerate(lines) if l.strip() == anchor)
    ind = len(lines[a]) - len(lines[a].lstrip())
    head, pad = " " * (ind + 4), " " * (ind + 6)
    ps = next(k for k in range(a, len(lines)) if lines[k] == head + "Properties:")
    pe = next((k for k in range(ps + 1, len(lines))
               if lines[k].strip() and not lines[k].startswith(pad)), len(lines))
    block = "\n" in value or ": " in value
    body = ([f"{pad}{prop}: |-"] + [f"{pad}  {v}" for v in value.split("\n")]
            if block else [f"{pad}{prop}: {value}"])
    k = next((x for x in range(ps + 1, pe) if lines[x].startswith(pad + prop + ":")), None)
    if k is None:
        keys = [x for x in range(ps + 1, pe)
                if lines[x].startswith(pad) and lines[x][len(pad)] != " "]
        k = next((x for x in keys if lines[x].strip().split(":")[0] > prop), pe)
        lines[k:k] = body
        return
    end = k + 1
    while end < pe and lines[end].startswith(pad + "  "):
        end += 1
    lines[k:end] = body


def insert_before(anchor, name, node):
    i = next(k for k, l in enumerate(lines) if l.strip() == anchor)
    lines[i:i] = emit_control(name, node, len(lines[i]) - len(lines[i].lstrip()))


def append_screen_child(name, node):
    i = next(k for k, l in enumerate(lines) if l.strip() == "- conPvModal:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    lines.extend(emit_control(name, node, ind))


def scrim(visible, panel_name, panel, height):
    return con({
        **NOSHADOW,
        "Fill": "=RGBA(32, 38, 45, 0.4)",
        "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": visible,
        "Width": "=Parent.Width",
    }, [(panel_name, con({
        "AlignInContainer": "=AlignInContainer.Center",
        "DropShadow": "=DropShadow.Regular",
        "Fill": "=UAB.White",
        "FillPortions": "=0",
        "Height": height,
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutGap": "=12",
        **AUTOZ,
        "PaddingBottom": "=24", "PaddingLeft": "=24",
        "PaddingRight": "=24", "PaddingTop": "=24",
        "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8",
        "Width": "=Min(520, Parent.Width - 32)",
    }, panel))])


def heading(text, size=20, height=34):
    return ctl("ModernText", {
        "AutoHeight": "=true", "Color": "=UAB.TextPrimary",
        "FontWeight": "=FontWeight.Semibold", "Height": f"={height}", **AUTOZ,
        "Size": f"={size}", "Text": text, "Wrap": "=false",
    })


def caption(text):
    return ctl("ModernText", {
        "AutoHeight": "=true", "Color": "=UAB.Gray700",
        "FontWeight": "=FontWeight.Semibold", "Height": "=20", **AUTOZ,
        "Size": "=UABSize.Secondary", "Text": text, "Wrap": "=false",
    })


# ---- 1. the candidate's email on the header -------------------------------
insert_before("- conCKPillRow:", "lblCKHeadEmail", ctl("ModernText", {
    "AutoHeight": "=true",
    "Color": "=UAB.Gray500",
    "Height": "=23",
    **AUTOZ,
    "Size": "=UABSize.Secondary",
    "Text": f'=Coalesce({CAND}.Email, "No email on file")',
    "Wrap": "=false",
}))
set_prop("- conCKHead:", "Height", f"=If({SMALL}, 441, 336)")

# ---- 2. the status pill becomes a picker ----------------------------------
# The pill is a container, so the tappable surface is the label inside it.
set_prop("- lblTkPillStatus:", "OnSelect",
         "=Set(varTkStatusTask, ThisItem);\n"
         "Set(varTkCancelReason, \"\");\n"
         "Set(varTkStatusShow, true)")

status_buttons = []
for s in STATUSES:
    safe = s.replace(" ", "")
    status_buttons.append((f"btnTkSt{safe}", ctl("Button", {
        "Appearance": "='ButtonCanvas.Appearance'.Secondary",
        "BasePaletteColor": "=UAB.Green",
        "DisplayMode": (
            f'=If(Coalesce(varTkStatusTask.TStatus.Value, "To Do") = "{s}",\n'
            "    DisplayMode.Disabled, DisplayMode.Edit)"),
        "Height": "=40",
        **AUTOZ,
        # Canceled needs a reason or F3's guard reverts it straight back.
        "OnSelect": (
            "=IfError(\n"
            f"    Patch(Tasks, LookUp(Tasks, ID = varTkStatusTask.ID),\n"
            f'        {{TStatus: {{Value: "{s}"}},\n'
            f'         CompletedDate: If("{s}" = "Done", Today(), Blank()),\n'
            f'         CancelReason: If("{s}" = "Canceled", Trim(txtTkCancelReason.Text),\n'
            "             varTkStatusTask.CancelReason),\n"
            '         UpdatedVia: "App"}),\n'
            '    Notify("Couldn\'t update the status - " & FirstError.Message\n'
            '        & " Nothing changed. Try again.", NotificationType.Error),\n'
            f'    Notify(varTkStatusTask.Title & " is now {s}.",\n'
            "        NotificationType.Success));\n"
            "Set(varTkStatusShow, false)"),
        "Text": f'="{s}"',
        "Width": "=Parent.Width - 48",
    })))

status_panel = [
    ("lblTkStTitle", heading("=Coalesce(varTkStatusTask.Title, \"Task\")")),
    ("lblTkStNow", ctl("ModernText", {
        "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=20", **AUTOZ,
        "Size": "=UABSize.Secondary",
        "Text": '="Currently " & Coalesce(varTkStatusTask.TStatus.Value, "To Do")'
                ' & ". Pick a new status."',
        "Wrap": "=false",
    })),
] + status_buttons + [
    ("lblTkStReasonCap", ctl("ModernText", {
        "AutoHeight": "=true", "Color": "=UAB.Gray700",
        "FontWeight": "=FontWeight.Semibold",
        "Height": "=20", **AUTOZ, "Size": "=UABSize.Secondary",
        "Text": '="Reason (required to cancel)"', "Wrap": "=false",
    })),
    ("txtTkCancelReason", ctl("ModernTextInput", {
        "Height": "=36", "LayoutMinHeight": "=36", "LayoutMinWidth": "=0",
        "Placeholder": '="Why is this being canceled?"',
    })),
    ("btnTkStClose", ctl("Button", {
        "Appearance": "='ButtonCanvas.Appearance'.Secondary",
        "BasePaletteColor": "=UAB.Green", "Height": "=40", **AUTOZ,
        "OnSelect": "=Set(varTkStatusShow, false)",
        "Text": '="Close"', "Width": "=120",
    })),
]
append_screen_child("conTkStatusModal", scrim(
    "=Coalesce(varTkStatusShow, false)", "conTkStatusPanel", status_panel, "=470"))

# Canceled is the one status that cannot go through without the reason box filled.
set_prop("- btnTkStCanceled:", "DisplayMode",
         '=If(Or(Coalesce(varTkStatusTask.TStatus.Value, "To Do") = "Canceled",\n'
         "       IsBlank(Trim(txtTkCancelReason.Text))),\n"
         "    DisplayMode.Disabled, DisplayMode.Edit)")

# ---- 3. ad-hoc task on the checklist --------------------------------------
insert_before("- lblTkCounts:", "btnTkAdd", ctl("Button", {
    "Appearance": "='ButtonCanvas.Appearance'.Secondary",
    "BasePaletteColor": "=UAB.Green",
    "DisplayMode": (f"=If(And(Coalesce(varSelCandId, 0) > 0, IsManagerOrHR),\n"
                    "    DisplayMode.Edit, DisplayMode.Disabled)"),
    "FillPortions": "=0",
    "Height": "=32",
    **AUTOZ,
    "OnSelect": ("=Reset(txtTaTitle); Reset(cmbTaStage); Reset(cmbTaRole);\n"
                 "Reset(dpTaDue); Reset(cmbTaPriority); Reset(tglTaRequired);\n"
                 "Set(varTaShow, true)"),
    "Text": '="Add Task"',
    "Width": "=110",
}))

add_panel = [
    ("lblTaTitle", heading('="Add a Task"')),
    ("lblTaSub", ctl("ModernText", {
        "AutoHeight": "=true", "Color": "=UAB.Gray500", "Height": "=38", **AUTOZ,
        "Size": "=UABSize.Secondary",
        "Text": ('="This task belongs to " & Coalesce(FriendlyName(' + CAND
                 + '.Title), "this candidate")\n'
                 '    & " only. It is not added to the template."'),
    })),
    ("lblTaTitleCap", caption('="Task name"')),
    ("txtTaTitle", ctl("ModernTextInput", {
        "Height": "=36", "LayoutMinHeight": "=36", "LayoutMinWidth": "=0",
        "Placeholder": '="Required"',
    })),
    ("conTaRow1", con({
        **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=64",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": "=12", **AUTOZ,
    }, [
        ("conTaStage", con({
            **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutGap": "=4", **AUTOZ,
        }, [
            ("lblTaStageCap", caption('="Stage"')),
            ("cmbTaStage", ctl("ModernCombobox", {
                "Height": "=36",
                "ItemDisplayText": "=ThisItem.Title",
                "Items": '=SortByColumns(Filter(Stages, IsActive), "OrderIndex",'
                         " SortOrder.Ascending)",
                **AUTOZ, "SelectMultiple": "=false",
            })),
        ])),
        ("conTaRole", con({
            **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutGap": "=4", **AUTOZ,
        }, [
            ("lblTaRoleCap", caption('="Assigned to"')),
            ("cmbTaRole", ctl("ModernCombobox", {
                "Height": "=36",
                "ItemDisplayText": "=ThisItem.Value",
                "Items": "=Choices(Tasks.AssigneeRole)",
                **AUTOZ, "SelectMultiple": "=false",
            })),
        ])),
    ])),
    ("conTaRow2", con({
        **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=64",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": "=12", **AUTOZ,
    }, [
        ("conTaDue", con({
            **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutGap": "=4", **AUTOZ,
        }, [
            ("lblTaDueCap", caption('="Due date"')),
            ("dpTaDue", ctl("ModernDatePicker", {"Height": "=36", **AUTOZ})),
        ])),
        ("conTaPrio", con({
            **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutGap": "=4", **AUTOZ,
        }, [
            ("lblTaPrioCap", caption('="Priority"')),
            ("cmbTaPriority", ctl("ModernCombobox", {
                "DefaultSelectedItems": '=Filter(Choices(Tasks.Priority),'
                                        ' Value = "Medium")',
                "Height": "=36",
                "ItemDisplayText": "=ThisItem.Value",
                "Items": "=Choices(Tasks.Priority)",
                **AUTOZ, "SelectMultiple": "=false",
            })),
        ])),
    ])),
    ("tglTaRequired", ctl("Toggle", {
        "BasePaletteColor": "=UAB.Green",
        "Default": "=true",
        "Height": "=36",
        "Label": '="Required to finish the stage"',
        **AUTOZ,
    })),
    ("conTaActions", con({
        **NOSHADOW, "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=44",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutGap": "=8", **AUTOZ,
    }, [
        ("btnTaSave", ctl("Button", {
            "Appearance": "='ButtonCanvas.Appearance'.Primary",
            "BasePaletteColor": "=UAB.Green",
            "DisplayMode": "=If(!IsBlank(Trim(txtTaTitle.Text)),\n"
                           "    DisplayMode.Edit, DisplayMode.Disabled)",
            "Height": "=40", **AUTOZ,
            # F1 stamps these denormalised columns on every task it creates;
            # an ad-hoc task has to look identical or the checklist, the stage
            # roll-up and F3's advancement all read it differently.
            "OnSelect": (
                "=IfError(\n"
                "    Patch(Tasks, Defaults(Tasks),\n"
                f"        {{Candidate: {{Id: Coalesce(varSelCandId, 0),\n"
                f"                     Value: {CAND}.Title}},\n"
                f"         CandName: {CAND}.Title,\n"
                "         Title: Trim(txtTaTitle.Text),\n"
                "         Stage: If(IsBlank(cmbTaStage.Selected), Blank(),\n"
                "             {Id: cmbTaStage.Selected.ID,\n"
                "              Value: cmbTaStage.Selected.Title}),\n"
                '         StageName: Coalesce(cmbTaStage.Selected.Title, ""),\n'
                "         StageOrder: Coalesce(cmbTaStage.Selected.OrderIndex, 0),\n"
                "         TStatus: {Value: \"To Do\"},\n"
                "         Priority: If(IsBlank(cmbTaPriority.Selected),\n"
                '             {Value: "Medium"}, {Value: cmbTaPriority.Selected.Value}),\n'
                "         AssigneeRole: If(IsBlank(cmbTaRole.Selected), Blank(),\n"
                "             {Value: cmbTaRole.Selected.Value}),\n"
                "         DueDate: dpTaDue.SelectedDate,\n"
                "         PendingAnchor: false,\n"
                "         IsRequired: tglTaRequired.Checked,\n"
                "         IsPrereq: false,\n"
                "         NeedsApproval: false,\n"
                '         Anchor: {Value: "None"},\n'
                '         UpdatedVia: "App"}),\n'
                '    Notify("Couldn\'t add the task - " & FirstError.Message\n'
                '        & " Nothing was created. Try again.", NotificationType.Error),\n'
                '    Notify(Trim(txtTaTitle.Text) & " added.", NotificationType.Success));\n'
                "Set(varTaShow, false)"),
            "Text": '="Add Task"', "Width": "=130",
        })),
        ("btnTaCancel", ctl("Button", {
            "Appearance": "='ButtonCanvas.Appearance'.Secondary",
            "BasePaletteColor": "=UAB.Green", "Height": "=40", **AUTOZ,
            "OnSelect": "=Set(varTaShow, false)",
            "Text": '="Cancel"', "Width": "=110",
        })),
    ])),
]
append_screen_child("conTaModal", scrim(
    "=Coalesce(varTaShow, false)", "conTaPanel", add_panel, "=560"))

# ---- 4. notify people on a comment ----------------------------------------
insert_before("- btnCmPost:", "cmbCmNotify", ctl("ModernCombobox", {
    "FillPortions": "=1",
    "Height": "=36",
    "InputTextPlaceholder": '="Notify people…"',
    "ItemDisplayText": "=ThisItem.DisplayName",
    "Items": ("=Filter(Office365Users.SearchUser({searchTerm:"
              " Trim(cmbCmNotify.SearchText), top: 30}),\n"
              "    Len(Trim(cmbCmNotify.SearchText)) >= 2,\n"
              "    !IsBlank(Surname),\n"
              '    !StartsWith(DisplayName, "!"))'),
    **AUTOZ,
    "SelectMultiple": "=true",
}))

text = "\n".join(lines)
yaml.safe_load(text)
SRC.write_text(text)

doc = yaml.safe_load(text)
names = []


def walk(n):
    for ch in n.get("Children", []) or []:
        for k, b in ch.items():
            names.append(k)
            walk(b)


walk(doc["Screens"]["scr_candidates"])
dupes = {n for n in names if names.count(n) > 1}
if dupes:
    raise SystemExit(f"duplicate control names: {sorted(dupes)}")
print(f"cockpit v2 spliced: {len(names)} controls, no duplicate names")
