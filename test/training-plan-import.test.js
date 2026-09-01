/**
 * TRAINING PLAN IMPORT — CSV / Excel.
 *
 * A second way to build the SAME plan: imported rows become ordinary blocks
 * in state.trainingBlocks[sessionId], through the existing persistence. There
 * is no parallel "imported plan" model, no import-specific storage key, and
 * no locked rows.
 *
 * Pinned here: a real (quote/newline-safe) CSV parser; a values-only .xlsx
 * reader built on Core's ONE shared SheetJS loader (see the data-descriptor
 * regression below for why the previous hand-rolled zip walk was replaced), and
 * formulas are never evaluated; preview/cancel/parse-failure mutate nothing;
 * Append and Replace behave explicitly (Replace confirms first); a
 * spreadsheet can never carry club/team/group/scope/user identity into the
 * app; and the group-specific start time from 7247036 stays authoritative
 * when the sheet omits one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}
function constant(name) {
  const i = src.indexOf(`const ${name} =`);
  assert.ok(i > 0, `${name} exists`);
  const end = src.indexOf('\n    const ', i + 10);
  return src.slice(i, end > 0 ? end : i + 900);
}

/** The pure parsing/validation core, evaluated exactly as shipped. */
const core = new Function(`
  "use strict";
  ${fn('csvParse')}
  ${fn('addMinutesHHMM')}
  ${constant('TRAINING_IMPORT_FIELDS')}
  const TRAINING_IMPORT_MAX_ROWS = 200;
  const normHead = h => String(h || '').trim().toLowerCase().replace(/\\s+/g, ' ');
  ${fn('trainingImportPlan')}
  ${fn('trainingImportToBlocks')}
  return { csvParse, trainingImportPlan, trainingImportToBlocks, addMinutesHHMM };
`)();

const CSV_OK = [
  'Start,Duration,Activity,Details,Lead coach',
  '19:00,15,Warm-up,"Raise heart rate, activate shoulders",Simon',
  '19:15,25,Ruck contest,"Body height, clear past the ball",Ana',
  '',
  '19:40,20,Attack shape,Depth off 9,',
].join('\r\n');

// ─── 3+4+5: parsing ────────────────────────────────────────────────────────
test('3+4+5: valid CSV parses; quoted commas survive; blank rows are ignored; CRLF handled', () => {
  const rows = core.csvParse(CSV_OK);
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.usable, 3, 'the blank row is ignored');
  assert.equal(plan.blocks[0].keyFocus, 'Raise heart rate, activate shoulders', 'quoted comma kept in one cell');
  assert.deepEqual(plan.blocks.map(b => b.activity), ['Warm-up', 'Ruck contest', 'Attack shape'], 'order preserved');
});

test('quoted multi-line cells and escaped quotes parse correctly', () => {
  const rows = core.csvParse('Start,Activity,Details\n19:00,Warm-up,"line one\nline two ""quoted"""');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][2], 'line one\nline two "quoted"');
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  assert.equal(plan.blocks[0].keyFocus, 'line one\nline two "quoted"');
});

test('a UTF-8 BOM and trailing newline do not break the heading row', () => {
  const rows = core.csvParse('﻿Start,Activity\n19:00,Warm-up\n');
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.blocks[0].activity, 'Warm-up');
});

// ─── 6+7: mapping ──────────────────────────────────────────────────────────
test('6: correct headings auto-map (including obvious aliases and odd casing/spacing)', () => {
  const rows = core.csvParse(' start TIME ,Title,Coaching Points,Coach\n19:00,Warm-up,Shoulders,Simon');
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.deepEqual(
    { t: plan.blocks[0].time, a: plan.blocks[0].activity, k: plan.blocks[0].keyFocus, c: plan.blocks[0].coach },
    { t: '19:00', a: 'Warm-up', k: 'Shoulders', c: 'Simon' });
});

test('7: a missing Activity column is a clear, non-destructive validation failure', () => {
  const rows = core.csvParse('Start,Details\n19:00,Something');
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  assert.equal(plan.ok, false);
  assert.match(plan.errors.join(' '), /No "Activity" column/);
  // …and the coach can map a column by hand instead.
  const mapped = core.trainingImportPlan(rows, { firstStart: '19:00', mapping: { '1': 'activity' } });
  assert.equal(mapped.ok, true, JSON.stringify(mapped.errors));
  assert.equal(mapped.blocks[0].activity, 'Something');
});

