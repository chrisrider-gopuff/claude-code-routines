---
name: discovery-tracker-intake
description: >
  Creates and pre-fills a per-matter Google Sheets Discovery Tracker in the correct Drive folder.
  Use this skill any time Chris needs a discovery tracker — whether it's a brand-new matter or an
  existing one that doesn't have a tracker yet. Trigger phrases: "create a tracker", "set up
  discovery for [name]", "make a tracker for [matter]", "we need a discovery tracker", or any
  mention of a Drive folder ID alongside a claimant name. Also invoked automatically by the
  matter-intake skill as the final step of new-matter intake. When called standalone, ask for
  the claimant name, matter type, and Drive folder URL — do NOT search Airtable or read any
  complaint document; that's matter-intake's job.
---

# Discovery Tracker Intake

Single-purpose skill: given matter details, create and pre-fill a Discovery Tracker Google Sheet
in the correct Drive folder. All Drive and Sheets work goes through the `google-sheets` skill
(Apps Script via PowerShell). Read that SKILL.md before making any calls.

**google-sheets SKILL.md path:**
`C:\Users\ChrisRider\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\...\skills\google-sheets\SKILL.md`

---

## Inputs required

Before creating the tracker, confirm you have all of these:

| Field | Source |
|---|---|
| Claimant name | Last, First format |
| Matter type | e.g., "Employment - Discrimination/Retaliation", "Government Subpoena" |
| Drive folder URL or ID | Full `drive.google.com/drive/folders/FOLDER_ID` URL, or bare ID |
| Employee ID | Optional — leave blank if unknown |
| Employment dates | Optional — e.g., "03/2021 – 11/2024"; omit for subpoenas |

**If called standalone** (not from matter-intake): ask Chris for any missing fields.
**If called from matter-intake**: the calling skill passes all available fields directly.

Extract the folder ID from the URL: everything after `/folders/`.

---

## Step 1 — Read the Custodian Master List

Before creating the file, fetch known contacts so you can pre-fill column F.

Use `getCells` (google-sheets skill):
- Spreadsheet ID: `1G9L72CaL2OTvdsH3-2VyrsCIDXyJ6LDTILnyi7k4eOI`
- Tab: `Discovery Tracker`
- Range: `A2:E100`

Build a map: Team name → {Contact Name, Email}. Fuzzy-match (case-insensitive, ignore "team").

---

## Step 2 — Create the file

Write a `.ps1` via Desktop Commander and execute it. Use `createFile`:

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
$body = @{
    passphrase = $passphrase
    operation  = "createFile"
    templateId = "1_HAhhRbpz3u3tcoUiJjuWgh0K5qcSLM4k_dSI90TfXk"
    parentId   = "FOLDER_ID"
    title      = "Discovery Tracker - Last, First"
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://script.google.com/macros/s/AKfycby1tIkeYCoHhhhjhgWHE5_wXarUQkELFjpc3L9nlMlaV-CI5AX0NFr0mGW6yFUVZmM/exec" `
    -Method POST -ContentType "application/json" -Body $body
```

Capture `fileId` and `viewUrl` from the response.

---

## Step 3 — Pre-fill matter header

Use `setCells` on the new file. Tab name is always `Discovery Tracker`.

**Confirmed cell map (from live template v5):**

| Cell | Field | Notes |
|---|---|---|
| B5 | Claimant name | "Last, First" format |
| J5 | Employee ID | Omit if unknown |
| B6 | Matter type | e.g., "Employment - Wrongful Termination" |
| K6 | Legal handler | Already pre-filled "Chris Rider" — do not overwrite |
| B7 | Employment dates | Omit for subpoenas |
| B8 | Drive folder URL | Full URL |

Only include cells you have values for. Never write empty strings.

---

## Step 4 — Pre-fill custodian contacts

The template has 24 data rows (sheet rows 11–34). Use the custodian map from Step 1 to set
column F (Contact Name) wherever the team in column E matches a known custodian.

Standard row layout:
- Sheet rows 11–23 → data rows 1–13 → Custodian Team: People Systems
- Sheet rows 24–29 → data rows 14–19 → Custodian Team: Leaves
- Sheet rows 30–34 → data rows 20–24 → Custodian Team: ER

Set F11–F23 if People Systems contact known, F24–F29 if Leaves contact known,
F30–F34 if ER contact known. Batch all into a single `setCells` call with the header cells.

---

## Step 5 — Handle subpoenas (override data rows)

For subpoenas only: after pre-filling the header, clear the standard 24 rows and write the
subpoena-specific categories approved by Chris.

```
clearRange: A11:N38
```

Then `setCells` for each row (columns A–E):
- A = row number, B = Category, C = Request Description (verbatim or paraphrased),
  D = Required Format (PDF/Word / Excel / Native), E = Custodian Team

---

## Step 6 — Return the link

> **Tracker created:** [Discovery Tracker - Last, First](viewUrl)
>
> Pre-filled: [list what was set]. Left blank: [list any gaps — Employee ID, dates, etc.]
>
> Next: open the tracker, fill any blanks, then share the link with custodian teams.

If the Custodian Master List had no contact data, note:
> Custodian contacts weren't pre-filled — add them to the [Custodian Master List](https://docs.google.com/spreadsheets/d/1G9L72CaL2OTvdsH3-2VyrsCIDXyJ6LDTILnyi7k4eOI/edit) and re-run this skill to pick them up.

---

## Known IDs (quick reference)

- Master template: `1_HAhhRbpz3u3tcoUiJjuWgh0K5qcSLM4k_dSI90TfXk`
- Custodian Master List: `1G9L72CaL2OTvdsH3-2VyrsCIDXyJ6LDTILnyi7k4eOI`
- Apps Script URL: `https://script.google.com/macros/s/AKfycby1tIkeYCoHhhhjhgWHE5_wXarUQkELFjpc3L9nlMlaV-CI5AX0NFr0mGW6yFUVZmM/exec`

## Error handling

- `setCells` fails → call `getSheetNames` first; the tab may differ from "Discovery Tracker"
- `createFile` fails → verify parentId is a Drive *folder* ID, not a Sheets ID
- Custodian list read fails → skip contact pre-fill, note it in the return message
