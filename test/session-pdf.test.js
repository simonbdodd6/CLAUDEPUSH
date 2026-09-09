/**
 * Training session PDF + planner Save/Publish/Download workflow.
 *
 * The PDF writer is a pure, dependency-free ES module (src/session-pdf.js) —
 * it is tested here byte-for-byte as a real PDF file: correct xref offsets,
 * WinAnsi text encoding, chronological block order, honest field omission,
 * wrapping and pagination. The planner wiring (save-state chip, Download PDF
 * button, publish controls) is pinned at source level in index.html.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSessionPdf, sessionPdfFilename, winAnsi, wrapText, textWidth, chronological, parseBlockTime,
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

test('PDF-3: blocks are chronological; untimed blocks keep order at the end', () => {
  const s = latin1(buildSessionPdf(SESSION));
  assert.ok(s.indexOf('(19:00)') < s.indexOf('(19:15)'), '19:00 before 19:15');
  assert.ok(s.indexOf('(19:15)') < s.indexOf('(19:40)'), '19:15 before 19:40');
  const order = chronological([
    { time: '', activity: 'a' }, { time: '20:00', activity: 'b' },
    { time: 'x', activity: 'c' }, { time: '09:30', activity: 'd' },
  ]).map(b => b.activity);
  assert.deepEqual(order, ['d', 'b', 'a', 'c'], 'timed sorted; invalid stay stable at the end');
});

// ─── Dot / colon time separator — the production ordering bug ────────────────
// A coach may type a block time with a DOT (18.00) or a COLON (18:30); both mean
// the same clock time (the planner time field is free text). The export parsed
// only ':' , so dot-times fell to the end as "untimed" and the lone colon-time
// floated above them (18:30 above 18.00). Times now sort by minutes-since-
// midnight regardless of separator, and print as a canonical HH:MM.

const orderOf = arr => chronological(arr.map((t, i) => ({ time: t, activity: 'a' + i }))).map(b => b.time);

test('TIME-1: the exact production session sorts chronologically (dot times + one colon)', () => {
  const prod = ['18.00', '18.20', '18.28', '18:30', '18.40', '18.50', '19.02', '19.12', '19.30'];
  const got = orderOf(prod);
  assert.deepEqual(got, ['18.00', '18.20', '18.28', '18:30', '18.40', '18.50', '19.02', '19.12', '19.30'],
    '18:30 sits between 18.28 and 18.40 — never floated to the top');
  assert.notEqual(got[0], '18:30', 'the lone colon-time no longer leads the plan');
});

test('TIME-2: A/B/C — 18:00 < 18:20 < 18:30 and 18:30 after 18:20 (colon or dot)', () => {
  assert.deepEqual(orderOf(['18:30', '18:00', '18:20']), ['18:00', '18:20', '18:30']);
  assert.deepEqual(orderOf(['18.30', '18.00', '18.20']), ['18.00', '18.20', '18.30']);
});

test('TIME-3: D/E — 09:05 < 09:15 < 10:00 (colon or dot)', () => {
  assert.deepEqual(orderOf(['10.00', '09.15', '09.05']), ['09.05', '09.15', '10.00']);
  assert.deepEqual(orderOf(['10:00', '09:15', '09:05']), ['09:05', '09:15', '10:00']);
});

test('TIME-4: F — a single-digit hour parses (9.05 === 09:05) and orders correctly', () => {
  assert.deepEqual(orderOf(['10.00', '9.05', '9.15']), ['9.05', '9.15', '10.00']);
  assert.equal(parseBlockTime('9.05').mins, parseBlockTime('09:05').mins, 'same clock time, either notation');
});

test('TIME-5: G — same-hour minutes order strictly', () => {
  assert.deepEqual(orderOf(['18.50', '18.05', '18.28', '18.00']), ['18.00', '18.05', '18.28', '18.50']);
});

test('TIME-6: H — a dot time and its colon twin are equal keys; entry order breaks the tie (stable)', () => {
  const order = chronological([
    { time: '18:00', activity: 'colon-first' }, { time: '18.00', activity: 'dot-second' },
  ]).map(b => b.activity);
  assert.deepEqual(order, ['colon-first', 'dot-second'], 'equal clock times keep their entry order');
});

test('TIME-7: I/J — the PDF prints canonical HH:MM in chronological order', () => {
  const s = latin1(buildSessionPdf({ blocks: [
    { time: '19.30', activity: 'Late' }, { time: '18.00', activity: 'First' }, { time: '18:30', activity: 'Middle' },
  ] }));
  assert.ok(s.includes('(18:00)') && s.includes('(18:30)') && s.includes('(19:30)'), 'canonical HH:MM printed');
  assert.ok(!s.includes('(18.00)') && !s.includes('(19.30)'), 'no dot-separated times reach the page');
  assert.ok(s.indexOf('(18:00)') < s.indexOf('(18:30)'), '18:00 before 18:30');
  assert.ok(s.indexOf('(18:30)') < s.indexOf('(19:30)'), '18:30 before 19:30');
  assert.ok(s.indexOf('(First)') < s.indexOf('(Middle)') && s.indexOf('(Middle)') < s.indexOf('(Late)'),
    'activities follow their times');
});

test('TIME-8: K/M — content preserved; untimed/invalid stay stable at the end (em dash on the page)', () => {
  const out = chronological([
    { time: '', activity: 'no-time' },
    { time: '18.00', activity: 'timed', keyFocus: 'kf', coach: 'C' },
    { time: '99.99', activity: 'bad-time' },
  ]);
  assert.deepEqual(out.map(b => b.activity), ['timed', 'no-time', 'bad-time'], 'timed first; untimed stable after');
  const timed = out.find(b => b.activity === 'timed');
  assert.equal(timed.time, '18.00', 'the stored time value is not rewritten in state');
  assert.equal(timed.keyFocus, 'kf'); assert.equal(timed.coach, 'C');
  const s = latin1(buildSessionPdf({ blocks: [{ activity: 'solo' }] }));
  assert.ok(s.includes('(' + String.fromCharCode(0x97) + ')'), 'untimed block prints an em dash, not a fabricated time');
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
