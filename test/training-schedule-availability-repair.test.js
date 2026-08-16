/**
 * TRAINING SCHEDULE SIMPLIFICATION + U18 AVAILABILITY RECONCILIATION.
 *
 *  FORM — the beta card shows Day / Start / End / Venue only. Arrival, From
 *  and Until are no longer rendered or editable (older stored records keep
 *  those fields untouched — the server sanitiser still round-trips them).
 *
 *  END TIME — two client faults lost it: (1) trainingScheduleSave's busy
 *  guard silently DROPPED an update fired while the previous field's save
 *  was in flight; (2) every save's render() rebuilt the Settings DOM,
 *  destroying the input being edited before its onchange fired. Updates now
 *  queue per slot and pump serially, and the post-save repaint defers while
 *  focus is inside the card.
 *
 *  AVAILABILITY — the U18 player's answers landed under SENIORS slot ids
 *  (slot_tue-YYYYMMDD): resetIdentityScopedState never cleared the
 *  _trainingSchedule cache, so an identity claimed in a tab that had the
 *  Seniors schedule loaded generated availability events from the WRONG
 *  group's slots. And setAllAvailable answered the legacy demo trio
 *  (tue/thu/game) instead of the real viewed-week events.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.sched-repair.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const store = await import('../api/_identityStore.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9';

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-teat', email: 't@c.test', displayName: 'U18 Teat' },
    { id: 'u-sen', email: 'sen@c.test', displayName: 'Sen Player' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-teat', teamId: CLUB, userId: 'u-teat', role: 'player', status: 'active', playerGroupId: U18 },
    { id: 'm-sen', teamId: CLUB, userId: 'u-sen', role: 'player', status: 'active', playerGroupId: SEN },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([
    { teamId: CLUB, userId: 'u-teat', legacyPlayerId: 'u-teat' },
    { teamId: CLUB, userId: 'u-sen', legacyPlayerId: 'u-sen' },
  ]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'general', status: 'active' },
      { id: 'grp_1b0fb56b', name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [{ id: 'team_initial', groupId: SEN, name: 'Premier development', status: 'active' }] }));
}
async function call(handler, method, query, body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method, query, headers: { cookie: `ce_session=${token}` }, body, on() {} }, res);
  return res;
}
const sessionFor = (userId, role) => store.createSession({ userId, teamId: CLUB, role });

// ── FORM 1-3: Arrival / From / Until are gone from the card ───────────────
test('the schedule card renders Day/Start/End/Venue only — no Arrival, From or Until', () => {
  const card = fn('renderTrainingScheduleCard');
  assert.ok(!card.includes("'arrivalTime'"), 'Arrival input removed');
  assert.ok(!card.includes("'effectiveFrom'"), 'From input removed');
  assert.ok(!card.includes("'effectiveTo'"), 'Until input removed');
  assert.ok(!/>Arrival</.test(card) && !/>From</.test(card) && !/>Until</.test(card), 'labels removed');
  for (const kept of ["'day'", "'startTime'", "'endTime'", "'venue'"]) {
    assert.ok(card.includes(kept), `${kept} field kept`);
  }
  // Older records keep their fields — the server sanitiser still carries them.
  const serverSrc = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(serverSrc, /arrivalTime:\s*hhmm\(raw\?\.arrivalTime\)/, 'stored arrival survives reads');
  assert.match(serverSrc, /effectiveFrom: isoDate\(raw\?\.effectiveFrom\)/, 'stored from/until survive reads');
});

// ── FORM 4-6: start AND end persist through save + reload ─────────────────
test('start 17:45 and end 19:15 persist through the server and a fresh GET', async () => {
  seed();
  const coach = await sessionFor('u-simon', 'coach');
  const add = await call(publishHandler, 'POST', { resource: 'training-schedule' },
    { action: 'add', group: U18, slot: { day: 'Tue', startTime: '17:45' } }, coach.token);
  assert.equal(add.code, 200);
  const slotId = add.body.slots[0].id;
  const upd = await call(publishHandler, 'POST', { resource: 'training-schedule' },
    { action: 'update', group: U18, slotId, slot: { endTime: '19:15' } }, coach.token);
  assert.equal(upd.code, 200);
  assert.equal(upd.body.slots[0].endTime, '19:15', 'end time saved');
  const reload = await call(publishHandler, 'GET', { resource: 'training-schedule', group: U18 }, null, coach.token);
  assert.equal(reload.body.slots[0].startTime, '17:45', 'start survives reload');
  assert.equal(reload.body.slots[0].endTime, '19:15', 'end survives reload');
});

test('a field edit fired while a save is in flight is QUEUED, never dropped', () => {
  const upd = fn('trainingScheduleUpdateField');
  assert.match(upd, /_trainingScheduleQueue/, 'edits go through the queue');
  assert.match(upd, /trainingSchedulePump\(\)/, 'and the pump drains it');
  assert.match(fn('trainingSchedulePump'), /if \(_trainingScheduleBusy \|\| !_trainingScheduleQueue\) return;/,
    'pump waits for the wire instead of dropping');
  const save = fn('trainingScheduleSave');
  assert.match(save, /_trainingScheduleQueue \|\| \{\}/, 'queued edits re-apply over the fresh record');
  assert.match(save, /training-schedule-card/, 'no repaint while the operator is mid-edit in the card');
});

// ── AVAILABILITY 7-10: U18 answer reconciles on the U18 board ─────────────
test('a U18 answer under the U18 event id reaches the U18 coach board (not to-chase)', async () => {
  seed();
  const eventId = 'slot_u18tue_0-20260818';                 // the group's REAL dated id
  const player = await sessionFor('u-teat', 'player');
  const post = await call(availabilityHandler, 'POST', {},
    { sessionId: eventId, response: 'maybe', reason: '' }, player.token);
  assert.equal(post.code, 200, JSON.stringify(post.body));

  const coach = await sessionFor('u-simon', 'coach');
  const board = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: U18 }, null, coach.token);
  assert.equal(board.code, 200);
  const mine = board.body.resolved['u-teat'];
  assert.ok(mine, 'the player resolves on the U18 board');
  assert.equal(mine[eventId].response, 'maybe', 'status is exactly what the player chose');
  // Not "to chase": the board counts a player answered when ANY id resolves
  // for the event — same normalizeSessionId bucket both sides.
  const answered = Object.keys(mine).length > 0;
  assert.equal(answered, true);
});

test('every response status round-trips (available / maybe / unavailable)', async () => {
  seed();
  const player = await sessionFor('u-teat', 'player');
  const coach = await sessionFor('u-simon', 'coach');
  for (const response of ['available', 'maybe', 'unavailable']) {
    const eventId = `slot_u18thu_1-2026082${response.length % 10}`;
    await call(availabilityHandler, 'POST', {}, { sessionId: eventId, response, reason: response === 'unavailable' ? 'work' : '' }, player.token);
    const board = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: U18 }, null, coach.token);
    assert.equal(board.body.resolved['u-teat'][eventId].response, response);
  }
});

// ── AVAILABILITY 11-12: strict group isolation, both directions ───────────
test('a Seniors response never satisfies the U18 board, and vice versa', async () => {
  seed();
  const sen = await sessionFor('u-sen', 'player');
  const u18 = await sessionFor('u-teat', 'player');
  const coach = await sessionFor('u-simon', 'coach');
  await call(availabilityHandler, 'POST', {}, { sessionId: 'slot_x-20260818', response: 'available' }, sen.token);
  await call(availabilityHandler, 'POST', {}, { sessionId: 'slot_y-20260818', response: 'available' }, u18.token);

  const u18Board = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: U18 }, null, coach.token);
  assert.equal(u18Board.body.resolved['u-sen'], undefined, 'Seniors answer absent from the U18 board');
  assert.ok(u18Board.body.resolved['u-teat'], 'U18 answer present on its own board');

  const senBoard = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: SEN }, null, coach.token);
  assert.equal(senBoard.body.resolved['u-teat'], undefined, "U18 answer absent from the Seniors board");
  assert.ok(senBoard.body.resolved['u-sen'], 'Seniors answer present on its own board');
});

// ── THE ROOT-CAUSE PINS: stale schedule cache + demo-trio Yes-to-all ──────
test('an identity change drops the training-schedule cache (the Seniors-slot-id leak)', () => {
  const reset = fn('resetIdentityScopedState');
  assert.match(reset, /_trainingSchedule = null;/, 'cache cleared');
  assert.match(reset, /_trainingScheduleAttempted = false;/, 'refetch allowed');
  assert.match(reset, /_trainingScheduleQueue = null;/, 'pending edits of the old identity dropped');
});

test('"Yes to all" answers the real viewed-week events, not the legacy demo trio', () => {
  const all = fn('setAllAvailable');
  assert.match(all, /availEventsForViewedWeek\(\)\.forEach/, 'iterates the dated group events');
  assert.ok(!all.includes('state.schedule.forEach'), 'the demo trio path is gone');
});
