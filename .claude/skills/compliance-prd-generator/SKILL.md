---
name: compliance-prd-generator
description: Generate a complete Compliance PRD docx from a compliance snapshot. Use this skill whenever the user mentions creating a PRD, generating a compliance document, or says "Compliance PRD" or "PRD for [regulation]". This skill takes a compliance snapshot (information about a law/regulation, requirements, scope, assumptions, etc.) and generates a professional, reproducible docx with all sections filled in, team assignments automated based on requirement type, and formatting identical to the v2 template. Teams include Driver Ops (partner/driver management), Engineering (technical/code), and Legal (compliance/regulations) — extensible for adding more teams.
compatibility: Requires python-docx library, Python 3.7+
---

# Compliance PRD Generator

Generate a complete Compliance PRD docx file from a compliance snapshot. The tool creates a professional, reproducible document with exact formatting from the Gopuff compliance template, automatically assigns requirements to responsible teams, and fills in all metadata, scope, and reference information.

## When to use this skill

- User provides a **compliance snapshot** (structured information about a law, regulation, or compliance requirement)
- User asks to "create a PRD" or "generate a compliance document"
- User mentions "Compliance PRD" or "PRD for [regulation/bill]"
- You need to convert compliance analysis into a structured PRD document

## What you need from the user

A **compliance snapshot** — a structured summary of the compliance requirement. This can be:
- Extracted from a bill review or compliance analysis
- Provided as JSON or plaintext with the sections below
- Provided as a conversation (you'll structure it)

**Required fields:**
- `matter_bill`: Short name of bill/regulation (e.g., "California AB-2884")
- `description`: One-line description of the product/ops change needed
- `jurisdiction`: State, federal, or EU
- `effective_date`: YYYY-MM-DD when the law takes effect
- `legal_owner`: Name of legal owner
- `product_owner`: Name of product owner
- `statutory_trigger`: Citation of the law/rule (e.g., "§ 1798.135(b)(1)")
- `statutory_effective`: When enforcement begins (YYYY-MM-DD)
- `summary`: 2–3 sentences describing what the law requires
- `in_scope`: List of surfaces, products, regions, or cohorts covered
- `out_of_scope`: List of explicitly excluded items
- `requirements`: List of discrete requirements, each with:
  - `citation`: Section citation (e.g., "§ 395(a)(1)")
  - `current_state`: What Gopuff does today (1–2 sentences)
  - `gap_risk`: Compliance status and risk (e.g., "Non-compliant — legal exposure")
  - `future_state`: (Optional) What must change; if omitted, Claude assigns a team
- `assumptions`: List of assumptions (e.g., "Assumption: we operate only in US states")
- `open_questions`: List of questions for legal/regulator
- `references`: List of links to statute text, enforcement guidance, Jira, etc.

**Optional fields:**
- `date_drafted`: Defaults to today

## How the skill works

1. **Team assignment**: Requirements are automatically routed to appropriate teams based on content:
   - **Driver Ops**: Driver partners, delivery partners, independent contractors, acceptance, status, authentication, background checks, verification
   - **Engineering**: Application, software, code, APIs, platforms, data, integration, technical features, backend/frontend, driver app
   - **Legal**: Compliance, regulation, statute, binding agreements, contracts, disclosure, notice, audit
   
   If a requirement matches multiple teams, the team with the most keyword hits wins. Teams are extensible — new teams can be added to the skill as compliance requirements evolve.

2. **Document generation**: Creates a docx with:
   - Title and metadata table (Matter/Bill, Jurisdiction, Effective date, Status, Legal owner, Product owner, Date drafted, Version)
   - RACI matrix
   - Section 1: Summary
   - Section 2: Statutory trigger
   - Section 3: Scope (In scope / Out of scope)
   - Section 4: Requirements table with automated team assignment
   - Section 5: Assumptions & open questions
   - Section 6: Implementation plan (P0/P1/P2 grid)
   - Section 7: Success criteria & compliance verification
   - Section 8: References

3. **Formatting**: Exact match to Gopuff's v2 template:
   - Dark blue headers (#1F4E79), gray placeholder text (#5A6675)
   - Arial 11pt body, 10pt metadata/tables
   - Future-state team names: **bold** + <u>underlined</u>
   - Proper table borders, cell padding, color scheme

4. **Reproducibility**: Same input snapshot always produces identical visual output (content varies; formatting is fixed).

## Usage

When the user provides a compliance snapshot:

1. **Validate**: Confirm you have all required fields. Ask for any missing pieces.
2. **Generate**: Run the Python script with the snapshot as JSON.
3. **Deliver**: Return the .docx file to the user.

### Example snapshot (JSON)

```json
{
  "matter_bill": "California AB-2884",
  "description": "Require Driver Partners to complete authentication before first delivery",
  "jurisdiction": "California",
  "effective_date": "2025-01-01",
  "legal_owner": "Chris Rider",
  "product_owner": "Sarah Chen",
  "statutory_trigger": "California Labor Code § 2875",
  "statutory_effective": "2025-01-01",
  "summary": "California AB-2884 requires gig economy platforms to implement driver authentication before work begins. We must verify identity and conduct background checks for all new Driver Partners before first delivery.",
  "in_scope": [
    "All new Driver Partners in California",
    "First delivery event only",
    "Gopuff driver app + website sign-up"
  ],
  "out_of_scope": [
    "Existing Driver Partners (grandfathered)",
    "UK/EU operations",
    "Third-party delivery partners"
  ],
  "requirements": [
    {
      "citation": "§ 2875(a) — complete identity verification",
      "current_state": "Gopuff requires name, email, phone. No government ID check.",
      "gap_risk": "Non-compliant — missing government ID verification",
      "future_state": "Collect government ID (DL or passport) and verify with third-party service"
    },
    {
      "citation": "§ 2875(b) — background check before first gig",
      "current_state": "We run background checks post-acceptance, not pre-acceptance.",
      "gap_risk": "Partial — timing does not match statute",
      "future_state": "Run background check synchronously during onboarding; gate first delivery"
    }
  ],
  "assumptions": [
    "Background check turnaround is <24 hours",
    "Driver Partners can re-submit failed background checks"
  ],
  "open_questions": [
    "Does 'first gig' mean first shift or first delivery?",
    "Are we liable if background check vendor makes an error?"
  ],
  "references": [
    "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320241AB2884",
    "https://jira.gopuff.com/browse/LEGAL-1234"
  ]
}
```

## Team assignment heuristics

As compliance needs evolve, new teams can be added to the skill by extending the `TEAM_KEYWORDS` dictionary in the Python script. Current teams and their areas:

| Team | Triggers | Examples |
|------|----------|----------|
| **Driver Ops** | Partner/driver management, onboarding, authentication, background checks, status | "Gate first delivery on successful background check", "Verify driver identity" |
| **Engineering** | Code, APIs, data systems, integration, technical features | "Update driver app to require authentication", "Integrate with verification vendor API" |
| **Legal** | Compliance, regulation, statute, contracts, disclosure | "Disclose authentication requirements in ToS", "Audit background check vendor compliance" |

**Adding a new team:**
```python
TEAM_KEYWORDS = {
    'Driver Ops': [...],
    'Engineering': [...],
    'Legal': [...],
    'New Team': ['keyword1', 'keyword2', ...]  # Add here
}
```

## Output

The skill returns a `.docx` file (Compliance_PRD.docx) ready to:
- Review with product and engineering teams
- Upload to Google Drive
- Share with external stakeholders

## Notes

- **Reproducibility**: Running the same snapshot twice produces visually identical documents (timestamp/ID differences may exist but are invisible).
- **Extensibility**: Teams are easy to add; keywords can be tuned as you iterate on real requirements.
- **Customization**: If a requirement doesn't fit any team's keywords, it defaults to Legal. You can manually reassign in the generated docx.
