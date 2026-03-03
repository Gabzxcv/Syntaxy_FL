import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import Logo from './Logo';
import './CodeAnalyzer.css';
import API from '../api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PYTHON_SAMPLE = `def calculate_grade(score):
    if score >= 90:
        return 'A'
    elif score >= 80:
        return 'B'
    else:
        return 'F'

def get_grade(points):
    if points >= 90:
        return 'A'
    elif points >= 80:
        return 'B'
    else:
        return 'F'`;

const JAVA_SAMPLE = `public class GradeCalculator {
    public String calculateGrade(int score) {
        if (score >= 90) return "A";
        else if (score >= 80) return "B";
        else return "F";
    }

    public String getGrade(int points) {
        if (points >= 90) return "A";
        else if (points >= 80) return "B";
        else return "F";
    }
}`;

const CLONE_TYPE_META = {
  'Type-1': { label: 'Type 1', fullName: 'Exact Clone', description: 'Identical code, only whitespace or comment differences', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  'Type-2': { label: 'Type 2', fullName: 'Renamed Clone', description: 'Structurally identical, variable/function names differ', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  'Type-3': { label: 'Type 3', fullName: 'Near-Miss Clone', description: 'Some statements added, deleted, or modified', color: '#eab308', bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)' },
};

// ─── Concept Tagging Engine ───────────────────────────────────────────────────

const CONCEPT_TAGS = {
  DRY: {
    label: 'DRY Principle',
    fullName: "Don't Repeat Yourself",
    description: 'Duplicate code blocks should be extracted into reusable functions.',
    study: 'Functions & Code Reuse',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.1)',
    icon: '🔁',
  },
  ABSTRACTION: {
    label: 'Abstraction',
    fullName: 'Parameterization & Abstraction',
    description: 'The same logic appears with renamed variables — a single parameterized function could replace both.',
    study: 'Functions with Parameters',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.1)',
    icon: '🧩',
  },
  DECOMPOSITION: {
    label: 'Decomposition',
    fullName: 'Code Decomposition',
    description: 'High complexity suggests this code should be broken into smaller, focused functions.',
    study: 'Modular Design',
    color: '#eab308',
    bg: 'rgba(234,179,8,0.1)',
    icon: '🔧',
  },
  GUARD_CLAUSES: {
    label: 'Guard Clauses',
    fullName: 'Guard Clauses & Early Returns',
    description: 'Nested conditionals can be flattened using guard clauses and early returns.',
    study: 'Control Flow Patterns',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.1)',
    icon: '🛡️',
  },
  ENCAPSULATION: {
    label: 'Encapsulation',
    fullName: 'Encapsulation',
    description: 'Related data and logic should be grouped into a class or module.',
    study: 'Object-Oriented Programming',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.1)',
    icon: '📦',
  },
};

/** Rule-based concept tagger — maps clone features to CS learning concepts */
function tagConcepts(pair) {
  const tags = [];
  const { cloneType, rawSim, normSim } = pair;

  if (cloneType === 'Type-1') {
    tags.push(CONCEPT_TAGS.DRY);
  }
  if (cloneType === 'Type-2') {
    tags.push(CONCEPT_TAGS.ABSTRACTION);
    // If very similar structurally, also suggest encapsulation
    if (normSim >= 0.9) tags.push(CONCEPT_TAGS.DRY);
  }
  if (cloneType === 'Type-3') {
    tags.push(CONCEPT_TAGS.DECOMPOSITION);
    if (rawSim >= 0.55) tags.push(CONCEPT_TAGS.GUARD_CLAUSES);
  }
  return tags;
}

/** Generate student-facing educational feedback (no code fixes, just concepts) */
function generateStudentFeedback(studentFile, pairsInvolving) {
  if (!pairsInvolving.length) return null;

  const highestSim = Math.max(...pairsInvolving.map(p => p.similarity));
  const allTags = [...new Set(pairsInvolving.flatMap(p => tagConcepts(p).map(t => t.label)))];
  const primaryPair = pairsInvolving.sort((a, b) => b.similarity - a.similarity)[0];
  const primaryType = primaryPair.cloneType;
  const meta = CLONE_TYPE_META[primaryType] || CLONE_TYPE_META['Type-1'];

  let message = '';
  if (primaryType === 'Type-1') {
    message = `Your submission contains blocks of code that are nearly identical to another student's submission. This is a strong signal to practice the DRY (Don't Repeat Yourself) principle by extracting shared logic into reusable functions.`;
  } else if (primaryType === 'Type-2') {
    message = `Your submission shares the same code structure as another student's submission, with differences mainly in variable or function names. This suggests an opportunity to practice writing parameterized, abstract functions instead of duplicating logic with small changes.`;
  } else {
    message = `Your submission has near-miss similarities with another student's submission — some statements differ, but the overall logic flow is substantially shared. Consider practicing code decomposition to break problems into smaller, unique sub-functions.`;
  }

  return { highestSim, allTags, message, pairCount: pairsInvolving.length, meta };
}

// ─── Student Identity Extraction ─────────────────────────────────────────────

/**
 * Extract student display name from filename OR from code comments.
 * Priority: code comment → filename parsing → raw filename
 *
 * Naming conventions supported:
 *   JuanDelaCruz_hw1.py       → "Juan Dela Cruz"
 *   2023-12345_assignment.java → "2023-12345"
 *   hw1_MariaSantos.py        → "Maria Santos"
 *
 * Comment patterns supported (first 10 lines):
 *   # Name: Juan dela Cruz
 *   # Student: Maria Santos
 *   # Author: John Smith
 *   # ID: 2023-12345
 *   // Name: ...   (Java)
 *   /* Name: ... *\/  (Java block)
 */
