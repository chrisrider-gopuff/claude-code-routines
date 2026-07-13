---
name: bill-review
description: Produce a Compliance Snapshot for any proposed or enacted bill. Use this skill any time the user asks for a review, analysis, summary, or impact assessment of a bill, statute, regulation, or rulemaking — including pending legislation, recently enacted laws, agency rules, or changes to existing code. Trigger phrases include "review this bill", "analyze this legislation", "what does this bill do to us", "how does this regulation impact us", "compliance impact of [bill/act/rule]", "prepare an analysis of [bill]", "draft a memo on [statute/rule]", or any time the user uploads a bill/statute/rule PDF and asks what to do about it. Always produce the output as a single landscape seven-column table (New Requirement, Current Status, Compliance Gap, Risk, Proposed Gap Closure, Implementation Cost, Implementation Difficulty), with rows sorted by descending total of Risk + Cost + Difficulty scores.
---

# Bill Review — Compliance Snapshot

## Purpose

This skill captures a specific deliverable format the in-house legal team has settled on for reviewing bills, statutes, and regulations: a one-page (or short) **Compliance Snapshot** delivered as a landscape seven-column table. The format trades narrative for density — every row is a discrete compliance item with the new statutory requirement, what we do today, the gap, a risk rating, a concrete closure, and rough cost/difficulty estimates so the user can prioritize. It is designed to be skim-readable by a busy lawyer or business stakeholder, copy-pasteable into a Google Doc, and a launchpad for action items.

Produce this format every time, regardless of whether the user explicitly asks for it. The user has chosen this as their default for bill reviews; deviate only if they expressly ask for a different format (memo, full report, etc.).

## Workflow

Follow these steps in order. Don't skip the clarifying-questions step — the value of the deliverable depends on accurate facts about the company's current practices.

### 1. Read the bill in full first

Before drafting anything or asking questions, read the bill end-to-end so the questions are informed. Note every operative section: definitions, scope, affirmative obligations, prohibitions, insurance/financial requirements, recordkeeping, disclosures, enforcement/penalties, effective date, preemption, and any sunset provisions.

### 2. Ask clarifying questions about company practice and format

Use the AskUserQuestion tool. Always cover these dimensions, adjusted to fit the bill:

