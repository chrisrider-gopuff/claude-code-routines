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

**Required environment:** `SHARED_SECRET` — same value as `weekly-accomplishments`, set on the environment this routine runs from, matching the Script Property configured in the Daily Tasks bridge Apps Script deployment. Used by Phase 2 (see `prompt.md`) to authenticate Task-creation calls.

**Filtering rules enforced:**
- Excludes direct Yardstik support emails (`support@yardstik.com`)
- Excludes Workers Comp emails where the user is only CC'd with no personal reply
- Excludes Litigation Hold emails from Michelle Carlson where user is BCC'd
- Excludes emails titled "Real Estate Request"

### legal-tracker-triage

**Schedule:** Weekdays at 6:00 AM Eastern (America/New_York)  
**Prompt:** `routines/legal-tracker-triage/prompt.md`  
**Config:** `routines/legal-tracker-triage/schedule.yaml`

Sweeps Gmail and Slack for new case-related developments (48-hour window, extended to cover the weekend on Mondays), matches each to a case in the "Legal Tracker" Airtable base, and writes draft rows into the **Update Matches** table for manual review. Never writes to **Case Activity** — promotion happens via an Airtable Automation, triggered when Chris sets `Approved` to `Approved` on an Update Matches row, that copies (not moves) the row into Case Activity.

**Airtable access:** Goes through the `airtable-mcp` skill/server (see "MCP servers" and "Skills" below), talking to the Legal Tracker deployment, using the `unattended` tier — never holds `AIRTABLE_API_KEY` directly. Confirms table/field names against the live schema (`airtable_get_schema`) before assuming a hardcoded name is still correct.

**Matching sources:**
1. Gmail — sender/recipient vs. Opposing Counsel contact email, Matter/claimant name, case number, or the Gmail label `!update` (always logged, even unmatched, flagged for manual case assignment)
2. Slack — public/private search by Matter name, claimant surname, or opposing counsel/firm name

A Thread Matches table caches thread→case matches so repeat runs skip re-matching. Already-logged threads are only re-written if a new message postdates the existing entry.

**Required MCP integrations:**
- Gmail (read threads, search)
- Slack (search public and private channels; send messages)

