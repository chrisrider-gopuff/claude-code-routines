# airtable-legal-tracker MCP server

An Apps Script Web App that proxies the Legal Tracker Airtable base
(`appFIB9fJCzTeFDcG`) so a Cowork plugin built from this repo can query/write
Legal Tracker data without any installer holding `AIRTABLE_API_KEY`
themselves. See `AirtableMcpServer.gs` for the implementation and the
`Setup` comment at the top of that file.

This is not a scheduled routine — it's a standing service the plugin's
skills call over HTTPS. It has no relationship to the `AIRTABLE_API_KEY`
environment variable used by `legal-tracker-triage`/`legal-tracker-triage-review`
when they run as native Claude Code routines; those keep authenticating to
Airtable directly, since they run in an environment you control. This
server exists only for the Cowork-plugin distribution path, where installers
run in their own environments and can't be handed that key.

## Deploying

1. Create a new (standalone) Apps Script project at script.google.com and
   paste in `AirtableMcpServer.gs`.
2. Project Settings -> Script Properties, set:
   - `AIRTABLE_MCP_TOKEN` — a long random front-door token you generate
     (e.g. `openssl rand -hex 32`). This is what plugin installers use;
     it is not the Airtable key.
   - `AIRTABLE_API_KEY` — your Airtable personal access token. Never leaves
     this project.
3. Deploy -> New deployment -> type: Web app. Execute as: Me. Who has
   access: Anyone. Copy the resulting `.../exec` URL.
4. The plugin's `.mcp.json` server URL is that deployment URL with
   `?token=<AIRTABLE_MCP_TOKEN value>` appended.

## Testing before wiring up the plugin

Replace `DEPLOYMENT_URL` and `TOKEN` and confirm each of these round-trips
correctly:

```bash
# initialize
curl -s -X POST "DEPLOYMENT_URL?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# tools/list
curl -s -X POST "DEPLOYMENT_URL?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# tools/call — read
curl -s -X POST "DEPLOYMENT_URL?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"airtable_query","arguments":{"table":"Update Matches","maxRecords":5}}}'

# missing/wrong token should come back as a JSON-RPC error, not a 200 with data
curl -s -X POST "DEPLOYMENT_URL?token=wrong" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{}}'
```

Confirm the wrong-token case actually returns the `-32001 Unauthorized`
error before treating this as ready — Apps Script Web Apps have no
built-in caller authentication, so this in-script check is the only gate.

## Known limitation

Apps Script Web Apps cannot read custom HTTP request headers (`doPost(e)`
has no `e.headers`), so the front-door token travels as a `token`
query-string parameter rather than a standard `Authorization` header. If
Cowork's remote MCP connector UI insists on a separate bearer-token field
rather than letting you paste an arbitrary URL, this approach needs
revisiting — confirm which one it actually offers before assuming this
works end-to-end.
