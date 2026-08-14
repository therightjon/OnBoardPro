#!/usr/bin/env python3
"""Seed the Faculty Hire strawman templates (Clinical + Research) from the HR process docs.

Steps (run in order; each reads IDs produced by the previous):
  python3 seed_templates.py tpl      -> tpl.json          (2 Templates rows + read-back)
  python3 seed_templates.py stages   -> tplstages.json    (10 TemplateStages rows + read-back)
  python3 seed_templates.py tasks    -> tpltasks-N.json   (TemplateTasks rows, chunked)
  python3 seed_templates.py verify   -> read back counts per template/stage

Sources: "Faculty Pre-Hire Process - Jon Steen.docx" (refined pre-hire process) and
"Faculty Onboarding Checklist_May 2025.docx". Decisions 2026-08-11: both tracks as
separate templates; grouped meeting tasks; one verify task per credential document;
NeedsApproval on P&T review and LOO issuance.
"""
import json
import sys
from pathlib import Path

SITE = "https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding"
G = json.load(open(Path(__file__).parent / "guids.json"))
STAGE_IDS = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}  # Stages list item IDs, in pipeline order
NOMETA = {"Content-Type": "application/json;odata=nometadata"}


def act(uri, method="GET", body=None, extra=None):
    h = {"Accept": "application/json;odata=nometadata"}
    if extra:
        h.update(extra)
    p = {"dataset": SITE, "parameters/method": method, "parameters/uri": uri,
         "parameters/headers": h}
    if body is not None:
        p["parameters/body"] = body
    return {"runAfter": {}, "type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                 "connectionName": "shared_sharepointonline", "operationId": "HttpRequest"},
        "parameters": p, "authentication": "@parameters('$authentication')"}}


def additem(listname, fields):
    return act(f"_api/web/lists(guid'{G[listname]}')/items", "POST",
               json.dumps(fields), NOMETA)


def chain(pairs):
    out, prev = {}, None
    for n, a in pairs:
        a["runAfter"] = {prev: ["Succeeded"]} if prev else {}
        out[n] = a
        prev = n
    return out


DOC_DESC = ("Full packet: AL State License; AL Controlled Substances; current certifications; "
            "DEA; NPI# + notification letter + password; board certificate or eligibility "
            "letter; ECFMG certificate (international MDs); medical school diploma; USMLE CK "
            "& CS scores; graduate/medical school transcripts; proof of ID; CV; training "
            "certificates + residency/internship letters; case list (10-15 cases); Social "
            "Security card copy (MSO); passport-sized photo. Files go to Onboarding "
            "Documents Restricted.")
VERIFY = "Verify received and file to Onboarding Documents Restricted."

# (title, anchor, offset, role, category, priority, required, prereq, prereqCond, approval, desc)
def T(title, anchor, offset, role="HR", cat="Processing", prio="Medium",
      req=True, prereq=False, cond=None, appr=False, desc=""):
    return dict(title=title, anchor=anchor, offset=offset, role=role, cat=cat,
                prio=prio, req=req, prereq=prereq, cond=cond, appr=appr, desc=desc)


CLIN_DOCS = [
    ("Alabama State License", True), ("Alabama Controlled Substances Certificate", True),
    ("Current certifications", True), ("DEA registration", True),
    ("NPI number + notification letter", True), ("Board certificate or eligibility letter", True),
    ("ECFMG certificate", False), ("Medical school diploma", True),
    ("USMLE CK & CS scores", True), ("Graduate/medical school transcripts", True),
    ("Proof of ID", True), ("CV", True),
    ("Training certificates & residency/internship letters", True),
    ("Case list (10-15 cases)", True), ("Social Security card copy (MSO)", True),
    ("Passport-sized photo", True)]
RES_DOCS = [
    ("CV", True), ("Diploma (highest degree)", True), ("Graduate school transcripts", True),
    ("Proof of ID", True), ("Social Security card copy (MSO)", True),
    ("Passport-sized photo", True), ("Training certificates & reference letters", True)]


