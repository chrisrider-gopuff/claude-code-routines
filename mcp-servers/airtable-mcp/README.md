# airtable-mcp server

An Apps Script Web App that proxies exactly one Airtable base per
deployment, so no caller — native routine, skill, or Cowork plugin install —
ever holds that base's `AIRTABLE_API_KEY` directly; the deployment is the
only thing that does. See `AirtableMcpServer.gs` for the implementation and
the `Setup` comment at the top of that file.

This is not a scheduled routine — it's a standing service other things call
over HTTPS. The code is generic: nothing about a specific Airtable base is
hardcoded. To proxy a different base, deploy this same script again as an
independent Apps Script project with its own Script Properties — no code
changes needed. Everything base-specific (which base, which tables, who can
write/delete where) lives in that deployment's `AIRTABLE_MCP_CONFIG`
Script Property, described below.

## Two permission tiers, config-driven per deployment

Callers authenticate with one of two tokens, each scoped to a tier defined
in `AIRTABLE_MCP_CONFIG.tiers`:

- **`unsupervised`** — for anything that runs on a schedule with no human
  present. Scope its `writeTables` to only what that caller actually needs,
  nothing more — an unsupervised caller may be processing untrusted content
  (email, chat messages) that could attempt prompt injection, and this tier
  existing means the server rejects an out-of-scope write outright rather
  than depending on the caller's own prompt to simply not ask.
- **`supervised`** — for skills or interactive sessions where a person is
  directing each write in real time. Can reasonably be scoped wider.

The same per-tier `writeTables` list governs both `airtable_create_record`
and `airtable_update_record` — if a tier can create in a table, it can also
update existing records there, and vice versa.

`readTables` is not tier-scoped — either tier can read any table in that
list. `airtable_query` also pages: Airtable caps a single response at 100
records regardless of `maxRecords`, so a table with more rows than that
needs a follow-up call with the previous response's `offset` to get the
rest. `airtable_get_schema` is unrestricted for either tier (read-only
metadata), for callers that need to detect a renamed table/field before
trusting a hardcoded name.

`deleteTables` is separate from the tier/write model entirely: any caller,
either tier, can delete from a table in that list; nothing can delete from
a table outside it, regardless of tier. Keep this scoped to draft/staging
tables designed to have rows removed from them — never a system-of-record
table.

## Deploying (once per Airtable base)

1. Create a new (standalone) Apps Script project at script.google.com and
   paste in `AirtableMcpServer.gs`.
2. Project Settings -> Script Properties, set:
   - `AIRTABLE_API_KEY` — this base's Airtable personal access token. Never
     leaves this project.
   - `AIRTABLE_BASE_ID` — this base's ID, e.g. `appXXXXXXXXXXXXXX`.
   - `AIRTABLE_MCP_TOKEN_UNSUPERVISED` — token for unsupervised callers.
   - `AIRTABLE_MCP_TOKEN_SUPERVISED` — token for supervised callers.
   - `AIRTABLE_MCP_CONFIG` — a JSON string (see shape in `AirtableMcpServer.gs`'s
     Setup comment, and the worked example below).

   Generate the two tokens independently (e.g. `openssl rand -hex 32` run
   twice) — they must not share a value, or the tier split is meaningless.
3. Deploy -> New deployment -> type: Web app. Execute as: Me. Who has
   access: Anyone. Copy the resulting `.../exec` URL.
4. Give each caller `<deployment URL>?token=<its tier's token>` as its
   Airtable access URL / remote MCP server URL.

## Worked example: the Legal Tracker deployment

This is the actual `AIRTABLE_MCP_CONFIG` value used by the first deployment
of this server, proxying the Legal Tracker base (`appFIB9fJCzTeFDcG`) for
`legal-tracker-triage`, `legal-tracker-triage-review`, and
`nat-1-1-briefing`. Since this now lives in Script Properties rather than
in code, this is the checked-in record of what it should be set to — update
this block if that deployment's config ever changes, so it doesn't only
exist as tribal knowledge in one Apps Script project's settings.

```json
{
  "name": "airtable-legal-tracker",
  "readTables": ["Update Matches", "Case Activity", "Thread Matches", "Cases", "Opposing Counsel"],
  "tiers": {
    "unsupervised": { "writeTables": ["Update Matches", "Thread Matches"] },
    "supervised": { "writeTables": ["Update Matches", "Case Activity", "Cases"] }
  },
  "deleteTables": ["Update Matches"]
}
```

Rationale for these specific choices lives in `CLAUDE.md`'s `airtable-mcp`
MCP-server section (which describes this Legal Tracker deployment
specifically) and in each routine's `prompt.md` — this file only needs to
be the source of truth for the config's actual current value.

`AIRTABLE_BASE_ID` for this deployment is `appFIB9fJCzTeFDcG`.