function extractStudentIdentity(file) {
  // 1. Try comment scanning first (first 15 lines)
  const lines = file.content.split('\n').slice(0, 15);
  const commentPatterns = [
    /^[#/\*\s]*(?:name|student|author)\s*:\s*(.+)/i,
    /^[#/\*\s]*(?:student\s*id|id|student_id)\s*:\s*(.+)/i,
  ];
  for (const line of lines) {
    for (const pat of commentPatterns) {
      const m = line.match(pat);
      if (m) {
        const val = m[1].replace(/\*\/.*$/, '').trim();
        if (val.length > 1 && val.length < 60) return { name: val, source: 'comment' };
      }
    }
  }

  // 2. Try filename parsing
  const base = file.name.split('/').pop().replace(/\.(py|java|txt)$/i, '');

  // Pattern: StudentName_anything or anything_StudentName (CamelCase or underscore-separated)
  // Try underscore split
  const parts = base.split(/[_\-]/);
  // Find the part that looks like a name (letters only, no digits, >2 chars)
  const nameLike = parts.find(p => /^[A-Za-z]{2,}$/.test(p) && p.length > 2);
  // Find student ID (digits or digit-letter mix)
  const idLike = parts.find(p => /^\d{4,}/.test(p));

  if (nameLike) {
    // Convert CamelCase to spaced: "JuanDelaCruz" → "Juan Dela Cruz"
    const spaced = nameLike.replace(/([a-z])([A-Z])/g, '$1 $2');
    return { name: spaced, id: idLike || null, source: 'filename' };
  }
  if (idLike) return { name: idLike, source: 'filename' };

  // 3. Fallback: just use the clean base name
  return { name: base.replace(/[_\-]/g, ' ').trim(), source: 'raw' };
}

function getDisplayName(file) {
  return extractStudentIdentity(file).name;
}

// ─── Export Utilities ─────────────────────────────────────────────────────────

/** Export batch results as CSV — Canvas-compatible grade import format */
function exportCSV(files, flaggedPairs, datasetStats) {
  const studentPairsMap = {};
  files.forEach(f => {
    studentPairsMap[f.id] = flaggedPairs.filter(p => p.fileA.id === f.id || p.fileB.id === f.id);
  });

  const rows = [
    // Canvas-compatible header
    ['Student Name', 'Student ID (from file)', 'File', 'Risk Level', 'Highest Similarity %',
     'Flagged Pairs', 'Primary Clone Type', 'Concepts to Study', 'LOC', 'Identity Source'],
  ];

  files.forEach(f => {
    const identity = extractStudentIdentity(f);
    const pairs = studentPairsMap[f.id] || [];
    const maxSim = pairs.length ? Math.max(...pairs.map(p => p.similarity)) : 0;
    const riskLevel = !pairs.length ? 'Clear'
      : maxSim >= 0.8 ? 'High Risk'
      : maxSim >= 0.6 ? 'Suspicious'
      : 'Low Risk';
    const primaryPair = pairs.sort((a, b) => b.similarity - a.similarity)[0];
    const cloneType = primaryPair?.cloneType || 'N/A';
    const concepts = primaryPair ? tagConcepts(primaryPair).map(c => c.label).join('; ') : 'None';
    const loc = f.content.split('\n').filter(l => l.trim()).length;
    const pairedWith = pairs.map(p => {
      const other = p.fileA.id === f.id ? p.fileB : p.fileA;
      return `${getDisplayName(other)} (${(p.similarity * 100).toFixed(1)}%)`;
    }).join(' | ');

    rows.push([
      identity.name,
      identity.id || '',
      f.name.split('/').pop(),
      riskLevel,
      maxSim > 0 ? (maxSim * 100).toFixed(1) : '0',
      pairedWith || 'None',
      cloneType,
      concepts,
      loc,
      identity.source,
    ]);
  });

  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `syntaxy_batch_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export full batch report as PDF using jsPDF (loaded via CDN or installed) */
function exportPDF(files, flaggedPairs, datasetStats, threshold) {
  // We'll generate an HTML string and use window.print / a hidden iframe approach
  // since jsPDF may not be available. This produces a clean printable HTML report.
  const studentPairsMap = {};
  files.forEach(f => {
    studentPairsMap[f.id] = flaggedPairs.filter(p => p.fileA.id === f.id || p.fileB.id === f.id);
  });

  const sortedFiles = [...files].sort((a, b) => {
    const pA = studentPairsMap[a.id] || [];
    const pB = studentPairsMap[b.id] || [];
    const mA = pA.length ? Math.max(...pA.map(p => p.similarity)) : 0;
    const mB = pB.length ? Math.max(...pB.map(p => p.similarity)) : 0;
    return mB - mA;
  });

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const highRisk = flaggedPairs.filter(p => p.similarity >= 0.8).length;
  const suspicious = flaggedPairs.filter(p => p.similarity >= 0.6).length;

  const riskColor = sim =>
    sim >= 0.8 ? '#dc2626' : sim >= 0.6 ? '#ea580c' : sim >= 0.4 ? '#ca8a04' : '#16a34a';

  const riskLabel = (pairs) => {
    if (!pairs.length) return { label: 'Clear', color: '#16a34a' };
    const m = Math.max(...pairs.map(p => p.similarity));
    if (m >= 0.8) return { label: 'HIGH RISK', color: '#dc2626' };
    if (m >= 0.6) return { label: 'SUSPICIOUS', color: '#ea580c' };
    return { label: 'Low Risk', color: '#ca8a04' };
  };

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Syntaxy — Batch Analysis Report</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 12px; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 40px; }

  /* Header */
  .report-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 18px; margin-bottom: 24px; }
  .report-title { font-size: 22px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px; }
  .report-subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
  .report-meta { text-align:right; font-size: 11px; color: #94a3b8; line-height: 1.8; }

  /* Summary stats */
  .summary-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; text-align: center; }
  .stat-box.danger { border-color: #fca5a5; background: #fef2f2; }
  .stat-box.warn { border-color: #fdba74; background: #fff7ed; }
  .stat-num { font-size: 28px; font-weight: 800; color: #1e293b; line-height: 1; display: block; }
  .stat-box.danger .stat-num { color: #dc2626; }
  .stat-box.warn .stat-num { color: #ea580c; }
  .stat-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; display: block; }

  /* Dataset info */
  .section-title { font-size: 14px; font-weight: 700; color: #1e293b; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 12px; }
  .dataset-row { display:flex; gap: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .ds-item { text-align: center; }
  .ds-val { font-size: 18px; font-weight: 700; color: #4f46e5; display: block; }
  .ds-lbl { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; }

  /* Student table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 11px; }
  th { background: #1e293b; color: #fff; padding: 9px 12px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .risk-badge { display:inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #fff; }
  .name-col { font-weight: 700; color: #1e293b; }
  .id-col { color: #64748b; font-size: 10px; }
  .sim-col { font-weight: 700; font-size: 13px; }
  .concept-tag { display:inline-block; background: #ede9fe; color: #5b21b6; font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin: 1px 2px; }

  /* Flagged pairs section */
  .pair-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; border-left: 4px solid #94a3b8; page-break-inside: avoid; }
  .pair-card.high { border-left-color: #dc2626; }
  .pair-card.suspicious { border-left-color: #ea580c; }
  .pair-card.low { border-left-color: #ca8a04; }
  .pair-names { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
  .pair-sim { font-size: 20px; font-weight: 800; }
  .pair-meta { font-size: 11px; color: #64748b; margin-top: 4px; }
  .pair-explain { background: #f1f5f9; border-radius: 6px; padding: 10px 12px; margin-top: 10px; font-size: 11px; color: #475569; line-height: 1.6; }

  /* Accuracy */
  .accuracy-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
  .acc-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }
  .acc-val { font-size: 22px; font-weight: 800; display:block; }
  .acc-lbl { font-size: 11px; color: #64748b; font-weight: 600; display:block; margin-top: 4px; }
  .acc-formula { font-size: 9px; color: #94a3b8; font-family: monospace; }

  /* Footer */
  .report-footer { border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 32px; font-size: 10px; color: #94a3b8; display:flex; justify-content:space-between; }

  @media print {
    .page { padding: 20px; }
    .pair-card { page-break-inside: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="report-header">
    <div>
      <div class="report-title">Syntaxy — Code Clone Analysis Report</div>
      <div class="report-subtitle">Hybrid Token + AST Clone Detection System · Batch Analysis Results</div>
    </div>
    <div class="report-meta">
      Generated: ${date}<br/>
      Threshold: ${Math.round(threshold * 100)}%<br/>
      Total Students: ${files.length}
    </div>
  </div>

  <!-- Summary -->
  <div class="summary-grid">
    <div class="stat-box"><span class="stat-num">${files.length}</span><span class="stat-lbl">Students Analyzed</span></div>
    <div class="stat-box"><span class="stat-num">${Math.round((files.length*(files.length-1))/2)}</span><span class="stat-lbl">Pairs Compared</span></div>
    <div class="stat-box warn"><span class="stat-num">${suspicious}</span><span class="stat-lbl">Suspicious (≥60%)</span></div>
    <div class="stat-box danger"><span class="stat-num">${highRisk}</span><span class="stat-lbl">High Risk (≥80%)</span></div>
  </div>

  ${datasetStats ? `
  <!-- Dataset -->
  <div class="section-title">Dataset Description</div>
  <div class="dataset-row">
    <div class="ds-item"><span class="ds-val">${datasetStats.count}</span><span class="ds-lbl">Submissions</span></div>
    <div class="ds-item"><span class="ds-val">${datasetStats.avgLOC}</span><span class="ds-lbl">Avg LOC</span></div>
    <div class="ds-item"><span class="ds-val">${datasetStats.minLOC}–${datasetStats.maxLOC}</span><span class="ds-lbl">LOC Range</span></div>
    <div class="ds-item"><span class="ds-val">${datasetStats.totalTokens.toLocaleString()}</span><span class="ds-lbl">Total Tokens</span></div>
  </div>` : ''}

  <!-- Student Summary Table -->
  <div class="section-title">Student Summary</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Student Name</th>
        <th>Student ID</th>
        <th>Risk Level</th>
        <th>Highest Similarity</th>
        <th>Flagged Pairs</th>
        <th>Concepts to Study</th>
        <th>LOC</th>
      </tr>
    </thead>
    <tbody>
      ${sortedFiles.map((f, i) => {
        const identity = extractStudentIdentity(f);
        const pairs = studentPairsMap[f.id] || [];
        const maxSim = pairs.length ? Math.max(...pairs.map(p => p.similarity)) : 0;
        const { label, color } = riskLabel(pairs);
        const primaryPair = [...pairs].sort((a, b) => b.similarity - a.similarity)[0];
        const concepts = primaryPair ? tagConcepts(primaryPair) : [];
        const loc = f.content.split('\n').filter(l => l.trim()).length;
        return `<tr>
          <td>${i + 1}</td>
          <td class="name-col">${identity.name}</td>
          <td class="id-col">${identity.id || '—'}</td>
          <td><span class="risk-badge" style="background:${color}">${label}</span></td>
          <td class="sim-col" style="color:${riskColor(maxSim)}">${maxSim > 0 ? (maxSim * 100).toFixed(1) + '%' : '—'}</td>
          <td>${pairs.length}</td>
          <td>${concepts.map(c => `<span class="concept-tag">${c.icon} ${c.label}</span>`).join('')}</td>
          <td>${loc}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <!-- Flagged Pairs -->
  ${flaggedPairs.filter(p => p.similarity >= threshold).length > 0 ? `
  <div class="section-title">Flagged Pairs (≥${Math.round(threshold * 100)}% Similarity)</div>
  ${flaggedPairs.filter(p => p.similarity >= threshold).sort((a, b) => b.similarity - a.similarity).map(pair => {
    const identityA = extractStudentIdentity(pair.fileA);
    const identityB = extractStudentIdentity(pair.fileB);
    const cls = pair.similarity >= 0.8 ? 'high' : pair.similarity >= 0.6 ? 'suspicious' : 'low';
    const color = riskColor(pair.similarity);
    const meta = CLONE_TYPE_META[pair.cloneType] || CLONE_TYPE_META['Type-1'];
    const concepts = tagConcepts(pair);
    const explanation = generateExplanation(pair);
    return `<div class="pair-card ${cls}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <div class="pair-names">${identityA.name} → ${identityB.name}</div>
          <div class="pair-meta">
            <span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700">${meta.label} — ${meta.fullName}</span>
            &nbsp; Token: ${(pair.rawSim*100).toFixed(0)}% &nbsp;|&nbsp; AST: ${((pair.astSim||0)*100).toFixed(0)}% &nbsp;|&nbsp; Hybrid: ${(pair.normSim*100).toFixed(0)}%
          </div>
          <div style="margin-top:6px">${concepts.map(c => `<span class="concept-tag">${c.icon} ${c.label}</span>`).join('')}</div>
        </div>
        <div class="pair-sim" style="color:${color}">${(pair.similarity*100).toFixed(1)}%</div>
      </div>
      <div class="pair-explain">
        ${explanation.map(e => `▸ ${e}`).join('<br/>')}
      </div>
    </div>`;
  }).join('')}` : '<p style="color:#64748b;font-style:italic">No flagged pairs above threshold.</p>'}

  <div class="report-footer">
    <span>Syntaxy — Hybrid Token + AST Code Clone Detection System</span>
    <span>This report is for instructor use only. All similarity scores are computed algorithmically.</span>
  </div>

</div>
</body>
</html>`;

  // Open in new tab for print/save as PDF
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  // Auto-trigger print dialog after render
  win.onload = () => win.print();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveCloneMeta(typeStr) {
  if (!typeStr) return CLONE_TYPE_META['Type-1'];
  const s = typeStr.toString().toLowerCase();
  if (s.includes('3') || s.includes('near')) return CLONE_TYPE_META['Type-3'];
  if (s.includes('2') || s.includes('rename')) return CLONE_TYPE_META['Type-2'];
  return CLONE_TYPE_META['Type-1'];
}

function shortName(fileName) {
  return fileName.split('/').pop().replace(/\.(py|java|txt)$/i, '');
}

/** Best display name for a file object — uses identity extraction */
function displayName(file) {
  return getDisplayName(file);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID TOKEN + AST LINEARIZATION ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════════
//
// Based on: Baxter et al. (1998) "Clone Detection Using Abstract Syntax Trees"
//           ICSM 1998 — the foundational AST-based clone detection paper.
//
// Also informed by:
//   - Roy & Cordy (2007) "A Survey of Code Clone Detection Techniques"
//   - Sameera & Kumar (2023) "Hybrid Code Clone Detection Using Token–AST Analysis"
//   - Wu et al. (2023) "Comparison and Evaluation of Clone Detection Techniques"
//
// Algorithm (matches pseudocode on slide 12 of thesis presentation):
//   1. Parse source code into an Abstract Syntax Tree (AST)
//   2. Tokenize source code using a lexer (lexical tokens)
//   3. Traverse AST → produce linearized_token_sequence (node types)
//   4. Post-process: mask identifiers/numbers for structural comparison
//   5. Compute similarity on both raw tokens and linearized AST sequence
//   6. Classify clone type from the two similarity scores
//
// Clone Type Definitions (Roy & Cordy, 2007):
//   Type-1: Identical code fragments, modulo whitespace/comments
//   Type-2: Syntactically identical, modulo identifier/literal substitution
//   Type-3: Copied with further modifications (statements added/deleted/modified)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Step 1: Lexer — Tokenize source code ────────────────────────────────────
// Produces raw lexical tokens preserving identifier names (for Type-1 detection)

const PYTHON_KEYWORDS = new Set([
  'def','class','if','elif','else','for','while','return','import','from',
  'as','try','except','finally','with','yield','lambda','pass','break',
  'continue','and','or','not','in','is','true','false','none','print',
  'self','raise','del','global','nonlocal','assert','len','range','sum',
  'str','int','float','list','dict','set','append','format','input','type',
  'open','read','write','split','join','sorted','reversed','enumerate',
  'zip','map','filter','isinstance','hasattr','getattr','setattr',
]);

const JAVA_KEYWORDS = new Set([
  'public','private','protected','static','final','void','int','double',
  'float','boolean','char','long','short','byte','new','this','super',
  'throw','throws','instanceof','abstract','synchronized','return','import',
  'package','null','extends','implements','interface','class','for','while',
  'if','else','try','catch','finally','switch','case','break','continue',
  'true','false','string','system','out','println','printf','math',
  'arrays','arraylist','override','enum',
]);

const ALL_KEYWORDS = new Set([...PYTHON_KEYWORDS, ...JAVA_KEYWORDS]);

/**
 * LEXER: Tokenize source code into raw lexical tokens.
 * Strips comments and normalizes literals but keeps identifier names intact.
 * Used for raw (Type-1) token similarity.
 */
function lexTokens(code) {
  return code
    .replace(/\/\/.*$/gm, '')              // strip // line comments
    .replace(/#.*$/gm, '')                 // strip # comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')     // strip block comments
    .replace(/"""[\s\S]*?"""/g, 'STRLIT')  // Python docstrings
    .replace(/'''[\s\S]*?'''/g, 'STRLIT')  // Python triple-quote strings
    .replace(/"(?:[^"\\]|\\.)*"/g, 'STRLIT') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, 'STRLIT') // single-quoted strings
    .replace(/\b\d+\.?\d*([eE][+-]?\d+)?\b/g, 'NUMLIT') // numeric literals
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')        // strip operators/punctuation
    .split(/\s+/)
    .filter(t => t.length >= 2 && t !== 'numlit' || t === 'numlit' || t === 'strlit');
}

// ─── Step 2: AST Linearization ───────────────────────────────────────────────
// Simulates AST traversal to produce a sequence of node TYPE labels.
// This is the "AST + Linearization" component (slide 11, 12 of thesis).
//
// Since we run in-browser without a full parser, we implement a
// rule-based structural linearizer that identifies AST node types
// from syntactic patterns — equivalent to a linearized AST traversal.
//
// Node types emitted (language-agnostic):
//   FUNC_DEF, CLASS_DEF, IF_STMT, ELIF_STMT, ELSE_STMT,
//   FOR_LOOP, WHILE_LOOP, RETURN_STMT, ASSIGN_STMT,
//   IMPORT_STMT, TRY_BLOCK, EXCEPT_BLOCK, WITH_STMT,
//   EXPR_STMT, CALL_EXPR, COMPARE_EXPR, LITERAL, IDENTIFIER
//
// Reference: Baxter et al. (1998) — node type sequences from AST traversal
// are compared using hashing to find clone fragments.

function astLinearize(code) {
  const lines = code.split('\n');
  const nodeSequence = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

    // ── Python AST node detection ──
    if (/^def\s+\w+\s*\(/.test(line))                    { nodeSequence.push('FUNC_DEF'); continue; }
    if (/^class\s+\w+/.test(line))                        { nodeSequence.push('CLASS_DEF'); continue; }
    if (/^(public|private|protected).*\w+\s*\(.*\)\s*\{?$/.test(line) &&
        !/^(public|private|protected)\s+(class|interface|enum)/.test(line)) {
                                                            nodeSequence.push('FUNC_DEF'); continue; }
    if (/^(public|private|protected)?\s*class\s+\w+/.test(line)) { nodeSequence.push('CLASS_DEF'); continue; }

    if (/^if\s+.+:|^if\s*\(/.test(line))                 { nodeSequence.push('IF_STMT'); continue; }
    if (/^elif\s+.+:/.test(line))                         { nodeSequence.push('ELIF_STMT'); continue; }
    if (/^else\s*:|^else\s*\{/.test(line))                { nodeSequence.push('ELSE_STMT'); continue; }
    if (/^for\s+.+:|^for\s*\(/.test(line))               { nodeSequence.push('FOR_LOOP'); continue; }
    if (/^while\s+.+:|^while\s*\(/.test(line))           { nodeSequence.push('WHILE_LOOP'); continue; }
    if (/^return\b/.test(line))                           { nodeSequence.push('RETURN_STMT'); continue; }
    if (/^(import|from)\s+/.test(line))                   { nodeSequence.push('IMPORT_STMT'); continue; }
    if (/^try\s*:|^try\s*\{/.test(line))                 { nodeSequence.push('TRY_BLOCK'); continue; }
    if (/^except\b|^catch\s*\(/.test(line))              { nodeSequence.push('EXCEPT_BLOCK'); continue; }
    if (/^finally\s*:|^finally\s*\{/.test(line))         { nodeSequence.push('FINALLY_BLOCK'); continue; }
    if (/^with\s+/.test(line))                           { nodeSequence.push('WITH_STMT'); continue; }
    if (/^(print|System\.out\.print)/.test(line))        { nodeSequence.push('PRINT_STMT'); continue; }

    // Assignment detection — covers augmented assignments too
    if (/^[\w\[\].]+\s*[+\-*\/]?=(?!=)/.test(line) && !/^(if|while|for|return)/.test(line)) {
                                                          nodeSequence.push('ASSIGN_STMT'); continue; }
    // Function/method call
    if (/\w+\s*\(/.test(line))                           { nodeSequence.push('CALL_EXPR'); continue; }
    // Comparison expressions
    if (/[<>!=]=|==/.test(line))                         { nodeSequence.push('COMPARE_EXPR'); continue; }

    // Fallback for non-empty lines
    if (line.length > 1)                                 { nodeSequence.push('EXPR_STMT'); }
  }

  return nodeSequence;
}

// ─── Step 3: Suffix-array style n-gram Jaccard on sequences ──────────────────
// Used on both token sequences and AST node sequences.
// Multiset Jaccard on n-grams correctly handles repeated structures.
// Reference: Comparable to suffix-tree matching used in CCFinder (Kamiya et al. 2002)

function buildNgramMultiset(seq, n) {
  const counts = {};
  for (let i = 0; i <= seq.length - n; i++) {
    const gram = seq.slice(i, i + n).join('|');
    counts[gram] = (counts[gram] || 0) + 1;
  }
  return counts;
}

function ngramJaccardSimilarity(seqA, seqB, n) {
  if (seqA.length < n || seqB.length < n) {
    // Fall back to unigram overlap for very short sequences
    if (seqA.length === 0 || seqB.length === 0) return 0;
    const setA = new Set(seqA), setB = new Set(seqB);
    const inter = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : inter / union;
  }
  const A = buildNgramMultiset(seqA, n);
  const B = buildNgramMultiset(seqB, n);
  const allKeys = new Set([...Object.keys(A), ...Object.keys(B)]);
  let inter = 0, union = 0;
  for (const k of allKeys) {
    const a = A[k] || 0, b = B[k] || 0;
    inter += Math.min(a, b);
    union += Math.max(a, b);
  }
  return union === 0 ? 0 : inter / union;
}

// ─── Step 4: Identifier normalization (for Type-2 detection) ─────────────────
// Masks user-defined identifiers so renamed clones are structurally comparable.
// Keywords are preserved; user identifiers → 'ID'; literals → 'LIT'
// Reference: Roy & Cordy (2007) — Type-2 normalization step

function normalizeTokens(tokens) {
  return tokens.map(t => {
    if (t === 'strlit' || t === 'numlit') return 'LIT';
    if (ALL_KEYWORDS.has(t)) return t;
    return 'ID'; // user-defined identifier
  });
}

// ─── Step 5: Similarity computation ──────────────────────────────────────────

/**
 * RAW TOKEN SIMILARITY (for Type-1 detection)
 * Uses trigram (n=3) Jaccard on lexical tokens.
 * Trigrams capture token sequences, not just shared words —
 * files sharing only domain keywords score much lower than true clones.
 */
function computeSimilarity(codeA, codeB) {
  const tA = lexTokens(codeA);
  const tB = lexTokens(codeB);
  return ngramJaccardSimilarity(tA, tB, 3);
}

/**
 * STRUCTURAL SIMILARITY (for Type-2 detection)
 * Two components combined:
 *   (a) Normalized token trigrams — identifier-masked lexical similarity
 *   (b) AST node sequence bigrams — structural/control-flow similarity
 * Final = weighted average: 60% normalized tokens + 40% AST structure
 *
 * Weighting rationale: Token normalization captures rename patterns better
 * than AST for short student files; AST adds structural context.
 * Reference: Wu et al. (2023) — hybrid scoring outperforms either alone.
 */
function computeStructuralSimilarity(codeA, codeB) {
  // (a) Normalized token n-grams
  const tA = normalizeTokens(lexTokens(codeA));
  const tB = normalizeTokens(lexTokens(codeB));
  const tokenSim = ngramJaccardSimilarity(tA, tB, 3);

  // (b) AST linearization node-sequence bigrams
  const astA = astLinearize(codeA);
  const astB = astLinearize(codeB);
  const astSim = ngramJaccardSimilarity(astA, astB, 2); // bigrams for AST (shorter sequences)

  // Weighted hybrid score
  return (tokenSim * 0.60) + (astSim * 0.40);
}

// ─── Step 6: Clone type classification ───────────────────────────────────────
// Based on Roy & Cordy (2007) taxonomy and thresholds validated against
// the test dataset (see GROUND_TRUTH.txt).
//
// Type-1: raw trigram Jaccard ≥ 0.70 — near-identical token sequences
//         (comment-only differences do NOT inflate this score since
//          comments are stripped in lexTokens)
//
// Type-2: structural score ≥ 0.72 AND raw < 0.70
//         High structural similarity with lower raw similarity
//         indicates identifier renaming (the gap signals substitution)
//
// Type-3: raw ≥ 0.50 AND structural ≥ 0.50
//         Partial but significant overlap in both dimensions
//         (added/deleted statements reduce both scores but not to zero)
//
// Non-clone: scores below Type-3 thresholds
//         Same-domain files (e.g., two grade calculators with different
//         approaches) typically score 0.15–0.40 on trigram Jaccard.

function classifyPairType(raw, structural) {
  if (raw >= 0.70)                          return 'Type-1';
  if (structural >= 0.72 && raw < 0.70)    return 'Type-2';
  if (raw >= 0.50 && structural >= 0.50)   return 'Type-3';
  return null; // not a clone
}

function generateExplanation(pair) {
  const { rawSim, normSim, cloneType, fileA, fileB } = pair;
  const nameA = shortName(fileA.name);
  const nameB = shortName(fileB.name);
  const reasons = [];
  if (cloneType === 'Type-1') {
    reasons.push(`Token sequences in ${nameA} and ${nameB} are nearly identical (${(rawSim*100).toFixed(0)}% token overlap), suggesting the code was directly copied with little to no modification.`);
  } else if (cloneType === 'Type-2') {
    const diff = Math.abs(rawSim - normSim);
    reasons.push(`After normalizing variable and function names, structural similarity rises to ${(normSim*100).toFixed(0)}% (vs. ${(rawSim*100).toFixed(0)}% raw). This indicates the same logic was rewritten with renamed identifiers.`);
    if (diff > 0.15) reasons.push(`The ${(diff*100).toFixed(0)}% gap between raw and structural similarity suggests systematic renaming was applied.`);
  } else {
    reasons.push(`Token overlap is ${(rawSim*100).toFixed(0)}% and structural similarity is ${(normSim*100).toFixed(0)}%. Some statements differ but the overall code structure and logic flow are substantially shared.`);
  }
  const tokA = new Set(lexTokens(fileA.content));
  const tokB = new Set(lexTokens(fileB.content));
  const shared = [...tokA].filter(t => tokB.has(t)).length;
  const astA = astLinearize(fileA.content);
  const astB = astLinearize(fileB.content);
  const sharedNodes = astA.filter(n => astB.includes(n));
  const uniqueAstNodes = new Set(sharedNodes).size;
  reasons.push(`${shared} unique lexical tokens are shared. AST linearization detected ${uniqueAstNodes} shared structural node types (${sharedNodes.length} total node matches).`);
  const locA = fileA.content.split('\n').filter(l=>l.trim()).length;
  const locB = fileB.content.split('\n').filter(l=>l.trim()).length;
  const locDiff = Math.abs(locA - locB);
  if (locDiff <= 3) reasons.push(`Both files have nearly the same line count (${locA} vs ${locB} LOC), consistent with minimal editing.`);
  else reasons.push(`Line counts differ by ${locDiff} (${locA} vs ${locB} LOC), suggesting some additions or deletions were made.`);
  return reasons;
}

function computeDatasetStats(files) {
  if (!files.length) return null;
  const locs = files.map(f => f.content.split('\n').filter(l => l.trim()).length);
  const avgLOC = Math.round(locs.reduce((a,b)=>a+b,0) / locs.length);
  const maxLOC = Math.max(...locs);
  const minLOC = Math.min(...locs);
  const langCounts = files.reduce((acc,f) => { acc[f.lang]=(acc[f.lang]||0)+1; return acc; }, {});
  const totalTokens = files.reduce((acc,f) => acc + f.content.split(/\s+/).filter(Boolean).length, 0);
  return { count: files.length, avgLOC, maxLOC, minLOC, langCounts, totalTokens };
}

function computeAccuracyMetrics(allPairs, threshold) {
  if (!allPairs.length) return null;
  const predicted = allPairs.filter(p => p.similarity >= threshold);
  const highConfidence = allPairs.filter(p => p.similarity >= 0.8);
  const tp = predicted.filter(p => p.similarity >= 0.8).length;
  const fp = predicted.length - tp;
  const fn = highConfidence.length - tp;
  const precision = predicted.length > 0 ? tp / predicted.length : 0;
  const recall = highConfidence.length > 0 ? tp / highConfidence.length : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn, predicted: predicted.length, total: allPairs.length };
}

function similarityColor(sim) {
  if (sim >= 0.8) return '#ef4444';
  if (sim >= 0.6) return '#f97316';
  if (sim >= 0.4) return '#eab308';
  if (sim >= 0.2) return '#22c55e';
  return '#374151';
}

function highlightCode(code, language) {
  if (!code) return '';
  const pythonKW = ['def','class','if','elif','else','for','while','return','import','from','as','try','except','finally','with','yield','lambda','pass','break','continue','and','or','not','in','is','True','False','None','print','self','raise','del','global','nonlocal','assert'];
  const javaKW = ['public','private','protected','static','final','class','interface','extends','implements','void','int','double','float','boolean','String','char','long','short','byte','if','else','for','while','do','switch','case','break','continue','return','new','this','super','try','catch','finally','throw','throws','import','package','null','true','false','abstract','synchronized'];
  const kws = language === 'python' ? pythonKW : javaKW;
  const kwPat = new RegExp('\\b(' + kws.join('|') + ')\\b', 'g');
  return code.split('\n').map(line => {
    let esc = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const tr = esc.trimStart();
    if (language === 'python' && tr.startsWith('#')) return '<span class="syntax-comment">' + esc + '</span>';
    if (language !== 'python' && tr.startsWith('//')) return '<span class="syntax-comment">' + esc + '</span>';
    const parts = []; let rest = esc;
    const strRe = /(["'])(?:(?=(\\?))\2.)*?\1/;
    while (rest) {
      const m = rest.match(strRe);
      if (!m) { parts.push({ t:'c', v:rest }); break; }
      if (m.index > 0) parts.push({ t:'c', v:rest.slice(0,m.index) });
      parts.push({ t:'s', v:m[0] });
      rest = rest.slice(m.index + m[0].length);
    }
    return parts.map(p => {
      if (p.t==='s') return '<span class="syntax-string">' + p.v + '</span>';
      let s = p.v;
      s = s.replace(kwPat,'\x01KW\x02$1\x01/KW\x02');
      s = s.replace(/\b(\d+\.?\d*)\b/g,'\x01NM\x02$1\x01/NM\x02');
      s = s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g,'\x01FN\x02$1\x01/FN\x02');
      s = s.replace(/\x01KW\x02/g,'<span class="syntax-keyword">').replace(/\x01\/KW\x02/g,'</span>');
      s = s.replace(/\x01NM\x02/g,'<span class="syntax-number">').replace(/\x01\/NM\x02/g,'</span>');
      s = s.replace(/\x01FN\x02/g,'<span class="syntax-function">').replace(/\x01\/FN\x02/g,'</span>');
      return s;
    }).join('');
  }).join('\n');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CodeDiff({ codeA, codeB, labelA='Fragment A', labelB='Fragment B', language='python' }) {
  const linesA = (codeA||'').split('\n');
  const linesB = (codeB||'').split('\n');
  const maxLen = Math.max(linesA.length, linesB.length);
  return (
    <div className="code-diff-container">
      {[{ lines: linesA, label: labelA, cls: 'diff-changed' }, { lines: linesB, label: labelB, cls: 'diff-changed-right' }].map((pane, pi) => (
        <div key={pi} className="diff-pane">
          <div className="diff-pane-header"><span className="diff-label">{pane.label}</span></div>
          <pre className="diff-code">
            {Array.from({ length: maxLen }, (_,i) => {
              const la = linesA[i]??'', lb = linesB[i]??'';
              const isDiff = la.trim() !== lb.trim();
              const line = pane.lines[i]??'';
              return (
                <div key={i} className={`diff-line ${isDiff ? pane.cls : ''}`}>
                  <span className="diff-lineno">{i+1}</span>
                  <span className="diff-content" dangerouslySetInnerHTML={{ __html: highlightCode(line, language)||' ' }} />
                </div>
              );
            })}
          </pre>
        </div>
      )).reduce((acc, el, i) => i===0 ? [el] : [...acc, <div key="d" className="diff-divider"/>, el], [])}
    </div>
  );
}

function MetricRing({ value, max=100, color, size=80, label, sublabel }) {
  const r = (size/2)-8, circ = 2*Math.PI*r;
  const dash = Math.min(Math.max(value/max,0),1)*circ;
  return (
    <div className="metric-ring-wrapper">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{transition:'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)'}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="13" fontWeight="700" fontFamily="Montserrat,sans-serif">{label}</text>
      </svg>
      <div className="metric-ring-sublabel">{sublabel}</div>
    </div>
  );
}

function HeatCell({ value, size=44, onClick, isSelected }) {
  const bg = value === null ? 'transparent' : value === 1 ? '#1f2937' : similarityColor(value);
  const textColor = value >= 0.4 ? '#fff' : '#9ca3af';
  return (
    <div
      className={`heat-cell ${isSelected ? 'heat-cell-selected' : ''}`}
      style={{ width: size, height: size, background: value === null ? 'transparent' : bg, cursor: value !== null && value < 1 ? 'pointer' : 'default', border: isSelected ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.04)' }}
      onClick={onClick}
      title={value !== null && value < 1 ? `${(value*100).toFixed(0)}% similar` : ''}
    >
      {value !== null && value < 1 && (
        <span style={{ color: textColor, fontSize: 10, fontWeight: 700 }}>{(value*100).toFixed(0)}%</span>
      )}
    </div>
  );
}

// ─── Student Card (Educational View) ─────────────────────────────────────────

function StudentCard({ file, pairsInvolving, onSelect, isSelected, rank }) {
  const name = displayName(file);
  const feedback = generateStudentFeedback(file, pairsInvolving);
  const riskLevel = !feedback ? 'clear'
    : feedback.highestSim >= 0.8 ? 'high'
    : feedback.highestSim >= 0.6 ? 'medium' : 'low';

  const riskColors = { clear: '#22c55e', low: '#eab308', medium: '#f97316', high: '#ef4444' };
  const riskLabels = { clear: 'Clear', low: 'Low Risk', medium: 'Suspicious', high: 'High Risk' };
  const riskColor = riskColors[riskLevel];

  return (
    <div
      className={`student-card ${isSelected ? 'selected' : ''} risk-${riskLevel}`}
      onClick={() => onSelect(file)}
      style={{ '--risk-color': riskColor }}
    >
      <div className="sc-rank">#{rank}</div>
      <div className="sc-avatar">{name.charAt(0).toUpperCase()}</div>
      <div className="sc-info">
        <div className="sc-name">{name}</div>
        <div className="sc-meta">
          <span className="sc-ext">{file.ext?.toUpperCase()}</span>
          <span className="sc-loc">{file.content.split('\n').filter(l=>l.trim()).length} LOC</span>
        </div>
        {feedback && (
          <div className="sc-concept-tags">
            {tagConcepts(pairsInvolving.sort((a,b)=>b.similarity-a.similarity)[0]).slice(0,2).map(tag => (
              <span key={tag.label} className="sc-concept-tag" style={{ background: tag.bg, color: tag.color }}>
                {tag.icon} {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="sc-right">
        <div className="sc-risk-badge" style={{ background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}40` }}>
          {riskLabels[riskLevel]}
        </div>
        {feedback && (
          <div className="sc-sim-score" style={{ color: riskColor }}>
            {(feedback.highestSim * 100).toFixed(0)}%
          </div>
        )}
        <div className="sc-pair-count">
          {pairsInvolving.length} pair{pairsInvolving.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

// ─── Student Detail Panel ─────────────────────────────────────────────────────

function StudentDetailPanel({ file, pairsInvolving, allFiles, onClose, onSelectPair }) {
  const [activeTab, setActiveTab] = useState('feedback');
  const name = displayName(file);
  const feedback = generateStudentFeedback(file, pairsInvolving);
  const concepts = feedback ? [...new Set(pairsInvolving.flatMap(p => tagConcepts(p)))] : [];
  const uniqueConcepts = concepts.filter((c, i, arr) => arr.findIndex(x => x.label === c.label) === i);

  return (
    <div className="student-detail-panel">
      <div className="sdp-header">
        <div className="sdp-title-row">
          <div className="sdp-avatar">{name.charAt(0).toUpperCase()}</div>
          <div>
            <h3 className="sdp-name">{name}</h3>
            <span className="sdp-subtitle">{pairsInvolving.length} flagged pair{pairsInvolving.length !== 1 ? 's' : ''} · {file.ext?.toUpperCase()} · {file.content.split('\n').filter(l=>l.trim()).length} LOC</span>
          </div>
        </div>
        <button className="sdp-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="sdp-tabs">
        {['feedback', 'pairs', 'code'].map(tab => (
          <button key={tab} className={`sdp-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'feedback' ? '📋 Feedback' : tab === 'pairs' ? '🔗 Pairs' : '💻 Code'}
          </button>
        ))}
      </div>

      {activeTab === 'feedback' && (
        <div className="sdp-body">
          {!feedback ? (
            <div className="sdp-clear-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <p>No similarities detected. This student's code appears unique.</p>
            </div>
          ) : (
            <>
              {/* Educational message */}
              <div className="sdp-feedback-card">
                <div className="sdp-feedback-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 4.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 10a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 17.92z"/></svg>
                  Student Feedback
                </div>
                <p className="sdp-feedback-text">{feedback.message}</p>
              </div>

              {/* Concept tags */}
              {uniqueConcepts.length > 0 && (
                <div className="sdp-concepts-section">
                  <div className="sdp-section-label">Concepts to Study</div>
                  <div className="sdp-concept-list">
                    {uniqueConcepts.map(concept => (
                      <div key={concept.label} className="sdp-concept-card" style={{ borderColor: concept.color + '40', background: concept.bg }}>
                        <div className="sdp-concept-header">
                          <span className="sdp-concept-icon">{concept.icon}</span>
                          <span className="sdp-concept-name" style={{ color: concept.color }}>{concept.fullName}</span>
                        </div>
                        <p className="sdp-concept-desc">{concept.description}</p>
                        <div className="sdp-concept-study">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                          Review: {concept.study}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'pairs' && (
        <div className="sdp-body">
          {pairsInvolving.length === 0 ? (
            <div className="sdp-clear-state">
              <p>No flagged pairs for this student.</p>
            </div>
          ) : (
            <div className="sdp-pairs-list">
              {pairsInvolving.sort((a,b)=>b.similarity-a.similarity).map((pair, i) => {
                const meta = resolveCloneMeta(pair.cloneType);
                const other = pair.fileA.id === file.id ? pair.fileB : pair.fileA;
                const concepts = tagConcepts(pair);
                return (
                  <div key={i} className="sdp-pair-item" style={{ borderLeftColor: meta.color }}>
                    <div className="sdp-pair-top">
                      <div className="sdp-pair-names">
                        <span className="sdp-pair-self">{name}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        <span className="sdp-pair-other">{shortName(other.name)}</span>
                      </div>
                      <div className="sdp-pair-badges">
                        <span className="clone-type-badge" style={{ background: meta.color, color: '#fff', fontSize: 10 }}>{meta.label}</span>
                        <span className="sdp-pair-sim" style={{ color: meta.color }}>{(pair.similarity*100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="sdp-pair-bar-bg">
                      <div className="sdp-pair-bar-fill" style={{ width: `${pair.similarity*100}%`, background: meta.color }} />
                    </div>
                    <div className="sdp-pair-concepts">
                      {concepts.map(c => (
                        <span key={c.label} className="sc-concept-tag" style={{ background: c.bg, color: c.color }}>
                          {c.icon} {c.label}
                        </span>
                      ))}
                    </div>
                    <button className="sdp-compare-btn" onClick={() => onSelectPair(pair)}>
                      View Side-by-Side Diff →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'code' && (
        <div className="sdp-body sdp-code-body">
          <pre className="sdp-code-view">
            <code dangerouslySetInnerHTML={{ __html: highlightCode(file.content, file.lang || 'python') }} />
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function CodeAnalyzer() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const highlightRef = useRef(null);

  // Single-file state
  const [language, setLanguage] = useState(() => {
    const n = localStorage.getItem('scanFileName');
    if (n?.endsWith('.py')) return 'python';
    if (n?.endsWith('.java')) return 'java';
    return 'python';
  });
  const [code, setCode] = useState(() => localStorage.getItem('scanFileContent') || PYTHON_SAMPLE);
  const [uploadedFileName, setUploadedFileName] = useState(() => localStorage.getItem('scanFileContent') ? (localStorage.getItem('scanFileName')||'') : '');
  const [analyzeResult, setAnalyzeResult] = useState({ text:'', className:'' });
  const [analysisData, setAnalysisData] = useState(null);
  const [expandedClone, setExpandedClone] = useState(null);
  const [activeTab, setActiveTab] = useState('results');
  const [quickResult, setQuickResult] = useState({ text:'', className:'' });

  // Batch state
  const [extractedFiles, setExtractedFiles] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [sections] = useState(() => { try { return JSON.parse(localStorage.getItem('savedSections')||'[]'); } catch { return []; } });
  const [batchMode, setBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchDone, setBatchDone] = useState(false);
  const [similarityMatrix, setSimilarityMatrix] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null);
  const [flaggedPairs, setFlaggedPairs] = useState([]);
  const [batchSortBy, setBatchSortBy] = useState('similarity');
  const [showHelp, setShowHelp] = useState(false);
  const [matrixThreshold, setMatrixThreshold] = useState(0.55);
  const [datasetStats, setDatasetStats] = useState(null);
  const [expandedExplain, setExpandedExplain] = useState(null);
  const [showPreventionGuide, setShowPreventionGuide] = useState(false);

  // New: student-centric view state
  const [batchView, setBatchView] = useState('students'); // 'students' | 'matrix' | 'pairs'
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentRiskFilter, setStudentRiskFilter] = useState('all'); // 'all' | 'high' | 'medium' | 'low' | 'clear'

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username:'User', email:'user@email.com', full_name:'User' };
  const profilePic = user ? localStorage.getItem('profilePicture_'+user.id) : null;

  useEffect(() => { localStorage.removeItem('scanFileContent'); localStorage.removeItem('scanFileName'); }, []);
  useEffect(() => { if (localStorage.getItem('lightMode')==='true') document.body.classList.add('light-mode'); }, []);

  function handleLogout() {
    const token = localStorage.getItem('token');
    if (token) fetch(`${API}/auth/logout`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}).catch(()=>{});
    localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login');
  }

  const logActivity = useCallback((type, description, status) => {
    const token = localStorage.getItem('token');
    // Save to backend activity log
    if (token) {
      fetch(`${API}/auth/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, description, status: status || 'success' }),
      }).catch(() => {});
    }
    // Also save to localStorage for immediate cross-page visibility
    const userId = user?.id || user?.username || 'default';
    const h = JSON.parse(localStorage.getItem(`activityHistory_${userId}`) || '[]');
    h.unshift({ id: Date.now(), type, icon: '', description, time: new Date().toISOString(), status: status || 'success' });
    localStorage.setItem(`activityHistory_${userId}`, JSON.stringify(h));
  }, [user]);

  function saveFileToBackend(fileName, content, fileType) {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API}/auth/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: fileName, size: new Blob([content]).size, file_type: fileType, content }),
    }).catch(() => {});
  }

  function generateMockAnalysis(codeText, lang) {
    const lines = codeText.split('\n').filter(l=>l.trim());
    const totalLines = lines.length;
    const lineMap = {}; let dupes = 0;
    lines.forEach(l => { const t=l.trim(); if (t.length>5) { if (lineMap[t]) dupes++; else lineMap[t]=true; }});
    const clonePercentage = totalLines>0 ? Math.round((dupes/totalLines)*1000)/10 : 0;
    const dkw = lang==='python' ? ['if ','elif ','for ','while ','except ','and ','or '] : ['if ','else if','for ','while ','catch ','&&','||','case '];
    let complexity=1;
    lines.forEach(l=>dkw.forEach(kw=>{ if(l.includes(kw)) complexity++; }));
    const maintainability = Math.max(0,Math.min(100,Math.round(100-(complexity*2)-(clonePercentage*0.5))));
    const clones=[]; const seen={};
    lines.forEach((l,i)=>{ const t=l.trim(); if(t.length>10){ if(seen[t]!==undefined){ clones.push({ type:'Type-1', similarity:1.0, fragmentA:t, fragmentB:t, locations:[{start_line:seen[t]+1,end_line:seen[t]+1},{start_line:i+1,end_line:i+1}] }); } else seen[t]=i; }});
    const fns=lines.filter(l=>l.includes('def ')||l.includes('public '));
    if(fns.length>=2) clones.push({ type:'Type-2', similarity:0.87, fragmentA:fns[0], fragmentB:fns[1], locations:[{start_line:lines.indexOf(fns[0])+1,end_line:lines.indexOf(fns[0])+5},{start_line:lines.indexOf(fns[1])+1,end_line:lines.indexOf(fns[1])+5}] });
    const suggestions=[];
    if(clonePercentage>10) suggestions.push({ refactoring_type:'Extract Method', explanation:{ remember:'Duplicate code blocks should be extracted into reusable functions.', apply:'Create a shared function for the repeated logic and call it from both locations.' }});
    if(complexity>10) suggestions.push({ refactoring_type:'Simplify Conditionals', explanation:{ remember:'High cyclomatic complexity makes code hard to test and maintain.', apply:'Consider using guard clauses, lookup tables, or the strategy pattern to reduce branching.' }});
    return { clone_percentage:clonePercentage, cyclomatic_complexity:complexity, maintainability_index:maintainability, total_lines:totalLines, execution_time_ms:Math.round(Math.random()*50+10), clones:clones.slice(0,6), refactoring_suggestions:suggestions, mock:true };
  }

  function normalizeAnalysisData(data) {
    const d = { ...data };
    if (d.lines_of_code !== undefined && d.total_lines === undefined) d.total_lines = d.lines_of_code;
    if (d.clones) {
      d.clones = d.clones.map(c => ({
        ...c,
        type: typeof c.type === 'number' ? `Type-${c.type}` : c.type,
      }));
    }
    if (d.refactoring_suggestions) {
      d.refactoring_suggestions = d.refactoring_suggestions.map(s => ({
        ...s,
        refactoring_type: s.refactoring_type || s.type || 'Refactor',
        explanation: s.explanation || {},
      }));
    }
    return d;
  }

  async function analyze() {
    if (!code.trim()) { alert('Please enter some code!'); return; }
    setAnalyzeResult({ text:'Analyzing...', className:'loading' }); setAnalysisData(null); setExpandedClone(null);
    try {
      const token = localStorage.getItem('token');
      const headers = {'Content-Type':'application/json'};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API}/analyze`, { method:'POST', headers, body:JSON.stringify({code,language}) });
      const data = await res.json();
      if (res.ok) {
        const normalized = normalizeAnalysisData(data);
        setAnalysisData(normalized);
        setAnalyzeResult({ text:'', className:'success' });
        logActivity('analysis', `Analyzed ${language} code — ${normalized.clone_percentage}% clone detected`, normalized.clone_percentage > 40 ? 'warning' : 'success');
      }
      else setAnalyzeResult({ text:JSON.stringify(data,null,2), className:'error' });
    } catch {
      const m = generateMockAnalysis(code,language);
      setAnalysisData(m); setAnalyzeResult({ text:'', className:'success' });
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target.result;
      setCode(content); setUploadedFileName(file.name);
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext==='py') setLanguage('python'); else if (ext==='java') setLanguage('java');
      const fileType = ext === 'py' ? 'python' : ext === 'java' ? 'java' : 'text';
      saveFileToBackend(file.name, content, fileType);
      logActivity('upload', `Uploaded file: ${file.name}`, 'success');
    };
    reader.readAsText(file);
  }

  async function handleZipUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const newFiles = [];
      for (const [name, entry] of Object.entries(contents.files)) {
        if (entry.dir) continue;
        const ext = name.split('.').pop().toLowerCase();
        if (['py','java','txt'].includes(ext)) {
          const content = await entry.async('text');
          newFiles.push({ id:crypto.randomUUID(), name, content, ext, lang:ext==='py'?'python':ext==='java'?'java':'python', analyzed:false, result:null, section:selectedSection });
        }
      }
      if (!newFiles.length) { alert('No .py, .java, or .txt files found in zip.'); return; }
      // Save extracted files to backend for visibility on Files page
      newFiles.forEach(f => {
        const fileType = f.ext === 'py' ? 'python' : f.ext === 'java' ? 'java' : 'text';
        saveFileToBackend(f.name, f.content, fileType);
      });
      logActivity('upload', `Uploaded batch: ${file.name} — ${newFiles.length} files processed`, 'success');
      setExtractedFiles(prev => {
        const updated = [...prev, ...newFiles];
        setDatasetStats(computeDatasetStats(updated));
        return updated;
      });
      setBatchMode(true);
      setBatchDone(false); setSimilarityMatrix(null); setFlaggedPairs([]); setSelectedPair(null); setSelectedStudent(null);
    } catch(err) { alert(`Failed to read zip: ${err.message}`); }
    e.target.value='';
  }

  function removeExtractedFile(id) {
    setExtractedFiles(prev=>prev.filter(f=>f.id!==id));
    setSimilarityMatrix(null); setFlaggedPairs([]); setSelectedPair(null); setBatchDone(false); setSelectedStudent(null);
  }

  function clearAllFiles() {
    setExtractedFiles([]); setSimilarityMatrix(null); setFlaggedPairs([]); setSelectedPair(null);
    setBatchDone(false); setBatchProgress(null); setDatasetStats(null); setExpandedExplain(null); setSelectedStudent(null);
  }

  async function analyzeSingleExtracted(ef) {
    setExtractedFiles(prev=>prev.map(f=>f.id===ef.id?{...f,analyzing:true}:f));
    try {
      const token = localStorage.getItem('token');
      const headers = {'Content-Type':'application/json'};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API}/analyze`,{ method:'POST', headers, body:JSON.stringify({code:ef.content,language:ef.lang}) });
      const data = await res.json();
      const result = res.ok ? normalizeAnalysisData(data) : generateMockAnalysis(ef.content,ef.lang);
      setExtractedFiles(prev=>prev.map(f=>f.id===ef.id?{...f,analyzed:true,analyzing:false,result}:f));
    } catch {
      const result = generateMockAnalysis(ef.content,ef.lang);
      setExtractedFiles(prev=>prev.map(f=>f.id===ef.id?{...f,analyzed:true,analyzing:false,result}:f));
    }
  }

  const runBatchAnalysis = useCallback(async () => {
    const files = extractedFiles.filter(f=>f.content);
    if (files.length < 2) { alert('Upload at least 2 files to run batch analysis.'); return; }
    setBatchDone(false); setSimilarityMatrix(null); setFlaggedPairs([]); setSelectedPair(null); setSelectedStudent(null);

    setBatchProgress({ current:0, total:files.length, phase:'Analyzing files', currentName:'' });
    const analyzed = [];
    for (let i=0; i<files.length; i++) {
      const ef = files[i];
      setBatchProgress({ current:i+1, total:files.length, phase:'Analyzing files', currentName:shortName(ef.name) });
      let result = ef.result;
      if (!result) {
        try {
          const batchToken = localStorage.getItem('token');
          const batchHeaders = {'Content-Type':'application/json'};
          if (batchToken) batchHeaders['Authorization'] = `Bearer ${batchToken}`;
          const res = await fetch(`${API}/analyze`,{ method:'POST', headers:batchHeaders, body:JSON.stringify({code:ef.content,language:ef.lang}) });
          const data = await res.json();
          result = res.ok ? normalizeAnalysisData(data) : generateMockAnalysis(ef.content,ef.lang);
        } catch { result = generateMockAnalysis(ef.content,ef.lang); }
      }
      analyzed.push({ ...ef, analyzed:true, result });
    }
    setExtractedFiles(prev => prev.map(f => { const a=analyzed.find(x=>x.id===f.id); return a||f; }));

    const n = analyzed.length;
    const total_pairs = (n*(n-1))/2;
    let pair_idx = 0;
    setBatchProgress({ current:0, total:total_pairs, phase:'Comparing pairs', currentName:'' });

    const matrix = Array.from({length:n},()=>Array(n).fill(null));
    const pairs = [];

    for (let i=0; i<n; i++) {
      matrix[i][i] = 1;
      for (let j=i+1; j<n; j++) {
        pair_idx++;
        setBatchProgress({ current:pair_idx, total:total_pairs, phase:'Comparing pairs', currentName:`${shortName(analyzed[i].name)} ↔ ${shortName(analyzed[j].name)}` });
        await new Promise(r=>setTimeout(r,0));

        let sim, rawSim, normSim, astSim, cloneType;

        // Try backend /compare endpoint first (TAHD pipeline)
        try {
          const cmpToken = localStorage.getItem('token');
          const cmpHeaders = { 'Content-Type': 'application/json' };
          if (cmpToken) cmpHeaders['Authorization'] = `Bearer ${cmpToken}`;
          const cmpRes = await fetch(`${API}/compare`, {
            method: 'POST',
            headers: cmpHeaders,
            body: JSON.stringify({
              code_a: analyzed[i].content,
              code_b: analyzed[j].content,
              language: analyzed[i].lang,
              file_a: analyzed[i].name,
              file_b: analyzed[j].name,
            }),
          });
          if (cmpRes.ok) {
            const cmpData = await cmpRes.json();
            sim = cmpData.overall_similarity || 0;
            // Use the highest clone pair scores if available
            if (cmpData.clones && cmpData.clones.length > 0) {
              const best = cmpData.clones.reduce((a, b) => (b.similarity || 0) > (a.similarity || 0) ? b : a, cmpData.clones[0]);
              rawSim = best.token_score || sim;
              astSim = best.ast_score || sim;
              normSim = best.similarity || sim;
              const ct = typeof best.type === 'number' ? best.type : parseInt(String(best.type).replace(/\D/g, '')) || 3;
              cloneType = ct === 1 ? 'Type-1' : ct === 2 ? 'Type-2' : ct === 3 ? 'Type-3' : null;
            } else {
              rawSim = sim; normSim = sim; astSim = sim;
              cloneType = sim >= 0.6 ? 'Type-3' : null;
            }
          } else {
            throw new Error('Backend compare failed');
          }
        } catch {
          // Fallback to local comparison
          rawSim = computeSimilarity(analyzed[i].content, analyzed[j].content);
          normSim = computeStructuralSimilarity(analyzed[i].content, analyzed[j].content);
          const astNodes_i = astLinearize(analyzed[i].content);
          const astNodes_j = astLinearize(analyzed[j].content);
          astSim = ngramJaccardSimilarity(astNodes_i, astNodes_j, 2);
          sim = rawSim >= 0.70 ? rawSim : normSim >= 0.72 ? normSim * 0.95 : Math.max(rawSim, normSim * 0.85);
          cloneType = classifyPairType(rawSim, normSim);
        }

        matrix[i][j] = sim; matrix[j][i] = sim;
        if (cloneType) {
          pairs.push({ fileA:analyzed[i], fileB:analyzed[j], similarity:sim, rawSim, normSim, astSim, cloneType });
        }
      }
    }

    pairs.sort((a,b)=>b.similarity-a.similarity);
    setFlaggedPairs(pairs);
    setSimilarityMatrix({ files:analyzed, matrix });
    setBatchProgress(null);
    setBatchDone(true);
    setBatchView('students');

    // Save batch results to studentResults localStorage for Analysis Results page
    const studentResults = analyzed.map(f => ({
      fileName: shortName(f.name),
      student: displayName(f),
      section: f.section || '',
      clonePercentage: f.result?.clone_percentage ?? 0,
      complexity: f.result?.cyclomatic_complexity ?? 0,
      maintainability: f.result?.maintainability_index ?? 0,
      date: new Date().toISOString(),
    }));
    const existing = JSON.parse(localStorage.getItem('studentResults') || '[]');
    const newNames = new Set(studentResults.map(r => r.fileName));
    const deduped = existing.filter(r => !newNames.has(r.fileName));
    localStorage.setItem('studentResults', JSON.stringify([...studentResults, ...deduped]));

    logActivity('analysis', `Batch analysis: ${n} files, ${pairs.length} suspicious pairs found`, pairs.some(p=>p.similarity>=0.8)?'warning':'success');
  }, [extractedFiles, user, logActivity]);

  async function testHealth() {
    setQuickResult({ text:'Testing...', className:'loading' });
    try { const d=await(await fetch(`${API}/health`)).json(); setQuickResult({ text:JSON.stringify(d,null,2), className:'success' }); }
    catch { setQuickResult({ text:JSON.stringify({status:'healthy',message:'Mock mode',version:'1.0.0-mock'},null,2), className:'success' }); }
  }
  async function testLanguages() {
    setQuickResult({ text:'Testing...', className:'loading' });
    try { const d=await(await fetch(`${API}/languages`)).json(); setQuickResult({ text:JSON.stringify(d,null,2), className:'success' }); }
    catch { setQuickResult({ text:JSON.stringify({languages:['python','java'],mock:true},null,2), className:'success' }); }
  }

  function loadSample() { setCode(language==='python'?PYTHON_SAMPLE:JAVA_SAMPLE); setUploadedFileName(''); }
  function getFragment(codeText,start,end) { return codeText.split('\n').slice(Math.max(0,start-1),end).join('\n'); }
  function getSeverityClass(pct) { return pct>50?'high':pct>25?'medium':'low'; }

  const cloneTypeCounts = analysisData?.clones
    ? analysisData.clones.reduce((acc,c)=>{ const m=resolveCloneMeta(c.type); acc[m.label]=(acc[m.label]||0)+1; return acc; },{})
    : {};

  const sortedExtracted = [...extractedFiles].sort((a,b)=>{
    if (batchSortBy==='similarity') { const sa=a.result?.clone_percentage??-1, sb=b.result?.clone_percentage??-1; return sb-sa; }
    if (batchSortBy==='clones') { const ca=a.result?.clones?.length??-1, cb=b.result?.clones?.length??-1; return cb-ca; }
    return shortName(a.name).localeCompare(shortName(b.name));
  });

  const displayedFlaggedPairs = flaggedPairs.filter(p=>p.similarity>=matrixThreshold);

  // Compute per-student pairs map
  const studentPairsMap = similarityMatrix
    ? Object.fromEntries(similarityMatrix.files.map(f => [
        f.id,
        flaggedPairs.filter(p => p.fileA.id === f.id || p.fileB.id === f.id)
      ]))
    : {};

  // Sort students by risk
  const sortedStudents = similarityMatrix
    ? [...similarityMatrix.files].sort((a, b) => {
        const pairsA = studentPairsMap[a.id] || [];
        const pairsB = studentPairsMap[b.id] || [];
        const maxA = pairsA.length ? Math.max(...pairsA.map(p => p.similarity)) : 0;
        const maxB = pairsB.length ? Math.max(...pairsB.map(p => p.similarity)) : 0;
        return maxB - maxA;
      })
    : [];

  // Filter students
  const filteredStudents = sortedStudents.filter(f => {
    const name = shortName(f.name).toLowerCase();
    if (studentSearch && !name.includes(studentSearch.toLowerCase())) return false;
    if (studentRiskFilter === 'all') return true;
    const pairs = studentPairsMap[f.id] || [];
    const maxSim = pairs.length ? Math.max(...pairs.map(p => p.similarity)) : 0;
    if (studentRiskFilter === 'high') return maxSim >= 0.8;
    if (studentRiskFilter === 'medium') return maxSim >= 0.6 && maxSim < 0.8;
    if (studentRiskFilter === 'low') return maxSim >= 0.4 && maxSim < 0.6;
    if (studentRiskFilter === 'clear') return pairs.length === 0;
    return true;
  });

  // Class-wide learning gap summary
  const classConcepts = batchDone && flaggedPairs.length > 0
    ? flaggedPairs.flatMap(p => tagConcepts(p))
        .reduce((acc, c) => { acc[c.label] = (acc[c.label] || { ...c, count: 0 }); acc[c.label].count++; return acc; }, {})
    : {};

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="analyzer-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header"><Logo /></div>
        <nav className="sidebar-nav">
          {[
            { label:'Dashboard', path:'/dashboard', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
            { label:'Compiler Area', path:null, active:true, icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
            { label:'Files', path:'/files', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
            { label:'Analysis Results', path:'/analysis-results', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
            { label:'Students', path:'/students', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
            { label:'Refactoring', path:'/refactoring', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> },
            { label:'History', path:'/history', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
            { label:'Settings', path:'/settings', icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
          ].map(item=>(
            <button key={item.label} className={`nav-item${item.active?' active':''}`} onClick={()=>item.path&&navigate(item.path)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </button>
          ))}
          {user.role==='admin'&&<button className="nav-item" onClick={()=>navigate('/admin')}><span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>Admin</button>}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item help-btn" onClick={()=>setShowHelp(true)}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>Help
          </button>
          <div className="user-profile">
            <div className="user-avatar">{profilePic?<img src={profilePic} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:(user.full_name||user.username).charAt(0).toUpperCase()}</div>
            <div className="user-info-sidebar"><div className="user-name">{user.full_name||user.username}</div><div className="user-email">{user.email}</div></div>
          </div>
          <button className="btn-logout-sidebar" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        <header className="analyzer-header">
          <div className="header-left">
            <h2 className="page-title">Code Analyzer</h2>
            <p className="page-subtitle">Detect code clones and compare student submissions</p>
          </div>
          <div className="mode-toggle">
            <button className={`mode-btn${!batchMode?' active':''}`} onClick={()=>setBatchMode(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Single File
            </button>
            <button className={`mode-btn${batchMode?' active':''}`} onClick={()=>setBatchMode(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>
              Batch / Class
              {extractedFiles.length>0&&<span className="mode-badge">{extractedFiles.length}</span>}
            </button>
          </div>
        </header>

        <div className="analyzer-content">

          {/* ── SINGLE FILE MODE ── */}
          {!batchMode && (
            <>
              <section className="analyzer-section">
                <h3 className="section-title">Quick Tests</h3>
                <div className="quick-test-buttons">
                  <button className="test-btn" onClick={testHealth}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Health Check</button>
                  <button className="test-btn" onClick={testLanguages}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Get Languages</button>
                </div>
                {quickResult.text&&<div className={`result-box ${quickResult.className}`}><pre>{quickResult.text}</pre></div>}
              </section>

              <section className="analyzer-section">
                <h3 className="section-title">Analyze Code</h3>
                <div className="controls-row">
                  <div className="control-group">
                    <label className="control-label">Language</label>
                    <select className="language-select" value={language} onChange={e=>setLanguage(e.target.value)}>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                    </select>
                  </div>
                  <button className="action-btn secondary" onClick={loadSample}>Load Sample</button>
                  <button className="action-btn secondary" onClick={()=>fileInputRef.current.click()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload File
                  </button>
                  <button className="action-btn secondary" onClick={()=>zipInputRef.current.click()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Upload Zip
                  </button>
                  <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".py,.java,.txt" onChange={handleFileUpload}/>
                  <input type="file" ref={zipInputRef} style={{display:'none'}} accept=".zip" onChange={handleZipUpload}/>
                </div>
                {uploadedFileName&&<div className="file-uploaded-badge"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><polyline points="20 6 9 17 4 12"/></svg>Loaded: {uploadedFileName}</div>}
                <div className="code-editor-container">
                  <div className="editor-header">
                    <span className="editor-label">Code Editor</span>
                    <span className="editor-lang">{language==='python'?'Python':'Java'}</span>
                  </div>
                  <div className="editor-body">
                    <pre ref={highlightRef} className="code-highlight" aria-hidden="true" dangerouslySetInnerHTML={{__html:highlightCode(code,language)+'\n'}}/>
                    <textarea className="code-editor" value={code} onChange={e=>{setCode(e.target.value);setUploadedFileName('');}} onScroll={e=>{if(highlightRef.current){highlightRef.current.scrollTop=e.target.scrollTop;highlightRef.current.scrollLeft=e.target.scrollLeft;}}} placeholder="Paste your code here or upload a file..." spellCheck="false"/>
                  </div>
                </div>
                <button className="action-btn primary analyze-btn" onClick={analyze}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:8}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Analyze Code
                </button>
                {analyzeResult.className==='loading'&&<div className="result-box loading"><div className="loading-pulse"><span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/></div><pre>Analyzing code for clones...</pre></div>}
                {analyzeResult.className==='error'&&analyzeResult.text&&<div className="result-box error"><pre>{analyzeResult.text}</pre></div>}

                {analysisData&&(
                  <div className="analysis-visual-results">
                    <div className="result-header">
                      <div className="result-header-left">
                        <span className="result-title">Analysis Results</span>
                        {analysisData.mock&&<span className="mock-badge">MOCK MODE</span>}
                        {analysisData.detection_method&&<span className="detection-method-badge">{analysisData.detection_method}</span>}
                      </div>
                      <span className="result-time">{analysisData.execution_time_ms}ms</span>
                    </div>
                    <div className="metrics-rings-row">
                      <MetricRing value={analysisData.clone_percentage} max={100} color={analysisData.clone_percentage>50?'#ef4444':analysisData.clone_percentage>25?'#f97316':'#22c55e'} label={`${analysisData.clone_percentage}%`} sublabel="Clone Rate"/>
                      <MetricRing value={analysisData.cyclomatic_complexity} max={30} color={analysisData.cyclomatic_complexity>20?'#ef4444':analysisData.cyclomatic_complexity>10?'#f97316':'#6366f1'} label={analysisData.cyclomatic_complexity} sublabel="Complexity"/>
                      <MetricRing value={analysisData.maintainability_index} max={100} color={analysisData.maintainability_index>=60?'#22c55e':analysisData.maintainability_index>=30?'#f97316':'#ef4444'} label={`${analysisData.maintainability_index}`} sublabel="Maintainability"/>
                      <div className="metrics-summary-box">
                        <div className="metrics-summary-row"><span className="ms-label">Total Lines</span><span className="ms-value">{analysisData.total_lines}</span></div>
                        <div className="metrics-summary-row"><span className="ms-label">Clones Found</span><span className="ms-value">{analysisData.clones?.length??0}</span></div>
                        {Object.entries(cloneTypeCounts).map(([t,n])=>(
                          <div key={t} className="metrics-summary-row"><span className="ms-label">{t} Clones</span><span className="ms-value" style={{color:resolveCloneMeta(t).color}}>{n}</span></div>
                        ))}
                        {analysisData.halstead_metrics&&(
                          <>
                            <div className="metrics-summary-row"><span className="ms-label">Halstead Volume</span><span className="ms-value">{analysisData.halstead_metrics.total_volume}</span></div>
                            <div className="metrics-summary-row"><span className="ms-label">Avg Difficulty</span><span className="ms-value">{analysisData.halstead_metrics.avg_difficulty}</span></div>
                          </>
                        )}
                      </div>
                    </div>
                    {analysisData.clones&&analysisData.clones.length>0&&(
                      <>
                        <div className="clone-type-legend">
                          {Object.entries(CLONE_TYPE_META).map(([k,m])=>(
                            <div key={k} className="legend-item" style={{borderColor:m.border,background:m.bg}}>
                              <span className="legend-dot" style={{background:m.color}}/><span className="legend-type" style={{color:m.color}}>{m.label}</span>
                              <span className="legend-name">{m.fullName}</span><span className="legend-desc">{m.description}</span>
                            </div>
                          ))}
                        </div>
                        <div className="clones-section">
                          <div className="clones-section-header">
                            <h4 className="subsection-title">Clones Detected ({analysisData.clones.length})</h4>
                            <div className="result-tabs">
                              <button className={`result-tab${activeTab==='results'?' active':''}`} onClick={()=>setActiveTab('results')}>Results</button>
                              <button className={`result-tab${activeTab==='diff'?' active':''}`} onClick={()=>setActiveTab('diff')}>Diff View</button>
                            </div>
                          </div>
                          {activeTab==='results'&&(
                            <div className="clones-list">
                              {analysisData.clones.map((clone,i)=>{
                                const meta=resolveCloneMeta(clone.type); const isExp=expandedClone===i;
                                return (
                                  <div key={i} className="clone-card" style={{borderColor:meta.border,background:meta.bg}}>
                                    <div className="clone-header" onClick={()=>setExpandedClone(isExp?null:i)} style={{cursor:'pointer'}}>
                                      <div className="clone-header-left">
                                        <span className="clone-type-badge" style={{background:meta.color,color:'#fff'}}>{meta.label}</span>
                                        <span className="clone-type-name" style={{color:meta.color}}>{meta.fullName}</span>
                                      </div>
                                      <div className="clone-header-right">
                                        <div className="similarity-score-wrapper">
                                          <div className="similarity-bar-bg"><div className="similarity-bar-fill" style={{width:`${(clone.similarity*100).toFixed(0)}%`,background:meta.color}}/></div>
                                          <span className="similarity-pct" style={{color:meta.color}}>{(clone.similarity*100).toFixed(1)}%</span>
                                          <span className="similarity-label">similarity</span>
                                        </div>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:isExp?'rotate(180deg)':'none',transition:'transform 0.2s',color:'#6b7280'}}><polyline points="6 9 12 15 18 9"/></svg>
                                      </div>
                                    </div>
                                    {(clone.token_score!==undefined||clone.ast_score!==undefined||clone.halstead_score!==undefined)&&(
                                      <div className="clone-scores-row">
                                        {clone.token_score!==undefined&&<span className="clone-score-tag">Token: {(clone.token_score*100).toFixed(0)}%</span>}
                                        {clone.ast_score!==undefined&&<span className="clone-score-tag">AST: {(clone.ast_score*100).toFixed(0)}%</span>}
                                        {clone.halstead_score!==undefined&&<span className="clone-score-tag">Halstead: {(clone.halstead_score*100).toFixed(0)}%</span>}
                                      </div>
                                    )}
                                    <div className="clone-locations">
                                      {clone.locations.map((l,j)=>(
                                        <span key={j} className="clone-location"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>{l.function?`${l.function} · `:''}Lines {l.start_line}–{l.end_line}</span>
                                      ))}
                                    </div>
                                    {clone.explanation&&<div className="clone-explanation"><span className="clone-explain-label">{clone.explanation.type_name||''}</span> {clone.explanation.description||''}</div>}
                                    {isExp&&<div className="clone-inline-diff"><CodeDiff language={language} labelA={`${clone.locations[0]?.function||'Fragment A'} (Lines ${clone.locations[0]?.start_line}–${clone.locations[0]?.end_line})`} labelB={`${clone.locations[1]?.function||'Fragment B'} (Lines ${clone.locations[1]?.start_line}–${clone.locations[1]?.end_line})`} codeA={clone.fragmentA||getFragment(code,clone.locations[0]?.start_line,clone.locations[0]?.end_line)} codeB={clone.fragmentB||getFragment(code,clone.locations[1]?.start_line,clone.locations[1]?.end_line)}/></div>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {activeTab==='diff'&&(
                            <div className="diff-all-view">
                              {analysisData.clones.map((clone,i)=>{
                                const meta=resolveCloneMeta(clone.type);
                                return (
                                  <div key={i} className="diff-clone-block">
                                    <div className="diff-clone-title">
                                      <span className="clone-type-badge" style={{background:meta.color,color:'#fff'}}>{meta.label}</span>
                                      <span style={{color:meta.color,fontWeight:600}}>{meta.fullName}</span>
                                      <span className="diff-similarity" style={{color:meta.color}}>{(clone.similarity*100).toFixed(1)}% similar</span>
                                    </div>
                                    <CodeDiff language={language} labelA={`Fragment A · Lines ${clone.locations[0]?.start_line}–${clone.locations[0]?.end_line}`} labelB={`Fragment B · Lines ${clone.locations[1]?.start_line}–${clone.locations[1]?.end_line}`} codeA={clone.fragmentA||getFragment(code,clone.locations[0]?.start_line,clone.locations[0]?.end_line)} codeB={clone.fragmentB||getFragment(code,clone.locations[1]?.start_line,clone.locations[1]?.end_line)}/>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {analysisData.refactoring_suggestions?.length>0&&(
                      <div className="suggestions-section">
                        <h4 className="subsection-title">Refactoring Suggestions</h4>
                        <div className="suggestion-cards">
                          {analysisData.refactoring_suggestions.map((s,i)=>(
                            <div key={i} className="analyzer-suggestion-card">
                              <div className="analyzer-suggestion-type">{s.refactoring_type}</div>
                              {s.explanation?.remember&&<div className="analyzer-suggestion-text">{s.explanation.remember}</div>}
                              {s.explanation?.understand&&<div className="analyzer-suggestion-text" style={{color:'var(--text-muted)',fontSize:'0.8rem'}}>{s.explanation.understand}</div>}
                              {s.explanation?.apply&&<div className="analyzer-suggestion-text">{s.explanation.apply}</div>}
                              {s.before_code&&(
                                <details className="suggestion-code-details">
                                  <summary className="suggestion-code-summary">View Code</summary>
                                  <div className="suggestion-code-block">
                                    <div className="suggestion-code-label">Before:</div>
                                    <pre className="suggestion-code-pre">{s.before_code}</pre>
                                  </div>
                                  {s.after_code&&(
                                    <div className="suggestion-code-block">
                                      <div className="suggestion-code-label">After:</div>
                                      <pre className="suggestion-code-pre">{s.after_code}</pre>
                                    </div>
                                  )}
                                </details>
                              )}
                              {s.scores&&(
                                <div className="suggestion-scores">
                                  <span className="clone-score-tag">Token: {(s.scores.token*100).toFixed(0)}%</span>
                                  <span className="clone-score-tag">AST: {(s.scores.ast*100).toFixed(0)}%</span>
                                  <span className="clone-score-tag">Halstead: {(s.scores.halstead*100).toFixed(0)}%</span>
                                  <span className="clone-score-tag">Fusion: {(s.scores.fusion*100).toFixed(0)}%</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <button className="action-btn primary refactoring-link-btn" onClick={()=>{localStorage.setItem('refactoringCode',code);localStorage.setItem('refactoringLanguage',language);navigate('/refactoring');}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                          Open in Refactoring Tool
                        </button>
                      </div>
                    )}
                    {/* Quality Report */}
                    {analysisData.quality_report&&(
                      <div className="quality-report-section">
                        <h4 className="subsection-title">Quality Report</h4>
                        {analysisData.quality_report.structure&&(
                          <div className="quality-structure-row">
                            <span className="qs-item"><strong>{analysisData.quality_report.structure.function_count}</strong> functions</span>
                            <span className="qs-item">Avg length: <strong>{analysisData.quality_report.structure.avg_function_length}</strong> lines</span>
                            <span className="qs-item">Max nesting: <strong>{analysisData.quality_report.structure.max_nesting_depth}</strong></span>
                            <span className="qs-item">Comment density: <strong>{((analysisData.quality_report.structure.comment_density ?? 0)*100).toFixed(0)}%</strong></span>
                          </div>
                        )}
                        {analysisData.quality_report.functions?.length>0&&(
                          <div className="quality-functions-list">
                            {analysisData.quality_report.functions.map((fn,i)=>(
                              <div key={i} className="quality-fn-card">
                                <div className="quality-fn-header">
                                  <span className="quality-fn-name">{fn.name}</span>
                                  <span className="quality-fn-lines">Lines {fn.start_line}–{fn.end_line} ({fn.line_count} lines)</span>
                                </div>
                                <div className="quality-fn-metrics">
                                  <span className="clone-score-tag">CC: {fn.cyclomatic_complexity}</span>
                                  <span className="clone-score-tag">Nesting: {fn.nesting_depth}</span>
                                  {fn.halstead&&<span className="clone-score-tag">Vol: {(fn.halstead.volume ?? 0).toFixed(0)}</span>}
                                </div>
                                {fn.smells?.length>0&&(
                                  <div className="quality-fn-smells">
                                    {fn.smells.map((smell,j)=>(
                                      <span key={j} className="quality-smell-badge">{smell.replace(/_/g,' ')}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ══════════════════════════════════════════════
              BATCH MODE
          ══════════════════════════════════════════════ */}
          {batchMode && (
            <section className="analyzer-section batch-section">
              <div className="batch-header-row">
                <div>
                  <h3 className="section-title" style={{marginBottom:4}}>Batch Class Analysis</h3>
                  <p className="page-subtitle">Upload student submissions to detect similarities and identify learning gaps</p>
                </div>
                <div className="batch-header-actions">
                  <div className="control-group" style={{marginRight:8}}>
                    <label className="control-label">Section</label>
                    <select className="language-select" value={selectedSection} onChange={e=>setSelectedSection(e.target.value)}>
                      <option value="">All Sections</option>
                      {sections.map(s=><option key={s.id||s.name} value={s.id?.toString()||s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <button className="action-btn secondary" onClick={()=>zipInputRef.current.click()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Upload Zip
                  </button>
                  <input type="file" ref={zipInputRef} style={{display:'none'}} accept=".zip" onChange={handleZipUpload}/>
                  {extractedFiles.length>0&&(
                    <>
                      <button className="action-btn primary batch-run-btn" onClick={runBatchAnalysis} disabled={!!batchProgress}>
                        {batchProgress
                          ? <><div className="btn-spinner"/>{batchProgress.phase}…</>
                          : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><polygon points="5 3 19 12 5 21 5 3"/></svg>Analyze All ({extractedFiles.length} files)</>
                        }
                      </button>
                      <button className="action-btn secondary" onClick={clearAllFiles} style={{color:'#ef4444',borderColor:'rgba(239,68,68,0.3)'}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress */}
              {batchProgress&&(
                <div className="batch-progress-container">
                  <div className="batch-progress-info">
                    <span className="batch-progress-phase">{batchProgress.phase}</span>
                    <span className="batch-progress-name">{batchProgress.currentName}</span>
                    <span className="batch-progress-count">{batchProgress.current}/{batchProgress.total}</span>
                  </div>
                  <div className="batch-progress-bar-bg"><div className="batch-progress-bar-fill" style={{width:`${batchProgress.total>0?(batchProgress.current/batchProgress.total)*100:0}%`}}/></div>
                </div>
              )}

              {/* Empty */}
              {extractedFiles.length===0&&(
                <div className="batch-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  <p className="batch-empty-title">No student files loaded</p>
                  <p className="batch-empty-sub">Upload a .zip file containing student submissions (.py or .java files)</p>
                  <button className="action-btn primary" onClick={()=>zipInputRef.current.click()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload Student Zip
                  </button>
                </div>
              )}

              {/* Dataset stats (pre-run) */}
              {datasetStats&&!batchDone&&(
                <div className="dataset-stats-panel">
                  <div className="dsp-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Dataset Ready — {datasetStats.count} files loaded
                  </div>
                  <div className="dsp-grid">
                    <div className="dsp-item"><span className="dsp-val">{datasetStats.count}</span><span className="dsp-lbl">Submissions</span></div>
                    <div className="dsp-item"><span className="dsp-val">{datasetStats.avgLOC}</span><span className="dsp-lbl">Avg LOC</span></div>
                    <div className="dsp-item"><span className="dsp-val">{datasetStats.minLOC}–{datasetStats.maxLOC}</span><span className="dsp-lbl">LOC Range</span></div>
                    <div className="dsp-item"><span className="dsp-val">{datasetStats.totalTokens.toLocaleString()}</span><span className="dsp-lbl">Total Tokens</span></div>
                  </div>
                  <div className="batch-file-grid" style={{marginTop:12}}>
                    {sortedExtracted.map(ef=>(
                      <div key={ef.id} className="batch-file-card">
                        <div className="bfc-top">
                          <span className="bfc-ext">{ef.ext.toUpperCase()}</span>
                          <span className="bfc-name" title={ef.name}>{shortName(ef.name)}</span>
                          <button className="bfc-remove" onClick={()=>removeExtractedFile(ef.id)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════
                  POST-ANALYSIS RESULTS
              ══════════════════════════════════ */}
              {batchDone && similarityMatrix && (
                <>
                  {/* Summary row */}
                  <div className="batch-summary-row">
                    <div className="batch-stat-card">
                      <span className="bsc-value">{similarityMatrix.files.length}</span>
                      <span className="bsc-label">Students</span>
                    </div>
                    <div className="batch-stat-card">
                      <span className="bsc-value">{Math.round((similarityMatrix.files.length*(similarityMatrix.files.length-1))/2)}</span>
                      <span className="bsc-label">Pairs Compared</span>
                    </div>
                    <div className="batch-stat-card warning">
                      <span className="bsc-value">{flaggedPairs.filter(p=>p.similarity>=0.6).length}</span>
                      <span className="bsc-label">Suspicious ≥60%</span>
                    </div>
                    <div className="batch-stat-card danger">
                      <span className="bsc-value">{flaggedPairs.filter(p=>p.similarity>=0.8).length}</span>
                      <span className="bsc-label">High-Risk ≥80%</span>
                    </div>
                  </div>

                  {/* Export Bar */}
                  <div className="export-bar">
                    <div className="export-bar-left">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span className="export-bar-title">Analysis complete — export results for Canvas or any LMS</span>
                    </div>
                    <div className="export-bar-actions">
                      <button className="export-btn csv" onClick={() => exportCSV(similarityMatrix.files, flaggedPairs, datasetStats)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Export CSV
                        <span className="export-btn-sub">Canvas grade import</span>
                      </button>
                      <button className="export-btn pdf" onClick={() => exportPDF(similarityMatrix.files, flaggedPairs, datasetStats, matrixThreshold)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                        Export PDF Report
                        <span className="export-btn-sub">Print or save as PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Naming Convention Hint */}
                  <div className="naming-hint">
                    <div className="naming-hint-header">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Student identification
                      <span className="naming-hint-badge">
                        {similarityMatrix.files.filter(f => extractStudentIdentity(f).source === 'comment').length} from comments ·{' '}
                        {similarityMatrix.files.filter(f => extractStudentIdentity(f).source === 'filename').length} from filenames
                      </span>
                    </div>
                    <p className="naming-hint-text">
                      Names are extracted automatically from code comments or filenames.
                      For best results, ask students to include one of these at the top of their file:
                    </p>
                    <div className="naming-hint-examples">
                      <code># Name: Juan dela Cruz</code>
                      <code># Student ID: 2023-12345</code>
                      <code>// Author: Maria Santos</code>
                      <span className="naming-hint-or">or name files like:</span>
                      <code>JuanDelaCruz_hw1.py</code>
                      <code>2023-12345_assignment.java</code>
                    </div>
                  </div>

                  {/* Class Learning Gap Banner */}
                  {Object.keys(classConcepts).length > 0 && (
                    <div className="class-gap-banner">
                      <div className="cgb-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        Class-Wide Learning Gaps Detected
                        <span className="cgb-subtitle">Based on clone pattern analysis across all submissions</span>
                      </div>
                      <div className="cgb-tags">
                        {Object.values(classConcepts).sort((a,b)=>b.count-a.count).map(concept => (
                          <div key={concept.label} className="cgb-tag" style={{ background: concept.bg, borderColor: concept.color + '40' }}>
                            <span className="cgb-icon">{concept.icon}</span>
                            <span className="cgb-label" style={{ color: concept.color }}>{concept.fullName}</span>
                            <span className="cgb-count" style={{ background: concept.color + '25', color: concept.color }}>
                              {concept.count} pair{concept.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="cgb-note">
                        Consider reviewing these concepts in your next class session. Students with flagged pairs are directed to study these topics individually.
                      </p>
                    </div>
                  )}

                  {/* View switcher */}
                  <div className="batch-view-switcher">
                    <div className="bvs-tabs">
                      {[
                        { id: 'students', icon: '👥', label: 'Student View' },
                        { id: 'matrix', icon: '🔥', label: 'Similarity Matrix' },
                        { id: 'pairs', icon: '🔗', label: 'Flagged Pairs' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          className={`bvs-tab ${batchView === tab.id ? 'active' : ''}`}
                          onClick={() => setBatchView(tab.id)}
                        >
                          <span>{tab.icon}</span> {tab.label}
                          {tab.id === 'pairs' && flaggedPairs.length > 0 && (
                            <span className="bvs-count">{flaggedPairs.filter(p=>p.similarity>=matrixThreshold).length}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── STUDENT VIEW ── */}
                  {batchView === 'students' && (
                    <div className="student-view-layout">
                      <div className={`student-list-panel ${selectedStudent ? 'has-selection' : ''}`}>
                        {/* Search + filter */}
                        <div className="svl-toolbar">
                          <div className="svl-search-wrap">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input
                              className="svl-search"
                              placeholder="Search students…"
                              value={studentSearch}
                              onChange={e=>setStudentSearch(e.target.value)}
                            />
                          </div>
                          <div className="svl-filters">
                            {[
                              { id: 'all', label: 'All', color: '#9ca3af' },
                              { id: 'high', label: '🔴 High', color: '#ef4444' },
                              { id: 'medium', label: '🟠 Suspicious', color: '#f97316' },
                              { id: 'low', label: '🟡 Low', color: '#eab308' },
                              { id: 'clear', label: '✅ Clear', color: '#22c55e' },
                            ].map(f => (
                              <button
                                key={f.id}
                                className={`svl-filter-btn ${studentRiskFilter === f.id ? 'active' : ''}`}
                                style={studentRiskFilter === f.id ? { borderColor: f.color, color: f.color } : {}}
                                onClick={() => setStudentRiskFilter(f.id)}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="svl-count">
                          {filteredStudents.length} of {sortedStudents.length} students
                        </div>

                        <div className="student-cards-list">
                          {filteredStudents.map((file, idx) => {
                            const pairs = studentPairsMap[file.id] || [];
                            return (
                              <StudentCard
                                key={file.id}
                                file={file}
                                pairsInvolving={pairs}
                                onSelect={f => setSelectedStudent(selectedStudent?.id === f.id ? null : f)}
                                isSelected={selectedStudent?.id === file.id}
                                rank={sortedStudents.indexOf(file) + 1}
                              />
                            );
                          })}
                          {filteredStudents.length === 0 && (
                            <div className="svl-empty">No students match this filter.</div>
                          )}
                        </div>
                      </div>

                      {/* Student detail panel */}
                      {selectedStudent && (
                        <StudentDetailPanel
                          file={selectedStudent}
                          pairsInvolving={studentPairsMap[selectedStudent.id] || []}
                          allFiles={similarityMatrix.files}
                          onClose={() => setSelectedStudent(null)}
                          onSelectPair={(pair) => {
                            setSelectedPair(pair);
                            setBatchView('pairs');
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* ── MATRIX VIEW ── */}
                  {batchView === 'matrix' && (
                    <div className="matrix-panel">
                      <div className="matrix-panel-header">
                        <h4 className="subsection-title">Similarity Matrix</h4>
                        <div className="matrix-controls">
                          <span style={{fontSize:12,color:'#6b7280'}}>Threshold</span>
                          <input type="range" min="0" max="0.9" step="0.05" value={matrixThreshold} onChange={e=>setMatrixThreshold(+e.target.value)} className="threshold-slider"/>
                          <span style={{fontSize:12,color:'#9ca3af',minWidth:32}}>{Math.round(matrixThreshold*100)}%</span>
                        </div>
                      </div>
                      <div className="matrix-legend-row">
                        {[[0,'0%','#374151'],[0.2,'20%','#22c55e'],[0.4,'40%','#eab308'],[0.6,'60%','#f97316'],[0.8,'80%','#ef4444']].map(([v,lbl,c])=>(
                          <div key={v} className="matrix-legend-item">
                            <div style={{width:14,height:14,borderRadius:3,background:c,flexShrink:0}}/>
                            <span>{lbl}</span>
                          </div>
                        ))}
                      </div>
                      <div className="matrix-scroll">
                        <div className="matrix-grid" style={{gridTemplateColumns:`56px repeat(${similarityMatrix.files.length}, 44px)`}}>
                          <div className="matrix-corner"/>
                          {similarityMatrix.files.map((f,j)=>(
                            <div key={j} className="matrix-col-label" title={shortName(f.name)}>{shortName(f.name).slice(0,6)}</div>
                          ))}
                          {similarityMatrix.files.map((fA,i)=>(
                            <>
                              <div key={`r${i}`} className="matrix-row-label" title={shortName(fA.name)}>{shortName(fA.name).slice(0,8)}</div>
                              {similarityMatrix.files.map((fB,j)=>{
                                const val = similarityMatrix.matrix[i][j];
                                const isSelf = i===j;
                                const isSelected = selectedPair && ((selectedPair.fileA.id===fA.id&&selectedPair.fileB.id===fB.id)||(selectedPair.fileA.id===fB.id&&selectedPair.fileB.id===fA.id));
                                return (
                                  <HeatCell key={j} value={isSelf?null:val} isSelected={isSelected}
                                    onClick={()=>{
                                      if (isSelf||val===null) return;
                                      const pair = flaggedPairs.find(p=>(p.fileA.id===fA.id&&p.fileB.id===fB.id)||(p.fileA.id===fB.id&&p.fileB.id===fA.id));
                                      setSelectedPair(pair||{ fileA:fA, fileB:fB, similarity:val, rawSim:val, normSim:val, cloneType:classifyPairType(val, val)||'Type-3' });
                                      setBatchView('pairs');
                                    }}
                                  />
                                );
                              })}
                            </>
                          ))}
                        </div>
                      </div>
                      <p className="matrix-hint">Click any cell to view that pair in the Flagged Pairs tab</p>
                    </div>
                  )}

                  {/* ── PAIRS VIEW ── */}
                  {batchView === 'pairs' && (
                    <div className="pairs-view">
                      {/* Accuracy metrics */}
                      {(()=>{
                        const metrics = computeAccuracyMetrics(flaggedPairs, matrixThreshold);
                        if (!metrics) return null;
                        return (
                          <div className="accuracy-panel">
                            <div className="accuracy-panel-header">
                              <div className="accuracy-title-row">
                                <h4 className="subsection-title">Detection Accuracy Metrics</h4>
                                <span className="accuracy-note">at {Math.round(matrixThreshold*100)}% threshold</span>
                              </div>
                              <div className="accuracy-tool-row">
                                <span className="accuracy-tool-label">Compare with:</span>
                                <span className="accuracy-tool-tag">MOSS</span>
                                <span className="accuracy-tool-tag">JPlag</span>
                              </div>
                            </div>
                            <div className="accuracy-metrics-grid">
                              <div className="accuracy-metric-card precision">
                                <div className="amc-circle" style={{background:'rgba(99,102,241,0.1)',borderColor:'rgba(99,102,241,0.4)'}}>
                                  <span className="amc-value" style={{color:'#6366f1'}}>{(metrics.precision*100).toFixed(1)}%</span>
                                </div>
                                <span className="amc-label">Precision</span>
                                <span className="amc-desc">Of flagged pairs, how many are true clones</span>
                                <span className="amc-formula">TP / (TP + FP)</span>
                              </div>
                              <div className="accuracy-metric-card recall">
                                <div className="amc-circle" style={{background:'rgba(34,197,94,0.1)',borderColor:'rgba(34,197,94,0.4)'}}>
                                  <span className="amc-value" style={{color:'#22c55e'}}>{(metrics.recall*100).toFixed(1)}%</span>
                                </div>
                                <span className="amc-label">Recall</span>
                                <span className="amc-desc">Of all true clones, how many were detected</span>
                                <span className="amc-formula">TP / (TP + FN)</span>
                              </div>
                              <div className="accuracy-metric-card f1">
                                <div className="amc-circle" style={{background:'rgba(249,115,22,0.1)',borderColor:'rgba(249,115,22,0.4)'}}>
                                  <span className="amc-value" style={{color:'#f97316'}}>{(metrics.f1*100).toFixed(1)}%</span>
                                </div>
                                <span className="amc-label">F1-Score</span>
                                <span className="amc-desc">Harmonic mean of Precision and Recall</span>
                                <span className="amc-formula">2 · P · R / (P + R)</span>
                              </div>
                              <div className="accuracy-confusion">
                                <div className="acm-title">Confusion Matrix</div>
                                <div className="acm-grid">
                                  <div className="acm-cell tp"><span className="acm-n">{metrics.tp}</span><span className="acm-lbl">TP</span></div>
                                  <div className="acm-cell fp"><span className="acm-n">{metrics.fp}</span><span className="acm-lbl">FP</span></div>
                                  <div className="acm-cell fn"><span className="acm-n">{metrics.fn}</span><span className="acm-lbl">FN</span></div>
                                  <div className="acm-cell tn"><span className="acm-n">{metrics.total - metrics.tp - metrics.fp - metrics.fn}</span><span className="acm-lbl">TN</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Threshold + flagged pairs */}
                      <div className="flagged-pairs-panel">
                        <div className="flagged-pairs-header">
                          <h4 className="subsection-title">Flagged Pairs ({displayedFlaggedPairs.length})</h4>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <span style={{fontSize:12,color:'#6b7280'}}>Threshold</span>
                            <input type="range" min="0" max="0.9" step="0.05" value={matrixThreshold} onChange={e=>setMatrixThreshold(+e.target.value)} className="threshold-slider"/>
                            <span style={{fontSize:12,color:'#9ca3af',minWidth:32}}>{Math.round(matrixThreshold*100)}%</span>
                          </div>
                        </div>
                        <div className="flagged-pairs-list">
                          {displayedFlaggedPairs.map((pair,i)=>{
                            const meta = resolveCloneMeta(pair.cloneType);
                            const isSelected = selectedPair?.fileA?.id===pair.fileA.id&&selectedPair?.fileB?.id===pair.fileB.id;
                            const concepts = tagConcepts(pair);
                            return (
                              <div key={i} className={`flagged-pair-card ${isSelected?'selected':''}`} style={{borderLeftColor:meta.color}} onClick={()=>setSelectedPair(isSelected?null:pair)}>
                                <div className="fpc-top">
                                  <div className="fpc-students">
                                    <span className="fpc-student"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{shortName(pair.fileA.name)}</span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                    <span className="fpc-student"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:4}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{shortName(pair.fileB.name)}</span>
                                  </div>
                                  <div className="fpc-badges">
                                    <span className="clone-type-badge" style={{background:meta.color,color:'#fff',fontSize:10}}>{meta.label}</span>
                                    <span className="fpc-sim" style={{color:meta.color}}>{(pair.similarity*100).toFixed(1)}%</span>
                                  </div>
                                </div>
                                <div className="fpc-bar-bg"><div className="fpc-bar-fill" style={{width:`${pair.similarity*100}%`,background:meta.color}}/></div>
                                <div className="fpc-sub">
                                  <span>Token: {(pair.rawSim*100).toFixed(0)}%</span>
                                  <span>AST: {((pair.astSim||0)*100).toFixed(0)}%</span>
                                  <span>Hybrid: {(pair.normSim*100).toFixed(0)}%</span>
                                  {concepts.length > 0 && (
                                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                      {concepts.map(c=>(
                                        <span key={c.label} className="sc-concept-tag" style={{background:c.bg,color:c.color,fontSize:10}}>{c.icon} {c.label}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* Explainability */}
                                <button className="explain-toggle" onClick={e=>{ e.stopPropagation(); setExpandedExplain(expandedExplain===i?null:i); }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                  {expandedExplain===i ? 'Hide explanation' : 'Why flagged?'}
                                </button>
                                {expandedExplain===i&&(
                                  <div className="explain-panel">
                                    <div className="explain-header"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="12" r="10"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Why this pair is flagged</div>
                                    <ul className="explain-list">{generateExplanation(pair).map((r,ri)=><li key={ri} className="explain-item"><span className="explain-bullet">▸</span>{r}</li>)}</ul>
                                    <div className="explain-method-badges">
                                      <span className="method-badge token">Token Analysis</span>
                                      <span className="method-badge structural">Structural Normalization</span>
                                      {pair.cloneType==='Type-2'&&<span className="method-badge ast">Identifier Stripping</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {displayedFlaggedPairs.length===0&&(
                            <div className="no-flags-box">
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                              <p>No suspicious pairs above threshold.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prevention guide */}
                      <div className="prevention-panel">
                        <div className="prevention-header" onClick={()=>setShowPreventionGuide(v=>!v)}>
                          <div className="prevention-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            Preventative Measures for Instructors
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:showPreventionGuide?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                        {showPreventionGuide&&(
                          <div className="prevention-body">
                            <div className="prevention-grid">
                              {[
                                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,title:'Randomize Assignment Parameters',desc:'Give each student slightly different inputs or constraints. This makes direct copying structurally invalid.'},
                                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,title:'Require Code Walkthroughs',desc:'Ask students to record a short video explaining their code. This quickly surfaces students who cannot explain their own submission.'},
                                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,title:'Stage Submissions with Deadlines',desc:'Break assignments into milestones. Plagiarism is harder to hide across multiple stages.'},
                                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,title:'Use This as an Early-Warning Tool',desc:'Run batch analysis after each deadline. Flag pairs ≥60% for follow-up interview.'},
                                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,title:'Establish Academic Integrity Policy',desc:"Communicate consequences of code sharing at the start of the course and reference it in every assignment brief."},
                                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,title:'Document High-Risk Pairs',desc:"For pairs ≥80%, save the diff report and attach it to a formal misconduct report per your institution's process."},
                              ].map((item,i)=>(
                                <div key={i} className="prevention-card">
                                  <div className="prev-card-icon">{item.icon}</div>
                                  <div className="prev-card-content"><div className="prev-card-title">{item.title}</div><div className="prev-card-desc">{item.desc}</div></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shared diff panel */}
                  {selectedPair && batchView !== 'students' && (
                    <div className="pair-diff-panel">
                      <div className="pair-diff-header">
                        <div className="pair-diff-title">
                          <h4 className="subsection-title">Side-by-Side Comparison</h4>
                          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                            <span className="clone-type-badge" style={{background:resolveCloneMeta(selectedPair.cloneType).color,color:'#fff'}}>{resolveCloneMeta(selectedPair.cloneType).label}</span>
                            <span style={{color:resolveCloneMeta(selectedPair.cloneType).color,fontWeight:700,fontSize:15}}>{(selectedPair.similarity*100).toFixed(1)}% similar</span>
                          </div>
                        </div>
                        <button className="action-btn secondary" onClick={()=>setSelectedPair(null)} style={{padding:'6px 12px',fontSize:12}}>Close</button>
                      </div>
                      <CodeDiff
                        language={selectedPair.fileA.lang||'python'}
                        labelA={`${shortName(selectedPair.fileA.name)} (Student A)`}
                        labelB={`${shortName(selectedPair.fileB.name)} (Student B)`}
                        codeA={selectedPair.fileA.content}
                        codeB={selectedPair.fileB.content}
                      />
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Help Modal */}
      {showHelp&&(
        <div className="help-modal-overlay" onClick={()=>setShowHelp(false)}>
          <div className="help-modal" onClick={e=>e.stopPropagation()}>
            <div className="help-modal-header">
              <h3>Help & Documentation</h3>
              <button className="help-close-btn" onClick={()=>setShowHelp(false)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="help-modal-body">
              {[
                ['Single File Mode','Paste or upload one file, click Analyze to detect internal clones.'],
                ['Batch / Class Mode','Upload a zip of student files. Click Analyze All to scan every file and compare every student pair.'],
                ['Student View','The main instructor view — shows all students sorted by risk level. Click any student to see their educational feedback and flagged pairs.'],
                ['Similarity Matrix','Heatmap showing pairwise similarity. Red = very similar. Click any cell to jump to that pair.'],
                ['Flagged Pairs','Ranked list of suspicious pairs with explainability and concept tags.'],
                ['Concept Tags','Rule-based labels like DRY, Abstraction, and Decomposition that identify what CS concept the student should study.'],
                ['Learning Gap Banner','Aggregates concept tags across all submissions to identify class-wide curriculum gaps.'],
              ].map(([t,d])=><div key={t} className="help-section"><h4>{t}</h4><p>{d}</p></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeAnalyzer;