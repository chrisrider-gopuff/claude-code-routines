// build_snapshot.js
// Renders a Compliance Snapshot table to a landscape Word document.
//
// Usage: node build_snapshot.js <input.json> <output.docx>
//
// Input JSON schema:
// {
//   "title":    "Tennessee HB 2175 — Compliance Snapshot",
//   "subtitle": "Effective July 1, 2026 | New Part 4 to T.C.A. Title 65, Chapter 15",
//   "rows": [
//     {
//       "newRequirement":           "what the bill requires + statute citation",
//       "currentStatus":            "first-person plural description of what we do today",
//       "complianceGap":            "delta + enforcement context",
//       "risk":                     "HIGH" | "MEDIUM" | "LOW",
//       "proposedClosure":          "concrete remediation; **bold** markers become bold text",
//       "implementationCost":       "$" | "$$" | "$$$",
//       "implementationDifficulty": "Low" | "Medium" | "High"
//     }
//   ]
// }
//
// Rows are auto-sorted by descending priority score = Risk + Cost + Difficulty
// (3 = HIGH/$$$/High, 2 = MEDIUM/$$/Medium, 1 = LOW/$/Low). Ties break on
// Risk → Difficulty → Cost, all descending.

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber
} = require('docx');

// ---------- styling ----------
const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

// Color palette shared by Risk, Cost, and Difficulty cells.
const TIER_FILL = {
  3: "FCE4D6", // top tier — pale coral
  2: "FFF2CC", // mid tier — pale yellow
  1: "E2EFDA", // bottom tier — pale green
};

// Column widths (DXA). Landscape US Letter w/ 0.75" margins -> content width = 14400.
// 7 columns. Wider columns get the prose; the three rating columns are narrow.
const W_REQ  = 2400;
const W_CUR  = 2400;
const W_GAP  = 2600;
const W_RISK = 800;
const W_FIX  = 3200;
const W_COST = 800;
const W_DIFF = 1100;
const COL_WIDTHS = [W_REQ, W_CUR, W_GAP, W_RISK, W_FIX, W_COST, W_DIFF];
const TOTAL = COL_WIDTHS.reduce((a, b) => a + b, 0); // 13300 (well under 14400 — leaves margin)

// ---------- normalization & scoring ----------

function normalizeRisk(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "";
}

function riskScore(v) {
  return ({ HIGH: 3, MEDIUM: 2, LOW: 1 })[normalizeRisk(v)] || 0;
}

function normalizeCost(v) {
  const s = String(v || "").trim();
  // Allow either dollar-sign form ("$$$") or numeric ("3") or worded ("high"/"med"/"low")
  if (s === "$" || s === "$$" || s === "$$$") return s;
  const n = parseInt(s, 10);
  if (n === 1) return "$";
  if (n === 2) return "$$";
  if (n === 3) return "$$$";
  const u = s.toUpperCase();
  if (u === "LOW") return "$";
  if (u === "MEDIUM" || u === "MED") return "$$";
  if (u === "HIGH") return "$$$";
  return "";
}

function costScore(v) {
  return ({ "$": 1, "$$": 2, "$$$": 3 })[normalizeCost(v)] || 0;
}

function normalizeDifficulty(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LOW" || s === "L") return "Low";
  if (s === "MEDIUM" || s === "MED" || s === "M") return "Medium";
  if (s === "HIGH" || s === "H") return "High";
  return "";
}

function diffScore(v) {
  return ({ Low: 1, Medium: 2, High: 3 })[normalizeDifficulty(v)] || 0;
}

function priorityScore(r) {
  return riskScore(r.risk) + costScore(r.implementationCost) + diffScore(r.implementationDifficulty);
}

// Sort: priority desc; tie-break Risk desc, Difficulty desc, Cost desc; then stable on input order.
function sortRows(rows) {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const pa = priorityScore(a.r), pb = priorityScore(b.r);
      if (pa !== pb) return pb - pa;
      const ra = riskScore(a.r.risk), rb = riskScore(b.r.risk);
      if (ra !== rb) return rb - ra;
      const da = diffScore(a.r.implementationDifficulty), db = diffScore(b.r.implementationDifficulty);
      if (da !== db) return db - da;
      const ca = costScore(a.r.implementationCost), cb = costScore(b.r.implementationCost);
      if (ca !== cb) return cb - ca;
      return a.i - b.i;
    })
    .map(x => x.r);
}