**Required environment:** `AIRTABLE_MCP_URL` and `AIRTABLE_MCP_TOKEN` (holding the Legal Tracker deployment's `unattended` tier token) set on the environment this routine runs from — see `mcp-servers/airtable-mcp/README.md`.

### legal-tracker-triage-review

**Schedule:** Weekly, Sunday at 8:00 PM Eastern (America/New_York) — placeholder, adjust to preference
**Prompt:** `routines/legal-tracker-triage-review/prompt.md`
**Config:** `routines/legal-tracker-triage-review/schedule.yaml`

Reads the Approved/Not Approved verdicts Chris has set on the `Approved` field (single select: blank / Approved / Not Approved) in **Update Matches** rows and learns from both directions — why something was rejected and why something was approved — clustering each into candidate patterns (rejections: auto-replies, pure scheduling, internal FYI forwards; approvals: signals that reliably indicate a valuable update). Cumulative pattern counts for both directions persist across runs in `routines/legal-tracker-triage-review/state.json` (not checked in — created at runtime), since rows are deleted after processing and can't be re-derived later.

A Not Approved row is only deleted once its `Activity Date` is 5+ days old — old enough to be safely outside any daily run's scan window (up to ~4 days on a Monday, which reaches back to the preceding Friday to cover the weekend). Deleting sooner would let the daily routine's dedup logic, which relies on the Thread ID still being in Update Matches, treat the thread as new again and re-log the very row Chris just rejected. Rows younger than 5 days are left marked Not Approved and picked up by a later run.

Approved rows are deleted on a different trigger: not age, but whether the row has actually been promoted (present in Case Activity, checked by Thread ID/Email Link, read-only) AND its approval reasoning has been clustered into `state.json` this run. The Airtable Automation that promotes a row copies it into Case Activity — it does not delete the Update Matches row, so records remain after promotion until this routine explicitly processes and removes them. An Approved row not yet promoted is left untouched indefinitely — deleting it would both destroy a case update pending promotion and reintroduce the recreation risk the age gate exists to prevent for the rejection side.

Only once a pattern's cumulative count reaches 5 — in either direction — and it hasn't also matched a row from the opposite verdict, which would mean the pattern is too broad, does it propose a specific edit to `legal-tracker-triage/prompt.md` as a pull request, with representative examples as evidence. A rejection pattern typically proposes an exclusion rule; an approval pattern typically proposes loosening or strengthening a matching/confidence rule. It never edits that file directly and never merges its own PR; Chris reviews and merges like any other change. Rows Chris hasn't reviewed yet (blank) are never touched.

**Airtable access:** Goes through the `airtable-mcp` skill/server, same as `legal-tracker-triage` — read-only plus deletes on Update Matches, never holds `AIRTABLE_API_KEY` directly. Uses the `unattended` tier token, not `supervised`, even though it doesn't need Case Activity/Cases write access — it also runs on a schedule with no human present and occasionally reads Gmail/Slack content for classification, so the more restrictive token is the consistent choice even though it's not strictly required for what this routine does.

**Required MCP integrations:**
- Slack (send message for summary)
- GitHub (branch, commit, open PR)
- Gmail/Slack read access, only if an Entry's summary text isn't enough to classify why it was rejected

**Required environment:** `AIRTABLE_MCP_URL` and `AIRTABLE_MCP_TOKEN` (the `unattended` tier's token, same value as `legal-tracker-triage`).

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
- Google Drive (one-time seed doc read on first-ever run)

**Airtable access:** Phase 1 reads the Legal Tracker (`appFIB9fJCzTeFDcG`) through the `airtable-mcp` skill/server, read-only — never holds `AIRTABLE_API_KEY` directly. Uses the `unattended` tier token: Phase 1 runs on a schedule with no human present and never needs to write to Airtable at all, so the more restrictive token costs nothing functionally. Phases 2–3 don't touch Airtable.

**Required environment:** `AIRTABLE_MCP_URL` and `AIRTABLE_MCP_TOKEN` (the `unattended` tier's token, same value as `legal-tracker-triage`).

**Note:** Several setup items are still open before this runs in production — see "Open items to resolve before going live" in `prompt.md` (review channel is currently a test channel, the API trigger/bearer token and the Slack Workflow Builder → Sheet → Apps Script chain need to be confirmed as live).

### weekly-accomplishments

**Schedule:** Fridays at 4:30 PM Eastern (America/New_York) — placeholder, adjust to preference
**Prompt:** `routines/weekly-accomplishments/prompt.md`
**Config:** `routines/weekly-accomplishments/schedule.yaml`

Sweeps the past 7 days of Gmail, Slack, and Google Drive for MAJOR accomplishments (litigation resolutions, completed launches, cross-functional wins, recognition from Nat/Kaleena/Jonathan, quantifiable business impact) and upserts rows into the **Major Accomplishments 2026** Google Sheet, then drafts (never sends) a summary email to Chris.

**Tracker access:** Never edits the sheet directly. Calls a bound Apps Script web app (`AccomplishmentsTrackerWebApp.gs`, kept alongside the tracker in Drive) over HTTPS via `curl`, authenticated with `$SHARED_SECRET` (set at the environment level, same pattern as `$AIRTABLE_API_KEY`). The webapp exposes `list_entries` (read, for NEW-vs-UPDATE matching), `append_entry` (new row, rejects duplicate names), and `update_entry` (appends to Brief History/Impact, never overwrites) — all formatting (type-based fill, zebra striping, borders, row height) and citation notes are applied server-side by the webapp, not by the routine.

**Required MCP integrations:**
- Gmail (read threads, search, create draft)
- Slack (search public and private channels)
- Google Drive (search files)

**Required environment:** `SHARED_SECRET` set on the environment this routine runs from, matching the Script Property configured in the Apps Script deployment.

## MCP servers

### airtable-mcp

**Code:** `mcp-servers/airtable-mcp/AirtableMcpServer.gs`

A reusable Apps Script Web App template that proxies exactly one Airtable
base per deployment, so no caller — native routine, skill, or Cowork plugin
install — ever holds that base's `AIRTABLE_API_KEY` directly; the
deployment is the only thing that does. Nothing about a specific base is
hardcoded in the script itself — which base, which tables exist, which
tier can write/delete where all come from that deployment's
`AIRTABLE_MCP_CONFIG` Script Property, so proxying a different base later
means writing a new config, not editing this file. Callers authenticate
with a `token` query-string parameter (Apps Script Web Apps can't read
custom request headers, so a standard `Authorization` header never reaches
it) that resolves to one of two fixed tiers, each deployment-defined:

- `unattended` — for anything that runs on a schedule with no human
  present. Scoped tighter, since an unattended caller may be processing
  untrusted content (email, chat messages) that could attempt prompt
  injection — the server rejects an out-of-scope write outright rather
  than depending on the caller's own prompt to simply not ask.
- `supervised` — for skills or interactive sessions where a person is
  directing each write in real time. Can reasonably be scoped wider.

The same per-tier `writeTables` list governs both creating and updating
records. Deletes are governed separately, via `deleteTables` — any caller,
either tier, can delete from a table in that list; nothing can delete from
a table outside it, regardless of tier. `airtable_query` reads any table in
`readTables` (either tier, unrestricted) and pages via Airtable's own
`offset` mechanism for tables over ~100 rows. `airtable_get_schema` is
unrestricted (read-only metadata) and lets a caller detect a renamed
table/field before trusting a hardcoded name.

The first (and currently only) deployment of this server proxies the Legal
Tracker base (`appFIB9fJCzTeFDcG`) for `legal-tracker-triage`,
`legal-tracker-triage-review`, and `nat-1-1-briefing` — all three go
through it (via the `airtable-mcp` skill below) instead of holding
`AIRTABLE_API_KEY` directly. Its config specifically: `unattended` can
write `Update Matches`/`Thread Matches`, `supervised` adds `Case
Activity`/`Cases`, and `deleteTables` is `Update Matches` only — rationale
in each routine's `prompt.md`. See `mcp-servers/airtable-mcp/README.md` for
that deployment's actual `AIRTABLE_MCP_CONFIG` value (the checked-in source
of truth, since it now lives in Script Properties rather than code), plus
deployment and testing steps for standing up a new deployment against a
different base.

## Skills

### airtable-mcp

**Code:** `skills/airtable-mcp/SKILL.md`

Packages how to call any deployment of the `airtable-mcp` MCP server (see
"MCP servers" above) into one reusable reference, so routine/skill prompts
say "use the airtable-mcp skill" instead of each duplicating the JSON-RPC
call format, tool schemas, and tier semantics. Documents both transports —
calling the MCP tools directly when a connector is configured, or
`curl`-ing the deployment URL with `AIRTABLE_MCP_URL`/`AIRTABLE_MCP_TOKEN`
when it isn't (the current native routines' situation) — and lists known
deployments (currently just Legal Tracker) so a caller can find the right
one without reading every routine's prompt.md. Doesn't add any enforcement
of its own — the tier/`deleteTables` checks in `AirtableMcpServer.gs`
remain the actual security boundary; this skill only keeps every caller's
knowledge of how to use it consistent and prevents that knowledge from
drifting across prompt files.

## Adding new routines

1. Create a directory under `routines/<routine-name>/`
2. Add `prompt.md` with the routine instructions
3. Add `schedule.yaml` with the cron expression and timezone
