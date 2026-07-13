---
name: matter-intake
description: >
  Full intake workflow for any new litigation matter at Gopuff — complaint, EEOC charge, demand
  letter, or subpoena. ALWAYS use this skill when Chris drops a new document or says anything
  like: "new case", "new matter", "I got served", "we got a charge", "intake this", "open a
  matter", "new charge - [name]", or attaches a complaint/charge/subpoena with no other
  instruction. This skill reads the document, extracts matter facts, finds or creates the Airtable
  record, collects matter details from Chris, and then invokes the discovery-tracker-intake skill
  to create and populate the Google Sheets tracker. Do NOT use this skill when Chris is only
  asking for a tracker on an existing matter — use discovery-tracker-intake directly for that.
---

# Matter Intake

End-to-end intake for a new litigation matter. Reads the filing, identifies the matter, sets up
or confirms the Airtable record, collects Drive folder and matter details, then hands off to
`discovery-tracker-intake` to build the tracker.

This skill will grow over time. Future intake steps (calendar deadlines, folder structure checks,
outside counsel notification) will be added here. The discovery tracker step is always last.

Read `airtable-manager` SKILL.md before any Airtable calls:
`C:\Users\ChrisRider\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\...\skills\airtable-manager\SKILL.md`

---

## Step 1 — Read the document

Extract from the attached complaint, charge, demand letter, or subpoena:

- **Claimant / plaintiff name** (Last, First if determinable)
- **Document type**: EEOC Charge | Demand Letter | Complaint | Subpoena | Other
- **Claim types**: discrimination (race/sex/age/disability), harassment, retaliation, FMLA/leave,
  wage/hour, USERRA, wrongful termination, commercial subpoena, government subpoena
- **Filing / charge date**
- **Gopuff entity named**
- **Employment dates** (if mentioned)
- **Employee ID** (if mentioned)
- **2–3 sentence fact summary**

Show Chris a brief extraction summary before proceeding — one short paragraph.

If no document is attached, ask for: claimant name, claim type, and Gopuff entity.

---

## Step 2 — Search Airtable

Use `airtable-manager` → `searchRecords` on `Matter` field with claimant's last name.
Try "Last, First" format first, then last name only. Apply fuzzy matching.

**Match found:** Confirm with Chris: *"Found [Matter] in the tracker — is this the right record?"*

**No match:** Ask: *"[Name] isn't in the Legal Tracker yet. Want me to create a record?"*

If creating, collect (use extracted values as defaults, ask Chris to confirm or correct):
- Claim Type: Employment | Commercial | Regulatory | Other
- Claim Subtype: Single Plaintiff | EEOC Charge | Demand Letter | Subpoena | Class Action | etc.
- Gopuff Entity (default from extraction)
- Litigation Phase: Prelitigation (default) | Litigation | Appeal
- Outside Counsel (optional)

Create with `createRecord`. Use today's date (MM/DD/YYYY) as Date Open.

---

## Step 3 — Collect remaining matter details

After confirming the Airtable record, collect anything still needed for the tracker:

1. **Drive folder URL** — ask: *"What's the Drive folder URL for this matter?"*
   Extract the folder ID from `drive.google.com/drive/folders/FOLDER_ID`.

2. **Employment dates** — if not in the document and claim type is Employment, ask.
   Format: "MM/YYYY – MM/YYYY" or "MM/DD/YYYY – MM/DD/YYYY". Skip for subpoenas.

3. **Employee ID** — if not in the document, ask (optional; Chris can fill in later).

Keep this conversational — don't present a form. Ask only for what you don't already have.

---

## Step 4 — Confirm discovery categories

Before creating the tracker, confirm which discovery approach to use.

**Employment matters:** The standard 24-row template covers all typical employment claims.
Present the category groups (Workday Records, Compensation, Attendance, Leave Records, ER Records)
and flag any additions based on claim type:

| Claim flag | Suggested additions |
|---|---|
| Harassment | Slack/Teams communications involving claimant and named individuals |
| Wage/hour | Payroll detail export (ADP/Paylocity) per pay period |
| USERRA / military leave | Military leave requests + reactivation correspondence |
| Disability / accommodation | Accommodation requests and HR responses |
| Retaliation | Any internal complaints filed by claimant pre-termination |
| Class / collective | Note: broader custodian scope may be needed |

Ask: *"The standard 24 categories are pre-loaded. For this [claim type], I'd suggest adding:
[list]. Anything to add or remove?"* Wait for approval.

**Subpoenas:** Extract each specific document request from the demand and propose a mapped list.
Present for approval before proceeding.

---

## Step 5 — Create the discovery tracker

Invoke the `discovery-tracker-intake` skill, passing all collected information:
- Claimant name (Last, First)
- Matter type (from claim type + subtype)
- Drive folder URL
- Employee ID (if known)
- Employment dates (if known)
- Any approved subpoena categories (if applicable)

The `discovery-tracker-intake` skill handles all Sheets/Drive API calls and returns the tracker
link. Do not duplicate its logic here — just hand off and relay the result to Chris.

---

## Step 6 — Confirm and close intake

After the tracker is created, confirm intake is complete:

> **Matter intake complete for [Name].**
>
> - Airtable: [created / confirmed] ✓
> - Discovery Tracker: [link] ✓
> - [Any blanks left to fill in]
>
> Anything else to set up for this matter?

---

## Future intake steps (not yet built)

These will be added as separate steps in this skill when the workflows are ready:
- Verify Drive folder structure (matter subfolder exists, standard subfolders created)
- Schedule initial response / answer deadline on Google Calendar
- Notify outside counsel via Gmail draft
- Tag budget category in Airtable

---

## Error handling

- Airtable search fails: report and ask Chris to confirm the matter name manually
- No Drive folder yet: offer to note the folder URL later — create the tracker in the Automation
  folder as a staging area, then move it once the folder is available
- `discovery-tracker-intake` fails: report the error with the fileId if partial; the skill's own
  error handling covers most cases
