---
name: check-request
description: "Generate a Gopuff legal settlement check request from a signed settlement agreement and prepare the routing email to Treasury. Use this skill any time the user asks to 'create a check request,' 'process a settlement,' 'make a check request,' or otherwise references generating payment paperwork for a settled litigation case (e.g., 'create a check request for Ferguson', 'process the Alicia settlement', 'make a check request for the Mitchell case'). This skill handles the full flow — pull the latest settlement agreement and any W-4/W-9 documents from Gmail, locate the case folder in the Litigation 2.0 shared Drive, create a 'Settlement Documents' subfolder, upload the supporting documents, build a check request as a native Google Doc in that subfolder, and draft the routing email to Jesus Mora and Jessica Kelly. Trigger this skill even when the user only names the case (e.g., 'check request for Ferguson') — that phrasing is the standard shorthand for this workflow."
---

# Check Request — Settlement Payment Paperwork

## Purpose

This skill captures Chris Rider's standard workflow for converting a signed settlement agreement into a payment instruction. The deliverable has two parts: a check request Google Doc that lives inside a `Settlement Documents` subfolder of the case folder (alongside the agreement and any W-4/W-9s), and a Gmail draft to Treasury (Jesus Mora and Jessica Kelly) that links to that subfolder and itemizes its contents. Claude automatically handles the entire workflow end-to-end: finding the case folder, organizing settlement documents, extracting payment terms, and creating the check request and email draft. The user will send the email themselves.

## Trigger

The user typically says something like:

- "Create a check request for [case name]"
- "Process the [plaintiff name] settlement"
- "Make a check request for the [name] case"

Treat any of these as a request to run this entire workflow end-to-end.

## Workflow

### Step 1 — Find the case folder in the Litigation 2.0 shared drive

Search the Litigation 2.0 shared Google Drive for a subfolder matching the case name the user referenced. Subfolders typically follow a `Last, First` naming convention (e.g., `Phillips, Tara`).

Be flexible with spelling. Folder names often differ slightly from how the user refers to the case — the user might say "Ferguson" when the folder reads "Ferguson, Dewuane," or might misspell the first name ("Dewaune" vs. "Dewuane"). Match on intent rather than exact string.

If multiple folders could plausibly match, ask the user which one. If no folder matches, ask the user to confirm the case name — don't guess.

### Step 2 — Create Settlement Documents subfolder and organize existing documents

Inside the case folder, create a new subfolder named **`Settlement Documents`** (if one already exists, reuse it).

Search the case folder for existing settlement-related documents (settlement agreement, W-4/W-9s, wire verification forms, etc.). Move any found settlement documents to the Settlement Documents subfolder.

If you're uncertain which documents are settlement documents, search the user's Gmail for emails about the case that reference "settlement" with attachments — those will likely be the settlement documents. Use the attachment list from those emails as your guide for what to look for in the Drive folder.

### Step 3 — Identify and download the settlement agreement

