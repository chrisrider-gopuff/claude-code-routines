# Daily Brief

You are executing the Daily Brief routine right now. Complete every step below in order. Do not stop to verify configuration or ask for confirmation — just do the work.

## Steps

1. Note today's date (the date this routine is running on).

2. **Read yesterday's #morning-briefing thread for status updates.** Search the `#morning-briefing` Slack channel for the most recent message posted before today. Read all thread replies on that message authored by Chris.

   Chris replies using a **numbered list** where each number corresponds to a brief item from that day. Each list item may contain free-text status notes, a resurface/skip signal, and one or more `AT:` lines for Airtable updates. Example reply:

   ```
   3. Called Claire, she agreed to $30k. Settled, don't resurface.
      AT: Total Settlement: 30000 / Stage: Settled

   7. Still need to decide on counterdemand direction. Resurface.
      AT: Notes: $250k counterdemand received 6/19, direction still needed

   15. No action needed, skip.
   ```

   **For each numbered list item:**

   a. **Match to brief item**: The number maps to the corresponding item in yesterday's brief. Extract the case name/matter from that item's title or summary — Chris does not need to name it.

   b. **Resurface or skip**: Read the free-text note for intent.
      - Skip/drop signals (e.g., "don't resurface", "resolved", "settled", "skip", "done", "closing", "no action needed") → omit that item from today's brief entirely.
      - No skip signal, or explicit "resurface" / "still pending" → carry the item forward. If there's updated context in the note, incorporate it into today's brief entry.

   c. **`AT:` lines — Airtable updates**: Each `AT:` line triggers one or more field updates on the Legal Tracker record for that item's case. Parse `AT:` content as `Field: Value` pairs, separated by ` / ` if multiple. The case name comes from the brief item — do not require Chris to specify it.

   **Processing `AT:` lines — Airtable via curl:**
   Follow `.claude/commands/airtable-manager.md`. This routine runs in a remote Linux container — replace all PowerShell calls with Bash `curl`. Read the passphrase from `$AIRTABLE_PASSPHRASE`.

   For each `AT:` line:
   1. Derive the search term from the brief item's case name (apply fuzzy matching: name inversions, partial names).
   2. Call `searchRecords` on the `Matter` field:
      ```bash
      curl -s -X POST "https://script.google.com/macros/s/AKfycbyw9DuipVzhlUecfmW66mBBuTgie9ne0GFHlhfy9fwrQDiYPKnSripltBAkW_zHy2T06g/exec" \
        -H "Content-Type: application/json" \
        -d "{\"passphrase\":\"$AIRTABLE_PASSPHRASE\",\"operation\":\"searchRecords\",\"baseName\":\"Legal Tracker\",\"field\":\"Matter\",\"value\":\"[derived name]\"}"
      ```
   3. **Confidence assessment — apply before writing:**
      - **High confidence**: exactly one record returned and its name closely matches the brief item → proceed to step 4.
      - **Low confidence** (do NOT write): zero records found, two or more records returned, or the name match is weak (partial, ambiguous, or the brief item is a topic rather than a named party). Log it in the confirmation block for Chris to review and apply manually in Airtable.
   4. Before writing, call `getSchema` to confirm valid field names and select option values:
      ```bash
      curl -s -X POST "https://script.google.com/macros/s/AKfycbyw9DuipVzhlUecfmW66mBBuTgie9ne0GFHlhfy9fwrQDiYPKnSripltBAkW_zHy2T06g/exec" \
        -H "Content-Type: application/json" \
        -d "{\"passphrase\":\"$AIRTABLE_PASSPHRASE\",\"operation\":\"getSchema\",\"baseName\":\"Legal Tracker\"}"
      ```
   5. Call `updateRecord` with the field/value pair(s). Currency fields take plain numbers (not strings); dates use MM/DD/YYYY; never write to the `Status` formula field.
   6. If `$AIRTABLE_PASSPHRASE` is not set, skip all Airtable updates and list each unprocessed `AT:` line verbatim at the bottom of today's brief.

   **After processing all replies**, append a confirmation block at the bottom of today's brief (omit any subsection that is empty):

   ```
   ✅ Airtable updated:
   • Miraliev — Total Settlement set to $30,000; Stage set to Settled

   ⚠️ Low confidence — review in Airtable and promote if correct:
   • Item #7 (Barteau) — searched "Barteau" → 2 records matched. AT instruction: Notes: $250k counterdemand received 6/19. Verify which record and apply manually.

   ❌ No Airtable record found:
   • Item #12 (DCWP) — no match for "DCWP". AT instruction: Stage: Active.
   ```

   If there are no thread replies, proceed without modification.

3. Sweep the last 7 days of **Gmail** and **Slack** using the source instructions below.

4. Apply all filtering rules to eliminate noise.

5. Consolidate items: when the same underlying matter appears in multiple sources (e.g., a Slack DM and a Gmail thread, or a Slack DM and a self-authored note), merge them into a single entry with sub-bullets for each distinct next action.

6. Send a message to the **#morning-briefing** Slack channel with the formatted output (see Format section below).

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

Numbers run sequentially across all three sections — do not restart at 1 for each category.

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
_• `AT: Field: Value` — writes to Legal Tracker using that item's case name (e.g. `AT: Total Settlement: 45000 / Stage: Settled`). Multiple fields: separate with ` / `. Low-confidence matches will be flagged for manual review._
_Processed at next morning's run._
```
