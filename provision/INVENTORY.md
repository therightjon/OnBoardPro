# OnBoardPro — Provisioned SharePoint Inventory

Provisioned 2026-08-11 via the schema-ops utility flow (`1c26b238-f07a-4540-b221-317903202eb5`),
driven by [flowdriver.py](flowdriver.py) with payloads from [genpayloads.py](genpayloads.py)
(the schema source of truth). All 141 columns verified present with correct internal names.

## Site

| | |
|---|---|
| URL | `https://uab365.sharepoint.com/sites/obgyn/OBGYN-Onboarding` |
| Kind | Subsite of `/sites/obgyn`, **unique permissions** (inheritance broken at creation) |
| Site groups | Owners: `OBGYN-SharePoint-IT-Site-Owners` · Members: both OnBoardPro Entra groups · Visitors: empty |

## Entra groups

| Group | Object ID | Site principal ID |
|---|---|---|
| `OBGYN-OnBoardPro-PA` | `5f9e259c-eaba-449d-9964-46a0066ad722` | 75 |
| `OBGYN-OnBoardPro-Admins-PA` | `8127ddb5-5c46-45d0-805e-c8026ee2a414` | 74 |

## Lists

| List | GUID | Notes |
|---|---|---|
| Departments | `c509a505-df61-4d03-a466-9d72cc2fd7a8` | |
| Divisions | `6ff8be74-b08c-4af1-9fcc-6fe55351321a` | |
| FacultyRanks | `5606c834-55a2-4998-a3d4-fb0297096ce9` | |
| Stages | `f2f31e7b-1652-47fb-b215-775bdaa4a0fa` | |
| Templates | `d6a11fea-81ae-4de9-8f9d-4b1abe100024` | |
| TemplateStages | `4b2a8192-4607-4634-b8d6-7ad25e35689b` | Title optional |
| TemplateTasks | `80bde969-759f-4fb8-9b1d-8425b61ab2b5` | |
| Candidates | `ce3de9a9-702d-4707-9f30-a011b3d78264` | |
| Tasks | `c5ee2e83-46d9-4233-a660-b05286a98d11` | **PA direct Edit grant**; Candidate/Assignee/DueDate indexed |
| TasksArchive | `26ec003f-71dd-465e-a1ab-1facb1cdb188` | same shape as Tasks |
| ChangeLog | `a773279f-734a-4ac4-a7c2-c566b779b145` | Title optional; Candidate/ChangedDate indexed |
| ChangeLogArchive | `df242280-33d2-40ff-a4f7-a8b8cca3d158` | same shape |
| MetricsSnapshots | `f6506f5e-a3bb-4c2f-a9d1-9102c82609e4` | Title optional |
| Comments | `cd080771-ae0c-4b33-97b4-99c247f48ad9` | **PA direct Edit grant**; Title optional |
| HRNotes | `6c5aebbc-60f8-413c-b93a-e0d456633ae0` | **HR-only** (Admins Edit; owner Full Control) |
| CandidatesPrivate | `e15697a7-a46b-4a6e-b120-c3a8fbcd18bb` | **HR-only** |
| AppPermissions | `4832685a-06e1-4daf-8f2e-e1bf2fec9b83` | Title optional |

## Libraries

| Library | GUID | Notes |
|---|---|---|
| Onboarding Documents | `095071b3-b674-4a96-94d9-fe46bde45fb5` | Candidate lookup column |
| Onboarding Documents Restricted | `afb134d6-8dda-4122-94eb-ed7866d5cb2a` | **HR-only**; Candidate lookup column |

## Permission state (audited 2026-08-11)

- **HRNotes, CandidatesPrivate, Onboarding Documents Restricted** — inheritance broken with
  `copyRoleAssignments=false`: only the flow owner (Full Control) and
  `OBGYN-OnBoardPro-Admins-PA` (Edit). PA members are denied, server-enforced.
- **Tasks, Comments** — inheritance broken with `copyRoleAssignments=true` (site groups kept)
  **plus a direct Edit grant to `OBGYN-OnBoardPro-PA`**, so assignee edit rights survive any
  future change to the group's site-level role.
- Everything else inherits the site.

**Resolved 2026-08-11:** `OBGYN-OnBoardPro-PA` moved from Members to **Visitors** (site-level
Read; direct Edit grants on Tasks/Comments carry assignee editing) — the per-list model now
matches the design exactly. **Non-HR denial test passed**: a PA-only account was denied on the
HR-only containers.

