// Airtable MCP Server — Apps Script Web App
//
// Exposes the Legal Tracker Airtable base (appFIB9fJCzTeFDcG) as a remote
// MCP server, so a Cowork plugin built from this repo can query/write Legal
// Tracker data without any installer ever holding AIRTABLE_API_KEY. This
// script is the only thing that holds that key; installers only ever talk
// to this Web App.
//
// Auth: Apps Script Web Apps cannot read custom request headers (there is
// no e.headers in doGet/doPost), so a standard `Authorization: Bearer`
// header never reaches this script. The front-door token is instead passed
// as a `token` query-string parameter on the deployment URL itself — bake
// it into the URL configured in the plugin's .mcp.json, e.g.
//   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?token=XXXX
// This token is intentionally separate from AIRTABLE_API_KEY: if it leaks,
// the exposure is limited to what the tools below allow, and it can be
// rotated here without touching the Airtable key at all.
//
// Setup:
//   1. In this Apps Script project's Project Settings -> Script Properties, set:
//        AIRTABLE_MCP_TOKEN  — front-door token, shared with plugin installers
//        AIRTABLE_API_KEY    — Airtable personal access token (never shared)
//   2. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone.
//   3. Put "<deployment URL>?token=<AIRTABLE_MCP_TOKEN value>" into the
//      plugin's .mcp.json as the remote MCP server URL.
//   4. Test with a raw POST before wiring up the plugin — see README.md in
//      this directory for a curl example.
//
// Extend ALLOWED_READ_TABLES / ALLOWED_WRITE_TABLES below to match the
// actual Legal Tracker schema as more tools are added. Writes are
// deliberately restricted to "Update Matches" — Case Activity is only ever
// written by the Airtable Automation that promotes an approved row (see
// legal-tracker-triage's prompt.md), never by this proxy or any routine.

const AIRTABLE_BASE_ID = "appFIB9fJCzTeFDcG"; // Legal Tracker

const ALLOWED_READ_TABLES = ["Update Matches", "Case Activity", "Thread Matches"];
const ALLOWED_WRITE_TABLES = ["Update Matches"];

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
    description: "Create a record in the Legal Tracker Airtable base. Restricted to tables in ALLOWED_WRITE_TABLES.",
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

  const expectedToken = PropertiesService.getScriptProperties().getProperty("AIRTABLE_MCP_TOKEN");
  const providedToken = e.parameter.token;
  if (!expectedToken || providedToken !== expectedToken) {
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
        return jsonRpcResult(id, callTool(request.params.name, request.params.arguments || {}));
      default:
        return jsonRpcError(id, -32601, "Method not found: " + request.method);
    }
  } catch (err) {
    return jsonRpcError(id, -32000, err.message);
  }
}

function callTool(name, args) {
  if (name === "airtable_query") return airtableQuery(args);
  if (name === "airtable_create_record") return airtableCreateRecord(args);
  throw new Error("Unknown tool: " + name);
}

function airtableQuery({ table, filterByFormula, maxRecords }) {
  if (!ALLOWED_READ_TABLES.includes(table)) {
    throw new Error(`Table "${table}" is not in ALLOWED_READ_TABLES.`);
  }
  const params = [`maxRecords=${maxRecords || 20}`];
  if (filterByFormula) params.push("filterByFormula=" + encodeURIComponent(filterByFormula));
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params.join("&")}`;
  return { content: [{ type: "text", text: airtableFetch(url, "get") }] };
}

function airtableCreateRecord({ table, fields }) {
  if (!ALLOWED_WRITE_TABLES.includes(table)) {
    throw new Error(`Table "${table}" is not in ALLOWED_WRITE_TABLES.`);
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
