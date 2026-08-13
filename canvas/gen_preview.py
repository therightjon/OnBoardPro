"""Splices the Due Date Preview into the candidate cockpit.

Adds a Preview Due Dates button to the KEY DATES & TEMPLATE actions row and a
modal that shows every task the template would create, with the due date each
one would land on.

The date math mirrors F1/F2 exactly (provision/flows-f1-test-full.json ->
Anchors + DueDate, provision/gen_f2.py -> NewDue):

    anchorDate = Anchor = "Fixed" ? FixedDate : Anchors[Anchor]
    due        = Anchor = "None" or anchorDate blank ? blank
                                                    : anchorDate + OffsetDays

Plain calendar days, no weekend adjustment. A blank due date here is exactly
what the flow writes as PendingAnchor = yes.

src/*.pa.yaml is canonical and has diverged from the generators - this script
splices into the existing file rather than regenerating it.
"""
import pathlib
import re

import yaml

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_control, write

SRC = pathlib.Path(__file__).parent / "src" / "scr_candidates.pa.yaml"
SMALL = "scr_candidates.Size = ScreenSize.Small"

CAND = "LookUp(Candidates, ID = Coalesce(varSelCandId, 0))"
TID = f"Coalesce(cmbDtTemplate.Selected.ID, {CAND}.Template.Id, 0)"
PT = f"Coalesce(LookUp(FacultyRanks, ID = Coalesce({CAND}.FacultyRank.Id, 0)).RequiresPT, false)"
PREDONE = f"!IsBlank({CAND}.PrereqsExpanded)"
# The preview runs off the pickers, not the saved row, so HR can dial a date
# and watch the schedule move before committing.
MODE = 'If(IsBlank(dpDtLOOAcc.SelectedDate), "prereq", "full")'

PREREQ_OK = (
    "Or(IsBlank(PrereqCondition.Value),\n"
    '                        PrereqCondition.Value = "Always",\n'
    f'                        And(PrereqCondition.Value = "Requires P&T", {PT}))'
)

# Filter_Applicable from F1, transcribed.
APPLICABLE = (
    f'If({MODE} = "prereq",\n'
    f"                    And(IsPrereq, {PREREQ_OK}),\n"
    "                    Or(Not(IsPrereq),\n"
    f"                       And(IsPrereq, Not({PREDONE}), {PREREQ_OK})))"
)

SNAPSHOT = f"""ClearCollect(colPvPreview,
    SortByColumns(
        AddColumns(
            Filter(TemplateTasks,
                Template.Id = {TID},
                {APPLICABLE}),
            PvDue,
                With({{a: Coalesce(Anchor.Value, "None")}},
                    With({{ad: Switch(a,
                            "Fixed", FixedDate,
                            "LOI", dpDtLOI.SelectedDate,
                            "LOO Issued", dpDtLOOIss.SelectedDate,
                            "LOO Accepted", dpDtLOOAcc.SelectedDate,
                            "Start", dpDtStart.SelectedDate,
                            Blank())}},
                        If(Or(a = "None", IsBlank(ad)), Blank(),
                            DateAdd(ad, Coalesce(OffsetDays, 0), TimeUnit.Days)))),
            PvRule,
                With({{a: Coalesce(Anchor.Value, "None"), n: Coalesce(OffsetDays, 0)}},
                    If(a = "None", "No date rule",
                       a = "Fixed", "Fixed date",
                       n = 0, "On " & a,
                       n < 0, Abs(n) & If(n = -1, " day before ", " days before ") & a,
                       n & If(n = 1, " day after ", " days after ") & a)),
            PvStage, Coalesce(TemplateStage.Value, "No stage"),
            PvRole, Coalesce(AssigneeRole.Value, "No role")),
        "OrderIndex", SortOrder.Ascending));
Set(varPvShow, true)"""

# Blank dates format to "" so a picker the maker never touched compares equal.
DATE_PAIRS = [
    ("dpDtLOI.SelectedDate", f"{CAND}.LOIDate"),
    ("dpDtLOOIss.SelectedDate", f"{CAND}.LOOIssued"),
    ("dpDtLOOAcc.SelectedDate", f"{CAND}.LOOAccepted"),
    ("dpDtStart.SelectedDate", f"{CAND}.StartDate"),
]
UNSAVED = "Or(\n    " + ",\n    ".join(
    f'Text({a}, "yyyy-mm-dd") <> Text({b}, "yyyy-mm-dd")' for a, b in DATE_PAIRS
) + ")"