## Reference data seeded (2026-08-11)

| List | Rows |
|---|---|
| Departments | 1 — Obstetrics and Gynecology |
| Divisions | 6 — Gynecologic Oncology · Maternal-Fetal Medicine · Reproductive Endocrinology and Infertility Services · Urogynecology and Reconstructive Pelvic Surgery · Women's Reproductive Healthcare · Global and Rural Health (from uab.edu/medicine/obgyn/divisions — **confirm with HR**) |
| FacultyRanks | 4 — Assistant Professor (PT=no) · Associate Professor (**PT=yes**) · Professor (**PT=yes**) · Other (PT=no) |
| Stages | 5 — 1 Letter of Intent · 2 Offer · 3 HR Processing · 4 Credentialing · 5 Onboarding |
| AppPermissions | 1 — jsteen@uab.edu (principal 6) · Role HR · NotifyChannel Email |

Rank titles use full academic names ("Assistant Professor" rather than the old app's bare
"Assistant"). "Instructor" is not seeded — `Other` covers it unless HR wants it explicit.

Item-ID anchors worth knowing: Departments/1 = OBGYN; Stages 1–5 are in pipeline order, so a
template's stage rows can reference them directly.

## Templates seeded (2026-08-11, strawman — Draft status)

| Template | Item ID | Candidate type | Tasks |
|---|---|---|---|
| Faculty Hire - Clinical | Templates/1 | Faculty Clinical | 44 (3 LOI · 1 Offer · 5 HR Processing · 20 Credentialing · 15 Onboarding) |
| Faculty Hire - Research | Templates/2 | Faculty | 31 (3 LOI · 1 Offer · 5 HR Processing · 8 Credentialing · 14 Onboarding) |

TemplateStages: 10 rows (both templates × 5 stages; stage 5 = Onboarding phase, 1–4 Pre-Hire).
NeedsApproval on: P&T review (also the Requires-P&T prerequisite) and Issue Letter of Offer.
Credential documents are one verify-task per document (per 2026-08-11 decision), preceded by a
candidate submit-packet touchpoint. Sources: the two HR process docs; review doc generated
from live data at [TEMPLATE-REVIEW.md](TEMPLATE-REVIEW.md). Seeder: [seed_templates.py](seed_templates.py).

## Flows (as of 2026-08-11)

| Flow | ID | Status |
|---|---|---|
| OnBoard - Apply Template (F1) | `37c175f5-b395-f111-8076-3833c5eece6e` | **Live** — PowerAppV2 trigger (`number`=candidateId, `text`=mode 'prereq'/'full'); respond-first; SharePoint connection `288fd460…` (Embedded) |
| OnBoard - Anchor Dates Changed (F2) | `95972e58-48f7-4099-bf12-c519796c3412` | **Live** — SharePoint trigger on Candidates modified (1-min poll); recomputes DueDate/PendingAnchor diffs only; logs ChangeLog TaskDue rows; auto-completes "Issue Letter of Offer" on LOOIssued; flags accepted-but-unapplied templates (notification deferred to F6) |
| OnBoard - Comment Posted (F4) | `e08d59e5-0fb4-4865-a416-628925403007` | **Live** — Comments created trigger; notifies NotifyUsers + manager + watchers (minus author); Candidate-Visible comments email the candidate (interim: from jsteen — mailbox swap checklist applies) |
| OnBoard - Daily Deadline Scan (F6) | `26ea3d13-b1f0-4403-9c69-d9b04ce836dc` | **Live** — weekdays 7:00 CT; standing-agenda digest per assignee (overdue + due ≤7d, repeats until resolved); candidate touchpoint reminders (DueNotified-deduped, re-fires on date change); nightly MetricsSnapshots append (weekdays only — weekend gaps accepted) |
| OnBoard - Archive Sweep (F7) | `3c0393ea-1674-4412-a438-3b5935b43a28` | **Live** — Sundays 22:00 CT; moves Tasks + ChangeLog rows of 30-day-terminal candidates (keyed on StatusChanged) to the archive lists, copy-then-delete with a verify pass that emails on leftovers |
| OnBoard - Stage Approvals (F5) | `f252f6b9-696d-462e-bd2a-7cec758c40e0` | **Live** — Candidates modified trigger; starts a Basic approval for each open NeedsApproval task in the newly-current stage (ApprovalStarted stamp = idempotency; approver = task assignee, falls back to first HR row); Approve → task Done via `UpdatedVia: App` so F3 runs advancement; Reject → Blocked + HR email with comments; P25D timeout clears the stamp for re-issue. Approvals connection `shared-approvals-bad56a70…` |
| OnBoard - Task Changed (F3) | `e9c4dda6-c8ae-4345-8129-70293224b75b` | **Live** — SharePoint trigger on Tasks (1-min poll, skips `UpdatedVia: Flow`); ChangeLog diffs for status/assignee/due (baseline = last logged, first touch back-fills); cancel-without-reason guard reverts + emails editor; loop-free stage advancement + Blocked recompute; assignment + stage-change + blocked emails via O365 connection `shared-office365-fbc5363a…` (jsteen@uab.edu, verified by delivery) |

