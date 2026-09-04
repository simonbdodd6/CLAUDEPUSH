/**
 * BUILD AD — ONE attendance-rate definition everywhere.
 *
 * Build AC put the canonical rate on Training → Attendance: attended ÷
 * sessions HELD. But every OTHER percentage surface — the player's own portal
 * card, the Members table, the member profile, the availability popup, the
 * CSV exports, Match Centre's training column — still ran on
 * attendanceStats.attendancePct, which divided by DECISIONS RECORDED. Same
 * registers, two answers: 5 present with 3 unmarked read 63% on the canonical
 * table and 100% one screen away.
 *
 * attendancePct is now canonical: attended ÷ sessions held, null when nothing
 * was held. The decision COUNTS (recorded / present / absent) are untouched —
 * they are facts other surfaces legitimately show.
 *
 * THE SELF SCOPE is the delicate half. A player's read deliberately omits
 * sessions they were never marked on (the privacy contract in
 * player-attendance-visibility: an unmarked session must not travel), so their
 * device cannot enumerate the denominator. The server therefore sends the held
 * COUNT — a number, never the sessions — mirroring the client enumeration the
 * way attendanceOccurrenceId is already mirrored client/server. Without that
 * count a self reader answers null, never a wrong percentage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const SLOTS = [{ id: 'slot_tue', sessionId: 'tue', day: 'Tue', startTime: '19:00', venue: 'Club' }];
const TODAY = '2026-09-04';

function makeWorld(cfg = {}) {
  const { sessions = {}, scope = 'group', held, selfKey = '', loaded = true, failed = false,
          slots = SLOTS, seasonStart = '2026-07-01', seasonEnd = '2027-06-30',
          operatingGroup = 'g1', loadedGroup = 'g1', today = TODAY } = cfg;
  return new Function('cfg', `
    "use strict";
    const state = { seasonStart: cfg.seasonStart, seasonEnd: cfg.seasonEnd,
                    operationalGroupId: cfg.operatingGroup };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = cfg.loaded
      ? { scope: cfg.scope, sessions: cfg.sessions,
          ...(cfg.held === undefined ? {} : { held: cfg.held }) }
      : null;
    let _attendanceGroup = cfg.loaded ? cfg.loadedGroup : null;
    let _attendanceFailed = cfg.failed ? cfg.operatingGroup : null;
    let _attendanceSelfKey = cfg.selfKey;
    function loadAttendance() {}
    function availToday() { return cfg.today; }
    function membershipPlays() { return true; }
    function canI() { return cfg.scope === 'group'; }
    const _myMembership = {};
    const currentUser = () => ({ role: 'player' });
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'currentAttendance')}
    ${extractFn(html, 'attendanceFailed')}
    ${extractFn(html, 'attendanceHeldSessions')}
    ${extractFn(html, 'attendanceSeasonSummary')}
    ${extractFn(html, 'attendanceStats')}
    ${extractFn(html, 'attendanceReadScope')}
    ${extractFn(html, 'playerAttendancePct')}
    ${extractFn(html, 'attendanceLabel')}
    return { playerAttendancePct, attendanceStats, attendanceSeasonSummary,
             attendanceHeldSessions, attendanceLabel, state,
             adopt: (doc, g) => { _attendance = doc; _attendanceGroup = g; } };
  `)({ sessions, scope, held, selfKey, loaded, failed, slots, seasonStart, seasonEnd,
       operatingGroup, loadedGroup, today });
}

const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
const BEN = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const CAL = { id: 'p3', name: 'Cal Reid', userId: 'u3' };
const reg = (date, marks, title = 'Training') => ({ date, title, marks });

/** Eight held Tuesdays; markFor(i) is ANA's mark on session i (null = blank). */
function eightHeld(markFor, extra = {}) {
  const sessions = {};
  ['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28',
   '2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'].forEach((date, i) => {
    const marks = { ...(extra[i] || {}) };
    const st = markFor(i);
    if (st) marks['id:u1'] = st;
    sessions['slot_tue-' + date.replace(/-/g, '')] = reg(date, marks);
  });
  return sessions;
}

// ─────────────── THE unification — the old answer is rejected ───────────────

test('5 attended of 8 held is 63% — never the decisions-recorded 100%', () => {
  // Ana has FIVE decisions, all present. The retired denominator would say
  // 100%. Eight sessions happened; the truth is 63% (Math.round of 62.5).
  const w = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : null)) });
  const pct = w.playerAttendancePct(ANA);
  assert.equal(pct, 63, 'attended ÷ sessions held');
  assert.notEqual(pct, 100, 'the decisions-recorded denominator is dead everywhere');
});

test('a recorded absence and an unmarked blank price the denominator identically', () => {
  const absent = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : 'absent')) });
  const blank  = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : null)) });
  assert.equal(absent.playerAttendancePct(ANA), 63);
  assert.equal(blank.playerAttendancePct(ANA), 63);
});

