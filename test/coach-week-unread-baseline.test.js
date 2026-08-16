/**
 * COACH AVAILABILITY WEEK UNIFICATION + JOIN-BASELINED UNREAD.
 *
 *  WEEK — the coach board ran TWO week systems: an offset-based header
 *  (_availWeekOffset) and the dated week (state.coachAvailWeekStart) that
 *  actually generated the session list. The header could say 10–16 Aug over
 *  cards dated 17–23 Aug, and the header's "Next Week" replaced the whole
 *  board with a placeholder. Now every part of the board — header label,
 *  session cards, counters, event dates — reads coachAvailWeek().
 *
 *  UNREAD — a brand-new account logged in to "9+": with no read marker the
 *  server counted EVERY retained message in club-wide channels, including
 *  history written before the member existed. Unread is now baselined at
 *  the member's join time; read markers still win once newer. Account-wide
 *  private DM semantics are untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.week-unread.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const lists = new Map();
const rangeList = (l, s, e) => l.slice(Number(s), (Number(e) < 0 ? l.length + Number(e) : Number(e)) + 1);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM') { lists.set(args[0], rangeList(lists.get(args[0]) || [], args[1], args[2])); result = 'OK'; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  return { ok: true, json: async () => ({ result }) };
};

const { default: availabilityHandler } = await import('../api/availability.js');
const { default: chatHandler } = await import('../api/chat.js');
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
const U18_SLOTS = [
  { id: 'slot_msvgzozt_0', day: 'Tue', startTime: '17:45', endTime: '19:15', active: true, sessionId: '' },
  { id: 'slot_msvh0skf_1', day: 'Thu', startTime: '17:45', endTime: '19:15', active: true, sessionId: '' },
];

// The pure event generator with the app's real week helpers, today = 16 Aug.
function eventsFor(weekStart) {
  return new Function(`"use strict";
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    ${fn('availAddDays')}
    ${fn('availWeekStart')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('availabilityEventsForWeek')}
    return availabilityEventsForWeek(${JSON.stringify(weekStart)}, {
      fixtures: [], slots: ${JSON.stringify(U18_SLOTS)},
      currentWeekStart: availWeekStart('2026-08-16'),
    });
  `)();
}

// ── WEEK 1: 10–16 Aug holds ONLY its own dates — never 18/20 ──────────────
test('week 10–16 Aug: sessions are 11 and 13 Aug — 18/20 Aug never appear', () => {
  const events = eventsFor('2026-08-10');
  const dates = events.filter(e => e.type === 'training').map(e => e.date);
  assert.deepEqual(dates, ['2026-08-11', '2026-08-13']);
  assert.ok(!events.some(e => /2026-08-1[89]|2026-08-20/.test(e.date)), 'no next-week dates');
});

// ── WEEK 2: 17–23 Aug shows Tue 18 + Thu 20 with dated U18 ids ────────────
test('week 17–23 Aug: Tue 18 and Thu 20 render with their dated U18 event ids', () => {
  const events = eventsFor('2026-08-17');
  const training = events.filter(e => e.type === 'training');
  assert.deepEqual(training.map(e => e.date), ['2026-08-18', '2026-08-20']);
  assert.deepEqual(training.map(e => e.id),
    ['slot_msvgzozt_0-20260818', 'slot_msvh0skf_1-20260820']);
});

// ── ONE week system on the board ──────────────────────────────────────────
test('the board runs ONE week: header, counters and cards all read coachAvailWeek()', () => {
  const board = fn('renderMessageCenterV2');
  assert.ok(!board.includes('weekPlaceholder'), 'the blanking placeholder is gone');
  assert.ok(!board.includes('_availWeekOffset'), 'the offset week is no longer read');
  assert.match(board, /const weekStart = coachAvailWeek\(\);/, 'dated week is the source');
  assert.match(board, /availDatedWeekLabel\(weekStart\)/, 'header range shows the dated week');
  const shift = fn('availWeekShift');
  assert.match(shift, /state\.coachAvailWeekStart/, 'header arrows move the dated week');
  assert.ok(!/_availWeekOffset\s*=/.test(shift), 'not the offset');
});

// ── U18 answers resolve on the 17–23 board; counters share the week ───────
async function call(handler, method, query, body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method, query, headers: { cookie: `ce_session=${token}` }, body, on() {} }, res);
  return res;
}
function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-teat', email: 't@c.test', displayName: 'U18 Teat' },
    { id: 'u-sen', email: 'sen@c.test', displayName: 'Sen Player' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full', joinedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'm-teat', teamId: CLUB, userId: 'u-teat', role: 'player', status: 'active', playerGroupId: U18, joinedAt: '2026-08-16T07:11:49.422Z' },
    { id: 'm-sen', teamId: CLUB, userId: 'u-sen', role: 'player', status: 'active', playerGroupId: SEN, joinedAt: '2026-01-01T00:00:00.000Z' },
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

test('U18 answers for 18/20 Aug resolve on the U18 board — replied counters follow', async () => {
  seed();
  const player = await store.createSession({ userId: 'u-teat', teamId: CLUB, role: 'player' });
  for (const sid of ['slot_msvgzozt_0-20260818', 'slot_msvh0skf_1-20260820']) {
    const r = await call(availabilityHandler, 'POST', {}, { sessionId: sid, response: 'available' }, player.token);
    assert.equal(r.code, 200);
  }
  const coach = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const board = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: U18 }, null, coach.token);
  const mine = board.body.resolved['u-teat'];
  assert.ok(mine, 'resolved on the U18 board');
  // Every 17–23 training event answered → replied-to-all counts the player,
  // chase does not (the board derives both from these same resolved answers).
  const weekIds = eventsFor('2026-08-17').filter(e => e.type === 'training').map(e => e.id);
  assert.ok(weekIds.every(id => mine[id]?.response === 'available'), JSON.stringify(Object.keys(mine)));
});

test('group isolation intact: Seniors ↔ U18 answers never cross boards', async () => {
  seed();
  const sen = await store.createSession({ userId: 'u-sen', teamId: CLUB, role: 'player' });
  const u18 = await store.createSession({ userId: 'u-teat', teamId: CLUB, role: 'player' });
  await call(availabilityHandler, 'POST', {}, { sessionId: 'slot_a-20260818', response: 'available' }, sen.token);
  await call(availabilityHandler, 'POST', {}, { sessionId: 'slot_b-20260818', response: 'available' }, u18.token);
  const coach = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const u18Board = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: U18 }, null, coach.token);
  const senBoard = await call(availabilityHandler, 'GET', { resolveRoster: '1', group: SEN }, null, coach.token);
  assert.equal(u18Board.body.resolved['u-sen'], undefined);
  assert.equal(senBoard.body.resolved['u-teat'], undefined);
  assert.ok(u18Board.body.resolved['u-teat'] && senBoard.body.resolved['u-sen']);
});

// ── UNREAD: join-baselined, no cross-identity leak, DMs intact ────────────
const chatCall = async (token, qs) => {
  const res = {
    code: 0, body: null,
    writeHead(c) { this.code = c; return this; },
    end(b) { if (b !== undefined) this.body = JSON.parse(b); return this; },
    setHeader() {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await chatHandler({ method: 'GET', url: `/api/chat?${qs}`, headers: { cookie: `ce_session=${token}` } }, res);
  return res;
};

test('pre-join history never counts: the new player logs in to 0 unread, not 9+', async () => {
  seed();
  kv.set('app:chat:convs', JSON.stringify([
    { id: 'squad', name: 'Squad', type: 'GROUP', pinned: true, createdAt: 1 },
    { id: 'announce', name: 'Announcements', type: 'ANNOUNCEMENT', pinned: true, createdAt: 1 },
  ]));
  const OLD = Date.parse('2026-08-01T00:00:00Z');
  const squad = [];
  for (let i = 0; i < 12; i++) squad.push(JSON.stringify({ id: `sq${i}`, convId: 'squad', senderId: 'u-sen', senderName: 'Sen Player', text: `old ${i}`, type: 'TEXT', ts: OLD + i * 1000 }));
  lists.set(`app:chat:conv:squad@${CLUB}:msgs`, squad.reverse());

  const teat = await store.createSession({ userId: 'u-teat', teamId: CLUB, role: 'player' });
  const r = await chatCall(teat.token, 'action=conversations');
  const total = (r.body.conversations || []).reduce((n, c) => n + (c.unread || 0), 0);
  assert.equal(total, 0, `12 pre-join messages must not badge a new member (got ${total})`);
});

test('messages AFTER joining still count as unread (real activity is never hidden)', async () => {
  seed();
  kv.set('app:chat:convs', JSON.stringify([{ id: 'squad', name: 'Squad', type: 'GROUP', pinned: true, createdAt: 1 }]));
  const NEW = Date.parse('2026-08-16T09:00:00Z');   // after the 07:11 join
  lists.set(`app:chat:conv:squad@${CLUB}:msgs`, [
    JSON.stringify({ id: 'sqNew', convId: 'squad', senderId: 'u-simon', senderName: 'Simon', text: 'welcome!', type: 'TEXT', ts: NEW }),
    JSON.stringify({ id: 'sqOld', convId: 'squad', senderId: 'u-sen', senderName: 'Sen', text: 'pre-join', type: 'TEXT', ts: Date.parse('2026-08-01T00:00:00Z') }),
  ]);
  const teat = await store.createSession({ userId: 'u-teat', teamId: CLUB, role: 'player' });
  const r = await chatCall(teat.token, 'action=conversations');
  const squad = (r.body.conversations || []).find(c => c.id === 'squad');
  assert.equal(squad?.unread, 1, 'only the post-join message counts');
  // And a long-standing member still sees full unread history (their join predates it).
  const sen = await store.createSession({ userId: 'u-sen', teamId: CLUB, role: 'player' });
  const r2 = await chatCall(sen.token, 'action=conversations');
  const squad2 = (r2.body.conversations || []).find(c => c.id === 'squad');
  assert.equal(squad2?.unread, 1, 'the older member counts messages from others normally');
});

test('identity switch cannot flash the previous account\'s badge (client reset pins)', () => {
  const reset = fn('resetIdentityScopedState');
  assert.match(reset, /_chatConversations = \[\];/, 'previous identity\'s conversations dropped');
  assert.match(reset, /chatSetUnreadTotal\(0\);/, 'badge zeroed before the new identity resolves');
  // Called on every login/claim path where the user actually changes.
  const claims = src.match(/resetIdentityScopedState\(\)/g) || [];
  assert.ok(claims.length >= 4, 'reset wired into the login/claim/adoption paths');
});

test('same-account DMs stay account-wide across group switching (unchanged)', () => {
  const filter = fn('_filterCanonicalConversations');
  assert.ok(!/operationalGroupId/.test(filter), 'DM merge remains group-blind');
  const sync = fn('syncTrainingStateToGroup');
  assert.ok(!/_chatConversations/.test(sync), 'group switch never touches the inbox');
  assert.match(src, /PRODUCT RULE — private DMs are ACCOUNT-WIDE/, 'the documented rule stands');
});