test('duplicate headings and unknown columns are reported, not silently merged', () => {
  const dup = core.trainingImportPlan(core.csvParse('Activity,Activity\nA,B'), {});
  assert.match(dup.errors.join(' '), /Duplicate column heading/);
  const extra = core.trainingImportPlan(core.csvParse('Activity,Weather\nWarm-up,Rain'), { firstStart: '19:00' });
  assert.equal(extra.ok, true);
  assert.deepEqual(extra.ignored, ['Weather'], 'unsupported column noted and ignored');
});

// ─── 8: row-level validation ───────────────────────────────────────────────
test('8: an invalid time or duration produces a row-level error and blocks the import', () => {
  const plan = core.trainingImportPlan(core.csvParse('Start,Activity\n25:90,Warm-up\n19:00,Ruck'), { firstStart: '19:00' });
  assert.equal(plan.ok, false, 'fail-before-apply');
  assert.match(plan.errors.join(' '), /Row 2 — invalid start time "25:90"/);
  const dur = core.trainingImportPlan(core.csvParse('Duration,Activity\nages,Warm-up'), { firstStart: '19:00' });
  assert.match(dur.errors.join(' '), /Row 2 — invalid duration "ages"/);
  const empty = core.trainingImportPlan(core.csvParse('Start,Activity\n19:00,'), { firstStart: '19:00' });
  assert.match(empty.errors.join(' '), /Row 2 — "Activity" is empty/, 'required data is never silently dropped');
});

test('an unreasonable row count fails safely instead of flooding the planner', () => {
  const rows = [['Start', 'Activity'], ...Array.from({ length: 250 }, (_, i) => ['19:00', 'Block ' + i])];
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  assert.equal(plan.ok, false);
  assert.match(plan.errors.join(' '), /imports up to 200/);
});

// ─── 14+23: timing, incl. the group-specific start ─────────────────────────
test('14+23: explicit times are kept; omitted times sequence from THIS group\'s start time', () => {
  const explicit = core.trainingImportPlan(core.csvParse(CSV_OK), { firstStart: '17:45' });
  assert.deepEqual(explicit.blocks.map(b => b.time), ['19:00', '19:15', '19:40'], 'the sheet wins when it states times');

  const noTimes = core.trainingImportPlan(
    core.csvParse('Activity,Duration\nWarm-up,15\nRuck,25\nAttack,'), { firstStart: '17:45' });
  assert.deepEqual(noTimes.blocks.map(b => b.time), ['17:45', '18:00', '18:25'],
    'first block opens at the U18-style group time; later blocks follow the stated durations');

  const senior = core.trainingImportPlan(core.csvParse('Activity\nWarm-up\nRuck'), { firstStart: '19:45' });
  assert.deepEqual(senior.blocks.map(b => b.time), ['19:45', '20:15'], 'no durations → the planner\'s usual 30-minute step');

  const unknown = core.trainingImportPlan(core.csvParse('Activity\nWarm-up'), { firstStart: '' });
  assert.equal(unknown.blocks[0].time, '', 'a group with no configured time invents nothing');
});

// ─── 13+15+16: content exact, identity never imported ──────────────────────
test('13: imported text is preserved exactly, including punctuation and quotes', () => {
  const plan = core.trainingImportPlan(core.csvParse(CSV_OK), { firstStart: '19:00' });
  const blocks = core.trainingImportToBlocks(plan.blocks);
  assert.equal(blocks[1].activity, 'Ruck contest');
  assert.equal(blocks[1].keyFocus, 'Body height, clear past the ball');
  assert.equal(blocks[1].coach, 'Ana');
  assert.equal(blocks[2].coach, '', 'empty optional cell stays empty, never "undefined"');
});

test('15+16: a spreadsheet can never set group, tenant, user or scope — only block fields exist', () => {
  const rows = core.csvParse([
    'Start,Activity,groupId,teamId,clubId,userId,accessScope,role',
    '19:00,Warm-up,grp_2b0aa7f9,other-club,other-club,user_hacker,"{""clubWide"":true}",admin',
  ].join('\n'));
  const plan = core.trainingImportPlan(rows, { firstStart: '19:00' });
  const blocks = core.trainingImportToBlocks(plan.blocks);
  assert.deepEqual(Object.keys(blocks[0]).sort(), ['activity', 'coach', 'id', 'keyFocus', 'tag', 'time'].sort(),
    'ONLY block fields are produced');
  const json = JSON.stringify(blocks);
  for (const forbidden of ['grp_2b0aa7f9', 'other-club', 'user_hacker', 'clubWide', 'admin']) {
    assert.equal(json.includes(forbidden), false, `${forbidden} never reaches the plan`);
  }
  assert.deepEqual(plan.ignored, ['groupId', 'teamId', 'clubId', 'userId', 'accessScope', 'role'],
    'identity columns are reported as ignored, not obeyed');
});

