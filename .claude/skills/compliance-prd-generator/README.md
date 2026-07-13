# Compliance PRD Generator

Generate professional Compliance PRD documents from compliance snapshots.

## Installation

1. Install the `compliance-prd-generator.skill` file in your Claude skills directory
2. Ensure `python-docx` is installed: `pip install python-docx`

## Quick Start

Provide a compliance snapshot (JSON) with required fields, and the skill will generate a complete, formatted docx.

**Required snapshot fields:**
- `matter_bill`, `description`, `jurisdiction`, `effective_date`, `legal_owner`, `product_owner`
- `statutory_trigger`, `statutory_effective`, `summary`, `in_scope`, `out_of_scope`
- `requirements` (list of requirement objects with citation, current_state, gap_risk, future_state)
- `assumptions`, `open_questions`, `references`

See `references/example_snapshot.json` for a complete example.

## What It Generates

- Complete 8-section Compliance PRD document
- Metadata table (Matter/Bill, Jurisdiction, Effective date, etc.)
- RACI matrix
- Requirements table with **automatic team assignment**
- Formatted per Gopuff's v2 template (exact colors, fonts, styling)

## Team Assignment

Requirements are automatically routed to:
- **Driver Ops**: Driver/partner management, onboarding, authentication
- **Engineering**: Code, APIs, data systems, technical features
- **Legal**: Compliance, regulation, contracts, disclosure

Extensible — add new teams in `TEAM_KEYWORDS`.

## Files

- `SKILL.md` — Full skill documentation
- `scripts/generate_compliance_prd.py` — Main generator script
- `references/example_snapshot.json` — Example compliance snapshot
