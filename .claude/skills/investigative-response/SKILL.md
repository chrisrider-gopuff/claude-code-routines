---
name: investigative-response
description: >
  Draft a written response to a government or third-party investigative demand, RFI,
  subpoena, or document request. Reads and assesses the demand to understand what is
  actually being asked — document categories, factual questions, information requests —
  then runs the bates-production skill and drafts a response that directly tracks the
  structure and substance of the demand. Uploads the production and response letter to
  Google Drive automatically, and inserts the real Drive link into the letter. Use any
  time the user says "respond to this investigation," "draft a response to the RFI,"
  "respond to the demand letter," or "write the investigative response."
---

# Investigative Response

## Purpose

Draft a written response to an investigative demand, RFI, DFEH/EEOC charge, government
inquiry, or third-party subpoena. The response is not templated — it is built around what
the specific demand is actually asking. Before drafting anything, the skill reads and
assesses the demand, categorizes each request, and presents that assessment to the user.
The response then tracks those categories directly, addressing each on its own terms.

Production files are uploaded to Google Drive automatically by the bates-production skill.
The response letter is uploaded separately via the google-drive-upload skill after
generation. The Drive link is inserted into the letter automatically.

## Trigger phrases

- "Draft a response to this investigation"
- "Respond to the RFI" / "Respond to this demand letter"
- "Write the investigative response for [case]"
- "Draft the response to Demand Nos. 1–3"
- "Write a response letter to [agency/counsel]"

## Workflow

### Step 1 — Obtain the demand letter

Check whether a demand letter has already been provided. If not, ask the user for one of:
- A Google Drive link to the demand letter PDF
- An uploaded PDF/Word file in this session
- A pasted text copy of the demands

If a Drive link is provided, use the Drive MCP (`download_file_content`) to fetch the
document. If the document is a Google Doc, use `read_file_content` to get its text.

Extract:
- **Issuing party**: name and role of the sender
- **Date of demand**
- **Responding entity**: which Gopuff entity is named
- **Each numbered demand or request**: full text of every item
- **Response deadline** (if stated)
- **Any factual allegations or legal claims**

### Step 2 — Run the bates-production skill

Invoke the bates-production skill:

```
Skill({ skill: "anthropic-skills:bates-production" })
```

Let bates-production run its **full workflow including Step 6** (Drive upload). Do NOT
override or skip the Drive upload step.

When bates-production finishes, it will report the Drive folder URL for the production
in its Step 7 summary. Capture that URL — you will embed it directly into the response
letter. Also read `bates_index.json` from the outputs directory for the case name,
prefix, total page count, and per-document Bates ranges.

**Production folder URL rule:** Embed the Drive folder URL that bates-production reports
directly into the letter where the production link appears. Do NOT write
`[INSERT LINK HERE]`. If bates-production did not report a URL (upload failed or was
skipped), write `[INSERT LINK HERE]` and flag it for the user to fill in manually.

**If bates_index.json already exists** from a prior run this session, skip re-running.

### Step 3 — Assess the demand and present findings

Read the full demand carefully. Categorize each item:

- **Document request** — asks for records, files, communications, or policies
- **Factual question** — asks the company to state facts, describe events, or explain circumstances
- **Personnel/identification request** — asks for names, titles, contact info, or org data
- **Mixed** — requests both documents and narrative explanation

For each item note:
- What is specifically being asked (plain language)
- Whether the production covers it (cross-reference `bates_index.json`)
- Whether a narrative answer is needed
- Any ambiguity or scope issue worth flagging

Present the assessment before drafting:

```
Demand Assessment — [Case Name]
Issuing party: [Name / Agency]
Demand date: [Date]  |  Response deadline: [Date or "not stated"]

Item 1 — [type: document request]
  Asks for: All records of claimant's performance reviews and disciplinary actions
  Covered by production: Yes — KAYE000003–000015 (performance reviews, PIPs)
  Narrative needed: No

Item 2 — [type: factual question]
  Asks for: Description of the reason(s) for claimant's termination
  Covered by production: Partially — KAYE000001–000002 (termination letter)
  Narrative needed: Yes — requires a substantive paragraph
```