test('100%, a REAL 0%, and null stay three different answers', () => {
  assert.equal(makeWorld({ sessions: eightHeld(() => 'present') }).playerAttendancePct(ANA), 100);
  // eight sessions genuinely held, Ana recorded at none: 0% is a fact
  const never = makeWorld({ sessions: eightHeld(() => null) });
  assert.equal(never.playerAttendancePct(ANA), 0);
  // nothing held at all: no denominator, no claim
  const empty = makeWorld({ sessions: {} });
  assert.equal(empty.playerAttendancePct(ANA), null);
  assert.equal(empty.attendanceLabel(empty.playerAttendancePct(ANA)), '—');
});

test('marks outside the season cannot manufacture a rate', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260505': reg('2026-05-05', { 'id:u1': 'present' }) } });   // last season
  assert.equal(w.playerAttendancePct(ANA), null, 'zero held THIS season → null, not 100%');
});

test('future ledger sessions do not dilute the rate', () => {
  const sessions = eightHeld(i => (i < 5 ? 'present' : null));
  sessions['slot_tue-20260908'] = reg('2026-09-08', {});
  sessions['slot_tue-20260915'] = reg('2026-09-15', {});
  assert.equal(makeWorld({ sessions }).playerAttendancePct(ANA), 63, 'not 50 — the future is planning');
});

test('a bare legacy twin cannot halve the rate', () => {
  const w = makeWorld({ sessions: {
    'tue': reg('2026-09-01', { 'id:u1': 'present' }),
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  assert.equal(w.playerAttendancePct(ANA), 100, 'one Tuesday, attended, 100%');
});

test('availability-shaped values buy no rate anywhere', () => {
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01',
      { 'id:u1': 'available', 'id:u2': 'no-reply', 'id:u3': 'present' }) } });
  assert.equal(w.playerAttendancePct(ANA), 0, 'available is an answer, not attendance');
  assert.equal(w.playerAttendancePct(BEN), 0, 'silence even less so');
  assert.equal(w.playerAttendancePct(CAL), 100);
});

// ─────────────── every surface agrees with the canonical table ──────────────

test('playerAttendancePct and the canonical summary give ONE answer per player', () => {
  const sessions = eightHeld(i => (i < 5 ? 'present' : null), {
    0: { 'id:u2': 'present' }, 1: { 'id:u2': 'present' }, 2: { 'id:u2': 'absent' },
    // u3 never marked anywhere
  });
  const w = makeWorld({ sessions });
  const summary = w.attendanceSeasonSummary(sessions, [ANA, BEN, CAL], TODAY,
    w.state.seasonStart, w.state.seasonEnd);
  for (const p of [ANA, BEN, CAL]) {
    const row = summary.rows.find(r => r.id === p.id);
    assert.equal(w.playerAttendancePct(p), row.attendanceRate,
      `${p.name}: the profile figure and the canonical table must be the same number`);
  }
  // and the never-marked player's agreement is the sharp case: 0%, both places
  assert.equal(w.playerAttendancePct(CAL), 0);
});

test('the decision COUNTS are unchanged — only the rate moved', () => {
  const sessions = eightHeld(i => (i < 5 ? 'present' : null));
  const w = makeWorld({ sessions });
  const stats = w.attendanceStats(sessions, 'id:u1', w.state.seasonStart, w.state.seasonEnd, TODAY);
  assert.equal(stats.recorded, 5, 'decisions recorded stays a count of decisions');
  assert.equal(stats.present, 5);
  assert.equal(stats.absent, 0);
  assert.equal(stats.held, 8, 'and the denominator is carried openly');
  assert.equal(stats.attendancePct, 63);
  assert.ok(stats.lastPresent, 'last-present survives');
});

// ─────────────── group isolation ────────────────────────────────────────────