- **Format**: Confirm the user wants the standard seven-column table (almost always yes; ask only if there's reason to doubt).
- **Current practice on each high-impact obligation**: For each requirement that the bill imposes, ask what the company currently does. The point is to surface gaps the user already knows exist plus uncover those they may not.
- **Anything operationally distinctive about this jurisdiction**: e.g., does the company even operate there? are there local carve-outs? existing state-specific policies that already conform?
- **Audience and scope**: Whether the user wants recommendations included (default: yes), and whether to include a "no-change-needed" row for items already in compliance (default: omit, focus on gaps).

Ask only the questions that aren't already answered in the conversation. Do not ask a question whose answer is already obvious from prior turns.

### 3. Build each row

For each operative obligation in the bill, populate every column:

1. **New Requirement** — what the bill requires, with the statutory citation.
2. **Current Status** — what the company does today.
3. **Compliance Gap** — the delta between (1) and (2) plus enforcement context. If the bill is silent on penalties or enforcement, say so here.
4. **Risk** — HIGH / MEDIUM / LOW per the rubric below.
5. **Proposed Gap Closure** — the concrete remediation.
6. **Implementation Cost** — `$` / `$$` / `$$$` per the rubric below.
7. **Implementation Difficulty** — Low / Medium / High per the rubric below.

Cite the statutory section in **New Requirement** (preferred — keeps the citation next to the rule itself). Restate it in **Compliance Gap** when it adds clarity. Statute citations are the connective tissue between the law and the company's practice; never omit them.

### 4. Note penalty silence when applicable

If the bill is silent on penalties, fines, private rights of action, or enforcement agency, say so explicitly in the Compliance Gap cell. Plaintiffs' counsel will use the statute as the standard of care even without a penalty regime, so silence does not mean low risk. Word it directly: "Bill does not outline specific penalties and background statutes do not contain enforcement guidance."

### 5. Sort the rows by priority score

Assign integer scores:

- **Risk**: HIGH = 3, MEDIUM = 2, LOW = 1
- **Implementation Cost**: `$$$` = 3, `$$` = 2, `$` = 1
- **Implementation Difficulty**: High = 3, Medium = 2, Low = 1

The row's **priority score** = Risk + Cost + Difficulty (range 3–9). Sort all rows in **descending** order of priority score so the heaviest items (high risk, expensive, hard) sit at the top of the table where they get attention. For ties, break on Risk (descending), then Difficulty (descending), then Cost (descending).

The bundled script does this sort automatically — you don't need to pre-sort the JSON, but it's fine if you do.

### 6. Draft the table and produce the deliverable

Use the bundled script `scripts/build_snapshot.js` to generate the .docx. The script takes a JSON payload, sorts the rows, and writes a properly-formatted landscape Word doc. See "Output format" below for the exact JSON schema. Default deliverable is .docx; if the user asks for a markdown table or a Google Doc, output the same content in that format instead — preserve the column order and the descending-priority sort.

### 7. Hand off

End the response with a short cover paragraph (two to four sentences) that:

- States the bill's effective date and scope in one sentence.
- Lists the count of HIGH-risk gaps and the single most-important closure (typically the one with the longest lead time, e.g., insurance procurement).
- Flags any open items the user needs to verify externally (e.g., with a broker, with another team).

Do not write a long executive summary above the table. The table is the deliverable; the cover is just orientation.

## Output format

### Title and subtitle

- **Title (H1, centered)**: `{Jurisdiction} {Bill or rule citation} — Compliance Snapshot`
  - Example: `Tennessee HB 2175 — Compliance Snapshot`
- **Subtitle (italic, centered)**: effective date and statutory location.
  - Example: `Effective July 1, 2026 | New Part 4 to T.C.A. Title 65, Chapter 15`

### Table structure

Always exactly seven columns, in this order:

1. **New Requirement** — terse statement of what the bill requires, with statutory citation. Example: "Criminal background check, sex-offender search, and MVR on every potential driver before first delivery (§ 404(7)–(9))."
2. **Current Status** — first-person plural describing what the company does today. Example: "We complete background checks AFTER first delivery; deliveries can continue for seven days without deactivation while BGC is pending."
3. **Compliance Gap** — terse explanation of the delta between requirement and current state, plus enforcement context. If the bill is silent on penalties or enforcement, say so here.
4. **Risk** — `HIGH` / `MEDIUM` / `LOW`, color-coded:
   - HIGH = pale coral (`FCE4D6`)
   - MEDIUM = pale yellow (`FFF2CC`)
   - LOW = pale green (`E2EFDA`)
5. **Proposed Gap Closure** — concrete remediation. When there is a meaningful tradeoff, present tiered options with bolded labels: `**No risk:** ...` and `**Some risk:** ...`. When a single approach is clearly correct, use a single sentence or short paragraph.
6. **Implementation Cost** — `$` / `$$` / `$$$`, color-coded the same as Risk (`$$$` = pale coral, `$$` = pale yellow, `$` = pale green).
7. **Implementation Difficulty** — `High` / `Medium` / `Low`, color-coded the same as Risk.

Keep cells tight. The whole table should fit on one to two landscape pages.

### Risk rubric

- **HIGH** — facial non-compliance with an affirmative obligation that creates regulatory exposure and/or tort exposure (e.g., negligent-entrustment via statute-as-standard-of-care). Insurance shortfalls, background-check sequencing issues, and prohibited acts are typically HIGH.
- **MEDIUM** — gap that requires real product, process, or policy work but does not, on its face, expose the company to tort risk. Application-content gaps, disclosure additions, and recordkeeping duration mismatches are typically MEDIUM.
- **LOW** — items likely already addressed by existing nationwide policy or platform features; the work is auditing and documenting compliance rather than building new.

### Implementation Cost rubric

Estimated dollar cost to close the gap (one-time + first-year run-rate, all-in across legal, ops, product, finance, vendors).

- **`$$$`** — material spend, typically six figures or more. New insurance towers, new vendor contracts, multi-quarter engineering builds, new headcount.
- **`$$`** — moderate spend, typically low to mid five figures. Smaller engineering work, modest vendor onboarding, training rollouts.
- **`$`** — nominal spend, typically four figures or less. Policy edits, disclosure additions, doc audits, configuration changes.

### Implementation Difficulty rubric

Cross-functional effort and lead time required, regardless of dollar cost.

- **High** — multi-team coordination, vendor procurement, regulatory filings, or product changes that take a full quarter or longer to land.
- **Medium** — one or two teams' work over a few weeks; standard product or ops change with known patterns.
- **Low** — single owner can close inside two weeks; policy edit, doc audit, or platform-config tweak.

### Tone conventions

- First-person plural in Current Status ("we", "our"). Makes the doc feel like an internal artifact.
- Statutory citations in New Requirement (and restated in Compliance Gap when helpful). Use `§` for sections.
- Bolded inline labels (`**No risk:**`, `**Some risk:**`) inside Proposed Gap Closure for tiered options.
- Avoid hedging ("may", "might consider") in Proposed Gap Closure — use direct imperatives ("Add", "Direct broker", "Raise the age gate"). The user is in-house counsel making decisions; they need clarity, not optionality.
- Avoid puffery and adjectives in New Requirement and Compliance Gap. Just state the rule and the delta.

### When to add or omit rows

Include a row for every distinct compliance gap. Combine related minor items into a single "Other operational requirements" row — the script will sort it to wherever its priority score lands. Do not include rows for items already in compliance unless the user asks for a comprehensive audit.

## Generating the docx

The bundled script `scripts/build_snapshot.js` produces a properly formatted Word document with the right page orientation, column widths, header styling, color-coded Risk/Cost/Difficulty cells, and automatic priority-score sorting. Use it instead of writing the docx generation logic from scratch — this guarantees format consistency across reviews.

The script depends on the `docx` npm package. If it isn't already installed in the working directory, install it before running the script:

```bash
cd <working dir> && npm install docx
```

Then run:

```bash
node <skill-dir>/scripts/build_snapshot.js <input.json> <output.docx>
```

A reference input is bundled at `scripts/example_input.json` — useful as a template when constructing a new payload.

The input JSON shape:

```json
{
  "title": "Tennessee HB 2175 — Compliance Snapshot",
  "subtitle": "Effective July 1, 2026 | New Part 4 to T.C.A. Title 65, Chapter 15",
  "rows": [
    {
      "newRequirement":           "Criminal background check, sex-offender search, and MVR on every potential driver before first delivery (§ 404(7)–(9)); bill prohibits permitting any individual to act as a driver with disqualifying records (§ 408).",
      "currentStatus":            "We complete background checks AFTER first delivery; deliveries can continue for seven days without deactivation while BGC is pending.",
      "complianceGap":            "Allowing deliveries before clearance is facially inconsistent with §§ 404(7)–(9) and 408 and creates liability risk. Bill is silent on penalties; background statutes do not provide enforcement guidance.",
      "risk":                     "HIGH",
      "proposedClosure":          "**No risk:** gate first delivery on completion of all three checks. Eliminate the 7-day pending window in TN.\n**Some risk:** continue current policy.",
      "implementationCost":       "$$",
      "implementationDifficulty": "Medium"
    }
  ]
}
```

The script:

- Sets landscape US Letter orientation.
- Renders a seven-column table with widths optimized for legibility.
- Applies color coding automatically based on `risk`, `implementationCost`, and `implementationDifficulty`.
- Sorts rows in descending priority score (Risk + Cost + Difficulty); tiebreakers Risk → Difficulty → Cost.
- Renders `**bold**` markers as bold text. Newlines become line breaks.
- Adds a "Privileged & Confidential — Attorney Work Product" header.

If the user asks for a markdown table or a Google Doc instead, skip the script and produce the same content in markdown — preserve the column order and the descending-priority sort.

## Things to flag explicitly

When relevant, surface these proactively because they are easy to miss and have outsized impact:

- **Penalty silence** — see step 4 above.
- **Preemption upside or downside** — if the bill preempts more granular state or local regulation, that is a defensive asset; if it carves out room for local rules, that is a downside. Either way, mention it in the cover paragraph or as its own row.
- **Effective date and lead time** — particularly for insurance procurement, vendor onboarding, or product changes that require multi-quarter lead time. Insurance procurement is almost always the longest tail and almost always lands at `$$$` cost / High difficulty.
- **Definitions that limit scope** — e.g., mileage caps, exemptions for specific service types. These can either save the company from compliance work entirely or reveal that the bill targets a different business model. Read carefully.
- **Open items for the user to verify externally** — if a recommendation depends on a fact you cannot confirm (e.g., "is the existing policy structured as a CSL?"), flag it explicitly so the user knows what to ask the broker, finance team, or product team.

## Examples

**Title and subtitle:**
```
Tennessee HB 2175 — Compliance Snapshot
Effective July 1, 2026 | New Part 4 to T.C.A. Title 65, Chapter 15
```

**A HIGH-risk row with tiered closure (priority score 3 + 2 + 2 = 7):**

| New Requirement | Current Status | Compliance Gap | Risk | Proposed Gap Closure | Cost | Difficulty |
|---|---|---|---|---|---|---|
| Criminal background check, sex-offender search, and MVR on every potential driver before first delivery (§ 404(7)–(9)); § 408 prohibits permitting any individual to act as a driver with disqualifying records. | We complete background checks AFTER first delivery; deliveries can continue for seven days without deactivation while BGC is pending. | Allowing deliveries before clearance is facially inconsistent with §§ 404(7)–(9) and 408 and creates liability risk. Bill is silent on penalties; background statutes do not provide enforcement guidance. | HIGH | **No risk:** gate first delivery on completion of all three checks. Eliminate the 7-day pending window in TN. Implement as a TN carve-out from the national process. **Some risk:** continue current policy. | $$ | Medium |

**A LOW-risk audit-style row (priority score 1 + 1 + 1 = 3, sorts to bottom):**

| New Requirement | Current Status | Compliance Gap | Risk | Proposed Gap Closure | Cost | Difficulty |
|---|---|---|---|---|---|---|
| Specific TN operational obligations: in-app driver photo and license plate, electronic receipts, zero-tolerance drug/alcohol policy with website notice, complaint intake and immediate suspension during investigation, trip records ≥ 1 year, driver records ≥ 1 year post-deactivation, complaint records ≥ 2 years, nondiscrimination, no PII disclosure (§§ 403, 404(2)–(6), 406(e), 407, 409–412). | These obligations are handled via existing nationwide policies and platform features. | Coverage likely already exists; need to confirm against TN-specific text. | LOW | Audit requirements against existing nationwide policies and platform features to confirm TN coverage; remediate any gaps. | $ | Low |
