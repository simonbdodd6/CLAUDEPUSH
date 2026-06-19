/**
 * Availability ↔ published-sessions integration.
 *
 * The player self-availability path (GET ?myResponse=1) and the coach
 * clear_week default previously iterated a hardcoded ['tue','thu','game'].
 * They now read the coach's published sessions from app:publish:sessions:
 *
 *  1. Player responses for CUSTOM session ids appear in myResponse=1
 *     once the coach has published those sessions
 *  2. With no published sessions, the historic tue/thu/game fallback
 *     keeps working (backwards compatibility)
 *  3. clear_week with no explicit list clears the published sessions
 *  4. Malformed published ids are ignored, never breaking the fallback
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.avail-sessions.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

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
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

async function seedUser(id, role) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@avail.test`, firstName: id, lastName: 'User', displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId: 'boitsfort-rfc', userId: id, role, status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  if (role === 'player') {
    const profiles = JSON.parse(kv.get('app:identity:player_profiles') || '[]');
    if (!profiles.find(p => p.userId === id)) {
      profiles.push({ id: `profile_${id}`, teamId: 'boitsfort-rfc', teamMemberId: `tm_${id}`, userId: id, displayName: id, legacyPlayerId: id });
      kv.set('app:identity:player_profiles', JSON.stringify(profiles));
    }
  }
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role });
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

function publishSessions(sessions) {
  kv.set('app:publish:sessions', JSON.stringify(sessions));
}

async function callAvailability(method, query, body, headers) {
  const res = buildRes();
  await availabilityHandler({ method, query: query || {}, headers: headers || {}, body: body || {} }, res);
  return res;
}

test('player self-availability covers custom published session ids', async () => {
  kv.clear();
  const player = await seedUser('player-custom', 'player');
  publishSessions([
    { id: 'belgium-sat',  title: 'Saturday Captains Run', type: 'Training' },
    { id: 'belgium-game', title: 'Match vs France',       type: 'Match' },
  ]);

  // Player replies to the custom session
  const post = await callAvailability('POST', {}, {
    sessionId: 'belgium-sat', response: 'available', reason: '',
  }, { cookie: player.cookie });
  assert.equal(post.statusCode, 200);

  // Their own-response fetch must include the custom session
  const mine = await callAvailability('GET', { myResponse: '1' }, null, { cookie: player.cookie });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.body.responses['belgium-sat']?.response, 'available');
});

test('with no published sessions the tue/thu/game fallback still works', async () => {
  kv.clear();
  const player = await seedUser('player-fallback', 'player');
  // No app:publish:sessions key at all

  await callAvailability('POST', {}, {
    sessionId: 'thu', response: 'maybe', reason: 'work',
  }, { cookie: player.cookie });

  const mine = await callAvailability('GET', { myResponse: '1' }, null, { cookie: player.cookie });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.body.responses.thu?.response, 'maybe');
  assert.equal(mine.body.responses.thu?.reason, 'work');
});

test('clear_week with no explicit list clears the published sessions', async () => {
  kv.clear();
  const coach  = await seedUser('coach-clear', 'coach');
  const player = await seedUser('player-clear', 'player');
  publishSessions([{ id: 'belgium-sat', title: 'Captains Run', type: 'Training' }]);

  await callAvailability('POST', {}, {
    sessionId: 'belgium-sat', response: 'available',
  }, { cookie: player.cookie });

  // Confirm the response landed
  const before = await callAvailability('GET', { sessionId: 'belgium-sat' }, null, { cookie: coach.cookie });
  assert.equal(before.body.count, 1);

  // clear_week without an explicit sessions list → clears published ids
  const clear = await callAvailability('POST', {}, { action: 'clear_week' }, { cookie: coach.cookie });
  assert.equal(clear.statusCode, 200);
  assert.deepEqual(clear.body.cleared, ['belgium-sat']);

  const after = await callAvailability('GET', { sessionId: 'belgium-sat' }, null, { cookie: coach.cookie });
  assert.equal(after.body.count, 0);
});

test('malformed published session ids are ignored and the fallback engages', async () => {
  kv.clear();
  const player = await seedUser('player-malformed', 'player');
  // Published list exists but every id is invalid → fallback to tue/thu/game
  publishSessions([{ id: 'bad id with spaces!' }, { id: '' }, { title: 'no id at all' }]);

  await callAvailability('POST', {}, {
    sessionId: 'game', response: 'available',
  }, { cookie: player.cookie });

  const mine = await callAvailability('GET', { myResponse: '1' }, null, { cookie: player.cookie });
  assert.equal(mine.body.responses.game?.response, 'available');
});