test('a rate is priced only by its own group\'s sessions', () => {
  const w = makeWorld({ operatingGroup: 'g_u18', loadedGroup: 'g_u18',
    sessions: eightHeld(i => (i < 5 ? 'present' : null)) });
  assert.equal(w.playerAttendancePct(ANA), 63);
  // the Seniors document lands: one session, Ben present — not diluted by U18's 8
  w.adopt({ scope: 'group', sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u2': 'present' }) } }, 'g_sen');
  w.state.operationalGroupId = 'g_sen';
  assert.equal(w.playerAttendancePct(BEN), 100);
});

test('a cross-group document answers null, never the wrong group\'s rate', () => {
  const w = makeWorld({ operatingGroup: 'g_u18', loadedGroup: 'g_seniors',
    sessions: eightHeld(() => 'present') });
  assert.equal(w.playerAttendancePct(ANA), null, 'our ignorance, not their data');
});

test('U18 First and U18 Second share one scope and one denominator', () => {
  const first  = { ...ANA, team: 'U18 First' };
  const second = { ...BEN, team: 'U18 Second' };
  const w = makeWorld({ sessions: eightHeld(i => (i < 5 ? 'present' : null),
    { 0: { 'id:u2': 'present' } }) });
  assert.equal(w.playerAttendancePct(first), 63);
  assert.equal(w.playerAttendancePct(second), 13, '1 of the same 8 held — one group boundary');
});

// ─────────────── durable identity ───────────────────────────────────────────

test('a rename keeps the rate; namesakes never share one', () => {
  const sessions = eightHeld(i => (i < 5 ? 'present' : null));
  const renamed = { ...ANA, name: 'Ana Marie Silva-Fernandes' };
  assert.equal(makeWorld({ sessions }).playerAttendancePct(renamed), 63);
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const w = makeWorld({ sessions: {
    'slot_tue-20260901': reg('2026-09-01', { 'id:uA': 'present' }) } });
  assert.equal(w.playerAttendancePct(twinA), 100);
  assert.equal(w.playerAttendancePct(twinB), 0);
});

// ─────────────── the SELF scope — a count travels, sessions do not ──────────

test('a self reader divides by the SERVER\'s held count, not their own marks', () => {
  // The projection carries only Ana's five marked sessions (privacy). The
  // server says eight were held. 63%, not the 100% her own payload implies.
  const projection = {};
  Object.entries(eightHeld(i => (i < 5 ? 'present' : null)))
    .forEach(([k, r]) => { if (r.marks['id:u1']) projection[k] = { ...r, marks: { 'id:u1': r.marks['id:u1'] } }; });
  const w = makeWorld({ scope: 'self', selfKey: 'id:u1', held: 8, sessions: projection });
  assert.equal(w.playerAttendancePct(ANA), 63);
});

test('a self reader with NO server count claims nothing — never the old rate', () => {
  const projection = {
    'slot_tue-20260804': reg('2026-08-04', { 'id:u1': 'present' }),
    'slot_tue-20260811': reg('2026-08-11', { 'id:u1': 'present' }),
  };
  const w = makeWorld({ scope: 'self', selfKey: 'id:u1', sessions: projection });
  assert.equal(w.playerAttendancePct(ANA), null,
    'an unknown denominator is an unknown rate, not a fabricated 100%');
});

test('a self held-count of zero is null, never 0%', () => {
  const w = makeWorld({ scope: 'self', selfKey: 'id:u1', held: 0, sessions: {} });
  assert.equal(w.playerAttendancePct(ANA), null);
});

// ─────────────── the surfaces carry the canonical call ──────────────────────

test('every rate surface passes the day and, for self, the server count', () => {
  const pct = strip(extractFn(html, 'playerAttendancePct'));
  assert.match(pct, /availToday\(\)/, 'the future is excluded from the denominator');
  assert.match(pct, /att\.scope === 'self'/, 'self scope hands over the server count');
  const card = strip(extractFn(html, 'myAttendanceCardHtml'));
  assert.match(card, /availToday\(\)/);
  assert.match(card, /sessions? held|training session/i, 'the copy names the real denominator');
  assert.ok(!/where attendance was taken/.test(card), 'the decisions-denominator copy is gone');
  const profileCard = html.slice(html.indexOf('<!-- ATTENDANCE CARD'), html.indexOf('<!-- AVAILABILITY THIS WEEK'));
  assert.match(strip(profileCard), /attendanceStats\(att\.sessions, playerMatchKey\(p\), state\.seasonStart, state\.seasonEnd, availToday\(\)\)/);
  assert.ok(!/where attendance was taken/.test(profileCard));
  const mc = strip(extractFn(html, 'renderMatchday'));
  assert.match(mc, /attendanceStats\(_attSrc\.sessions, playerMatchKey\(p\), state\.seasonStart, state\.seasonEnd, availToday\(\)\)/);
});

test('History reintroduces nothing, and nothing here writes', () => {
  assert.ok(!/attendanceStats\(|attendanceRate/.test(strip(extractFn(html, '_renderTrainingHistory'))));
  for (const fn of ['attendanceStats', 'playerAttendancePct', 'myAttendanceCardHtml']) {
    const src = strip(extractFn(html, fn));
    for (const bad of [/fetch\(/, /saveAttendance/, /attendanceMark\(/, /method\s*:\s*['"]POST/i]) {
      assert.ok(!bad.test(src), `${fn} must not write (${bad})`);
    }
  }
  assert.equal(html.split('function attendanceStats(').length - 1, 1, 'still ONE aggregation');
  assert.equal(html.split('function attendanceHeldSessions(').length - 1, 1, 'still ONE enumeration');
});