test('11+12: blocks are created 1:1, in order, with unique ids and the native block shape', () => {
  const plan = core.trainingImportPlan(core.csvParse(CSV_OK), { firstStart: '19:00' });
  const blocks = core.trainingImportToBlocks(plan.blocks);
  assert.equal(blocks.length, plan.usable);
  assert.equal(new Set(blocks.map(b => b.id)).size, blocks.length, 'unique ids');
  assert.ok(blocks.every(b => /^tb\d+/.test(b.id) && b.tag === 'General'), 'same shape as a manually added block');
  assert.deepEqual(blocks.map(b => b.activity), ['Warm-up', 'Ruck contest', 'Attack shape']);
});

// ─── 9+10+17+18+19+26: state transitions ───────────────────────────────────
function applyHarness({ existing = [], mode, confirm = true, planOk = true }) {
  return new Function(`
    "use strict";
    const state = { trainingBlocks: { 'sess-1': ${JSON.stringify(existing)} } };
    const calls = { saves: [], syncs: 0, toasts: [], confirms: [] };
    let _trainingImportOpen = true;
    let _trainingImport = {
      sessionId: 'sess-1',
      plan: { ok: ${JSON.stringify(planOk)}, usable: 2, errors: [], blocks: [
        { time: '19:00', activity: 'Imported A', keyFocus: 'x', coach: '' },
        { time: '19:30', activity: 'Imported B', keyFocus: '', coach: 'Ana' }] },
    };
    function saveState(m) { calls.saves.push(m); }
    function syncPublishedSessionEdit() { calls.syncs++; }
    function render() {}
    function showToast(t) { calls.toasts.push(t); }
    async function ceConfirm(title, body) { calls.confirms.push(title); return ${JSON.stringify(confirm)}; }
    ${fn('trainingImportToBlocks')}
    ${fn('trainingImportApply')}
    ${fn('trainingImportCancel')}
    return trainingImportApply(${JSON.stringify(mode)}).then(() => ({
      blocks: state.trainingBlocks['sess-1'], calls,
      importCleared: _trainingImport === null, panelClosed: _trainingImportOpen === false,
    }));
  `)();
}

test('11+17+18: Append preserves every existing block and adds the imported ones after them', async () => {
  const r = await applyHarness({ existing: [{ id: 'b1', time: '18:00', activity: 'Existing' }], mode: 'append' });
  assert.deepEqual(r.blocks.map(b => b.activity), ['Existing', 'Imported A', 'Imported B']);
  assert.deepEqual(r.blocks[0], { id: 'b1', time: '18:00', activity: 'Existing' }, 'existing block untouched');
  assert.deepEqual(r.calls.confirms, [], 'appending needs no confirmation');
  assert.deepEqual(r.calls.saves, ['Training plan imported']);
  assert.equal(r.calls.syncs, 1, 'saved through the EXISTING planner persistence');
  assert.ok(r.importCleared && r.panelClosed);
});

test('19: Replace only replaces after an explicit confirmation — declining changes nothing', async () => {
  const declined = await applyHarness({ existing: [{ id: 'b1', activity: 'Existing' }], mode: 'replace', confirm: false });
  assert.deepEqual(declined.blocks.map(b => b.activity), ['Existing'], 'plan untouched');
  assert.equal(declined.calls.syncs, 0, 'nothing saved');
  assert.equal(declined.calls.confirms.length, 1, 'the coach was asked');

  const accepted = await applyHarness({ existing: [{ id: 'b1', activity: 'Existing' }], mode: 'replace', confirm: true });
  assert.deepEqual(accepted.blocks.map(b => b.activity), ['Imported A', 'Imported B'], 'replaced');
});

test('an empty plan applies directly (no confirmation needed) and never asks about replacing nothing', async () => {
  const r = await applyHarness({ existing: [], mode: 'replace' });
  assert.deepEqual(r.blocks.map(b => b.activity), ['Imported A', 'Imported B']);
  assert.deepEqual(r.calls.confirms, []);
});

test('9+10+26: preview, Cancel and a failed parse mutate the planner ZERO times', async () => {
  // A failed plan can never be applied.
  const failed = await applyHarness({ existing: [{ id: 'b1', activity: 'Existing' }], mode: 'append', planOk: false });
  assert.deepEqual(failed.blocks.map(b => b.activity), ['Existing']);
  assert.equal(failed.calls.syncs, 0);
  // Preview + Cancel: the only writer is trainingImportApply.
  const parseOnly = fn('trainingImportFile');
  assert.doesNotMatch(parseOnly, /state\.trainingBlocks/, 'parsing never writes planner state');
  assert.doesNotMatch(fn('trainingImportPlan'), /state\./, 'validation is pure');
  assert.doesNotMatch(fn('trainingImportCancel'), /state\.trainingBlocks/, 'cancel writes nothing');
  assert.match(fn('trainingImportCancel'), /_trainingImport = null/);
});

