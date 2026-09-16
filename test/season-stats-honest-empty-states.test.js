/**
 * MEMBERS · SEASON STATISTICS — honest empty states.
 *
 * One surface, two ways of saying something it did not know:
 *
 *   1. exportSeasonStatsCSV blanked the attendance RATE when the register was
 *      unknown (cold read, or the coach lacks the attendance scope) but wrote a
 *      hard 0 into "Sessions present" and "Sessions held" on the very same row.
 *      A coach opening that file read "held 0 sessions, attended none" — an
 *      unknown presented as a fact, and the exact fabricated zero the feature's
 *      own docblock forbids.
 *
 *   2. seasonStatsHtml described a season read that had FAILED as "Loading this
 *      season's team sheets…", for ever. seasonSheetsFailed() exists precisely
 *      to separate "not arrived yet" from "asked and got an error", and was
 *      consulted at one call site only — so the profile's Appearances card and
 *      the Members table gave different accounts of the same failure.
 *
 * Both fixes are presentation-only: the aggregations (attendanceStats,
 * seasonPlayerStats) and the lazy-load behaviour are untouched, and this suite
 * asserts that too.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const textOf = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ═══ 1 · THE CSV EXPORT ═════════════════════════════════════════════════════

/**
 * Runs the REAL exportSeasonStatsCSV. `register` is what currentAttendance()
 * answers — null for a cold read that has only just started loading,
 * { denied:true } for a coach without the attendance scope, or a loaded
 * register whose figures attendanceStats() then reports.
 */
function runExport({ rows, register, stats = {} } = {}) {
  const calls = { toast: [], csv: null };
  const body =
    '"use strict";\n' +
    'const CALLS = arguments[0], ROWS = arguments[1], REG = arguments[2], STATS = arguments[3];\n' +
    'const state = { clubName: "Boitsfort", seasonStart: "2026-08-01", seasonEnd: "2027-06-30" };\n' +
    'function isCoach(){ return true; }\n' +
    'function showToast(m){ CALLS.toast.push(m); }\n' +
    'function currentSeasonSheets(){ return { sheets: [{}] }; }\n' +
    'function seasonPlayerStats(){ return { byPlayer: {} }; }\n' +
    'function operationalPlayers(){ return []; }\n' +
    'function seasonTableRows(){ return { rows: ROWS, offSquad: 0 }; }\n' +
    'function currentAttendance(){ return REG; }\n' +
    'function attendanceStats(_s, key){ return STATS[key] || { attendancePct: null, present: 0, held: 0 }; }\n' +
    'function availToday(){ return "2026-09-15"; }\n' +
    'const URL = { createObjectURL: () => "blob:x" };\n' +
    'function Blob(parts){ CALLS.csv = parts.join(""); }\n' +
    'const document = { createElement: () => ({ set href(v){}, set download(v){}, click(){} }) };\n' +
    extractFn(html, 'exportSeasonStatsCSV') + '\n' +
    'exportSeasonStatsCSV();\n' +
    'return CALLS;';
  return new Function(body)(calls, rows, register, stats);
}

const ROW = { key: 'id:u1', name: 'Alex', position: 'Prop', appearances: 5, starts: 4,
  benchAppearances: 1, subsOn: 1, subsOff: 2, minutes: 320, playingTimePct: 72 };

/** The cells of the single data row, in header order. */
const cellsOf = csv => csv.split('\n')[1].split(',').map(c => c.replace(/^"|"$/g, ''));
const ATT_COLS = { pct: 2, present: 3, held: 4 };

test('DEFECT: a COLD register exports blank counts, not "0 present of 0 held"', () => {
  // currentAttendance() answers null on the first read and merely starts the
  // load — which is what happens on the first Export CSV click after opening
  // Members without having visited Training → Attendance.
  const c = cellsOf(runExport({ rows: [ROW], register: null }).csv);
  assert.equal(c[ATT_COLS.pct], '', 'the rate was already blank');
  assert.equal(c[ATT_COLS.present], '', 'and the count beside it must be blank too, never 0');
  assert.equal(c[ATT_COLS.held], '', 'nobody has read the register, so no denominator is known');
});

test('DEFECT: a DENIED register exports blank counts too', () => {
  const c = cellsOf(runExport({ rows: [ROW], register: { denied: true } }).csv);
  assert.deepEqual([c[ATT_COLS.pct], c[ATT_COLS.present], c[ATT_COLS.held]], ['', '', ''],
    'no attendance scope is not evidence of no attendance');
});

