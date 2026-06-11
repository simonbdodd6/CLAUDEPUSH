/**
 * Cross-coach / cross-team isolation for published state and roster.
 *
 * Two clubs share the deployment: Team A (the default boitsfort-rfc) and
 * Team B (another club). Each coach must only ever see and write their own
 * club's data:
 *
 *  1. Coach B cannot read Team A's published squad or sessions
 *  2. Coach B's writes land in Team B's namespace — Team A data untouched
 *  3. Team B's players never see Team A's published squad
 *  4. Coach B cannot read Team A's roster (incl. medical data)
 *  5. Rosters are fully separate per team
 *  6. The legacy un-scoped keys only back-fill the DEFAULT team, never others
 *  7. DELETE only clears the caller's own team
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.team-isolation.test';
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

const { default: publishHandler } = await import('../api/publish.js');
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

async function seedUser(id, role, teamId) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@iso.test`, firstName: id, lastName: 'User', displayName: id });
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

async function call(method, query, body, headers) {
  const res = buildRes();
  await publishHandler({ method, query: query || {}, headers: headers || {}, body: body || {} }, res);
  return res;
}

const TEAM_A = 'boitsfort-rfc';   // DEFAULT_TEAM
const TEAM_B = 'rival-club';

async function seedBothTeams() {
  kv.clear();
  return {
    coachA:  await seedUser('coach-team-a',  'coach',  TEAM_A),
    coachB:  await seedUser('coach-team-b',  'coach',  TEAM_B),
    playerA: await seedUser('player-team-a', 'player', TEAM_A),
    playerB: await seedUser('player-team-b', 'player', TEAM_B),
  };
}

test('coach B cannot read Team A published squad or sessions', async () => {
  const { coachA, coachB } = await seedBothTeams();

  await call('POST', {}, {
    type: 'squad',
    data: { published: true, opposition: 'Team A Secret Opponent', formationNames: { '10': 'Team A Flyhalf' }, benchPlayers: [] },
  }, { cookie: coachA.cookie });
  await call('POST', {}, {
    type: 'sessions',
    data: [{ id: 'team-a-secret-session', title: 'Team A Training', type: 'Training' }],
  }, { cookie: coachA.cookie });

  const view = await call('GET', { type: 'all' }, null, { cookie: coachB.cookie });
  assert.equal(view.statusCode, 200);
  assert.equal(view.body.squad, null, 'Team A squad must be invisible to coach B');
  assert.deepEqual(view.body.sessions, [], 'Team A sessions must be invisible to coach B');
});

test('coach B writes land in Team B namespace — Team A data untouched', async () => {
  const { coachA, coachB, playerA } = await seedBothTeams();

  await call('POST', {}, {
    type: 'squad',
    data: { published: true, opposition: 'Original Team A Opponent', formationNames: {}, benchPlayers: [] },
  }, { cookie: coachA.cookie });

  // Coach B "publishes" — must not overwrite Team A
  await call('POST', {}, {
    type: 'squad',
    data: { published: true, opposition: 'Team B Opponent', formationNames: {}, benchPlayers: [] },
  }, { cookie: coachB.cookie });

  const teamAView = await call('GET', { type: 'squad' }, null, { cookie: playerA.cookie });
  assert.equal(teamAView.body.squad.opposition, 'Original Team A Opponent', 'coach B must not be able to overwrite Team A squad');
});

test('Team B players never see Team A published squad', async () => {
  const { coachA, playerB } = await seedBothTeams();

  await call('POST', {}, {
    type: 'squad',
    data: { published: true, opposition: 'Team A Only', formationNames: { '9': 'A Player' }, benchPlayers: [] },
  }, { cookie: coachA.cookie });

  const view = await call('GET', { type: 'squad' }, null, { cookie: playerB.cookie });
  assert.equal(view.body.squad, null);
});

test('coach B cannot read Team A roster — medical data stays in-club', async () => {
  const { coachA, coachB } = await seedBothTeams();

  await call('POST', { resource: 'roster' }, {
    players: [{ id: 'pa1', name: 'Team A Player', medical: 'ACL rehab — confidential', phone: '+32470000099' }],
  }, { cookie: coachA.cookie });

  const view = await call('GET', { resource: 'roster' }, null, { cookie: coachB.cookie });
  assert.equal(view.statusCode, 200);
  assert.deepEqual(view.body.players, [], 'Team A roster must be invisible to coach B');
});

test('rosters are fully separate per team', async () => {
  const { coachA, coachB } = await seedBothTeams();

  await call('POST', { resource: 'roster' }, {
    players: [{ id: 'pa1', name: 'Alpha Player' }],
  }, { cookie: coachA.cookie });
  await call('POST', { resource: 'roster' }, {
    players: [{ id: 'pb1', name: 'Bravo Player' }, { id: 'pb2', name: 'Bravo Two' }],
  }, { cookie: coachB.cookie });

  const viewA = await call('GET', { resource: 'roster' }, null, { cookie: coachA.cookie });
  const viewB = await call('GET', { resource: 'roster' }, null, { cookie: coachB.cookie });
  assert.deepEqual(viewA.body.players.map(p => p.name), ['Alpha Player']);
  assert.deepEqual(viewB.body.players.map(p => p.name), ['Bravo Player', 'Bravo Two']);
});

test('legacy un-scoped keys back-fill only the default team', async () => {
  const { playerA, playerB } = await seedBothTeams();

  // Simulate pre-scoping data written at the legacy keys
  kv.set('app:publish:squad', JSON.stringify({ published: true, opposition: 'Legacy Era Opponent', formationNames: {}, benchPlayers: [] }));
  kv.set('app:publish:sessions', JSON.stringify([{ id: 'legacy-tue', title: 'Legacy Tuesday', type: 'Training' }]));
  kv.set('app:roster', JSON.stringify({ players: [{ id: 'lp1', name: 'Legacy Player' }], updatedAt: '2026-06-11T00:00:00.000Z', updatedBy: 'coach-demo' }));

  // Default team (A) still sees the legacy data
  const viewA = await call('GET', { type: 'all' }, null, { cookie: playerA.cookie });
  assert.equal(viewA.body.squad.opposition, 'Legacy Era Opponent');
  assert.equal(viewA.body.sessions[0].id, 'legacy-tue');

  // Team B must NOT inherit it
  const viewB = await call('GET', { type: 'all' }, null, { cookie: playerB.cookie });
  assert.equal(viewB.body.squad, null);
  assert.deepEqual(viewB.body.sessions, []);
});

test('DELETE clears only the caller team', async () => {
  const { coachA, coachB, playerA } = await seedBothTeams();

  await call('POST', {}, {
    type: 'squad',
    data: { published: true, opposition: 'Keep Me', formationNames: {}, benchPlayers: [] },
  }, { cookie: coachA.cookie });
  await call('POST', {}, {
    type: 'squad',
    data: { published: true, opposition: 'Delete Me', formationNames: {}, benchPlayers: [] },
  }, { cookie: coachB.cookie });

  await call('DELETE', {}, { type: 'squad' }, { cookie: coachB.cookie });

  const viewA = await call('GET', { type: 'squad' }, null, { cookie: playerA.cookie });
  assert.equal(viewA.body.squad.opposition, 'Keep Me', 'coach B DELETE must not clear Team A');
  const viewB = await call('GET', { type: 'squad' }, null, { cookie: coachB.cookie });
  assert.equal(viewB.body.squad, null);
});
