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
//   2. Run initializeDailyBriefLastSeenTimestamp() once, so the first real
//      poll doesn't re-fire on whatever reaction is already sitting in the
//      sheet.
//   3. Install checkForNewDailyBriefTriggers as a time-driven trigger
//      (Triggers -> Add Trigger -> time-driven, every 1-5 minutes).
//
// If this file lives in the same Apps Script project as nat-1-1-briefing's
// poller, the script property and cache keys below are namespaced with a
// DB_ prefix so the two pollers' state never collides.

const SHEET_ID = "1r1YfvZ9e5JJms3E8aKKq2pKlSSj-dRFKBo-ClnzR3PQ";
const ROUTINE_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_01JZAdCp4zmthcHQB9Eh2aKy/fire";
const TARGET_CHANNEL = "C0B8P0BC0UX"; // #morning-briefing

// Installed as a time-driven trigger (see setup above) — polls for the
// #morning-briefing row's Timestamp changing.
function checkForNewDailyBriefTriggers() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("DB_ROUTINE_TOKEN");
  if (!token) throw new Error("DB_ROUTINE_TOKEN not set in Script Properties.");

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Sheet1");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // header only, nothing to check

  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // Channel, Timestamp, Emoji
  const lastSeenTimestamp = props.getProperty("DB_LAST_SEEN_TIMESTAMP");

  for (const [channel, timestamp, emojiRaw] of data) {
    if (channel !== TARGET_CHANNEL || !timestamp) continue; // not our row — no cross-routine dispatch

    const timestampStr = String(timestamp);
    if (timestampStr === lastSeenTimestamp) continue; // unchanged since last check — skip

    const emoji = String(emojiRaw).trim();
    if (emoji === ":white_check_mark:") {
      const text = `PHASE2 channel_id=${channel} ts=${timestampStr}`;
      const response = UrlFetchApp.fetch(ROUTINE_URL, {
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

function initializeDailyBriefLastSeenTimestamp() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Sheet1");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const row = data.find(([channel]) => channel === TARGET_CHANNEL);
  if (row) PropertiesService.getScriptProperties().setProperty("DB_LAST_SEEN_TIMESTAMP", String(row[1]));
}
