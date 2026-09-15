/**
 * Training session PDF + planner Save/Publish/Download workflow.
 *
 * The PDF writer is a pure, dependency-free ES module (src/session-pdf.js) —
 * it is tested here byte-for-byte as a real PDF file: correct xref offsets,
 * WinAnsi text encoding, PLANNER block order, honest field omission,
 * wrapping and pagination. The planner wiring (save-state chip, Download PDF
 * button, publish controls) is pinned at source level in index.html.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSessionPdf, sessionPdfFilename, winAnsi, wrapText, wrapMultiline, textWidth, parseBlockTime,
} from '../src/session-pdf.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const latin1 = bytes => Buffer.from(bytes).toString('latin1');

const SESSION = {
  clubName: 'Wenford RFC', groupName: 'Seniors',
  sessionTitle: 'Attack Shape & Breakdown', sessionLabel: 'Tue 19:00',
  venue: 'Memorial Ground', preparedBy: 'Cara Coach', generatedOn: 'Fri 28 Aug 2026',
  statuses: [
    { audience: 'Coaches', status: 'published', publishedAt: '2026-08-28' },
    { audience: 'Players', status: 'draft', publishedAt: '' },
  ],
  blocks: [
    { time: '19:40', activity: 'Attack shape', keyFocus: '1-3-3-1 — hold width', coach: 'Cara' },
    { time: '19:00', activity: 'Warm-up', keyFocus: 'Raise heart rate', coach: 'Ivo' },
    { time: '19:15', activity: 'Breakdown', keyFocus: 'Clearout technique', coach: 'Cara' },
  ],
};

// ─── The file is a real PDF ─────────────────────────────────────────────────

test('PDF-1: output is a structurally valid PDF file', () => {
  const s = latin1(buildSessionPdf(SESSION));
  assert.ok(s.startsWith('%PDF-1.4'), 'PDF header');
  assert.ok(s.endsWith('%%EOF'), 'EOF marker');
  assert.match(s, /\/Type \/Catalog/); assert.match(s, /\/Type \/Pages/);
  // startxref must point exactly at the xref table — the detail viewers use
  // to open the file, and the easiest thing to silently break.
  const at = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(at, at + 4), 'xref');
  // Every xref offset must land on its own "N 0 obj" line.
  const rows = s.slice(at).match(/^\d{10} 00000 n /gm) || [];
  rows.forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.match(s.slice(off, off + 12), new RegExp(`^${i + 1} 0 obj`), `object ${i + 1} offset`);
  });
  assert.ok(rows.length >= 6, 'fonts + page + stream + pages + info + catalog');
});

test('PDF-2: the document carries the real session data — and only that', () => {
  const s = latin1(buildSessionPdf(SESSION));
  for (const t of ['(Wenford RFC)', '(Seniors)', '(Attack Shape & Breakdown)', '(Warm-up)',
                   '(Breakdown)', '(Attack shape)', '(Raise heart rate)', '(Clearout technique)',
                   '(Ivo)', '(COACHEASIER)']) {
    assert.ok(s.includes(t), `${t} present`);
  }
  assert.ok(s.includes('Prepared by Cara Coach'), 'prepared-by from real user');
  assert.ok(s.includes('COACHES: PUBLISHED 2026-08-28'), 'publish state on paper');
  assert.ok(s.includes('PLAYERS: DRAFT'), 'draft state on paper');
});

test('PDF-3: blocks print in PLANNER order — the stored array, never re-sorted by time', () => {
  // SESSION stores 19:40, 19:00, 19:15 in that order: the page keeps it.
  const s = latin1(buildSessionPdf(SESSION));
  assert.ok(s.indexOf('(19:40)') < s.indexOf('(19:00)'), 'first stored block prints first');
  assert.ok(s.indexOf('(19:00)') < s.indexOf('(19:15)'), 'second before third');
  assert.ok(s.indexOf('(Attack shape)') < s.indexOf('(Warm-up)') && s.indexOf('(Warm-up)') < s.indexOf('(Breakdown)'),
    'activities follow the planner order too');
});

// ─── Time labels: canonical HH:MM on paper, NEVER a change of order ─────────
// The planner shows what the coach typed (18.00 / 1820 / 9.05); the page
// prints the canonical clock label for the same block, in the same place.
const labelsOf = arr => {
  const s = latin1(buildSessionPdf({ blocks: arr.map((t, i) => ({ time: t, activity: 'act' + i })) }));
  return arr.map((_, i) => { const at = s.indexOf('(act' + i + ')'); return { i, at }; })
    .sort((a, b) => a.at - b.at).map(x => x.i);
};

test('TIME-1: the exact production session prints in ITS stored order, whatever the times say', () => {
  const prod = ['18.20', '18.00', '18:30', '18.28', '18.35', '18.50', '18.05'];
  assert.deepEqual(labelsOf(prod), [0, 1, 2, 3, 4, 5, 6], 'stored order preserved');
});

test('TIME-2: dot, colon and compact times all print as canonical HH:MM', () => {
  for (const [raw, label] of [['18.00', '18:00'], ['18:30', '18:30'], ['1820', '18:20'], ['930', '09:30'], ['9.05', '09:05']]) {
    const s = latin1(buildSessionPdf({ blocks: [{ time: raw, activity: 'x' }] }));
    assert.ok(s.includes('(' + label + ')'), raw + ' prints as ' + label);
  }
});

test('TIME-3: an out-of-order plan is NOT reordered — a later time placed first stays first', () => {
  assert.deepEqual(labelsOf(['19:30', '18:00', '18:30']), [0, 1, 2]);
  assert.deepEqual(labelsOf(['10.00', '09.15', '09.05']), [0, 1, 2]);
});

test('TIME-4: an UNTIMED block keeps its position between timed ones (prints an em dash)', () => {
  assert.deepEqual(labelsOf(['18:00', '', '18:30']), [0, 1, 2]);
  const s = latin1(buildSessionPdf({ blocks: [{ activity: 'solo' }] }));
  assert.ok(s.includes('(' + String.fromCharCode(0x97) + ')'), 'untimed block prints an em dash, not a fabricated time');
});

test('TIME-5: a COMPACT time (1820) keeps its position and its label', () => {
  assert.deepEqual(labelsOf(['18:00', '1820', '18:30', '1900']), [0, 1, 2, 3]);
});

test('TIME-6: mixed timed / untimed / malformed — nothing moves, nothing is dropped', () => {
  assert.deepEqual(labelsOf(['', '18.00', '99.99', '18:30', 'x']), [0, 1, 2, 3, 4]);
});

test('TIME-7: the stored time value is never rewritten in the caller\'s data', () => {
  const blocks = [{ time: '18.00', activity: 'timed', keyFocus: 'kf', coach: 'C' }];
  buildSessionPdf({ blocks });
  assert.equal(blocks[0].time, '18.00'); assert.equal(blocks[0].keyFocus, 'kf'); assert.equal(blocks[0].coach, 'C');
});

test('TIME-8: no sort helper remains in the PDF module', async () => {
  const mod = await import('../src/session-pdf.js');
  assert.equal(typeof mod.chronological, 'undefined', 'chronological() is gone — the array order is the order');
  const src = await readFile(new URL('../src/session-pdf.js', import.meta.url), 'utf8');
  assert.ok(!/\.sort\(/.test(src.slice(src.indexOf('export function buildSessionPdf'))), 'buildSessionPdf never sorts');
});

test('TIME-9: L — session metadata and titles are unaffected by the time fix', () => {
  const s = latin1(buildSessionPdf(SESSION));
  for (const t of ['(Wenford RFC)', '(Seniors)', '(Attack Shape & Breakdown)']) assert.ok(s.includes(t), `${t} intact`);
});

test('TIME-10: out-of-range and malformed times are untimed, never mis-sorted', () => {
  for (const bad of ['18.99', '25:00', '18.5', '9', '18:', '', 'x', '1.2.3']) {
    assert.equal(parseBlockTime(bad), null, `${JSON.stringify(bad)} is not a valid clock time`);
  }
  assert.equal(parseBlockTime('00.00').mins, 0, 'midnight is 0, not falsy-dropped');
  assert.equal(parseBlockTime('23:59').mins, 1439);
  assert.equal(parseBlockTime('09.05').label, '09:05', 'canonical zero-padded label');
});

test('PDF-4: absent fields are omitted, never invented', () => {
  const s = latin1(buildSessionPdf({ blocks: [{ activity: 'Solo drill' }] }));
  assert.ok(!s.includes('Prepared by'), 'no invented author');
  assert.ok(!s.includes('PUBLISHED'), 'no invented publish state');
  assert.ok(s.includes('(Solo drill)'), 'the one real field is there');
  assert.ok(s.includes('(Training session)'), 'honest default title only');
  // And a block with no time shows an em dash (0x97), not a fabricated time.
  assert.ok(s.includes('(' + String.fromCharCode(0x97) + ')'), 'untimed block dashes');
});

test('PDF-5: typographic characters are WinAnsi-encoded, not mangled', () => {
  assert.equal(winAnsi('— – “x” ’'), [0x97, 0x20, 0x96, 0x20, 0x93].map(c => String.fromCharCode(c)).join('')
    + 'x' + String.fromCharCode(0x94) + ' ' + String.fromCharCode(0x92));
  assert.equal(winAnsi('café'), 'café', 'Latin-1 passes through');
  // The header meta line is assembled from ALREADY-encoded parts and encoded
  // again; an en dash used to come out as "?" on that second pass.
  assert.equal(winAnsi(winAnsi('14 Sep – 20 Sep')), winAnsi('14 Sep – 20 Sep'), 'encoding is idempotent');
  const hdr = latin1(buildSessionPdf({ sessionTitle: 'TUESDAY', sessionLabel: 'Week of 14 Sep – 20 Sep 2026', blocks: [{ activity: 'x' }] }));
  assert.ok(hdr.includes('Week of 14 Sep ' + String.fromCharCode(0x96) + ' 20 Sep 2026'), 'the en dash reaches the page as one WinAnsi byte');
  assert.ok(!hdr.includes('14 Sep ? 20 Sep'), 'never a question mark');
  assert.equal(winAnsi('→ 🏉'), '-> ?', 'unmappable degrades readably');
  // Parentheses and backslashes cannot break the content stream.
  const s = latin1(buildSessionPdf({ blocks: [{ activity: 'A (contact) drill \\ care' }] }));
  assert.ok(s.includes('(A \\(contact\\) drill \\\\ care)'), 'string delimiters escaped');
});

test('PDF-6: long text wraps to its column and long words cannot escape the cell', () => {
  const colW = 168;
  const lines = wrapText(winAnsi('Clearout technique over the ball; body height under pressure until the picture is automatic'), 9.5, colW);
  assert.ok(lines.length >= 2, 'long note wraps');
  lines.forEach(l => assert.ok(textWidth(l, 9.5) <= colW, `line fits: "${l}"`));
  const hard = wrapText(winAnsi('Supercalifragilisticexpialidociousbreakdownclearoutwork'), 9.5, 80);
  assert.ok(hard.length >= 2, 'an over-long word is hard-broken');
  hard.forEach(l => assert.ok(textWidth(l, 9.5) <= 80, 'no fragment exceeds the cell'));
});

test('PDF-7: a big session paginates, repeats headings and numbers its pages', () => {
  const blocks = Array.from({ length: 40 }, (_, i) => ({
    time: `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
    activity: `Block ${i + 1}`,
    keyFocus: 'A reasonably long coaching note so each row takes realistic vertical space on the page.',
    coach: 'Cara',
  }));
  const s = latin1(buildSessionPdf({ ...SESSION, blocks }));
  const pageCount = (s.match(/\/Type \/Page[^s]/g) || []).length;
  assert.ok(pageCount >= 2, `40 blocks span pages (got ${pageCount})`);
  assert.ok(s.includes(`(Page 1 of ${pageCount})`) && s.includes(`(Page ${pageCount} of ${pageCount})`), 'numbered footers');
  assert.equal((s.match(/\(ACTIVITY\)/g) || []).length, pageCount, 'column headings repeat per page');
  assert.ok(s.includes('\\(continued\\)'), 'later pages say so (parens escaped in the stream)');
  assert.ok(s.includes('(Block 1)') && s.includes('(Block 40)'), 'no block is dropped');
});

test('PDF-8: filename is safe and descriptive', () => {
  assert.equal(sessionPdfFilename({ clubName: 'Wenford RFC', sessionTitle: 'Attack Shape & Breakdown!', dateISO: '2026-08-28' }),
    'wenford-rfc-attack-shape-breakdown-2026-08-28.pdf');
  assert.equal(sessionPdfFilename({}), 'session.pdf', 'never an empty or dotted-only name');
});

// ─── Planner wiring ─────────────────────────────────────────────────────────

function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)); let d = 0;
  for (let b = i; b < html.length; b++) {
    if (html[b] === '{') d++;
    else if (html[b] === '}') { d--; if (d === 0) { i = b; break; } }
  }
  return html.slice(start, i + 1);
}

test('WIRE-1: the planner answers "did that save?" without ever rendering', () => {
  const ping = fn('tpSavePing');
  assert.match(ping, /getElementById\('tp-save-chip'\)/, 'chip is updated by direct DOM write');
  assert.doesNotMatch(ping, /[^a-zA-Z_.]render(Training)?\(\)/,
    'a render here would destroy the field being typed in — the exact fee78190 bug');
  // Honesty: the chip reads the REAL outcome of the save that just ran.
  assert.match(ping, /_lastDeviceSaveOk/, 'chip reflects the actual device-save outcome');
  const save = fn('saveState');
  assert.match(save, /_lastDeviceSaveOk = true/, 'success recorded');
  assert.match(save, /_lastDeviceSaveOk = false/, 'failure recorded');
  assert.match(fn('_tpSaveChipText'), /Not saved/, 'failure copy exists');
  // Every editing chain pings. In source that is 5 occurrences: the shared
  // ta() builder (covering all three textareas), the time input, the remove
  // button, and both add-block controls.
  assert.ok((html.match(/;tpSavePing\(\)/g) || []).length >= 5, 'all planner mutations ping the chip');
  assert.ok(html.includes('id="tp-save-chip"'), 'chip rendered in the planner header');
});

test('WIRE-2: Download PDF is a real control with truthful states', () => {
  const dl = fn('trainingDownloadPdf');
  assert.match(dl, /import\('\.\/src\/session-pdf\.js'\)/, 'lazy same-origin module, like fixture-import');
  assert.match(dl, /_tpPdfBusy/, 'double-click guarded');
  assert.match(dl, /application\/pdf/, 'downloads a real PDF blob');
  assert.match(dl, /revokeObjectURL/, 'object URL is released');
  assert.match(dl, /Add blocks to the plan first/, 'empty session refuses honestly');
  assert.match(dl, /catch/, 'failure is caught and reported');
  assert.match(dl, /keyFocus: b\.keyFocus \|\| b\.tag/, 'same fallback the coach sheet uses — no invented focus');
  // Button appears only when there are blocks to download.
  assert.match(html, /\$\{blocks\.length \? `<button[^`]*tp-pdf-btn[^`]*Download PDF<\/button>` : ''\}/,
    'button gated on real content');
});

test('WIRE-3: publish controls are unchanged and sit with the new actions', () => {
  assert.match(html, /pub-coach-\$\{esc\(sessId\)\}/, 'publish to coaches intact');
  assert.match(html, /pub-player-\$\{esc\(sessId\)\}/, 'publish to players intact');
  const pub = fn('trainingPublishTo');
  assert.match(pub, /canI\('publish_training'\)/, 'permission gate untouched');
  assert.match(pub, /ceConfirm/, 'confirmation flow untouched');
  // The PDF's status chips read the same publication state the badges use.
  assert.match(fn('trainingDownloadPdf'), /trainingAudienceStatus\(sessionId, aud\)/,
    'paper status comes from the live publication model, not a copy');
  assert.match(fn('trainingDownloadPdf'), /canI\('publish_training'\)/,
    'publication state is only printed for those entitled to see it');
});

test('WIRE-4: the stability contract survives this build', () => {
  // The three fee78190 guarantees the new UI must not undo:
  const add = fn('addTimeBlock');
  assert.match(add, /insertAdjacentHTML/, 'adding still appends one row');
  const marked = fn('trainingMarkEdited');
  assert.match(marked, /contains\(document\.activeElement\)/, 'mid-edit render guard still present');
  const sizer = fn('trainingAutosizeBlocks');
  assert.doesNotMatch(sizer, /setTimeout\(size, 1[0-9]{2}\)/, 'no post-paint autosize pass');
});

// ── COMPACT TIMES (TRAINING-PDF-ORDER-FIX-1, re-pinned for planner order) ───
// The planner time field is free text, so a coach may type a compact HMM/HHMM
// (930, 1820) as well as the separated 9:30 / 18.30. The PDF no longer sorts
// anything — the page follows the planner array — so these pin two things:
// compact times PARSE (and print) as the same clock time as their separated
// form, and no time format can move a block from where the coach put it.

// Position of each block on the page, by its activity text, in page order.
const pageOrder = times => {
  const s = latin1(buildSessionPdf({ blocks: times.map((t, i) => ({ time: t, activity: 'blk' + i })) }));
  return times.map((_, i) => ({ i, at: s.indexOf('(blk' + i + ')') })).sort((a, b) => a.at - b.at).map(x => x.i);
};
const identity = n => Array.from({ length: n }, (_, i) => i);

test('CPT-1: colon times print in planner order, even out of clock order', () => {
  assert.deepEqual(pageOrder(['19:15', '19:00', '19:40']), identity(3));
});

test('CPT-2: dot times print in planner order', () => {
  assert.deepEqual(pageOrder(['19.15', '19.00', '19.40']), identity(3));
});

test('CPT-3: compact HHMM blocks keep their position', () => {
  assert.deepEqual(pageOrder(['19:00', '1830', '1820', '18:00']), identity(4));
});

test('CPT-4: a session mixing colon + dot + compact keeps its planner order', () => {
  assert.deepEqual(pageOrder(['19.05', '1820', '18:00', '18.45', '1910']), identity(5));
});

test('CPT-5: single-digit-hour compact (800, 930, 1000) parses', () => {
  assert.equal(parseBlockTime('800').mins, 480);
  assert.equal(parseBlockTime('930').mins, 570);
  assert.equal(parseBlockTime('1000').mins, 600);
  assert.deepEqual(pageOrder(['1000', '930', '800']), identity(3), 'and nothing is reordered');
});

test('CPT-6: invalid / untimed values are unchanged — bare and out-of-range stay untimed, in place', () => {
  for (const bad of ['8', '18', '60', '18.99', '25:00', '1899', '2500', '18.5', '1.2.3', '', 'x', '6pm']) {
    assert.equal(parseBlockTime(bad), null, `${JSON.stringify(bad)} is not a clock time`);
  }
  assert.deepEqual(pageOrder(['1830', '6pm', '1820']), identity(3));
  const s = latin1(buildSessionPdf({ blocks: [{ time: '6pm', activity: 'verbatim' }] }));
  assert.ok(s.includes('(6pm)'), 'an unparseable time keeps its verbatim text');
});

test('CPT-7: equal clock times in three spellings keep insertion order', () => {
  assert.deepEqual(pageOrder(['1820', '18:20', '18.20']), identity(3));
});

test('CPT-8: a chronologically entered planner session is printed exactly as entered', () => {
  assert.deepEqual(pageOrder(['09:00', '915', '09.30', '1000', '10:15']), identity(5));
});

test('CPT-9: exact U18 reproduction — 1820 sits where the coach put it', () => {
  assert.deepEqual(pageOrder(['18:00', '1820', '18:32', '18:44', '18:50', '18:55', '19:05', '19:18', '19:30']), identity(9));
});

test('CPT-10: exact Seniors reproduction — 1830 sits where the coach put it', () => {
  assert.deepEqual(pageOrder(['18.00', '18.15', '1830', '18.45', '19.00']), identity(5));
});

test('CPT-11: compact and separated forms parse identically', () => {
  assert.deepEqual(parseBlockTime('1820'), parseBlockTime('18:20'));
  assert.deepEqual(parseBlockTime('1830'), parseBlockTime('18:30'));
  assert.deepEqual(parseBlockTime('930'), parseBlockTime('9:30'));
});

test('CPT-12: compact times print the canonical HH:MM on the page (never the raw digits)', () => {
  const s = latin1(buildSessionPdf({ blocks: [
    { time: '1820', activity: 'A' }, { time: '930', activity: 'B' }, { time: '1830', activity: 'C' },
  ] }));
  assert.ok(s.includes('(18:20)') && s.includes('(09:30)') && s.includes('(18:30)'), 'canonical labels printed');
  assert.ok(!s.includes('(1820)') && !s.includes('(930)') && !s.includes('(1830)'), 'raw compact digits never printed');
});