After presenting, ask the user:
- Whether Gopuff has a specific position on any narrative-required item
- Whether any item should be objected to (overbroad, privileged, irrelevant)
- Whether any item is out of scope

If the user says to proceed without input, draft with neutral language and flag every
substantive position for review.

### Step 3b — Ask: letter or email?

Ask the user:

> "Do you want the response as a **letter** (Word .docx with Gopuff letterhead) or
> an **email** (HTML file you can open in a browser and paste into Gmail)?"

- **Letter** → Step 4A
- **Email** → Step 4B

---

### Step 4A — Draft as a Word letter (.docx)

#### 4A-1: Draft the response content

**Tone:** Write like a competent lawyer talking to a colleague — direct, plain, and brief.
No throat-clearing, no redundant legal boilerplate, no passive voice pileups. A sentence
that can be cut should be cut. The goal is a letter the recipient can read in 60 seconds.

Draft the response with this structure:

**Opening sentence:** One sentence identifying Gopuff and what is being responded to.
Then one sentence referencing the production:
"Enclosed please find Gopuff's document production, Bates-stamped [PREFIX000001–PREFIXNNNNNN]
([N] pages), available at [INSERT LINK HERE]."

**Body — item by item, mirroring the demand's numbering:**
- Document requests: one or two sentences saying what is produced and what the documents are.
  Include Bates range. Don't over-explain.
- Factual questions: answer directly in plain language. No "Respondent states that..." framing.
  Flag with `[REVIEW]` if the position wasn't confirmed by the user.
- Personnel requests: a short list. Flag with `[CONFIRM]` for entries needing verification.
- Objections (if any): one sentence, specific. No boilerplate objection strings.

**Closing:** One short sentence reserving rights + one sentence offering to answer questions.
Keep it to two sentences total. Example:
"Gopuff reserves all applicable rights and privileges, including attorney-client privilege and work product doctrine. Please feel free to reach out with any questions."

#### 4A-2: Build the letter data JSON

Construct this JSON with the response content above:

```json
{
  "date": "June 3, 2026",
  "delivery_method": "Via E-Mail and U.S. Mail",
  "recipient_name": "Jane Doe",
  "recipient_title": "Director of Investigations",
  "recipient_org": "California Civil Rights Department",
  "recipient_address": ["2218 Kausen Drive, Suite 100", "Elk Grove, CA 95758"],
  "re_line": "Kaye v. GoBrands, Inc. — Response to Request for Information",
  "salutation": "Dear Ms. Doe:",
  "body_paragraphs": [
    "Opening paragraph...",
    "Response to Item 1...",
    "Response to Item 2...",
    "Closing..."
  ],
  "entity": "GoBrands, Inc."
}
```

Each element of `body_paragraphs` becomes one paragraph in the letter.

#### 4A-3: Extract the Gopuff logo

Check whether `gopuff_logo.png` exists in the outputs directory. If not, try to extract
it from any Letterhead.docx in the uploads directory:

```python
from docx import Document
import os

uploads_dir = "/path/to/uploads"   # substitute actual path
outputs_dir = "/path/to/outputs"   # substitute actual path

for fname in os.listdir(uploads_dir):
    if "letterhead" in fname.lower() and fname.endswith(".docx"):
        doc = Document(os.path.join(uploads_dir, fname))
        for section in doc.sections:
            for rel in section.header.part.rels.values():
                if "image" in rel.reltype.lower():
                    with open(os.path.join(outputs_dir, "gopuff_logo.png"), "wb") as f:
                        f.write(rel.target_part.blob)
                    print("Logo extracted")
                    break
        break
```

If no letterhead is available, the script will fall back to a text "gopuff" label.

#### 4A-4: Write generate_letter.py to the outputs directory

Write the following script verbatim to `[OUTPUTS_DIR]/generate_letter.py`:

