/**
 * Phase 0 security hotfix — claim_invite account-takeover & disclosure guards.
 *
 * 1. Existing account + WRONG password claim → 403, password NOT overwritten, no session.
 * 2. Existing account + CORRECT password claim (coach-link upgrade) → succeeds,
 *    role upgraded, password unchanged.
 * 3. New email claim → account created, password set, session issued (regression).
 * 4. allowExisting:true re-claim of an accepted single-use invite → 409.
 * 5. Rate limit → 6th claim in the window → 429.
 * 6. Unauthenticated GET /api/invite?token= returns NO email/name.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.claimsec.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const store = new Map();
const lists = new Map();

globalThis.fetch = async (url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_test_000', url }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = store.has(args[0]) ? store.get(args[0]) : null;
  if (command === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { store.delete(args[0]); lists.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const { claimInvite, createSession } = await import('../api/_identityStore.js');
const { default: identityHandler }   = await import('../api/identity.js');
const { default: inviteHandler }     = await import('../api/invite.js');

function apiReq(method, { query = {}, body = {}, headers = {} } = {}) { return { method, query, body, headers }; }
function apiRes() {
  return {
    statusCode: 0, headers: {}, payload: null,
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
    end() { return this; },
  };
}
async function callApi(handler, method, options = {}) {
  const response = apiRes();
  await handler(apiReq(method, options), response);
  return response;
}
function usersInStore() { return JSON.parse(store.get('app:identity:users') || '[]'); }
function userByEmail(email) { return usersInStore().find(u => u.email === email); }
function seedInvite(inv) {
  const invites = JSON.parse(store.get('ce:invites') || '[]');
  invites.push({ status: 'pending', createdAt: new Date().toISOString(), teamId: 'boitsfort-rfc', ...inv });
  store.set('ce:invites', JSON.stringify(invites));
}

// ── 1. account takeover blocked: wrong password never resets an existing account ──
test('existing account + WRONG password claim → 403, password unchanged, no session', async () => {
  store.clear(); lists.clear();
  // Victim creates their account by claiming their own player invite.
  seedInvite({ token: 'VictimTok0000001', name: 'Vic Tim', role: 'player', email: 'victim@club.test' });
  await claimInvite({ token: 'VictimTok0000001', name: 'Vic Tim', email: 'victim@club.test', password: 'victimRealPass1' });
  const before = userByEmail('victim@club.test').passwordHash;
  assert.ok(before, 'victim has a stored password hash');

  // Attacker holds ANY live invite link and tries to claim the victim's email with a chosen password.
  seedInvite({ token: 'AttackerTok00001', kind: 'group', role: 'player', status: 'open', expiresAt: null });
  await assert.rejects(
    () => claimInvite({ token: 'AttackerTok00001', name: 'Attacker', email: 'victim@club.test', password: 'attackerChosen9' }),
    (err) => { assert.equal(err.status, 403); return true; },
    'claim into an existing account with the wrong password must be rejected',
  );
  assert.equal(userByEmail('victim@club.test').passwordHash, before, 'victim password MUST be unchanged');
});

// ── 2. legitimate existing owner upgrading via the reusable coach link still works ──
test('existing account + CORRECT password claim (coach upgrade) → succeeds, role upgraded, password unchanged', async () => {
  store.clear(); lists.clear();
  seedInvite({ token: 'PlayerTok0000001', name: 'Bob Player', role: 'player', email: 'bob@club.test' });
  await claimInvite({ token: 'PlayerTok0000001', name: 'Bob Player', email: 'bob@club.test', password: 'bobRealPass12' });
  const before = userByEmail('bob@club.test').passwordHash;

  // Reusable coach/staff group link — Bob upgrades himself using his REAL password.
  seedInvite({ token: 'CoachGroupTok001', kind: 'group', role: 'coach', staffLevel: 'assistant', status: 'open', expiresAt: null });
  const res = await claimInvite({ token: 'CoachGroupTok001', name: 'Bob Player', email: 'bob@club.test', password: 'bobRealPass12' });

  assert.equal(res.teamMember.role, 'coach', 'existing player upgraded to coach');
  assert.ok(res.session?.token, 'legitimate owner gets a session');
  assert.equal(userByEmail('bob@club.test').passwordHash, before, 'password unchanged on a verified upgrade');
});

// ── 3. new email claim unaffected (regression) ──
test('new email claim → account created, password set, session issued', async () => {
  store.clear(); lists.clear();
  seedInvite({ token: 'NewTok000000001', name: 'New Person', role: 'player', email: 'new@club.test' });
  const res = await claimInvite({ token: 'NewTok000000001', name: 'New Person', email: 'new@club.test', password: 'newRealPass123' });
  assert.match(res.user.id, /^user_/);
  assert.ok(res.session?.token);
  assert.equal(userByEmail('new@club.test').passwordSet, true);
});

// ── 4. allowExisting can no longer replay an accepted single-use invite ──
test('allowExisting:true re-claim of an accepted single-use invite → 409', async () => {
  store.clear(); lists.clear();
  seedInvite({ token: 'SingleUseTok0001', name: 'Solo Player', role: 'player', email: 'solo@club.test' });
  await claimInvite({ token: 'SingleUseTok0001', name: 'Solo Player', email: 'solo@club.test', password: 'soloRealPass1' });
  await assert.rejects(
    () => claimInvite({ token: 'SingleUseTok0001', allowExisting: true, name: 'Solo Player', email: 'solo@club.test', password: 'soloRealPass1' }),
    (err) => { assert.equal(err.status, 409); return true; },
    'allowExisting must not let an accepted single-use invite be replayed',
  );
});

// ── 5. claim_invite is rate limited ──
test('claim_invite is rate limited — 6th attempt in the window → 429', async () => {
  store.clear(); lists.clear();
  seedInvite({ token: 'RateGroupTok0001', kind: 'group', role: 'player', status: 'open', expiresAt: null });
  const body = { action: 'claim_invite', token: 'RateGroupTok0001', name: 'Rate Tester', email: 'rate@club.test', password: 'rateRealPass12' };
  let last;
  for (let i = 1; i <= 6; i++) {
    last = await callApi(identityHandler, 'POST', { body, headers: { 'x-forwarded-for': '9.9.9.9' } });
  }
  assert.equal(last.statusCode, 429, 'the 6th claim in the window must be throttled');
});

// ── 6. unauthenticated invite GET no longer leaks invitee PII ──
test('GET /api/invite?token= returns no email/name (PII)', async () => {
  store.clear(); lists.clear();
  seedInvite({ token: 'GetDisclosureTok', name: 'Hidden Name', role: 'player', email: 'hidden@club.test' });
  const res = await callApi(inviteHandler, 'GET', { query: { token: 'GetDisclosureTok' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.valid, true);
  assert.equal(res.payload.role, 'player', 'non-PII fields still returned');
  assert.equal(res.payload.email, undefined, 'email must NOT be disclosed');
  assert.equal(res.payload.name, undefined, 'name must NOT be disclosed');
});
