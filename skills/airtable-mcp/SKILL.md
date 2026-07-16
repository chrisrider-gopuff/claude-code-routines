---
name: airtable-mcp
description: Query, create, update, or delete records in an Airtable base through its airtable-mcp proxy deployment. Use this any time a routine or skill needs Airtable data instead of calling Airtable's REST API directly or holding an AIRTABLE_API_KEY.
---

# airtable-mcp

How to call any deployment of the `airtable-mcp` Apps Script server (see
`mcp-servers/airtable-mcp/AirtableMcpServer.gs`). Each deployment proxies
exactly one Airtable base — no caller ever holds that base's
`AIRTABLE_API_KEY` directly; the deployment is the only thing that does.
This skill documents the mechanics that are the same across every
deployment; which tables exist, which tier can write where, and which base
a given deployment even points at are specific to that deployment's config
(see "Known deployments" below).

## How to call it

Two possible transports, depending on how this session is connected —
check which applies before doing anything else:

**If `airtable_query` / `airtable_create_record` / `airtable_update_record`
/ `airtable_delete_record` tools are already available** (a Cowork plugin
install, or any session with an `airtable-mcp` MCP connector configured):
call them directly with the schemas in "Operations" below. No curl needed —
the connector handles the HTTP/auth mechanics.

**Otherwise** (native routines in this repo, which call things via
`curl`/Bash rather than MCP connectors today): send a JSON-RPC 2.0 POST to
the deployment URL yourself, using `AIRTABLE_MCP_URL` and
`AIRTABLE_MCP_TOKEN` from the environment:

```bash
curl -s -X POST "$AIRTABLE_MCP_URL?token=$AIRTABLE_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"airtable_query","arguments":{"table":"<table name>","maxRecords":20}}}'
```

`method` is always `tools/call`; `params.name` is the operation (from
"Operations" below); `params.arguments` is that operation's input. The
response is a JSON-RPC envelope — a real result is under `.result`, a
rejected/failed call comes back as `.error.message` (see "Handling
rejections" below).

Each environment's `AIRTABLE_MCP_URL`/`AIRTABLE_MCP_TOKEN` points at exactly
one deployment (one base) — a caller never needs to choose between
deployments at request time, that's decided once when the environment is
configured.

## Operations

Mirrors the tool definitions in `AirtableMcpServer.gs` — if this drifts
from that file, the file wins; update this doc to match. Table names are
not listed here since they vary per deployment — see "Known deployments".

| Tool | Arguments | Notes |
|---|---|---|
| `airtable_query` | `table` (required), `filterByFormula` (optional), `maxRecords` (optional, default 20), `offset` (optional) | Any table in this deployment's `readTables` — both tiers can always read. Airtable pages at 100 records regardless of `maxRecords` — if the response has an `offset` field, call again passing it to get the next page; don't assume one call got everything for a table with more than ~100 rows. |
| `airtable_get_schema` | none | Returns the live table/field schema for this deployment's base. Call this before trusting a hardcoded table/field name if you suspect it may have changed, rather than discovering the drift from a failed write. |
| `airtable_create_record` | `table`, `fields` (object) | Writable tables depend on caller tier — see "Tiers" below. |
| `airtable_update_record` | `table`, `recordId`, `fields` (object, partial update) | Same tier scoping as create. |
| `airtable_delete_record` | `table`, `recordId` | Restricted to this deployment's `deleteTables`, for any caller regardless of tier. |

## Tiers

Which token is in `AIRTABLE_MCP_TOKEN` (or which connector you're using)
determines what you can write. Every deployment has exactly these two
fixed tiers, but each deployment defines its own `writeTables` per tier:

- **`unsupervised`** — for anything that runs on a schedule with no human
  present. Scoped tighter, since an unsupervised caller may be processing
  untrusted content (email, chat messages) that could attempt prompt
  injection — that's enforced by the server, not by this skill or the
  caller's own prompt.
- **`supervised`** — for skills or interactive sessions where a person is
  directing each write in real time. Can reasonably be scoped wider.

**If you're writing a routine or skill's instructions:** don't assume which
tier you'll get, or which tables that tier can touch on this deployment —
that's decided by which token the environment was configured with and
which deployment it points at, not by anything in this skill. Just make
the calls you need for the deployment's actual base and tables; the server
will reject anything out of scope.

## Handling rejections

A tier or delete-scope rejection (e.g. `Table "X" is not writable by the
"unsupervised" tier.`) is a deliberate guardrail, not a bug or a
misconfiguration to work around. If you're running unsupervised and hit one,
don't retry against a different table, don't retry with different
casing/wording, and don't try to route around it via a different
operation — stop, and if you were expecting to log something there, log it
somewhere within your actual scope instead or surface it for manual
handling. If you're a supervised/interactive caller and hit a rejection, it
usually means the table name is wrong or genuinely isn't in scope for this
deployment at all — check that deployment's known table list (below)
before assuming it's a permissions issue.

## Required environment (native-routine / curl path only)

- `AIRTABLE_MCP_URL` — the Apps Script Web App deployment URL for the base
  this caller needs (no query string). Not secret, always a plain
  environment variable.
- `AIRTABLE_MCP_TOKEN` — whichever tier's token matches this caller's trust
  level. Never the raw `AIRTABLE_API_KEY`. Sourcing varies by deployment and
  caller — some are a plain environment variable set at the environment
  level; others (see "Known deployments") are looked up at runtime from a
  private secrets store instead of ever sitting in the environment config.
  Check that deployment's entry below before assuming it's a bare env var.

See `mcp-servers/airtable-mcp/README.md` for how these are provisioned
server-side, and for how to stand up a new deployment for a different base.

## Known deployments

- **Legal Tracker** (`appFIB9fJCzTeFDcG`) — used by `legal-tracker-triage`,
  `legal-tracker-triage-review`, and `nat-1-1-briefing`. Tables: `Update
  Matches`, `Case Activity`, `Thread Matches`, `Cases`, `Opposing Counsel`.
  The actual `AIRTABLE_MCP_CONFIG` for this deployment (which tier can
  write/delete where, and why) is documented in
  `mcp-servers/airtable-mcp/README.md`'s "Worked example" section — that
  file, not this one, is the source of truth for its current value.
  **Token sourcing:** none of these three callers hold `AIRTABLE_MCP_TOKEN`
  as a plain environment variable — they look up the `unsupervised` token
  at the start of each run from a private, single-owner Secrets Sheet via
  the Google Drive MCP's `read_file_content` (a whole-file read — no
  Google Sheets MCP connector or range-scoped read tool exists in this
  environment). The sheet also holds unrelated secrets for other systems;
  each routine's prompt is explicit that only the row named
  `AIRTABLE_MCP_TOKEN_UNSUPERVISED` may ever be used or referenced, though
  that's prompt-level discipline, not something the read itself restricts.
  See `mcp-servers/airtable-mcp/README.md` and each routine's `prompt.md`
  for the exact steps.

Add an entry here whenever a new base gets its own deployment, so a caller
can find the right one without reading every routine's prompt.md.
