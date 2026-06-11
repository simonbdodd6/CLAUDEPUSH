/**
 * First-run club/team setup — /api/publish?resource=club.
 *
 *  1. First coach creates their team (club name, season, training days,
 *     first fixture) and the record round-trips
 *  2. Returning coach (new session = new device / next visit) sees the
 *     existing team — no second first-run
 *  3. Second coach on another team cannot see the first coach's club config
 *  4. Players only join the team their invite was issued for, and read
 *     their own team's club config (not another club's)
 *  5. Players cannot write club config
 *  6. Unauthenticated access is rejected
 *  7. clubName is required; junk fields are stripped
 *  8. Invite email uses the configured club name instead of the old
 *     hardcoded 'Boitsfort RFC'
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.club-setup.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
const sentEmails = [];

globalThis.fetch = async (url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) {
    // Resend email API call from _email.js
    sentEmails.push(parsed || {});
    return { ok: true, json: async () => ({ id: 'email_mock' }) };
  }
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'INCR') { const n = Number(kv.get(args[0]) || 0) + 1; kv.set(args[0], String(n)); result = n; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { claimInvite, createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

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
    users.push({ id, email: `${id}@club.test`, firstName: id, lastName: 'User', displayName: id });
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

async function callClub(method, body, headers) {
  const res = buildRes();
  await publishHandler({ method, query: { resource: 'club' }, headers: headers || {}, body: body || {} }, res);
  return res;
}

const SETUP = {
  clubName: 'Belgium Rugby',
  teamName: 'U20 Men',
  seasonName: '2026–27',
  trainingDays: [{ day: 'Tue', time: '19:00' }, { day: 'Thu', time: '19:30' }],
  firstFixture: { opposition: 'France U20', date: '2026-07-04', time: '15:00', venue: 'Stade Fallon' },
};

// ─── 1. First coach creates their team ───────────────────────────────────────

test('first coach creates team — full setup round-trips', async () => {
  kv.clear();
  const coach = await seedUser('coach-first', 'coach', 'boitsfort-rfc');

  // First run: nothing configured
  const before = await callClub('GET', null, { cookie: coach.cookie });
  assert.equal(before.statusCode, 200);
  assert.equal(before.body.club, null, 'fresh team must have no club config (this is what triggers the wizard)');

  const post = await callClub('POST', { club: SETUP }, { cookie: coach.cookie });
  assert.equal(post.statusCode, 200);
  assert.equal(post.body.club.clubName, 'Belgium Rugby');
  assert.ok(post.body.club.setupCompletedAt, 'setupCompletedAt must be stamped');

  const after = await callClub('GET', null, { cookie: coach.cookie });
  assert.equal(after.body.club.clubName, 'Belgium Rugby');
  assert.equal(after.body.club.teamName, 'U20 Men');
  assert.equal(after.body.club.seasonName, '2026–27');
  assert.deepEqual(after.body.club.trainingDays, SETUP.trainingDays);
  assert.equal(after.body.club.firstFixture.opposition, 'France U20');
  assert.equal(after.body.club.firstFixture.venue, 'Stade Fallon');
});

// ─── 2. Returning coach sees the existing team ───────────────────────────────

test('returning coach on a new session sees the existing team', async () => {
  kv.clear();
  const coach = await seedUser('coach-return', 'coach', 'boitsfort-rfc');
  await callClub('POST', { club: SETUP }, { cookie: coach.cookie });

  // New session = next visit / different device
  const newSession = await createSession({ userId: 'coach-return', teamId: 'boitsfort-rfc', role: 'coach' });
  const res = await callClub('GET', null, { cookie: `${SESSION_COOKIE}=${encodeURIComponent(newSession.token)}` });
  assert.equal(res.body.club.clubName, 'Belgium Rugby', 'club config must follow the coach across devices');

  // Saving again keeps the original setupCompletedAt (no fake re-onboarding)
  const original = res.body.club.setupCompletedAt;
  await callClub('POST', { club: { ...SETUP, seasonName: '2027–28' } }, { cookie: coach.cookie });
  const updated = await callClub('GET', null, { cookie: coach.cookie });
  assert.equal(updated.body.club.seasonName, '2027–28');
  assert.equal(updated.body.club.setupCompletedAt, original);
});

// ─── 3. Second coach cannot see first coach's team ───────────────────────────

test('second coach on another team cannot see the first coach team', async () => {
  kv.clear();
  const coachA = await seedUser('coach-club-a', 'coach', 'boitsfort-rfc');
  const coachB = await seedUser('coach-club-b', 'coach', 'rival-club');

  await callClub('POST', { club: SETUP }, { cookie: coachA.cookie });

  const viewB = await callClub('GET', null, { cookie: coachB.cookie });
  assert.equal(viewB.statusCode, 200);
  assert.equal(viewB.body.club, null, "coach B must not see coach A's club config");

  // Coach B's own setup lands in their own namespace
  await callClub('POST', { club: { ...SETUP, clubName: 'Rival RFC' } }, { cookie: coachB.cookie });
  const viewA = await callClub('GET', null, { cookie: coachA.cookie });
  assert.equal(viewA.body.club.clubName, 'Belgium Rugby', "coach B's setup must not overwrite coach A's");
});

// ─── 4. Players only join the invited team ───────────────────────────────────

test('players join only the team their invite was issued for and read that club config', async () => {
  kv.clear();
  const coachA = await seedUser('coach-inv-a', 'coach', 'boitsfort-rfc');
  await callClub('POST', { club: SETUP }, { cookie: coachA.cookie });

  // Seed an invite issued for team boitsfort-rfc and one for rival-club
  kv.set('ce:invites', JSON.stringify([
    { token: 'invite-team-a-tok', name: 'Team A Joiner', role: 'player', status: 'pending', teamId: 'boitsfort-rfc' },
    { token: 'invite-team-b-tok', name: 'Team B Joiner', role: 'player', status: 'pending', teamId: 'rival-club' },
  ]));

  const joinA = await claimInvite({ token: 'invite-team-a-tok', email: 'joiner.a@club.test', password: 'password123', name: 'Team A Joiner' });
  assert.equal(joinA.teamMember.teamId, 'boitsfort-rfc', 'invite must bind the player to the issuing team');
  assert.equal(joinA.session.teamId, 'boitsfort-rfc');

  const joinB = await claimInvite({ token: 'invite-team-b-tok', email: 'joiner.b@club.test', password: 'password123', name: 'Team B Joiner' });
  assert.equal(joinB.teamMember.teamId, 'rival-club');

  // Team A's player reads Team A's club config; Team B's player gets null
  const viewA = await callClub('GET', null, { cookie: `${SESSION_COOKIE}=${encodeURIComponent(joinA.session.token)}` });
  assert.equal(viewA.body.club.clubName, 'Belgium Rugby');
  const viewB = await callClub('GET', null, { cookie: `${SESSION_COOKIE}=${encodeURIComponent(joinB.session.token)}` });
  assert.equal(viewB.body.club, null, "team B's player must not see team A's club");
});

// ─── 5 + 6. Write protection ─────────────────────────────────────────────────

test('players cannot write club config; unauthenticated access rejected', async () => {
  kv.clear();
  const player = await seedUser('player-club-w', 'player', 'boitsfort-rfc');

  const playerWrite = await callClub('POST', { club: SETUP }, { cookie: player.cookie });
  assert.equal(playerWrite.statusCode, 403);

  const anonRead = await callClub('GET', null, {});
  assert.equal(anonRead.statusCode, 401);
  const anonWrite = await callClub('POST', { club: SETUP }, {});
  assert.equal(anonWrite.statusCode, 401);
});

// ─── 7. Validation ───────────────────────────────────────────────────────────

test('clubName is required and junk fields are stripped', async () => {
  kv.clear();
  const coach = await seedUser('coach-club-val', 'coach', 'boitsfort-rfc');

  const missing = await callClub('POST', { club: { teamName: 'No Club Name' } }, { cookie: coach.cookie });
  assert.equal(missing.statusCode, 400);

  await callClub('POST', {
    club: { ...SETUP, evil: 'payload', trainingDays: [{ day: 'NotADay', time: '19:00' }, { day: 'Sat', time: 'bad' }] },
  }, { cookie: coach.cookie });
  const res = await callClub('GET', null, { cookie: coach.cookie });
  assert.equal(res.body.club.evil, undefined, 'unknown fields must be stripped');
  assert.deepEqual(res.body.club.trainingDays, [{ day: 'Sat', time: '19:00' }], 'invalid days dropped, invalid times defaulted');
});

// ─── 8. Invite email uses the configured club name ───────────────────────────

test('invite email greets with the configured club name, not hardcoded Boitsfort', async () => {
  kv.clear();
  sentEmails.length = 0;
  process.env.RESEND_API_KEY = 're_test_key';
  const coach = await seedUser('coach-email', 'coach', 'boitsfort-rfc');
  await callClub('POST', { club: SETUP }, { cookie: coach.cookie });

  const res = buildRes();
  await inviteHandler({
    method: 'POST',
    query: {},
    headers: { cookie: coach.cookie, host: 'club.test' },
    body: { name: 'Email Player', role: 'player', email: 'email.player@club.test', sendEmail: true },
  }, res);
  delete process.env.RESEND_API_KEY;

  assert.equal(res.statusCode, 201);
  const emailPayload = JSON.stringify(sentEmails);
  assert.equal(emailPayload.includes('Belgium Rugby'), true, 'email must use the configured club name');
  assert.equal(emailPayload.includes('Boitsfort RFC'), false, 'hardcoded club name must be gone');
});
