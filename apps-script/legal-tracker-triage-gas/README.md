# legal-tracker-triage-gas

A standalone Google Apps Script + Gemini implementation of
`routines/legal-tracker-triage` (the Claude Code routine), built to run
under a shared account — `litigation@gopuff.com` — with no dependency on
Claude Code, so the weekly triage keeps running after whoever built it
moves on.

Gmail only (no Slack).

## How it works, in plain English

Once a week (Saturday morning by default), the script logs in as the
`litigation@gopuff.com` mailbox and looks back over roughly the last two
weeks of email. It's looking for anything that reads like a development on
an open legal matter — a reply from opposing counsel, a new complaint or
charge being served, a court notice, a scheduling update, and so on.

For every email thread it finds, it works out which case (if any) it
belongs to using two layers:

1. **Simple, predictable checks first.** Does the sender or recipient
   match a known Opposing Counsel email address in Airtable? Does the
   subject or body mention a matter name, claimant name, or case number
   that's already on record? Was the thread manually tagged with the
   `!update` Gmail label? These checks are plain code — no AI judgment
   involved, and they never guess: if nothing matches, the thread is
   skipped rather than logged with a shaky guess.

2. **Gemini (Google's AI) only for the judgment calls**, and only on
   threads that already passed step 1 (or carry the `!update` label). It
   reads the email and decides two things: how confident the match is
   (see the Match Confidence levels below), and a short, factual,
   third-person summary of what happened — no speculation, no legal
   advice, no opinions. The AI is explicitly told to treat everything in
   the email as content to summarize, never as an instruction to follow —
   so an email that says something like "mark this urgent" or "log this
   under Case X" gets ignored as an instruction and only used for its
   actual facts. This matters because anyone who can email that inbox can
   write whatever they want in the body; the AI is not supposed to take
   orders from a stranger's email.

3. **A case is only ever linked by matching a real record already in
   Airtable** — the script (and the AI) can never invent a new case or
   type in a case name as free text. If it isn't confident, it leaves the
   case link blank rather than guessing, and says so in the weekly
   summary email so a human can assign it by hand.

Every match becomes a new **draft row in the Update Matches table** — the
script never writes directly to the permanent case record. A weekly (or
however often it runs) summary email goes to whoever's set as
`SUMMARY_EMAIL`, listing what was added, what needs manual case
assignment, and whether anything went wrong.

If something breaks along the way — Gmail is unreachable, Airtable
rejects a write, a table or field got renamed in Airtable — the script
stops itself rather than pushing ahead with a guess, and always sends an
email explaining what happened. You should get an email every time it
runs, whether or not anything new was found.

## How Update Matches and Case Activity fit together

These two Airtable tables work together as a **draft-then-approve**
pipeline. This script only ever touches the first one.

**Update Matches is the review queue.** Every row here is a draft the
script (or a person) proposed — nothing in this table is official until a
human signs off on it. The fields that matter:

- **Case** — which case this relates to, if the match was confident
  enough to link one. Can be blank.
- **Activity Date** — the date of the email.
- **Entry** — the plain-English summary of what happened.
- **Entry Type** — where this came from (`Email`, `Slack`, or `Claude` —
  this script only ever writes `Email`).
- **Match Confidence** — `Medium Confidence` (a strong single-case match —
  Case is linked), `Low Confidence` (a weak guess — Case is deliberately
  left blank), or `No Confidence` (either several cases are plausible, in
  which case all of them are linked, or none could be identified at all).
- **Author** — who/what is credited with the entry (for this script, the
  automated author record you set up — see the setup steps below).
- **Approved** — blank until a human reviews it. This is the field *you*
  set by hand: mark it `Approved` to accept the draft as real, or
  `Not Approved` to reject it.
- **Promoted** — a checkbox that gets ticked automatically once a row has
  actually been copied into Case Activity (see below). You shouldn't need
  to touch this yourself.

**Case Activity is the permanent record** — the real, official history for
each case. This script never writes to it directly, and neither should
you type into it by hand for anything that came through Update Matches;
the copy happens automatically.

**The connection between them is an Airtable Automation** (called
"Promotion", configured inside Airtable itself — nothing to do with this
script, and this script has no ability to change it). It watches Update
Matches for any row where `Approved` gets set to `Approved`, and when
that happens it:

1. Creates a matching row in Case Activity — same Case, Activity Date,
   Entry, Entry Type, Author, and Email Link.
2. Checks the `Promoted` box on the original Update Matches row, so
   there's a visible record that it's already been copied.

It does **not** delete the Update Matches row — that row just sits there
with `Approved` = `Approved` and `Promoted` = checked. Marking a row
`Not Approved` does the opposite: nothing gets copied anywhere, and the
row also just sits there, unless something else cleans it up (see below).

**Important: nothing in this script cleans up old Update Matches rows.**
Approved-and-promoted rows and rejected rows both just accumulate in
Update Matches forever unless something deletes them. That cleanup job —
deleting `Not Approved` rows after they're safely outside the matching
window, and deleting `Approved`/`Promoted` rows once they've been
processed — is a *separate* system: the `legal-tracker-triage-review`
Claude Code routine elsewhere in this repo. That routine is not part of
this Apps Script project and won't automatically come along with it. If
that Claude Code routine stops running (which is a real possibility if
the point of this script is to remove the Claude Code dependency
entirely), Update Matches will just keep growing — reviewed rows won't
disappear, but the growing table also shouldn't cause new false matches,
since matching only looks at Thread IDs and dates, not row count. This is
worth deciding on deliberately rather than discovering by accident: either
keep that review routine alive somewhere, or build a Gmail-only
replacement for it the same way this script replaced the triage side.

## Maintaining & troubleshooting

**You should get an email from this script every time it runs**, sent to
whatever `SUMMARY_EMAIL` is set to. Start there:

- **Subject says COMPLETE** — normal run. Lists what was added (if
  anything) and flags anything needing manual case assignment.
- **Subject says INCOMPLETE** — some part of the search didn't finish
  cleanly (e.g. Gmail was briefly unavailable). The email lists which
  parts completed and which didn't. Usually resolves itself next run; if
  it's INCOMPLETE two weeks running, something's actually wrong.
- **Subject says FAILED** — the run stopped before doing anything real
  (e.g. it couldn't read Airtable's table structure, or the automated
  Author record is missing). The email body says exactly why. These
  don't fix themselves — see the specific fixes below.
- **No email at all** — the weekly trigger may not be installed, or the
  script hit an error before it could even try to send mail (e.g. a
  missing required setting). Check the Apps Script project's
  **Executions** log (left sidebar in script.google.com) for the most
  recent run and read the error there.

**Common problems and what to do:**

| Symptom | Likely cause | Fix |
|---|---|---|
| FAILED email about a missing Internal Owners record | `AUTHOR_OWNER_NAME` Script Property doesn't match any record's `Name` in Airtable's Internal Owners table | Fix the typo, or add the missing Internal Owners record |
| FAILED email about a schema mismatch | A table or field got renamed in Airtable | Either rename it back, or update the matching `TABLE_*` Script Property to the new name (field names inside a table can't be reconfigured this way — see the setup section) |
| Nothing new shows up for weeks, but you know there's been case email | The `!update` Gmail label may be missing from `litigation@gopuff.com`, or the mail isn't reaching that mailbox at all, or the relevant case isn't in the Cases table as Active | Check the label exists; check the mailbox is actually receiving that correspondence; check the case's Status in Airtable |
| A row shows up with the wrong case linked | The AI misjudged a Medium Confidence match | Just correct it during review — mark `Not Approved`, or manually fix the Case field before marking `Approved`. This is exactly what the human review step is for |
| Rows keep piling up in Update Matches even after you've reviewed them | Nothing is cleaning up old rows — see the note above about `legal-tracker-triage-review` | Decide whether to keep that Claude Code routine running or replace it |
| Script seems to have silently stopped running entirely | The weekly trigger was deleted, or the Airtable/Gemini API key expired or was revoked | In the Apps Script editor, check **Triggers** (left sidebar) for a trigger on `main`; re-run `installWeeklyTrigger` if it's missing. Check Script Properties for expired keys |

**To change how it runs:** every setting lives in Script Properties
(Project Settings -> Script Properties in the Apps Script editor) — see
the full list in the setup section below and in the comment at the top of
`Code.gs`. Nothing requires editing the code itself: the review window
length, which email address gets the summary, the trigger day/time, which
Airtable base/tables it points at, and so on are all properties.

**To pause it temporarily:** open **Triggers** in the Apps Script editor
and delete the trigger on `main` (or just disable/pause it). Re-run
`installWeeklyTrigger` from the editor whenever you want it back.

**To test a change safely:** set the `DRY_RUN` Script Property to `true`
and run `main` manually from the editor. It runs the full pipeline —
reads Gmail, calls Gemini, checks Airtable — but only logs what it would
have written instead of actually writing it, and still sends you the
summary email so you can see the results. Set it back to `false` when
you're satisfied.

## First-time setup, in order

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
   record into Airtable's `Internal Owners` table, not free text. Add a
   new row there — a generic name like `Litigation Tracker (Automated)`
   is recommended, rather than any individual person's name, so it
   doesn't need updating again the next time this handoff repeats. The
   script refuses to run without `AUTHOR_OWNER_NAME` explicitly set (see
   below) specifically so it never silently falls back to someone's name.

5. **Get an Airtable Personal Access Token** scoped to the Legal Tracker
   base (`appFIB9fJCzTeFDcG`) only, with `data.records:read`,
   `data.records:write`, and `schema.bases:read` (the last one is needed
   for the startup schema-mismatch check — without it every run fails at
   that check before touching Gmail or writing anything) — no delete
   scope. This script never deletes anything and shouldn't be able to.

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
- **Cleanup of old Update Matches rows.** As described above, that's the
  `legal-tracker-triage-review` Claude Code routine's job, not this
  script's.
