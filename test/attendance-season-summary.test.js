/**
 * BUILD AA — READ-ONLY SEASON ATTENDANCE SUMMARY.
 *
 * A coach-facing aggregation over the EXISTING canonical attendance registers
 * (publish:<club>:group:<gid>:attendance — dated occurrences, durable player
 * keys, present / absent / null). Nothing new is stored and nothing is written:
 * the summary derives, per player of the operating group,
 *
 *   Sessions held · Attended · Absent · Not recorded
 *
 * SESSIONS HELD counts only occurrences the register can prove: a dated
 * canonical occurrence whose date has passed (a ledger entry written ahead of
 * a session is planning, not history), inside the configured season, counted
 * ONCE however many names the record answers to (a bare legacy key and its
 * dated twin are one session, exactly as the server's migration says).
 *
 * ATTENDED is a recorded 'present'. A recorded 'absent' stays absent — it is
 * a decision a coach took and must never be relabelled "not recorded". A
 * missing mark is NOT RECORDED — never fabricated into presence or absence,
 * and never derived from availability. AVAILABLE ≠ ATTENDED.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The mutation harness points this at a mutated copy; normal runs read the app.
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const SLOTS = [{ id: 'slot_tue', sessionId: 'tue', startTime: '19:00', venue: 'Club' },
               { id: 'slot_thu', sessionId: 'thu', startTime: '19:00', venue: 'Club' }];

/**
 * The client's world: a loaded register document in, summary out. The group in
 * force and the loaded document's group are separate on purpose — exactly the
 * two things a group switch moves apart.
 */
function makeWorld(cfg = {}) {
  const { sessions = {}, denied = false, loaded = true, failed = false,
          slots = SLOTS, seasonStart = '2026-07-01', seasonEnd = '2027-06-30',
          operatingGroup = 'g1', loadedGroup = 'g1' } = cfg;
  const loads = [];
  const w = new Function('cfg', 'loads', `
    "use strict";
    const state = { seasonStart: cfg.seasonStart, seasonEnd: cfg.seasonEnd,
                    operationalGroupId: cfg.operatingGroup };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = cfg.loaded ? (cfg.denied ? { denied: true, sessions: {} } : { sessions: cfg.sessions }) : null;
    let _attendanceGroup = cfg.loaded ? cfg.loadedGroup : null;
    let _attendanceFailed = cfg.failed ? cfg.operatingGroup : null;
    function loadAttendance() { loads.push(state.operationalGroupId); }
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'currentAttendance')}
    ${extractFn(html, 'attendanceFailed')}
    ${extractFn(html, 'attendanceHeldSessions')}
    ${extractFn(html, 'attendanceSeasonSummary')}
    return { attendanceHeldSessions, attendanceSeasonSummary, attendanceOccurrenceId,
             currentAttendance, attendanceFailed, playerMatchKey, state,
             setGroup: g => { state.operationalGroupId = g; },
             adopt: (doc, g) => { _attendance = doc; _attendanceGroup = g; } };
  `)({ sessions, denied, loaded, failed, slots, seasonStart, seasonEnd,
       operatingGroup, loadedGroup }, loads);
  w.loads = loads;
  return w;
}

const TODAY = '2026-09-03';
const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
const BEN = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const CAL = { id: 'p3', name: 'Cal Reid', userId: 'u3' };
const reg = (date, marks, title = 'Training') => ({ date, title, marks });

const summarise = (w, roster, today = TODAY) =>
  w.attendanceSeasonSummary(w.currentAttendance()?.sessions || {}, roster, today,
    w.state.seasonStart, w.state.seasonEnd);
const rowOf = (s, p) => s.rows.find(r => r.id === p.id);

// ───────────────────────── 1–3. the three states ────────────────────────────

test('a recorded present increments Attended', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const s = summarise(w, [ANA]);
  assert.equal(s.held.length, 1);
  const r = rowOf(s, ANA);
  assert.equal(r.held, 1);
  assert.equal(r.present, 1);
  assert.equal(r.absent, 0);
  assert.equal(r.notRecorded, 0);
});

test('a recorded absent stays ABSENT — the decision is never relabelled', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'absent' }) } });
  const r = rowOf(summarise(w, [ANA]), ANA);
  assert.equal(r.present, 0);
  assert.equal(r.absent, 1, 'absent is a recorded decision');
  assert.equal(r.notRecorded, 0, 'and it is NOT "not recorded"');
});

