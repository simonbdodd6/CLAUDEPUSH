/**
 * Phase 23C — coach must see a player's saved availability.
 *
 * Reproducible beta bug: a player saves availability (their own screen confirms
 * it), but the coach Availability dashboard shows them as "No Reply".
 *
 * Root cause: a player POSTs while authenticated, so the server stores the entry
 * under their PERMANENT user id (key = user.id) with userId/playerId/legacyPlayerId.
 *  - The player SELF read (GET ?myResponse=1) matches the entry by userId OR
 *    playerId OR legacyPlayerId → the player always sees their own answer.
 *  - The coach read (GET ?sessionId=…) returned a list that OMITTED
 *    legacyPlayerId, and the coach matcher never matched on legacyPlayerId.
 * So a newly-invited player — whose coach roster record is keyed by the invite
 * id (inv-…) with no synced permanent userId and a display name that differs
 * from the server label — has NO shared identifier the coach can match on, and
 * shows as "No Reply" even though it saved.
 *
 * Fix: the coach read returns the (already-stored) legacyPlayerId, and the coach
 * live-availability matcher matches on it too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.coach-visibility.test';
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
    const pat = String(args[2] || '*');
    const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  return { ok: true, json: async () => ({ result }) };
};

const { default: availabilityHandler } = await import('../api/availability.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(data)   { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end() { return this; },
  };
}
async function call(method, query, body, headers) {
  const res = buildRes();
  await availabilityHandler({ method, query: query || {}, headers: headers || {}, body: body || {} }, res);
  return res;
}

// Seed a registered player whose permanent userId differs from the invite
// legacyPlayerId, with a self-registered display name (the realistic shape).
async function seedPlayer({ userId, legacyPlayerId, displayName }) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id: userId, email: `${userId}@vis.test`, firstName: displayName, lastName: '', displayName });
  kv.set('app:identity:users', JSON.stringify(users));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: `tm_${userId}`, teamId: 'boitsfort-rfc', userId, role: 'player', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const profiles = JSON.parse(kv.get('app:identity:player_profiles') || '[]');
  profiles.push({ id: `profile_${userId}`, teamId: 'boitsfort-rfc', teamMemberId: `tm_${userId}`, userId, displayName, legacyPlayerId });
  kv.set('app:identity:player_profiles', JSON.stringify(profiles));
  const session = await createSession({ userId, teamId: 'boitsfort-rfc', role: 'player' });
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}
async function seedCoach(id) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id, email: `${id}@vis.test`, firstName: id, lastName: 'Coach', displayName: id });
  kv.set('app:identity:users', JSON.stringify(users));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: `tm_${id}`, teamId: 'boitsfort-rfc', userId: id, role: 'coach', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role: 'coach' });
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

test('coach read returns legacyPlayerId so a player stored under user_ id is matchable', async () => {
  kv.clear();
  const player = await seedPlayer({ userId: 'user_newplayer', legacyPlayerId: 'inv-abc123', displayName: 'Brand New' });
  const coach  = await seedCoach('user_coach');

  // Player saves availability (stored under their permanent user id).
  const post = await call('POST', {}, { sessionId: 'game', response: 'available', reason: '' }, { cookie: player.cookie });
  assert.equal(post.statusCode, 200);

  // Player self-read sees it (always worked — matches by legacyPlayerId).
  const mine = await call('GET', { myResponse: '1' }, null, { cookie: player.cookie });
  assert.equal(mine.body.responses.game?.response, 'available');

  // Coach read MUST expose legacyPlayerId so the coach can map the entry to the
  // roster record keyed by the invite id.
  const board = await call('GET', { sessionId: 'game' }, null, { cookie: coach.cookie });
  assert.equal(board.statusCode, 200);
  const entry = board.body.responses[0];
  assert.ok(entry, 'coach read returns the player entry');
  assert.equal(entry.response, 'available');
  assert.equal(entry.legacyPlayerId, 'inv-abc123',
    'coach read must include legacyPlayerId (the only identifier shared with the invite-keyed roster record)');
});

test('status AND reason are visible to the coach read', async () => {
  kv.clear();
  const player = await seedPlayer({ userId: 'user_p2', legacyPlayerId: 'inv-p2', displayName: 'Reason Player' });
  const coach  = await seedCoach('user_coach2');
  await call('POST', {}, { sessionId: 'thu', response: 'maybe', reason: 'work' }, { cookie: player.cookie });
  const board = await call('GET', { sessionId: 'thu' }, null, { cookie: coach.cookie });
  const entry = board.body.responses.find(e => e.legacyPlayerId === 'inv-p2');
  assert.ok(entry, 'entry present');
  assert.equal(entry.response, 'maybe');
  assert.equal(entry.reason, 'work');
  assert.equal(entry.legacyPlayerId, 'inv-p2');
});

test('different sessions remain independent in the coach read', async () => {
  kv.clear();
  const player = await seedPlayer({ userId: 'user_p3', legacyPlayerId: 'inv-p3', displayName: 'Indep' });
  const coach  = await seedCoach('user_coach3');
  await call('POST', {}, { sessionId: 'tue',  response: 'unavailable', reason: 'injury' }, { cookie: player.cookie });
  await call('POST', {}, { sessionId: 'thu',  response: 'maybe',       reason: 'work'   }, { cookie: player.cookie });
  await call('POST', {}, { sessionId: 'game', response: 'available',   reason: ''       }, { cookie: player.cookie });
  const tue  = (await call('GET', { sessionId: 'tue'  }, null, { cookie: coach.cookie })).body.responses.find(e => e.legacyPlayerId === 'inv-p3');
  const thu  = (await call('GET', { sessionId: 'thu'  }, null, { cookie: coach.cookie })).body.responses.find(e => e.legacyPlayerId === 'inv-p3');
  const game = (await call('GET', { sessionId: 'game' }, null, { cookie: coach.cookie })).body.responses.find(e => e.legacyPlayerId === 'inv-p3');
  assert.equal(tue.response,  'unavailable');
  assert.equal(thu.response,  'maybe');
  assert.equal(game.response, 'available');
});

// ── Coach-side matcher (refreshLiveAvailability) — pure helpers from index.html ──
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}
const helpers = new Function(
  `"use strict";\n${['liveAvailabilityEntryKeys', 'liveAvailabilityPlayerKeys'].map(extractFn).join('\n')}\n` +
  `return { liveAvailabilityEntryKeys, liveAvailabilityPlayerKeys };`
)();

// Mirror refreshLiveAvailability's match exactly: index entries under every id,
// then match a roster player by any of its ids.
function coachMatch(responsesBySession, player, sessionIds) {
  const byLabel = {};
  for (const sid of sessionIds) {
    for (const entry of (responsesBySession[sid] || [])) {
      helpers.liveAvailabilityEntryKeys(entry).forEach(k => {
        (byLabel[k] = byLabel[k] || {})[sid] = { response: entry.response, reason: entry.reason || '' };
      });
    }
  }
  for (const k of helpers.liveAvailabilityPlayerKeys(player)) if (byLabel[k]) return byLabel[k];
  return null;
}

// The realistic shape: player answered while authenticated → entry stored under
// the PERMANENT user id, carrying legacyPlayerId (invite id) + a label that is
// the SELF-REGISTERED name. The coach roster record is keyed by the INVITE id,
// has no synced userId, and a DIFFERENT name the coach typed when inviting.
const SESSIONS = ['tue', 'thu', 'game'];
const serverEntry = (over = {}) => ({
  key: 'user_newplayer', userId: 'user_newplayer', playerId: 'user_newplayer',
  legacyPlayerId: 'inv-abc123', label: 'Self Registered Name',
  response: 'available', reason: '', ...over,
});
const coachRosterRecord = (over = {}) => ({
  id: 'inv-abc123', legacyPlayerId: 'inv-abc123', userId: '', name: 'Coach Typed Name', ...over,
});

test('1. a saved player availability is matched to the coach roster record (via legacyPlayerId)', () => {
  const live = coachMatch({ game: [serverEntry()] }, coachRosterRecord(), SESSIONS);
  assert.ok(live, 'coach must match the entry to the roster record');
  assert.equal(live.game.response, 'available');
});

test('2. NEW invited player (no synced userId, different name) is visible to coach', () => {
  // Only legacyPlayerId is shared. With userId unsynced and names differing, this
  // is exactly the No-Reply bug — must now match.
  const live = coachMatch({ thu: [serverEntry({ response: 'unavailable', reason: 'injury' })] },
    coachRosterRecord(), SESSIONS);
  assert.ok(live, 'invited player must be matched');
  assert.equal(live.thu.response, 'unavailable');
  assert.equal(live.thu.reason, 'injury');
});

test('2b. WITHOUT legacyPlayerId there would be NO match (proves the fix is load-bearing)', () => {
  const entryNoLegacy = serverEntry();
  delete entryNoLegacy.legacyPlayerId;            // simulate the old (broken) read shape
  const live = coachMatch({ game: [entryNoLegacy] }, coachRosterRecord(), SESSIONS);
  assert.equal(live, null, 'old read shape cannot match → the player shows as No Reply');
});

test('3. status AND reason map through for the coach', () => {
  const live = coachMatch({ thu: [serverEntry({ response: 'maybe', reason: 'work' })] }, coachRosterRecord(), SESSIONS);
  assert.equal(live.thu.response, 'maybe');
  assert.equal(live.thu.reason, 'work');
});

test('4. different sessions remain independent through the coach matcher', () => {
  const live = coachMatch({
    tue:  [serverEntry({ response: 'unavailable', reason: 'injury' })],
    thu:  [serverEntry({ response: 'maybe',       reason: 'work'   })],
    game: [serverEntry({ response: 'available',   reason: ''       })],
  }, coachRosterRecord(), SESSIONS);
  assert.equal(live.tue.response,  'unavailable');
  assert.equal(live.thu.response,  'maybe');
  assert.equal(live.game.response, 'available');
});

test('coach still matches when roster record IS keyed by the permanent user id', () => {
  const live = coachMatch({ game: [serverEntry()] },
    { id: 'user_newplayer', userId: 'user_newplayer', name: 'Self Registered Name' }, SESSIONS);
  assert.ok(live);
  assert.equal(live.game.response, 'available');
});

test('5. no shared pending state regression — V2 per-key map only, no shared _reasonPickerOpen', () => {
  assert.equal(src.includes('_reasonPickerOpen'), false, 'shared _reasonPickerOpen must stay removed');
  assert.ok(src.includes('_availReasonOpenByKey'), 'per-key reason map (AvailabilityV2) must remain');
  assert.ok(/function renderPlayerAvailabilityV2\s*\(/.test(src), 'AvailabilityV2 renderer must remain');
});
