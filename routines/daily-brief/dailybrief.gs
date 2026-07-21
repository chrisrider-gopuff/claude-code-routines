// Daily Brief — Phase 2 trigger poller
//
// This sheet (`1r1YfvZ9e5JJms3E8aKKq2pKlSSj-dRFKBo-ClnzR3PQ`) is shared with the
// nat-1-1-briefing routine, but each routine has its own dedicated poller —
// this one only watches the #morning-briefing row and only calls the
// daily-brief routine's own /fire endpoint. It does no cross-routine dispatch
// and does not read the `Routine` column (that column is Chris's manual
// reference only). See routines/daily-brief/prompt.md, "Entry point" section.
//
// The row for #morning-briefing is a FIXED row — the Slack Workflow Builder
// workflow overwrites its `Timestamp` cell in place on every reaction, it does
// not append a new row. LAST_SEEN_TIMESTAMP below just detects when that one
// cell has changed since the last poll.
//
// Setup:
//   1. Set DB_ROUTINE_TOKEN in Script Properties to the bearer token
//      generated once at claude.ai/code/routines (shown only at creation).
//   2. Run formatDailyBriefTimestampColumnAsText() once, BEFORE the Workflow
//      writes any more values — Slack ts values (6 decimal digits, e.g.
//      "1784644160.302519") sit right at the edge of IEEE-754 double
//      precision, and if the Timestamp column isn't explicitly plain-text,
//      the Workflow Builder write gets reinterpreted as a number and the
//      last 1-2 digits get silently rounded away (confirmed in production
//      2026-07-21: sheet held "1784644160.3025100000" for a real ts of
//      "1784644160.302519" — an exact-match lookup on that value 404s).
//      Formatting as plain text first makes future writes store the literal
//      string instead. This does NOT repair values already corrupted before
//      the format change — routines/daily-brief/prompt.md's Phase 2 Step 2
//      has a fallback that re-resolves an imprecise ts against real channel
//      history, so a still-bad value doesn't cause a silent failure.
//   3. Run initializeDailyBriefLastSeenTimestamp() once, so the first real
//      poll doesn't re-fire on whatever reaction is already sitting in the
//      sheet.
//   4. Install checkForNewDailyBriefTriggers as a time-driven trigger
//      (Triggers -> Add Trigger -> time-driven, every 1-5 minutes).
//
// This file lives in the same Apps Script project as nat-1-1-briefing's
// poller (both bound to the shared sheet), and Apps Script puts every .gs
// file's top-level declarations in one global scope — so both the script
// properties AND the top-level constants below are namespaced with a DB_
// prefix. Do not rename these to the un-prefixed SHEET_ID/ROUTINE_URL/
// TARGET_CHANNEL used by the other poller; that collides with a
// "Identifier '...' has already been declared" syntax error project-wide.

const DB_SHEET_ID = "1r1YfvZ9e5JJms3E8aKKq2pKlSSj-dRFKBo-ClnzR3PQ";
const DB_ROUTINE_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_01JZAdCp4zmthcHQB9Eh2aKy/fire";
const DB_TARGET_CHANNEL = "C0B8P0BC0UX"; // #morning-briefing

// Installed as a time-driven trigger (see setup above) — polls for the
// #morning-briefing row's Timestamp changing.
function checkForNewDailyBriefTriggers() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("DB_ROUTINE_TOKEN");
  if (!token) throw new Error("DB_ROUTINE_TOKEN not set in Script Properties.");

  const sheet = SpreadsheetApp.openById(DB_SHEET_ID).getSheetByName("Sheet1");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // header only, nothing to check

  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // Channel, Timestamp, Emoji
  const lastSeenTimestamp = props.getProperty("DB_LAST_SEEN_TIMESTAMP");

  for (const [channel, timestamp, emojiRaw] of data) {
    if (channel !== DB_TARGET_CHANNEL || !timestamp) continue; // not our row — no cross-routine dispatch

    const timestampStr = String(timestamp);
    if (timestampStr === lastSeenTimestamp) continue; // unchanged since last check — skip

    if (!/^\d{10}\.\d{6}$/.test(timestampStr)) {
      // Doesn't look like a real Slack ts (10 digits, dot, exactly 6 decimal
      // digits) — almost certainly the float-precision corruption described
      // in the setup notes above. Still fire (Phase 2 has a fallback to
      // re-resolve it against channel history), but log it so a recurrence
      // is visible without waiting for Chris to notice a delayed reply.
      Logger.log(`WARNING: malformed ts "${timestampStr}" — column B likely isn't plain-text formatted; run formatDailyBriefTimestampColumnAsText().`);
    }

    const emoji = String(emojiRaw).trim();
    if (emoji === ":white_check_mark:") {
      const text = `PHASE2 channel_id=${channel} ts=${timestampStr}`;
      const response = UrlFetchApp.fetch(DB_ROUTINE_URL, {
        method: "post",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + token,
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "anthropic-version": "2023-06-01"
        },
        payload: JSON.stringify({ text }),
        muteHttpExceptions: true
      });
      Logger.log(`PHASE2 @ ts=${timestampStr}: ${response.getResponseCode()} ${response.getContentText()}`);
    }
    // Any other emoji (including :100:, which belongs to nat-1-1-briefing's
    // row, not this one) is ignored — daily-brief only has one externally
    // triggered phase.

    props.setProperty("DB_LAST_SEEN_TIMESTAMP", timestampStr); // record even on an unrecognized emoji, so it isn't retried forever
  }
}

// One-time setup — see step 2 above. Forces column B (Timestamp) to plain
// text so a Slack ts written into it is never silently reinterpreted as a
// number and rounded. Safe to re-run any time; only touches formatting, not
// values.
function formatDailyBriefTimestampColumnAsText() {
  const sheet = SpreadsheetApp.openById(DB_SHEET_ID).getSheetByName("Sheet1");
  sheet.getRange("B:B").setNumberFormat("@");
}

function initializeDailyBriefLastSeenTimestamp() {
  const sheet = SpreadsheetApp.openById(DB_SHEET_ID).getSheetByName("Sheet1");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const row = data.find(([channel]) => channel === DB_TARGET_CHANNEL);
  if (row) PropertiesService.getScriptProperties().setProperty("DB_LAST_SEEN_TIMESTAMP", String(row[1]));
}
