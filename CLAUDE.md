# claude-code-routines

This repository contains scheduled Claude Code routines that run automatically.

## Routines

### daily-brief

**Schedule:** Weekdays at 8:00 AM Eastern (America/New_York)  
**Prompt:** `routines/daily-brief/prompt.md`  
**Config:** `routines/daily-brief/schedule.yaml`

Sweeps the past 7 days of Gmail and Slack, identifies open follow-up items, and posts to the #morning-briefing Slack channel at 8:00 AM Eastern. The message groups items into Urgent, Active, and Monitoring sections.

**Sources swept:**
1. Gmail threads where someone is waiting on me or I owe a response
2. Slack DMs, group DMs, and channel @mentions where a response is pending
3. Self-authored Gmail notes-to-self (`from:me to:me`, or subjects matching `1:1`, `sync`, `notes`, `weekly`, `debrief`) — action items are extracted individually and only surfaced if not yet completed

Items that appear in multiple sources are consolidated into a single entry with sub-bullets for each distinct next action.

**Required MCP integrations:**
- Gmail (read threads, search)
- Slack (search public and private channels, DMs, group DMs; send DMs)

**Filtering rules enforced:**
- Excludes direct Yardstik support emails (`support@yardstik.com`)
- Excludes Workers Comp emails where the user is only CC'd with no personal reply
- Excludes Litigation Hold emails from Michelle Carlson where user is BCC'd
- Excludes emails titled "Real Estate Request"

### meeting-brief

**Schedule:** Weekdays at 8:00 AM Eastern (America/New_York)  
**Prompt:** `routines/meeting-brief/prompt.md`  
**Config:** `routines/meeting-brief/schedule.yaml`

Reads today's Google Calendar, identifies external and non-routine meetings, gathers context from Gmail and Slack for each, and sends a single Slack DM digest to Chris before the day starts.

**Qualifying meetings (include if ANY true):**
- Has at least one non-gopuff.com attendee (external meeting)
- Is a one-off / non-recurring meeting
- Is an internal meeting that isn't a routine standup, sync, or 1:1

**Skipped meetings (skip if ALL true):**
- Recurring event
- All attendees are @gopuff.com
- Title contains: standup, stand-up, sync, 1:1, check-in, or weekly

**Required MCP integrations:**
- Google Calendar (list today's events)
- Gmail (search recent threads by attendee/topic)
- Slack (search messages by attendee/topic; send DM)

## Adding new routines

1. Create a directory under `routines/<routine-name>/`
2. Add `prompt.md` with the routine instructions
3. Add `schedule.yaml` with the cron expression and timezone