From the case folder or Gmail (if documents aren't yet in Drive), locate the most recent **settlement agreement** — prefer files whose subject/filename indicates "fully executed" over "signed," "executed," "draft," or unmarked versions.

Read the agreement carefully. As you do, note any referenced supporting documents (W-9s, tax forms, releases, exhibits, attorney-fee statements, bank verification forms, etc.) that should accompany the payment request.

If referenced documents aren't found in the case folder or Gmail, **flag them for the user** so they know what's missing.

### Step 4 — Extract key settlement terms from the agreement

Read the downloaded PDF and pull:

- **Payee / plaintiff name** (exactly as written in the agreement)
- **Settlement amount** (the consideration)
- **Paying entity** (e.g., GoBrands, Inc.; Beverages & More, Inc.)
- **Payment deadline** (e.g., "within 21 days of [date]")
- **Payment method** if specified — check or wire
- **Multi-check breakdowns** — many settlements split the total across checks (W-2 wages, 1099 to plaintiff, 1099 to plaintiff's counsel). Capture all of them with payee, amount, and tax form.
- **Delivery instructions** — where the checks should be mailed (often plaintiff's counsel's office)
- **Case caption and case number** for the memo line

Use the agreement to inform the W-4/W-9 search — e.g., if the agreement pays attorney's fees directly to a law firm, you should be looking for a firm W-9 in addition to the plaintiff's.


### Step 5 — Build the check request as a native Google Doc

Build the check request as a **native Google Doc** (not a .docx). Use a single 2-column table mirroring the canonical template (Drive file id `15KTuJoISD8AbAk279NmTB0s3D-JxM9QrfPGboG4kxcg`).

**Exact table format (match the canonical Alicia template: Drive file id `15KTuJoISD8AbAk279NmTB0s3D-JxM9QrfPGboG4kxcg`):**

Title: `Gopuff CHECK/WIRE REQUEST FORM` (bold, centered, above the table)

Use a 2-column HTML table — left column for labels/section headers, right column for values. Section header rows span both columns with a light grey background to visually separate sections.

```html
<html><body>
<h2 style="text-align:center;font-weight:bold;">Gopuff CHECK/WIRE REQUEST FORM</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:11pt;">
  <tr style="background-color:#f3f3f3;">
    <td colspan="2"><strong>Invoice Details</strong></td>
  </tr>
  <tr>
    <td><strong>Invoice #</strong></td>
    <td>[date M/D/YYYY]</td>
  </tr>
  <tr>
    <td><strong>Invoice Date</strong></td>
    <td>[date M/D/YYYY]</td>
  </tr>
  <tr>
    <td><strong>Invoice Description</strong></td>
    <td>[Regular Check / Wire Request / both if multi-payment]</td>
  </tr>
  <tr>
    <td><strong>Invoice Total Amount</strong></td>
    <td>$[amount]</td>
  </tr>
  <tr>
    <td><strong>Supplier / Vendor</strong></td>
    <td>[payee names with payment method]</td>
  </tr>
  <tr style="background-color:#f3f3f3;">
    <td colspan="2"><strong>Gopuff Details</strong></td>
  </tr>
  <tr>
    <td><strong>Location</strong></td>
    <td>Gopuff HQ</td>
  </tr>
  <tr>
    <td><strong>Legal Entity</strong></td>
    <td>[paying entity from agreement]</td>
  </tr>
  <tr>
    <td><strong>Person / Dept Requesting</strong></td>
    <td>Chris Rider, Legal</td>
  </tr>
  <tr>
    <td><strong>Note / Memo</strong></td>
    <td>[case caption] — settlement</td>
  </tr>
  <tr style="background-color:#f3f3f3;">
    <td colspan="2"><strong>Special Handling Instructions</strong></td>
  </tr>
  <tr>
    <td colspan="2">[full prose with agreement reference, payment breakdown, delivery instructions, deadline]</td>
  </tr>
  <tr style="background-color:#f3f3f3;">
    <td colspan="2"><strong>Recipients</strong></td>
  </tr>
  <tr>
    <td colspan="2">jesus.mora@gopuff.com; jessica.kelly@gopuff.com</td>
  </tr>
</table>
</body></html>
```

**Field rules:**

- **Invoice # / Invoice Date**: always today's date, formatted M/D/YYYY (e.g., 5/7/2026). Never the agreement's signing date.
- **Invoice Description**: `Regular Check` or `Wire Request` or both separated by slash if multiple payment methods (e.g., `Regular Check / Wire Request`).
- **Invoice Total Amount**: the full settlement consideration (not split across checks).
- **Supplier / Vendor**: list payee names with payment method (e.g., "Tara Phillips (check 1); Laurel Employment Law, APC (wire)").
- **Location**: always `Gopuff HQ`.
- **Legal Entity**: paying entity from the agreement.
- **Person / Dept Requesting**: always `Chris Rider, Legal`.
- **Note / Memo**: case caption and "settlement" (e.g., "Phillips v. Beverages & More, Inc. — settlement").
- **Special Handling Instructions**: full prose paragraph with: (1) Agreement reference (parties, full execution dates, court, case number), (2) List of attached documents, (3) Payment breakdown itemizing each check/wire with payee, amount, and tax form, (4) Delivery instructions (mailing address or wire details), (5) Payment deadline.
- **Recipients**: always `jesus.mora@gopuff.com; jessica.kelly@gopuff.com`.

**Filename pattern**: `Check request [plaintiff_last] [entity_short]` (no extension — it's a Google Doc). Examples: `Check request ferguson gobrands`, `Check request phillips bevmo`.

**Generation**: Build the HTML string above with all fields filled in, then upload it to Drive as a file with `text/html` MIME type and convert it to `application/vnd.google-apps.document`. When Drive converts an HTML file with a `<table>` element, it renders the table natively inside the resulting Google Doc — borders, bold labels, grey section headers and all. Do not use `text/markdown` — Drive does not convert markdown pipe-table syntax into real table elements; it just renders the raw characters as plain text.

### Step 6 — Place the Google Doc in the Settlement Documents subfolder

Create the Google Doc inside the **`Settlement Documents`** subfolder created in Step 4 — the same place the settlement agreement and W-4/W-9s now live. Don't place it at the case-folder root or anywhere else.

### Step 7 — Create the draft email to Treasury

**Recipients (always):**

- Jesus Mora — `jesus.mora@gopuff.com`
- Jessica Kelly — `jessica.kelly@gopuff.com`

**Subject** reflects payment method and case:

- For single payment method: `Settlement Payment Request — [Payee Name]`
- For multi-check/wire: `Settlement Payment Request — [Primary Payee Name]`

**Body:**

- Briefly state the request: payee(s), total amount, paying entity, deadline.
- If multi-check/wire, itemize the breakdown with bank details where applicable.
- Include **one Google Drive link** — to the `Settlement Documents` subfolder.
- Itemize the documents contained in that subfolder (e.g., "Fully executed settlement agreement," "Plaintiff W-9," "Counsel W-9," "Check request," "Bank verification"). The recipients can click the folder link and see each file.
- Concise and professional in tone — Treasury reads these every day.

Save the draft via Gmail (not sent). **Do not ask the user to send the email** — the user will send it themselves. Simply present the draft as ready for them to send.

**Before finalizing**, flag any issues discovered:

- If the agreement was silent on payment method and the user didn't specify (check vs. wire), flag this for clarification.
- If referenced documents in the settlement agreement weren't found, list them so the user knows what's missing.
- If any extracted field looks ambiguous (unusual entity name, unclear amount, missing delivery address), flag it.
- If only the plaintiff's W-9 was found and the settlement also pays the law firm, note this so the user can provide the firm's wire/banking details if needed.

## Standing facts

These don't change without explicit instruction from the user:

- **Source drive for case folder**: Litigation 2.0 (shared Google Drive).
- **Source for settlement documents**: First, look in the case folder. If uncertain which documents are settlement-related, search Gmail for emails about the case that reference "settlement" with attachments.
- **Document organization**: Move or copy settlement documents into the `Settlement Documents` subfolder. This subfolder is the canonical home for everything Treasury needs to see — settlement agreement, W-4/W-9s, check request, bank verification, and any other supporting docs.
- **Email recipients**: always Jesus Mora and Jessica Kelly.
- **Email handling**: Create the draft and save it to Gmail drafts (not sent). Do not ask the user to send — they will do so themselves.
- **Invoice Number**: always the date the request is sent (today's date), formatted M/D/YYYY.
- **Invoice Description**: always either `Regular Check` or `Wire Request` (or both if multi-check/wire).
- **Output format**: native Google Doc created by uploading an HTML file (with `text/html` MIME type, converted to `application/vnd.google-apps.document`). Never upload a .docx — Drive's preview is unreliable for .docx files generated outside Microsoft Word. Never upload markdown — Drive does not convert markdown tables into real table elements.
- **Email link strategy**: the routing email links to the `Settlement Documents` subfolder only and itemizes the documents inside — not separate links per file.
- **Subfolder name**: Always `Settlement Documents` inside the case folder.
- **Canonical format reference**: Drive file id `15KTuJoISD8AbAk279NmTB0s3D-JxM9QrfPGboG4kxcg` (the Alicia/BevMo check request, used as the template for layout and tone).
- **Missing documents**: If the settlement agreement references documents that aren't found (e.g., "attached exhibits," bank verification forms), flag this for the user at the end of the workflow.

## Why this format

The 2-column table format was chosen by the user after iterating through several .docx versions that wouldn't render in Drive's preview. Native Google Docs avoid the .docx → Drive preview compatibility issues entirely, and the markdown-to-Docs conversion path is reliable. The structure of the table (label/value rows interspersed with shaded section headers, full-width content for free-text sections) is what Treasury is used to seeing — keep it consistent across cases so they can scan a stack of these quickly.