def fold(desktop_width):
    """Column that collapses to zero width on a phone."""
    return {
        "Width": f"=If({SMALL}, 0, {desktop_width})",
        "Visible": f"=!({SMALL})",
    }


def preview_button():
    return ctl("Button", {
        "Appearance": "='ButtonCanvas.Appearance'.Secondary",
        "BasePaletteColor": "=UAB.Green",
        "DisplayMode": (
            f"=If(And(Coalesce(varSelCandId, 0) > 0, !IsBlank(cmbDtTemplate.Selected)),\n"
            "    DisplayMode.Edit, DisplayMode.Disabled)"
        ),
        "FillPortions": "=0",
        "Height": "=40",
        **AUTOZ,
        "OnSelect": "=" + SNAPSHOT,
        "Text": '="Preview Due Dates"',
        "Width": f"=If({SMALL}, Parent.Width, 165)",
    })


def header_cell(text, width_prop, align="Start"):
    props = {
        "Color": "=UAB.Gray500",
        "FontWeight": "=FontWeight.Semibold",
        "Height": "=20",
        **AUTOZ,
        "Size": "=UABSize.Eyebrow",
        "Text": f'="{text}"',
        "Wrap": "=false",
    }
    props.update(width_prop)
    if align != "Start":
        props["Align"] = f"=Align.{align}"
    return ctl("ModernText", props)


def row():
    return con({
        **NOSHADOW,
        "Fill": "=UAB.White",
        "Height": "=Parent.TemplateHeight",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "Width": "=Parent.TemplateWidth",
    }, [
        ("conPvRowBody", con({
            **NOSHADOW,
            "Fill": "=UAB.White",
            "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Center",
            "LayoutDirection": "=LayoutDirection.Horizontal",
            "LayoutGap": "=8",
            **AUTOZ,
        }, [
            ("conPvRowMain", con({
                **NOSHADOW,
                "Fill": "=UAB.White",
                "FillPortions": "=1",
                "LayoutAlignItems": "=LayoutAlignItems.Stretch",
                "LayoutDirection": "=LayoutDirection.Vertical",
                "LayoutGap": "=2",
                **AUTOZ,
            }, [
                ("lblPvRowTitle", ctl("ModernText", {
                    "Color": "=UAB.TextPrimary",
                    "FontWeight": "=FontWeight.Semibold",
                    "Height": "=22",
                    **AUTOZ,
                    "Size": "=UABSize.Body",
                    "Text": "=ThisItem.Title",
                    "Wrap": "=false",
                })),
                ("lblPvRowMeta", ctl("ModernText", {
                    "Color": "=UAB.Gray500",
                    "Height": "=18",
                    **AUTOZ,
                    "Size": "=UABSize.Secondary",
                    "Text": '=ThisItem.PvStage & "  ·  " & ThisItem.PvRole',
                    "Wrap": "=false",
                })),
                # On a phone the rule column is gone, so it moves under the title.
                ("lblPvRowRuleSmall", ctl("ModernText", {
                    "Color": "=UAB.Gray500",
                    "Height": f"=If({SMALL}, 18, 0)",
                    **AUTOZ,
                    "Size": "=UABSize.Secondary",
                    "Text": "=ThisItem.PvRule",
                    "Visible": f"={SMALL}",
                    "Wrap": "=false",
                })),
            ])),
            ("lblPvRowRule", ctl("ModernText", {
                "Color": "=UAB.Gray700",
                "Height": "=22",
                **AUTOZ,
                "Size": "=UABSize.Secondary",
                "Text": "=ThisItem.PvRule",
                "Wrap": "=false",
                **fold(190),
            })),
            ("lblPvRowDue", ctl("ModernText", {
                "Align": "=Align.Right",
                "Color": "=If(IsBlank(ThisItem.PvDue), UAB.InfoText, UAB.TextPrimary)",
                "FontWeight": "=FontWeight.Semibold",
                "Height": "=22",
                **AUTOZ,
                "Size": "=UABSize.Body",
                "Text": (
                    '=If(IsBlank(ThisItem.PvDue), "Awaiting a Date",\n'
                    '    Text(ThisItem.PvDue, "ddd, mmm d, yyyy"))'
                ),
                "Width": f"=If({SMALL}, 122, 150)",
                "Wrap": "=false",
            })),
        ])),
        ("lblPvRowLine", ctl("ModernText", {
            "Fill": "=UAB.Line",
            "Height": "=1",
            **AUTOZ,
            "Text": '=""',
        })),
    ])


