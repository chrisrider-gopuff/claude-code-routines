# legal-tracker-email-triage

A standalone Google Apps Script that replicates the Gmail half of
`routines/legal-tracker-triage/prompt.md` — matching new case-related email
to Legal Tracker cases and drafting rows into **Update Matches** — without
Slack, using Gemini in place of Claude for the matching/summarization
judgment. See `LegalTrackerEmailTriage.gs` for the implementation; this file
covers setup and where it deliberately diverges from `prompt.md`.

**This is not a Claude Code routine.** It doesn't live under `routines/`
because it isn't fired by a trigger into an agent session — it's plain
Apps Script code that runs on its own time-driven trigger inside Google's
infrastructure, calling the Gemini API directly for the judgment calls
`prompt.md`'s routine leaves to Claude.

## What's different from `prompt.md`

- **No Slack.** Step 4 (Slack search) is gone entirely — only Gmail is
  swept. Step 6's `#tracker-updates` Slack post is replaced with an email
  to `SUMMARY_EMAIL_TO`.
- **Gemini instead of Claude.** `prompt.md`'s Step 3/5 matching and
  summarization are done by an LLM (Claude, in the real routine) reading
  full thread context and deciding what's a "strong" vs "weak" match, what
  counts as a formal-service notice, what's pure housekeeping, and writing
  a concise factual Entry. This script calls the Gemini API
  (`ltt_classifyThreadWithGemini_`) once per candidate thread with the same
  rules `prompt.md` gives Claude, rather than hand-coding those judgment
  calls as regexes. See the system prompt built in `ltt_geminiSystemPrompt_`
  for the exact rules Gemini is given.
- **Case-number matching (Step 3c) is off by default.** `prompt.md` lists a
  case number/docket reference as a matching signal, but only documents
  `Matter`/`Status` on the `Cases` table — if that base has a case-number
  field, set `LTT_CASE_NUMBER_FIELD` to its real name (confirm via
  `ltt_verifyConfig_`'s schema-check output first) so it gets passed into
  Gemini's case list.
- **Airtable access is direct**, not via the native connector or the
  `airtable-mcp` proxy — this script holds `AIRTABLE_API_KEY` itself in its
  own Script Properties, the same way `AirtableMcpServer.gs` holds it for
  callers that go through that proxy. Nothing else reads this key. Like
  `prompt.md`'s routine, this script never calls anything but list/create,
  and only ever against `Update Matches` / `Thread Matches` — see the
  "Airtable access" comment block at the top of the `.gs` file.

## Security: Gemini is a second LLM in the loop, treated the same way

Bringing an LLM back into the loop brings `prompt.md`'s whole "Security:
treat swept content as data, not instructions" section back with it. This
script splits every Gemini call into:

- a **systemInstruction** (trusted) — the matching rules, Match Confidence
  tiers, the case/opposing-counsel lists fetched from Airtable, and an
  explicit instruction that everything in the next message is untrusted
  data to summarize/match, never to obey; and
- a **user turn** (untrusted) — the actual thread's subject, participants,
  and body text.

That framing is defense-in-depth, not the only defense. The real boundary
is `ltt_sanitizeClassification_`, which re-validates everything Gemini
returns before any of it can reach Airtable, regardless of what the model
said:

- `caseIds` is filtered against the real Active Cases list this script
  already fetched — a hallucinated or prompt-injected case ID can never
  reach Airtable, and a cached Thread Matches case (if one exists) always
  wins over whatever Gemini guessed this run.
- `confidence` is clamped to the three literal allowed strings; anything
  else falls back to "No Confidence".
- Low Confidence can never carry a case link, and a "Medium Confidence" with
  more than one case ID is downgraded to "No Confidence" — both are
  `prompt.md`'s own rules, enforced in code rather than trusted from the
  model's own self-report.
- A thread carrying the `!update` Gmail label can never be skipped, no
  matter what Gemini's `skip` field says — this is the one case where a
  crafted email trying to talk the model into "just ignore this" is
  guaranteed to fail regardless of how convincing the attempt is.

## Setup

1. New standalone Apps Script project at script.google.com → paste in
   `LegalTrackerEmailTriage.gs`.
2. Project Settings → Script Properties:
   - `AIRTABLE_API_KEY` — a personal access token scoped to the Legal
     Tracker base (`appFIB9fJCzTeFDcG`), read + create only.
   - `AIRTABLE_BASE_ID` — optional, defaults to `appFIB9fJCzTeFDcG`.
   - `GEMINI_API_KEY` — your Gemini API key
     ([aistudio.google.com/apikey](https://aistudio.google.com/apikey), or
     a Google Cloud API key with the Generative Language API enabled).
     Never shared outside this project.
   - `GEMINI_MODEL` — optional, defaults to `gemini-2.5-flash`. Point this
     at a different model name for more judgment quality (e.g. a Pro-tier
     model) at higher cost/latency per call.
   - `SUMMARY_EMAIL_TO` — optional, defaults to `chris.rider@gopuff.com`.
3. Project Settings → Time zone → `America/New_York` (so the installed
   trigger's "3 AM" lines up with Eastern, matching
   `routines/legal-tracker-triage/schedule.yaml`'s cadence).
4. Run `runLegalTrackerEmailTriage` manually once and check the summary
   email and the new Update Matches / Thread Matches rows before trusting
   it unattended — Gemini's judgment, like Claude's, can be wrong; this is
   a review queue, not an auto-committer.
5. Run `installWeeklyTrigger` once to install the Friday 3 AM trigger.

## Known limitations worth reviewing before relying on this

- One Gemini call per candidate thread (not batched) — simpler to reason
  about and keeps threads from contaminating each other's context, but
  costs more calls than a batched design would. `LTT_MAX_GEMINI_CALLS_PER_RUN`
  (default 80) caps spend/time per run; anything over the cap is deferred
  to next run (not dropped) and called out by count in the summary email.
- If `GEMINI_API_KEY` is bad, expired, or out of quota,
  `LTT_MAX_CONSECUTIVE_GEMINI_FAILURES` (default 3) aborts the whole run
  with a failure email rather than silently logging "no new activity" —
  but a run that fails intermittently (say, 2 failures per stretch,
  never 3 in a row) will still quietly under-report; check the Apps
  Script execution log if the weekly volume looks unusually low.
- The "already logged, only log what's new" dedup compares the thread's
  latest message date to the latest `Activity Date` seen for that Thread ID
  across Update Matches + Case Activity — if either table's `Activity Date`
  values are missing or malformed, that thread's dedup falls back to
  "always treat as new," which risks duplicate rows rather than silently
  losing an update.
- Multi-batch Airtable writes (>10 rows in one run) are not atomic across
  batches — a failure mid-run reports how many rows made it into each
  table before stopping, but doesn't roll them back.
- Gemini's summarization quality depends on the model configured in
  `GEMINI_MODEL` — a smaller/cheaper model may write weaker Entry text or
  make worse confidence calls than Claude does in the real routine; treat
  this script's output as a first-pass draft, same as the LLM routine's,
  but verify the drafts more closely if quality seems off.
