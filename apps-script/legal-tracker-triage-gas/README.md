# legal-tracker-triage-gas

A Google Apps Script + Gemini system that keeps the Legal Tracker
Airtable base's case activity up to date by watching a shared mailbox for
case-related email. It's designed to run unattended, under a shared
Google Workspace account (`litigation@gopuff.com`), with everything it
needs — credentials, schedule, table names — configured through Script
Properties rather than code.

Two independent weekly jobs run out of this one project:

- **`main`** reads recent email, matches it to cases, and drafts new rows
  in Airtable's Update Matches table for a human to review.
- **`runCleanup`** deletes Update Matches rows once they've been reviewed
  and are done with — silently, in the background.

## How it works, in plain English

Once a week (Saturday morning by default), the script logs in as the
`litigation@gopuff.com` mailbox and looks back over roughly the last two
weeks of email. It's looking for anything that reads like a development on
an open legal matter — a reply from opposing counsel, a new complaint or
charge being served, a court notice, a scheduling update, and so on.

For every email thread it finds, it works out which case (if any) it
belongs to using two layers:

1. **Two ways a thread gets picked up for review.** Either a plain-code
   check matches it automatically (sender/recipient is a known Opposing
   Counsel address in Airtable, or the subject/body mentions a matter
   name, claimant name, or case number already on record), or a human
   marked it relevant by attaching the `!update` Gmail label — see
   **Using the `!update` label** below for how that's meant to be used
   day to day. A thread that matches neither way is skipped entirely
   rather than logged with a shaky guess.

2. **Gemini (Google's AI) does the judgment call** on anything picked up
   in step 1: how confident the match is (see the Match Confidence levels
   below), and a short, factual, third-person summary of what happened —
   no speculation, no legal advice, no opinions. A labeled thread gets a
   wider set of candidate cases to consider than an automatically-matched
   one does — see below — but the honesty rules are the same either way.
   The AI is explicitly told to treat everything in the email as content
   to summarize, never as an instruction to follow — so an email that says
   something like "mark this urgent" or "log this under Case X" gets
   ignored as an instruction and only used for its actual facts. This
   matters because anyone who can email that inbox can write whatever
   they want in the body; the AI is not supposed to take orders from a
   stranger's email.

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
email explaining what happened. You should get an email every time `main`
runs, whether or not anything new was found.

## Using the `!update` label

**Attaching the `!update` Gmail label is the primary, intended way to
tell `main` "this belongs in the tracker."** If whoever is checking
`litigation@gopuff.com` sees an email that's relevant to a case in
Airtable, label the thread. That's the main workflow this project is
built around — the automatic checks described below exist as a
supplement, not a replacement for actually reviewing the inbox. A
labeled thread with in-window activity **always** produces an Update
Matches row — the only thing the label doesn't guarantee is that a
specific case gets linked automatically (see below).

When a thread is labeled, `main` doesn't just log a placeholder row —
it hands Gemini the **entire list of active cases** as candidates and
asks it to make a real attempt at identifying which one the thread
belongs to, weighing the label itself as strong, human-confirmed evidence
that the content is worth a higher-confidence read. That's different from
an unmatched, unlabeled thread, which never reaches Gemini at all. In
practice this means most labeled threads should come back with an actual
case linked, not just a "needs manual assignment" placeholder — the
label is what unlocks Gemini's full attempt at matching, not just a
guarantee that *something* gets logged. Gemini still can't invent a case
or link one it isn't genuinely confident about: if it truly can't tell
which case a labeled thread belongs to, the row still comes in with
**Case** left blank and **Match Confidence** set to `No Confidence`,
called out in the summary email as needing manual assignment.

**Automatic matching still runs independently, as a safety net for
anything that doesn't get labeled.** `main` also creates a row, with no
label required, whenever an email:

- comes from or is sent to a known Opposing Counsel email address already
  in Airtable, or
- mentions a matter name, Matter ID, or claimant name that's already in
  the Cases table for an Active case (a plain text match, anywhere in the
  subject or body).

This only ever considers that narrow, specific match — not the full case
list — so it's meant to catch what a reviewer might miss labeling, not to
replace labeling as the primary signal. Labeling a thread that would also
have matched automatically doesn't hurt anything; it just gets Gemini the
wider candidate list and the confidence boost described above.

One timing note: a labeled thread only gets picked up if it's also within
`main`'s review window (`REVIEW_WINDOW_DAYS`, default 14 days) — labeling
an older thread that's already aged out of that window won't surface it.

## How Update Matches and Case Activity fit together

These two Airtable tables work together as a **draft-then-approve**
pipeline. `main` only ever writes to the first one.

**Update Matches is the review queue.** Every row here is a draft `main`
proposed — nothing in this table is official until a human signs off on
it. The fields that matter:

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
- **Author** — who/what is credited with the entry (the automated author
  record you set up — see the setup steps below).
- **Approved** — blank until a human reviews it. This is the field *you*
  set by hand: mark it `Approved` to accept the draft as real, or
  `Not Approved` to reject it.
- **Promoted** — a checkbox that gets ticked automatically once a row has
  actually been copied into Case Activity (see below). You shouldn't need
  to touch this yourself.

**Case Activity is the permanent record** — the real, official history for
each case. Nothing in this project writes to it directly, and neither
should you type into it by hand for anything that came through Update
Matches; the copy happens automatically.

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
row also just sits there, unless something cleans it up.

**That's `runCleanup`'s job.** It runs on its own weekly schedule (Sunday
evening by default) and does two things, silently:

- Deletes a `Not Approved` row once its `Activity Date` is at least
  `CLEANUP_NOT_APPROVED_AGE_DAYS` (default 21) days old. That margin
  matters: `main` re-scans the last two weeks of mail every time it runs,
  so a rejected row younger than that could still be inside a future scan
  window and get logged right back in if deleted too soon. A
  `Not Approved` row younger than the cutoff is left alone — it'll get
  picked up by a later cleanup run once it's safely aged out.
- Deletes an `Approved` row once it's confirmed present in Case Activity
  (i.e. `Promoted` would show checked) — never by age. An `Approved` row
  that hasn't been promoted yet (the Airtable Automation hasn't fired, or
  hasn't fired *yet*) is left completely alone, no matter how old, until a
  later run finds it in Case Activity.
- A blank-`Approved` row (not yet reviewed) is never touched, at any age.

`runCleanup` sends **no email on a normal run** — it's meant to just
happen in the background. If something goes wrong (Airtable unreachable,
a table/field renamed), it still emails `SUMMARY_EMAIL` with the specific
error. To confirm it's actually running and see what it deleted on a
given week, check the Apps Script project's **Executions** log (it logs a
one-line summary every run).

