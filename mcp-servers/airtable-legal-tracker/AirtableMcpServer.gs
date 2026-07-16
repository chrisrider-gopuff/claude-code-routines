// Airtable MCP Server — Apps Script Web App
//
// The single point of contact for the Legal Tracker Airtable base
// (appFIB9fJCzTeFDcG) for every routine, skill, and Cowork plugin install
// that needs it. Callers never hold AIRTABLE_API_KEY themselves — this
// script is the only thing that does, and every read/write goes through it.
//
// Auth: Apps Script Web Apps cannot read custom request headers (there is
// no e.headers in doGet/doPost), so a standard `Authorization: Bearer`
// header never reaches this script. The front-door token is instead passed
// as a `token` query-string parameter on the deployment URL itself, e.g.
//   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?token=XXXX
//
// Two permission tiers, each with its own token — see TIERS below:
//   - "unattended": Update Matches only. For anything that runs on a
//     schedule with no human present, above all legal-tracker-triage, which
//     sweeps unread Gmail/Slack content every morning. That content is
//     untrusted input (prompt injection risk) — this tier exists so that
//     even if a malicious message talked the routine into attempting a
//     Case Activity or Cases write, the server rejects it outright rather
//     than relying on the routine's prompt to simply not ask. This is what
//     preserves the existing legal-tracker-triage design: matches only ever
//     land in Update Matches, and only the Airtable Automation triggered by
//     Chris setting Approved=Approved copies a row into Case Activity.
//   - "supervised": Update Matches, Case Activity, and Cases. For skills or
//     interactive routines where a person is directing each write in real
//     time (e.g. matter-intake, check-request, or a Cowork plugin session).
//
// Setup:
//   1. In this Apps Script project's Project Settings -> Script Properties, set:
//        AIRTABLE_MCP_TOKEN_SUPERVISED  — token for supervised callers
//        AIRTABLE_MCP_TOKEN_UNATTENDED  — token for legal-tracker-triage
//        AIRTABLE_API_KEY               — Airtable personal access token (never shared)
//      Generate each token independently (e.g. `openssl rand -hex 32`) —
//      they must not be the same value.
//   2. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone.
//   3. Give each caller "<deployment URL>?token=<its tier's token>" as its
//      remote MCP server URL / Airtable access URL.
//   4. Test with a raw POST before wiring up any caller — see README.md in
//      this directory for curl examples, including confirming the
//      unattended token is actually refused for a Case Activity write.

const AIRTABLE_BASE_ID = "appFIB9fJCzTeFDcG"; // Legal Tracker

const READ_TABLES = ["Update Matches", "Case Activity", "Thread Matches", "Cases"];

const TIERS = {
  unattended: { writeTables: ["Update Matches"] },
  supervised: { writeTables: ["Update Matches", "Case Activity", "Cases"] }
};

const TOOL_DEFINITIONS = [
  {
    name: "airtable_query",
    description: "Query records from a table in the Legal Tracker Airtable base.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name, e.g. 'Update Matches'" },
        filterByFormula: { type: "string", description: "Airtable filterByFormula expression (optional)" },
        maxRecords: { type: "number", description: "Max records to return (optional, default 20)" }
      },
      required: ["table"]
    }
  },
  {
    name: "airtable_create_record",
    description: "Create a record in the Legal Tracker Airtable base. Which tables are writable depends on the caller's token tier — see TIERS in AirtableMcpServer.gs.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        fields: { type: "object", description: "Field name/value pairs for the new record" }
      },
      required: ["table", "fields"]
    }
  }
];

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const id = request.id !== undefined ? request.id : null;

  const tier = resolveTier(e.parameter.token);
  if (!tier) {
    return jsonRpcError(id, -32001, "Unauthorized");
  }

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "airtable-legal-tracker", version: "1.0.0" },
          capabilities: { tools: {} }
        });
      case "tools/list":
        return jsonRpcResult(id, { tools: TOOL_DEFINITIONS });
      case "tools/call":
        return jsonRpcResult(id, callTool(tier, request.params.name, request.params.arguments || {}));
      default:
        return jsonRpcError(id, -32601, "Method not found: " + request.method);
    }
  } catch (err) {
    return jsonRpcError(id, -32000, err.message);
  }
}

function resolveTier(token) {
  if (!token) return null;
  const props = PropertiesService.getScriptProperties();
  if (token === props.getProperty("AIRTABLE_MCP_TOKEN_UNATTENDED")) return "unattended";
  if (token === props.getProperty("AIRTABLE_MCP_TOKEN_SUPERVISED")) return "supervised";
  return null;
}

function callTool(tier, name, args) {
  if (name === "airtable_query") return airtableQuery(args);
  if (name === "airtable_create_record") return airtableCreateRecord(tier, args);
  throw new Error("Unknown tool: " + name);
}

function airtableQuery({ table, filterByFormula, maxRecords }) {
  if (!READ_TABLES.includes(table)) {
    throw new Error(`Table "${table}" is not in READ_TABLES.`);
  }
  const params = [`maxRecords=${maxRecords || 20}`];
  if (filterByFormula) params.push("filterByFormula=" + encodeURIComponent(filterByFormula));
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params.join("&")}`;
  return { content: [{ type: "text", text: airtableFetch(url, "get") }] };
}

function airtableCreateRecord(tier, { table, fields }) {
  if (!TIERS[tier].writeTables.includes(table)) {
    throw new Error(`Table "${table}" is not writable by the "${tier}" tier.`);
  }
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
  return { content: [{ type: "text", text: airtableFetch(url, "post", { fields }) }] };
}

function airtableFetch(url, method, payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("AIRTABLE_API_KEY");
  if (!apiKey) throw new Error("AIRTABLE_API_KEY not set in Script Properties.");

  const options = {
    method,
    headers: { Authorization: "Bearer " + apiKey },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code >= 300) throw new Error(`Airtable ${method.toUpperCase()} ${url} failed: ${code} ${text}`);
  return text;
}

function jsonRpcResult(id, result) {
  return ContentService.createTextOutput(JSON.stringify({ jsonrpc: "2.0", id, result }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonRpcError(id, code, message) {
  return ContentService.createTextOutput(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }))
    .setMimeType(ContentService.MimeType.JSON);
}
