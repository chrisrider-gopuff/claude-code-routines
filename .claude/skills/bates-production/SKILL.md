---
name: bates-production
description: >
  Create a Bates-stamped litigation production package from documents in Google Drive.
  Outputs a combined, page-stamped PDF, a machine-readable Bates index (bates_index.json),
  a human-readable contents list displayed in Claude and saved as a .docx file, and an
  Excel production log with document title, type, summary, Bates range, pages, and method
  of production. Use this skill any time the user says "bates production,"
  "bates number these documents," "stamp these documents," "create a production," "respond
  to document requests," or describes assembling litigation documents for production.
---

# Bates Production

## Purpose

Assemble a litigation document production package: download documents from Google Drive,
Bates-stamp every page, combine into a single PDF, produce a contents list for the
transmittal letter, and generate an Excel production log. The contents list is displayed
in Claude for immediate copy/paste and saved as a .docx file. The production log is saved
as an .xlsx file with one row per document.

## Trigger phrases

- "Bates production for [case]"
- "Bates number these documents"
- "Stamp the documents in [Drive folder]"
- "Create a production for [case/matter]"
- "Assemble the production package"

## Agent model strategy

Steps 3 (download files) and 4 (run the stamping script) are mechanical execution steps
that do not require the main model's judgment. Use the `Agent` tool with `model: "haiku"`
for both steps. The exact call structure is shown in each step below.

## Workflow

### Step 1 — Gather case metadata

Ask the user for (or infer from context):

- **Case name** (e.g., "Kaye v. GoBrands, Inc.")
- **Bates prefix** (e.g., `KAYE`, `SMITH`) — typically the plaintiff's last name, all caps
- **Starting Bates number** (default: 1, unless this is a supplemental production)
- **Google Drive folder** containing the production documents — get a shareable link or folder ID. The production documents are often in a subfolder named "Production" or "Documents to Produce" inside the matter folder under the Litigation 2.0 shared drive.

If the user does not provide the Drive folder, search the Litigation 2.0 shared drive via
`search_files` (Drive MCP) for a folder matching the case name. Case folders typically follow
a `Last, First` naming convention.

### Step 2 — List and order the production documents

Use the Drive MCP (`search_files` with `parentId = <production-folder-id>`) to enumerate
all files in the production folder.

Present the file list to the user and confirm the intended production order. Default order:
alphabetical by filename, but ask the user to confirm — they may want a specific order
(e.g., chronological, by demand number).

Build a manifest:
```json
{
  "prefix": "KAYE",
  "case_name": "Kaye v. GoBrands, Inc.",
  "base_dir": "/path/to/downloaded/files",
  "entries": [
    { "title": "Offer Letter", "filename": "offer_letter.pdf", "native": false },
    { "title": "Policy Acknowledgment", "filename": "policy_ack.xlsx", "native": true },
    { "title": "CCTV Footage – Aisle 17", "filename": "cctv_aisle17.mp4", "native": true }
  ]
}
```

**Native flag rules:**
- Set `"native": true` for: `.xlsx`, `.xls`, `.xlsm`, `.docx`, `.doc`, `.pptx`, `.ppt`,
  `.mp4`, `.mov`, `.avi`, `.msg`, `.eml`, and any other file that cannot be meaningfully
  rendered as a flat PDF page. These get a Gopuff-styled cover sheet in the production PDF.
- Set `"native": false` for: `.pdf` and all image formats (`.jpg`, `.png`, `.tiff`, etc.)

### Step 3 — Download files from Drive

Use the `Agent` tool with `model: "haiku"` to download all files:

```
Agent({
  model: "haiku",
  description: "Download production files from Google Drive",
  prompt: "Download each file listed in this manifest from Google Drive using the
Drive MCP download_file_content tool. Save each file to [output_dir] using the
filename from the manifest entry. After each download confirm the filename and
file size. Report any failures. Manifest: [paste manifest JSON here]"
})
```

If any file fails to download, set `"error": true` on that entry in the manifest before
proceeding — the script will insert a placeholder cover sheet for errored entries.

### Step 4 — Run the Bates stamping script

Locate `bates_stamp.py` in the bates-production skill's `scripts/` directory. The correct
bash path: look in the system prompt for the line that maps the skills directory (it ends in
`.claude/skills/`) and append `bates-production/scripts/bates_stamp.py`.

Install dependencies if needed (run once):
```bash
pip install pypdf reportlab Pillow openpyxl --break-system-packages
```

Write the manifest to `manifest.json` in the working outputs directory, then use the
`Agent` tool with `model: "haiku"` to execute the script:

```
Agent({
  model: "haiku",
  description: "Run Bates stamping script",
  prompt: "Run the following bash command and capture all stdout output:

python [script_path] --manifest [manifest_path] --output [output_dir]

After it completes, confirm that [PREFIX]_Bates_Production.pdf, bates_index.json, and
contents_list.txt were written to [output_dir]. Report the final Bates range and total
page count from the script's stdout summary line."
})
```

### Step 5 — Display the contents list, save as .docx, and generate the production log

After the script completes, read `bates_index.json` from the output directory.

**A. Display the contents list in Claude** — format it as a clean table the user can copy/paste:

