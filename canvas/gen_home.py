#!/usr/bin/env python3
"""Emit canvas/src/scr_home.pa.yaml - the Home screen (spec: docs/superpowers/specs/2026-11-20-home-screen-design.md).

Everyone lands here. HR and Managers get pipeline tiles, a stage strip and a list of
active candidates (Managers only their own: Manager, PrimaryOwner or Watcher); Viewers
get their own task tiles and next tasks. All numbers are live: Tasks is filtered on the
server with delegable predicates (open statuses spelled out - "<>" never delegates) and
only CountRows runs locally; Candidates is small, so it is read with FirstN and scoped
locally. Tiles and stage chips filter Home's own candidate list; a row opens the cockpit.
Task tiles open My Tasks on its matching filter.

  python3 gen_home.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from gen_app import AUTOZ, NOSHADOW, con, ctl, emit_screen, content_root, write  # noqa: E402
from rail_stamp import rail_text  # noqa: E402

OUT = pathlib.Path(__file__).parent / "src"

SCREEN, SFX = "scr_home", "Home"
SM = f"{SCREEN}.Size = ScreenSize.Small"
PIPE = "IsManagerOrHR"            # HR + Manager see the pipeline; Viewers see their tasks
SIZE = 7                          # candidate rows per page
ROW = f"If({SM}, 72, 56)"
PAGES = f"Max(1, RoundUp(galHmAll.AllItemsCount / {SIZE}, 0))"
FILTER = 'Coalesce(varHmFilter, "All")'
OPEN = '(TStatus.Value = "To Do" || TStatus.Value = "In Progress" || TStatus.Value = "Blocked")'
ME = "Lower(User().Email)"
SOON = "!IsBlank(StartDate) && StartDate >= Today() && StartDate <= Today() + 30"

# ---------------------------------------------------------------- formulas

ONVISIBLE = (
    f"=Set(varHmFilter, {FILTER});\n"
    "Set(varHmPage, 1);\n"
    f"If({PIPE},\n"
    "    Refresh(Candidates);  // the app's copy can lag a flow's writes (F1 sets stages after it answers)\n"
    "    ClearCollect(colHmStages, SortByColumns(Filter(Stages, Coalesce(IsActive, true)), \"OrderIndex\"));\n"
    "    ClearCollect(colHmCands,\n"
    "        Filter(FirstN(Candidates, 500), CStatus.Value = \"Active\"\n"
    f"            && (IsHR || Lower(Coalesce(Manager.Email, \"\")) = {ME}\n"
    f"                || Lower(Coalesce(PrimaryOwner.Email, \"\")) = {ME}\n"
    f"                || {ME} in ForAll(Watchers, Lower(Email)))));\n"
    "    // delegable: date < and choice = joined with Or; the result stays small\n"
    f"    ClearCollect(colHmOverdue, Filter(Tasks, DueDate < Today() && {OPEN}));\n"
    "    ClearCollect(colHmRows,\n"
    "        AddColumns(colHmCands,\n"
    "            OverdueN, With({cid: ID}, CountRows(Filter(colHmOverdue, Candidate.Id = cid))),\n"
    "            StartSort, Coalesce(StartDate, Date(2099, 12, 31)))),\n"
    "    // Viewers: same filter My Tasks uses, so the counts agree with the screen the tiles open\n"
    f"    ClearCollect(colHmMine, Filter(Tasks, Assignee.Email = User().Email && {OPEN})))")

HM_LIST = (
    "=SortByColumns(\n"
    "    Filter(colHmRows,\n"
    f"        Switch({FILTER},\n"
    "            \"All\", true,\n"
    "            \"Blocked\", Coalesce(Blocked, false),\n"
    "            \"Overdue\", OverdueN > 0,\n"
    f"            \"Soon\", {SOON},\n"
    f"            CurrentStage.Id = Value(Mid({FILTER}, 7)))),\n"
    "    \"OverdueN\", SortOrder.Descending, \"StartSort\", SortOrder.Ascending)")

HM_WINDOW = (
    "=With({t: galHmAll.AllItems, n: galHmAll.AllItemsCount},\n"
    f"    FirstN(LastN(t, n - (Min(Coalesce(varHmPage, 1), Max(1, RoundUp(n / {SIZE}, 0))) - 1)"
    f" * {SIZE}), {SIZE}))")

GREETING = (
    '="Good " & If(Hour(Now()) < 12, "morning", Hour(Now()) < 17, "afternoon", "evening")\n'
    '    & ", " & First(Split(FriendlyName(User().FullName), " ")).Value\n'
    '    & If(IsHR, " - here is the onboarding pipeline.",\n'
    '         MyRole = "Manager", " - here are your candidates.",\n'
    '         " - here is what is on your plate.")')

OPEN_CAND = "=Set(varSelCandId, ThisItem.ID); Navigate(scr_candidates)"

# (key, pipe value, pipe caption, viewer value, viewer caption, viewer My Tasks filter)
TILES = [
    ("All", "CountRows(colHmRows)", "Active candidates",
     "CountRows(Filter(colHmMine, !IsBlank(DueDate) && DueDate < Today()))", "My overdue tasks", "Overdue"),
    ("Blocked", "CountRows(Filter(colHmRows, Coalesce(Blocked, false)))", "Blocked",
     "CountRows(Filter(colHmMine, !IsBlank(DueDate) && DueDate >= Today() && DueDate <= Today() + 7))",
     "Due this week", "Week"),
    ("Overdue", "Sum(colHmRows, OverdueN)", "Overdue tasks",
     "CountRows(colHmMine)", "My open tasks", "All"),
    ("Soon", f"CountRows(Filter(colHmRows, {SOON}))", "Starting within 30 days",
     None, None, None),
]

LIST_TITLE = (
    f'=Switch({FILTER}, "All", "Active candidates", "Blocked", "Blocked candidates",\n'
    '    "Overdue", "Candidates with overdue tasks", "Soon", "Starting in the next 30 days",\n'
    f'    "Stage: " & LookUp(colHmStages, ID = Value(Mid({FILTER}, 7))).Title)\n'
    '    & "  ·  " & galHmAll.AllItemsCount')

# ---------------------------------------------------------------- builders

BTN_CHROME = {"Align": "=Align.Center", "FontWeight": '=""',
              "PaddingBottom": "=5", "PaddingLeft": "=12", "PaddingRight": "=12",
              "PaddingTop": "=5", "RadiusBottomLeft": "=4", "RadiusBottomRight": "=4",
              "RadiusTopLeft": "=4", "RadiusTopRight": "=4",
              "VerticalAlign": "=VerticalAlign.Middle"}
CARD = {**NOSHADOW, **AUTOZ, "BorderColor": "=UAB.Line", "BorderThickness": "=1",
        "Fill": "=UAB.White", "RadiusBottomLeft": "=8", "RadiusBottomRight": "=8",
        "RadiusTopLeft": "=8", "RadiusTopRight": "=8"}


def button(name, text, onselect, width, height=36, label=None, secondary=False, extra=None):
    props = {**AUTOZ, **BTN_CHROME, "BasePaletteColor": "=UAB.Green",
             "Height": f"={height}", "OnSelect": onselect, "Text": text,
             "Width": width if isinstance(width, str) else f"={width}"}
    if label:
        props["AccessibleLabel"] = f'="{label}"'
    if secondary:
        props["Appearance"] = "=ButtonAppearance.Secondary"
    if extra:
        props.update(extra)
    return (name, ctl("ModernButton", props))


def mtext(name, text, color="=UAB.Gray700", size="=UABSize.Secondary", height=18, extra=None):
    """A ModernText. AutoHeight is never optional - unset, it clips and scrolls."""
    props = {**AUTOZ, "AutoHeight": "=true", "Color": color,
             "Height": f"={height}" if isinstance(height, int) else height,
             "Size": size, "Text": text}
    if extra:
        props.update(extra)
    return (name, ctl("ModernText", props))


def label(name, text, color, size, height, onselect=None, extra=None):
    """Classic Label: the click target that works in and out of galleries."""
    props = {**AUTOZ, "Color": color, "FocusedBorderColor": "=UAB.Gold",
             "FocusedBorderThickness": "=2", "Font": "=Font.Arial",
             "Height": f"={height}", "PaddingBottom": "=0", "PaddingLeft": "=0",
             "PaddingRight": "=0", "PaddingTop": "=0", "Size": size,
             "Text": text, "Wrap": "=false"}
    if onselect:
        props.update({"OnSelect": onselect, "TabIndex": "=0"})
    if extra:
        props.update(extra)
    return (name, ctl("Label", props))


def pill(name, text, fill, color, width):
    return (f"con{name}", con({**NOSHADOW, **AUTOZ,
        "AlignInContainer": "=AlignInContainer.Center", "Fill": fill, "FillPortions": "=0",
        "Height": "=24", "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "PaddingLeft": "=10", "PaddingRight": "=10",
        "RadiusBottomLeft": "=999", "RadiusBottomRight": "=999",
        "RadiusTopLeft": "=999", "RadiusTopRight": "=999", "Width": width}, [
        mtext(f"lbl{name}", text, color=color, size="=12", height=16,
              extra={"Align": "=Align.Center", "AlignInContainer": "=AlignInContainer.Center",
                     "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold", "Wrap": "=false"}),
    ]))


# ---------------------------------------------------------------- regions

def header():
    # 44 title + 4 gap + 23 sub (40 when it wraps on a phone), + slack for the 32pt line box
    return ("cntHmHeader", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0", "Height": f"=If({SM}, 100, 84)",
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=4"}, [
        mtext("lblHmTitle", '="Home"', color="=UAB.TextPrimary", size="=UABSize.ScreenTitle",
              height=44, extra={"FontWeight": "=FontWeight.Semibold", "Wrap": "=false"}),
        mtext("lblHmSub", GREETING, color="=UAB.Gray500", size="=UABSize.Body",
              height=f"=If({SM}, 40, 23)", extra={"Wrap": f"={SM}"}),
    ]))


def tile(i, key, pv, pc, vv, vc, vf):
    pipe_only = vv is None
    act_pipe = f'Set(varHmFilter, "{key}"); Set(varHmPage, 1)'
    act = (f"=If({PIPE}, {act_pipe}, "
           + ("false)" if pipe_only else f'Set(varMyTasksFilter, "{vf}"); Navigate(scr_mytasks))'))
    value = f"=If({PIPE}, {pv}, {'0' if pipe_only else vv})"
    caption = f'=If({PIPE}, "{pc}", "{pc if pipe_only else vc}")'
    selected = f'{PIPE} && {FILTER} = "{key}"'
    n = f"If({PIPE}, 4, 3)"
    width = f"=If({SM}, (Parent.Width - 12) / 2, (Parent.Width - ({n} - 1) * 12) / {n})"
    props = {**CARD, "Fill": f"=If({selected}, UAB.GoldTint, UAB.White)",
             "BorderColor": f"=If({selected}, UAB.Gold, UAB.Line)",
             "FillPortions": "=0", "Height": "=96",
             "LayoutAlignItems": "=LayoutAlignItems.Stretch",
             "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=2",
             "LayoutJustifyContent": "=LayoutJustifyContent.Center",
             "PaddingLeft": "=16", "PaddingRight": "=16", "Width": width}
    if pipe_only:
        props["Visible"] = f"={PIPE}"
        props["Width"] = f"=If({PIPE}, {width[1:]}, 0)"
    return (f"conHmTile{i}", con(props, [
        label(f"lblHmTileN{i}", value, "=UAB.TextPrimary", "=28", 48, onselect=act,
              extra={"FontWeight": "=FontWeight.Bold"}),
        label(f"lblHmTileC{i}", caption, "=UAB.Gray700", "=UABSize.Secondary", 22, onselect=act),
    ]))


def tiles():
    return ("conHmTiles", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({SM}, 96 * 2 + 12, 96)",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=12",
        "LayoutWrap": "=true"},
        [tile(i + 1, *t) for i, t in enumerate(TILES)]))


def stage_chip(k):
    s = f"If(CountRows(colHmStages) >= {k}, Index(colHmStages, {k}))"
    sel = f'{FILTER} = "Stage:" & {s}.ID'
    present = f"CountRows(colHmStages) >= {k}"
    return button(
        f"btnHmStage{k}",
        f'=With({{s: {s}}}, CountRows(Filter(colHmRows, CurrentStage.Id = s.ID)) & "  " & s.Title)',
        (f'=With({{s: {s}}}, If({FILTER} = "Stage:" & s.ID, Set(varHmFilter, "All"),'
         ' Set(varHmFilter, "Stage:" & s.ID)));\nSet(varHmPage, 1)'),
        f"=If({present}, If({SM}, 140, 168), 0)",
        label=None,
        extra={"Appearance": f"=If({sel}, ButtonAppearance.Primary, ButtonAppearance.Secondary)",
               "AccessibleLabel": f'="Show candidates in stage " & {s}.Title',
               "Visible": f"={present}"})


def stages():
    # 5 stages by decision (D4: no adding or reordering), so five fixed chips that wrap on a
    # phone - no horizontal gallery, which this app has never run. 3 rows of 40 + 2 gaps of 8.
    return ("conHmStages", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.OffWhite", "FillPortions": "=0",
        "Height": f"=If({PIPE}, If({SM}, 136, 40), 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
        "LayoutWrap": "=true", "Visible": f"={PIPE}"},
        [stage_chip(k) for k in range(1, 6)]))


def card_title(name, lbl, text, right=None):
    kids = [mtext(lbl, text, color="=UAB.TextPrimary", size="=UABSize.Body", height=22,
                  extra={"FillPortions": "=1", "FontWeight": "=FontWeight.Semibold", "Wrap": "=false"})]
    if right:
        kids.append(right)
    return (name, con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=8",
        "PaddingLeft": f"=If({SM}, 12, 16)", "PaddingRight": f"=If({SM}, 12, 16)"}, kids))


def col_header(con_name, lbl_name, text, width, collapse):
    props = {**NOSHADOW, **AUTOZ, "Fill": "=UAB.Paper", "FillPortions": "=0",
             "LayoutDirection": "=LayoutDirection.Horizontal", "Width": width}
    if collapse:
        props["Visible"] = f"=!({SM})"
    return (con_name, con(props, [
        mtext(lbl_name, f'="{text}"', extra={
            "Align": "=Align.Center", "AlignInContainer": "=AlignInContainer.Center",
            "FillPortions": "=1", "FontWeight": "=FontWeight.Semibold"})]))


def cand_card():
    n = "galHmAll.AllItemsCount"
    empty_h = "If(IsHR && CountRows(colHmRows) = 0, 100, 44)"
    show_all = button("btnHmShowAll", '="Show all"', '=Set(varHmFilter, "All"); Set(varHmPage, 1)',
                      100, height=32, secondary=True, label="Show all active candidates",
                      extra={"Visible": f'={FILTER} <> "All"'})
    header_row = ("conHmHeaderRow", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Paper", "FillPortions": "=0", "Height": "=40",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)", "PaddingRight": f"=If({SM}, 12, 16)"}, [
        mtext("lblHmColCand", '="Candidate"', extra={"FillPortions": "=1", "FontWeight": "=FontWeight.Semibold"}),
        col_header("conHmColStatus", "lblHmColStatus", "Status", "=96", False),
        col_header("conHmColOverdue", "lblHmColOverdue", "Overdue", f"=If({SM}, 0, 110)", True),
        col_header("conHmColStart", "lblHmColStart", "Start", f"=If({SM}, 0, 110)", True),
    ]))
    twin = ("galHmAll", ctl("Gallery", {**AUTOZ,
        "AccessibleLabel": '="Candidate data, not shown on screen"', "FillPortions": "=0",
        "Height": "=56", "Items": HM_LIST, "ShowScrollbar": "=false",
        "TemplatePadding": "=0", "TemplateSize": "=56", "Visible": "=false"},
        [mtext("lblHmAllStub", '=""')], variant="Vertical"))
    row = ("conHmRowContent", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": f"=If({SM}, 71, 55)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)", "PaddingRight": f"=If({SM}, 12, 16)"}, [
        ("conHmCellMain", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": f"=If({SM}, 4, 2)",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
            label("lblHmRowName", "=ThisItem.Title", "=UAB.TextPrimary", "=UABSize.Body", 25,
                  onselect=OPEN_CAND, extra={"FillPortions": "=1"}),
            label("lblHmRowSub",
                  (f'=Coalesce(ThisItem.CurrentStage.Value, "No stage")\n'
                   f'    & If({SM} && ThisItem.OverdueN > 0, "  ·  " & ThisItem.OverdueN & " overdue", "")\n'
                   f'    & If({SM} && !IsBlank(ThisItem.StartDate), "  ·  starts " & Text(ThisItem.StartDate, "mmm d"), "")'),
                  f'=If({SM} && ThisItem.OverdueN > 0, UAB.Danger, UAB.Gray500)', "=UABSize.Secondary", 22,
                  onselect=OPEN_CAND, extra={"FillPortions": "=1"}),
        ])),
        ("conHmCellStatus", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center", "Width": "=96"}, [
            pill("HmPillStatus",
                 '=If(Coalesce(ThisItem.Blocked, false), "Blocked", ThisItem.OverdueN > 0, "Behind", "On track")',
                 '=If(Coalesce(ThisItem.Blocked, false) || ThisItem.OverdueN > 0, UAB.DangerTint, UAB.SuccessTint)',
                 '=If(Coalesce(ThisItem.Blocked, false) || ThisItem.OverdueN > 0, UAB.Danger, UAB.SuccessText)',
                 "=84"),
        ])),
        ("conHmCellOverdue", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center",
            "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 110)"}, [
            mtext("lblHmCellOverdue", '=If(ThisItem.OverdueN > 0, ThisItem.OverdueN & " overdue", "-")',
                  color="=If(ThisItem.OverdueN > 0, UAB.Danger, UAB.Gray500)",
                  extra={"Align": "=Align.Center", "Wrap": "=false"}),
        ])),
        ("conHmCellStart", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center",
            "Visible": f"=!({SM})", "Width": f"=If({SM}, 0, 110)"}, [
            mtext("lblHmCellStart", '=If(IsBlank(ThisItem.StartDate), "-", Text(ThisItem.StartDate, "mmm d"))',
                  extra={"Align": "=Align.Center", "Wrap": "=false"}),
        ])),
        ("icoHmRowGo", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Open " & ThisItem.Title', "Color": "=UAB.Gray500",
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24", "Icon": "=Icon.ChevronRight",
            "OnSelect": OPEN_CAND, "TabIndex": "=0", "Width": "=24"})),
    ]))
    divider = ("conHmListDivider", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1",
        "LayoutDirection": "=LayoutDirection.Horizontal"}))
    gallery = ("galHmList", ctl("Gallery", {**AUTOZ,
        "AccessibleLabel": '="Candidates"', "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=Max({ROW}, Min({n}, {SIZE}) * {ROW})", "Items": HM_WINDOW,
        "ShowScrollbar": "=false", "TabIndex": "=0", "TemplatePadding": "=0",
        "TemplateSize": f"={ROW}"}, [
        ("conHmListRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "Width": "=Parent.TemplateWidth"}, [row, divider])),
    ], variant="Vertical"))
    empty = ("conHmListEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=If({n} = 0, {empty_h}, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": "=12",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "PaddingBottom": "=16", "PaddingTop": "=16", "Visible": f"={n} = 0"}, [
        mtext("lblHmListEmpty",
              ('=If(CountRows(colHmRows) = 0,\n'
               '    If(IsHR, "No candidates yet.", "None of your candidates are active right now."),\n'
               '    "No candidates match this filter.")'),
              color="=UAB.Gray500", size="=UABSize.Body", height=20, extra={"Align": "=Align.Center"}),
        button("btnHmNewCand", '="New Candidate"', "=Navigate(scr_new_candidate)", 150,
               label="Create a new candidate",
               extra={"Visible": "=IsHR && CountRows(colHmRows) = 0"}),
    ]))
    pager = ("conHmPager", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": "=48",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": "=12",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center",
        "Visible": f"={n} > {SIZE}"}, [
        ("icoHmPagerPrev", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Previous page of candidates"',
            "Color": "=If(Coalesce(varHmPage, 1) <= 1, UAB.Gray300, UAB.Green)",
            "DisplayMode": "=If(Coalesce(varHmPage, 1) <= 1, DisplayMode.Disabled, DisplayMode.Edit)",
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24", "Icon": "=Icon.ChevronLeft",
            "OnSelect": f"=Set(varHmPage, Max(1, Min(Coalesce(varHmPage, 1), {PAGES}) - 1))",
            "TabIndex": "=0", "Width": "=24"})),
        mtext("lblHmPager", f'="Page " & Min(Coalesce(varHmPage, 1), {PAGES}) & " of " & {PAGES}',
              extra={"Align": "=Align.Center", "Width": "=110"}),
        ("icoHmPagerNext", ctl("Classic/Icon", {**AUTOZ,
            "AccessibleLabel": '="Next page of candidates"',
            "Color": f"=If(Coalesce(varHmPage, 1) >= {PAGES}, UAB.Gray300, UAB.Green)",
            "DisplayMode": f"=If(Coalesce(varHmPage, 1) >= {PAGES}, DisplayMode.Disabled, DisplayMode.Edit)",
            "FocusedBorderColor": "=UAB.Gold", "Height": "=24", "Icon": "=Icon.ChevronRight",
            "OnSelect": f"=Set(varHmPage, Min({PAGES}, Coalesce(varHmPage, 1) + 1))",
            "TabIndex": "=0", "Width": "=24"})),
    ]))
    # 48 title + 40 header + rows + pager + empty state; 0 for Viewers (a hidden child still reserves space)
    height = (f"=If({PIPE}, 48 + 40 + Max({ROW}, Min({n}, {SIZE}) * {ROW})"
              f" + If({n} > {SIZE}, 48, 0) + If({n} = 0, {empty_h}, 0), 0)")
    return ("conHmListCard", con({**CARD, "FillPortions": "=0", "Height": height,
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "Visible": f"={PIPE}"},
        [card_title("conHmListTitle", "lblHmListTitle", LIST_TITLE, show_all),
         header_row, twin, gallery, empty, pager]))


def task_card():
    items = "FirstN(Sort(colHmMine, Coalesce(DueDate, Date(2099, 12, 31)), SortOrder.Ascending), 5)"
    n = "CountRows(colHmMine)"
    to_mytasks = '=Set(varMyTasksFilter, "All"); Navigate(scr_mytasks)'
    row = ("conHmTaskContent", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": f"=If({SM}, 71, 55)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal", "LayoutGap": f"=If({SM}, 8, 12)",
        "PaddingLeft": f"=If({SM}, 12, 16)", "PaddingRight": f"=If({SM}, 12, 16)"}, [
        ("conHmTaskMain", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=1",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical", "LayoutGap": f"=If({SM}, 4, 2)",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center"}, [
            label("lblHmTaskTitle", "=ThisItem.Title", "=UAB.TextPrimary", "=UABSize.Body", 25,
                  onselect=to_mytasks, extra={"FillPortions": "=1"}),
            label("lblHmTaskSub", '=Coalesce(ThisItem.CandName, "")', "=UAB.Gray500",
                  "=UABSize.Secondary", 22, onselect=to_mytasks, extra={"FillPortions": "=1"}),
        ])),
        ("conHmTaskDue", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "FillPortions": "=0",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "LayoutJustifyContent": "=LayoutJustifyContent.Center", "Width": "=130"}, [
            pill("HmPillDue", "=TaskDueText(ThisItem.DueDate, ThisItem.PendingAnchor)",
                 "=TaskDueFill(TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor))",
                 "=TaskDueColor(TaskDueBucket(ThisItem.DueDate, ThisItem.PendingAnchor))", "=124"),
        ])),
    ]))
    divider = ("conHmTaskDivider", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.Line", "FillPortions": "=0", "Height": "=1",
        "LayoutDirection": "=LayoutDirection.Horizontal"}))
    gallery = ("galHmTasks", ctl("Gallery", {**AUTOZ,
        "AccessibleLabel": '="My next tasks"', "Fill": "=UAB.White", "FillPortions": "=0",
        "Height": f"=Max({ROW}, Min({n}, 5) * {ROW})", "Items": f"={items}",
        "ShowScrollbar": "=false", "TabIndex": "=0", "TemplatePadding": "=0",
        "TemplateSize": f"={ROW}"}, [
        ("conHmTaskRow", con({**NOSHADOW, **AUTOZ,
            "Fill": "=UAB.White", "Height": "=Parent.TemplateHeight",
            "LayoutAlignItems": "=LayoutAlignItems.Stretch",
            "LayoutDirection": "=LayoutDirection.Vertical",
            "Width": "=Parent.TemplateWidth"}, [row, divider])),
    ], variant="Vertical"))
    empty = ("conHmTaskEmpty", con({**NOSHADOW, **AUTOZ,
        "Fill": "=UAB.White", "FillPortions": "=0", "Height": f"=If({n} = 0, 44, 0)",
        "LayoutAlignItems": "=LayoutAlignItems.Center",
        "LayoutDirection": "=LayoutDirection.Horizontal",
        "LayoutJustifyContent": "=LayoutJustifyContent.Center", "Visible": f"={n} = 0"}, [
        mtext("lblHmTaskEmpty", '="No open tasks - you are all caught up."', color="=UAB.Gray500",
              size="=UABSize.Body", height=20, extra={"Align": "=Align.Center"}),
    ]))
    all_btn = button("btnHmAllTasks", '="All my tasks"', to_mytasks, 120, height=32,
                     secondary=True, label="Open My Tasks")
    height = (f"=If({PIPE}, 0, 48 + Max({ROW}, Min({n}, 5) * {ROW}) + If({n} = 0, 44, 0))")
    return ("conHmTaskCard", con({**CARD, "FillPortions": "=0", "Height": height,
        "LayoutAlignItems": "=LayoutAlignItems.Stretch",
        "LayoutDirection": "=LayoutDirection.Vertical", "Visible": f"=!{PIPE}"},
        [card_title("conHmTaskTitle", "lblHmTaskCardTitle", '="Up Next"', all_btn),
         gallery, empty]))


def root_children():
    return [header(), tiles(), stages(), cand_card(), task_card(),
            mtext("lblHmBottomSpacer", '=""', color="=UAB.OffWhite", size="=2", height=6,
                  extra={"Align": "=Align.Center", "Wrap": "=false"})]


def build():
    body = emit_screen(SCREEN, {"Fill": "=UAB.OffWhite", "OnVisible": ONVISIBLE},
                       [content_root(SCREEN, "cntHomeRoot", root_children())])
    head, _, tail = body.partition("    Children:\n")
    return head + "    Children:\n" + rail_text(SCREEN, SFX) + tail


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write(OUT / f"{SCREEN}.pa.yaml", build())
