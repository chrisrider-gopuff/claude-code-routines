#!/usr/bin/env python3
"""
bates_stamp.py — Gopuff litigation Bates-stamping engine

Usage:
    python bates_stamp.py --manifest manifest.json --output <output_dir> [--start 1]

Reads manifest.json, Bates-stamps all documents, and writes:
  - <PREFIX>_Bates_Production.pdf   (combined, stamped PDF)
  - bates_index.json                (per-document start/end Bates numbers + metadata)
  - contents_list.txt               (human-readable table for display/docx)

manifest.json format:
{
  "prefix": "KAYE",
  "case_name": "Kaye v. GoBrands, Inc.",
  "base_dir": "/path/to/downloaded/files",   // optional — defaults to manifest's directory
  "entries": [
    { "title": "Offer Letter",          "filename": "offer_letter.pdf",  "native": false },
    { "title": "Policy Acknowledgment", "filename": "policy_ack.xlsx",   "native": true  },
    { "title": "CCTV Footage",          "filename": "cctv.mp4",          "native": true  }
  ]
}
"""

import argparse
import io
import json
import os
import sys
from pathlib import Path

# ── Dependency checks ──────────────────────────────────────────────────────────

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    try:
        from PyPDF2 import PdfReader, PdfWriter
    except ImportError:
        sys.exit("ERROR: pypdf not installed. Run: pip install pypdf --break-system-packages")

try:
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import inch
    from reportlab.pdfbase.pdfmetrics import stringWidth
except ImportError:
    sys.exit("ERROR: reportlab not installed. Run: pip install reportlab --break-system-packages")

try:
    from PIL import Image
except ImportError:
    sys.exit("ERROR: Pillow not installed. Run: pip install Pillow --break-system-packages")

# ── Constants ──────────────────────────────────────────────────────────────────

GOPUFF_NAVY = HexColor("#0A1F44")
GOPUFF_RED  = HexColor("#E63329")
WHITE       = HexColor("#FFFFFF")
GRAY_LIGHT  = HexColor("#AABBCC")
WATERMARK   = HexColor("#1A3060")

NATIVE_EXTENSIONS = {
    ".xlsx", ".xls", ".xlsm", ".xlsb",
    ".docx", ".doc", ".docm",
    ".pptx", ".ppt", ".pptm",
    ".mp4", ".mov", ".avi", ".wmv", ".mkv",
    ".msg", ".eml",
    ".zip", ".rar",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".tiff", ".tif", ".bmp", ".webp"}

# ── Helpers ────────────────────────────────────────────────────────────────────

def bates(prefix: str, n: int) -> str:
    return f"{prefix}{n:06d}"


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    """Word-wrap text to fit within max_width using reportlab string metrics."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = (current + " " + word).strip()
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [text]


# ── Cover sheet (for native / non-PDF files) ──────────────────────────────────

def make_cover_sheet(title: str, bates_str: str, doc_type: str = "") -> bytes:
    """
    Returns bytes of a single-page PDF with Gopuff navy/red styling.
    Used for native files and as a fallback for errored files.
    """
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    # Navy background
    c.setFillColor(GOPUFF_NAVY)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Red accent bar — top
    c.setFillColor(GOPUFF_RED)
    c.rect(0, h - 0.45 * inch, w, 0.45 * inch, fill=1, stroke=0)

    # Red accent bar — bottom (contains Bates number)
    c.rect(0, 0, w, 0.45 * inch, fill=1, stroke=0)

    # Bates number in bottom bar
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(0.4 * inch, 0.15 * inch, bates_str)

    # Document title (centered, white, wraps if long)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 20)
    title_lines = wrap_text(title, "Helvetica-Bold", 20, w - 1.2 * inch)
    # Center the block vertically
    line_h = 0.35 * inch
    block_h = len(title_lines) * line_h
    y_start = h / 2 + block_h / 2 - line_h * 0.3
    for line in title_lines:
        c.drawCentredString(w / 2, y_start, line)
        y_start -= line_h

    # Doc type label
    if doc_type:
        c.setFont("Helvetica", 12)
        c.setFillColor(GRAY_LIGHT)
        label = f"[{doc_type.upper()} — Produced as Native File]"
        y_label = h / 2 - block_h / 2 - 0.55 * inch
        c.drawCentredString(w / 2, y_label, label)

    # Watermark text at very bottom (above red bar)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(WATERMARK)
    c.drawCentredString(w / 2, 0.55 * inch, "GOPUFF CONFIDENTIAL — FOR LITIGATION USE ONLY")

    c.save()
    buf.seek(0)
    return buf.read()


# ── Image → PDF conversion ────────────────────────────────────────────────────

def image_to_pdf(image_path: str) -> bytes:
    """Convert an image file to a single-page PDF (letter size, image fills page)."""
    img = Image.open(image_path).convert("RGB")
    # Scale to fit within letter, preserving aspect ratio
    pw, ph = letter  # points
    iw, ih = img.size
    scale = min(pw / iw, ph / ih) * 0.95  # 5% margin
    new_w = int(iw * scale * 0.75)  # convert pt to px (approx 72dpi)
    new_h = int(ih * scale * 0.75)
    img = img.resize((max(new_w, 1), max(new_h, 1)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=150)
    buf.seek(0)
    return buf.read()


# ── Bates stamping ─────────────────────────────────────────────────────────────

def stamp_pdf_bytes(pdf_bytes: bytes, bates_start: int, prefix: str) -> tuple[bytes, int]:
    """
    Stamp each page of pdf_bytes with sequential Bates numbers (bottom-right).
    Returns (stamped_pdf_bytes, next_bates_n).
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    n = bates_start

    for page in reader.pages:
        # Build a transparent overlay with just the Bates stamp
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)

        overlay_buf = io.BytesIO()
        c = rl_canvas.Canvas(overlay_buf, pagesize=(w, h))
        bates_str = bates(prefix, n)
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(HexColor("#000000"))
        margin = 18  # points
        c.drawRightString(w - margin, margin, bates_str)
        c.save()
        overlay_buf.seek(0)

        overlay_reader = PdfReader(overlay_buf)
        page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)
        n += 1

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return out.read(), n