## Maintaining & troubleshooting

**You should get an email from `main` every time it runs**, sent to
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

`runCleanup` is different: **getting no email from it is normal** — it
only emails on failure. Check the Executions log if you want to confirm
it ran and see what it deleted.

**Common problems and what to do:**

| Symptom | Likely cause | Fix |
|---|---|---|
| FAILED email about a missing Internal Owners record | `AUTHOR_OWNER_NAME` Script Property doesn't match any record's `Name` in Airtable's Internal Owners table | Fix the typo, or add the missing Internal Owners record |
| FAILED email about a schema mismatch | A table or field got renamed in Airtable | Either rename it back, or update the matching `TABLE_*` Script Property to the new name (field names inside a table can't be reconfigured this way — see the setup section) |
| Nothing new shows up for weeks, but you know there's been case email | The `!update` Gmail label may be missing from `litigation@gopuff.com`, or the mail isn't reaching that mailbox at all, or the relevant case isn't in the Cases table as Active | Check the label exists; check the mailbox is actually receiving that correspondence; check the case's Status in Airtable |
| A row shows up with the wrong case linked | The AI misjudged a Medium Confidence match | Just correct it during review — mark `Not Approved`, or manually fix the Case field before marking `Approved`. This is exactly what the human review step is for |
| Rows keep piling up in Update Matches even after you've reviewed them | Either the `runCleanup` trigger isn't installed, or the rows are `Approved` but haven't actually been promoted yet (check `Promoted` on the row and whether Case Activity has a matching entry) | Check **Triggers** for `runCleanup`; re-run `installCleanupTrigger` if missing. A pending-Approved row is left alone by design until it's promoted — that's not a bug |
| `Not Approved` rows aren't disappearing even after weeks | Working as intended if younger than `CLEANUP_NOT_APPROVED_AGE_DAYS` (default 21) — they need to age out of `main`'s own scan window first | Wait it out, or lower `CLEANUP_NOT_APPROVED_AGE_DAYS` if you're confident the scan window is narrower than that |
| A job seems to have silently stopped running entirely | Its trigger was deleted, or the Airtable/Gemini API key expired or was revoked | In the Apps Script editor, check **Triggers** (left sidebar) for a trigger on `main` and on `runCleanup`; re-run `installWeeklyTrigger`/`installCleanupTrigger` if either is missing. Check Script Properties for expired keys |

**To change how it runs:** every setting lives in Script Properties
(Project Settings -> Script Properties in the Apps Script editor) — see
the full list in the setup section below and in the comment at the top of
`Code.gs`. Nothing requires editing the code itself: the review window
length, which email address gets the summary, the trigger day/time, which
Airtable base/tables it points at, and so on are all properties.

**To pause a job temporarily:** open **Triggers** in the Apps Script
editor and delete the trigger on `main` or `runCleanup` (or just disable
it). Re-run `installWeeklyTrigger`/`installCleanupTrigger` from the
editor whenever you want it back.

**To test a change safely:** set the `DRY_RUN` Script Property to `true`
and run `main` (or `runCleanup`) manually from the editor. It runs the
full pipeline — reads Gmail, calls Gemini, checks Airtable — but only
logs what it would have written or deleted instead of actually doing it.
`main` still sends its summary email so you can see the results; set
`DRY_RUN` back to `false` once satisfied.

## First-time setup, in order

1. **Create the Apps Script project under `litigation@gopuff.com` itself**
   — script.google.com, signed in as that account, "New project". This
   makes `GmailApp`/`MailApp` inside the script operate as that mailbox,
   and means the project's ownership, triggers, and Script Properties all
   live with that account rather than any individual person's.

2. **Copy in the files.** Paste `Code.gs` into the default `Code.gs` file in
   the editor, and replace the contents of `appsscript.json` (View ->
   Show manifest file) with this directory's `appsscript.json`.

3. **Create the `!update` Gmail label** in `litigation@gopuff.com` itself.
   `main` skips that sweep tier (and says so in its summary email) if the
   label doesn't exist, rather than failing the whole run.

4. **Add an Internal Owners record for this script to link as Author.**
   Every Update Matches/Case Activity row's Author field is a linked
   record into Airtable's `Internal Owners` table, not free text. Add a
   new row there — a generic name like `Litigation Tracker (Automated)`
   is recommended, rather than any individual person's name, so it never
   needs updating as staffing changes. `main` refuses to run without
   `AUTHOR_OWNER_NAME` explicitly set (see below) specifically so it never
   silently falls back to someone's name.

5. **Get an Airtable Personal Access Token** scoped to the Legal Tracker
   base (`appFIB9fJCzTeFDcG`) only, with `data.records:read`,
   `data.records:write`, and `schema.bases:read` (the last one is needed
   for the startup schema-mismatch check — without it every run fails at
   that check before touching Gmail or writing anything). Airtable's PAT
   scopes don't separate "delete" from `data.records:write` — the same
   scope that lets `main` create Update Matches rows is also what lets
   `runCleanup` delete them. The thing actually preventing a delete
   anywhere it shouldn't happen is the code-level allowlist in
   `deleteRecords_` (`Code.gs`), restricted to the Update Matches table
   only — same pattern as the write allowlist for creates in
   `createRecords_`.

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
   | `DRY_RUN` | no | default `false` — set `true` to log intended writes/deletes instead of calling Airtable, while `main` still runs its full match/classify pipeline and sends the summary email |
   | `TRIGGER_WEEKDAY` | no | default `SATURDAY` — read only by `installWeeklyTrigger` (step 10), any day name `MONDAY`..`SUNDAY` |
   | `TRIGGER_HOUR` | no | default `7` — read only by `installWeeklyTrigger`, 0-23 in `America/New_York` |
   | `CLEANUP_NOT_APPROVED_AGE_DAYS` | no | default `21` — how old a `Not Approved` row's Activity Date must be before `runCleanup` deletes it |
   | `CLEANUP_TRIGGER_WEEKDAY` | no | default `SUNDAY` — read only by `installCleanupTrigger` (step 11) |
   | `CLEANUP_TRIGGER_HOUR` | no | default `20` — read only by `installCleanupTrigger`, 0-23 in `America/New_York` |

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
   email — it lists what would have been written, with a
   COMPLETE/INCOMPLETE status. Compare a few entries against what you'd
   expect. Flip `DRY_RUN` to `false` once satisfied.

10. **Install the weekly triage trigger.** Run `installWeeklyTrigger` once
    from the editor — it schedules `main` for `TRIGGER_WEEKDAY` at
    `TRIGGER_HOUR` in `America/New_York` (the script's declared `timeZone`
    in `appsscript.json`; defaults to Saturday 7am if those properties
    aren't set). Re-running `installWeeklyTrigger` is always safe — it
    clears any prior trigger on `main` first, so changing
    `TRIGGER_WEEKDAY`/`TRIGGER_HOUR` later just means re-running it.

11. **Install the weekly cleanup trigger.** Run `installCleanupTrigger`
    once from the editor — schedules `runCleanup` for `CLEANUP_TRIGGER_WEEKDAY`
    at `CLEANUP_TRIGGER_HOUR` (defaults to Sunday 8pm). Same re-run-is-safe
    behavior as `installWeeklyTrigger`. Worth running `runCleanup` manually
    once first (with `DRY_RUN=true`) to see what it would delete before
    trusting it unattended — check the Executions log for its one-line
    summary, since it doesn't email on success.

## Security notes

- **Email content is treated as data, never as instructions.** Anyone who
  can send mail to `litigation@gopuff.com` can write whatever they want in
  the body — the Gemini prompts in `classifyAndSummarize_` explicitly
  instruct the model to summarize and classify email content, never to
  follow directions found inside it.
- **A case can only ever be linked by matching a real Airtable record
  ID** — never a name typed in as text. Every Airtable write is sent with
  `typecast:false`, so an unrecognized value in a linked-record field
  fails loudly instead of silently creating a spurious new Cases/Internal
  Owners record.
- **Write and delete access is restricted in code, not just by the
  Airtable token's scope.** `createRecords_` will only ever POST to
  Update Matches or Thread Matches; `deleteRecords_` will only ever DELETE
  from Update Matches. Both allowlists are hardcoded checks inside
  `Code.gs`, independent of what the `TABLE_*` Script Properties are set
  to — there is no other backstop preventing a write or delete to the
  wrong table if that code path were ever bypassed, so treat those two
  checks as load-bearing.