test('a missing mark on a held session is NOT fabricated as present', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const r = rowOf(summarise(w, [ANA, BEN]), BEN);
  assert.equal(r.held, 1, 'the session was held for Ben too');
  assert.equal(r.present, 0, 'but nobody recorded him present');
  assert.equal(r.absent, 0, 'and unmarked is not absent');
  assert.equal(r.notRecorded, 1);
});

test('the three per-player figures always account for every held session', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260825': reg('2026-08-25', { 'id:u1': 'present', 'id:u2': 'absent' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'absent' }),
    'slot_thu-20260827': reg('2026-08-27', {}) } });
  const s = summarise(w, [ANA, BEN]);
  assert.equal(s.held.length, 3);
  for (const p of [ANA, BEN]) {
    const r = rowOf(s, p);
    assert.equal(r.present + r.absent + r.notRecorded, r.held, p.name);
  }
  assert.deepEqual([rowOf(s, ANA).present, rowOf(s, ANA).absent, rowOf(s, ANA).notRecorded], [1, 1, 1]);
  assert.deepEqual([rowOf(s, BEN).present, rowOf(s, BEN).absent, rowOf(s, BEN).notRecorded], [0, 1, 2]);
});

// ───────────────────────── 4–5. availability is not attendance ──────────────

test('availability-shaped values in a mark can never count as attendance', () => {
  // The server sanitiser only stores present/absent; the aggregation must be
  // just as strict, so even a corrupted document cannot convert an answer
  // ("available", "no-reply") into attendance.
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01',
      { 'id:u1': 'available', 'id:u2': 'no-reply', 'id:u3': 'present' }) } });
  const s = summarise(w, [ANA, BEN, CAL]);
  assert.equal(rowOf(s, ANA).present, 0, 'available is an answer, not attendance');
  assert.equal(rowOf(s, ANA).notRecorded, 1);
  assert.equal(rowOf(s, BEN).present, 0, 'no-reply is silence, not attendance');
  assert.equal(rowOf(s, BEN).absent, 0, 'and silence is not absence either');
  assert.equal(rowOf(s, CAL).present, 1);
});

test('nothing in the summary path reads availability', () => {
  for (const fn of ['attendanceHeldSessions', 'attendanceSeasonSummary',
                    '_renderTrainingAttendanceSummary']) {
    const src = strip(extractFn(html, fn));
    for (const bad of [/sessionRows\(/, /resolvedAnswerFor\(/, /availabilityWeekSessions/,
                       /fixtureAvailability/, /state\.players\b/, /'available'/, /"available"/]) {
      assert.ok(!bad.test(src), `${fn} must not read availability (${bad})`);
    }
  }
});

// ───────────────────────── 6. the future is planning ────────────────────────

test('a ledgered future session is not a session held', () => {
  // The session ledger writes an empty register the moment a session is
  // created — days before it happens. Until its date arrives it must not
  // appear in anyone's denominator.
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }),
    'slot_tue-20260908': reg('2026-09-08', {}),
    'adhoc_camp-20261001': reg('2026-10-01', {}) } });
  const s = summarise(w, [ANA], '2026-09-03');
  assert.equal(s.held.length, 1, 'only the session that has happened');
  assert.equal(rowOf(s, ANA).held, 1);
  // and the moment the date passes, it counts — same data, later clock
  assert.equal(summarise(w, [ANA], '2026-09-08').held.length, 2, 'its own date counts as held');
});

