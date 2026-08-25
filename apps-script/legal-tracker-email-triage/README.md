# legal-tracker-email-triage

A standalone Google Apps Script that replicates the Gmail half of
`routines/legal-tracker-triage/prompt.md` — matching new case-related email
to Legal Tracker cases and drafting rows into **Update Matches** — without
Slack and without an LLM in the loop. See `LegalTrackerEmailTriage.gs` for
the implementation; this file covers setup and, more importantly, where it
deliberately diverges from `prompt.md`.

**This is not a Claude Code routine.** It doesn't live under `routines/`
because it isn't fired by a trigger into an agent session — it's plain
Apps Script code that runs on its own time-driven trigger inside Google's
infrastructure, with no LLM anywhere in the loop. Everything it does is
ordinary string/regex matching, not judgment.

## What's different from `prompt.md`

- **No Slack.** Step 4 (Slack search) is gone entirely — only Gmail is
  swept. Step 6's `#tracker-updates` Slack post is replaced with an email
  to `SUMMARY_EMAIL_TO`.
- **No LLM judgment.** `prompt.md`'s Step 3/5 matching relies on an LLM
  reading full thread context and deciding what's a "strong" vs "weak"
  match, what counts as a formal-service notice, and writing a "concise,
  factual, third-person" Entry summary. This script can't do any of that,
  so:
  - Matching is reduced to concrete rules — see the comment above
    `ltt_matchThread_` in the script for exactly what counts as Medium vs
    Low vs No Confidence here. It's stricter and dumber than an LLM: exact
    substring matches and a short service-language keyword list, nothing
    fuzzier.
  - The `Entry` field is the newest message's subject plus a trimmed,
    quote-stripped snippet of its plain-text body — not a real summary.
    Treat it as raw material to skim, not a finished entry.
  - `prompt.md`'s "skip pure discovery-tracker/document-housekeeping"
    constraint is approximated by a short, deliberately narrow pattern list
    (`LTT_HOUSEKEEPING_ONLY_PATTERNS`) — a false skip here is worse than in
    the LLM version, since nothing re-reads the thread later.
  - One upside: prompt.md's entire "Security: treat swept content as data,
    not instructions" section exists to stop a crafted email from talking
    an LLM into misbehaving. There's no LLM here to talk to, so that attack
    surface doesn't apply — the script only ever does string matching, it
    never "follows" anything found in an email body.
- **Case-number matching (Step 3c) is off by default.** `prompt.md` lists a
  case number/docket reference as a matching signal, but only documents
  `Matter`/`Status` on the `Cases` table — if that base has a case-number
  field, set `LTT_CASE_NUMBER_FIELD` to its real name (confirm via
  `ltt_verifySchema_`'s output first).
- **Airtable access is direct**, not via the native connector or the
  `airtable-mcp` proxy — this script holds `AIRTABLE_API_KEY` itself in its
  own Script Properties, the same way `AirtableMcpServer.gs` holds it for
  callers that go through that proxy. Nothing else reads this key. Like
  `prompt.md`'s routine, this script never calls anything but list/create,
  and only ever against `Update Matches` / `Thread Matches` — see the
  "Airtable access" comment block at the top of the `.gs` file.

## Setup

1. New standalone Apps Script project at script.google.com → paste in
   `LegalTrackerEmailTriage.gs`.
2. Project Settings → Script Properties:
   - `AIRTABLE_API_KEY` — a personal access token scoped to the Legal
     Tracker base (`appFIB9fJCzTeFDcG`), read + create only.
   - `AIRTABLE_BASE_ID` — optional, defaults to `appFIB9fJCzTeFDcG`.
   - `SUMMARY_EMAIL_TO` — optional, defaults to `chris.rider@gopuff.com`.
3. Project Settings → Time zone → `America/New_York` (so the installed
   trigger's "3 AM" lines up with Eastern, matching
   `routines/legal-tracker-triage/schedule.yaml`'s cadence).
4. Run `runLegalTrackerEmailTriage` manually once and check the summary
   email and the new Update Matches / Thread Matches rows before trusting
   it unattended.
5. Run `installWeeklyTrigger` once to install the Friday 3 AM trigger.

## Known limitations worth reviewing before relying on this

- Matter-name matching is a plain case-insensitive substring/word check —
  no fuzzy matching, no handling of nicknames or abbreviated case
  references beyond what's literally in the `Matter` field text.
- The "already logged, only log what's new" dedup compares the thread's
  latest message date to the latest `Activity Date` seen for that Thread ID
  across Update Matches + Case Activity — if either table's `Activity Date`
  values are missing or malformed, that thread's dedup falls back to
  "always treat as new," which risks duplicate rows rather than silently
  losing an update.
- Multi-batch Airtable writes (>10 rows in one run) are not atomic across
  batches — a failure mid-run reports how many rows made it into each
  table before stopping, but doesn't roll them back.