```python
#!/usr/bin/env python3
"""
generate_letter.py — Generate a Gopuff letterhead .docx response letter.
Usage: python generate_letter.py --data letter_data.json --output out.docx [--logo logo.png]
"""
import argparse, base64, json, os, tempfile
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from lxml import etree as _etree
from PIL import Image

BODY_FONT = "Arial Nova"
BODY_SIZE = Pt(12)

SIG_B64 = (
    "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"
    "u27wHDJXNHKVA2KliMQjFd6ZiLrtElDRgfOBzAn7eiht0MiK6mD37t1lSjkwB+HE89Hq+9gNKZSDpDJJhBBCiMIA0RHroPOmhnTv"
    "0HF3KVEjKwiDG1+XLl08ejlrNNNBah/S+WgwJHHmESmwxgXH+tRTT42OVGRfiJLitNNOizcOXYYWc9wso2I6nXn83tq1a7VmKsFb"
    "b70VXdupOk9nB9d9u2mSzZEfOXKkxl/kHbRY3bJlS6SzgIyRBg0a+HPPPTd24DNtNLE9LksG2T4X1w/YQlu3btVcFUIIURjceuut"
    "0Q2Mis4upUBvUydxw6OYFA1jGs2I0owbN06CRQGIQPXp0ydq1UfRp6RGrz0PNKAx/jNnztQYi5IlLDvhmqIR7kz3DDr5MNi7d+/u"
    "YfBrBHOnffv2cTYWnR58jahmktR6OlKoV9ZoinzzxBNPlHHWrf6M3dCjGKYVYmQ5GwVkMd81qkIIIWo1O3fu9M2bN/cdOnSII+z2"
    "Bsjvmb5qI1+sKzPCbCIzaa35bO/qbI48hOxoPNP4QGs5paOKUgXRNtsZg+my3OTCGguN+dmzZzMdXOTI8OHDo9ZbJ5xwQpl7gDPZ"
    "D0muZ/hblG9pVEU+WbNmje/UqVNigVjYLrgPMyiBv2M0fujQoZqfQgghCoM5c+ZENzU65awvxSNubKwfs4JRfKQQHlK833//fd38"
    "DKgjxSYJdvczpfUlqSd1JpKAqNcjjzzi77zzTo2zKDlQ6/rcc8/5MWPGxNciXJfQvpFryV6fKGKF7yFsl+k14ZhqZCumRYsW8Wau"
    "jbpbzRSXUOTOpTaGP/74Y427qDK9evWKOk8MGzbMN27cOM1WqWgOUpiXBzaiqPOArydOnKj5KYQQovYDw5i9x21qKo0zRrn4HA1k"
    "1nd37tw5uuH99NNPuvEZoEpP45epe86kyjO1L5vRazdMoFGgkRWlyvTp09Oi7oyk2ZaYYQ9oGOVXXHFFWvbKr7/+2uaLL77wn3/+"
    "eZSJpJEtn6+//jqOcHKDl/cKPOLeYdv6uaAcKDwQ6cT50MiKqsDSPWySM+DAbjlJI/I2YGE7xLRq1cq/8cYbmqNCCCFqP1BQt22Z"
    "7M2NhjHTJunA8zj55JMVHc7Arl272HqvTK170ii8S4lIXXrppX7v3r0ejoeMC1HK3HvvvXEaN0XuWG6CbCIbHaaTj6+HDBmSppA+"
    "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"
    "1wZLZ1gAAAAASUVORK5CYII="
)

def _write_tmp(b64_str, suffix=".png"):
    data = base64.b64decode(b64_str)
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f: f.write(data)
    return path

def _set_spacing(para, after_pt=0):
    pPr = para._p.get_or_add_pPr()
    spacing = pPr.find(qn("w:spacing"))
    if spacing is None:
        spacing = OxmlElement("w:spacing"); pPr.append(spacing)
    spacing.set(qn("w:after"), str(int(after_pt * 20)))
    spacing.set(qn("w:line"), "240"); spacing.set(qn("w:lineRule"), "auto")

def _build_header(doc, logo_path):
    section = doc.sections[0]
    header = section.header
    for p in header.paragraphs: p._element.getparent().remove(p._element)
    tbl = header.add_table(rows=1, cols=2, width=Inches(6.5))
    tbl_el = tbl._tbl
    tblPr = tbl_el.find(qn("w:tblPr"))
    if tblPr is not None:
        for child in list(tblPr):
            if child.tag == qn("w:tblBorders"): tblPr.remove(child)
    left = tbl.cell(0, 0)
    tcPr = left._tc.get_or_add_tcPr()
    tcW = OxmlElement("w:tcW"); tcW.set(qn("w:w"), "5040"); tcW.set(qn("w:type"), "dxa"); tcPr.append(tcW)
    lp = left.paragraphs[0]; lp.alignment = WD_ALIGN_PARAGRAPH.LEFT; _set_spacing(lp)
    if logo_path and os.path.exists(logo_path):
        lp.add_run().add_picture(logo_path, width=Inches(1.8))
    else:
        r = lp.add_run("gopuff"); r.font.name = BODY_FONT; r.font.size = Pt(18); r.bold = True
    right = tbl.cell(0, 1)
    tcPr2 = right._tc.get_or_add_tcPr()
    tcW2 = OxmlElement("w:tcW"); tcW2.set(qn("w:w"), "4320"); tcW2.set(qn("w:type"), "dxa"); tcPr2.append(tcW2)
    for i, line in enumerate(["Chris Rider","Senior Counsel, Litigation","267.560.7870","chris.rider@gopuff.com"]):
        p = right.paragraphs[0] if i == 0 else right.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT; _set_spacing(p)
        r = p.add_run(line); r.font.size = Pt(10)
    hr = header.add_paragraph(); _set_spacing(hr)
    pPr = hr._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single"); bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1"); bottom.set(qn("w:color"), "00AEEF")
    pBdr.append(bottom); pPr.append(pBdr)

def _para(doc, text="", align=WD_ALIGN_PARAGRAPH.JUSTIFY, bold=False):
    p = doc.add_paragraph(); p.alignment = align; _set_spacing(p)
    if text:
        r = p.add_run(text); r.font.name = BODY_FONT; r.font.size = BODY_SIZE; r.bold = bold
    return p

def _add_sig_anchor(doc, sig_path):
    """Insert signature as behind-text floating image."""
    width_emu = int(1.56 * 914400)
    with Image.open(sig_path) as im:
        w_px, h_px = im.size
    height_emu = int(width_emu * h_px / w_px)
    tmp = doc.add_paragraph()
    tmp.add_run().add_picture(sig_path, width=width_emu)
    A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    blip = tmp._p.find('.// + A_NS + blip')
    rId  = blip.get(' + R_NS + embed')
    tmp._p.getparent().remove(tmp._p)
    WP  = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
    PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
    W   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    xml = (
        f'<w:drawing xmlns:w="{W}" xmlns:wp="{WP}" xmlns:a="{A_NS}" xmlns:pic="{PIC}" xmlns:r="{R_NS}">' +
        f'<wp:anchor behindDoc="1" distT="0" distB="0" distL="0" distR="0" ' +
        f'simplePos="0" locked="0" layoutInCell="1" allowOverlap="0" relativeHeight="251658240">' +
        f'<wp:simplePos x="0" y="0"/>' +
        f'<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>' +
        f'<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
        f'<wp:extent cx="{width_emu}" cy="{height_emu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
        f'<wp:wrapNone/><wp:docPr id="101" name="Signature"/>' +
        f'<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        f'<a:graphic><a:graphicData uri="{PIC}">' +
        f'<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Signature"/><pic:cNvPicPr/></pic:nvPicPr>' +
        f'<pic:blipFill><a:blip r:embed="{rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{width_emu}" cy="{height_emu}"/></a:xfrm>' +
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        f'</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>'
    )
    sp = doc.add_paragraph(); sp.alignment = WD_ALIGN_PARAGRAPH.LEFT; _set_spacing(sp)
    sp._p.append(_etree.fromstring(xml))

def build_letter(data, output_path, logo_path=None):
    sig_path = _write_tmp(SIG_B64)
    try:
        doc = Document()
        sec = doc.sections[0]
        sec.page_width = Inches(8.5); sec.page_height = Inches(11)
        for attr in ("top_margin","bottom_margin","left_margin","right_margin"): setattr(sec, attr, Inches(1.0))
        sec.header_distance = Inches(0.35)
        doc.styles["Normal"].font.name = BODY_FONT; doc.styles["Normal"].font.size = BODY_SIZE
        _build_header(doc, logo_path)
        _para(doc)
        _para(doc, data.get("date",""), WD_ALIGN_PARAGRAPH.LEFT)
        _para(doc)
        delivery = data.get("delivery_method","")
        if delivery: _para(doc, delivery, WD_ALIGN_PARAGRAPH.LEFT, bold=True)
        for line in [data.get("recipient_name",""), data.get("recipient_title",""),
                     data.get("recipient_org",""), *data.get("recipient_address",[])]:
            if line: _para(doc, line, WD_ALIGN_PARAGRAPH.LEFT)
        _para(doc)
        re_text = data.get("re_line","")
        if re_text:
            p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY; _set_spacing(p)
            r1 = p.add_run("Re:	"); r1.font.name = BODY_FONT; r1.font.size = BODY_SIZE
            r2 = p.add_run(re_text); r2.font.name = BODY_FONT; r2.font.size = BODY_SIZE
        _para(doc)
        _para(doc, data.get("salutation","Dear Counsel:"))
        _para(doc)
        body = data.get("body_paragraphs",[])
        for i, text in enumerate(body):
            _para(doc, text)
            if i < len(body) - 1: _para(doc)
        _para(doc)
        _para(doc, "Sincerely,")
        _add_sig_anchor(doc, sig_path)
        _para(doc)
        _para(doc, "____________________")
        _para(doc, "Chris Rider")
        _para(doc, "Senior Counsel, Litigation")
        _para(doc, data.get("entity","GoBrands, Inc."))
        doc.save(output_path)
        print(f"Letter saved: {output_path}")
    finally:
        os.unlink(sig_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--logo", default=None)
    args = parser.parse_args()
    with open(args.data) as f: data = json.load(f)
    build_letter(data, args.output, args.logo)

```

#### 4A-5: Run the script

Install dependencies if needed:
```bash
pip install python-docx --break-system-packages
```

Write the JSON to `[OUTPUTS_DIR]/[PREFIX]_letter_data.json`, then run:
```bash
python [OUTPUTS_DIR]/generate_letter.py \
  --data [OUTPUTS_DIR]/[PREFIX]_letter_data.json \
  --output [OUTPUTS_DIR]/[PREFIX]_Response_Letter.docx \
  --logo [OUTPUTS_DIR]/gopuff_logo.png
```

#### 4A-6: Upload the letter and present it

**Upload via google-drive-upload skill.** Invoke `anthropic-skills:google-drive-upload`
and supply:
- Local Windows path: `[OUTPUTS_DIR_WINDOWS]\[PREFIX]_Response_Letter.docx`
- G:\ destination: the same production folder bates-production created
  (e.g., `G:\Shared drives\Legal - Litigation 2.0\Matters\[Case]\Production\[DATE]\[PREFIX]_Response_Letter.docx`)

**Present:** Call `mcp__cowork__present_files` with the local file path so the user
can open the letter immediately.

Tell the user:
- Review all `[REVIEW]` and `[CONFIRM]` flags before sending
- If the letter still contains `[INSERT LINK HERE]`, the upload failed —
  paste the Drive folder link manually before sending

---

### Step 4B — Draft as an HTML email

#### 4B-1: Draft the response content

**Tone:** Same as Step 4A — direct, plain, brief. No boilerplate padding.

Structure:
- `body_paragraphs`: one or two short sentences before the Bates table. Reference the production
  with [INSERT LINK HERE]. Don't over-introduce.
- `bates_table`: list of documents from `bates_index.json` — each entry has `title`, `bates_range`, `pages`
- `bates_total_pages`: total page count from `bates_index.json`
- `body_paragraphs_after_table`: two sentences max — one reserving rights, one offering to answer questions.

**Production link rule:** Write `[INSERT LINK HERE]` — never individual Drive URLs.

#### 4B-2: Build the email data JSON

```json
{
  "re_line": "Smith Investigation — Document Production",
  "salutation": "Dear Paul,",
  "body_paragraphs": [
    "GoBrands, Inc. d/b/a Gopuff hereby produces documents responsive to the above-referenced investigation, Bates-stamped PREFIX000001–PREFIXNNNNNN (N pages total), available at [INSERT LINK HERE].",
    "The production consists of the following records:"
  ],
  "bates_table": [
    {"title": "Offer Letter (March 18, 2025)", "bates_range": "PREFIX000001–PREFIX000023", "pages": 23},
    {"title": "Corrective Action Form (April 19, 2025)", "bates_range": "PREFIX000024", "pages": 1}
  ],
  "bates_total_pages": 24,
  "body_paragraphs_after_table": [
    "Gopuff reserves all applicable rights and privileges, including attorney-client privilege and work product doctrine. Please feel free to reach out with any questions."
  ],
  "entity": "GoBrands, Inc. d/b/a Gopuff",
  "prefix": "PREFIX",
  "recipient_contact": "Recipient Name"
}
```

