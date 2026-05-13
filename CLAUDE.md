# claude-code-routines

This repository contains scheduled Claude Code routines that run automatically.

## Routines

### daily-brief

**Schedule:** Weekdays at 1:00 AM Eastern (America/New_York)  
**Prompt:** `routines/daily-brief/prompt.md`  
**Config:** `routines/daily-brief/schedule.yaml`

Sweeps the past 7 days of Gmail and Slack, identifies open follow-up items, and creates a 15-minute Google Calendar event called "Daily Brief" on the next weekday at 9:00–9:15 AM Eastern. The event description groups items into Urgent, Active, and Monitoring sections.

**Required MCP integrations:**
- Gmail (read threads, search)
- Slack (search public and private channels, DMs, group DMs)
- Google Calendar (create events)

**Filtering rules enforced:**
- Excludes direct Yardstik support emails (`support@yardstik.com`)
- Excludes Workers Comp emails where the user is only CC'd with no personal reply
- Excludes Litigation Hold emails from Michelle Carlson where user is BCC'd
- Excludes emails titled "Real Estate Request"

## Adding new routines

1. Create a directory under `routines/<routine-name>/`
2. Add `prompt.md` with the routine instructions
3. Add `schedule.yaml` with the cron expression and timezone
