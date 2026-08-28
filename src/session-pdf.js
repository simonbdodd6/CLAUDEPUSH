/**
 * session-pdf.js — a real PDF of a training-session plan, with no dependencies.
 *
 * The app's other "Print" affordances call window.print(), which prints the
 * dark application shell — unusable on paper. This module writes an actual
 * PDF document (headers, xref table, content streams) so "Download PDF" hands
 * the coach a genuine, branded A4 session sheet in one click, on any device.
 *
 * Design constraints, in order:
 *   1. ZERO dependencies — the app ships as one file plus a few same-origin
 *      ES modules, and the CSP allows nothing else. Everything here is
 *      hand-written PDF: base-14 Helvetica fonts (present in every PDF
 *      viewer), WinAnsi text encoding, uncompressed content streams.
 *   2. PURE — buildSessionPdf(data) -> Uint8Array. No DOM, no globals, so the
 *      whole document is testable under node:test byte-for-byte, and the
 *      uncompressed streams mean tests can assert real content with a plain
 *      string search.
 *   3. HONEST — every line of the document comes from the session the coach
 *      actually built. Fields that don't exist are omitted, never invented.
 *
 * Layout: A4 portrait. Page one carries the branded header band; every page
 * carries the column headings and a footer with page numbers. Rows wrap to
 * their content and never split mid-block across a page unless a single block
 * is taller than a whole page (then it flows).
 */

// ── Page geometry (PDF points) ──────────────────────────────────────────────
const PAGE_W = 595.28;            // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 46;

// Column layout: Time | Activity | Key focus | Lead coach
const COLS = [
  { key: 'time',     label: 'TIME',       x: MARGIN,       w: 58  },
  { key: 'activity', label: 'ACTIVITY',   x: MARGIN + 66,  w: 148 },
  { key: 'keyFocus', label: 'KEY FOCUS',  x: MARGIN + 222, w: 178 },
  { key: 'coach',    label: 'LEAD COACH', x: MARGIN + 408, w: CONTENT_W - 408 },
];
const CELL_PAD_Y = 7;
const ROW_LEADING = 12.5;

// ── Brand palette (mirrors the app's tokens; values are "r g b" 0..1) ───────
const INK    = '0.106 0.133 0.188';   // #1b2230 — body text
const MUTED  = '0.357 0.400 0.459';   // #5b6675
const GOLD   = '0.659 0.518 0.173';   // #A8842C — the CoachEasier accent
const DARKBG = '0.078 0.082 0.110';   // #14151C — header band
const LINE   = '0.855 0.867 0.886';   // hairlines
const TINT   = '0.961 0.965 0.973';   // alternating row wash
const GREEN  = '0.024 0.588 0.412';   // published
const AMBER  = '0.706 0.428 0.036';   // changes not republished

// ── WinAnsi encoding ────────────────────────────────────────────────────────
// Base-14 fonts are used with /WinAnsiEncoding: bytes 0x20–0x7E are ASCII,
// 0xA0–0xFF are Latin-1, and the 0x80–0x9F block holds the typographic
// characters below. Anything unmappable degrades to a readable ASCII stand-in
// rather than a missing-glyph box.
const WINANSI_HIGH = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
  '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
  'ž': 0x9E, 'Ÿ': 0x9F,
};
const ASCII_FALLBACK = { '−': '-', '→': '->', '✓': 'v', ' ': ' ' };

/** Unicode string -> WinAnsi byte string (JS string with codes 0–255). */
export function winAnsi(str) {
  let out = '';
  for (const ch of String(str || '')) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code <= 0x7E) out += ch;
    else if (code >= 0xA0 && code <= 0xFF) out += ch;
    else if (WINANSI_HIGH[ch] !== undefined) out += String.fromCharCode(WINANSI_HIGH[ch]);
    else if (ASCII_FALLBACK[ch] !== undefined) out += ASCII_FALLBACK[ch];
    else if (code === 0x0A || code === 0x0D || code === 0x09) out += ' ';
    else out += '?';
  }
  return out;
}

