/**
 * RC4.9B Part 3 — permanent member removal.
 *
 * Archive stays the normal reversible action. Permanent deletion is the
 * irreversible erasure path: highest member-management permission + danger
 * zone + a typed confirmation the SERVER re-checks. Historical club records
 * (appearances, adjustments, availability, audit log) are deliberately kept.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.permdelete.test';
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
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function idCall(body, cookie) {
  const r = res();
  await identity({ method: 'POST', query: {}, headers: cookie ? { cookie } : {}, body }, r);
  return r;
}
async function pubCall(method, query, body, cookie) {
  const r = res();
  await publish({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Owner`, email: `o${++_t}@pd.test`, password: 'password123' });
}
async function addPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const email = `p${_t}@pd.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  const claimed = await store.claimInvite({ token, email, name, password: 'password123' });
  return { ...claimed, email, inviteToken: token };
}
const memberIdFor = (userId) => JSON.parse(kv.get('app:identity:team_members') || '[]').find(m => m.userId === userId)?.id;
const memberFor = (userId) => JSON.parse(kv.get('app:identity:team_members') || '[]').find(m => m.userId === userId);
const auditEvents = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

async function base() {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const player = await addPlayer(A.team.id, 'Jamie Dodd');
  return { A, player };
}

test('owner/admin can permanently remove a player', async () => {
  const { A, player } = await base();
  const memberId = memberIdFor(player.user.id);
  const r = await idCall({ action: 'delete_member_permanently', memberId, confirm: 'DELETE' }, ck(A.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.accountDeleted, true, 'login account removed');
  assert.equal(memberFor(player.user.id).status, 'deleted');
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  assert.equal(users.some(u => u.id === player.user.id), false, 'user record gone');
});

test('typed confirmation is enforced server-side', async () => {
  const { A, player } = await base();
  const memberId = memberIdFor(player.user.id);
  const noConfirm = await idCall({ action: 'delete_member_permanently', memberId }, ck(A.session));
  assert.equal(noConfirm.statusCode, 400, 'missing confirmation rejected');
  const wrong = await idCall({ action: 'delete_member_permanently', memberId, confirm: 'yes' }, ck(A.session));
  assert.equal(wrong.statusCode, 400, 'wrong confirmation rejected');
  assert.equal(memberFor(player.user.id).status, 'active', 'member untouched');
  // the member's exact name also works as confirmation
  const byName = await idCall({ action: 'delete_member_permanently', memberId, confirm: 'Jamie Dodd' }, ck(A.session));
  assert.equal(byName.statusCode, 200, JSON.stringify(byName.body));
});

test('a player cannot delete anyone', async () => {
  const { A, player } = await base();
  const other = await addPlayer(A.team.id, 'Other Player');
  const r = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(other.user.id), confirm: 'DELETE' }, ck(player.session));
  assert.equal(r.statusCode, 403);
  assert.equal(memberFor(other.user.id).status, 'active');
});

test('staff without the PLAYER_DELETE permission cannot delete anyone', async () => {
  const { A, player } = await base();
  // RC4.9C: deletion is gated on the PERMISSION, not a job title. Medical staff
  // hold no access profile and therefore no PLAYER_DELETE, even though they are
  // staff with a login. (Manager Access DOES grant deletion — see
  // access-profiles.test.js — so it is no longer the right negative case.)
  const medic = await addPlayer(A.team.id, 'Club Physio');
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.find(m => m.userId === medic.user.id).role = 'medical';
  kv.set('app:identity:team_members', JSON.stringify(members));
  const session = await store.createSession({ userId: medic.user.id, teamId: A.team.id, role: 'medical' });
  const r = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(player.user.id), confirm: 'DELETE' },
    `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`);
  assert.equal(r.statusCode, 403, JSON.stringify(r.body));
  assert.equal(memberFor(player.user.id).status, 'active');
});

test('club A cannot delete club B player', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  const bPlayer = await addPlayer(B.team.id, 'Bravo Player');
  const r = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(bPlayer.user.id), confirm: 'DELETE' }, ck(A.session));
  assert.ok(r.statusCode === 403 || r.statusCode === 404, `HTTP ${r.statusCode}`);
  assert.equal(memberFor(bPlayer.user.id).status, 'active', 'club B player untouched');
});

test('deleted player loses access: sessions revoked and login fails', async () => {
  const { A, player } = await base();
  const memberId = memberIdFor(player.user.id);
  const before = await store.resolveSessionFromRequest({ headers: { cookie: ck(player.session) } }).catch(() => null);
  assert.ok(before?.user?.id, 'player session valid before deletion');

  const del = await idCall({ action: 'delete_member_permanently', memberId, confirm: 'DELETE' }, ck(A.session));
  assert.equal(del.body.sessionsRevoked >= 1, true, 'at least one session revoked');

  const after = await store.resolveSessionFromRequest({ headers: { cookie: ck(player.session) } }).catch(() => null);
  assert.ok(!after?.user?.id, 'session no longer resolves');
  await assert.rejects(() => store.loginUser({ email: player.email, password: 'password123' }), 'login no longer possible');
});

test('unused invitations for the deleted member are revoked', async () => {
  const { A, player } = await base();
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token: 'TKPENDING1', email: player.email, name: 'Jamie Dodd', role: 'player', teamId: A.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  const r = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(player.user.id), confirm: 'DELETE' }, ck(A.session));
  assert.equal(r.body.invitesRevoked >= 1, true, 'pending invite revoked');
  const after = JSON.parse(kv.get('ce:invites') || '[]').find(i => i.token === 'TKPENDING1');
  assert.equal(after.status, 'revoked');
  assert.equal(after.revokedReason, 'member_deleted');
});

test('archived player remains recoverable, permanent deletion does not', async () => {
  const { A, player } = await base();
  const memberId = memberIdFor(player.user.id);
  const arch = await idCall({ action: 'archive_member', memberId }, ck(A.session));
  assert.equal(arch.statusCode, 200);
  const restored = await idCall({ action: 'restore_member', memberId }, ck(A.session));
  assert.equal(restored.statusCode, 200, 'archived member restores');
  assert.equal(memberFor(player.user.id).status, 'active');

  await idCall({ action: 'delete_member_permanently', memberId, confirm: 'DELETE' }, ck(A.session));
  const restoreDeleted = await idCall({ action: 'restore_member', memberId }, ck(A.session));
  assert.notEqual(restoreDeleted.statusCode, 200, 'a permanently deleted member cannot be restored');
  assert.equal(memberFor(player.user.id).status, 'deleted');
});

test('the last full-access administrator cannot be deleted', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');                       // founder = owner, full access
  // A second full-access admin exists so the founder is not the only one; the
  // founder then tries to delete them, leaving the club with one. Blocked.
  const admin2 = await addPlayer(A.team.id, 'Second Admin');
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  const m2 = members.find(m => m.userId === admin2.user.id);
  m2.role = 'coach'; m2.staffLevel = 'head'; m2.accessProfile = 'full';
  kv.set('app:identity:team_members', JSON.stringify(members));
  const s2 = await store.createSession({ userId: admin2.user.id, teamId: A.team.id, role: 'coach' });

  // The second admin cannot delete the owner…
  const killOwner = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(A.user.id), confirm: 'DELETE' },
    `${SESSION_COOKIE}=${encodeURIComponent(s2.token)}`);
  assert.notEqual(killOwner.statusCode, 200, 'club owner is protected');
  assert.match(String(killOwner.body?.error || ''), /owner/i);

  // …and once the owner is the only full-access holder left, the guard names it.
  m2.accessProfile = 'coach';
  kv.set('app:identity:team_members', JSON.stringify(members));
  const lastFull = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(A.user.id), confirm: 'DELETE' },
    `${SESSION_COOKIE}=${encodeURIComponent(s2.token)}`);
  assert.notEqual(lastFull.statusCode, 200, 'a club can never be left without full access');
  assert.equal(memberFor(A.user.id).status, 'active');
});

test('an admin cannot permanently delete their own membership', async () => {
  const { A } = await base();
  const r = await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(A.user.id), confirm: 'DELETE' }, ck(A.session));
  assert.equal(r.statusCode, 400);
  assert.match(String(r.body?.error || ''), /your own/i);
});

test('historical appearances and adjustments survive the deletion', async () => {
  const { A, player } = await base();
  const adj = await pubCall('POST', { resource: 'appearance-adjustments' },
    { playerId: player.user.id, seasonId: '2025-26', amount: 12, reason: 'legacy import' }, ck(A.session));
  assert.equal(adj.statusCode, 201);

  await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(player.user.id), confirm: 'DELETE' }, ck(A.session));

  const after = await pubCall('GET', { resource: 'appearance-adjustments', playerId: player.user.id }, null, ck(A.session));
  assert.equal(after.body.adjustments.length, 1, 'appearance history retained as a club record');
  assert.equal(after.body.adjustments[0].amount, 12);
  // The membership row itself is retained (terminal state) so historical joins resolve.
  assert.ok(memberFor(player.user.id), 'membership row retained for history');
});

test('private profile data is anonymised rather than orphaned', async () => {
  const { A, player } = await base();
  await idCall({ action: 'delete_member_permanently', memberId: memberIdFor(player.user.id), confirm: 'DELETE' }, ck(A.session));
  const profiles = JSON.parse(kv.get('app:identity:player_profiles') || '[]');
  const profile = profiles.find(p => p.userId === player.user.id);
  if (profile) {
    assert.equal(profile.displayName, 'Removed member');
    assert.equal(profile.email, '');
    assert.ok(profile.anonymisedAt, 'anonymisation stamped');
  }
});

test('an audit record is written with member, team, performer and timestamp', async () => {
  const { A, player } = await base();
  const memberId = memberIdFor(player.user.id);
  await idCall({ action: 'delete_member_permanently', memberId, confirm: 'DELETE' }, ck(A.session));
  const entry = auditEvents().find(e => e.event === 'member_deleted_permanently' || e.action === 'member_deleted_permanently');
  assert.ok(entry, `audit entry written (saw: ${auditEvents().map(e => e.event || e.action).join(', ')})`);
  const d = entry.details || entry;
  assert.equal(d.deletedMemberId || d.memberId, memberId);
  assert.equal(d.teamId, A.team.id);
  assert.equal(d.performedBy, A.user.id);
  assert.ok(d.timestamp || entry.at || entry.ts, 'timestamp present');
});

// ── UI guard ────────────────────────────────────────────────────────────────
test('UI confirmation guard exists and is admin-gated', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /canI\('player_delete'\) \?/, 'delete button is gated on the PLAYER_DELETE permission');
  assert.match(src, /function adminDeleteMemberPermanently/, 'handler exists');
  const fn = src.slice(src.indexOf('async function adminDeleteMemberPermanently'), src.indexOf('async function adminArchiveMember'));
  assert.match(fn, /ceConfirm\(/, 'explicit confirmation step');
  assert.match(fn, /cePrompt\(/, 'typed confirmation step');
  assert.match(fn, /CANNOT be undone/i, 'irreversibility warning');
  assert.match(fn, /\$\{email/, 'shows the member email in the confirmation');
});
