---
name: nat-1-1-briefing
description: Prepares Chris Rider's briefing ahead of his recurring 1:1 with Nat Flandreau, entirely within this chat session -- builds and presents a draft, incorporates Chris's conversational edits, then posts the final version to #chris-nat-1to1 once Chris says to publish.
---

# Nat 1:1 Briefing Routine

## How this routine runs

Fresh session every weekday morning, no memory of prior runs. Everything --
draft, edits, and publish -- happens within this one session's conversation.
There is no external trigger and no cross-session state file.

1. **Build and present the draft** (Step 1) -- runs immediately on fire. Gather
   source material, dedupe, classify, and present the numbered draft directly
   as a chat message in this session. Nothing is posted to Slack yet.
2. **Incorporate edits** (Step 2) -- Chris replies in this same conversation,
   mixing numbered commands (`drop`, `revise`, `NS: <note>`) with free text for
   new items. Keep updating the working draft in place across as many rounds as
   Chris wants.
3. **Publish on request** (Step 3) -- only when Chris explicitly says to
   post/publish/send it, post the current draft to `#chris-nat-1to1` as the
   permanent record.

## Config

- Permanent record channel (where the finished briefing gets posted, and the
  sole source of Old Business for future runs): `#chris-nat-1to1`, channel ID
  `C0BG3EE38FK`.
- Chris Rider: `chris.rider@gopuff.com`, Slack user ID `U0AHNL8LD53`.
- Nat Flandreau: `nat.flandreau@gopuff.com`.
- Legal Tracker (Airtable): base `appFIB9fJCzTeFDcG`, table "Cases". Use the `airtable-mcp` skill for all reads (`airtable_query`) — this routine never holds `AIRTABLE_API_KEY` directly, and runs with the `unsupervised` tier token even though it only ever reads, never writes, since there's no reason to hold a token capable of more than that. `$AIRTABLE_MCP_URL` (the deployment URL, not secret) is a plain environment variable, but the token itself is NOT — at the start of this run, use the Google Drive MCP's `read_file_content` on the private Secrets Sheet (Google Sheet ID `1HpVuNDByHfpXAUCq-6Ty-X5hM5oHBh829jRXqfqhwRo`, owned solely by Chris), find the row whose first column reads exactly `AIRTABLE_MCP_TOKEN_UNSUPERVISED`, and take its second column as the token value. That read returns the sheet's full contents, including unrelated secrets for other systems (the Airtable API key itself, among others) — the only thing this routine may ever use, act on, or reference from it is that one value. Never echo, log, print, quote, or write any other row or the sheet's contents in general anywhere.
- #morning-briefing: channel ID `C0B8P0BC0UX`.
- #weekly-briefing: channel ID `C0BFUJ8LYJV`.

---

## Step 1 -- Build and present the draft

**Gate:** Call Google Calendar `list_events` for chris.rider@gopuff.com, start/end of
today (America/New_York). Look for "Chris / Nat 1:1" (recurring, organized by
nat.flandreau@gopuff.com, usually Mondays ~11am ET but can move). If no such event
today, STOP -- say so plainly in chat and do nothing else.

**Determine Old Business:** Read up to the last 90 days of #chris-nat-1to1
(`C0BG3EE38FK`). Build a list of matter names/case names/topics/keywords that
have already appeared there -- anything on this list is Old Business. This
channel history is the only source for Old Business; there is no seed document.

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
Canvas -- since this is exactly what gets posted to Slack in Step 3, write it in
Slack mrkdwn even though it's being presented in chat first):

```
*Prep for your 1:1 with Nat -- [date] (draft)*

1. *[Business] [Type]* - *{Matter}* -- {description}.
. <{url}|{SourceLabel}>

2. *[Business] [Type]* - *{Matter}* -- {description}.
. <{url}|{SourceLabel}>

...

_Reply here to edit -- by number ("3. drop", "5. revise: ...", "7. NS: <note>") and/or free text for anything new. Tell me to post it when you're ready, and I'll send this to #chris-nat-1to1._
```

`SourceLabel` is the platform name matching the URL's domain: `Airtable`, `Gmail`,
or `Slack`. Every item must have a source link; if truly none exists, write
`(source not found)` in plain text instead.

Keep descriptions factual, no filler, and don't editorialize a strategy
recommendation unless the Legal Tracker or a source explicitly states that's the
plan -- Chris supplies the strategy call himself.

**Present it:** Output the formatted content as your chat response in this
session -- do not call `slack_send_message` yet. If Airtable or a briefing
channel is unreachable, note the gap plainly in the chat rather than failing
silently or skipping the run.

---

## Step 2 -- Incorporate edits

Chris will reply in this conversation, potentially across several turns, mixing:
- Numbered commands against a specific item: `drop`/`delete`, `revise` (with new
  info), `NS: <text>` (append in **bold** as his note to Nat) -- same semantics
  as the old Slack-thread-reply convention, just typed directly in chat.
- Free text describing a new item to add, or a general instruction ("add a note
  about X", "merge items 4 and 6").
- No note against a number -- carry that item forward as-is.
- Any number Chris didn't address at all -- carry forward as drafted (same as
  "no note").

After each round of edits, update the working draft in place and briefly confirm
what changed. Re-show the full numbered list if it's been more than a couple of
small edits, so Chris can review the current state before publishing. Keep the
same Business/Type tags on an edited item unless Chris's note implies they
should change (e.g. he reveals it's actually resolved, or that Nat already
knows about it from a prior week).

There's no fixed number of edit rounds -- keep incorporating changes until Chris
says to publish.

---

## Step 3 -- Publish on request

Only when Chris explicitly asks to post/publish/send the briefing (phrases like
"post it", "send this to Nat", "publish", "send to #chris-nat-1to1" -- use
judgment, don't require an exact phrase):

1. Assemble the current state of the numbered list, reflecting all edits so far.
2. Strip the edit-instructions footer -- it's not part of the permanent record.
3. `slack_send_message` to `#chris-nat-1to1` (`C0BG3EE38FK`) with that content.
   This is a real, timestamped channel message (not a Canvas), so it becomes the
   permanent, un-editable week-to-week record -- and it's exactly what Step 1's
   Old Business detection reads on future runs.
4. Confirm in chat that it posted, with a link to the message.

If Chris asks to keep editing after this point, treat it as a new addendum --
don't silently re-post or duplicate; ask whether he wants a follow-up message or
to hold it for next time's business.