def modal():
    return con({
        **NOSHADOW,
        "Fill": "=RGBA(32, 38, 45, 0.4)",
        "Height": "=Parent.Height",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": "=Coalesce(varPvShow, false)",
        "Width": "=Parent.Width",
    }, [
        ("conPvPanel", con({
            "AlignInContainer": "=AlignInContainer.Center",
            "DropShadow": "=DropShadow.Regular",
            "Fill": "=UAB.White",
            "FillPortions": "=0",
            "Height": f"=If({SMALL}, Parent.Height - 32, Min(Parent.Height - 48, 640))",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutGap": "=12",
            **AUTOZ,
            "PaddingBottom": f"=If({SMALL}, 16, 24)",
            "PaddingLeft": f"=If({SMALL}, 16, 24)",
            "PaddingRight": f"=If({SMALL}, 16, 24)",
            "PaddingTop": f"=If({SMALL}, 16, 24)",
            "RadiusBottomLeft": "=8",
            "RadiusBottomRight": "=8",
            "RadiusTopLeft": "=8",
            "RadiusTopRight": "=8",
            "Width": "=Min(760, Parent.Width - 32)",
        }, [
            ("lblPvTitle", ctl("ModernText", {
                "Color": "=UAB.TextPrimary",
                "FontWeight": "=FontWeight.Semibold",
                "Height": "=31",
                **AUTOZ,
                "Size": "=20",
                "Text": '="Due Date Preview"',
                "Wrap": "=false",
            })),
            ("lblPvSub", ctl("ModernText", {
                "Color": "=UAB.Gray500",
                "Height": "=20",
                **AUTOZ,
                "Size": "=UABSize.Secondary",
                "Text": (
                    '=Coalesce(cmbDtTemplate.Selected.Title, "No template selected")\n'
                    '    & "  ·  " & If(IsBlank(dpDtLOOAcc.SelectedDate),\n'
                    '        "Prerequisites Only", "Full Checklist")'
                ),
                "Wrap": "=false",
            })),
            ("lblPvCounts", ctl("ModernText", {
                "Color": "=UAB.Gray700",
                "Height": f"=If({SMALL}, 40, 22)",
                **AUTOZ,
                "Size": "=UABSize.Body",
                "Text": (
                    "=With({n: CountRows(colPvPreview),\n"
                    "       dated: CountRows(Filter(colPvPreview, !IsBlank(PvDue))),\n"
                    "       pend: CountRows(Filter(colPvPreview, IsBlank(PvDue)))},\n"
                    '    n & If(n = 1, " Task", " Tasks")\n'
                    '    & If(dated = 0, "",\n'
                    '        "  ·  " & Text(Min(colPvPreview, PvDue), "mmm d, yyyy")\n'
                    '            & "  –  " & Text(Max(colPvPreview, PvDue), "mmm d, yyyy"))\n'
                    '    & If(pend = 0, "", "  ·  " & pend & " Awaiting a Date"))'
                ),
                "Wrap": f"={SMALL}",
            })),
            ("lblPvNote", ctl("ModernText", {
                "AutoHeight": "=true",
                "Color": f"=If({UNSAVED}, UAB.GoldText, UAB.Gray500)",
                "Height": f"=If({SMALL}, 54, 36)",
                **AUTOZ,
                "Size": "=UABSize.Secondary",
                "Text": (
                    f"=If({UNSAVED},\n"
                    '    "Previewing with the dates in the form, which you have not saved yet. '
                    'Save Dates first or the real due dates will differ.",\n'
                    '    "Awaiting a Date means the task has a rule but the date it counts from '
                    'is not set yet. Those fill in on their own once you set it.")'
                ),
            })),
            ("conPvHead", con({
                **NOSHADOW,
                "Fill": "=UAB.Paper",
                "FillPortions": "=0",
                "Height": "=28",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Horizontal",
                "LayoutGap": "=8",
                **AUTOZ,
                "PaddingLeft": "=8",
                "PaddingRight": "=8",
            }, [
                ("lblPvHeadTask", header_cell("TASK", {"FillPortions": "=1"})),
                ("lblPvHeadRule", header_cell("DUE RULE", fold(190))),
                ("lblPvHeadDue", header_cell(
                    "DUE DATE", {"Width": f"=If({SMALL}, 122, 150)"}, align="Right")),
            ])),
            ("galPvTasks", ctl("Gallery", {
                "Fill": "=UAB.White",
                "FillPortions": "=1",
                "Items": "=colPvPreview",
                **AUTOZ,
                "TemplatePadding": "=0",
                "TemplateSize": f"=If({SMALL}, 76, 64)",
            }, [("conPvRow", row())], variant="Vertical")),
            ("lblPvEmpty", ctl("ModernText", {
                "Align": "=Align.Center",
                "Color": "=UAB.Gray500",
                "Height": "=If(CountRows(colPvPreview) = 0, 22, 0)",
                **AUTOZ,
                "Size": "=UABSize.Secondary",
                "Text": (
                    '="This template has no tasks that apply to this candidate yet."'
                ),
                "Visible": "=CountRows(colPvPreview) = 0",
            })),
            ("conPvActions", con({
                **NOSHADOW,
                "Fill": "=UAB.White",
                "FillPortions": "=0",
                "Height": "=44",
                "LayoutAlignItems": "=LayoutAlignItems.Center",
                "LayoutDirection": "=LayoutDirection.Horizontal",
                "LayoutJustifyContent": "=LayoutJustifyContent.End",
                **AUTOZ,
            }, [
                ("btnPvClose", ctl("Button", {
                    "Appearance": "='ButtonCanvas.Appearance'.Primary",
                    "BasePaletteColor": "=UAB.Green",
                    "Height": "=40",
                    **AUTOZ,
                    "OnSelect": "=Set(varPvShow, false); Clear(colPvPreview)",
                    "Text": '="Close"',
                    "Width": "=120",
                })),
            ])),
        ])),
    ])