test('a row with no canonical key is blank as well — an unjoinable player is unknown, not absent', () => {
  const c = cellsOf(runExport({ rows: [{ ...ROW, key: '' }], register: { scope: 'group', sessions: {} } }).csv);
  assert.deepEqual([c[ATT_COLS.pct], c[ATT_COLS.present], c[ATT_COLS.held]], ['', '', '']);
});

test('the three unknown columns are the ONLY thing blanked — the match figures still export', () => {
  const c = cellsOf(runExport({ rows: [ROW], register: null }).csv);
  assert.deepEqual(c.slice(5), ['5', '4', '1', '1', '2', '320', '72%'],
    'appearances through playing time are unaffected by an unknown register');
  assert.equal(c[0], 'Alex');
});

test('NO REGRESSION: a register that IS loaded still exports its real counts', () => {
  const c = cellsOf(runExport({
    rows: [ROW],
    register: { scope: 'group', sessions: { s1: {} } },
    stats: { 'id:u1': { attendancePct: 80, present: 8, held: 10 } },
  }).csv);
  assert.deepEqual([c[ATT_COLS.pct], c[ATT_COLS.present], c[ATT_COLS.held]], ['80%', '8', '10']);
});

test('NO REGRESSION: a REAL zero survives — 0 of 12 held is a fact, and prints', () => {
  // The blanking is scoped to the unknown-register branch precisely so this
  // row cannot be laundered into a blank. A player who attended none of twelve
  // sessions has a record, and it is 0.
  const c = cellsOf(runExport({
    rows: [ROW],
    register: { scope: 'group', sessions: { s1: {} } },
    stats: { 'id:u1': { attendancePct: 0, present: 0, held: 12 } },
  }).csv);
  assert.deepEqual([c[ATT_COLS.pct], c[ATT_COLS.present], c[ATT_COLS.held]], ['0%', '0', '12']);
});

test('SOURCE: only the unknown branch blanks, and the aggregation is still the one engine', () => {
  const src = extractFn(html, 'exportSeasonStatsCSV');
  assert.match(src, /if \(!att \|\| att\.denied \|\| !key\) return \{ pct: null, present: '', held: '' \};/,
    'the unknown branch carries no numbers at all');
  assert.match(src, /return \{ pct: s\.attendancePct, present: s\.present, held: s\.held \};/,
    'the loaded branch still reports exactly what attendanceStats computed');
  assert.match(src, /attendanceStats\(att\.sessions, key, state\.seasonStart, state\.seasonEnd, availToday\(\)\)/,
    'same season-windowed aggregation, unchanged');
  assert.match(src, /a\.pct === null \? '' : a\.pct \+ '%'/, 'the rate convention it now mirrors');
});

// ═══ 2 · THE VIEW: LOADING vs FAILED ════════════════════════════════════════

/**
 * seasonStatsHtml's season === null branch, running the REAL
 * currentSeasonSheets / seasonSheetsFailed / loadSeasonSheets against a
 * stubbed fetch. Only the null branch is exercised here — the populated table
 * is proven in season-statistics-view.test.js.
 */
function view({ failFetch = false } = {}) {
  const calls = [];
  return new Function('CALLS', `
    "use strict";
    const state = { players: [], users: [], operationalGroupId: 'grp_seniors' };
    const _adminData = { members: [], loaded: true, structureAccess: null };
    let _seasonSheets = null, _seasonSheetsGroup = null, _seasonSheetsLoading = false;
    let _seasonSheetsFailed = null;
    let _seasonSort = 'minutes', _seasonSortDir = 'desc', _seasonQuery = '';
    let _fail = ${failFetch ? 'true' : 'false'};
    function canI(p) { return p === 'publish_squads'; }
    function ensureAdminData() {}
    function render() { CALLS.push(['render']); }
    function operationalPlayers() { return []; }
    function operationalGroupName() { return 'Seniors'; }
    function canonicalVisiblePlayers() { return []; }
    async function fetch(url) {
      CALLS.push(['fetch', url]);
      if (_fail) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ sheets: [], playedFixtures: 0, fixturesWithoutSheet: 0 }) };
    }
    ${extractFn(html, 'esc')}
    ${extractFn(html, 'seasonPlayerStats')}
    ${extractFn(html, 'seasonTableRows')}
    ${extractFn(html, 'seasonSortRows')}
    ${extractFn(html, 'loadSeasonSheets')}
    ${extractFn(html, 'currentSeasonSheets')}
    ${extractFn(html, 'seasonSheetsFailed')}
    ${extractFn(html, 'seasonStatsHtml')}
    return {
      seasonStatsHtml, currentSeasonSheets, seasonSheetsFailed,
      succeed: () => { _fail = false; },
      peek: () => ({ sheets: _seasonSheets, failed: _seasonSheetsFailed }),
    };
  `)(calls);
}
const settle = () => new Promise(r => setImmediate(r));

