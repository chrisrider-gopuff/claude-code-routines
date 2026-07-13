---
name: session-handoff
description: >
  Generate a handoff document that lets a fresh agent pick up exactly where this session left off.
  Use this skill any time the user says "hand off this session", "fork this conversation",
  "continue in a new session", "create a handoff", "summarize for a new agent", or
  "I want to start a fresh session". Also trigger proactively at the end of long sessions
  when the user is wrapping up work they'll clearly continue later. Before writing, the skill
  asks the user what the next session should focus on, offering suggestions drawn from the most
  recent parts of the conversation. If the chat is associated with a local project, the handoff
  is saved to a "Handoffs" subfolder inside that project; otherwise it is saved to the fixed
  location C:\Users\ChrisRider\Desktop\Claude\Handoffs. The document gives a new agent everything
  it needs: context, current state, next steps, and which skills to invoke first.
---

# Session Handoff Skill

Your job is to produce a concise handoff document so a fresh agent can continue this work without re-reading the entire conversation. Think of it as a briefing note you'd hand to a smart colleague stepping in mid-project.

## Step 1 — Ask what to focus on (do this FIRST, before writing anything)

Before generating the handoff, use the `AskUserQuestion` tool to confirm what the next session should focus on. The reason this comes first is that a handoff is only useful if it points the next agent at the right thing — and you, having just lived through the session, can propose far better options than a generic prompt could.

Scan the **most recent portions of the conversation** (the latest exchanges carry the most weight — they're where the live work is) and propose 2-4 concrete focus options drawn from that recent activity: the in-flight task, an unresolved decision, a follow-up the user flagged, or the obvious next deliverable.

Guidelines for the question:

- Make each option specific to THIS session. Pull the actual matter name, file, or task from recent messages — never a generic "continue working."
- Put the most likely focus first and label it "(Recommended)".
- Set `multiSelect: true` when the work has multiple live threads the user might want to carry forward together.
- The user can always choose "Other" to type their own focus, so you don't need to capture every possibility.

Use the answer to shape the **What we were doing**, **Current state**, and especially the **Next steps** sections — weight the whole document toward whatever the user selected.

## Step 2 — Decide where to save it

Determine whether this chat is associated with a **project**. A project chat has a selected/working folder under `...\Documents\Claude\Projects\<ProjectName>` — check the workspace folder path and the project context in the system prompt (e.g. "The user is working in their local project '<ProjectName>'"). If you're unsure, the presence of a `Projects\<ProjectName>` working folder is the signal that this is a project chat.

**If this IS a project chat**, keep the handoff with the project it belongs to:

- Save inside the project, in a subfolder named `Handoffs`. Create that subfolder if it doesn't exist (the Write tool will create parent directories, or use bash `mkdir -p` / Desktop Commander `create_directory`).
- Path: `<project folder>\Handoffs\handoff-<topic-name>-<YYYY-MM-DD>.md`
- Example: `C:\Users\ChrisRider\Documents\Claude\Projects\Guerrero\Handoffs\handoff-smith-settlement-2026-06-09.md`

**If this is NOT a project chat**, save to the fixed location, exactly as before:

- Directory: `C:\Users\ChrisRider\Desktop\Claude\Handoffs`
- Use Desktop Commander (`mcp__Desktop_Commander__create_directory`) to create the directory if needed, then write with `mcp__Desktop_Commander__write_file`.
- Path: `C:\Users\ChrisRider\Desktop\Claude\Handoffs\handoff-<topic-name>-<YYYY-MM-DD>.md`

In both cases, derive a short, human-readable name from the primary topic or task of the session — 2-4 words, kebab-case, describing what was worked on rather than a technical session identifier.

Examples: `oos-rate-analysis`, `smith-settlement`, `rif-adverse-impact`, `session-handoff-skill-fix`

Tell the user the exact path so they can reference it in their next session.

## Document structure

Use exactly this template — fill in every section, remove any section that genuinely has nothing to say (don't leave placeholders):

```markdown
# Session Handoff — <date> <time>

## Focus for next session
<!-- What the user selected in Step 1. Lead with this so the next agent knows the priority. -->

## What we were doing
<!-- 2-4 sentences. The goal, not the journey. -->

## Current state
<!-- Where things stand RIGHT NOW. What's done, what's in-flight, what's blocked. -->

## Key decisions made
<!-- Bullet list of non-obvious choices and the reasoning behind them. Omit obvious defaults. -->

## Artifacts & files
<!-- Reference existing artifacts by path or URL — do NOT duplicate their content.
     Format: `- [description](path-or-url)` -->

## Next steps
<!-- Ordered list of what the next agent should do first, weighted toward the user's chosen focus.
     Be specific enough that the agent can act without asking clarifying questions. -->

## Suggested skills
<!-- List skills the next agent should invoke, with a one-line reason for each.
     Pull from the available_skills list in context. Only list skills that are
     actually relevant to the next steps. -->

## Open questions
<!-- Things the user still needs to decide, or unknowns the agent should flag. -->
```

## Writing guidelines

**Be a briefing note, not a transcript.** Compress the conversation into its essence. A 50-message session should yield a ~1-page handoff, not a 10-page summary.

**Don't duplicate artifacts.** If there's a PRD, plan, ADR, diff, or other document already saved — reference it by path or URL. The next agent can read it directly. Summarizing it wastes space and risks drift.

**Suggest skills purposefully.** Look at the "next steps" you wrote, then ask: which skills from available_skills would help a fresh agent execute those steps? Only list skills that map to concrete upcoming work. Include a one-line reason so the agent knows *why* to invoke each one.

**Preserve decisions, not deliberations.** If the user considered option A vs B and chose B, record the choice and the reason — not the full debate.

**Next steps should be actionable.** "Continue the analysis" is useless. "Run the gopuff-snowflake-v5 skill to pull OOS rate for the last 7 days by MFC, then add to the report started at /tmp/oos-report.pdf" is useful.

## Example suggested skills block

```markdown
## Suggested skills
- **gopuff-snowflake-v5** — next step is pulling order data; this skill has the verified schema and query patterns
- **gopuff-dark-report-v5** — final deliverable is a PDF report; use this for Gopuff-branded output
- **airtable-manager** — need to update the Legal Tracker with the settlement value once confirmed
```

## After saving

Tell the user:

1. The full path where the handoff was saved — the project's `Handoffs` folder for project chats, or `C:\Users\ChrisRider\Desktop\Claude\Handoffs` for non-project chats.
2. How to use it: "In your next session, say: *'I have a handoff at <path>'* and I'll read it and pick up from there."