// ─── 1+2+20+21+22+24+25+27: the planner is unchanged around it ─────────────
test('1+2: both routes are offered — the manual planner is untouched and import sits beside it', () => {
  const panel = fn('trainingImportPanelHTML');
  assert.match(panel, /Plan manually/);
  assert.match(panel, /Import CSV \/ Excel/);
  // CONTRACT CHANGE (occurrence-identity fix): the planner passes the dated
  // CONTENT key (ck) so imported blocks land on the occurrence being viewed —
  // the bare protocol id changed meaning every Monday. Mounting, both routes
  // and the manual affordances are otherwise exactly as before.
  assert.match(src, /\$\{trainingImportPanelHTML\(ck\)\}/, 'mounted in the planner');
  assert.match(src, /onclick="addTimeBlock\('\$\{ck\}'\)/, 'manual Add block still there');
  assert.ok(!/trainingImportPanelHTML\(sessId\)/.test(src),
    'no import mount writes under the protocol id');
  assert.match(fn('addTimeBlock'), /activity: ""/, '7247036 empty-block behaviour intact');
  assert.match(fn('trainingPlannedStartTime'), /_trainingScheduleGroupId !== trainingGroupParam/, 'group-time rule intact');
});

test('20+21+24+25: imported blocks are native — same shape, same persistence, no parallel storage', () => {
  const apply = fn('trainingImportApply');
  assert.match(apply, /state\.trainingBlocks\[sessionId\]/, 'writes the ordinary planner state');
  assert.match(apply, /syncPublishedSessionEdit\(sessionId\)/, 'ordinary persistence path');
  assert.doesNotMatch(apply, /fetch\(/, 'no import-specific server call');
  assert.doesNotMatch(apply, /localStorage/, 'no import-specific storage key');
  assert.doesNotMatch(src, /trainingImportedBlocks|imported_plan|importedPlan/, 'no parallel imported-plan model anywhere');
});

test('27+30: nothing from a file is executed — xlsx reads cached values only, never formulas', () => {
  const x = fn('xlsxParse');
  // sheet_to_json returns each cell's CACHED VALUE; formula text is never
  // returned and nothing in the file is evaluated. Same guarantee as before,
  // now carried by the shared reader instead of a bespoke one.
  assert.match(x, /sheet_to_json/, 'values are read through the workbook reader');
  assert.doesNotMatch(x, /eval\(|new Function|innerHTML/, 'no execution path for file content');
  assert.match(x, /formula/i, 'formula handling is documented as ignored');
  // Authorization/tenant code is not touched by import at all.
  assert.doesNotMatch(fn('trainingImportApply'), /accessScope|teamId|groupId/, 'import cannot reach authorization inputs');
});

test('28: .xlsx is read as a workbook and degrades honestly when the READER cannot load', () => {
  const file = fn('trainingImportFile');
  assert.match(file, /\\\.xlsx\$\/i/, 'xlsx recognised by extension');
  assert.match(file, /await xlsxParse\(await file\.arrayBuffer\(\)\)/, 'binary is parsed as a workbook, never as CSV text');
  assert.doesNotMatch(file, /csvParse\(await file\.text\(\)\)[\s\S]{0,80}xlsx/, 'binary is never fed to the CSV parser');
  // The reader is fetched on demand, so the only honest xlsx-side failure is a
  // reader that could not be LOADED. It must never again blame the browser.
  assert.match(file, /reader could not be loaded/i, 'names the real failure');
  assert.doesNotMatch(file, /This browser cannot open/i,
    'the browser was never the problem — a real Excel file failed on a parser defect');
});

test('29: the import panel is phone-friendly (no fixed wide layout; preview scrolls in its own box)', () => {
  const panel = fn('trainingImportPanelHTML');
  assert.match(panel, /flex-wrap:wrap/, 'controls wrap on narrow screens');
  assert.match(panel, /overflow-x:auto/, 'the preview table scrolls inside its own container');
  assert.doesNotMatch(panel, /min-width:\s*[5-9]\d\dpx/, 'no wide fixed minimum that would overflow a phone');
});

test('the downloadable template matches the canonical columns exactly', () => {
  const t = fn('trainingImportTemplate');
  assert.match(t, /TRAINING_IMPORT_FIELDS\.map\(f => f\.label\)/, 'headings come from the one field definition');
  assert.match(t, /coacheasier-training-plan-template\.csv/);
  assert.doesNotMatch(t, /fetch\(|\/api\//, 'generated in the browser — no server endpoint');
});


// ── REGRESSION: Excel-authored .xlsx (data descriptors) ────────────────────
//
// PRODUCTION BUG. A genuine Excel-authored workbook ("training BRC 26-27.xlsx",
// 17,710 bytes) failed with "This browser cannot open .xlsx files… Save As CSV",
// while CSV imported fine and DecompressionStream was available all along.
//
// Cause: the reader walked LOCAL FILE HEADERS and skipped any entry whose
// header carried compSize/uncompSize of 0 —
//     if (!compSize && !uncompSize) continue;   // "streamed entry: skip"
// Excel sets general-purpose bit 3 on EVERY entry (flag 0x0808) and puts the
// real sizes in a trailing data descriptor, leaving zeros in the header. So
// every entry was skipped, no worksheet was found, and the reader returned null.
// Files from Numbers/Sheets/LibreOffice store sizes inline, which is why this
// survived testing.
//
// The fix is not a better zip walk (next: zip64, then workbook ordering, then
// date formats) — it is to stop having a second zip implementation at all.

test('R1: the bespoke local-file-header zip walk is gone', () => {
  const x = fn('xlsxParse');
  assert.doesNotMatch(x, /0x50|0x4b|PK\\x03/, 'no hand-rolled zip signature scan');
  assert.doesNotMatch(x, /compSize|uncompSize|nameLen|extraLen|dataStart/, 'no local-header field arithmetic');
  assert.doesNotMatch(x, /DecompressionStream/, 'no second inflate implementation');
  // The exact line that caused the bug must not exist anywhere in the app.
  assert.doesNotMatch(src, /streamed entry: skip/, 'the skip that dropped every Excel entry is gone');
  assert.doesNotMatch(src, /!compSize && !uncompSize/, 'zero-size entries are no longer silently dropped');
});

test('R2: one reader, one loader — the planner and the squad import share it', () => {
  assert.match(src, /function ensureSheetJS\s*\(/, 'a single shared loader exists');
  // Exactly one place fetches the library.
  const srcTags = (src.match(/cdn\.sheetjs\.com/g) || []).length;
  assert.equal(srcTags, 1, `the CDN URL appears once, not per-importer (found ${srcTags})`);
  assert.match(fn('xlsxParse'), /ensureSheetJS\(\)/, 'the planner reader uses the shared loader');
  assert.match(fn('importPlayersFromFile'), /ensureSheetJS\(\)/, 'the squad import uses the same loader');
  assert.doesNotMatch(fn('importPlayersFromFile'), /createElement\('script'\)/, 'no duplicated loader block');
});

test('R3: the origin the loader uses is CSP allow-listed', async () => {
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  const csp = JSON.parse(vercel).headers.flatMap(h => h.headers).find(h => /content-security-policy/i.test(h.key))?.value || '';
  assert.match(csp, /script-src[^;]*https:\/\/cdn\.sheetjs\.com/, 'script-src permits the reader origin');
});

test('R4: the sheet is chosen by WORKBOOK ORDER, never by filename', () => {
  const x = fn('xlsxParse');
  assert.match(x, /SheetNames\[0\]/, 'first sheet as the workbook defines it');
  assert.doesNotMatch(x, /sheet1\.xml|worksheets\//, 'never picks a sheet by file path');
  // The failing workbook had five sheets; xl/worksheets/sheet1.xml is not
  // reliably the one the author sees first.
});

test('R5: a loader failure is reported as such, and never as a browser limitation', () => {
  const file = fn('trainingImportFile');
  assert.match(file, /catch \(loadErr\)/, 'a failed load is caught rather than surfacing as "unreadable file"');
  assert.match(file, /check your connection/i, 'the message names the actual remedy');
  assert.match(file, /no readable sheet/i, 'an empty workbook is a distinct, honest message');
  assert.doesNotMatch(src, /This browser cannot open \.xlsx/, 'the false claim is gone from the app entirely');
});

test('R6: the CSV path and the manual planner are untouched by this change', () => {
  const file = fn('trainingImportFile');
  assert.match(file, /csvParse\(await file\.text\(\)\)/, 'CSV still parsed as text');
  assert.match(fn('csvParse'), /"/, 'the quote-aware CSV parser is unchanged');
  // Import remains preview-then-apply, writing ordinary planner state.
  assert.match(fn('trainingImportApply'), /state\.trainingBlocks\[sessionId\]/);
});
