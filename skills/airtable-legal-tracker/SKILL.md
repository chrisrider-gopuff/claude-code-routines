---
name: airtable-legal-tracker
description: Query, create, update, or delete records in the Legal Tracker Airtable base (appFIB9fJCzTeFDcG). Use this any time a routine or skill needs Legal Tracker data — Update Matches, Case Activity, Thread Matches, or Cases — instead of calling Airtable's REST API directly or holding AIRTABLE_API_KEY.
---

# airtable-legal-tracker

The single point of contact for the Legal Tracker Airtable base. No caller
— native routine, skill, or Cowork plugin install — should ever hold
`AIRTABLE_API_KEY` directly; the `airtable-legal-tracker` Apps Script
server (`mcp-servers/airtable-legal-tracker/AirtableMcpServer.gs`) is the
only thing that does, and this skill is how everything else talks to it.

## How to call it

Two possible transports, depending on how this session is connected —
check which applies before doing anything else:

**If `airtable_query` / `airtable_create_record` / `airtable_update_record`
/ `airtable_delete_record` tools are already available** (a Cowork plugin
install, or any session with the `airtable-legal-tracker` MCP connector
configured): call them directly with the schemas in "Operations" below. No
curl needed — the connector handles the HTTP/auth mechanics.

**Otherwise** (native routines in this repo, which call things via
`curl`/Bash rather than MCP connectors today): send a JSON-RPC 2.0 POST to
the deployment URL yourself, using `AIRTABLE_MCP_URL` and
`AIRTABLE_MCP_TOKEN` from the environment:

```bash
curl -s -X POST "$AIRTABLE_MCP_URL?token=$AIRTABLE_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"airtable_query","arguments":{"table":"Update Matches","maxRecords":20}}}'
```

`method` is always `tools/call`; `params.name` is the operation (from
"Operations" below); `params.arguments` is that operation's input. The
response is a JSON-RPC envelope — a real result is under `.result`, a
rejected/failed call comes back as `.error.message` (see "Handling
rejections" below).

## Operations

Mirrors the tool definitions in `AirtableMcpServer.gs` — if this drifts
from that file, the file wins; update this doc to match.

| Tool | Arguments | Notes |
|---|---|---|
| `airtable_query` | `table` (required), `filterByFormula` (optional), `maxRecords` (optional, default 20), `offset` (optional) | Any table: `Update Matches`, `Case Activity`, `Thread Matches`, `Cases`, `Opposing Counsel`. Both tiers can always read. Airtable pages at 100 records regardless of `maxRecords` — if the response has an `offset` field, call again passing it to get the next page; a table with more than ~100 rows (e.g. Cases) needs this loop, don't assume one call got everything. |
| `airtable_get_schema` | none | Returns the live table/field schema. Call this before trusting a hardcoded table/field name if you suspect it may have changed — Chris renames and re-configures fields periodically — rather than discovering the drift from a failed write. |
| `airtable_create_record` | `table`, `fields` (object) | Writable tables depend on caller tier — see "Tiers" below. |
| `airtable_update_record` | `table`, `recordId`, `fields` (object, partial update) | Same tier scoping as create. |
| `airtable_delete_record` | `table`, `recordId` | `Update Matches` only, for any caller — Case Activity and Cases can never be deleted through this server. |

## Tiers

Which token is in `AIRTABLE_MCP_TOKEN` (or which connector you're using)
determines what you can write:

- **`unattended`** — `Update Matches` and `Thread Matches` only. This is
  what `legal-tracker-triage` runs as, since it processes unread Gmail/Slack
  content on a schedule with no human present (untrusted-input / prompt
  injection exposure). It cannot write to `Case Activity` or `Cases` no
  matter what a message tries to talk it into — that's enforced by the
  server, not by this skill or the routine's own prompt.
- **`supervised`** — also `Case Activity` and `Cases`. For skills or
  interactive sessions where a person is directing each write in real time
  (`matter-intake`, `check-request`, a Cowork plugin session).

**If you're writing a routine or skill's instructions:** don't assume which
tier you'll get — that's decided by which token the environment was
configured with, not by anything you write here. Just make the calls you
need; the server will reject anything out of scope.

## Handling rejections

A tier or delete-scope rejection (e.g. `Table "Case Activity" is not
writable by the "unattended" tier.`) is a deliberate guardrail, not a bug
or a misconfiguration to work around. If you're running unattended and hit
one, don't retry against a different table, don't retry with different
casing/wording, and don't try to route around it via a different
operation — stop, and if you were expecting to log something there, log it
somewhere within your actual scope instead (e.g. `Update Matches`) or
surface it for manual handling. If you're a supervised/interactive caller
and hit a rejection, it usually means the table name is wrong or genuinely
isn't in scope for this server at all — check the table list above before
assuming it's a permissions issue.

## Required environment (native-routine / curl path only)

- `AIRTABLE_MCP_URL` — the Apps Script Web App deployment URL (no query
  string).
- `AIRTABLE_MCP_TOKEN` — whichever tier's token matches this caller's trust
  level, set at the environment level. Never the raw `AIRTABLE_API_KEY`.

See `mcp-servers/airtable-legal-tracker/README.md` for how these are
provisioned server-side.