**How `legal-tracker-triage`, `legal-tracker-triage-review`, and
`nat-1-1-briefing` get the `unsupervised` token:** not a plain environment
variable — they look it up at the start of each run from a private,
single-owner ("Secrets Sheet") Google Sheet (spreadsheet ID
`1HpVuNDByHfpXAUCq-6Ty-X5hM5oHBh829jRXqfqhwRo`, owned solely by
`chris.rider@gopuff.com`, no other collaborators) that also holds several
unrelated secrets for other systems (the Airtable API key itself,
BrightFlag credentials, a routines API token), using the Google Drive MCP's
`read_file_content` on that file ID.

This is a **whole-file read, not a scoped one** — there's no Google Sheets
MCP connector or range-scoped read tool available in this environment.
Confirmed by checking both `ListConnectors` (nothing named Sheets) and
`SearchMcpRegistry` (only Google Drive is connected; its tools —
`read_file_content`, `download_file_content`, etc. — read or download
entire files, no range parameter). A `google-sheets` *skill* does support
single-cell/range reads, but it's not an MCP connector: it shells out to
PowerShell via Desktop Commander on Chris's local desktop and reads its own
auth passphrase from a local file path, so it's unreachable from a cloud
routine. Given that, each routine's `prompt.md` is explicit that even
though the read returns everything in the sheet, only the single row
labeled `AIRTABLE_MCP_TOKEN_UNSUPERVISED` may ever be used, echoed, or
referenced — never any other row or the sheet's contents in general. That's
enforced by prompt discipline, not by the read itself, which is a real
trade-off worth knowing rather than glossing over: a routine that mishandled
this (or was successfully prompt-injected into ignoring the instruction)
would have every other secret in the vault sitting in its own context.
`AIRTABLE_MCP_URL` (not a secret, just the deployment URL) is still a plain
environment variable.

## Testing before wiring up any caller

Replace `DEPLOYMENT_URL`, `SUPERVISED_TOKEN`, and `UNSUPERVISED_TOKEN` and
confirm each of these round-trips correctly (examples use the Legal Tracker
config above — substitute table names for a different deployment):

```bash
# initialize
curl -s -X POST "DEPLOYMENT_URL?token=SUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# tools/list
curl -s -X POST "DEPLOYMENT_URL?token=SUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# tools/call — read, either tier
curl -s -X POST "DEPLOYMENT_URL?token=SUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"airtable_query","arguments":{"table":"Update Matches","maxRecords":5}}}'

# tools/call — write to Case Activity with the supervised token: should succeed
curl -s -X POST "DEPLOYMENT_URL?token=SUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"airtable_create_record","arguments":{"table":"Case Activity","fields":{}}}}'

# tools/call — SAME write attempt with the unsupervised token: must be rejected
curl -s -X POST "DEPLOYMENT_URL?token=UNSUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"airtable_create_record","arguments":{"table":"Case Activity","fields":{}}}}'

# tools/call — update an existing Update Matches row, either tier: should succeed
curl -s -X POST "DEPLOYMENT_URL?token=UNSUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"airtable_update_record","arguments":{"table":"Update Matches","recordId":"recXXXXXXXXXXXXXX","fields":{}}}}'

# tools/call — update Case Activity with the unsupervised token: must be rejected
curl -s -X POST "DEPLOYMENT_URL?token=UNSUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"airtable_update_record","arguments":{"table":"Case Activity","recordId":"recXXXXXXXXXXXXXX","fields":{}}}}'

# tools/call — delete from Update Matches with either token: should succeed
curl -s -X POST "DEPLOYMENT_URL?token=UNSUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"airtable_delete_record","arguments":{"table":"Update Matches","recordId":"recXXXXXXXXXXXXXX"}}}'

# tools/call — delete from Case Activity with either token: must be rejected
curl -s -X POST "DEPLOYMENT_URL?token=SUPERVISED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"airtable_delete_record","arguments":{"table":"Case Activity","recordId":"recXXXXXXXXXXXXXX"}}}'

# missing/wrong token should come back as a JSON-RPC error, not a 200 with data
curl -s -X POST "DEPLOYMENT_URL?token=wrong" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":10,"method":"tools/list","params":{}}'
```

Confirm the Case-Activity-with-unsupervised-token create call actually comes
back as a `-32000` error (`Table "Case Activity" is not writable by the
"unsupervised" tier.`) before pointing any unsupervised caller at this server —
that rejection is the whole point of the tier split, not an incidental
detail. Same for the Case-Activity delete attempt: it must fail with
`Table "Case Activity" is not in this deployment's deleteTables.` even
though the supervised token can otherwise write to that table.

Also confirm `AIRTABLE_MCP_CONFIG` misconfiguration fails loudly rather than
silently: temporarily set it to invalid JSON and confirm you get a
`-32000` error naming the problem, not a crash with no explanation.

## Known limitation

Apps Script Web Apps cannot read custom HTTP request headers (`doPost(e)`
has no `e.headers`), so each token travels as a `token` query-string
parameter rather than a standard `Authorization` header. If Cowork's remote
MCP connector UI insists on a separate bearer-token field rather than
letting you paste an arbitrary URL, this approach needs revisiting — confirm
which one it actually offers before assuming this works end-to-end.