// ---------- rendering ----------

// Render a string with **bold** markers and \n line breaks into TextRun children.
function richRuns(s) {
  if (s === undefined || s === null) return [new TextRun({ text: "" })];
  const lines = String(s).split(/\n/);
  const runs = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) runs.push(new TextRun({ break: 1 }));
    const re = /\*\*(.+?)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) {
        runs.push(new TextRun({ text: line.slice(last, m.index) }));
      }
      runs.push(new TextRun({ text: m[1], bold: true }));
      last = m.index + m[0].length;
    }
    if (last < line.length) {
      runs.push(new TextRun({ text: line.slice(last) }));
    }
  });
  return runs.length ? runs : [new TextRun({ text: "" })];
}

// Header cell (dark navy, white text)
const HCell = (text, widthDxa) => new TableCell({
  borders: cellBorders,
  width: { size: widthDxa, type: WidthType.DXA },
  margins: cellMargins,
  shading: { fill: "1F2A44", type: ShadingType.CLEAR },
  children: [new Paragraph({
    spacing: { after: 0 },
    children: [new TextRun({ text, bold: true, color: "FFFFFF" })]
  })]
});

// Body cell. text may contain **bold** and \n line breaks. Optional fill for color coding.
// `align` lets us center the rating cells.
const Cell = (text, widthDxa, fill, align) => new TableCell({
  borders: cellBorders,
  width: { size: widthDxa, type: WidthType.DXA },
  margins: cellMargins,
  ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
  children: [new Paragraph({
    spacing: { after: 0 },
    alignment: align || AlignmentType.LEFT,
    children: richRuns(text)
  })]
});

function build(input) {
  const title    = input.title    || "Compliance Snapshot";
  const subtitle = input.subtitle || "";
  const rawRows  = Array.isArray(input.rows) ? input.rows : [];
  const rows     = sortRows(rawRows);

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        HCell("New Requirement",          W_REQ),
        HCell("Current Status",           W_CUR),
        HCell("Compliance Gap",           W_GAP),
        HCell("Risk",                     W_RISK),
        HCell("Proposed Gap Closure",     W_FIX),
        HCell("Impl. Cost",               W_COST),
        HCell("Impl. Difficulty",         W_DIFF),
      ]
    }),
    ...rows.map(r => {
      const risk = normalizeRisk(r.risk);
      const cost = normalizeCost(r.implementationCost);
      const diff = normalizeDifficulty(r.implementationDifficulty);
      const riskFill = TIER_FILL[riskScore(r.risk)];
      const costFill = TIER_FILL[costScore(r.implementationCost)];
      const diffFill = TIER_FILL[diffScore(r.implementationDifficulty)];
      return new TableRow({ children: [
        Cell(r.newRequirement,   W_REQ),
        Cell(r.currentStatus,    W_CUR),
        Cell(r.complianceGap,    W_GAP),
        Cell(risk,               W_RISK, riskFill, AlignmentType.CENTER),
        Cell(r.proposedClosure,  W_FIX),
        Cell(cost,               W_COST, costFill, AlignmentType.CENTER),
        Cell(diff,               W_DIFF, diffFill, AlignmentType.CENTER),
      ]});
    })
  ];

  const docChildren = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: title, bold: true })]
    }),
  ];
  if (subtitle) {
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: subtitle, italics: true, size: 20 })]
    }));
  }
  docChildren.push(new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    rows: tableRows
  }));

  return new Document({
    creator: "In-house Legal",
    title: title,
    description: "Privileged & confidential bill review",
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 32, bold: true, font: "Calibri", color: "1F2A44" },
          paragraph: { spacing: { before: 80, after: 60 }, alignment: AlignmentType.CENTER } },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
        }
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "Privileged & Confidential — Attorney Work Product",
            italics: true, size: 18, color: "808080"
          })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 18, color: "808080" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })
          ]
        })] })
      },
      children: docChildren
    }]
  });
}

// ---------- main ----------
function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error("Usage: node build_snapshot.js <input.json> <output.docx>");
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const doc = build(input);
  Packer.toBuffer(doc).then(buf => {
    fs.writeFileSync(outPath, buf);
    console.log("Wrote: " + outPath + " (" + buf.length + " bytes)");
  });
}

if (require.main === module) main();
module.exports = { build, sortRows, priorityScore };