#### 4B-3: Write generate_email.py to the outputs directory

Write the following script verbatim to `[OUTPUTS_DIR]/generate_email.py`:

```python
#!/usr/bin/env python3
"""
generate_email.py — Generate a Gopuff response email as a self-contained HTML file.

Usage:
    python generate_email.py --data email_data.json --output output.html

JSON data fields:
    re_line              : "Smith Investigation — Document Production"
    salutation           : "Dear Paul,"
    body_paragraphs      : ["Para one...", "Para two..."]
                           Use [INSERT LINK HERE] where the Drive link goes.
    bates_table          : (optional) list of rows:
                           [{"title": "Offer Letter", "bates_range": "SMITH000001–SMITH000023", "pages": 23}, ...]
    bates_total_pages    : (optional) int — total pages for table footer
    entity               : (optional) "GoBrands, Inc. d/b/a Gopuff"
    prefix               : (optional) Bates prefix e.g. "SMITH" — used in footer note
    recipient_contact    : (optional) recipient name for footer note e.g. "Paul Pryce"
"""

import argparse
import json
import sys
from html import escape


CSS = """
  body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222;
         max-width: 720px; margin: 40px auto; line-height: 1.6; }
  .header { border-bottom: 3px solid #00AEEF; padding-bottom: 12px; margin-bottom: 24px;
            overflow: hidden; }
  .logo { float: left; font-size: 26px; font-weight: bold; color: #00AEEF;
          font-family: sans-serif; padding-top: 4px; }
  .contact { float: right; font-size: 11px; color: #555; text-align: right;
             line-height: 1.5; }
  .re-line { margin-bottom: 16px; }
  .body-para { margin-bottom: 16px; }
  .closing { margin-top: 32px; }
  .sig { margin-top: 16px; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; }
  th { background: #f0f0f0; text-align: left; padding: 6px 8px; border: 1px solid #ccc; font-weight: bold; }
  td { padding: 6px 8px; border: 1px solid #ccc; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .bates { font-family: monospace; white-space: nowrap; }
  .footer-note { font-size: 12px; color: #555; margin-top: 20px; }
"""

HEADER = """
<div class="header">
  <div class="contact">
    Chris Rider<br>
    Senior Counsel, Litigation<br>
    267.560.7870<br>
    chris.rider@gopuff.com
  </div>
  <div class="logo">gopuff</div>
</div>
"""

CLOSING_TMPL = """
<div class="closing">
  <div>Sincerely,</div>
  <div class="sig">
    Chris Rider<br>
    Senior Counsel, Litigation<br>
    {entity}<br>
    <a href="mailto:chris.rider@gopuff.com">chris.rider@gopuff.com</a> | 267.560.7870
  </div>
</div>
"""


def build_table(rows, total_pages):
    lines = [
        '<table>',
        '  <thead><tr><th>#</th><th>Document</th><th>Bates Range</th><th>Pages</th></tr></thead>',
        '  <tbody>',
    ]
    for i, row in enumerate(rows, 1):
        bg = ' style="background:#fafafa;"' if i % 2 == 0 else ''
        lines.append(
            f'    <tr{bg}>'
            f'<td>{i}</td>'
            f'<td>{escape(row["title"])}</td>'
            f'<td class="bates">{escape(row["bates_range"])}</td>'
            f'<td>{row["pages"]}</td>'
            f'</tr>'
        )
    lines.append('  </tbody>')
    if total_pages:
        lines.append(
            f'  <tfoot><tr>'
            f'<td colspan="2"><strong>Total</strong></td>'
            f'<td colspan="2"><strong>{total_pages} pages</strong></td>'
            f'</tr></tfoot>'
        )
    lines.append('</table>')
    return '\n'.join(lines)


def build_footer_note(data):
    prefix = data.get("prefix", "")
    contact = data.get("recipient_contact", "")
    parts = ["⚠️ Before sending:"]
    parts.append("(1) replace [INSERT LINK HERE] with the Drive shared folder link")
    if prefix:
        pdf = f"{prefix}_Bates_Production.pdf"
        note = f"(2) attach {pdf}"
        if contact:
            note += f" or confirm the link is accessible to {contact}"
        parts.append(note)
    return " ".join(parts) + "."


def generate(data):
    parts = ["<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<style>"]
    parts.append(CSS)
    parts.append("</style>\n</head>\n<body>\n")
    parts.append(HEADER)

    re_line = escape(data.get("re_line", ""))
    parts.append(f'<div class="re-line"><strong>Re:</strong> {re_line}</div>\n')

    salutation = escape(data.get("salutation", ""))
    parts.append(f'<div class="body-para">{salutation}</div>\n')

    for para in data.get("body_paragraphs", []):
        parts.append(f'<div class="body-para">{escape(para)}</div>\n')

    bates_rows = data.get("bates_table")
    if bates_rows:
        total = data.get("bates_total_pages")
        parts.append(build_table(bates_rows, total))
        parts.append("\n")

    for para in data.get("body_paragraphs_after_table", []):
        parts.append(f'<div class="body-para">{escape(para)}</div>\n')

    entity = escape(data.get("entity", "GoBrands, Inc. d/b/a Gopuff"))
    parts.append(CLOSING_TMPL.format(entity=entity))

    footer = build_footer_note(data)
    parts.append(f'\n<p class="footer-note">{footer}</p>\n')

    parts.append("\n</body>\n</html>")
    return "".join(parts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Path to JSON data file")
    parser.add_argument("--output", required=True, help="Output .html path")
    args = parser.parse_args()

    with open(args.data) as f:
        data = json.load(f)

    html = generate(data)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Email saved: {args.output}")

```

#### 4B-4: Run the script

```bash
python [OUTPUTS_DIR]/generate_email.py \
  --data [OUTPUTS_DIR]/[PREFIX]_email_data.json \
  --output [OUTPUTS_DIR]/[PREFIX]_Response_Email.html
```

#### 4B-5: Upload the email and present it

**Upload via google-drive-upload skill.** Invoke `anthropic-skills:google-drive-upload`
and supply:
- Local Windows path: `[OUTPUTS_DIR_WINDOWS]\[PREFIX]_Response_Email.html`
- G:\ destination: the same production folder bates-production created
  (e.g., `G:\Shared drives\Legal - Litigation 2.0\Matters\[Case]\Production\[DATE]\[PREFIX]_Response_Email.html`)

**Present:** Call `mcp__cowork__present_files` with the local file path so the user
can open and copy the email immediately.

Tell the user:
- Review all `[REVIEW]` and `[CONFIRM]` flags before sending
- If the email still contains `[INSERT LINK HERE]`, paste the production Drive folder
  link manually before sending

Present `[PREFIX]_Response_Email.html` via `mcp_