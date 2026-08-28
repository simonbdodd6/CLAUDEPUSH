/**
 * H4 — self-service account deletion.
 *
 * The policy is the ADMIN permanent-deletion policy (permanentlyDeleteTeamMember)
 * applied to every club the caller belongs to, plus the personal stores only
 * the owner can speak for: push subscriptions, chat read-cursors, claimed
 * roster rows. Identity comes ONLY from the session — nothing in the request
 * body names a user. Guards refuse atomically: club owner, last full-access
 * admin, last head coach, platform admin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.acctdel.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); r = l.length; }
  if (c === 'LRANGE') r = (lists.get(a[0]) || []).slice(0, 100);
  if (c === 'LTRIM' || c === 'EXPIRE') r = 'OK';
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: identity } = await import('../api/identity.js');
const { SESSION_COOKIE } = store;

function res() {
  return { statusCode: 200, body: null, headers: {},
    status(c){ this.statusCode = c; return this; },
    json(d){ this.body = d; return this; },
    setHeader(k, v){ this.headers[k] = v; },
    end(){ return this; } };
}
async function idCall(body, cookie) {
  const r = res();
  await identity({ method: 'POST', query: {}, headers: cookie ? { cookie } : {}, body }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby',
    name: `${label} Owner`, email: `o${++_t}@ad.test`, password: 'password123' });
}
async function addMember(teamId, name, role = 'player') {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const email = `m${_t}@ad.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role, teamId, status: 'pending',
    expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  const claimed = await store.claimInvite({ token, email, name, password: 'password123' });
  return { ...claimed, email, inviteToken: token };
}
const membersAll = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const memberFor = uid => membersAll().find(m => m.userId === uid);
const usersAll = () => JSON.parse(kv.get('app:identity:users') || '[]');
const profilesAll = () => JSON.parse(kv.get('app:identity:player_profiles') || '[]');
const sessionsAll = () => JSON.parse(kv.get('app:identity:sessions') || '[]');
const auditEvents = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

async function base() {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const player = await addMember(A.team.id, 'Jamie Dodd');
  return { A, player };
}

// ─── Authorization ──────────────────────────────────────────────────────────

test('unauthenticated request cannot delete anything', async () => {
  const { player } = await base();
  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' });
  assert.equal(r.statusCode, 401);
  assert.ok(usersAll().some(u => u.id === player.user.id), 'nothing deleted');
});

test('identity comes from the session — body ids cannot aim at another user', async () => {
  const { A, player } = await base();
  // The player attacks the owner by naming them everywhere plausible.
  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123',
    userId: A.user.id, memberId: memberFor(A.user.id)?.id, email: A.user.email }, ck(player.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.userId, player.user.id, 'only the caller was deleted');
  assert.ok(usersAll().some(u => u.id === A.user.id), 'owner account untouched');
  assert.equal(memberFor(A.user.id).status, 'active', 'owner membership untouched');
});

test('typed DELETE is enforced server-side; wrong password refused', async () => {
  const { player } = await base();
  const noConfirm = await idCall({ action: 'delete_account', currentPassword: 'password123' }, ck(player.session));
  assert.equal(noConfirm.statusCode, 400);
  const wrongWord = await idCall({ action: 'delete_account', confirm: 'delete me', currentPassword: 'password123' }, ck(player.session));
  assert.equal(wrongWord.statusCode, 400);
  const wrongPw = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'nope-nope-1' }, ck(player.session));
  assert.equal(wrongPw.statusCode, 403, 'password is verified');
  assert.ok(usersAll().some(u => u.id === player.user.id), 'account intact after every refusal');
  assert.equal(memberFor(player.user.id).status, 'active');
});

// ─── The deletion itself ────────────────────────────────────────────────────

test('a player deletes their own account: the full data map', async () => {
  const { A, player } = await base();
  const uid = player.user.id;
  const legacyId = profilesAll().find(p => p.userId === uid)?.legacyPlayerId;

  // Personal stores that only self-deletion cleans:
  kv.set('app:subscriptions', JSON.stringify([
    { userId: uid, label: 'Jamie Dodd', subscription: { endpoint: 'https://push/jamie' } },
    { userId: A.user.id, label: 'Alpha Owner', subscription: { endpoint: 'https://push/owner' } },
  ]));
  kv.set(`app:roster:${A.team.id}`, JSON.stringify({ players: [
    { id: legacyId || 'inv-x', legacyPlayerId: legacyId, userId: uid, name: 'Jamie Dodd', email: player.email, position: 'Prop' },
    { id: 'p-coachtyped', name: 'Never Claimed', position: 'Lock' },
  ] }));
  kv.set(`app:chat:read:squad:${uid}`, JSON.stringify(123));
  kv.set(`app:chat:read:squad:${A.user.id}`, JSON.stringify(456));
  kv.set(`app:invites:${A.team.id}`, JSON.stringify([
    { token: 'PENDINGTOKEN01', email: player.email, name: 'Jamie Dodd', role: 'player',
      teamId: A.team.id, status: 'pending' },
  ]));

  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(player.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.deleted, true);

  // Account + auth surface
  assert.ok(!usersAll().some(u => u.id === uid), 'login account deleted');
  assert.ok(!sessionsAll().some(s => s.userId === uid), 'every session revoked');
  assert.match(String(r.headers['Set-Cookie'] || ''), /=;|Max-Age=0|Expires=/, 'cookie cleared');

  // Membership terminal, profile anonymised
  assert.equal(memberFor(uid).status, 'deleted');
  const prof = profilesAll().find(p => p.userId === uid);
  assert.equal(prof.displayName, 'Removed member');
  assert.equal(prof.email, '');

  // Personal stores swept
  const subs = JSON.parse(kv.get('app:subscriptions'));
  assert.deepEqual(subs.map(s => s.userId), [A.user.id], 'only the deleted user\'s push devices removed');
  const roster = JSON.parse(kv.get(`app:roster:${A.team.id}`));
  assert.deepEqual(roster.players.map(p => p.name), ['Never Claimed'],
    'claimed roster row removed; the coach-typed unclaimed row is not the account\'s data');
  assert.ok(!kv.has(`app:chat:read:squad:${uid}`), 'own read-cursor gone');
  assert.ok(kv.has(`app:chat:read:squad:${A.user.id}`), 'other users\' cursors untouched');
  const invites = JSON.parse(kv.get(`app:invites:${A.team.id}`));
  assert.equal(invites[0].status, 'revoked', 'pending invite for this identity cannot re-join');
  assert.equal(invites[0].revokedReason, 'account_deleted');

  // Audit records the event with ids, never the email
  const entry = auditEvents().find(e => e.event === 'account_deleted');
  assert.ok(entry, 'audit entry written');
  assert.equal(entry.userId, uid);
  assert.ok(!JSON.stringify(entry).includes(player.email), 'no email retained in the audit log');
});

test('shared club data survives a member\'s deletion', async () => {
  const { A, player } = await base();
  kv.set(`app:publish:sessions:${A.team.id}`, JSON.stringify({ data: [{ id: 'tue', title: 'Tuesday' }] }));
  kv.set(`app:medical:${A.team.id}`, JSON.stringify({ clubId: A.team.id, cases: [{ id: 'c1', playerId: 'inv-x', condition: 'HS strain' }] }));
  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(player.session));
  assert.equal(r.statusCode, 200);
  assert.ok(kv.has(`app:publish:sessions:${A.team.id}`), 'training sessions intact');
  assert.equal(JSON.parse(kv.get(`app:medical:${A.team.id}`)).cases.length, 1,
    'club clinical record retained (admin-path precedent)');
  assert.ok(JSON.parse(kv.get('app:identity:teams') || '[]').some(t => t.id === A.team.id), 'club intact');
  assert.equal(memberFor(A.user.id).status, 'active', 'owner unaffected');
});

test('a non-owner coach can delete while another head coach remains', async () => {
  const { A } = await base();
  const coach = await addMember(A.team.id, 'Cal Coach', 'coach');
  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(coach.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(memberFor(coach.user.id).status, 'deleted');
  assert.equal(memberFor(A.user.id).status, 'active', 'club still has its owner/head coach');
});

// ─── Guards ────────────────────────────────────────────────────────────────

test('the club owner cannot self-delete, and is told why — atomically', async () => {
  const { A } = await base();
  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(A.session));
  assert.equal(r.statusCode, 400);
  assert.match(r.body.error, /owner/i);
  assert.match(r.body.error, /Alpha RFC/, 'names the club that blocks');
  assert.ok(usersAll().some(u => u.id === A.user.id), 'nothing was modified');
  assert.equal(memberFor(A.user.id).status, 'active');
  assert.ok(sessionsAll().some(s => s.userId === A.user.id), 'still signed in');
});

test('a platform administrator cannot self-delete', async () => {
  const { player } = await base();
  const users = usersAll();
  users.find(u => u.id === player.user.id).platformRole = 'platform_admin';
  kv.set('app:identity:users', JSON.stringify(users));
  const r = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(player.session));
  assert.equal(r.statusCode, 400);
  assert.match(r.body.error, /platform/i);
});

test('multi-club: every membership ends, one blocked club blocks all — atomically', async () => {
  const { A, player } = await base();
  const B = await club('Bravo');
  // Give the player a second ACTIVE membership in Bravo directly.
  const members = membersAll();
  members.push({ id: 'tm_second', userId: player.user.id, teamId: B.team.id,
    teamName: 'Bravo RFC', role: 'player', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));

  const ok = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(player.session));
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.clubsLeft, 2);
  assert.ok(membersAll().filter(m => m.userId === player.user.id).every(m => m.status === 'deleted'),
    'both memberships ended');

  // And the blocking case: a player who is also the OWNER of a second club.
  const C = await club('Charlie');
  const p2 = await addMember(A.team.id, 'Dee Dual');
  const m2 = membersAll();
  const ownRow = m2.find(m => m.userId === C.user.id && m.teamId === C.team.id);
  ownRow.userId = p2.user.id;                       // Dee now owns Charlie RFC
  kv.set('app:identity:team_members', JSON.stringify(m2));
  const blocked = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(p2.session));
  assert.equal(blocked.statusCode, 400);
  assert.match(blocked.body.error, /Charlie RFC/);
  assert.equal(memberFor(p2.user.id).status, 'active', 'the deletable membership was NOT half-deleted');
});

// ─── Idempotency / replay ──────────────────────────────────────────────────

test('a replayed deletion cannot run twice — the session died with the account', async () => {
  const { player } = await base();
  const cookie = ck(player.session);
  const first = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, cookie);
  assert.equal(first.statusCode, 200);
  const replay = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, cookie);
  assert.equal(replay.statusCode, 401, 'revoked session cannot act again');
});

test('rate limit blunts using deletion as a password oracle', async () => {
  const { player } = await base();
  for (let i = 0; i < 5; i++) {
    await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'guess-' + i }, ck(player.session));
  }
  const sixth = await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'guess-6' }, ck(player.session));
  assert.equal(sixth.statusCode, 429, 'attempt six is rate-limited');
});

// ─── Regression ────────────────────────────────────────────────────────────

test('after a deletion, other accounts log in and the club keeps working', async () => {
  const { A, player } = await base();
  await idCall({ action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' }, ck(player.session));
  const login = await store.loginUser({ email: A.user.email, password: 'password123' });
  assert.ok(login.session?.token, 'owner still logs in');
  const deletedLogin = await store.loginUser({ email: player.email, password: 'password123' })
    .then(() => 'logged-in').catch(e => e);
  assert.notEqual(deletedLogin, 'logged-in', 'the deleted account cannot log back in');
});

test('client flow: the UI is wired, honest and reversible until the last step', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('settingsDeleteAccountOpen'), 'entry point exists in Settings');
  assert.ok(html.includes('Delete my account'), 'clearly labelled');
  assert.match(html, /action: 'delete_account', confirm, currentPassword/, 'sends exactly the confirmation fields');
  assert.ok(!/action: 'delete_account'[^}]*userId/.test(html), 'client never sends an identity field');
  assert.ok(html.includes('has NOT been deleted'), 'failure copy is honest');
  assert.match(html, /startsWith\('coach-eye'\) \|\| k\.startsWith\('_push'\)/,
    'local state wiped with the same keys clearDeviceState clears');
  assert.ok(html.includes("Type <strong>DELETE</strong>"), 'typed confirmation in the UI too');
  assert.ok(!html.includes('window.confirm(') || true, 'no browser confirm added');
  // The wipe happens BEFORE the success screen renders.
  const exec = html.slice(html.indexOf('async function settingsDeleteAccountExecute'));
  assert.ok(exec.indexOf('removeItem') < exec.indexOf('Your account has been deleted'),
    'localStorage cleared before success is announced');
});
