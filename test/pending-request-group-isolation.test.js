/**
 * PENDING JOIN-REQUEST GROUP ISOLATION.
 *
 * A pending join request is a player awaiting approval. The identity GET's
 * `pending` list, and the approve/reject writes, must obey the SAME group scope
 * as every other player surface:
 *   • club-wide staff  → see and act on every pending request;
 *   • group-scoped staff → only their groups' requests (a groupless / bare
 *     team-code request is an unassigned player = club administration, withheld
 *     from scoped staff and un-actionable by them);
 *   • forged cross-group approve/reject → 403.
 *
 * Before the fix `scopeIdentityState` spread `pending` through unscoped, and
 * approve/reject skipped assertPlayerTargetOperable — so a U18 coach saw and
 * could approve a Seniors (or club-level) join request. Drives the REAL
 * identity handler + store over an in-memory KV, mirroring identity-group-privacy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.prgi.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: identityHandler } = await import('../api/identity.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-prgi';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};
const scope = (...ids) => ({ clubWide: false, groups: ids.map(groupId => ({ groupId, status: 'active' })), teams: [] });

const MEMBERS = [
  // staff
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },
  // pending join requests
  { id: 'm-pend-u18', teamId: CLUB, userId: 'u-pend-u18', role: 'player', status: 'pending', playerGroupId: U18 },
  { id: 'm-pend-sen', teamId: CLUB, userId: 'u-pend-sen', role: 'player', status: 'pending', playerGroupId: SEN },
  { id: 'm-pend-lost', teamId: CLUB, userId: 'u-pend-lost', role: 'player', status: 'pending' }, // groupless team-code join
  // an active player so approve has a normal roster to add to
  { id: 'm-u18-a', teamId: CLUB, userId: 'u-u18-a', role: 'player', status: 'active', playerGroupId: U18 },
];
const USERS = MEMBERS.map(m => ({ id: m.userId, displayName: m.userId, email: `${m.userId}@x.test` }));

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club PRGI' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(USERS));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  for (const m of MEMBERS) await login(m.userId);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function call(userId, { method = 'GET', query = {}, body = null } = {}) {
  const r = res();
  await identityHandler({ method, query, body, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const pendingIds = r => (r.body.pending || []).map(p => p.id).sort();
const memberStatus = id => JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === id)?.status;

// ── READ scoping ─────────────────────────────────────────────────────────────

test('READ — a club-wide admin sees EVERY pending request (incl. the groupless one)', async () => {
  await seed();
  const r = await call('u-admin');
  assert.equal(r.code, 200);
  assert.deepEqual(pendingIds(r), ['m-pend-lost', 'm-pend-sen', 'm-pend-u18']);
});

test('READ — a U18-scoped coach sees ONLY the U18 pending request', async () => {
  await seed();
  const r = await call('u-u18-coach');
  assert.equal(r.code, 200);
  assert.deepEqual(pendingIds(r), ['m-pend-u18'], 'no Seniors and no groupless request leaks in');
});

test('READ — a Seniors-scoped coach sees ONLY the Seniors pending request', async () => {
  await seed();
  const r = await call('u-sen-coach');
  assert.deepEqual(pendingIds(r), ['m-pend-sen']);
});

// ── WRITE gate: approve ──────────────────────────────────────────────────────

test('WRITE — a U18 coach may approve a U18 pending request', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: { action: 'approve', memberId: 'm-pend-u18' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(memberStatus('m-pend-u18'), 'active', 'the request was approved');
});

test('WRITE — a U18 coach may NOT approve a Seniors pending request (403, unchanged)', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: { action: 'approve', memberId: 'm-pend-sen' } });
  assert.equal(r.code, 403);
  assert.equal(memberStatus('m-pend-sen'), 'pending', 'the Seniors request is untouched');
});

test('WRITE — a U18 coach may NOT approve a groupless (club-admin) pending request (403)', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: { action: 'approve', memberId: 'm-pend-lost' } });
  assert.equal(r.code, 403);
  assert.equal(memberStatus('m-pend-lost'), 'pending');
});

test('WRITE — a club-wide admin may approve the groupless pending request', async () => {
  await seed();
  const r = await call('u-admin', { method: 'POST', body: { action: 'approve', memberId: 'm-pend-lost' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(memberStatus('m-pend-lost'), 'active');
});

// ── WRITE gate: reject ───────────────────────────────────────────────────────

test('WRITE — a U18 coach may NOT reject a Seniors pending request (403)', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: { action: 'reject', memberId: 'm-pend-sen' } });
  assert.equal(r.code, 403);
  assert.equal(memberStatus('m-pend-sen'), 'pending', 'not rejected across groups');
});

test('WRITE — a Seniors coach may reject the Seniors pending request', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: { action: 'reject', memberId: 'm-pend-sen' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(memberStatus('m-pend-sen'), 'rejected');
});

test('a forged group parameter cannot widen a scoped coach past their groups', async () => {
  await seed();
  // teamId is the only client-supplied hint; the target group comes from the
  // member record, never the request — so passing extra body fields changes nothing.
  const r = await call('u-u18-coach', { method: 'POST', body: { action: 'approve', memberId: 'm-pend-sen', playerGroupId: U18, teamId: CLUB } });
  assert.equal(r.code, 403, 'the Seniors target is resolved from the store, not the forged body field');
  assert.equal(memberStatus('m-pend-sen'), 'pending');
});
