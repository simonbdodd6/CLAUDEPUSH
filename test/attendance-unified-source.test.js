/**
 * BUILD B — ONE attendance system.
 *
 * There were two. The server store (club/group scoped, durable player keys,
 * dated occurrences) and a device-local one, state.trainingAttendance, keyed by
 * ROSTER id, which the History tab read. A coach could record attendance and
 * History would say "No records yet", because they were different stores.
 *
 * The server store is now the only thing consulted for a result. The local store
 * is NOT deleted — it is simply no longer an authority.
 *
 * It also resolves the root mismatch Build A left open: a recurring slot answers
 * to two names (`slot_tue` and, for the two legacy slots, the availability
 * session `tue`), so one Tuesday could own two registers. The slot table maps
 * them, deterministically and without a clock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
const api  = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');

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

/** The client's world: server register in, UI answers out. */
function world({ sessions = {}, denied = false, loaded = true, failed = false,
                 roster = [], slots = SLOTS, seasonStart = '2026-07-01', seasonEnd = '2027-06-30' } = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { seasonStart: cfg.seasonStart, seasonEnd: cfg.seasonEnd, operationalGroupId: 'g1',
                    trainingAttendance: cfg.localTrap, trainingBlocks: {}, sessionNotes: {}, schedule: [] };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = cfg.loaded ? (cfg.denied ? { denied: true, sessions: {} } : { sessions: cfg.sessions }) : null;
    let _attendanceGroup = cfg.loaded ? 'g1' : null;
    let _attendanceFailed = cfg.failed ? 'g1' : null;
    let _attendanceLoading = false;
    function loadAttendance() {}
    function canI() { return true; }
    function activeRosterPlayers(p) { return (p || []).filter(x => x && x.id); }
    function operationalPlayers() { return cfg.roster; }
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'currentAttendance')}
    ${extractFn(html, 'attendanceFailed')}
    ${extractFn(html, 'attendanceStats')}
    ${extractFn(html, 'trainingAttendanceForSession')}
    return { trainingAttendanceForSession, attendanceStats, attendanceOccurrenceId,
             currentAttendance, attendanceFailed, playerMatchKey, state };
  `)({ sessions, denied, loaded, failed, roster, slots, seasonStart, seasonEnd,
       // A deliberately CONTRADICTORY local store: if anything reads it, the
       // answers below change and the test fails.
       localTrap: { 'tue': { p1: 'absent', p2: 'absent' }, 'slot_tue-20260901': { p1: 'absent' } } });
}

const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
const BEN = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const reg = (date, marks, title = 'Tuesday training') => ({ date, title, marks });

// ───────────────────────── A. one source of truth ───────────────────────────

test('a session reads its attendance from the SERVER register', () => {
  const w = world({ roster: [ANA, BEN],
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present', 'id:u2': 'absent' }) } });
  const a = w.trainingAttendanceForSession('tue', [ANA, BEN], '2026-09-01');
  assert.equal(a.unknown, false);
  assert.equal(a.present, 1);
  assert.equal(a.absent, 1);
  assert.equal(a.recorded, 2);
  assert.equal(a.pct, 50);
});

test('the device-local store cannot override the server', () => {
  // The local trap says BOTH players were absent. The server says one present.
  const w = world({ roster: [ANA, BEN],
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present', 'id:u2': 'absent' }) } });
  const a = w.trainingAttendanceForSession('tue', [ANA, BEN], '2026-09-01');
  assert.equal(a.present, 1, 'the local map must not have been consulted');
  assert.deepEqual(a.attMap, { p1: 'present', p2: 'absent' });
});

test('nothing in the read path touches state.trainingAttendance', () => {
  for (const fn of ['trainingAttendanceForSession', 'trainingSessionHasData', 'attendanceStats']) {
    assert.ok(!/state\.trainingAttendance/.test(strip(extractFn(html, fn))),
      fn + ' must not read the device-local store');
  }
  // The History list builds from the SERVER's registers.
  const hist = strip(extractFn(html, 'trainingHistorySessions'));
  assert.match(hist, /currentAttendance\(\)/);
  assert.ok(!/state\.trainingAttendance/.test(hist));
});

test('History and the player profile use the SAME aggregation', () => {
  const summary = html.slice(html.indexOf('Player attendance summary'), html.indexOf('Player attendance summary') + 1400);
  assert.match(strip(summary), /attendanceStats\(_att\.sessions, playerMatchKey\(p\)/);
  assert.equal(html.split('function attendanceStats(').length - 1, 1, 'one aggregation, not two');
});

test('Match Centre’s attendance figure comes from the same source', () => {
  const mc = strip(extractFn(html, 'renderMatchday'));
  assert.match(mc, /attendanceStats\(_attSrc\.sessions, playerMatchKey\(p\)/);
  assert.ok(!/_attBySession/.test(mc), 'the local walk is gone');
});

// ───────────────────────── D. occurrence identity ───────────────────────────

test('all three id forms resolve to ONE occurrence', () => {
  const w = world();
  const want = 'slot_tue-20260901';
  assert.equal(w.attendanceOccurrenceId('tue', '2026-09-01'), want, 'current-week form');
  assert.equal(w.attendanceOccurrenceId('tue-20260901', ''), want, 'a Build A record');
  assert.equal(w.attendanceOccurrenceId('slot_tue-20260901', ''), want, 'past-week form');
});

test('two Tuesdays stay two occurrences', () => {
  const w = world();
  assert.notEqual(w.attendanceOccurrenceId('tue', '2026-09-01'), w.attendanceOccurrenceId('tue', '2026-09-08'));
});

test('different slots on one day stay separate', () => {
  const w = world();
  assert.notEqual(w.attendanceOccurrenceId('tue', '2026-09-01'), w.attendanceOccurrenceId('thu', '2026-09-01'));
});

test('a session with no slot keeps its own root', () => {
  const w = world();
  assert.equal(w.attendanceOccurrenceId('adhoc_x', '2026-09-01'), 'adhoc_x-20260901');
  assert.equal(w.attendanceOccurrenceId('adhoc_x-20260901', ''), 'adhoc_x-20260901');
});

test('the client and the server agree on every form', () => {
  const SERVER = new Function(`"use strict";
    const ATT_DATED_RE = /-(\\d{8})$/;
    ${extractFn(api, 'attendanceOccurrenceRoot', '')}
    ${extractFn(api, 'attendanceOccurrenceId', '')}
    return attendanceOccurrenceId;`)();
  const w = world();
  for (const [id, d] of [['tue', '2026-09-01'], ['tue-20260901', ''], ['slot_tue-20260901', ''],
                         ['thu', '2026-09-03'], ['adhoc', '2026-09-01'], ['tue', ''], ['', '2026-09-01'],
                         ['tue', '2026-13-45'], ['slot_tue-20260908', '2026-01-01']]) {
    assert.equal(w.attendanceOccurrenceId(id, d), SERVER(id, d, SLOTS),
      `disagree on ${JSON.stringify([id, d])}`);
  }
});

test('the identity never touches the clock', () => {
  for (const [src, where] of [[extractFn(html, 'attendanceOccurrenceId'), 'client'],
                              [extractFn(api, 'attendanceOccurrenceId', ''), 'server']]) {
    for (const bad of [/new Date/, /Date\.now/, /toISOString/, /getTimezoneOffset/]) {
      assert.ok(!bad.test(src), `${where} must not use ${bad}`);
    }
  }
  const out = execFileSync(process.execPath, ['-e',
    `const ATT_DATED_RE=/-(\\\\d{8})$/;\n${extractFn(api, 'attendanceOccurrenceRoot', '')}\n${extractFn(api, 'attendanceOccurrenceId', '')}\n` +
    `process.stdout.write(attendanceOccurrenceId('tue','2026-09-01',${JSON.stringify(SLOTS)}));`],
    { env: { ...process.env, TZ: 'Pacific/Honolulu' }, encoding: 'utf8' });
  assert.equal(out, 'slot_tue-20260901', 'far west of UTC the day must not slip');
});

// ───────────────────────── C. player identity ───────────────────────────────

test('a rename keeps the attendance', () => {
  const sessions = { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) };
  const before = world({ roster: [ANA], sessions }).trainingAttendanceForSession('tue', [ANA], '2026-09-01');
  const renamed = { ...ANA, name: 'Ana Marie Silva-Fernandes' };
  const after = world({ roster: [renamed], sessions }).trainingAttendanceForSession('tue', [renamed], '2026-09-01');
  assert.equal(before.present, 1);
  assert.equal(after.present, 1, 'the rename does not lose the record');
});

test('two players sharing a name stay separate', () => {
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const w = world({ roster: [twinA, twinB],
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:uA': 'present', 'id:uB': 'absent' }) } });
  const a = w.trainingAttendanceForSession('tue', [twinA, twinB], '2026-09-01');
  assert.deepEqual(a.attMap, { pA: 'present', pB: 'absent' });
});

test('a roster row with no account claims nothing from another player', () => {
  const noAcct = { id: 'p9', name: 'Trial' };            // playerMatchKey -> id:p9
  const w = world({ roster: [ANA, noAcct],
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const a = w.trainingAttendanceForSession('tue', [ANA, noAcct], '2026-09-01');
  assert.equal(a.attMap.p9, undefined);
  assert.equal(a.noRecord, 1);
});

// ───────────────────────── E. states ────────────────────────────────────────

test('loading, failed, none and recorded are four different answers', () => {
  const loading = world({ roster: [ANA], loaded: false }).trainingAttendanceForSession('tue', [ANA], '2026-09-01');
  assert.equal(loading.unknown, true);
  assert.equal(loading.pct, null, 'unknown is never 0%');

  const failed = world({ roster: [ANA], loaded: false, failed: true });
  assert.equal(failed.trainingAttendanceForSession('tue', [ANA], '2026-09-01').unknown, true);
  assert.equal(failed.attendanceFailed(), true, 'and the failure is distinguishable');

  const denied = world({ roster: [ANA], denied: true }).trainingAttendanceForSession('tue', [ANA], '2026-09-01');
  assert.equal(denied.unknown, true);

  const none = world({ roster: [ANA], sessions: {} }).trainingAttendanceForSession('tue', [ANA], '2026-09-01');
  assert.equal(none.unknown, false, 'we KNOW nothing was recorded');
  assert.equal(none.recorded, 0);
  assert.equal(none.pct, null, 'and still never 0%');
});

test('an unrecorded player is not absent', () => {
  const w = world({ roster: [ANA, BEN],
    sessions: { 'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }) } });
  const a = w.trainingAttendanceForSession('tue', [ANA, BEN], '2026-09-01');
  assert.equal(a.absent, 0, 'Ben was not marked, so he is not absent');
  assert.equal(a.noRecord, 1);
  assert.equal(a.recorded, 1);
  assert.equal(a.pct, 100, 'of the decisions actually taken');
});

test('an empty History is only shown when we KNOW it is empty', () => {
  // A failed or pending read once rendered "No session history yet" — the same
  // confident lie the per-session cards already avoided.
  const fn = extractFn(html, '_renderTrainingHistory');
  assert.match(fn, /const _historyUnknown = currentAttendance\(\) === null;/);
  const empty = fn.slice(fn.indexOf('shown.length === 0'), fn.indexOf('shown.length === 0') + 1400);
  assert.match(empty, /_historyUnknown/, 'the empty state is gated on knowing');
  assert.match(empty, /History unavailable/);
  assert.match(empty, /Loading history…/);
  assert.match(empty, /not a record of an empty history/);
  assert.ok(empty.indexOf('_historyUnknown') < empty.indexOf('No session history yet'),
    'unknown is decided before "no history" is reachable');
});

test('History shows three states rather than a bare percentage', () => {
  const i = html.indexOf('const attUnknown = att.unknown;');
  assert.ok(i > -1, 'History distinguishes unknown');
  const card = html.slice(i, i + 1800);
  assert.match(card, /Loading attendance…/);
  assert.match(card, /Attendance unavailable/);
  assert.match(card, /Attendance not recorded/);
});

// ───────────────────────── B. local compatibility ───────────────────────────

test('the local store is preserved, never deleted', () => {
  // It is still declared, still captured/adopted on a group switch, and the
  // legacy editor still writes to it — it is simply not an authority any more.
  assert.match(html, /trainingAttendance:\s*\{\}/, 'still part of state');
  assert.match(strip(extractFn(html, 'captureTrainingState')), /trainingAttendance/, 'still stashed per group');
  assert.match(strip(extractFn(html, 'adoptTrainingState')), /trainingAttendance/, 'still restored per group');
  assert.match(strip(extractFn(html, 'trainingSetAttendance')), /state\.trainingAttendance/, 'the legacy writer is intact');
});

test('the legacy local editor is not reachable from any Beta surface', () => {
  // Its tab is excluded from the Beta tab bar, and History's jump button is
  // behind the same flag — so nothing a Beta coach can press writes locally.
  // (Build AA added the READ-ONLY summary tab, id 'summary' — deliberately not
  // the legacy 'attendance' id, which still names the local editor.)
  const bar = strip(extractFn(html, '_trainingTabBar'));
  assert.match(bar, /\['planner','Planner'\],\['summary','Attendance'\],\['history','History'\]/,
    'Beta shows Planner + read-only Attendance summary + History');
  const betaList = bar.slice(bar.indexOf('? ['), bar.indexOf(': ['));
  assert.ok(!/\['attendance'/.test(betaList), 'the legacy editor id stays out of Beta');
  // Inside History, every jump to the legacy editor must sit behind the flag.
  const hist = extractFn(html, '_renderTrainingHistory');
  const jump = hist.indexOf("setTrainingTab(\\'attendance\\')");
  assert.ok(jump > -1, 'the jump button exists (non-Beta keeps it)');
  const guard = hist.lastIndexOf('BETA_SIMPLE_UI', jump);
  assert.ok(guard > -1 && jump - guard < 400,
    'the History jump to the legacy editor must be behind BETA_SIMPLE_UI');
});

// ───────────────────────── G. availability independence ─────────────────────

test('nothing in the attendance path reads availability', () => {
  for (const fn of ['trainingAttendanceForSession', 'attendanceStats', 'attendanceOccurrenceId',
                    'trainingSessionHasData', 'trainingHistorySessions']) {
    const src = strip(extractFn(html, fn));
    for (const bad of [/sessionRows\(/, /resolvedAnswerFor\(/, /availabilityWeekSessions/, /trainingTuesday/, /no-reply/]) {
      assert.ok(!bad.test(src), `${fn} must not read availability (${bad})`);
    }
  }
});

// ───────────────────────── H. History ↔ profile consistency ─────────────────

test('History and the profile report the same result for the same player', () => {
  const sessions = {
    'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present', 'id:u2': 'absent' }),
    'slot_tue-20260908': reg('2026-09-08', { 'id:u1': 'absent',  'id:u2': 'present' }),
  };
  const w = world({ roster: [ANA, BEN], sessions });
  for (const p of [ANA, BEN]) {
    const profile = w.attendanceStats(sessions, w.playerMatchKey(p), '2026-07-01', '2027-06-30');
    // History's summary calls exactly this, so agreement is structural; this
    // pins the arithmetic both surfaces show.
    assert.equal(profile.recorded, 2);
    assert.equal(profile.present, 1);
    assert.equal(profile.attendancePct, 50, p.name);
  }
  // and the per-session view agrees with the per-player one
  const s1 = w.trainingAttendanceForSession('tue', [ANA, BEN], '2026-09-01');
  assert.equal(s1.present, 1);
  assert.equal(s1.absent, 1);
});