F1 verified end-to-end 2026-08-11: prereq mode on candidate 1 (Associate rank → 1 P&T task,
approval-flagged); full mode on candidate 2 (research template, Assistant rank → 30 tasks,
P&T excluded, 14 Start-anchored tasks pending-anchor, stage set, ChangeLog dated at LOI,
folders in both libraries). Idempotency claim confirmed (interrupted run re-fired without
duplicates). **Deliberate deferral:** manager-notification email ships with the notification
flows (F3/F6) — four look-alike jsteen O365 connections need one deliberate pick + test.
Logic harness: gen_f1_test.py · definition generators: gen_f1_real.py, gen_f2.py, gen_f3.py, gen_f4_f5.py, gen_f6_f7.py.

F6/F7 verified 2026-08-11: F6 produced the first snapshot row (Active 2 / Overdue 2 /
CompletionRate 0 — matches the Zztest data), a digest email, and a deduped candidate
touchpoint. F7 swept throwaway candidate 3 ("Zztest, Archive", Canceled, StatusChanged
2026-06-15): 2 tasks + 1 ChangeLog row moved to the archive lists, 0 left behind, verify
pass clean. All emails are functional-plain by decision — a UAB-design restyle pass over
every template happens after the full build.

F4/F5 verified live 2026-08-11: a Candidate-Visible demo comment emailed the candidate
address; F5 detected the P&T task on candidate 1 (stage-current, NeedsApproval, unstamped),
stamped it, resolved the approver via the HR fallback, sent a real approval — which was
approved from the Approvals surface — and completed the task via the App sentinel so F3
takes over advancement. Trigger-shape lesson recorded: SharePoint trigger bodies don't
carry lookup IDs (CurrentStageId) — always re-fetch via REST inside the flow. Also: a
definition PATCH re-registers a polling trigger; edits made in that window are missed.
Note: ApprovalStarted was added to Tasks + TasksArchive post-provisioning (schema Rev).

F3 verified live 2026-08-11: two human-style LOI completions advanced candidate 2
Letter of Intent → HR Processing (correctly looping through the already-complete Offer
stage), with automated Stage ChangeLog row and stage-change email; assignment email fired
on the manager-assigned task; the guard reverted a reasonless required-task cancellation
to To Do (stamped Flow, logged, editor emailed). Known v1 behaviors: first human edit of a
task back-fills baseline TaskAssignee/TaskDue log rows; deferred to later flows — Teams
cards (NotifyChannel opt-in), role-based edit guard (needs the app's UpdatedVia semantics),
F5 approval hand-off on stage entry.

F2 verified live 2026-08-11: setting StartDate on candidate 2 fired the trigger within a
minute — all 14 pending-anchor tasks gained correct dates (I-9 = Start−3 confirmed), zero
false rewrites, 14 ChangeLog TaskDue rows ("pending" → date), and the open "Issue Letter
of Offer" task auto-completed with its TaskStatus log row. F2 was chosen trigger-based
(not app-called) so list-UI date edits recompute too; spurious fires from other flows'
candidate writes are no-ops by design (diff-only writes).

**Demo data (clean up before go-live):** Candidates 1 ("Zztest, Pilot", clinical, prereq-expanded
+ full-expanded 43 tasks) and 2 ("Zztest, Research", full-expanded 30 tasks), their Tasks rows,
ChangeLog rows, and Zztest folders in both libraries.

## Utility flow

Restored to its idle single-action state (`SP_Idle_ReadWebTitle` against the IRB Research
subsite) after provisioning. Driver usage: `python3 flowdriver.py cycle <actions.json> <outdir>`.
