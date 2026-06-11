/**
 * Coach roster persistence tests — /api/roster.
 *
 *  1. Coach saves a roster → a second coach session (different device)
 *     reads identical data
 *  2. Roster survives refresh and logout/login (Redis-backed)
 *  3. Player photos (base64) are stripped server-side
 *  4. Players cannot read the roster (carries phone/medical data) → 403
 *  5. Players cannot write the roster → 403
 *  6. Unauthenticated requests → 401
 *  7. Invalid payloads → 400
 *  8. Records without id or name are dropped, the rest survive
 *  9. updatedAt / updatedBy audit fields are set
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.roster.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

// The roster lives inside api/publish.js (Vercel Hobby 12-function limit);
// production requests reach it via the /api/roster → /api/publish?resource=roster
// rewrite, which is exactly what callRoster simulates below.
const { default: publishHandler } = await import('../api/publish.js');
const { createSession, destroySession, SESSION_COOKIE } = await import('../api/_identityStore.js');

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
    users.push({ id, email: `${id}@roster.test`, firstName: id, lastName: 'User', displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId: 'boitsfort-rfc', userId: id, role, status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role });
  return { token: session.token, cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

async function callRoster(method, body, headers) {
  const res = buildRes();
  await publishHandler({ method, query: { resource: 'roster' }, headers: headers || {}, body: body || {} }, res);
  return res;
}

const SAMPLE_PLAYERS = [
  { id: 'p1', name: 'Arthur Lemoine', position: 'Prop', phone: '+32470000001', email: 'arthur@u20.be',
    medical: 'Shoulder — cleared', attendance: 9, history: ['available'], blockedDates: [], userId: 'user_arthur' },
  { id: 'p2', name: 'Noah Vandamme', position: 'Scrum-half', phone: '+32470000002', email: 'noah@u20.be',
    medical: '', attendance: 11, history: ['available'], blockedDates: [], userId: 'user_noah' },
];

test('coach saves roster — second coach device reads identical data', async () => {
  kv.clear();
  const deviceA = await seedUser('coach-a', 'coach');

  const post = await callRoster('POST', { players: SAMPLE_PLAYERS }, { cookie: deviceA.cookie });
  assert.equal(post.statusCode, 200);
  assert.equal(post.body.count, 2);

  // Second device = brand new session for the same coach
  const deviceB = await createSession({ userId: 'coach-a', teamId: 'boitsfort-rfc', role: 'coach' });
  const get = await callRoster('GET', null, { cookie: `${SESSION_COOKIE}=${encodeURIComponent(deviceB.token)}` });
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.players.length, 2);
  assert.equal(get.body.players[0].name, 'Arthur Lemoine');
  assert.equal(get.body.players[0].phone, '+32470000001');
  assert.equal(get.body.players[0].medical, 'Shoulder — cleared');
  assert.equal(get.body.players[1].userId, 'user_noah');
});

test('roster survives refresh and logout/login', async () => {
  kv.clear();
  const coach = await seedUser('coach-persist', 'coach');
  await callRoster('POST', { players: SAMPLE_PLAYERS }, { cookie: coach.cookie });

  // Refresh: repeated GETs identical
  const first  = await callRoster('GET', null, { cookie: coach.cookie });
  const second = await callRoster('GET', null, { cookie: coach.cookie });
  assert.deepEqual(first.body.players, second.body.players);

  // Logout/login: destroy session, create a new one
  await destroySession(coach.token);
  const stale = await callRoster('GET', null, { cookie: coach.cookie });
  assert.equal(stale.statusCode, 401);

  const fresh = await createSession({ userId: 'coach-persist', teamId: 'boitsfort-rfc', role: 'coach' });
  const after = await callRoster('GET', null, { cookie: `${SESSION_COOKIE}=${encodeURIComponent(fresh.token)}` });
  assert.equal(after.statusCode, 200);
  assert.equal(after.body.players.length, 2);
});

test('player photos are stripped server-side — base64 never reaches Redis', async () => {
  kv.clear();
  const coach = await seedUser('coach-photo', 'coach');
  const withPhoto = [{ ...SAMPLE_PLAYERS[0], photo: 'data:image/jpeg;base64,' + 'x'.repeat(5000) }];

  await callRoster('POST', { players: withPhoto }, { cookie: coach.cookie });

  const get = await callRoster('GET', null, { cookie: coach.cookie });
  assert.equal(get.body.players[0].photo, undefined);
  assert.equal(kv.get('app:roster:boitsfort-rfc').includes('base64'), false, 'photo data must not be stored in Redis');
});

test('player cannot read the roster — 403', async () => {
  kv.clear();
  const coach  = await seedUser('coach-r', 'coach');
  const player = await seedUser('player-r', 'player');
  await callRoster('POST', { players: SAMPLE_PLAYERS }, { cookie: coach.cookie });

  const res = await callRoster('GET', null, { cookie: player.cookie });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.players, undefined, 'no roster data may leak to players');
});

test('player cannot write the roster — 403', async () => {
  kv.clear();
  const player = await seedUser('player-w', 'player');
  const res = await callRoster('POST', { players: SAMPLE_PLAYERS }, { cookie: player.cookie });
  assert.equal(res.statusCode, 403);
  assert.equal(kv.has('app:roster'), false, 'rejected write must not touch Redis');
});

test('unauthenticated roster access — 401', async () => {
  kv.clear();
  const get = await callRoster('GET', null, {});
  assert.equal(get.statusCode, 401);
  const post = await callRoster('POST', { players: SAMPLE_PLAYERS }, {});
  assert.equal(post.statusCode, 401);
});

test('invalid payload — 400', async () => {
  kv.clear();
  const coach = await seedUser('coach-bad', 'coach');
  const res = await callRoster('POST', { players: 'not-an-array' }, { cookie: coach.cookie });
  assert.equal(res.statusCode, 400);
});

test('records missing id or name are dropped, valid records survive', async () => {
  kv.clear();
  const coach = await seedUser('coach-drop', 'coach');
  const res = await callRoster('POST', {
    players: [
      SAMPLE_PLAYERS[0],
      { id: '', name: 'No Id' },
      { id: 'p-no-name', name: '' },
      null,
      SAMPLE_PLAYERS[1],
    ],
  }, { cookie: coach.cookie });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2);
});

test('updatedAt and updatedBy audit fields are recorded', async () => {
  kv.clear();
  const coach = await seedUser('coach-audit', 'coach');
  await callRoster('POST', { players: SAMPLE_PLAYERS }, { cookie: coach.cookie });

  const get = await callRoster('GET', null, { cookie: coach.cookie });
  assert.ok(get.body.updatedAt, 'updatedAt expected');
  assert.equal(get.body.updatedBy, 'coach-audit');
});