/** Escape a WinAnsi byte string for a PDF literal string. */
function pdfEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ── Font metrics (Adobe AFM widths, glyph units / 1000) ─────────────────────
// Helvetica and Helvetica-Bold, chars 0x20–0x7E. Wrapping is computed from
// these real widths, so lines break where they will actually break on paper.
/* eslint-disable */
const W_HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  278,278,278,469,556,333,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,
  334,260,334,584];
const W_HELV_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,
  722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  333,278,333,584,556,333,
  556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,
  389,280,389,584];
/* eslint-enable */
// The typographic 0x80–0x9F block + a default for accented Latin-1.
const W_HIGH = { 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x85: 1000 };
const W_HIGH_BOLD = { 0x91: 278, 0x92: 278, 0x93: 500, 0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0x85: 1000 };

/** Width of a WinAnsi byte string in points, at `size`, in the given face. */
export function textWidth(s, size, bold = false) {
  const base = bold ? W_HELV_BOLD : W_HELV;
  const high = bold ? W_HIGH_BOLD : W_HIGH;
  let units = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7E) units += base[c - 0x20];
    else units += high[c] || 556;
  }
  return (units * size) / 1000;
}

/**
 * Word-wrap a WinAnsi byte string to a column width. Returns at least one
 * line (possibly ''). A single word longer than the column is broken hard —
 * long unbroken strings must never escape their cell.
 */
