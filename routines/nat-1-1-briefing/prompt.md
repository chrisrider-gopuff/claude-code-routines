---
name: nat-1-1-briefing
description: Prepares Chris Rider's briefing ahead of his 1:1 with Nat Flandreau. Runs in three phases: (1) build and post a draft, (2) process Chris's line-edit reply into a final version, (3) post the approved final version into #chris-nat-1to1 as the permanent record. Phase 1 is schedule-triggered; Phases 2 and 3 are triggered externally (Slack emoji reaction -> Workflow Builder -> Google Sheet -> Apps Script -> API fire) rather than on a timer.
---

# Nat 1:1 Briefing Routine

## Entry point -- determine which phase to run

This routine has two triggers: a daily schedule (no `text` field passed -- always
Phase 1) and an API trigger fired by a Google Apps Script watching a Google Sheet
that a Slack Workflow Builder emoji-reaction workflow writes to (mechanics below).

**On every invocation, first check the `text` field passed with this run:**
- No `text`, or `text` doesn't match either pattern below -> this was the
  **schedule** trigger. Run **Phase 1** only.
- `text` starts with `PHASE2` -> run **Phase 2** only. The rest of `text` contains
  `channel_id=<id> ts=<timestamp>` identifying the draft message Chris reacted to
  with :100:. Use these values instead of reading `state.json` when present.
- `text` starts with `PHASE3` -> run **Phase 3** only, using the same
  `channel_id=<id> ts=<timestamp>` pattern, identifying the final-version message
  Chris reacted to with :white_check_mark:.

Never run more than one phase in a single invocation -- read only that phase's own
section below; do not execute steps from the other two phases.

**How the API trigger fires (context only -- this happens outside Claude):** Chris
reacts to the draft or final-version Slack message in the review channel with an
emoji. A Slack Workflow Builder workflow watching for reactions there appends a row
to [this Google Sheet](https://docs.google.com/spreadsheets/d/1r1YfvZ9e5JJms3E8aKKq2pKlSSj-dRFKBo-ClnzR3PQ/edit)
(columns: `Channel`, `Timestamp`, `Emoji`). A Google Apps Script `onEdit` trigger on
that sheet reads the new row and POSTs to this routine's `/fire` endpoint:
- Emoji `:100:` -> `text: "PHASE2 channel_id=<Channel> ts=<Timestamp>"`
- Emoji `:white_check_mark:` -> `text: "PHASE3 channel_id=<Channel> ts=<Timestamp>"`

## Why this is three phases, not one

The old version of this routine ran once a day on a cron schedule and did everything
in a single pass. That breaks down once a human has to read a draft, write a reply,
and approve a final version -- a script on a timer can't know when Chris has actually
replied or approved. So this routine is split into three independently-triggerable
phases that share the same underlying logic (sourcing, classification, formatting)
but each only do their one job when fired.

| Phase | Trigger | Does |
|---|---|---|
| 1. Draft | Schedule (weekday morning) | Build the briefing from scratch, post it as a draft |
| 2. Finalize | External fire (:100: reaction -> Sheet -> Apps Script -> API) | Read Chris's thread reply, apply his edits, post a final version for approval |
| 3. Publish | External fire (:white_check_mark: reaction -> Sheet -> Apps Script -> API) | Post the approved final version into #chris-nat-1to1 as the permanent record |

See Entry point above for exactly how a fired run determines which phase to execute.

**Trigger payload needed for Phase 2 and Phase 3:** at minimum, the channel ID and
the message `ts` (timestamp) of the draft (Phase 2) or final version (Phase 3)
message that should be acted on -- provided via the `text` field per Entry point
above. If for some reason `text` lacks a parseable `channel_id`/`ts`, fall back to
"act on the most recent message this routine itself posted in the review channel" --
see State Tracking below.

## State tracking between phases

Because each phase can run in a fresh session with no memory of prior phases,
persist a small state file after each phase so the next phase knows what to act on:

- Path: same directory as this routine file, `state.json`
- After Phase 1: write `{"phase": "draft_posted", "channel_id": "...", "draft_ts": "...", "date": "YYYY-MM-DD"}`
- After Phase 2: update to `{"phase": "final_posted", "channel_id": "...", "draft_ts": "...", "final_ts": "...", "date": "YYYY-MM-DD"}`
- After Phase 3: update to `{"phase": "published", "channel_id": "...", "final_ts": "...", "published_ts": "...", "date": "YYYY-MM-DD"}`

Each phase should read `state.json` first, confirm it's in the expected prior phase
for today's date before proceeding (e.g. Phase 2 expects `phase: draft_posted` from
today), and stop with a clear message if the state doesn't match (e.g. fired twice,
or fired before the prior phase ran).

## Config

- Review channel (where the draft/final version get posted for Chris to edit/approve): `#test1to1`, channel ID `C0BGUDTV3M1` (currently a test channel -- swap to Chris's DM or another channel once this is validated).
- Permanent record channel (where the approved final gets published): `#chris-nat-1to1`, channel ID `C0BG3EE38FK`.
- Chris Rider: `chris.rider@gopuff.com`, Slack user ID `U0AHNL8LD53`.
- Nat Flandreau: `nat.flandreau@gopuff.com`.
- Seed doc (one-time-only, first run ever): Google Doc `1YsxxdHjeB8iIAMZhvIdxqUPSBqKplgWozb00CtUlNJg`. Marker file `seed-doc-used.txt` in this routine's directory -- if it doesn't exist, this is the first real run of Phase 1; read the seed doc and merge its matters/topics into Old Business, then write the marker file after Phase 1 completes. If it exists, skip the doc -- Old Business comes only from #chris-nat-1to1 channel history.
- Legal Tracker (Airtable): base `appFIB9fJCzTeFDcG`, table `tblmPLdw7pLLnAyFs` ("Cases"). Use the airtable-manager skill/pattern for all reads.
- #morning-briefing: channel ID `C0B8P0BC0UX`.
- #weekly-briefing: channel ID `C0BFUJ8LYJV`.
- Phase trigger sheet: Google Sheet `1r1YfvZ9e5JJms3E8aKKq2pKlSSj-dRFKBo-ClnzR3PQ` (columns Channel, Timestamp, Emoji), fed by a Slack Workflow Builder emoji-reaction workflow on the review channel and read by a Google Apps Script `onEdit` trigger that calls this routine's API endpoint.

---

## Phase 1 -- Build and post the draft

Fresh session, no memory of prior runs.

**Gate:** Call Google Calendar `list_events` for chris.rider@gopuff.com, start/end of
today (America/New_York). Look for "Chris / Nat 1:1" (recurring, organized by
nat.flandreau@gopuff.com, usually Mondays ~11am ET but can move). If no such event
today, STOP -- no Slack activity, no state file write.

**Determine Old Business:** Read up to the last 90 days of #chris-nat-1to1
(`C0BG3EE38FK`). Build a list of matter names/case names/topics/keywords that have
already appeared there -- anything on this list is Old Business. Handle the one-time
seed-doc step per Config above.

**Gather source material** (keep a link for every fact used):
1. Airtable Legal Tracker -- pull all open/Active matters (litigation, employment,
   gig/Driver Partner), including Status, "Date Open," "Activity Date Rollup (from
   Case Activity)," any recently-changed fields, the Synopsis field, and the
   record's direct Airtable link. Pull TWO overlapping lists:
   - Every Active record with a recent "Date Open" (roughly last 1-2 weeks) -- the
     authoritative source for the "New case" test below, not Slack. Keyword-guessing
     from Slack has previously missed genuinely new Airtable matters that were never
     mentioned in any briefing -- always do this explicit pull.
   - Every Active record with a recent "Activity Date Rollup" (roughly last 1-2
     weeks) regardless of how old "Date Open" is. This catches live movement on old
     matters (e.g. a settlement negotiation on a case opened a year ago) that will
     never show up in the two Slack channels below, since nobody posts about old,
     already-tracked cases there. (Lesson learned: an active Bar Properties
     Litigation settlement negotiation was missed for exactly this reason.)
2. #morning-briefing (`C0B8P0BC0UX`), last 7 days. Capture each message's permalink.
3. #weekly-briefing (`C0BFUJ8LYJV`), last 7 days. Capture each message's permalink.

Extract every distinct matter/case/issue from (1)-(3), each with a one-line summary
of what's new plus the specific source link (Airtable record link, or Slack/Gmail
permalink).

**Deduplicate by FACT PATTERN, not name/keyword.** Before finalizing, cross-check
every candidate's underlying facts (claimant name, store address/location, docket
or claim number, date of the triggering event) against every OTHER candidate,
including Airtable synopses already pulled. Two items describing the same store,
claimant, or incident are the SAME matter and must be merged into one entry, even if
they arrived via different sources (an Airtable synopsis vs. a same-week Slack
mention). (Lesson learned: a single ADA accessibility case was once split into two
entries -- one from the Airtable record "Moreno, Ernesto," one from a Slack mention
of "BevMo ADA Suit, 10984 Santa Monica Blvd," because the store address in
Moreno's own synopsis wasn't cross-checked against the Slack mention. Always read
each Airtable synopsis fully before treating a same-week Slack mention as separate.)
When merging, keep the Airtable link (case-level items prefer it) and fold any
extra Slack-sourced detail in as a trailing clause.

A matter mentioned vaguely in Slack (e.g. "SLO Complaint," "ADA Accessibility Class
Action," "UK Letter Before Action") will often turn out to be a specific named
Airtable record (e.g. "Martin, Matthew," "Moreno, Ernesto," "Rozenstein, Joella") --
match by date/fact pattern and use the Airtable record as the authoritative version.

**Classify each item -- two independent tags:**
- **Business**: exactly `New` or `Old` (capitalize only the first letter, never
  "NEW BUSINESS"/"OLD BUSINESS," never add the word "business"). `Old` if the
  matter/keyword appears in the Old Business list from above; otherwise `New`.
- **Type**: exactly one of `New case`, `Update`, `Discussion` (capitalize only the
  first letter of each; extend this list later if Chris wants more tags):
  - **New case** (`New` business only, Airtable-gated): a brand-new matter actually
    entered in the Legal Tracker AND its Date Open is very recent (roughly last 1-2
    weeks). Weave the Legal Tracker synopsis's key facts (parties, claim type,
    court/venue, what's alleged/demanded) directly into the item's description -- up
    to ~3 sentences since it's carrying the full synopsis. If the synopsis field is
    empty, briefly summarize from Slack/email instead, but append
    "(low confidence -- Legal Tracker synopsis not yet populated)" to the description
    so Chris can spot thin entries at a glance. A matter only mentioned in Slack/email
    (a new complaint, charge, demand letter, subpoena) but NOT yet entered in Airtable
    is NEVER `New case`, no matter how new -- tag it `Update` or `Discussion` instead;
    promote it to `New case` once it's actually logged with a recent Date Open.
  - **Update**: a status update Nat just needs to know; no action needed.
    EXCEPTION -- if the update is fully and unambiguously closed out with nothing
    further needed from anyone ("fully executed, no further action," "settlement
    signed"), OMIT it entirely rather than including it as a live agenda row -- Chris
    doesn't need 1:1 time to review something already done. If genuinely unsure
    whether it's closed vs. just quiet, include it as `Update` rather than guessing.
  - **Discussion**: needs Nat's input, a decision, sign-off, or flags real
    risk/urgency. Also use this (rather than `New case`) for anything Slack called
    "new" whose Airtable Date Open turns out to be old. If a matter already has a
    next step firmly scheduled (e.g. "call scheduled for late July") with nothing
    left to decide, prefer `Update` -- `Discussion` means a live decision or open
    risk, not just an open matter.

**Sort order:** `Old` items first, `New` after. Within each, `New case`, then
`Update`, then `Discussion`. If zero `Old` items (common -- Old Business only comes
from #chris-nat-1to1 history), start straight with `New` items, no heading needed.

**Format** (mirrors the #morning-briefing style -- flat numbered list, no table, no
Canvas):

```
*Prep for your 1:1 with Nat -- [date] (draft)*

1. *[Business] [Type]* - *{Matter}* -- {description}.
. <{url}|{SourceLabel}>

2. *[Business] [Type]* - *{Matter}* -- {description}.
. <{url}|{SourceLabel}>

...

_Reply in this thread with a numbered list to edit this draft. Each number = the item above._
_. "drop" or "delete" -- removes that item entirely._
_. "revise" -- updates the item with whatever additional/updated info you give me._
_. `NS: <text>` -- appends your text in *bold* to the end of that entry (your note to Nat, or what you're doing next)._
_. No note on a number -- carries that item forward as-is._
_Once you reply, react to this message with :100: to have me post a final version back here for your approval before it goes to #chris-nat-1to1._
```

`SourceLabel` is the platform name matching the URL's domain: `Airtable`, `Gmail`,
or `Slack`. Every item must have a source link; if truly none exists, write
`(source not found)` in plain text instead.

Keep descriptions factual, no filler, and don't editorialize a strategy
recommendation unless the Legal Tracker or a source explicitly states that's the
plan -- Chris supplies the strategy call himself.

**Post it:** `slack_send_message` to the review channel (Config above) with the
formatted content. Write `state.json` as described in State Tracking. If Airtable or
a briefing channel is unreachable, add a flagged row noting the gap rather than
failing silently or skipping the run.

---

## Phase 2 -- Process Chris's reply, post a final version

Fired externally (`text` starting with `PHASE2`) once Chris has replied in the
thread under the draft and reacted to a message with :100:.

1. Read `state.json`. Confirm `phase: draft_posted` for today's date; if not, stop
   and report the mismatch instead of guessing.
2. Read the thread under the draft message (`channel_id` + `draft_ts` parsed from
   the `text` field per Entry point above, falling back to `state.json` if `text`
   didn't carry them).
3. Parse Chris's numbered reply. For each numbered item in his reply:
   - `drop` / `delete` -> remove that item from the final version entirely.
   - `revise` (with additional/updated info) -> update that item's description to
     incorporate what Chris provided, keeping the same Business/Type tags unless
     his note implies they should change (e.g. he reveals it's actually resolved,
     or that Nat already knows about it from a prior week).
   - `NS: <text>` -> append `<text>` in **bold** to the end of that item's line
     (this is Chris's note to Nat, or his commentary on next steps).
   - No note against a number -> carry that item forward exactly as drafted.
   - Any number Chris didn't address at all -> carry forward as drafted (same as
     "no note").
4. Rebuild the full formatted list (same format as Phase 1) reflecting the edits.
5. Post it as a new message in the review channel (same channel as the draft) with
   a header like `*Prep for your 1:1 with Nat -- [date] (final -- react with :white_check_mark: to post to #chris-nat-1to1)*`
   followed by the revised numbered list. No reply-instruction footer this time --
   replace it with a one-line approval prompt referencing the :white_check_mark: reaction.
6. Update `state.json` to `phase: final_posted`, adding `final_ts`.

---

## Phase 3 -- Publish the approved final version

Fired externally (`text` starting with `PHASE3`) once Chris has reacted to the
final-version message with :white_check_mark:.

1. Read `state.json`. Confirm `phase: final_posted` for today's date; if not, stop
   and report the mismatch.
2. Fetch the exact content of the final-version message (`channel_id` + `final_ts`
   parsed from `text` per Entry point above, falling back to `state.json`).
3. Strip the approval-prompt header line, keep the numbered list content as-is --
   this is the permanent record.
4. `slack_send_message` to `#chris-nat-1to1` (`C0BG3EE38FK`) with that content. This
   is a real, timestamped channel message (not a Canvas), so it becomes the
   permanent, un-editable week-to-week record -- and it's exactly what Phase 1's Old
   Business detection reads on future runs.
5. Update `state.json` to `phase: published`, adding `published_ts`.

---

## Open items to resolve before going live

- Decide the real review channel for production (currently `#test1to1` for testing;
  original design was a DM to Chris -- pick one before removing the test channel).
- Confirm the API trigger + bearer token have actually been added to this routine at
  claude.ai/code/routines (token generation is UI-only, shown once) -- without it,
  the Apps Script side has nothing to call.
- Confirm the Slack Workflow Builder workflow that watches the review channel for
  :100: and :white_check_mark: reactions and appends rows to the Phase trigger sheet
  (Config above) is actually built and enabled.