test('DEFECT: after a failed read the view says it FAILED, not that it is still loading', async () => {
  const v = view({ failFetch: true });
  v.currentSeasonSheets();          // kicks the read off; it 500s
  await settle();
  const t = textOf(v.seasonStatsHtml());
  assert.match(t, /could not be loaded/, 'the coach is told the truth');
  assert.ok(!/Loading this season/.test(t), 'and is not left waiting on something that already failed');
  assert.match(t, /not a record of no appearances/, 'the same reassurance the Appearances card gives');
});

test('the failure state offers the existing retry affordance', async () => {
  const v = view({ failFetch: true });
  v.currentSeasonSheets();
  await settle();
  const markup = v.seasonStatsHtml();
  assert.match(markup, /class="ovw-retry"/, 'the retry button pattern already used elsewhere');
  assert.match(markup, /onclick="loadSeasonSheets\(true\)"/, 'and it forces a fresh read');
});

test('a read still IN FLIGHT is still described as loading — the two stay distinguishable', () => {
  const v = view();
  const t = textOf(v.seasonStatsHtml());   // read only just started, nothing failed
  assert.match(t, /Loading this season/);
  assert.ok(!/could not be loaded/.test(t), 'nothing has failed, so nothing claims to have');
  assert.equal(v.peek().failed, null);
});

test('INVARIANT: a failed read is still unknown — never an empty season, never 0 appearances', async () => {
  const v = view({ failFetch: true });
  v.currentSeasonSheets();
  await settle();
  const markup = v.seasonStatsHtml();
  assert.equal(v.peek().sheets, null, 'a 500 leaves the season unknown');
  assert.ok(!/data-label="Apps"/.test(markup), 'no table');
  assert.ok(!/No completed team-sheet data yet/.test(markup), 'and it is not reported as an empty season');
});

test('a later success clears the failure state — the message is not sticky', async () => {
  const v = view({ failFetch: true });
  v.currentSeasonSheets();
  await settle();
  assert.match(textOf(v.seasonStatsHtml()), /could not be loaded/);

  // Reading the card starts another attempt of its own, so let the failing one
  // in flight drain before the successful retry is allowed to land.
  v.succeed();
  for (let i = 0; i < 4 && v.peek().sheets === null; i++) { v.currentSeasonSheets(); await settle(); }
  const t = textOf(v.seasonStatsHtml());
  assert.ok(!/could not be loaded/.test(t), 'the failure is over and the screen says so');
  assert.match(t, /No completed team-sheet data yet/, 'an honestly empty season, now that one has been read');
});

test('SOURCE: the two surfaces reading _seasonSheets now agree about failure', () => {
  const src = extractFn(html, 'seasonStatsHtml');
  assert.match(src, /seasonSheetsFailed\(\)/, 'the table consults the helper built for this');
  assert.match(src, /Loading this season/, 'and still has a genuine loading state');
  // The Appearances card, the other reader, is unchanged and still says it too.
  const card = html.slice(html.indexOf('<!-- APPEARANCES CARD'), html.indexOf('<!-- APPEARANCES CARD') + 6000);
  assert.match(card, /seasonSheetsFailed\(\)/);
  assert.match(card, /not a record of no appearances/);
});

// ═══ 3 · NOTHING BEHIND THE PRESENTATION MOVED ══════════════════════════════

test('the attendance aggregation is untouched — what "unknown" MEANS did not change', () => {
  for (const name of ['attendanceStats', 'attendanceSeasonSummary', 'attendanceHeldSessions',
                      'currentAttendance', 'loadAttendance', 'seasonSheetsFailed', 'loadSeasonSheets']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  const stats = extractFn(html, 'attendanceStats');
  assert.ok(!/present: ''|held: ''/.test(stats), 'the blanking is presentation-only; the aggregation still counts');
  assert.match(extractFn(html, 'currentAttendance'), /loadAttendance\(\)/, 'the lazy load is unchanged');
});