def splice(text):
    lines = text.split("\n")

    # 1. The actions row goes vertical on a phone so three buttons still fit.
    i = next(k for k, l in enumerate(lines) if l.strip() == "- conDtActions:")
    ind = len(lines[i]) - len(lines[i].lstrip())
    pad = " " * (ind + 6)
    j = i + 1
    while j < len(lines) and (not lines[j].strip()
                              or len(lines[j]) - len(lines[j].lstrip()) > ind):
        j += 1
    for prop, value in [
        ("Height", f"=If({SMALL}, 136, 44)"),
        ("LayoutAlignItems",
         f"=If({SMALL}, LayoutAlignItems.Stretch, LayoutAlignItems.Center)"),
        ("LayoutDirection",
         f"=If({SMALL}, LayoutDirection.Vertical, LayoutDirection.Horizontal)"),
    ]:
        k = next((x for x in range(i, j) if lines[x].startswith(pad + prop + ":")), None)
        if k is None:
            raise SystemExit(f"conDtActions has no {prop}")
        end = k + 1
        while end < j and lines[end].startswith(pad + "  "):
            end += 1
        lines[k:end] = [f"{pad}{prop}: {value}"]
        j += 1 - (end - k)

    # the taller phone action stack pushes the card past its old height
    text = "\n".join(lines).replace(
        "Height: =If(scr_candidates.Size = ScreenSize.Small, 590, 320)",
        "Height: =If(scr_candidates.Size = ScreenSize.Small, 658, 320)")

    # A stretched vertical stack must not also flex, or the buttons grow tall.
    text = text.replace(
        f"FillPortions: =If({SMALL}, 1, 0)\n", "FillPortions: =0\n")

    # 2. Preview button between Save Dates and Apply.
    marker = re.search(r"^(\s*)- btnDtApply:$", text, re.M)
    if not marker:
        raise SystemExit("btnDtApply not found")
    child_indent = len(marker.group(1))
    block = "\n".join(emit_control("btnDtPreview", preview_button(),
                                   child_indent)) + "\n"
    text = text[:marker.start()] + block + text[marker.start():]

    # 3. Modal as the last screen-level child, so it paints over everything.
    marker = re.search(r"^(\s*)- lblCKBottomSpacer:$", text, re.M)
    if not marker:
        raise SystemExit("lblCKBottomSpacer not found")
    screen_child_indent = len(re.search(r"^(\s*)- cntCandidatesRoot:$",
                                        text, re.M).group(1))
    block = "\n".join(emit_control("conPvModal", modal(),
                                   screen_child_indent))
    return text.rstrip("\n") + "\n" + block + "\n"


if __name__ == "__main__":
    src = SRC.read_text()
    if "conPvModal" in src:
        raise SystemExit("preview already spliced - revert before rerunning")
    out = splice(src)
    write(SRC, out)
    doc = yaml.safe_load(out)

    def names(node, acc):
        for ch in node.get("Children", []) or []:
            for name, body in ch.items():
                acc.append(name)
                names(body, acc)
        return acc

    got = names(doc["Screens"]["scr_candidates"], [])
    dupes = {n for n in got if got.count(n) > 1}
    if dupes:
        raise SystemExit(f"duplicate control names: {sorted(dupes)}")
    print(f"spliced preview into {SRC.name} ({len(got)} controls, no duplicates)")
