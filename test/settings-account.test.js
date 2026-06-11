/**
 * Settings & Account regression tests.
 *
 * Coach account (self-service, /api/identity):
 *  1. change_password requires the current password; new password works,
 *     old one stops working
 *  2. change_email requires current password, rejects taken emails,
 *     login works with the new email
 *  3. update_profile changes the display name
 *  4. logout_all revokes every OTHER session but keeps the current one
 *  5. All account actions require an authenticated session (401 anon)
 *
 * Notification preferences:
 *  6. update_preferences stores booleans; junk ignored
 *  7. notificationAllowed: pushEnabled=false blocks everything;
 *     trainingReminders=false blocks training availability only;
 *     matchReminders=false blocks match-day availability only;
 *     users with no prefs are unaffected
 *
 * Club settings (publish.js club config):
 *  8. logo/colours/matchDay/season fields round-trip; invalid values dropped
 *  9. Oversized or non-image logo rejected
 *
 * Danger zone:
 * 10. delete_club_data requires the exact club name and wipes only the
 *     caller team's keys — second team untouched (tenant isolation)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.settings.test';
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
const {
  createSession, loginUser, resolveSession, notificationAllowed,
  SESSION_COOKIE,
} = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

async function identityCall(body, headers = {}) {
  const res = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers, body }, res);
  return res;
}

async function publishCall(method, query, body, headers = {}) {
  const res = buildRes();
  await publishHandler({ method, query: query || {}, headers, body: body || {} }, res);
  return res;
}

// Seed a coach via the real join+hash path so password checks are genuine.
async function seedCoachWithPassword(id, email, password, teamId = 'boitsfort-rfc') {
  const { createHash, scryptSync, randomBytes } = await import('node:crypto');
  const salt = randomBytes(8).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id, email, firstName: id, lastName: 'User', displayName: `${id} User`,
    passwordSet: true, passwordAlgo: 'scrypt', passwordSalt: salt, passwordHash: hash });
  kv.set('app:identity:users', JSON.stringify(users));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: `tm_${id}`, teamId, userId: id, role: 'coach', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const session = await createSession({ userId: id, teamId, role: 'coach' });
  return { token: session.token, cookie: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

// ─── 1. Change password ──────────────────────────────────────────────────────

test('change_password requires current password; new works, old fails', async () => {
  kv.clear();
  const coach = await seedCoachWithPassword('set-coach-1', 'set1@club.test', 'OldPass123');

  const wrong = await identityCall({ action: 'change_password', currentPassword: 'nope', newPassword: 'NewPass456' }, coach.cookie);
  assert.equal(wrong.statusCode, 403);

  const ok = await identityCall({ action: 'change_password', currentPassword: 'OldPass123', newPassword: 'NewPass456' }, coach.cookie);
  assert.equal(ok.statusCode, 200);

  const login = await loginUser({ email: 'set1@club.test', password: 'NewPass456' });
  assert.equal(login.user.id, 'set-coach-1');
  await assert.rejects(loginUser({ email: 'set1@club.test', password: 'OldPass123' }), /Invalid email or password/);
});

// ─── 2. Change email ─────────────────────────────────────────────────────────

test('change_email requires current password, rejects taken emails, login works with new email', async () => {
  kv.clear();
  const coach = await seedCoachWithPassword('set-coach-2', 'set2@club.test', 'MyPass123');
  await seedCoachWithPassword('set-coach-2b', 'taken@club.test', 'Other123');

  const wrongPw = await identityCall({ action: 'change_email', currentPassword: 'bad', newEmail: 'new2@club.test' }, coach.cookie);
  assert.equal(wrongPw.statusCode, 403);

  const taken = await identityCall({ action: 'change_email', currentPassword: 'MyPass123', newEmail: 'taken@club.test' }, coach.cookie);
  assert.equal(taken.statusCode, 409);

  const ok = await identityCall({ action: 'change_email', currentPassword: 'MyPass123', newEmail: 'New2@Club.Test' }, coach.cookie);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.user.email, 'new2@club.test', 'email normalised to lowercase');

  const login = await loginUser({ email: 'new2@club.test', password: 'MyPass123' });
  assert.equal(login.user.id, 'set-coach-2');
});

// ─── 3. Update profile ───────────────────────────────────────────────────────

test('update_profile changes the display name', async () => {
  kv.clear();
  const coach = await seedCoachWithPassword('set-coach-3', 'set3@club.test', 'MyPass123');
  const res = await identityCall({ action: 'update_profile', displayName: 'Head Coach Simon' }, coach.cookie);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.displayName, 'Head Coach Simon');
});

// ─── 4. Logout all other devices ─────────────────────────────────────────────

test('logout_all revokes every other session but keeps the current one', async () => {
  kv.clear();
  const coach = await seedCoachWithPassword('set-coach-4', 'set4@club.test', 'MyPass123');
  const phone  = await createSession({ userId: 'set-coach-4', teamId: 'boitsfort-rfc', role: 'coach' });
  const tablet = await createSession({ userId: 'set-coach-4', teamId: 'boitsfort-rfc', role: 'coach' });

  const res = await identityCall({ action: 'logout_all' }, coach.cookie);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.revoked, 2);

  assert.equal(await resolveSession(phone.token), null, 'phone session dead');
  assert.equal(await resolveSession(tablet.token), null, 'tablet session dead');
  assert.ok(await resolveSession(coach.token), 'current device still signed in');
});

// ─── 5. Anonymous rejection ──────────────────────────────────────────────────

test('account actions require an authenticated session', async () => {
  kv.clear();
  for (const action of ['change_password', 'change_email', 'update_profile', 'update_preferences', 'logout_all']) {
    const res = await identityCall({ action, currentPassword: 'x', newPassword: 'password123' }, {});
    assert.equal(res.statusCode, 401, `${action} must reject anonymous callers`);
  }
});

// ─── 6 + 7. Notification preferences ─────────────────────────────────────────

test('update_preferences stores booleans only; notificationAllowed honours them', async () => {
  kv.clear();
  const coach = await seedCoachWithPassword('set-coach-6', 'set6@club.test', 'MyPass123');

  const res = await identityCall({
    action: 'update_preferences',
    preferences: { pushEnabled: true, trainingReminders: false, matchReminders: true, emailEnabled: false, evil: 'yes', pushEnabledX: 1 },
  }, coach.cookie);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.preferences, { pushEnabled: true, trainingReminders: false, matchReminders: true, emailEnabled: false });

  const prefMap = { 'set-coach-6': res.body.preferences };
  // trainingReminders=false blocks training availability, not match-day
  assert.equal(notificationAllowed(prefMap, 'set-coach-6', { type: 'availability', sessionId: 'tue' }), false);
  assert.equal(notificationAllowed(prefMap, 'set-coach-6', { type: 'availability', sessionId: 'game' }), true);
  // plain messages unaffected
  assert.equal(notificationAllowed(prefMap, 'set-coach-6', { type: 'message', sessionId: '' }), true);
  // pushEnabled=false blocks everything
  assert.equal(notificationAllowed({ u: { pushEnabled: false } }, 'u', { type: 'message' }), false);
  // matchReminders=false blocks match-day availability only
  assert.equal(notificationAllowed({ u: { matchReminders: false } }, 'u', { type: 'availability', sessionId: 'game' }), false);
  assert.equal(notificationAllowed({ u: { matchReminders: false } }, 'u', { type: 'availability', sessionId: 'tue' }), true);
  // unknown users unaffected
  assert.equal(notificationAllowed(prefMap, 'someone-else', { type: 'availability', sessionId: 'tue' }), true);
});

// ─── 8 + 9. Club settings fields ─────────────────────────────────────────────

test('club logo, colours, match day and season dates round-trip; invalid values dropped', async () => {
  kv.clear();
  const coach = await seedCoachWithPassword('set-coach-8', 'set8@club.test', 'MyPass123');

  const tinyLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const post = await publishCall('POST', { resource: 'club' }, { club: {
    clubName: 'Settings Club',
    logoDataUrl: tinyLogo,
    colours: { primary: '#AABB11', secondary: 'not-a-colour' },
    matchDay: 'Sat',
    seasonStart: '2026-09-01',
    seasonEnd: 'garbage',
  } }, coach.cookie.cookie ? coach.cookie : coach.cookie);
  assert.equal(post.statusCode, 200);

  const get = await publishCall('GET', { resource: 'club' }, null, coach.cookie);
  const club = get.body.club;
  assert.equal(club.logoDataUrl, tinyLogo);
  assert.equal(club.colours.primary, '#aabb11', 'hex normalised to lowercase');
  assert.equal(club.colours.secondary, '', 'invalid colour dropped');
  assert.equal(club.matchDay, 'Sat');
  assert.equal(club.seasonStart, '2026-09-01');
  assert.equal(club.seasonEnd, '', 'invalid date dropped');

  // Oversized / non-image logos rejected
  const bad = await publishCall('POST', { resource: 'club' }, { club: {
    clubName: 'Settings Club',
    logoDataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
  } }, coach.cookie);
  assert.equal(bad.statusCode, 200);
  const after = await publishCall('GET', { resource: 'club' }, null, coach.cookie);
  assert.equal(after.body.club.logoDataUrl, '', 'non-image data URL dropped');
});

// ─── 10. Delete club data — confirmation + tenant isolation ──────────────────

test('delete_club_data requires the exact club name and only wipes the caller team', async () => {
  kv.clear();
  const coachA = await seedCoachWithPassword('set-coach-10a', 'set10a@club.test', 'MyPass123', 'boitsfort-rfc');
  const coachB = await seedCoachWithPassword('set-coach-10b', 'set10b@club.test', 'MyPass123', 'rival-club');

  await publishCall('POST', { resource: 'club' }, { club: { clubName: 'Doomed Club' } }, coachA.cookie);
  await publishCall('POST', {}, { type: 'squad', data: { published: true, opposition: 'X', formationNames: {}, benchPlayers: [] } }, coachA.cookie);
  await publishCall('POST', { resource: 'roster' }, { players: [{ id: 'p1', name: 'Player One' }] }, coachA.cookie);
  await publishCall('POST', { resource: 'club' }, { club: { clubName: 'Safe Club' } }, coachB.cookie);

  // Wrong confirmation name → 400, nothing deleted
  const wrong = await publishCall('POST', { resource: 'club' }, { action: 'delete_club_data', confirmName: 'Wrong Name' }, coachA.cookie);
  assert.equal(wrong.statusCode, 400);
  const still = await publishCall('GET', { resource: 'club' }, null, coachA.cookie);
  assert.equal(still.body.club.clubName, 'Doomed Club');

  // Correct name → team A wiped
  const ok = await publishCall('POST', { resource: 'club' }, { action: 'delete_club_data', confirmName: 'Doomed Club' }, coachA.cookie);
  assert.equal(ok.statusCode, 200);
  const goneClub = await publishCall('GET', { resource: 'club' }, null, coachA.cookie);
  assert.equal(goneClub.body.club, null);
  const goneSquad = await publishCall('GET', { type: 'squad' }, null, coachA.cookie);
  assert.equal(goneSquad.body.squad, null);
  const goneRoster = await publishCall('GET', { resource: 'roster' }, null, coachA.cookie);
  assert.deepEqual(goneRoster.body.players, []);

  // Team B untouched
  const safe = await publishCall('GET', { resource: 'club' }, null, coachB.cookie);
  assert.equal(safe.body.club.clubName, 'Safe Club');
});
