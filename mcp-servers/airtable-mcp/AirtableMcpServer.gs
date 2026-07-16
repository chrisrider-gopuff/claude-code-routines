// Airtable MCP Server — Apps Script Web App
//
// A reusable proxy for any one Airtable base: callers never hold that
// base's API key themselves — this script is the only thing that does, and
// every read/write goes through it. Not tied to any specific base in code
// — deploy this same script again, independently, for a different base;
// each deployment gets its own Script Properties (below) and is otherwise
// unrelated to any other deployment.
//
// Auth: Apps Script Web Apps cannot read custom request headers (there is
// no e.headers in doGet/doPost), so a standard `Authorization: Bearer`
// header never reaches this script. The front-door token is instead passed
// as a `token` query-string parameter on the deployment URL itself, e.g.
//   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?token=XXXX
//
// Two fixed permission tiers, each with its own token. Which tables each
// tier can write, which tables can ever be deleted, and which tables can be
// read at all are NOT hardcoded here — they come from this deployment's
// AIRTABLE_MCP_CONFIG Script Property (see Setup below), so redeploying for
// a new base means writing a new config value, not editing this file.
//   - "unsupervised": intended for anything that runs on a schedule with no
//     human present — scope it to only what that caller needs to write,
//     nothing more, since it may be processing untrusted content (email,
//     chat messages) that could attempt prompt injection. The server
//     rejecting an out-of-scope write outright, rather than relying on the
//     caller's own prompt to simply not ask, is the whole point of having
//     two tiers instead of one.
//   - "supervised": intended for skills or interactive sessions where a
//     person is directing each write in real time — can reasonably be
//     scoped wider than unsupervised.
//
// Deletes are governed separately from the tier/writeTables model above —
// see AIRTABLE_MCP_CONFIG.deleteTables. Any caller (either tier) can delete
// from a table in that list; nothing can delete from a table outside it,
// regardless of tier. Keep this scoped to draft/staging tables designed to
// have rows removed from them — never a system-of-record table.
//
// Setup (once per Airtable base you want to proxy):
//   1. In this Apps Script project's Project Settings -> Script Properties, set:
//        AIRTABLE_API_KEY                — this base's Airtable personal access token (never shared)
//        AIRTABLE_BASE_ID                — this base's ID, e.g. "appXXXXXXXXXXXXXX"
//        AIRTABLE_MCP_TOKEN_UNSUPERVISED  — front-door token for unsupervised callers
//        AIRTABLE_MCP_TOKEN_SUPERVISED   — front-door token for supervised callers
//        AIRTABLE_MCP_CONFIG              — JSON string, shape:
//          {
//            "name": "optional server label, defaults to airtable-mcp",
//            "readTables": ["Table A", "Table B", ...],
//            "tiers": {
//              "unsupervised": { "writeTables": ["Table A"] },
//              "supervised": { "writeTables": ["Table A", "Table B"] }
//            },
//            "deleteTables": ["Table A"]
//          }
//      Generate the two tokens independently (e.g. `openssl rand -hex 32`) —
//      they must not be the same value.
//   2. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone.
//   3. Give each caller "<deployment URL>?token=<its tier's token>" as its
//      remote MCP server URL / Airtable access URL.
//   4. Test with a raw POST before wiring up any caller — see README.md in
//      this directory for curl examples, and for the actual AIRTABLE_MCP_CONFIG
//      value used by the Legal Tracker deployment as a worked example.

function getConfig() {
  const props = PropertiesService.getScriptProperties();

  const baseId = props.getProperty("AIRTABLE_BASE_ID");
  if (!baseId) throw new Error("AIRTABLE_BASE_ID not set in Script Properties.");

  const configJson = props.getProperty("AIRTABLE_MCP_CONFIG");
  if (!configJson) throw new Error("AIRTABLE_MCP_CONFIG not set in Script Properties.");

  let parsed;
  try {
    parsed = JSON.parse(configJson);
  } catch (err) {
    throw new Error("AIRTABLE_MCP_CONFIG is not valid JSON: " + err.message);
  }

  if (!Array.isArray(parsed.readTables)) {
    throw new Error("AIRTABLE_MCP_CONFIG.readTables must be an array.");
  }
  const unsupervisedWrite = parsed.tiers && parsed.tiers.unsupervised && parsed.tiers.unsupervised.writeTables;
  const supervisedWrite = parsed.tiers && parsed.tiers.supervised && parsed.tiers.supervised.writeTables;
  if (!Array.isArray(unsupervisedWrite) || !Array.isArray(supervisedWrite)) {
    throw new Error("AIRTABLE_MCP_CONFIG.tiers must define unsupervised.writeTables and supervised.writeTables arrays.");
  }
  if (!Array.isArray(parsed.deleteTables)) {
    throw new Error("AIRTABLE_MCP_CONFIG.deleteTables must be an array.");
  }

  return {
    name: parsed.name || "airtable-mcp",
    baseId: baseId,
    readTables: parsed.readTables,
    tiers: parsed.tiers,
    deleteTables: parsed.deleteTables
  };
}