```
BATES PRODUCTION CONTENTS LIST
[Case Name]
Production Date: [Today's Date]
Bates Range: [PREFIX000001–PREFIXNNNNNN] ([N] pages total)

#   Document                              Bates Range                Pages
─────────────────────────────────────────────────────────────────────────
1   Offer Letter                          KAYE000001–KAYE000002      2
2   Signed Settlement Agreement           KAYE000003–KAYE000015      13
3   Policy Acknowledgment [NATIVE]        KAYE000016                 1
...

Total Documents: N | Total Pages: NNN
```

Mark native documents with `[NATIVE]` so the recipient knows those files were produced as
native files alongside the PDF.

**B. Save the contents list as a .docx** — use the `anthropic-skills:docx` skill to create
`[PREFIX]_Bates_Contents.docx` in the outputs folder. The document should contain:
- Title: "Bates Production — [Case Name]"
- Subtitle: "Production Date: [Date] | Range: [PREFIX000001–PREFIXNNNNNN]"
- A formatted table with columns: #, Document Title, Bates Range, Pages
- A footer row showing total document count and total pages

**C. Generate the Excel production log** — this is a required step, not optional.

The production log captures metadata that attorneys use to answer follow-up questions,
track what was produced, and populate privilege logs or cover letters: document type,
a brief factual summary, and the method of production.

**Generate summaries.** For each entry in bates_index.json:
- If the file is a PDF and was downloaded, read its text (using a quick Python snippet
  or the `Read` tool) and write a 1–2 sentence factual summary: what type of document
  it is, key parties or subject matter, and date if visible on the first page. Keep
  summaries concise — they are for internal tracking, not privilege logs.
- If the file is a native file (xlsx, docx, mp4, msg, etc.), write a brief descriptive
  summary based on the document title and file type (e.g., "Excel spreadsheet — employee
  schedule data").
- If the file had a download error, write "Download error — document not reviewed."

**Determine method of production.** Default rules:
- `"Electronic"` — PDFs and images (produced as pages within the stamped PDF)
- `"Native"` — any file with `"native": true` in bates_index.json (produced as the
  original file alongside the PDF)

If the user specifies a different method for any document (e.g., "hard copy"), use that.

**Build log_data.json** in the outputs directory:
```json
{
  "entries": [
    {
      "filename": "offer_letter.pdf",
      "summary": "Employment offer letter dated March 15, 2023 addressed to plaintiff.",
      "method": "Electronic"
    },
    {
      "filename": "policy_ack.xlsx",
      "summary": "Employee handbook acknowledgment form — native Excel file.",
      "method": "Native"
    }
  ]
}
```

**Run the production log script.** Locate `generate_production_log.py` in the same
`scripts/` directory as `bates_stamp.py`.

```bash
python [scripts_dir]/generate_production_log.py \
  --index [output_dir]/bates_index.json \
  --output [output_dir] \
  --log-data [output_dir]/log_data.json
```

This writes `[PREFIX]_Production_Log.xlsx` to the output directory. The spreadsheet uses
Gopuff navy/red branding and has the following columns:
`#`, `Document Title`, `Document Type`, `Summary`, `Bates Start`, `Bates End`, `Pages`, `Method of Production`

### Step 6 — Create the production folder in Drive and upload deliverables

Format today's date as `M.D.YY` (e.g., `6.24.26`). The folder structure is:

```
[Matter folder]/
  Production/
    M.D.YY/          ← e.g. "6.24.26"
      [production files]
```

**6a — Ensure the "Production" parent folder exists.** Search for a folder named
`Production` directly inside the matter's Drive folder. If it does not exist, create it:

```json
{
  "name": "Production",
  "mimeType": "application/vnd.google-apps.folder",
  "parentId": "<matter-folder-id>"
}
```

Capture the Production folder ID.

**6b — Create the date subfolder.** Inside the Production folder, create a subfolder
named with today's date (`M.D.YY`, e.g. `6.24.26`):

```json
{
  "name": "6.24.26",
  "mimeType": "application/vnd.google-apps.folder",
  "parentId": "<production-folder-id>"
}
```

If either `create_file` call fails with a shared-drive permissions error, create the
folder in My Drive first (no `parentId`), then use `copy_file` to move it into place.

Capture the date subfolder ID. This is the upload target for all deliverables.

**6c — Upload deliverables using the `google-drive-upload` skill.**

For each of the three output files (stamped PDF, contents .docx, production log .xlsx),
delegate the upload to the `google-drive-upload` skill. Supply:
- Local path of the file
- The date subfolder ID from 6b
- Human-readable path: `Shared drives/Legal - Litigation 2.0/Matters/[Case Name]/Production/M.D.YY`

The skill handles size automatically: files under 5 MB go via Apps Script; larger files
are presented to you for manual upload.

Collect the Drive URL for each file that uploaded successfully.

### Step 7 — Final summary

Present the user with a clean summary:

```
✓ Production complete — [CASE NAME]
  Bates Range: [PREFIX000001–PREFIXNNNNNN]  ([N] documents, [NNN] pages)

  Files uploaded to Drive → Production/M.D.YY:
    📄 [M.D.YY PrefixTitlecase Production.pdf]  [link]
    📝 [PREFIX]_Bates_Contents.docx      [link]
    📊 [PREFIX]_Production_Log.xlsx      [link]

  Production folder: [Drive URL for the date subfolder]
  Local copies saved to: [output_dir]
```

If any upload failed, substitute the local file path and note it needs manual upload.
