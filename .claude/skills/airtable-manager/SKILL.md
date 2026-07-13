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
https://script.google.com/macros/s/AKfycbydSpheVX7t1RAs5TXlDk6Fl8yeqa_GVfYJLwCdssQKmKtVpk1XSXG_esgTVbsRoTAz-Q/exec
```
(Updated 2026-07-10 — the previous deployment URL started 404ing. If this one ever
stops working, redeploy the Apps Script as a web app and update this URL, rather than
guessing at another one.)

## Passphrase

Read it silently before every call — never log or display it:

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
```

## Known Bases

| Display Name       | Base ID           | Default Table | Table ID          |
|---------------------|-------------------|---------------|-------------------|
| Legal Tracker       | appFIB9fJCzTeFDcG | Cases         | tblmPLdw7pLLnAyFs |
| D Ops Request Form  | appt2FqM1fSXbhcHn | Requests      | tblgCUTmuTCXU5GQQ |

Additional tables in Legal Tracker:

| Table Name      | Table ID          |
|------------------|-------------------|
| Outside Counsel  | tblZYMpOfoSp1tGFd |

To add a new base: update the `BASES` object in AirtableAPI.gs and add a row to this table.

## How to make a call

```powershell
$passphrase = (Get-Content "G:\My Drive\Automation\Phrase.txt" -Raw).Trim()
$body = @"
{"passphrase":"$passphrase","operation":"searchRecords","baseName":"Legal Tracker","field":"Matter","value":"Smith, John"}
"@
Invoke-RestMethod -Uri "https://script.google.com/macros/s/AKfycbydSpheVX7t1RAs5TXlDk6Fl8yeqa_GVfYJLwCdssQKmKtVpk1XSXG_esgTVbsRoTAz-Q/exec" -Method POST -ContentType "application/json" -Body $body
```

On Linux containers (no PowerShell), read the passphrase from `$AIRTABLE_PASSPHRASE` and
use `curl -sS -L` instead (the `-L` is required — the Apps Script `/exec` endpoint always
302-redirects to `script.googleusercontent.com` to serve the response; don't add `-X POST`
explicitly when following the redirect, since that forces POST onto the redirected GET
request and the echo endpoint replies 405). If the passphrase in `$AIRTABLE_PASSPHRASE`
gets `{"error":"Unauthorized"}`, it may have been rotated/extended — check with Chris for
the current value rather than guessing.

## Supported operations

All payloads require `passphrase`, `operation`, and `baseName`. `tableName` is optional.

### List records (with optional filter)
`{"passphrase":"...","operation":"listRecords","baseName":"Legal Tracker","filterFormula":"{Matter}='Smith, John'","maxRecords":50}`

### Search by field value
`{"passphrase":"...","operation":"searchRecords","baseName":"Legal Tracker","field":"Matter","value":"Smith, John"}`

Note: `searchRecords` appears to require an exact (or near-exact) match on this deployment —
searching a bare surname like `"Fundingsland"` against a `Matter` value of `"Fundingsland, Jonathan"`
returned zero records. For substring/fuzzy lookups, use `listRecords` with a `FIND()` filter formula
instead: `{"operation":"listRecords","baseName":"Legal Tracker","filterFormula":"FIND('Fundingsland',{Matter})"}`.

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

## D Ops Request Form — field reference

| Field                      | Type              | Notes                                                                                       |
|----------------------------|-------------------|---------------------------------------------------------------------------------------------|
| `Name`                     | text              | Request title — use claimant name (e.g., "Bell, Shannon L.")                               |
| `Who is this request for?` | text              | Always `"Legal"`                                                                            |
| `How can we help?`         | text              | Request description                                                                         |
| `Type of Request`          | array             | `["Data Pull"]` if description contains "data pull" (case-insensitive); else `["Document Pull"]` |
| `Due Date`                 | date (YYYY-MM-DD) | Optional                                                                                    |
| `Priority`                 | text              | Optional                                                                                    |
| `Task Status`              | text              | Do not set on create                                                                        |
| `Assigned To`              | user array        | Do not set on create                                                                        |

## Field reference

Before any `createRecord` or `updateRecord`, call `getSchema` to retrieve current field names and valid select option values directly from Airtable. Do not guess field names. Key rules that apply regardless of schema:
- Primary field is **`Matter`** (not "Name")
- `Status` is a formula — do not include in writes
- Currency fields take plain numbers, not strings
- Dates: pass ISO `YYYY-MM-DD` (confirmed working; existing records store dates this way)
- Field names are case-sensitive
- There is no literal **`Notes`** field on `Cases`. For narrative updates ("Notes: ...", "AT: Notes: ...")
  do NOT overwrite `Synopsis` or `Next Action` — that destroys existing case background. Instead,
  `createRecord` a new row in the **`Case Activity`** table with `Case: [recordId]`, `Entry: <the note
  text>`, `Entry Type: "Claude"`, `Activity Date: <today, YYYY-MM-DD>`. This is additive and matches
  the schema's built-in `Entry Type` option for exactly this use case.
