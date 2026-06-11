/**
 * Regression tests for /api/publish — published player-facing state.
 *
 * Core invariants:
 *  1. Coach POSTs sessions → GET returns them on ANY authenticated session
 *  2. Coach POSTs squad    → player session on a different device sees the squad
 *  3. Data survives refresh (second GET returns same data — stored in Redis)
 *  4. Data survives logout/login (Redis-backed, not session-coupled)
 *  5. Coach unpublishes squad → player no longer sees published: true
 *  6. Unauthenticated GET → 401
 *  7. Player cannot POST sessions or squad → 403
 *  8. Player cannot DELETE → 403
 *  9. Sessions include only player-relevant fields, no coach-only data
 * 10. Squad carries formation names and bench list to the player device
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.publish.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv    = new Map();
const lists = new Map();

globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

// ─── Minimal helpers ──────────────────────────────────────────────────────────

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)      { this.statusCode = code; return this; },
    json(data)        { this.body = data; return this; },
    setHeader(n, v)   { this.headers[n] = v; },
    end()             { return this; },
  };
}

function buildReq(method, url, body = null, headers = {}) {
  const parsed = new URL(url, 'https://host');
  return {
    method,
    url,
    query:   Object.fromEntries(parsed.searchParams.entries()),
    headers,
    body: body || {},
  };
}

async function seedUser(id, role = 'player', teamId = 'boitsfort-rfc') {
  const users   = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@test.com`, firstName: id, lastName: 'User', displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId, userId: id, role, status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: id, teamId, role });
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

async function callPublish(method, url, body, headers) {
  const res = buildRes();
  await publishHandler(buildReq(method, url, body, headers), res);
  return res;
}

// ─── 1. Coach saves sessions → any authenticated user can read them ───────────

test('coach can save sessions and any authenticated user reads them back', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-test', 'coach');
  const player = await seedUser('player-test', 'player');

  const sessions = [
    { id: 'tue', title: 'Tuesday Training', type: 'Training', date: '2026-06-17', focus: 'Lineouts', deadline: '', published: false },
    { id: 'game', title: 'Match vs France', type: 'Match', date: '2026-06-21', focus: '', deadline: '', published: true, publishedAt: '2026-06-11T10:00:00.000Z' },
  ];

  const postRes = await callPublish('POST', '/api/publish', { type: 'sessions', data: sessions }, { cookie: coach.cookie });
  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.body.ok, true);
  assert.equal(postRes.body.sessions.length, 2);

  // Player on a separate session (different device) reads the sessions
  const getRes = await callPublish('GET', '/api/publish?type=sessions', null, { cookie: player.cookie });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.sessions.length, 2);
  assert.equal(getRes.body.sessions[0].id, 'tue');
  assert.equal(getRes.body.sessions[0].title, 'Tuesday Training');
  assert.equal(getRes.body.sessions[1].id, 'game');
  assert.equal(getRes.body.sessions[1].published, true);
});

// ─── 2. Survives refresh (second GET returns same data) ───────────────────────

test('sessions survive refresh — second GET returns identical data', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-refresh', 'coach');
  const player = await seedUser('player-refresh', 'player');

  await callPublish('POST', '/api/publish', {
    type: 'sessions',
    data: [{ id: 'thu', title: 'Thursday', type: 'Training', date: '2026-06-19', focus: '', deadline: '' }],
  }, { cookie: coach.cookie });

  const first  = await callPublish('GET', '/api/publish?type=sessions', null, { cookie: player.cookie });
  const second = await callPublish('GET', '/api/publish?type=sessions', null, { cookie: player.cookie });

  assert.deepEqual(first.body.sessions, second.body.sessions);
  assert.equal(second.body.sessions[0].title, 'Thursday');
});

// ─── 3. Coach publishes squad → player sees formation + bench ─────────────────

test('coach publishes squad with formation names and bench — player session sees full team sheet', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-squad', 'coach');
  const player = await seedUser('player-squad', 'player');

  const squadData = {
    published:     true,
    opposition:    'France U20',
    competition:   'Six Nations U20',
    kickoffDate:   '2026-06-21',
    kickoffTime:   '15:00',
    arrivalTime:   '13:30',
    venue:         'Stade Pierre Mauroy',
    kit:           'Green',
    announcement:  'Great week of training. Let\'s deliver.',
    gamePlan:      'High press, early ball wide',
    formationNames: { '1': 'Jean Dupont', '2': 'Marc Simon', '10': 'Luc Bernard', '15': 'Theo Martin' },
    benchPlayers:  ['Pierre Legrand', 'Jules Renard', '', '', '', '', '', ''],
  };

  const postRes = await callPublish('POST', '/api/publish', { type: 'squad', data: squadData }, { cookie: coach.cookie });
  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.body.ok, true);
  assert.equal(postRes.body.squad.published, true);
  assert.equal(postRes.body.squad.opposition, 'France U20');

  // Separate player session reads the squad
  const getRes = await callPublish('GET', '/api/publish?type=squad', null, { cookie: player.cookie });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.squad.published, true);
  assert.equal(getRes.body.squad.opposition, 'France U20');
  assert.equal(getRes.body.squad.venue, 'Stade Pierre Mauroy');
  assert.equal(getRes.body.squad.formationNames['1'], 'Jean Dupont');
  assert.equal(getRes.body.squad.formationNames['10'], 'Luc Bernard');
  assert.equal(getRes.body.squad.benchPlayers[0], 'Pierre Legrand');
  assert.equal(getRes.body.squad.announcement, 'Great week of training. Let\'s deliver.');
});

// ─── 4. Squad survives logout/login (Redis-backed) ────────────────────────────

test('squad data survives player logout and re-login — Redis persistence confirmed', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-persist', 'coach');
  const player = await seedUser('player-persist', 'player');

  await callPublish('POST', '/api/publish', {
    type: 'squad',
    data: { published: true, opposition: 'Wales U20', kickoffDate: '2026-06-28', formationNames: { '9': 'Yann Couet' }, benchPlayers: [] },
  }, { cookie: coach.cookie });

  // Simulate logout/login by creating a brand new session token for the same user
  const newSession = await createSession({ userId: 'player-persist', teamId: 'boitsfort-rfc', role: 'player' });
  const newCookie  = { cookie: `${SESSION_COOKIE}=${encodeURIComponent(newSession.token)}` };

  const getRes = await callPublish('GET', '/api/publish?type=squad', null, newCookie);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.squad.published, true);
  assert.equal(getRes.body.squad.opposition, 'Wales U20');
  assert.equal(getRes.body.squad.formationNames['9'], 'Yann Couet');
});

// ─── 5. Coach unpublishes squad → player no longer sees published: true ───────

test('coach unpublishes squad — player sees null squad and published is cleared', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-unpub', 'coach');
  const player = await seedUser('player-unpub', 'player');

  // Publish
  await callPublish('POST', '/api/publish', {
    type: 'squad',
    data: { published: true, opposition: 'Italy U20', formationNames: { '1': 'Louis Petit' }, benchPlayers: [] },
  }, { cookie: coach.cookie });

  const published = await callPublish('GET', '/api/publish?type=squad', null, { cookie: player.cookie });
  assert.equal(published.body.squad.published, true);

  // Unpublish (published: false)
  await callPublish('POST', '/api/publish', {
    type: 'squad',
    data: { published: false },
  }, { cookie: coach.cookie });

  const unpublished = await callPublish('GET', '/api/publish?type=squad', null, { cookie: player.cookie });
  assert.equal(unpublished.body.squad, null);
});

// ─── 6. Unauthenticated GET returns 401 ──────────────────────────────────────

test('GET /api/publish without session returns 401', async () => {
  kv.clear(); lists.clear();
  const res = await callPublish('GET', '/api/publish?type=all', null, {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

// ─── 7. Player cannot POST sessions or squad → 403 ───────────────────────────

test('player cannot POST sessions — 403', async () => {
  kv.clear(); lists.clear();
  const player = await seedUser('player-nopost', 'player');
  const res = await callPublish('POST', '/api/publish', {
    type: 'sessions',
    data: [{ id: 'tue', title: 'Hijack', type: 'Training', date: '', focus: '', deadline: '' }],
  }, { cookie: player.cookie });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
});

test('player cannot POST squad — 403', async () => {
  kv.clear(); lists.clear();
  const player = await seedUser('player-nosquad', 'player');
  const res = await callPublish('POST', '/api/publish', {
    type: 'squad',
    data: { published: true, opposition: 'Injected', formationNames: {}, benchPlayers: [] },
  }, { cookie: player.cookie });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
});

// ─── 8. Player cannot DELETE → 403 ───────────────────────────────────────────

test('player cannot DELETE squad — 403', async () => {
  kv.clear(); lists.clear();
  const player = await seedUser('player-nodel', 'player');
  const res = await callPublish('DELETE', '/api/publish', { type: 'squad' }, { cookie: player.cookie });
  assert.equal(res.statusCode, 403);
});

// ─── 9. Sessions strip coach-only data ───────────────────────────────────────

test('saved sessions contain only player-relevant fields — no coaching notes or private data', async () => {
  kv.clear(); lists.clear();
  const coach = await seedUser('coach-strip', 'coach');
  const player = await seedUser('player-strip', 'player');

  const raw = [
    { id: 'tue', title: 'Tuesday', type: 'Training', date: '2026-06-17', focus: 'Scrums',
      deadline: '2026-06-16', published: true, publishedAt: '2026-06-11T08:00:00.000Z',
      target: 24, coachNotes: 'SECRET TACTICAL NOTES', privateData: 'should not appear' },
  ];

  await callPublish('POST', '/api/publish', { type: 'sessions', data: raw }, { cookie: coach.cookie });

  const res = await callPublish('GET', '/api/publish?type=sessions', null, { cookie: player.cookie });
  const session = res.body.sessions[0];

  // Player-relevant fields are present
  assert.equal(session.id, 'tue');
  assert.equal(session.title, 'Tuesday');
  assert.equal(session.type, 'Training');
  assert.equal(session.date, '2026-06-17');
  assert.equal(session.focus, 'Scrums');
  assert.equal(session.published, true);

  // Coach-only fields are stripped
  assert.equal(session.coachNotes, undefined);
  assert.equal(session.privateData, undefined);
  assert.equal(session.target, undefined);
});

// ─── 10. GET type=all returns both sessions and squad ─────────────────────────

test('GET type=all returns sessions and squad together', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-all', 'coach');
  const player = await seedUser('player-all', 'player');

  await callPublish('POST', '/api/publish', {
    type: 'sessions',
    data: [{ id: 'game', title: 'Final', type: 'Match', date: '2026-07-03', focus: '', deadline: '' }],
  }, { cookie: coach.cookie });

  await callPublish('POST', '/api/publish', {
    type: 'squad',
    data: { published: true, opposition: 'England U20', formationNames: { '15': 'Hugo Blanc' }, benchPlayers: [] },
  }, { cookie: coach.cookie });

  const res = await callPublish('GET', '/api/publish?type=all', null, { cookie: player.cookie });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(Array.isArray(res.body.sessions), 'sessions array expected');
  assert.equal(res.body.sessions[0].id, 'game');
  assert.ok(res.body.squad, 'squad object expected');
  assert.equal(res.body.squad.opposition, 'England U20');
  assert.equal(res.body.squad.formationNames['15'], 'Hugo Blanc');
});

// ─── 11. Coach DELETE clears squad; subsequent GET returns null ───────────────

test('coach DELETE squad clears it — player sees null squad after DELETE', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedUser('coach-del', 'coach');
  const player = await seedUser('player-del2', 'player');

  await callPublish('POST', '/api/publish', {
    type: 'squad',
    data: { published: true, opposition: 'Scotland U20', formationNames: {}, benchPlayers: [] },
  }, { cookie: coach.cookie });

  const before = await callPublish('GET', '/api/publish?type=squad', null, { cookie: player.cookie });
  assert.equal(before.body.squad.published, true);

  await callPublish('DELETE', '/api/publish', { type: 'squad' }, { cookie: coach.cookie });

  const after = await callPublish('GET', '/api/publish?type=squad', null, { cookie: player.cookie });
  assert.equal(after.body.squad, null);
});
