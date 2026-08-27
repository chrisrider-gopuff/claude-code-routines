# legal-tracker-triage-gas

A standalone Google Apps Script + Gemini implementation of
`routines/legal-tracker-triage` (the Claude Code routine), built to run
under a shared account — `litigation@gopuff.com` — with no dependency on
Claude Code, so the weekly triage keeps running after whoever built it
moves on.

Gmail only (no Slack). See the header comment in `Code.gs` for the full
design rationale and what's different from the Claude Code version.

## Required setup, in order

1. **Create the Apps Script project under `litigation@gopuff.com` itself**
   (not your personal account) — script.google.com, signed in as that
   account, "New project". This makes `GmailApp`/`MailApp` inside the
   script operate as that mailbox, and means the project's ownership,
   triggers, and Script Properties all live with the account that's meant
   to outlive this handoff.

2. **Copy in the files.** Paste `Code.gs` into the default `Code.gs` file in
   the editor, and replace the contents of `appsscript.json` (View ->
   Show manifest file) with this directory's `appsscript.json`.

3. **Create the `!update` Gmail label** in `litigation@gopuff.com` itself —
   it does not carry over from any other mailbox. The script skips that
   sweep tier (and says so in its summary email) if the label doesn't
   exist, rather than failing the whole run.

4. **Add an Internal Owners record for this script to link as Author.**
   Every Update Matches/Case Activity row's Author field is a linked
   record into Airtable's `Internal Owners` table, not free text — there
   is currently no record there meant to represent this automated script
   (checked live against the base on 2026-08-27; the existing rows are all
   named individuals, e.g. "Chris Rider"). Add a new row there — e.g. name
   it `Litigation Tracker (Automated)` — before the first live run. Do not
   point this at a departing person's name; the script refuses to run
   without `AUTHOR_OWNER_NAME` explicitly set (see below) specifically so
   this doesn't happen by default.

5. **Get an Airtable Personal Access Token** scoped to the Legal Tracker
   base (`appFIB9fJCzTeFDcG`) only, with `data.records:read`,
   `data.records:write`, and `schema.bases:read` (the last one is needed
   for the startup schema-mismatch check in `verifySchema_` — without it
   every run fails at that check before touching Gmail or writing
   anything) — no delete scope. This script never deletes anything and
   shouldn't be able to.

6. **Get a Gemini API key** (default model: `gemini-2.5-flash`).

7. **Set Script Properties** (Project Settings -> Script Properties). Every
   setting the script uses lives here — nothing operational needs editing
   in `Code.gs` itself, so any of these can be found and changed without
   opening the code:

   | Property | Required | Notes |
   |---|---|---|
   | `AIRTABLE_API_KEY` | yes | from step 5 |
   | `GEMINI_API_KEY` | yes | from step 6 |
   | `AUTHOR_OWNER_NAME` | yes | exact `Name` of the Internal Owners record from step 4 |
   | `AIRTABLE_BASE_ID` | no | default `appFIB9fJCzTeFDcG` (Legal Tracker) |
   | `TABLE_CASES` | no | default `Cases` |
   | `TABLE_OPPOSING_COUNSEL` | no | default `Opposing Counsel` |
   | `TABLE_UPDATE_MATCHES` | no | default `Update Matches` |
   | `TABLE_CASE_ACTIVITY` | no | default `Case Activity` |
   | `TABLE_THREAD_MATCHES` | no | default `Thread Matches` |
   | `TABLE_INTERNAL_OWNERS` | no | default `Internal Owners` |
   | `GEMINI_MODEL` | no | default `gemini-2.5-flash` |
   | `SUMMARY_EMAIL` | no | default `legal@gopuff.com` |
   | `REVIEW_WINDOW_DAYS` | no | default `14` |
   | `MAX_RUNTIME_MINUTES` | no | default `25` |
   | `UPDATE_LABEL_NAME` | no | default `!update` |
   | `DRY_RUN` | no | default `false` — set `true` to log intended writes instead of calling Airtable's create endpoints, while still running the full match/classify pipeline and sending the summary email |
   | `TRIGGER_WEEKDAY` | no | default `SATURDAY` — read only by `installWeeklyTrigger` (step 10), any day name `MONDAY`..`SUNDAY` |
   | `TRIGGER_HOUR` | no | default `7` — read only by `installWeeklyTrigger`, 0-23 in `America/New_York` |

   If you rename a table in Airtable, renaming the matching
   `TABLE_*` property here is the only change needed — no code edit. The
   *field* names inside each table (e.g. "Match Confidence", "Entry") are
   not properties — they're checked against the live schema at the start
   of every run (`verifySchema_`) and the run fails with a clear message
   if one doesn't match, rather than silently writing to the wrong place.

8. **Authorize the script.** Run `main` once manually from the editor
   (with `DRY_RUN` set to `true` first) — Apps Script will prompt for the
   OAuth scopes listed in `appsscript.json` (Gmail read, sending mail as
   the script's own account, external requests to Airtable/Gemini,
   creating triggers). Approve as `litigation@gopuff.com`.

9. **Dry-run it.** With `DRY_RUN=true`, run `main` and read the summary
   email that lands in `legal@gopuff.com` — it lists what would have been
   written, with the same COMPLETE/INCOMPLETE status the live routine
   uses. Compare a few entries against what you'd expect. Flip
   `DRY_RUN` to `false` once satisfied.

10. **Install the weekly trigger.** Run `installWeeklyTrigger` once from
    the editor — it schedules `main` for `TRIGGER_WEEKDAY` at
    `TRIGGER_HOUR` in `America/New_York` (the script's declared `timeZone`
    in `appsscript.json`; defaults to Saturday 7am if those properties
    aren't set), and Apps Script's own trigger DST handling means this
    doesn't need the separate UTC-cron DST correction the Claude Code
    routine's live trigger does. Re-running `installWeeklyTrigger` is
    always safe — it clears any prior trigger on `main` first, so changing
    `TRIGGER_WEEKDAY`/`TRIGGER_HOUR` later just means re-running it.

## What isn't carried over from the Claude Code routine

- **Slack.** No Slack search, no Slack summary. All matching is Gmail-only;
  reporting is email to `SUMMARY_EMAIL`.
- **The airtable-mcp proxy's server-enforced write scoping.** This script
  holds `AIRTABLE_API_KEY` directly and calls Airtable's REST API itself.
  The allowlist check inside `createRecords_` in `Code.gs` is the only
  thing stopping a write to a table other than Update Matches/Thread
  Matches — there is no server-side backstop the way there is behind
  `mcp-servers/airtable-mcp`. Scoping the PAT itself (step 5) is a partial
  mitigation, not a replacement for that backstop.