test('an undated record cannot be proven held and claims nothing', () => {
  const w = makeWorld({ sessions: {
    'mystery': { title: 'Undated', marks: { 'id:u1': 'present' } },
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const s = summarise(w, [ANA]);
  assert.equal(s.held.length, 1, 'the undated record is excluded, not guessed');
  assert.equal(rowOf(s, ANA).present, 1);
});

test('a session outside the configured season belongs to another season', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260505': reg('2026-05-05', { 'id:u1': 'present' }),   // last season
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  assert.equal(summarise(w, [ANA]).held.length, 1);
  // with no season configured, the guard stands down — same rule attendanceStats uses
  const open = makeWorld({ seasonStart: '', seasonEnd: '', sessions: {
    'slot_tue-20260505': reg('2026-05-05', { 'id:u1': 'present' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  assert.equal(summarise(open, [ANA]).held.length, 2);
});

// ───────────────────────── 7–9. group isolation ─────────────────────────────

test('another group\'s loaded document is never served to the group in force', () => {
  // Operating as U18 while the cached document belongs to Seniors: the read
  // answers null (and asks for the right group), never the wrong figures.
  const w = makeWorld({ operatingGroup: 'g_u18', loadedGroup: 'g_seniors',
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  assert.equal(w.currentAttendance(), null, 'Seniors data must not answer for U18');
  assert.deepEqual(w.loads, ['g_u18'], 'and the U18 read was requested');
});

test('switching operating group recalculates from that group\'s own document', () => {
  const w = makeWorld({ operatingGroup: 'g_u18', loadedGroup: 'g_u18',
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  assert.equal(summarise(w, [ANA]).held.length, 1);
  w.setGroup('g_seniors');
  assert.equal(w.currentAttendance(), null, 'the U18 figures do not follow the switch');
  // the Seniors read lands: a different register entirely
  w.adopt({ sessions: { 'slot_thu-20260827': reg('2026-08-27', { 'id:u2': 'present' }) } }, 'g_seniors');
  const s = summarise(w, [BEN]);
  assert.equal(s.held.length, 1);
  assert.equal(rowOf(s, BEN).present, 1);
  // and back again — the U18 document must be re-read, not remembered wrongly
  w.setGroup('g_u18');
  assert.equal(w.currentAttendance(), null);
  w.adopt({ sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } }, 'g_u18');
  assert.equal(rowOf(summarise(w, [ANA]), ANA).present, 1);
});

test('U18 First and U18 Second are one group boundary, not two stores', () => {
  // Team text plays no part: the summary is keyed by the GROUP document and
  // the durable player key. Two players on different teams inside U18 share
  // one register and one denominator.
  const first  = { ...ANA, team: 'U18 First' };
  const second = { ...BEN, team: 'U18 Second' };
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present', 'id:u2': 'present' }) } });
  const s = summarise(w, [first, second]);
  assert.equal(s.held.length, 1);
  assert.equal(rowOf(s, first).present, 1);
  assert.equal(rowOf(s, second).present, 1);
  for (const fn of ['attendanceHeldSessions', 'attendanceSeasonSummary']) {
    const src = strip(extractFn(html, fn));
    assert.ok(!/\.team\b|sideId|teamName/.test(src), fn + ' must not consult team text');
  }
});

// ───────────────────────── 10. durable identity ─────────────────────────────

test('a rename keeps the attendance — identity is the durable key, not the name', () => {
  const sessions = { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) };
  const before = rowOf(summarise(makeWorld({ sessions }), [ANA]), ANA);
  const renamed = { ...ANA, name: 'Ana Marie Silva-Fernandes' };
  const after = rowOf(summarise(makeWorld({ sessions }), [renamed]), renamed);
  assert.equal(before.present, 1);
  assert.equal(after.present, 1, 'the rename does not lose the history');
});

test('two players sharing a name never share a row', () => {
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:uA': 'present', 'id:uB': 'absent' }) } });
  const s = summarise(w, [twinA, twinB]);
  assert.equal(rowOf(s, twinA).present, 1);
  assert.equal(rowOf(s, twinB).present, 0);
  assert.equal(rowOf(s, twinB).absent, 1);
});

test('a roster row with no resolvable identity claims nothing', () => {
  const ghost = { id: '', name: 'Unlinked' };
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const s = summarise(w, [ANA, ghost]);
  assert.equal(s.rows.length, 1, 'a row without identity is not invented');
});

// ───────────────────────── 11–13. occurrence identity ───────────────────────

test('historical attendance stays attached to its own dated occurrence', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260825': reg('2026-08-25', { 'id:u1': 'present' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'absent' }) } });
  const held = w.attendanceHeldSessions(w.currentAttendance().sessions, TODAY,
    w.state.seasonStart, w.state.seasonEnd);
  assert.deepEqual(held.map(h => h.occurrenceId), ['slot_tue-20260825', 'slot_tue-20260901'],
    'two Tuesdays stay two occurrences');
  const r = rowOf(summarise(w, [ANA]), ANA);
  assert.equal(r.present, 1);
  assert.equal(r.absent, 1);
});

test('a bare legacy key and its dated twin are ONE session, counted once', () => {
  // The server's migration keeps a legacy record beside its dated twin rather
  // than merging them. Counting both would invent a session.
  const w = makeWorld({ sessions: {
    'tue': reg('2026-09-01', { 'id:u1': 'absent' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const s = summarise(w, [ANA]);
  assert.equal(s.held.length, 1, 'one Tuesday, not two');
  assert.equal(rowOf(s, ANA).present, 1, 'and the DATED record is the authority');
  assert.equal(rowOf(s, ANA).absent, 0);
});

test('a bare legacy record with NO dated twin still counts — once, dated', () => {
  const w = makeWorld({ sessions: {
    'tue': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const held = w.attendanceHeldSessions(w.currentAttendance().sessions, TODAY,
    w.state.seasonStart, w.state.seasonEnd);
  assert.equal(held.length, 1);
  assert.equal(held[0].occurrenceId, 'slot_tue-20260901', 'lifted onto the canonical identity');
  assert.equal(rowOf(summarise(w, [ANA]), ANA).present, 1);
});

test('two legacy forms of one session, with NO canonical twin, still count once', () => {
  // Pre-migration shape: the same Tuesday under both of its legacy names.
  // The server lifts these on read, but the aggregation must not depend on
  // that having happened — the canonical occurrence is the unit, always.
  const w = makeWorld({ sessions: {
    'tue': reg('2026-09-01', { 'id:u1': 'present' }),
    'tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const held = w.attendanceHeldSessions(w.currentAttendance().sessions, TODAY,
    w.state.seasonStart, w.state.seasonEnd);
  assert.equal(held.length, 1, 'one Tuesday however many names it answers to');
  assert.equal(held[0].occurrenceId, 'slot_tue-20260901');
  assert.equal(rowOf(summarise(w, [ANA]), ANA).present, 1, 'and one attendance, not two');
});

test('the Build-A form (tue-YYYYMMDD) and the canonical form are one session', () => {
  const w = makeWorld({ sessions: {
    'tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  assert.equal(summarise(w, [ANA]).held.length, 1);
  assert.equal(rowOf(summarise(w, [ANA]), ANA).present, 1, 'counted once, not twice');
});

// ───────────────────────── 14. read-only ────────────────────────────────────

test('reading the summary can never write attendance', () => {
  for (const fn of ['attendanceHeldSessions', 'attendanceSeasonSummary',
                    '_renderTrainingAttendanceSummary']) {
    const src = strip(extractFn(html, fn));
    for (const bad of [/fetch\(/, /saveAttendance/, /attendanceMark/, /kvSet/,
                       /method\s*:\s*['"]POST/i, /_attendance\s*=[^=]/, /\.sessions\s*\[[^\]]*\]\s*=/]) {
      assert.ok(!bad.test(src), `${fn} must not write (${bad})`);
    }
  }
  // The behavioural proof: the aggregation leaves the document untouched.
  const sessions = { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) };
  const frozen = JSON.stringify(sessions);
  const w = makeWorld({ sessions });
  summarise(w, [ANA, BEN]);
  assert.equal(JSON.stringify(w.currentAttendance().sessions), frozen, 'the register is unchanged');
});

// ───────────────────────── 15. honest empty & unknown states ────────────────

test('an empty history is all zeros, never an invention', () => {
  const s = summarise(makeWorld({ sessions: {} }), [ANA, BEN]);
  assert.equal(s.held.length, 0);
  for (const p of [ANA, BEN]) {
    const r = rowOf(s, p);
    assert.deepEqual([r.held, r.present, r.absent, r.notRecorded], [0, 0, 0, 0], p.name);
  }
});

test('the summary screen keeps loading / failed / denied / empty apart', () => {
  const fn = extractFn(html, '_renderTrainingAttendanceSummary');
  assert.match(fn, /currentAttendance\(\)/, 'reads the one cached document');
  assert.match(fn, /attendanceFailed\(\)/, 'a failed read is not an empty history');
  assert.match(fn, /Loading attendance/);
  assert.match(fn, /not a record of/, 'the failure copy denies being data');
  assert.match(fn, /No training attendance/i, 'a true empty says so plainly');
  assert.match(fn, /canI\('publish_training'\)/, 'coach summary is for training staff');
});

// ───────────────────────── 16. the UI renders THE aggregation ───────────────

test('the summary tab exists and renders the canonical aggregation', () => {
  const bar = strip(extractFn(html, '_trainingTabBar'));
  assert.match(bar, /\['summary','Attendance'\]/, 'Beta: Training → Attendance');
  const dispatch = strip(extractFn(html, 'renderTraining'));
  assert.match(dispatch, /_tab === 'summary'.*_renderTrainingAttendanceSummary/,
    'the tab routes to the summary renderer');
  const fn = strip(extractFn(html, '_renderTrainingAttendanceSummary'));
  assert.match(fn, /attendanceSeasonSummary\(/, 'the screen shows the canonical numbers');
  assert.match(fn, /operationalPlayers\(\)/, 'over the operating group\'s roster only');
  assert.match(fn, /playerIsArchived/, 'archived players are not rows');
  // the scope is stated from the data, never claimed as a full season
  assert.match(fn, /recorded/i);
  assert.ok(!/Season attendance/i.test(fn), 'no unprovable "season" claim');
  // Build AC added ONE percentage: the canonical rate (attended ÷ held),
  // rendered through the shared attendanceLabel. Still no ranking, no
  // performance colouring, and no decisions-recorded figure.
  assert.ok(!/attendancePct/.test(fn), 'the decisions-recorded percentage stays out');
  assert.ok(!/sort\([^)]*present|sort\([^)]*attendanceRate/.test(fn), 'rows are not ranked by attendance');
});

// ───────────────────────── the attendance rate (Build AC) ───────────────────
// ONE formula: attended ÷ sessions HELD × 100, rounded to a whole percent
// (the codebase's documented convention — attendanceStats, attendanceLabel).
// NEVER attended ÷ decisions recorded: that was History's competing
// denominator, and removing it was the whole point of Build AB.

const eightHeld = marksFor => {
  // Eight held Tuesdays; marksFor(i) says what ANA's mark is on session i.
  const sessions = {};
  for (let i = 0; i < 8; i++) {
    const day = String(4 + i * 7).padStart(2, '0');   // 4,11,18,25 Aug + 1,8,15,22 (adjusted below)
    const date = i < 4 ? `2026-08-${day}` : `2026-07-${String(7 + (i - 4) * 7).padStart(2, '0')}`;
    const marks = {};
    const st = marksFor(i);
    if (st) marks['id:u1'] = st;
    sessions[`slot_tue-${date.replace(/-/g, '')}`] = reg(date, marks);
  }
  return sessions;
};

test('the rate is attended ÷ sessions HELD — and the old denominator would lie', () => {
  // 8 held; Ana present at 5, UNMARKED at 3. Decisions recorded = 5, so the
  // retired History framing would have said 5/5 = 100%. The truth the coach
  // needs is 5 of the 8 sessions that happened: 63% (Math.round(62.5)).
  const w = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : null)) });
  const r = rowOf(summarise(w, [ANA]), ANA);
  assert.equal(r.held, 8);
  assert.equal(r.present, 5);
  assert.equal(r.notRecorded, 3);
  assert.equal(r.attendanceRate, 63, 'attended ÷ held, whole-percent rounding');
  assert.notEqual(r.attendanceRate, 100, 'the decisions-recorded denominator is dead');
});

test('an absence and a blank cost the denominator identically', () => {
  // 5 present + 3 ABSENT is the same rate as 5 present + 3 unmarked: the
  // denominator is what happened, not what was decided.
  const absent  = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : 'absent')) });
  const blank   = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : null)) });
  assert.equal(rowOf(summarise(absent, [ANA]), ANA).attendanceRate, 63);
  assert.equal(rowOf(summarise(blank,  [ANA]), ANA).attendanceRate, 63);
});

test('perfect attendance is 100% and total non-attendance is a REAL 0%', () => {
  const all = makeWorld({ sessions: eightHeld(() => 'present') });
  assert.equal(rowOf(summarise(all, [ANA]), ANA).attendanceRate, 100);
  // 8 sessions genuinely held, Ana recorded at none of them: 0% is a fact
  // here, and must stay distinct from the null of "nothing was ever held".
  const none = makeWorld({ sessions: eightHeld(i => (i % 2 ? 'absent' : null)) });
  const r = rowOf(summarise(none, [ANA]), ANA);
  assert.equal(r.present, 0);
  assert.equal(r.attendanceRate, 0, 'a real zero, from real sessions');
});

test('no sessions held → the rate is null, never a fabricated 0%', () => {
  const empty = makeWorld({ sessions: {} });
  assert.equal(rowOf(summarise(empty, [ANA]), ANA).attendanceRate, null);
  // future-only history: ledgered sessions that have not happened yet
  const futureOnly = makeWorld({ sessions: {
    'slot_tue-20260908': reg('2026-09-08', {}) } });
  assert.equal(rowOf(summarise(futureOnly, [ANA]), ANA).attendanceRate, null,
    'a session that has not happened cannot make a denominator');
});

test('future sessions do not dilute the rate', () => {
  const sessions = eightHeld(i => (i < 5 ? 'present' : null));
  sessions['slot_tue-20260908'] = reg('2026-09-08', {});
  sessions['slot_tue-20260915'] = reg('2026-09-15', {});
  const r = rowOf(summarise(makeWorld({ sessions }), [ANA]), ANA);
  assert.equal(r.held, 8, 'still eight held');
  assert.equal(r.attendanceRate, 63, 'not 50 — the future is planning');
});

test('a bare legacy twin cannot halve the rate', () => {
  const w = makeWorld({ sessions: {
    'tue': reg('2026-09-01', { 'id:u1': 'present' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const r = rowOf(summarise(w, [ANA]), ANA);
  assert.equal(r.held, 1);
  assert.equal(r.attendanceRate, 100, 'one Tuesday, one attendance, 100%');
});

test('availability-shaped values buy no rate', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'available', 'id:u2': 'present' }) } });
  const s = summarise(w, [ANA, BEN]);
  assert.equal(rowOf(s, ANA).attendanceRate, 0, 'available is not attended');
  assert.equal(rowOf(s, BEN).attendanceRate, 100);
});

test('the rate survives a rename and stays personal between namesakes', () => {
  const sessions = eightHeld(i => (i < 5 ? 'present' : null));
  const renamed = { ...ANA, name: 'Ana Marie Silva-Fernandes' };
  assert.equal(rowOf(summarise(makeWorld({ sessions }), [renamed]), renamed).attendanceRate, 63);
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const tw = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:uA': 'present' }) } });
  const s = summarise(tw, [twinA, twinB]);
  assert.equal(rowOf(s, twinA).attendanceRate, 100);
  assert.equal(rowOf(s, twinB).attendanceRate, 0);
});

test('each group\'s rate stands on its own sessions', () => {
  const w = makeWorld({ operatingGroup: 'g_u18', loadedGroup: 'g_u18',
    sessions: eightHeld(i => (i < 5 ? 'present' : null)) });
  assert.equal(rowOf(summarise(w, [ANA]), ANA).attendanceRate, 63);
  w.setGroup('g_seniors');
  assert.equal(w.currentAttendance(), null, 'U18 sessions cannot price a Seniors rate');
  w.adopt({ sessions: { 'slot_thu-20260827': reg('2026-08-27', { 'id:u2': 'present' }) } }, 'g_seniors');
  assert.equal(rowOf(summarise(w, [BEN]), BEN).attendanceRate, 100,
    'one Seniors session held, attended — not diluted by eight U18 ones');
});

test('the renderer prints the canonical rate through the shared label', () => {
  const fn = strip(extractFn(html, '_renderTrainingAttendanceSummary'));
  assert.match(fn, /Attendance rate/, 'the column exists');
  assert.match(fn, /attendanceLabel\(r\.attendanceRate\)/,
    'rendered via the shared null→"—" label, never ad-hoc');
  assert.ok(!/attendancePct/.test(fn), 'the decisions-recorded figure has no place here');
  // History still computes no rate of its own
  assert.ok(!/attendanceRate|attendanceStats\(/.test(strip(extractFn(html, '_renderTrainingHistory'))),
    'the retired History aggregation stays retired');
});

test('one aggregation of each kind — nothing was duplicated to build this', () => {
  assert.equal(html.split('function attendanceHeldSessions(').length - 1, 1);
  assert.equal(html.split('function attendanceSeasonSummary(').length - 1, 1);
  assert.equal(html.split('function attendanceStats(').length - 1, 1,
    'the existing per-player aggregation is untouched and un-forked');
});