def prehire_common():
    return {
        1: [
            T("Issue formal Letter of Intent", "LOI", 0, role="Manager",
              desc="Chair, EA, and Division Director negotiate terms with the candidate; formal LOI executed. Recommended runway: at least 120 days before start."),
            T("Candidate applies for faculty position (UAB Job Board)", "LOI", 7,
              role="Candidate",
              desc="Candidate submits application through the UAB Job Board."),
            T("Complete Promotion & Tenure review (HSOM Faculty Affairs)", "LOI", 30,
              prio="High", prereq=True, cond="Requires P&T", appr=True,
              desc="Required for Associate Professor and above before the LOO can be issued, per HSOM Faculty Affairs and HR protocol. ~1 month if the candidate provides documents on time."),
        ],
        2: [
            T("Issue Letter of Offer", "LOO Issued", 0, role="Manager", appr=True,
              desc="LOO issued by the Chair's Office or the Division Director."),
        ],
        3: [
            T("Complete Hiring Proposal in PeopleAdmin", "LOO Accepted", 7,
              desc="Internal OBGYN HR function."),
            T("Complete Faculty Data Form in UAB Forms", "LOO Accepted", 7,
              desc="Internal OBGYN HR function."),
            T("Submit ACT Document in Oracle", "LOO Accepted", 10,
              desc="Internal OBGYN HR function."),
            T("Process relocation and transition allowances", "LOO Accepted", 14, req=False,
              desc="As applicable. Internal OBGYN HR function."),
            T("Notify internal teams of official start date", "LOO Accepted", 7,
              desc="HR, IT, Operations, Finance, Research, etc."),
        ],
    }


def docs_tasks(doc_list):
    out = [T("Candidate submits credential document packet", "LOO Accepted", 30,
             role="Candidate", cat="Documents", prio="High", desc=DOC_DESC)]
    for name, req in doc_list:
        note = VERIFY if req else VERIFY + " Not required for every candidate."
        out.append(T(f"Doc: {name}", "LOO Accepted", 45, cat="Documents",
                     req=req, desc=note))
    return out


CLINICAL = prehire_common()
CLINICAL[4] = [
    T("Submit packet to Credentialing", "Start", -120, prio="High",
      desc="Internal OBGYN Operations function. Cannot be submitted more than 180 days before start."),
    T("Submit packet to Provider Enrollment", "Start", -120, prio="High",
      desc="Internal OBGYN Operations function."),
    T("Submit packet to Risk Management", "Start", -120, prio="High",
      desc="Internal OBGYN Operations function."),
] + docs_tasks(CLIN_DOCS)
CLINICAL[5] = [
    T("Candidate completes I-9 (UAB System HR)", "Start", -3, role="Candidate",
      cat="Documents", prio="High",
      desc="No more than 3 days before the official start date."),
    T("Request clinic template build", "Start", -30, cat="Admin"),
    T("Schedule Employee Health & N95 fit testing", "Start", -14, cat="Admin",
      desc="Walk-in Employee Health."),
    T("Order equipment (computer, phone, printer, Vocera)", "Start", -30, cat="Admin"),
    T("Office & workspace setup", "Start", -30, cat="Admin",
      desc="Assign office space; furniture needs assessment and order; name plate; office supplies; welcome gift."),
    T("Divisional admin setup", "Start", -21, cat="Admin",
      desc="Lab coats; business cards; mail; assign admin support."),
    T("Physical access (keys, codes, ONE Card)", "Start", -14, cat="Admin",
      desc="All faculty: WIC clinical locations (+ other clinical/research locations as needed); hospital perimeter; office (order keys). Clinical adult faculty add: OR; OR locker room; physician lounge."),
    T("IT access & software setup", "Start", -14, cat="Admin",
      desc="As needed per OBGYN IT Director (Bashirat Hahn)."),
    T("Add to phone list & email groups; coordinate faculty photo", "Start", -7, cat="Admin"),
    T("Schedule clinical trainings", "Start", -21, cat="Admin",
      desc="Compliance training; Impact training; HIPAA; AS software."),
    T("Schedule leadership meetings", "Start", -21, cat="Meetings",
      desc="Chair (Warner Huh); Executive Administrator (Taylor Sisson); Division Director + divisional admin support staff; AVP Women's Health Service Line (Jennifer Kelley); VC of Clinical Affairs (Todd Jenkins); Operations Administrator (Tim McElroy)."),
    T("Schedule clinical operations meetings", "Start", -21, cat="Meetings",
      desc="Divisional Clinic Manager; HRP Business Partner (Shawaii Jackson); Senior Director Clinical Services (Bethany Tidwell - introduces clinic support team); APP Director (Andi Farley); Senior Director Nursing Services (Christy Nation); L&D Medical Director (Fran Burgan - obstetricians only); L&D Nurse Manager (Laura Money - obstetricians only); Ultrasound Director (Sheri Jenkins)."),
    T("Schedule mentorship, education & support meetings", "Start", -21, cat="Meetings",
      desc="VC of Mentorship (Gena Dunivan); VC of Education (Akila Subramaniam); Department Value Officer (Michael Straughn); Director of Communications (Hadley Robertson); OBGYN IT Director (Bashirat Hahn)."),
    T("Department announcement email", "Start", -7, cat="Other",
      desc="Communications team emails the department announcing the new faculty member."),
    T("Parking access setup", "Start", -7, cat="Admin",
      desc="Parking deck access. Needs: account number (department pays); Blazer ID; name."),
]

