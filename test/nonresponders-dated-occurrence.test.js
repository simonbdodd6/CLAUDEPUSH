/**
 * BUILD Z — the non-responder list inspects the DATED occurrences.
 *
 * availabilityNonResponders read only the passed schedule rows' bare ids.
 * Groups whose slots carry no legacy sessionId keep their answers under the
 * DATED occurrence ids — production U18: 53 answers under
 * slot_msvh0skf_1-20260903, 1 under bare `thu`, so the Overview chased 60 of
 * 61 players. The function now also inspects the current week's canonical
 * training event ids (slot.sessionId || dated id — the board's own rule,
 * the same one tonightAvailabilityEventId applies to tonight).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start === -1) start = src.indexOf('    async function ' + name + '(');
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
const fn = n => extractFn(html, n);

function world({ slots, players = [], resolved = {}, todayIso = '2026-09-03' }) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: 'grp_u18', players: cfg.players,
      schedule: [{ id: 'tue', title: 'Training session 1' }, { id: 'thu', title: 'Training session 2' }] };
    function operationalPlayers() { return state.players; }
    function playerIsArchived() { return false; }
    let _resolvedAvailability = cfg.resolved;
    let _resolvedAvailabilityGroup = 'grp_u18';
    let _availLastSync = 'x';
    let _trainingSchedule = cfg.slots ? { slots: cfg.slots } : null;
    let _trainingScheduleGroupId = 'grp_u18';
    function ensureTrainingSchedule() {}
    function availToday() { return cfg.todayIso; }
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('sessionKey')}
    ${fn('sessionReasonKey')}
    ${fn('normalizeSessionId')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('resolvedAnswerFor')}
    ${fn('sessionRows')}
    ${fn('availabilityNonResponders')}
    return { chase: () => availabilityNonResponders(state.schedule).map(p => p.id).sort() };
  `)({ slots, players, resolved, todayIso });
}

// today = Thursday 2026-09-03; the U18-style slots carry NO legacy sessionId.
const U18_SLOTS = [
  { id: 'slot_tuex', sessionId: '', day: 'Tue', active: true },
  { id: 'slot_thux', sessionId: '', day: 'Thu', active: true },
];
const DATED_THU = 'slot_thux-20260903';
const DATED_TUE = 'slot_tuex-20260901';
const P = (id, extra = {}) => ({ id, name: 'P' + id, userId: id, ...extra });
const ANS = (sid, resp) => ({ [sid]: { response: resp, reason: '', respondedAt: '2026-09-02T10:00:00Z' } });

test('THE BUG: a player who answered under the DATED occurrence is NOT chased', () => {
  const w = world({ slots: U18_SLOTS, players: [P('a'), P('silent')],
    resolved: { a: ANS(DATED_THU, 'available') } });
  assert.deepEqual(w.chase(), ['silent'],
    'the dated answer counts — only the genuinely silent player is chased');
});

test('available, maybe AND unavailable under dated occurrences all count as answered', () => {
  const w = world({ slots: U18_SLOTS, players: [P('a'), P('m'), P('u'), P('silent')],
    resolved: { a: ANS(DATED_THU, 'available'), m: ANS(DATED_TUE, 'maybe'), u: ANS(DATED_THU, 'unavailable') } });
  assert.deepEqual(w.chase(), ['silent']);
});

test('a completely silent player IS a non-responder (Build X semantics intact)', () => {
  const w = world({ slots: U18_SLOTS, players: [P('silent1'), P('silent2')] });
  assert.deepEqual(w.chase(), ['silent1', 'silent2']);
});

test("an answer in a PAST week's occurrence does not excuse the current week", () => {
  const w = world({ slots: U18_SLOTS, players: [P('old')],
    resolved: { old: ANS('slot_thux-20260827', 'available') } });
  assert.deepEqual(w.chase(), ['old'], 'last week is not this week');
});

test('legacy slots (sessionId set) keep the bare-id behaviour — Seniors unchanged', () => {
  const legacy = [{ id: 'slot_thu', sessionId: 'thu', day: 'Thu', active: true }];
  const w = world({ slots: legacy, players: [P('a'), P('silent')],
    resolved: { a: ANS('thu', 'available') } });
  assert.deepEqual(w.chase(), ['silent']);
});

test('no schedule loaded → exactly the old behaviour (schedule-less clubs byte-identical)', () => {
  const w = world({ slots: null, players: [P('a'), P('silent')],
    resolved: { a: ANS('thu', 'available') } });
  assert.deepEqual(w.chase(), ['silent'], 'bare ids from the passed sessions still count');
  const w2 = world({ slots: null, players: [P('dated')],
    resolved: { dated: ANS(DATED_THU, 'available') } });
  assert.deepEqual(w2.chase(), ['dated'], 'without a slot table no dated id can be derived');
});

test('an inactive slot contributes nothing', () => {
  const w = world({ slots: [{ id: 'slot_thux', sessionId: '', day: 'Thu', active: false }],
    players: [P('a')], resolved: { a: ANS(DATED_THU, 'available') } });
  assert.deepEqual(w.chase(), ['a'], 'a deactivated slot has no current occurrence');
  // And its FABRICATED dateless id ('slot_thux-') can never excuse a player:
  // a deactivated slot must add NO id at all, not a junk one that might
  // collide with corrupt or hostile store data.
  const w2 = world({ slots: [{ id: 'slot_thux', sessionId: '', day: 'Thu', active: false }],
    players: [P('a')], resolved: { a: ANS('slot_thux-', 'available') } });
  assert.deepEqual(w2.chase(), ['a'], 'nothing stored under a dateless junk id may count');
});

test('group boundary is the roster: another group\'s player never enters the list', () => {
  // operationalPlayers() IS the boundary — a player outside it yields no row.
  const w = world({ slots: U18_SLOTS, players: [P('mine')] });
  assert.deepEqual(w.chase(), ['mine'], 'only the operating group\'s roster is inspected');
  const src = fn('availabilityNonResponders');
  assert.ok(src.indexOf('operationalPlayers()') !== -1, 'population from the group boundary');
});

test('the production shape end-to-end: 4 of 6 answered dated, bare holds a stale 1 → chase exactly 2', () => {
  const resolved = {
    a: ANS(DATED_THU, 'available'), b: ANS(DATED_THU, 'available'),
    c: ANS(DATED_TUE, 'maybe'),    d: ANS(DATED_THU, 'unavailable'),
    e: ANS('thu', 'available'),    // the stale bare-id answer still counts too
  };
  const w = world({ slots: U18_SLOTS, players: [P('a'), P('b'), P('c'), P('d'), P('e'), P('f')], resolved });
  assert.deepEqual(w.chase(), ['f'], 'union of canonical occurrences — nobody who answered is chased');
});

test('WIRING: the attention item and Chase-all both consume availabilityNonResponders(state.schedule)', () => {
  assert.match(fn('getNeedsAttentionItems'), /availabilityNonResponders\(sessions\)/);
  assert.match(fn('chaseAllNonResponders'), /availabilityNonResponders\(sessions\)/);
});
