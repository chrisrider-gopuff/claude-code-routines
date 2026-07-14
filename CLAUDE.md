# claude-code-routines

This repository contains scheduled Claude Code routines that run automatically.

## Routines

### daily-brief

**Schedule:** Weekdays at 8:00 AM Eastern (America/New_York)  
**Prompt:** `routines/daily-brief/prompt.md`  
**Config:** `routines/daily-brief/schedule.yaml`

Sweeps the past 7 days of Gmail and Slack, identifies open follow-up items, and posts to the #morning-briefing Slack channel at 8:00 AM Eastern. The message leads with a **Today's Meetings** section, followed by items grouped into Urgent, Active, and Monitoring sections.

**Today's Meetings:**
Reads today's Google Calendar and includes a meeting if it's external (non-gopuff.com attendee), one-off/non-recurring, or an internal meeting that isn't a routine standup/sync/1:1. Recurring, all-internal meetings with a title like standup, sync, 1:1, check-in, or weekly are skipped, as are solo blocks with no other attendees. For each qualifying meeting, gathers context from Gmail and Slack (last 30 days, by attendee/topic) and presents it as an unnumbered entry before the numbered case items.

**Sources swept (for the numbered sections):**
1. Gmail threads where someone is waiting on me or I owe a response
2. Slack DMs, group DMs, and channel @mentions where a response is pending
3. Self-authored Gmail notes-to-self (`from:me to:me`, or subjects matching `1:1`, `sync`, `notes`, `weekly`, `debrief`) — action items are extracted individually and only surfaced if not yet completed

Items that appear in multiple sources are consolidated into a single entry with sub-bullets for each distinct next action.

**Required MCP integrations:**
- Google Calendar (list today's events)
- Gmail (read threads, search)
- Slack (search public and private channels, DMs, group DMs; send DMs)

**Filtering rules enforced:**
- Excludes direct Yardstik support emails (`support@yardstik.com`)
- Excludes Workers Comp emails where the user is only CC'd with no personal reply
- Excludes Litigation Hold emails from Michelle Carlson where user is BCC'd
- Excludes emails titled "Real Estate Request"

### legal-tracker-triage

**Schedule:** Weekdays at 6:00 AM Eastern (America/New_York)  
**Prompt:** `routines/legal-tracker-triage/prompt.md`  
**Config:** `routines/legal-tracker-triage/schedule.yaml`

Sweeps Gmail and Slack for new case-related developments (48-hour window, extended to cover the weekend on Mondays), matches each to a case in the "Legal Tracker" Airtable base, and writes draft rows into the **Update Matches** table for manual review. Never writes to **Case Activity** — promotion from Update Matches is a manual step Chris performs himself.

**Airtable access:** Calls the Airtable REST API directly via `curl`, authenticated with `$AIRTABLE_API_KEY` (set at the environment level — never read from a file, sheet, or document, and never echoed/logged). Base: Legal Tracker (`appFIB9fJCzTeFDcG`). Confirms table/field names against the base's live schema before every write.

**Matching sources:**
1. Gmail — sender/recipient vs. Opposing Counsel contact email, Matter/claimant name, case number, or the Gmail label `!update` (always logged, even unmatched, flagged for manual case assignment)
2. Slack — public/private search by Matter name, claimant surname, or opposing counsel/firm name

A Thread Matches table caches thread→case matches so repeat runs skip re-matching. Already-logged threads are only re-written if a new message postdates the existing entry.

**Required MCP integrations:**
- Gmail (read threads, search)
- Slack (search public and private channels; send messages)

**Required environment:** `AIRTABLE_API_KEY` set on the environment this routine runs from.

### nat-1-1-briefing

**Schedule:** Phase 1 runs weekdays at 3:00 AM Eastern (America/New_York); Phases 2–3 fire externally (not on a schedule)  
**Prompt:** `routines/nat-1-1-briefing/prompt.md`  
**Config:** `routines/nat-1-1-briefing/schedule.yaml`

Prepares Chris Rider's briefing ahead of his recurring 1:1 with Nat Flandreau, in three phases:
1. **Draft** (schedule-triggered) — if today's calendar has the Chris/Nat 1:1, sweeps the Legal Tracker Airtable base plus #morning-briefing and #weekly-briefing Slack channels for new/changed matters, dedupes by fact pattern (not name/keyword), classifies each item as New/Old business and New case/Update/Discussion, and posts a numbered draft to a review channel.
2. **Finalize** (fired externally via a :100: Slack reaction → Workflow Builder → Google Sheet → Apps Script → API call) — applies Chris's thread-reply edits (drop/revise/`NS:` note) and posts a final version for approval.
3. **Publish** (fired externally via a :white_check_mark: reaction, same trigger chain) — posts the approved final version into #chris-nat-1to1 as the permanent record, which also serves as the Old Business source for future runs.

State between phases is tracked in `routines/nat-1-1-briefing/state.json`, since each phase may run in a fresh session.

**Required MCP integrations:**
- Google Calendar (check for today's Chris/Nat 1:1)
- Slack (read/search channels, send messages)
- Airtable Legal Tracker (`appFIB9fJCzTeFDcG`) — read-only for this routine
- Google Drive (one-time seed doc read on first-ever run)

**Note:** Several setup items are still open before this runs in production — see "Open items to resolve before going live" in `prompt.md` (review channel is currently a test channel, the API trigger/bearer token and the Slack Workflow Builder → Sheet → Apps Script chain need to be confirmed as live).

## Adding new routines

1. Create a directory under `routines/<routine-name>/`
2. Add `prompt.md` with the routine instructions
3. Add `schedule.yaml` with the cron expression and timezone
