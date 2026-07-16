# airtable-legal-tracker MCP server

An Apps Script Web App that is the single point of contact for the Legal
Tracker Airtable base (`appFIB9fJCzTeFDcG`) for every routine, skill, and
Cowork plugin install that needs it. No caller — native routine, skill, or
plugin installer — holds `AIRTABLE_API_KEY` directly; this script is the
only thing that does. See `AirtableMcpServer.gs` for the implementation and
the `Setup` comment at the top of that file.

This is not a scheduled routine — it's a standing service other things call
over HTTPS.

## Two permission tiers

Callers authenticate with one of two tokens, each scoped to a tier:

- **`unattended`** — write access to `Update Matches` and `Thread Matches`
  only. Use this for anything that runs on a schedule with no human present,
  above all `legal-tracker-triage`, which sweeps unread Gmail/Slack content
  every morning. That content is untrusted input: this tier means that even
  if a malicious message somehow talked the routine into attempting a write
  to Case Activity or Cases, the server rejects it outright, rather than
  depending on the routine's prompt to simply not ask. This is what keeps
  `legal-tracker-triage`'s existing design intact — matches only ever land
  in `Update Matches`, and only the Airtable Automation triggered by Chris
  setting `Approved=Approved` copies a row into Case Activity. Thread
  Matches is included because `legal-tracker-triage` owns and maintains
  that match-caching table itself.
- **`supervised`** — write access to `Update Matches`, `Case Activity`, and
  `Cases`. Use this for skills or interactive routines where a person is
  directing each write in real time (e.g. `matter-intake`, `check-request`,
  or a Cowork plugin session).

The same per-tier table list governs both `airtable_create_record` and
`airtable_update_record` — if a tier can create in a table, it can also
update existing records there, and vice versa.

Both tiers can read all tables (`Update Matches`, `Case Activity`,
`Thread Matches`, `Cases`) — the tier only restricts writes.

Deletes are separate from the tier model above: either tier can delete from
`Update Matches` (it's a draft/staging table — that's literally
`legal-tracker-triage-review`'s job), but nothing can delete from
`Case Activity` or `Cases` through this proxy, regardless of tier.

## Deploying

1. Create a new (standalone) Apps Script project at script.google.com and
   paste in `AirtableMcpServer.gs`.
2. Project Settings -> Script Properties, set:
   - `AIRTABLE_MCP_TOKEN_UNATTENDED` — token for unattended callers (e.g.
     `legal-tracker-triage`)
   - `AIRTABLE_MCP_TOKEN_SUPERVISED` — token for supervised callers
   - `AIRTABLE_API_KEY` — your Airtable personal access token. Never leaves
     this project.

   Generate the two tokens independently (e.g. `openssl rand -hex 32` run
   twice) — they must not share a value, or the tier split is meaningless.
3. Deploy -> New deployment -> type: Web app. Execute as: Me. Who has
   access: Anyone. Copy the resulting `.../exec` URL.
4. Give each caller `<deployment URL>?token=<its tier's token>` as its
   Airtable access URL / remote MCP server URL.

## Testing before wiring up any caller

Replace `DEPLOYMENT_URL`, `SUPERVISED_TOKEN`, and `UNATTENDED_TOKEN` and
confirm each of these round-trips correctly:

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

# tools/call — SAME write attempt with the unattended token: must be rejected
curl -s -X POST "DEPLOYMENT_URL?token=UNATTENDED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"airtable_create_record","arguments":{"table":"Case Activity","fields":{}}}}'

# tools/call — update an existing Update Matches row, either tier: should succeed
curl -s -X POST "DEPLOYMENT_URL?token=UNATTENDED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"airtable_update_record","arguments":{"table":"Update Matches","recordId":"recXXXXXXXXXXXXXX","fields":{}}}}'

# tools/call — update Case Activity with the unattended token: must be rejected
curl -s -X POST "DEPLOYMENT_URL?token=UNATTENDED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"airtable_update_record","arguments":{"table":"Case Activity","recordId":"recXXXXXXXXXXXXXX","fields":{}}}}'

# tools/call — delete from Update Matches with either token: should succeed
curl -s -X POST "DEPLOYMENT_URL?token=UNATTENDED_TOKEN" \
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

Confirm the Case-Activity-with-unattended-token create call actually comes
back as a `-32000` error (`Table "Case Activity" is not writable by the
"unattended" tier.`) before pointing `legal-tracker-triage` at this server —
that rejection is the whole point of the tier split, not an incidental
detail. Same for the Case-Activity delete attempt: it must fail with
`Table "Case Activity" is not in DELETE_TABLES.` even though the supervised
token can otherwise write to that table.

## Known limitation

Apps Script Web Apps cannot read custom HTTP request headers (`doPost(e)`
has no `e.headers`), so each token travels as a `token` query-string
parameter rather than a standard `Authorization` header. If Cowork's remote
MCP connector UI insists on a separate bearer-token field rather than
letting you paste an arbitrary URL, this approach needs revisiting — confirm
which one it actually offers before assuming this works end-to-end.
