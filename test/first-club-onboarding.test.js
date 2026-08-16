/**
 * Launch blocker (2026-08-05) — first-club onboarding on an ENTIRELY EMPTY
 * production store.
 *
 * After the Stage 2 reset, production holds zero keys of any kind. The very
 * first real request the platform sees is a coach submitting the club wizard.
 * These tests run that transaction end-to-end through the real /api/identity
 * handler in production mode (VERCEL set, no dev seeding): account + club +
 * team + owner membership + session cookie, then the follow-on cases —
 * duplicate email, a second club, and the create_club rate limit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.first-club.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';
// These suites exercise the founder self-signup path — explicitly opt in
// (public club creation is otherwise CLOSED behind platform provisioning).
process.env.PUBLIC_CLUB_SIGNUP = 'true';
process.env.VERCEL                  = '1';   // production mode: no legacy seeding

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');

function buildReq(body, ip = '203.0.113.10') {
  return {
    method: 'POST',
    url: '/api/identity',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    query: {},
    body,
    on() {},
  };
}

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    getHeader(n)    { return this.headers[n]; },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); return this; },
    end(data)       { if (data && this.body == null) { try { this.body = JSON.parse(data); } catch { this.body = data; } } return this; },
  };
}

const createBody = (email, club = 'Boitsfort Rugby Club') => ({
  action: 'create_club', clubName: club, teamName: 'Seniors', sport: 'Rugby',
  name: 'Simon Dodd', email, password: 'First-Club-2026!',
});

test('the very first request on an empty store creates account, club, team and session', async () => {
  kv.clear();
  const res = buildRes();
  await identityHandler(buildReq(createBody('first.coach@example.com')), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.team?.name, 'Boitsfort Rugby Club');
  assert.equal(res.body.team?.teamName, 'Seniors');
  assert.ok(res.body.user?.id, 'user returned');
  assert.match(String(res.headers['Set-Cookie'] || ''), /ce_session=/, 'session cookie set');

  const teams = JSON.parse(kv.get('app:identity:teams'));
  assert.equal(teams.length, 1, 'exactly one club persisted');
  assert.notEqual(teams[0].id, 'boitsfort-rfc', 'the real club gets its own id — no legacy record');

  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.length, 1);
  assert.equal(members[0].isOwner, true, 'creator owns the club');
  assert.equal(members[0].accessProfile, 'full', 'creator holds Full Access');
  assert.equal(members[0].role, 'coach');
  assert.equal(members[0].status, 'active');
  assert.equal(members[0].teamId, teams[0].id, 'membership scoped to the new club');

  const users = JSON.parse(kv.get('app:identity:users'));
  assert.equal(users.length, 1, 'no legacy compatibility accounts appear');

  const sessions = JSON.parse(kv.get('app:identity:sessions'));
  assert.equal(sessions.length, 1, 'session persisted');
  assert.equal(sessions[0].teamId, teams[0].id, 'session scoped to the new club');
});

test('the same email cannot create a second account — 409 with a human message', async () => {
  const res = buildRes();
  await identityHandler(buildReq(createBody('first.coach@example.com', 'Another Club')), res);
  assert.equal(res.statusCode, 409);
  assert.match(String(res.body.error), /already exists/i);
  assert.equal(JSON.parse(kv.get('app:identity:teams')).length, 1, 'no second club persisted');
});

test('a second club with a different owner works alongside the first', async () => {
  const res = buildRes();
  await identityHandler(buildReq(createBody('second.coach@example.com', 'Ravenshill RFC')), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const teams = JSON.parse(kv.get('app:identity:teams'));
  assert.equal(teams.length, 2);
  assert.equal(new Set(teams.map(t => t.id)).size, 2, 'distinct tenant ids');
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.filter(m => m.isOwner).length, 2, 'each club has its own owner');
});

test('create_club is rate limited per IP with a clear 429', async () => {
  // Attempts so far from this IP: create (1), duplicate (2), create (3). Two
  // more are allowed; the sixth must be rejected.
  for (const n of [4, 5]) {
    const res = buildRes();
    await identityHandler(buildReq(createBody(`coach${n}@example.com`, `Club ${n}`)), res);
    assert.equal(res.statusCode, 201, `attempt ${n} allowed`);
  }
  const res = buildRes();
  await identityHandler(buildReq(createBody('coach6@example.com', 'Club 6')), res);
  assert.equal(res.statusCode, 429);
  assert.match(String(res.body.error), /too many attempts/i);
  assert.equal(JSON.parse(kv.get('app:identity:teams')).length, 4, 'sixth club was not created');
});

test('a different IP is not affected by the exhausted limit', async () => {
  const res = buildRes();
  await identityHandler(buildReq(createBody('other.ip@example.com', 'Other IP RFC'), '198.51.100.7'), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
});