export function wrapText(s, size, width, bold = false) {
  const words = s.split(' ').filter(w => w !== '');
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  const fits = t => textWidth(t, size, bold) <= width;
  for (let word of words) {
    while (!fits(word)) {                    // hard-break an over-long word
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut--;
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const attempt = line ? line + ' ' + word : word;
    if (fits(attempt)) line = attempt;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// ── Content-stream helpers ──────────────────────────────────────────────────
const n2 = v => (Math.round(v * 100) / 100).toString();

function textOp(x, y, size, colour, s, { bold = false, italic = false, spacing = 0 } = {}) {
  const font = bold ? '/F2' : italic ? '/F3' : '/F1';
  const sp = spacing ? `${n2(spacing)} Tc ` : '';
  const reset = spacing ? ' 0 Tc' : '';
  return `BT ${sp}${font} ${n2(size)} Tf ${colour} rg ${n2(x)} ${n2(y)} Td (${pdfEscape(s)}) Tj${reset} ET\n`;
}
const rectOp = (x, y, w, h, colour) => `${colour} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f\n`;
const lineOp = (x1, y1, x2, y2, colour, w = 0.75) =>
  `${colour} RG ${n2(w)} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S\n`;

// ── Document assembly ───────────────────────────────────────────────────────

/** Sort blocks chronologically. Stable: invalid/absent times keep their
 *  relative order and follow the timed blocks. */
export function chronological(blocks) {
  const mins = t => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : Infinity;
  };
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((p, q) => (mins(p.b.time) - mins(q.b.time)) || (p.i - q.i))
    .map(p => p.b);
}

const STATUS_STYLE = {
  published: { fill: GREEN, text: '1 1 1' },
  stale:     { fill: AMBER, text: '1 1 1' },
  draft:     { fill: LINE,  text: MUTED },
};
const STATUS_LABEL = { published: 'PUBLISHED', stale: 'EDITED SINCE PUBLISH', draft: 'DRAFT' };

/**
 * Build the PDF. Every field is optional except blocks; nothing is invented.
 *
 * data = {
 *   clubName, groupName, sessionTitle, sessionLabel, venue, preparedBy,
 *   generatedOn,                       // preformatted date string
 *   statuses: [{ audience, status, publishedAt }],   // status: draft|published|stale
 *   blocks:   [{ time, activity, keyFocus, coach }],
 * }
 * Returns Uint8Array of a complete PDF file.
 */
export function buildSessionPdf(data = {}) {
  const title = winAnsi(data.sessionTitle || 'Training session');
  const club = winAnsi(data.clubName || '');
  const group = winAnsi(data.groupName || '');
  const label = winAnsi(data.sessionLabel || '');
  const venue = winAnsi(data.venue || '');
  const preparedBy = winAnsi(data.preparedBy || '');
  const generatedOn = winAnsi(data.generatedOn || '');
  const statuses = Array.isArray(data.statuses) ? data.statuses : [];
  const blocks = chronological(Array.isArray(data.blocks) ? data.blocks : []);

  // ── Measure every row first, so pagination is known before drawing ──
  const rows = blocks.map(b => {
    const cells = {
      time:     [winAnsi(b.time || '—')],
      activity: wrapText(winAnsi(b.activity || 'Untitled block'), 10.5, COLS[1].w - 10, true),
      keyFocus: wrapText(winAnsi(b.keyFocus || ''), 9.5, COLS[2].w - 10),
      coach:    wrapText(winAnsi(b.coach || ''), 9.5, COLS[3].w - 10),
    };
    const lines = Math.max(cells.activity.length, cells.keyFocus.length, cells.coach.length, 1);
    return { cells, h: lines * ROW_LEADING + CELL_PAD_Y * 2 };
  });

  // ── Paginate ──
  const HEADER_BAND_H = 86;
  const page1TableTop = () => {
    // band + title block + status row + column headings
    let y = PAGE_H - HEADER_BAND_H - 40;      // title baseline
    y -= 16;                                  // meta line
    if (statuses.length) y -= 24;             // status chips
    y -= 26;                                  // column headings + rule
    return y;
  };
  const pageNTableTop = () => PAGE_H - 64 - 26;
  const bottomLimit = MARGIN + FOOTER_H;

  const pages = [];                            // each: { rows: [rowIndex…] }
  let current = { rows: [] };
  let y = page1TableTop();
  rows.forEach((row, i) => {
    if (y - row.h < bottomLimit && current.rows.length) {
      pages.push(current);
      current = { rows: [] };
      y = pageNTableTop();
    }
    current.rows.push(i);
    y -= row.h;
  });
  pages.push(current);                         // always at least one page

  // ── Draw ──
  const pageStreams = pages.map((page, p) => {
    let s = '';
    let yTop;
    if (p === 0) {
      // Brand band
      s += rectOp(0, PAGE_H - HEADER_BAND_H, PAGE_W, HEADER_BAND_H, DARKBG);
      s += rectOp(0, PAGE_H - HEADER_BAND_H, PAGE_W, 2.5, GOLD);
      s += textOp(MARGIN, PAGE_H - 32, 10.5, GOLD, 'COACHEASIER', { bold: true, spacing: 2.2 });
      if (club) s += textOp(MARGIN, PAGE_H - 56, 16, '1 1 1', club, { bold: true });
      if (group) s += textOp(MARGIN, PAGE_H - 71, 9.5, '0.72 0.74 0.78', group);
      const right = 'TRAINING SESSION PLAN';
      s += textOp(PAGE_W - MARGIN - textWidth(right, 9, true) - 2.2 * right.length, PAGE_H - 32, 9,
        '0.72 0.74 0.78', right, { bold: true, spacing: 2.2 });
      if (generatedOn) {
        const g = generatedOn;
        s += textOp(PAGE_W - MARGIN - textWidth(g, 9.5), PAGE_H - 56, 9.5, '1 1 1', g);
      }

      // Title + meta
      let ty = PAGE_H - HEADER_BAND_H - 40;
      s += textOp(MARGIN, ty, 20, INK, title, { bold: true });
      const meta = [label && label !== title ? label : '', venue, preparedBy ? `Prepared by ${preparedBy}` : '']
        .filter(Boolean).join('   ·   ');
      ty -= 16;
      if (meta) s += textOp(MARGIN, ty, 9.5, MUTED, winAnsi(meta));

      // Publication chips — the paper answer to "can my players see this?"
      if (statuses.length) {
        ty -= 24;
        let cx = MARGIN;
        statuses.forEach(st => {
          const style = STATUS_STYLE[st.status] || STATUS_STYLE.draft;
          const text = winAnsi(`${String(st.audience || '').toUpperCase()}: ${STATUS_LABEL[st.status] || 'DRAFT'}`
            + (st.publishedAt && st.status !== 'draft' ? ` ${st.publishedAt}` : ''));
          const w = textWidth(text, 7.5, true) + 16;
          s += rectOp(cx, ty - 4.5, w, 15, style.fill);
          s += textOp(cx + 8, ty, 7.5, style.text, text, { bold: true });
          cx += w + 8;
        });
      }
      yTop = page1TableTop() + 26;
    } else {
      s += textOp(MARGIN, PAGE_H - 46, 9, MUTED, winAnsi([club, title].filter(Boolean).join(' · ') + '  (continued)'), { bold: true });
      yTop = pageNTableTop() + 26;
    }

    // Column headings
    COLS.forEach(c => { s += textOp(c.x + (c.key === 'time' ? 0 : 5), yTop - 12, 7.5, MUTED, c.label, { bold: true, spacing: 0.8 }); });
    s += lineOp(MARGIN, yTop - 18, PAGE_W - MARGIN, yTop - 18, GOLD, 1.4);

    // Rows
    let ry = yTop - 18;
    page.rows.forEach((ri, k) => {
      const row = rows[ri];
      if (k % 2 === 1) s += rectOp(MARGIN, ry - row.h, CONTENT_W, row.h, TINT);
      const baseline0 = ry - CELL_PAD_Y - 9.5;
      s += textOp(COLS[0].x, baseline0, 10.5, GOLD, row.cells.time[0], { bold: true });
      row.cells.activity.forEach((ln, li) => { s += textOp(COLS[1].x + 5, baseline0 - li * ROW_LEADING, 10.5, INK, ln, { bold: true }); });
      row.cells.keyFocus.forEach((ln, li) => { s += textOp(COLS[2].x + 5, baseline0 - li * ROW_LEADING, 9.5, INK, ln); });
      row.cells.coach.forEach((ln, li) => { s += textOp(COLS[3].x + 5, baseline0 - li * ROW_LEADING, 9.5, MUTED, ln); });
      ry -= row.h;
      s += lineOp(MARGIN, ry, PAGE_W - MARGIN, ry, LINE, 0.6);
    });

    // Footer
    s += lineOp(MARGIN, MARGIN + 16, PAGE_W - MARGIN, MARGIN + 16, LINE, 0.6);
    const foot = winAnsi(`Generated from CoachEasier${generatedOn ? ` · ${generatedOn}` : ''}`);
    s += textOp(MARGIN, MARGIN + 4, 8, MUTED, foot);
    const pn = `Page ${p + 1} of ${pages.length}`;
    s += textOp(PAGE_W - MARGIN - textWidth(pn, 8), MARGIN + 4, 8, MUTED, pn);
    return s;
  });

  return assemblePdf(pageStreams, title);
}

/** Serialise streams into a complete, xref-correct PDF file. */
function assemblePdf(pageStreams, docTitle) {
  const objects = [];                                     // 1-indexed bodies
  const addObj = body => { objects.push(body); return objects.length; };

  const fontF1 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontF2 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontF3 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

  const pagesId = objects.length + pageStreams.length * 2 + 1;   // reserved after page+stream pairs
  const pageIds = [];
  pageStreams.forEach(stream => {
    const contentId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
      + `/Resources << /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R /F3 ${fontF3} 0 R >> >> `
      + `/Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  const pagesActual = addObj(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  if (pagesActual !== pagesId) throw new Error('PDF object numbering drifted');
  const infoId = addObj(`<< /Title (${pdfEscape(docTitle)}) /Producer (CoachEasier) >>`);
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`
    + `startxref\n${xrefAt}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}

/** A safe, descriptive filename for the download. */
export function sessionPdfFilename({ clubName, sessionTitle, dateISO } = {}) {
  const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return [slug(clubName), slug(sessionTitle) || 'session', dateISO || ''].filter(Boolean).join('-') + '.pdf';
}