# ── Per-entry processing ───────────────────────────────────────────────────────

def process_entry(entry: dict, prefix: str, bates_n: int, base_dir: str) -> tuple[bytes, int]:
    """
    Process one manifest entry. Returns (stamped_pdf_bytes, next_bates_n).
    """
    title    = entry.get("title", "Untitled Document")
    filename = entry.get("filename", "")
    is_native = entry.get("native", False)
    has_error = entry.get("error", False)

    filepath = os.path.join(base_dir, filename) if filename else None
    ext = Path(filename).suffix.lower() if filename else ""
    doc_type = ext.lstrip(".").upper() if ext else "FILE"

    # Error placeholder
    if has_error:
        cover = make_cover_sheet(f"{title} [DOWNLOAD ERROR]", bates(prefix, bates_n), doc_type)
        return stamp_pdf_bytes(cover, bates_n, prefix)

    # Native file → cover sheet
    if is_native or ext in NATIVE_EXTENSIONS:
        cover = make_cover_sheet(title, bates(prefix, bates_n), doc_type)
        return stamp_pdf_bytes(cover, bates_n, prefix)

    # Image file → convert to PDF, then stamp
    if ext in IMAGE_EXTENSIONS:
        if filepath and os.path.exists(filepath):
            try:
                pdf_bytes = image_to_pdf(filepath)
                return stamp_pdf_bytes(pdf_bytes, bates_n, prefix)
            except Exception as e:
                print(f"    ⚠ Image conversion failed for {filename}: {e} — using cover sheet")
        cover = make_cover_sheet(title, bates(prefix, bates_n), "IMAGE")
        return stamp_pdf_bytes(cover, bates_n, prefix)

    # PDF file → stamp directly
    if filepath and os.path.exists(filepath):
        try:
            with open(filepath, "rb") as f:
                pdf_bytes = f.read()
            return stamp_pdf_bytes(pdf_bytes, bates_n, prefix)
        except Exception as e:
            print(f"    ⚠ Could not stamp {filename}: {e} — using cover sheet")
            cover = make_cover_sheet(f"{title} [ERROR]", bates(prefix, bates_n), "PDF")
            return stamp_pdf_bytes(cover, bates_n, prefix)

    # File not found → cover sheet placeholder
    print(f"    ⚠ File not found: {filename} — inserting placeholder cover sheet")
    cover = make_cover_sheet(f"{title} [FILE NOT FOUND]", bates(prefix, bates_n), doc_type or "FILE")
    return stamp_pdf_bytes(cover, bates_n, prefix)


# ── Contents list text output ─────────────────────────────────────────────────

