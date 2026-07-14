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

## Adding new routines

1. Create a directory under `routines/<routine-name>/`
2. Add `prompt.md` with the routine instructions
3. Add `schedule.yaml` with the cron expression and timezone
