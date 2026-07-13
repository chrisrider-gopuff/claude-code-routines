---
name: google-sheets
description: Edit any Google Sheets document — set cells, append rows, read data, find/replace, create/delete tabs, and more. ALWAYS use this skill whenever the user asks to edit, update, read, or modify a Google Sheet, spreadsheet, or mentions a Google Sheets URL or spreadsheet ID. Trigger phrases include: "update the sheet", "add a row", "set cell", "read from the spreadsheet", "clear the range", "create a new tab", "find and replace in the sheet", or any mention of a docs.google.com/spreadsheets URL.
---

## Overview

Use PowerShell's `Invoke-RestMethod` via Desktop Commander to call a deployed Google Apps Script web app that edits Google Sheets on Chris's behalf.

**Apps Script URL:**
```
https://script.google.com/macros/s/AKfycbyScH1lpwVkN4GTVpONPsyMOcfiII-X1l7FX5vmlNPIKOs1QimTONuqEsfkPGMPPvYx/exec
```

## Passphrase

Read it silently before every call — never log or display it:

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
```

## How to make a call

Always use `Invoke-RestMethod` via Desktop Commander with `shell: powershell.exe`. Never use curl.

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
$body = @"
{"passphrase":"$passphrase","spreadsheetId":"ID","operation":"setCell","sheetName":"Sheet1","cell":"A1","value":"hello"}
"@
Invoke-RestMethod -Uri "https://script.google.com/macros/s/AKfycbyScH1lpwVkN4GTVpONPsyMOcfiII-X1l7FX5vmlNPIKOs1QimTONuqEsfkPGMPPvYx/exec" -Method POST -ContentType "application/json" -Body $body
```

## Extracting the spreadsheet ID

The ID is the string between `/d/` and `/edit` in a Google Sheets URL:
`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

Extract from a full URL if provided. Ask for the URL if no ID is available.

## Payload fields

- `passphrase` — read from file, required every request
- `spreadsheetId` — required
- `operation` — required
- `sheetName` — optional; defaults to active sheet

## Supported operations

### Set a single cell
`{"passphrase":"...","spreadsheetId":"ID","operation":"setCell","sheetName":"Sheet1","cell":"A1","value":"hello"}`

### Set multiple cells
`{"passphrase":"...","spreadsheetId":"ID","operation":"setCells","sheetName":"Sheet1","cells":[{"cell":"A1","value":"x"},{"cell":"B2","value":"y"}]}`

### Read a single cell
`{"passphrase":"...","spreadsheetId":"ID","operation":"getCell","sheetName":"Sheet1","cell":"A1"}`

### Read a range
`{"passphrase":"...","spreadsheetId":"ID","operation":"getCells","sheetName":"Sheet1","range":"A1:C5"}`

### Get all data
`{"passphrase":"...","spreadsheetId":"ID","operation":"getAll","sheetName":"Sheet1"}`

### Append a row
`{"passphrase":"...","spreadsheetId":"ID","operation":"appendRow","sheetName":"Sheet1","values":["col1","col2","col3"]}`

### Insert a row (1-indexed)
`{"passphrase":"...","spreadsheetId":"ID","operation":"insertRow","sheetName":"Sheet1","row":3,"values":["a","b","c"]}`

### Delete a row (1-indexed)
`{"passphrase":"...","spreadsheetId":"ID","operation":"deleteRow","sheetName":"Sheet1","row":3}`

### Clear a range
`{"passphrase":"...","spreadsheetId":"ID","operation":"clearRange","sheetName":"Sheet1","range":"A1:C5"}`

### Find and replace
`{"passphrase":"...","spreadsheetId":"ID","operation":"findReplace","sheetName":"Sheet1","find":"old","replace":"new","matchCase":false}`

### Create a tab
`{"passphrase":"...","spreadsheetId":"ID","operation":"createSheet","sheetName":"NewTabName"}`

### Delete a tab
`{"passphrase":"...","spreadsheetId":"ID","operation":"deleteSheet","sheetName":"TabToDelete"}`

### List all tab names
`{"passphrase":"...","spreadsheetId":"ID","operation":"getSheetNames"}`

## Responses

- Write operations: `{"success": true}`
- Read operations: `{"value": ...}` or `{"values": [...]}`
- `{"error": "Unauthorized"}` — passphrase file missing or wrong
- Other errors: report to Chris and suggest the likely fix