def build_contents_list(prefix: str, case_name: str, date_str: str, entries: list[dict]) -> str:
    """Build a plain-text contents list suitable for copy/paste and .docx conversion."""
    total_pages = sum(e["pages"] for e in entries)
    range_start = entries[0]["bates_start"] if entries else f"{prefix}000001"
    range_end   = entries[-1]["bates_end"]   if entries else f"{prefix}000001"

    lines = [
        "BATES PRODUCTION CONTENTS LIST",
        case_name,
        f"Production Date: {date_str}",
        f"Bates Range: {range_start}–{range_end} ({total_pages} pages total)",
        "",
        f"{'#':<4} {'Document':<42} {'Bates Range':<28} {'Pages':>5}",
        "─" * 82,
    ]

    for i, entry in enumerate(entries, start=1):
        title = entry["title"]
        if entry.get("native"):
            title += " [NATIVE]"
        bates_range = f"{entry['bates_start']}–{entry['bates_end']}"
        lines.append(f"{i:<4} {title:<42} {bates_range:<28} {entry['pages']:>5}")

    lines += [
        "─" * 82,
        f"Total Documents: {len(entries)} | Total Pages: {total_pages}",
    ]
    return "\n".join(lines)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Gopuff Bates-stamping engine")
    parser.add_argument("--manifest", required=True, help="Path to manifest.json")
    parser.add_argument("--output",   required=True, help="Output directory")
    parser.add_argument("--start",    type=int, default=1, help="Starting Bates number (default: 1)")
    args = parser.parse_args()

    # Load manifest
    manifest_path = os.path.abspath(args.manifest)
    with open(manifest_path) as f:
        manifest = json.load(f)

    prefix    = manifest.get("prefix", "PROD")
    case_name = manifest.get("case_name", "")
    entries   = manifest.get("entries", [])
    base_dir  = manifest.get("base_dir", os.path.dirname(manifest_path))

    os.makedirs(args.output, exist_ok=True)

    print(f"\nBates Production — {prefix}")
    print(f"Case: {case_name}")
    print(f"Documents: {len(entries)}")
    print(f"Starting at: {bates(prefix, args.start)}")
    print(f"Base dir: {base_dir}\n")

    # Process each entry
    bates_index_entries = []
    all_pages_from_readers = []
    n = args.start

    for i, entry in enumerate(entries):
        title     = entry.get("title", f"Document {i+1}")
        start_n   = n
        is_native = entry.get("native", False) or Path(entry.get("filename","")).suffix.lower() in NATIVE_EXTENSIONS

        print(f"  [{i+1}/{len(entries)}] {title} ...", end=" ", flush=True)

        stamped_bytes, n = process_entry(entry, prefix, n, base_dir)
        end_n  = n - 1
        pages  = end_n - start_n + 1

        print(f"{bates(prefix, start_n)}–{bates(prefix, end_n)} ({pages}p)")

        bates_index_entries.append({
            "title":       title,
            "filename":    entry.get("filename", ""),
            "native":      is_native,
            "bates_start": bates(prefix, start_n),
            "bates_end":   bates(prefix, end_n),
            "pages":       pages,
        })

        # Accumulate pages for the combined PDF
        reader = PdfReader(io.BytesIO(stamped_bytes))
        all_pages_from_readers.extend(reader.pages)

    # Write combined PDF
    writer = PdfWriter()
    for page in all_pages_from_readers:
        writer.add_page(page)

    from datetime import date as _date
    _today = _date.today()
    _date_tag = f"{_today.month}.{_today.day}.{str(_today.year)[2:]}"
    _prefix_title = prefix.capitalize()
    output_pdf = os.path.join(args.output, f"{_date_tag} {_prefix_title} Production.pdf")
    with open(output_pdf, "wb") as f:
        writer.write(f)

    total_pages = sum(e["pages"] for e in bates_index_entries)

    # Write bates_index.json
    index_data = {
        "prefix":      prefix,
        "case_name":   case_name,
        "range_start": bates(prefix, args.start),
        "range_end":   bates(prefix, n - 1),
        "total_pages": total_pages,
        "entries":     bates_index_entries,
    }
    index_path = os.path.join(args.output, "bates_index.json")
    with open(index_path, "w") as f:
        json.dump(index_data, f, indent=2)

    # Write contents_list.txt
    date_str = _today.strftime("%-m/%-d/%Y") if sys.platform != "win32" else _today.strftime("%#m/%#d/%Y")
    contents_text = build_contents_list(prefix, case_name, date_str, bates_index_entries)
    contents_path = os.path.join(args.output, "contents_list.txt")
    with open(contents_path, "w") as f:
        f.write(contents_text)

    # Summary
    print(f"\n✓ Production complete: {bates(prefix, args.start)}–{bates(prefix, n - 1)}")
    print(f"  Total pages:  {total_pages}")
    print(f"  PDF:          {output_pdf}")
    print(f"  Index:        {index_path}")
    print(f"  Contents:     {contents_path}")
    print()
    print(contents_text)


if __name__ == "__main__":
    main()
