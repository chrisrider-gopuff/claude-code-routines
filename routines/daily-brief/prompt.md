# Daily Brief

You are executing the Daily Brief routine right now. Complete every step below in order. Do not stop to verify configuration or ask for confirmation — just do the work.

## Steps

1. Note today's date (the date this routine is running on).

2. **Read yesterday's #morning-briefing thread for status updates.** Search the `#morning-briefing` Slack channel for the most recent message posted before today. Read all thread replies on that message authored by Chris.

   Chris replies using a **numbered list** where each number corresponds to a brief item from that day. Each list item may contain free-text status notes, a resurface/skip signal, and one or more ALL-CAPS keyword lines for Airtable updates. Example reply:

   ```
   3. Called Claire, she agreed to $30k. Settled, don't resurface.
      NOTE: Settled at $30k, signed 7/10

   6. Exposure updated per new medical records; pushing for early mediation.
      EXPOSURE: 150000 / LIT STRATEGY: Push for early mediation given exposure increase

   7. Still need to decide on counterdemand direction. Resurface.
      NOTE: $250k counterdemand received 6/19, direction still needed

   15. No action needed, skip.
   ```

   **For each numbered list item:**

   a. **Match to brief item**: The number maps to the corresponding item in yesterday's brief. Extract the case name/matter from that item's title or summary — Chris does not need to name it.

   b. **Resurface or skip**: Read the free-text note for intent.
      - Skip/drop signals (e.g., "don't resurface", "resolved", "settled", "skip", "done", "closing", "no action needed") → omit that item from today's brief entirely.
      - No skip signal, or explicit "resurface" / "still pending" → carry the item forward. If there's updated context in the note, incorporate it into today's brief entry.

   c. **ALL-CAPS keyword lines — Airtable updates**: Any line under a numbered item that starts with a word or short phrase in ALL CAPS followed by a colon triggers an Airtable update for that item's case. Multiple keywords in one item are separated by ` / `. The case name comes from the brief item — do not require Chris to specify it.
      - `NOTE:` or `NOTES:` is special-cased: it does **not** overwrite a field. It logs a new dated entry to the Legal Tracker's **Case Activity** table for that case.
      - Any other ALL-CAPS word/phrase is fuzzy-matched (case- and spacing-insensitive) to the closest **Cases** field name — e.g. `EXPOSURE` → `Exposure`, `LIT STRATEGY` → `Litigation Strategy`, `DEMAND` → `Demand`, `TOTAL SETTLEMENT` → `Total Settlement` — and that field is overwritten with the given value.

   **Processing ALL-CAPS keyword lines — Airtable via curl:**
   Follow `.claude/commands/airtable-manager.md` for the current Apps Script URL, passphrase source, and curl gotchas (needs `-L` to follow the redirect; don't force `-X POST` through it or the echo endpoint 405s). This routine runs in a remote Linux container — use Bash `curl`, reading the passphrase from `$AIRTABLE_PASSPHRASE`.

   For each numbered item with one or more ALL-CAPS keyword lines:
   1. Derive the search term from the brief item's case name (apply fuzzy matching: name inversions, partial names).
   2. Call `listRecords` with a `FIND()` filter formula on `Matter` (using the Apps Script URL from `.claude/commands/airtable-manager.md`) — plain `searchRecords` requires an exact match and will miss most real case names (e.g. searching "Fundingsland" won't match "Fundingsland, Jonathan"):
      ```bash
      curl -sS -L "<Apps Script URL from airtable-manager.md>" \
        -H "Content-Type: application/json" \
        -d "{\"passphrase\":\"$AIRTABLE_PASSPHRASE\",\"operation\":\"listRecords\",\"baseName\":\"Legal Tracker\",\"filterFormula\":\"FIND('[derived name]',{Matter})\"}"
      ```
   3. **Record-match confidence — apply before writing:**
      - **High confidence**: exactly one record returned and its name closely matches the brief item → proceed to step 4.
      - **Low confidence** (do NOT write): zero records found, two or more records returned, or the name match is weak (partial, ambiguous, or the brief item is a topic rather than a named party). Log it in the confirmation block for Chris to review and apply manually in Airtable.
   4. Call `getSchema` once per run to confirm current field names and select option values — do not guess field names.
   5. For each ALL-CAPS keyword in the item:
      - `NOTE:` / `NOTES:` → `createRecord` in the **`Case Activity`** table: `Case: [recordId]`, `Entry: <value>`, `Entry Type: "Claude"`, `Activity Date: <today, ISO YYYY-MM-DD>`.
      - Any other keyword → fuzzy-match it against the `Cases` field list from `getSchema`.
        - Clear single match → `updateRecord` with that field. Currency fields take plain numbers (not strings); dates use ISO `YYYY-MM-DD`; never write to `Status` (it's a formula field).
        - No clear field match → treat as low confidence. Log the raw keyword and value in the confirmation block rather than guessing at a field.
   6. If `$AIRTABLE_PASSPHRASE` is not set, skip all Airtable updates and list each unprocessed ALL-CAPS line verbatim at the bottom of today's brief.

   **After processing all replies**, append a confirmation block at the bottom of today's brief (omit any subsection that is empty):

   ```
   ✅ Airtable updated:
   • Miraliev — Total Settlement set to $30,000; Case Activity note logged

   ⚠️ Low confidence (case match) — review in Airtable and promote if correct:
   • Item #7 (Barteau) — searched "Barteau" → 2 records matched. Instruction: NOTE: $250k counterdemand received 6/19. Verify which record and apply manually.

   ⚠️ Low confidence (no matching field) — review and apply manually:
   • Item #9 (GoTV) — "STAGE" doesn't match any Cases field. Instruction: STAGE: Active.

   ❌ No Airtable record found:
   • Item #12 (DCWP) — no match for "DCWP". Instruction: EXPOSURE: 50000.
   ```

   If there are no thread replies, proceed without modification.

3. Build the **Today's Meetings** section — read today's calendar, filter to qualifying meetings, and gather context for each (see "Today's Meetings" section below).

4. Sweep the last 7 days of **Gmail** and **Slack** using the source instructions below.

5. Apply all filtering rules to eliminate noise.

6. Consolidate items: when the same underlying matter appears in multiple sources (e.g., a Slack DM and a Gmail thread, or a Slack DM and a self-authored note), merge them into a single entry with sub-bullets for each distinct next action.

7. Send a message to the **#morning-briefing** Slack channel with the formatted output (see Format section below), leading with **Today's Meetings** followed by the numbered Urgent/Active/Monitoring sections.

---

## Today's Meetings

Read today's calendar (Google Calendar tool) and get the full attendee list, title, time, and any existing description for each event.

**Include a meeting if it meets ANY of these criteria:**
- Has at least one attendee with a non-gopuff.com email domain (external meeting)
- Is a one-off / non-recurring meeting, regardless of attendee domain
- Is an internal meeting that isn't a routine standup, sync, or recurring 1:1

**Skip a meeting if ALL of these are true:**
- It is a recurring event
- All attendees have @gopuff.com emails
- The title contains words like: standup, stand-up, stand up, sync, 1:1, check-in, or weekly

A solo block with no other attendees is not a meeting — skip it regardless of the criteria above.

**For each qualifying meeting**, gather context in parallel:
- **Gmail:** Search recent threads (last 30 days) involving the meeting attendees' email addresses or the meeting subject/title. Look for prior correspondence, open action items, attachments, anything that establishes background.
- **Slack:** Search recent messages (last 30 days) mentioning the attendees' names, the meeting topic, or any company/project names visible in the invite. Use both public and private search if available.

Pull the 3–5 most relevant results from each source, and note the direct link (URL or permalink) to each source used. If a source search returns nothing useful, note "No recent context found" rather than fabricating context. Do not include confidential document content verbatim — summarize and link.

If no meetings qualify, omit the Today's Meetings section entirely from today's message.

---

## Source 1 — Gmail sweep

Search Gmail for threads from the last 7 days. Focus on:

**A. Threads where someone is waiting on me or I owe a response**
- Threads where I am in the To/CC field and the last message is NOT from me
- Threads where I sent a message and asked a question or requested action, but no reply has come yet for more than 24 hours

**B. Self-authored notes-to-self**
Search for:
- `from:me to:me` (sent-to-self emails)
- Subjects matching: `1:1`, `sync`, `notes`, `weekly`, `debrief`

For each self-authored note, extract individual action items (bulleted lists, tasks, "TODO", "follow up", "need to", "action item", "AI:" prefixes, etc.). For each action item, check whether it appears to have been completed by looking for:
- Later Gmail replies or new threads referencing that item
- Slack messages referencing it
- Google Calendar events that correspond to the item (e.g., a meeting was scheduled)
- Google Drive file activity referencing it (e.g., a doc was created or updated)
- Any other evidence of completion

Include only open (not yet completed) action items as individual follow-up entries.

**Filtering rules — exclude before including:**
- ❌ Any email where the sender is `support@yardstik.com` (Yardstik direct emails). If a Gopuff employee forwarded or referenced a Yardstik matter in their own email, that may be included.
- ❌ Emails labeled "Workers Comp" where I am only CC'd and have NOT personally replied anywhere in that thread.
- ❌ Emails from Michelle Carlson with "Litigation Hold" in the subject line where I am BCC'd.
- ❌ Emails with the subject "Real Estate Request" (any variation).

---

## Source 2 — Slack sweep

Search all Slack channels (public, private), DMs, and group DMs for the last 7 days.

Focus on:
- Direct messages to me where I have not replied, or where the last message in the thread is not mine and a response seems expected
- Group DMs where someone is waiting on me
- Channel messages where I am @mentioned and have not responded
- Threads I am in where someone tagged me or my response is clearly pending

For each item, note the channel/DM, the person waiting, and what they're waiting for.

---

## Filtering & consolidation

After collecting all Gmail and Slack items:

1. **Deduplicate / consolidate**: if the same matter appears in both Gmail and Slack (or in a self-authored note and a Slack DM), merge into one entry with sub-bullets for each distinct next action.

2. **Prioritize**:
   - 🔴 Urgent/Time-Sensitive: deadlines within 48 hours, legal matters, executive asks, anything explicitly marked urgent
   - 🟡 Active Matters Needing Follow-Through: open items without a hard near-term deadline
   - 📌 Monitoring/FYI: items that need awareness but no immediate action

---

## Format for the Slack message

```
Today's Meetings

**[Meeting Title] — [Time]**
Attendees: [names + companies for external; first names for internal]
Context: 5–10 lines covering — what this meeting is likely about, any open items or recent history, anything Chris should know walking in.
Sources: [linked list — each source as a clickable Slack permalink or Gmail thread link, labeled descriptively, e.g. "Email: Re: Settlement Agreement (Jun 28)" or "Slack: #legal thread on driver arbitration (Jun 27)"]

[repeat for each qualifying meeting, in chronological order by start time; omit this whole section if none qualify]

🔴 Urgent/Time-Sensitive

1. **[Bold Title]** — [1–2 sentence summary with relevant people and specific next action]
   - Sub-action 1 (if consolidated from multiple sources)
   - Sub-action 2

[repeat for each urgent item]

🟡 Active Matters Needing Follow-Through

4. **[Bold Title]** — [summary]

[repeat, continuing the number sequence from where 🔴 left off]

📌 Monitoring/FYI

7. **[Bold Title]** — [summary]

[repeat, continuing the number sequence from where 🟡 left off]
```

Meeting entries in **Today's Meetings** are unnumbered — they aren't case items and aren't tracked via thread replies. Numbers run sequentially across the 🔴/🟡/📌 sections only — do not restart at 1 for each category.

Each item must include:
- The person(s) involved
- What is outstanding
- The specific next action needed from me
- A source link — include a clickable link to the originating Gmail thread, Slack message/DM, or Google Calendar event. For Gmail threads use the format `https://mail.google.com/mail/u/0/#inbox/<threadId>`. For Slack messages use the permalink returned by the search or read tool. For calendar events use the Google Calendar event link if available. If an item is consolidated from multiple sources, include one link per source on separate sub-bullets.

Omit any section that has no items.

After all items, always append this footer verbatim:

```
---
_Reply with a numbered list to update tomorrow's brief. Each number = the item above._
_• Free-text note — carries context forward. Include "skip", "resolved", or "don't resurface" to drop it._
_• `NOTE:` or `NOTES:` — logs a dated entry to the Legal Tracker's Case Activity for that item's case. Any other ALL-CAPS word — writes to the closest-matching Legal Tracker field (e.g. `EXPOSURE: 90000-360000`, `LIT STRATEGY: Hold pending mediation`). Multiple fields: separate with ` / `. Low-confidence matches will be flagged for manual review._
_Processed at next morning's run._
```