const TOOL_DEFINITIONS = [
  {
    name: "airtable_query",
    description: "Query records from a table in this deployment's Airtable base. Airtable pages at 100 records — if the response includes an offset field, call again with that offset to get the next page.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        filterByFormula: { type: "string", description: "Airtable filterByFormula expression (optional)" },
        maxRecords: { type: "number", description: "Max records to return in total across all pages (optional, default 20)" },
        offset: { type: "string", description: "Pagination offset from a previous response's offset field (optional)" }
      },
      required: ["table"]
    }
  },
  {
    name: "airtable_get_schema",
    description: "Fetch the live table/field schema for this deployment's base, so a caller can detect drift (renamed table/field) before assuming a hardcoded name is still correct. Read-only, no table restriction.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "airtable_create_record",
    description: "Create a record in this deployment's Airtable base. Which tables are writable depends on the caller's token tier — see this deployment's AIRTABLE_MCP_CONFIG.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        fields: { type: "object", description: "Field name/value pairs for the new record" }
      },
      required: ["table", "fields"]
    }
  },
  {
    name: "airtable_update_record",
    description: "Update fields on an existing record in this deployment's Airtable base (partial update — only the given fields change). Which tables are writable depends on the caller's token tier, same as airtable_create_record.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        recordId: { type: "string", description: "Airtable record ID, e.g. 'recXXXXXXXXXXXXXX'" },
        fields: { type: "object", description: "Field name/value pairs to update" }
      },
      required: ["table", "recordId", "fields"]
    }
  },
  {
    name: "airtable_delete_record",
    description: "Delete a record from this deployment's Airtable base. Restricted to this deployment's AIRTABLE_MCP_CONFIG.deleteTables regardless of caller tier.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        recordId: { type: "string", description: "Airtable record ID, e.g. 'recXXXXXXXXXXXXXX'" }
      },
      required: ["table", "recordId"]
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

  let config;
  try {
    config = getConfig();
  } catch (err) {
    return jsonRpcError(id, -32000, err.message);
  }

  const tier = resolveTier(e.parameter.token);
  if (!tier) {
    return jsonRpcError(id, -32001, "Unauthorized");
  }

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2025-03-26",
          serverInfo: { name: config.name, version: "1.0.0" },
          capabilities: { tools: {} }
        });
      case "tools/list":
        return jsonRpcResult(id, { tools: TOOL_DEFINITIONS });
      case "tools/call":
        return jsonRpcResult(id, callTool(config, tier, request.params.name, request.params.arguments || {}));
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
  if (token === props.getProperty("AIRTABLE_MCP_TOKEN_UNSUPERVISED")) return "unsupervised";
  if (token === props.getProperty("AIRTABLE_MCP_TOKEN_SUPERVISED")) return "supervised";
  return null;
}

function callTool(config, tier, name, args) {
  if (name === "airtable_query") return airtableQuery(config, args);
  if (name === "airtable_get_schema") return airtableGetSchema(config);
  if (name === "airtable_create_record") return airtableCreateRecord(config, tier, args);
  if (name === "airtable_update_record") return airtableUpdateRecord(config, tier, args);
  if (name === "airtable_delete_record") return airtableDeleteRecord(config, args);
  throw new Error("Unknown tool: " + name);
}

function airtableQuery(config, { table, filterByFormula, maxRecords, offset }) {
  if (!config.readTables.includes(table)) {
    throw new Error(`Table "${table}" is not in this deployment's readTables.`);
  }
  const params = [`maxRecords=${maxRecords || 20}`];
  if (filterByFormula) params.push("filterByFormula=" + encodeURIComponent(filterByFormula));
  if (offset) params.push("offset=" + encodeURIComponent(offset));
  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(table)}?${params.join("&")}`;
  return { content: [{ type: "text", text: airtableFetch(url, "get") }] };
}

function airtableGetSchema(config) {
  const url = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
  return { content: [{ type: "text", text: airtableFetch(url, "get") }] };
}

function airtableCreateRecord(config, tier, { table, fields }) {
  if (!config.tiers[tier].writeTables.includes(table)) {
    throw new Error(`Table "${table}" is not writable by the "${tier}" tier.`);
  }
  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(table)}`;
  return { content: [{ type: "text", text: airtableFetch(url, "post", { fields }) }] };
}

function airtableUpdateRecord(config, tier, { table, recordId, fields }) {
  if (!config.tiers[tier].writeTables.includes(table)) {
    throw new Error(`Table "${table}" is not writable by the "${tier}" tier.`);
  }
  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  return { content: [{ type: "text", text: airtableFetch(url, "patch", { fields }) }] };
}

function airtableDeleteRecord(config, { table, recordId }) {
  if (!config.deleteTables.includes(table)) {
    throw new Error(`Table "${table}" is not in this deployment's deleteTables.`);
  }
  const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  return { content: [{ type: "text", text: airtableFetch(url, "delete") }] };
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
