/**
 * Start a New Club — self-serve club creation tests.
 *
 *  1. create_club creates team + coach account + head-coach membership +
 *     live session, fully self-serve (no seeding)
 *  2. The new coach's session is scoped to the NEW team — club config and
 *     roster land in the new tenant, not the default club
 *  3. Existing clubs are untouched (default team data identical before/after)
 *  4. The new coach can log out and log back in with email + password
 *     (membership lookup falls back beyond the default team)
 *  5. Duplicate email → 409, nothing created
 *  6. Validation: missing club name / short password rejected
 *  7. Two clubs with the same name get distinct team ids
 *  8. New coach has full coach powers in their club (publish, invite)
 *     and head-coach staff level
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.create-club.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: publishHandler } = await import('../api/publish.js');
const { createClub, loginUser, resolveSession, destroySession, staffLevelOf, createEmailVerificationToken, verifyEmailToken, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

const NICK = {
  action: 'create_club',
  clubName: 'Marshall Rugby Club', teamName: 'Seniors', sport: 'Rugby',
  name: 'Nick Marshall', email: 'nick@marshall-rfc.test', password: 'NickPass123',
};

async function apiCreateClub(body, ip = '198.51.100.1') {
  const res = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers: { 'x-forwarded-for': ip }, body }, res);
  return res;
}

function cookieFor(token) {
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

test('create_club builds team, head coach account, membership and session in one call', async () => {
  kv.clear();
  const res = await apiCreateClub(NICK);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.team.name, 'Marshall Rugby Club');
  assert.equal(res.body.team.teamName, 'Seniors');
  assert.equal(res.body.team.sport, 'Rugby');
  assert.ok(res.body.team.teamCode, 'team code generated for the join flow');
  assert.equal(res.body.user.role, 'coach');
  assert.equal(res.body.teamMember.staffLevel, 'head');
  assert.equal(res.body.teamMember.status, 'active');
  assert.equal(res.body.session?.token, undefined, 'raw token never in the response body');
  assert.match(res.headers['Set-Cookie'] || '', /ce_session=/, 'session cookie set');
});

test('the new session is scoped to the new team — config and roster land in the new tenant only', async () => {
  kv.clear();
  const created = await createClub(NICK);
  const cookie = cookieFor(created.session.token);

  // Save club config + roster as the new coach
  const cfg = buildRes();
  await publishHandler({ method: 'POST', query: { resource: 'club' }, headers: cookie,
    body: { club: { clubName: 'Marshall Rugby Club', sport: 'Rugby' } } }, cfg);
  assert.equal(cfg.statusCode, 200);
  const roster = buildRes();
  await publishHandler({ method: 'POST', query: { resource: 'roster' }, headers: cookie,
    body: { players: [{ id: 'np1', name: 'New Club Player' }] } }, roster);
  assert.equal(roster.statusCode, 200);

  // Keys are namespaced to the generated team id; default-team keys untouched
  const teamId = created.team.id;
  assert.ok(kv.has(`app:club:${teamId}`), 'club config in new tenant namespace');
  assert.ok(kv.has(`app:roster:${teamId}`), 'roster in new tenant namespace');
  assert.equal(kv.has('app:club:boitsfort-rfc'), false, 'default club config untouched');
  assert.equal(kv.has('app:roster:boitsfort-rfc'), false, 'default roster untouched');
});

test('existing clubs are untouched by club creation', async () => {
  kv.clear();
  // Pre-existing default-team world
  kv.set('app:identity:users', JSON.stringify([
    { id: 'coach-demo', email: 'simon@existing.test', displayName: 'Simon Coach', passwordSet: true, passwordAlgo: 'scrypt', passwordSalt: 'aa', passwordHash: 'bb' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-coach-demo', teamId: 'boitsfort-rfc', userId: 'coach-demo', role: 'coach', status: 'active' },
  ]));
  kv.set('app:club:boitsfort-rfc', JSON.stringify({ clubName: 'Existing Club' }));
  const beforeUsers = kv.get('app:identity:users');
  const beforeClub = kv.get('app:club:boitsfort-rfc');

  await createClub(NICK);

  // Existing records byte-identical; new records purely additive
  const afterUsers = JSON.parse(kv.get('app:identity:users'));
  assert.deepEqual(afterUsers.find(u => u.id === 'coach-demo'), JSON.parse(beforeUsers)[0]);
  assert.equal(afterUsers.length, 2);
  assert.equal(kv.get('app:club:boitsfort-rfc'), beforeClub);
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.filter(m => m.teamId === 'boitsfort-rfc').length, 1);
});

test('new coach can log out and log back in with email and password', async () => {
  kv.clear();
  const created = await createClub(NICK);
  await destroySession(created.session.token);
  assert.equal(await resolveSession(created.session.token), null);

  // Login finds the non-default-team membership
  const login = await loginUser({ email: 'nick@marshall-rfc.test', password: 'NickPass123' });
  assert.equal(login.user.displayName, 'Nick Marshall');
  assert.equal(login.user.role, 'coach');
  assert.equal(login.teamMember.teamId, created.team.id);
  assert.equal(login.session.teamId, created.team.id, 'session scoped to his club, not the default team');
});

test('duplicate email is rejected with 409 and creates nothing', async () => {
  kv.clear();
  await createClub(NICK);
  const teamsBefore = kv.get('app:identity:teams');

  const res = await apiCreateClub({ ...NICK, clubName: 'Second Attempt FC' });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /already exists/i);
  assert.equal(kv.get('app:identity:teams'), teamsBefore, 'no team created on rejected signup');
});

test('validation: club name and password rules enforced', async () => {
  kv.clear();
  const noClub = await apiCreateClub({ ...NICK, clubName: '' });
  assert.equal(noClub.statusCode, 400);
  const shortPw = await apiCreateClub({ ...NICK, email: 'other@x.test', password: 'short' });
  assert.equal(shortPw.statusCode, 400);
});

test('two clubs with the same name get distinct team ids', async () => {
  kv.clear();
  const a = await createClub({ ...NICK });
  const b = await createClub({ ...NICK, email: 'second@coach.test' });
  assert.notEqual(a.team.id, b.team.id);
  assert.equal(a.team.name, b.team.name);
});

test('new coach is head coach with full staff powers in their own club', async () => {
  kv.clear();
  const created = await createClub(NICK);
  assert.equal(staffLevelOf(created.teamMember), 'head');

  // Can create invites for THEIR team (coach/admin gate + tenant scoping)
  const { default: inviteHandler } = await import('../api/invite.js');
  const res = buildRes();
  await inviteHandler({
    method: 'POST', query: {},
    headers: { ...cookieFor(created.session.token), host: 'club.test' },
    body: { name: 'First Player', role: 'player', sendEmail: false },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.invite.teamId, created.team.id, 'invite bound to the new club');
});

test('newly created coach is unverified by default', async () => {
  kv.clear();
  const created = await createClub(NICK);
  // emailVerified must be explicitly false, not undefined — callers can rely on
  // the boolean rather than a truthiness check on a missing field.
  assert.equal(created.user.emailVerified, false, 'emailVerified must be false at club creation');
  assert.equal(created.user.emailVerifiedAt, undefined, 'emailVerifiedAt must not be set');
});

test('email verification token flow works for a freshly created club coach', async () => {
  kv.clear();
  const created = await createClub(NICK);

  // 1. Token can be created for the new user
  const tokenResult = await createEmailVerificationToken(created.user.id);
  assert.ok(tokenResult.token, 'verification token must be issued');
  assert.equal(tokenResult.alreadyVerified, false);
  assert.equal(tokenResult.user.id, created.user.id);

  // 2. Consuming the token marks the user verified
  const verifyResult = await verifyEmailToken(tokenResult.token);
  assert.equal(verifyResult.user.emailVerified, true);
  assert.ok(verifyResult.user.emailVerifiedAt);

  // 3. Subsequent token creation returns alreadyVerified=true
  const repeat = await createEmailVerificationToken(created.user.id);
  assert.equal(repeat.alreadyVerified, true);
  assert.equal(repeat.token, null);

  // 4. Login still works after verification (no gate added yet)
  const login = await loginUser({ email: NICK.email, password: NICK.password });
  assert.equal(login.user.emailVerified, true, 'verified flag persists through login');
  assert.equal(login.session.teamId, created.team.id, 'session still scoped to new club, not boitsfort-rfc');
});
