# Daily Brief

You are executing the Daily Brief routine right now. Complete every step below in order. Do not stop to verify configuration or ask for confirmation — just do the work.

## Steps

1. Note today's date (the date this routine is running on).

2. Sweep the last 7 days of **Gmail** and **Slack** using the source instructions below.

3. Apply all filtering rules to eliminate noise.

4. Consolidate items: when the same underlying matter appears in multiple sources (e.g., a Slack DM and a Gmail thread, or a Slack DM and a self-authored note), merge them into a single entry with sub-bullets for each distinct next action.

5. Send a **Slack DM to me** (user ID: `U0AHNL8LD53`) with the formatted output (see Format section below).

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

[numbered list, same format]

📌 Monitoring/FYI

[numbered list, same format]
```

Each item must include:
- The person(s) involved
- What is outstanding
- The specific next action needed from me

Omit any section that has no items.