RESEARCH = prehire_common()
RESEARCH[4] = docs_tasks(RES_DOCS)
RESEARCH[5] = [
    T("Candidate completes I-9 (UAB System HR)", "Start", -3, role="Candidate",
      cat="Documents", prio="High",
      desc="No more than 3 days before the official start date."),
    T("Order equipment (computer, phone, printer)", "Start", -30, cat="Admin"),
    T("Office & workspace setup", "Start", -30, cat="Admin",
      desc="Assign office space; furniture needs assessment and order; name plate; office supplies; welcome gift."),
    T("Divisional admin setup", "Start", -21, cat="Admin",
      desc="Lab coats (if applicable); business cards; mail; assign admin support."),
    T("Physical access (keys, codes, ONE Card)", "Start", -14, cat="Admin",
      desc="Hospital perimeter; office (order keys); research locations as needed."),
    T("IT access & software setup", "Start", -14, cat="Admin",
      desc="As needed per OBGYN IT Director (Bashirat Hahn)."),
    T("Add to phone list & email groups; coordinate faculty photo", "Start", -7, cat="Admin"),
    T("Schedule research trainings", "Start", -21, cat="Admin",
      desc="Occupational Health and Safety; IACUC (as needed); IRAP/Healthstream; International Medical Education; Effort Reporting; Responsible Conduct in Research; GCP; CITI IRB."),
    T("Schedule leadership meetings", "Start", -21, cat="Meetings",
      desc="Chair (Warner Huh); Executive Administrator (Taylor Sisson); Division Director + divisional admin support staff."),
    T("Schedule research program meetings", "Start", -21, cat="Meetings",
      desc="VC of Research / CRWH Director (Alan Tita); Director of Research Development (Chelsea Crawford); CRWH Administrative Director (Donna Dunn Campbell); Finance Director (Kimberly Whitehurst) + preaward/postaward team as assigned; Senior Associate Dean of Research (Tika Benveniste, as applicable)."),
    T("Schedule mentorship & support meetings", "Start", -21, cat="Meetings",
      desc="VC of Mentorship (Gena Dunivan); VC of Education (Akila Subramaniam); HRP Business Partner (Shawaii Jackson); Director of Communications (Hadley Robertson); OBGYN IT Director (Bashirat Hahn)."),
    T("Transfer awards to UAB (Preaward team)", "Start", -30, req=False, cat="Processing",
      desc="As applicable for funded investigators."),
    T("Department announcement email", "Start", -7, cat="Other",
      desc="Communications team emails the department announcing the new faculty member."),
    T("Parking access setup", "Start", -7, cat="Admin",
      desc="Parking deck access. Needs: account number (department pays); Blazer ID; name."),
]

