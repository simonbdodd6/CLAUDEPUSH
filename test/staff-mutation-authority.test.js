/**
 * STAFF MUTATION AUTHORITY — the four staff-target member-mutation paths.
 *
 * Audit P1/P2/P3: delete_member_permanently, remove_member, archive_member and
 * restore_member all routed STAFF targets through assertPlayerTargetOperable,
 * which is a NO-OP for a non-player role. So a group-scoped coach/manager who
 * holds PLAYER_DELETE (but not MANAGE_COACHES), or a group-scoped MANAGE_COACHES
 * holder, could remove/archive/restore — and irreversibly DELETE — a staff
 * member of ANOTHER group in the same club.
 *
 * The fix mirrors set_staff_level exactly: a STAFF target requires
 *   MANAGE_COACHES  AND  assertStaffTargetOperable(session, target)
 * (the caller's own groups must cover the target's; a club-wide caller covers
 * everyone). PLAYER targets keep the existing assertPlayerTargetOperable gate
 * unchanged. Authority is derived server-side from the caller's membership and
 * the target's canonical role — never a forged group/role in the request — and
 * on permanent deletion it runs BEFORE the irreversible mutation.
 *
 * Drives the REAL identity handler over hand-seeded KV (precise access scopes).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.staffmut.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  if (command === 'LRANGE') result = [];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: identityHandler } = await import('../api/identity.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-sma';
const CLUB2 = 'club-sma2';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18', SEN2 = 'grp-sen2';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};
const STRUCTURE2 = {
  version: 1,
  groups: [{ id: SEN2, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [{ id: 't2-prem', groupId: SEN2, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });

const MEMBERS = [
  // ── CLUB callers ──────────────────────────────────────────────────────────
  // Club owner — club-wide administrator (covers every group).
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true },
  // A second, club-wide head coach — so demoting/deleting staff never trips a
  // last-head/last-admin guard, and a club-wide authorized caller is available.
  { id: 'm-clubhead', teamId: CLUB, userId: 'u-clubhead', role: 'coach', staffLevel: 'head', status: 'active' },
  // A LEGACY head coach scoped to ONE group: role coach + staffLevel head →
  // derives the full profile (MANAGE_COACHES + PLAYER_DELETE) but a one-group
  // access scope. The group-scoped-authorized caller.
  { id: 'm-sen-head', teamId: CLUB, userId: 'u-sen-head', role: 'coach', staffLevel: 'head',
    status: 'active', accessScope: scope(SEN) },
  // A Coach-access holder (MANAGE_PLAYERS + PLAYER_DELETE, NO MANAGE_COACHES),
  // group-scoped to SEN. The "lacks MANAGE_COACHES" caller, and the actor for
  // the unchanged PLAYER paths.
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', staffLevel: 'assistant',
    status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },

  // ── CLUB staff targets (active) ─────────────────────────────────────────────
  { id: 'm-sen-physio',  teamId: CLUB, userId: 'u-sen-physio',  role: 'medical', status: 'active', accessScope: scope(SEN) },
  { id: 'm-sen-analyst', teamId: CLUB, userId: 'u-sen-analyst', role: 'analyst', status: 'active', accessScope: scope(SEN) },
  { id: 'm-u18-physio',  teamId: CLUB, userId: 'u-u18-physio',  role: 'medical', status: 'active', accessScope: scope(U18) },
  { id: 'm-u18-coach',   teamId: CLUB, userId: 'u-u18-coach',   role: 'coach', staffLevel: 'assistant',
    status: 'active', accessScope: scope(U18) },
  // ── CLUB staff targets (archived, for restore) ──────────────────────────────
  { id: 'm-sen-physio-arch', teamId: CLUB, userId: 'u-sen-physio-arch', role: 'medical', status: 'archived', accessScope: scope(SEN) },
  { id: 'm-u18-physio-arch', teamId: CLUB, userId: 'u-u18-physio-arch', role: 'medical', status: 'archived', accessScope: scope(U18) },

  // ── CLUB player targets (the unchanged player path) ─────────────────────────
  { id: 'm-sen-player',      teamId: CLUB, userId: 'u-sen-player',      role: 'player', status: 'active',   playerGroupId: SEN },
  { id: 'm-u18-player',      teamId: CLUB, userId: 'u-u18-player',      role: 'player', status: 'active',   playerGroupId: U18 },
  { id: 'm-sen-player-arch', teamId: CLUB, userId: 'u-sen-player-arch', role: 'player', status: 'archived', playerGroupId: SEN },

  // ── CLUB2 (cross-club) ──────────────────────────────────────────────────────
  { id: 'm2-owner',  teamId: CLUB2, userId: 'u2-owner',  role: 'admin',   status: 'active', isOwner: true },
  { id: 'm2-physio', teamId: CLUB2, userId: 'u2-physio', role: 'medical', status: 'active', accessScope: scope(SEN2) },
];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club SMA' }, { id: CLUB2, name: 'Club SMA2' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify(MEMBERS.map(m => ({ userId: m.userId, displayName: m.userId, email: `${m.userId}@c.test` }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${CLUB2}`, JSON.stringify(STRUCTURE2));
  for (const m of MEMBERS) await login(m.userId);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function call(userId, body) {
  const r = res();
  await identityHandler({ method: 'POST', query: {}, body, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const kvMembers = () => JSON.parse(kv.get('app:identity:team_members'));
const statusOf = id => kvMembers().find(m => m.id === id)?.status;

// Build the request body for a given action (permanent delete needs the typed
// confirmation; we pass a VALID one on DENY tests so ONLY authorization can
// block the call — never the confirmation gate).
const bodyFor = (action, memberId) =>
  action === 'delete_member_permanently'
    ? { action, memberId, confirm: 'DELETE' }
    : { action, memberId };

// The four staff-target mutation paths. For each, the target's seeded status and
// what "still untouched" means (deletion terminal state is 'deleted').
const STAFF_MUTATIONS = [
  { action: 'archive_member',            target: 'm-u18-physio',      seeded: 'active',   otherGroup: 'm-u18-physio' },
  { action: 'remove_member',             target: 'm-u18-physio',      seeded: 'active',   otherGroup: 'm-u18-physio' },
  { action: 'delete_member_permanently', target: 'm-u18-physio',      seeded: 'active',   otherGroup: 'm-u18-physio' },
  { action: 'restore_member',            target: 'm-u18-physio-arch', seeded: 'archived', otherGroup: 'm-u18-physio-arch' },
];
// Same four, but SEN targets (the group-scoped-authorized caller COVERS them).
const STAFF_SEN = {
  archive_member: 'm-sen-physio',
  remove_member: 'm-sen-analyst',
  delete_member_permanently: 'm-sen-physio',
  restore_member: 'm-sen-physio-arch',
};

// ── C — group-scoped authorized caller CANNOT touch another group's staff ─────
// This is the core fix: u-sen-head holds MANAGE_COACHES + PLAYER_DELETE but is
// scoped to SEN, so U18 staff are beyond reach on every path.
for (const { action, otherGroup, seeded } of STAFF_MUTATIONS) {
  test(`C — group-scoped head coach CANNOT ${action} a U18 staff member`, async () => {
    await seed();
    const r = await call('u-sen-head', bodyFor(action, otherGroup));
    assert.equal(r.code, 403, JSON.stringify(r.body));
    assert.equal(statusOf(otherGroup), seeded, 'other-group staff untouched');
  });
}

// ── D — a caller lacking MANAGE_COACHES CANNOT touch staff (even in own group) ─
for (const { action, seeded } of STAFF_MUTATIONS) {
  const target = STAFF_SEN[action];  // a SEN target the coach DOES cover by group
  test(`D — a Coach-access holder (no MANAGE_COACHES) CANNOT ${action} staff`, async () => {
    await seed();
    const r = await call('u-sen-coach', bodyFor(action, target));
    assert.equal(r.code, 403, JSON.stringify(r.body));
    assert.match(String(r.body?.error || ''), /staff/i);
    assert.equal(statusOf(target), seeded, 'staff untouched');
  });
}

// ── A — a club-wide authorized manager MAY mutate staff in any group ──────────
for (const { action } of STAFF_MUTATIONS) {
  const target = STAFF_SEN[action] === 'm-sen-physio' && action !== 'restore_member' ? 'm-u18-physio'
    : action === 'restore_member' ? 'm-u18-physio-arch'
    : action === 'remove_member' ? 'm-u18-coach' : 'm-u18-physio';
  test(`A — the club owner (club-wide) MAY ${action} a U18 staff member`, async () => {
    await seed();
    const r = await call('u-owner', bodyFor(action, target));
    assert.equal(r.code, 200, JSON.stringify(r.body));
  });
}

// ── B — a group-scoped authorized caller MAY mutate staff IN their own group ──
for (const { action } of STAFF_MUTATIONS) {
  const target = STAFF_SEN[action];
  test(`B — group-scoped head coach MAY ${action} staff in their OWN group`, async () => {
    await seed();
    const r = await call('u-sen-head', bodyFor(action, target));
    assert.equal(r.code, 200, JSON.stringify(r.body));
  });
}

// ── E — cross-club staff target is denied on every path ───────────────────────
test('E — a CLUB owner cannot delete a CLUB2 staff member (cross-club)', async () => {
  await seed();
  const r = await call('u-owner', { action: 'delete_member_permanently', memberId: 'm2-physio', confirm: 'DELETE' });
  assert.ok(r.code === 403 || r.code === 404, `denied, got ${r.code}: ${JSON.stringify(r.body)}`);
  assert.equal(statusOf('m2-physio'), 'active', 'cross-club staff untouched');
});
test('E — a CLUB owner cannot archive a CLUB2 staff member (cross-club)', async () => {
  await seed();
  const r = await call('u-owner', { action: 'archive_member', memberId: 'm2-physio' });
  assert.ok(r.code >= 400, `denied, got ${r.code}: ${JSON.stringify(r.body)}`);
  assert.equal(statusOf('m2-physio'), 'active', 'cross-club staff untouched');
});

// ── F — permanent deletion: authorization precedes the irreversible mutation ──
test('F — a group-scoped coach with a VALID confirm still cannot permanently delete another group\'s staff', async () => {
  await seed();
  // A valid typed confirmation is supplied, so the ONLY thing that can stop the
  // deletion is the authorization gate — proving it runs before the erasure.
  const r = await call('u-sen-head', { action: 'delete_member_permanently', memberId: 'm-u18-physio', confirm: 'DELETE' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(statusOf('m-u18-physio'), 'active', 'U18 staff NOT erased despite a valid confirm');
});

// ── G/H — PLAYER paths are unchanged ──────────────────────────────────────────
test('G — a Coach-access holder MAY still permanently delete a PLAYER in their own group', async () => {
  await seed();
  const r = await call('u-sen-coach', { action: 'delete_member_permanently', memberId: 'm-sen-player', confirm: 'DELETE' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(statusOf('m-sen-player'), 'deleted');
});
test('G — a Coach-access holder still CANNOT delete a PLAYER in another group (player gate unchanged)', async () => {
  await seed();
  const r = await call('u-sen-coach', { action: 'delete_member_permanently', memberId: 'm-u18-player', confirm: 'DELETE' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(statusOf('m-u18-player'), 'active');
});
test('H — a Coach-access holder MAY still archive and restore a PLAYER in their own group', async () => {
  await seed();
  const arch = await call('u-sen-coach', { action: 'archive_member', memberId: 'm-sen-player' });
  assert.equal(arch.code, 200, JSON.stringify(arch.body));
  assert.equal(statusOf('m-sen-player'), 'archived');
  const restored = await call('u-sen-coach', { action: 'restore_member', memberId: 'm-sen-player-arch' });
  assert.equal(restored.code, 200, JSON.stringify(restored.body));
  assert.equal(statusOf('m-sen-player-arch'), 'active');
});
test('H — a Coach-access holder still CANNOT archive a PLAYER in another group (player gate unchanged)', async () => {
  await seed();
  const r = await call('u-sen-coach', { action: 'archive_member', memberId: 'm-u18-player' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(statusOf('m-u18-player'), 'active');
});

// ── the policy is read from the target's role + caller authority, not a forged
//    request field: a forged in-scope group parameter does not grant reach ─────
test('a forged group parameter does not let a scoped caller reach another group\'s staff', async () => {
  await seed();
  const r = await call('u-sen-head', { action: 'archive_member', memberId: 'm-u18-physio', groupId: SEN, group: SEN });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(statusOf('m-u18-physio'), 'active');
});
