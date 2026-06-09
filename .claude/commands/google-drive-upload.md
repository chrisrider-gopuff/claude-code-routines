---
name: google-drive-upload
description: >
  Upload files to or download files from Google Drive. Use this skill any time
  another skill needs to read from or write to Google Drive — uploading a check
  request, downloading a settlement agreement, saving a production package, or
  retrieving any document from Litigation 2.0 or other Drive locations. Uses
  Desktop Commander to write directly to G:\, with manual fallback if that
  fails. Never uses the Google Drive MCP for uploads. Always use this skill
  instead of calling Drive MCP tools directly for any upload.
---

# Google Drive File I/O

All Drive reads and writes go through this skill. For uploads, Desktop Commander writes directly to G:\ — the Google Drive MCP is never used for uploads.

---

## UPLOAD

### Step 1 — Write via Desktop Commander to G:\

Use Desktop Commander's execute_command to copy the file from its local Windows
path to the G:\ destination. First ensure the destination folder exists, then copy:

  mcp__Desktop_Commander__execute_command(
    command='if not exist "G:\\ destination folder" mkdir "G:\\ destination folder"'
  )
  mcp__Desktop_Commander__execute_command(
    command='copy /Y "windows_local_path" "G:\\ destination path"'
  )

- windows_local_path: Windows-format absolute path to the local file
  e.g. C:\Users\ChrisRider\AppData\Roaming\Claude\...\outputs\file.docx
- G:\ destination path: Full G:\ path from the calling skill
  e.g. G:\Shared drives\Legal - Litigation 2.0\Matters\Doe, Jane\file.docx

If the copy succeeds (exit code 0 / "1 file(s) copied"), report the G:\ path to
the user. Done.

If Desktop Commander is unavailable, errors, or the copy fails, go to Step 2.
Do not fall back to Google Drive MCP tools for uploads.

### Step 2 — Manual upload fallback

1. Call mcp__cowork__present_files with the local file path.
2. Tell the user:
   "Upload via Desktop Commander failed — here's the file. Please copy it
   manually to: [full G:\ path]"

---

## DOWNLOAD

### Step 1 — Read from G:\ via Desktop Commander

  mcp__Desktop_Commander__execute_command(
    command='copy /Y "G:\\ source path" "windows_local_destination"'
  )

If it succeeds, proceed with the file. Done. If it fails, go to Step 1b.

### Step 1b — Prompt to connect G:\

Ask: "It looks like the Drive folder is not connected. Would you like to add it
now so I can download directly?"

- Yes: Call mcp__cowork__request_cowork_directory, retry Step 1.
- No: Proceed to Step 2.

### Step 2 — Drive MCP download (files under 1 MB only)

Check size via mcp__57f9aac8-e3ef-4962-93ec-85c329af5393__get_file_metadata.
If 1 MB or larger, go to Step 3.

If under 1 MB, call mcp__57f9aac8-e3ef-4962-93ec-85c329af5393__download_file_content
with the Drive file ID and save to the local destination. If MCP errors, go to Step 3.

### Step 3 — Manual download fallback

Ask the user to download the file from Drive manually and attach it or place it
at a specific local path.

---

## MIME type reference

Extension  | mimeType
-----------|----------------------------------------------------------
.pdf       | application/pdf
.docx      | application/vnd.openxmlformats-officedocument.wordprocessingml.document
.xlsx      | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
.pptx      | application/vnd.openxmlformats-officedocument.presentationml.presentation
.png       | image/png
.jpg/.jpeg | image/jpeg
.txt       | text/plain
.csv       | text/csv
.json      | application/json

---

## What calling skills must provide

Upload:
- Absolute local path in Windows format (e.g. C:\Users\ChrisRider\...)
- Full G:\ destination path
- Human-readable folder description (for manual fallback message)

Download:
- Full G:\ source path or Drive file ID
- Absolute local destination path (Windows format)
- Human-readable description of the file (for Step 3 message)