TEMPLATES = [
    ("Faculty Hire - Clinical", "Faculty Clinical", CLINICAL,
     "Clinical faculty hire, LOI through onboarding. Strawman from the HR pre-hire process doc (refined) + May 2025 onboarding checklist."),
    ("Faculty Hire - Research", "Faculty", RESEARCH,
     "Research faculty hire, LOI through onboarding. Strawman from the HR pre-hire process doc (refined) + May 2025 onboarding checklist."),
]


def cmd_tpl():
    pairs = []
    for name, ctype, _, desc in TEMPLATES:
        key = name.replace(" ", "").replace("-", "")
        pairs.append((f"Tpl_{key}", additem("Templates", {
            "Title": name, "CandidateType": ctype, "Description": desc, "Version": 1})))
    pairs.append(("Read_Tpl", act(
        f"_api/web/lists(guid'{G['Templates']}')/items?$select=Id,Title")))
    Path("tpl.json").write_text(json.dumps(chain(pairs), indent=1))
    print(f"tpl.json: {len(pairs)} actions")


def tpl_ids():
    d = json.load(open("out-tpl/Read_Tpl.json"))
    return {r["Title"]: r["Id"] for r in d.get("body", d).get("value", [])}


def cmd_stages():
    tids = tpl_ids()
    pairs = []
    for name, _, stages, _ in TEMPLATES:
        tid = tids[name]
        tkey = name.replace(" ", "").replace("-", "")
        for order in sorted(stages):
            phase = "Onboarding" if order == 5 else "Pre-Hire"
            pairs.append((f"TS_{tkey}_{order}", additem("TemplateStages", {
                "TemplateId": tid, "StageId": STAGE_IDS[order],
                "OrderIndex": order, "Phase": phase, "IsActive": True})))
    pairs.append(("Read_TS", act(
        f"_api/web/lists(guid'{G['TemplateStages']}')/items?$select=Id,TemplateId,StageId,OrderIndex")))
    Path("tplstages.json").write_text(json.dumps(chain(pairs), indent=1))
    print(f"tplstages.json: {len(pairs)} actions")


def ts_ids():
    d = json.load(open("out-tplstages/Read_TS.json"))
    return {(r["TemplateId"], r["OrderIndex"]): r["Id"]
            for r in d.get("body", d).get("value", [])}


def cmd_tasks(chunk_size=45):
    tids = tpl_ids()
    tsids = ts_ids()
    pairs = []
    for name, _, stages, _ in TEMPLATES:
        tid = tids[name]
        tkey = "C" if "Clinical" in name else "R"
        for order in sorted(stages):
            for i, t in enumerate(stages[order], 1):
                fields = {
                    "Title": t["title"], "Description": t["desc"] or None,
                    "TemplateId": tid, "TemplateStageId": tsids[(tid, order)],
                    "Anchor": t["anchor"], "OffsetDays": t["offset"],
                    "AssigneeRole": t["role"], "Priority": t["prio"],
                    "Category": t["cat"], "OrderIndex": i,
                    "IsRequired": t["req"], "IsPrereq": t["prereq"],
                    "NeedsApproval": t["appr"]}
                if t["cond"]:
                    fields["PrereqCondition"] = t["cond"]
                fields = {k: v for k, v in fields.items() if v is not None}
                pairs.append((f"TT_{tkey}_{order}_{i}", additem("TemplateTasks", fields)))
    chunks = [pairs[i:i + chunk_size] for i in range(0, len(pairs), chunk_size)]
    for i, ch in enumerate(chunks, 1):
        Path(f"tpltasks-{i}.json").write_text(json.dumps(chain(ch), indent=1))
    print(f"{len(pairs)} task rows across {len(chunks)} files")


def cmd_verifyfile():
    pairs = [("Read_Counts", act(
        f"_api/web/lists(guid'{G['TemplateTasks']}')/items?$select=Id,Title,TemplateId,TemplateStageId,Anchor,OffsetDays,AssigneeRole,IsRequired,IsPrereq,NeedsApproval&$top=200"))]
    Path("tplverify.json").write_text(json.dumps(chain(pairs), indent=1))
    print("tplverify.json written")


if __name__ == "__main__":
    {"tpl": cmd_tpl, "stages": cmd_stages, "tasks": cmd_tasks,
     "verifyfile": cmd_verifyfile}[sys.argv[1]]()
