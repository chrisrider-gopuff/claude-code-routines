---
name: airtable-manager
description: >
  ALWAYS use this skill for ANY interaction with Airtable — no exceptions. Triggers include:
  "update Airtable", "update the Legal Tracker", "add a case", "log a settlement", "set the
  settlement value", "update [any field] for [any case]", "create a record", "find a record",
  "what's in Airtable for X", or any mention of a case name alongside a field update. Uses
  PowerShell Invoke-RestMethod via Desktop Commander to call a Google Apps Script proxy that
  talks to the Airtable API.
---

# Airtable Manager

## How it works

Claude calls a Google Apps Script web app via Desktop Commander + PowerShell. The Apps Script holds the Airtable PAT and proxies all API calls.

**Apps Script URL:**
```
https://script.google.com/macros/s/AKfycbyw9DuipVzhlUecfmW66mBBuTgie9ne0GFHlhfy9fwrQDiYPKnSripltBAkW_zHy2T06g/exec
```

## Passphrase

Read it silently before every call — never log or display it:

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
```

## Known Bases

| Display Name   | Base ID              | Default Table | Table ID             |
|----------------|----------------------|---------------|----------------------|
| Legal Tracker  | appFIB9fJCzTeFDcG    | Cases         | tblmPLdw7pLLnAyFs    |

To add a new base: update the `BASES` object in AirtableAPI.gs and add a row to this table.

## How to make a call

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
$body = @"
{"passphrase":"$passphrase","operation":"searchRecords","baseName":"Legal Tracker","field":"Matter","value":"Smith, John"}
"@
Invoke-RestMethod -Uri "https://script.google.com/macros/s/AKfycbyw9DuipVzhlUecfmW66mBBuTgie9ne0GFHlhfy9fwrQDiYPKnSripltBAkW_zHy2T06g/exec" -Method POST -ContentType "application/json" -Body $body
```

## Supported operations

All payloads require `passphrase`, `operation`, and `baseName`. `tableName` is optional.

### List records (with optional filter)
`{"passphrase":"...","operation":"listRecords","baseName":"Legal Tracker","filterFormula":"{Matter}='Smith, John'","maxRecords":50}`

### Search by field value
`{"passphrase":"...","operation":"searchRecords","baseName":"Legal Tracker","field":"Matter","value":"Smith, John"}`

### Get a record by ID
`{"passphrase":"...","operation":"getRecord","baseName":"Legal Tracker","recordId":"recXXXXXXXXXXXXXX"}`

### Create a record
`{"passphrase":"...","operation":"createRecord","baseName":"Legal Tracker","fields":{"Matter":"Smith, John","Claim Type":"Employment","State":"CA"}}`

### Update a record
`{"passphrase":"...","operation":"updateRecord","baseName":"Legal Tracker","recordId":"recXXXXXXXXXXXXXX","fields":{"Total Settlement":30000}}`

### Delete a record
`{"passphrase":"...","operation":"deleteRecord","baseName":"Legal Tracker","recordId":"recXXXXXXXXXXXXXX"}`

### List known bases
`{"passphrase":"...","operation":"listBases"}`

### Get schema (field names + select options for all tables in a base)
`{"passphrase":"...","operation":"getSchema","baseName":"Legal Tracker"}`

Returns an object keyed by table name. Each table is an array of field objects:
```json
{
  "Cases": [
    { "name": "Matter", "type": "singleLineText", "options": null },
    { "name": "Claim Type", "type": "singleSelect", "options": ["Employment", "Workers Comp", "Personal Injury"] },
    { "name": "Total Settlement", "type": "currency", "options": null }
  ]
}
```
Call this before any `createRecord` or `updateRecord` to verify exact field names and valid select option values. Field names are case-sensitive.

## Finding a record ID

Use `searchRecords` on the `Matter` field first, then use the returned `recordId` for updates/deletes.

Apply fuzzy matching:
- Name inversions: "Kiara Lowe" → search "Lowe, Kiara"
- Partial names: try the most distinctive part
- Multiple matches: ask Chris to confirm

## Responses

- `{"error": "Unauthorized"}` — passphrase file missing or wrong
- Other errors: report clearly and suggest the fix

## Field reference

Before any `createRecord` or `updateRecord`, call `getSchema` to retrieve current field names and valid select option values directly from Airtable. Do not guess field names. Key rules that apply regardless of schema:
- Primary field is **`Matter`** (not "Name")
- `Status` is a formula — do not include in writes
- Currency fields take plain numbers, not strings
- Dates use MM/DD/YYYY
- Field names are case-sensitive
