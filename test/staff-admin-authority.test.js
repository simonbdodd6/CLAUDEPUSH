/**
 * STAFF-ADMIN AUTHORITY — set_staff_level and remove_member.
 *
 * Two gaps in the same handler, both of the "club-wide-capable permission,
 * group-scoped member" family the set_access_profile fix already closed:
 *
 *   set_staff_level — changing a member's staff CAPABILITY tier
 *   (head/assistant/manager) is club-level authority administration, the same
 *   class as set_access_profile and set_member_access. It was gated on the
 *   permission alone, so a group-scoped legacy head coach (derives the full
 *   profile, holds MANAGE_COACHES, but is scoped to one group) could re-rank
 *   any coach in the club. It now needs requireClubManage: the permission AND
 *   club-wide scope.
 *
 *   remove_member — the staff-removal guard recognised only role
 *   'coach'/'admin' as staff, so a MANAGE_PLAYERS-only holder (Coach or
 *   Manager access, no MANAGE_COACHES) could archive or remove a MEDICAL,
 *   S&C or Analyst member as though they were a player. Staff of EVERY role
 *   now require MANAGE_COACHES to remove.
 *
 * The contract: authority is derived server-side from the caller's own
 * membership and the target's canonical role — never a forged group, level,
 * or role in the request. Club-wide administration is unchanged, and the
 * player-removal group gate (assertPlayerTargetOperable) still applies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.staffadmin.test';
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

const CLUB = 'club-sa';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  // Club owner — the only unconditionally club-wide administrator.
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true },
  // A LEGACY head coach scoped to one group: role coach + staffLevel head →
  // derives the full profile (MANAGE_COACHES) but an explicit one-group scope.
  { id: 'm-sen-head', teamId: CLUB, userId: 'u-sen-head', role: 'coach', staffLevel: 'head',
    status: 'active', accessScope: scope(SEN) },
  // A second head coach, so demoting one never trips the last-head guard.
  { id: 'm-clubhead', teamId: CLUB, userId: 'u-clubhead', role: 'coach', staffLevel: 'head', status: 'active' },
  // Ordinary coaches in each group (the set_staff_level targets).
  { id: 'm-sen-asst', teamId: CLUB, userId: 'u-sen-asst', role: 'coach', staffLevel: 'assistant',
    status: 'active', accessScope: scope(SEN) },
  { id: 'm-u18-asst', teamId: CLUB, userId: 'u-u18-asst', role: 'coach', staffLevel: 'assistant',
    status: 'active', accessScope: scope(U18) },
  // A Coach-access holder (MANAGE_PLAYERS, NO MANAGE_COACHES), group-scoped.
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', staffLevel: 'assistant',
    status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },
  // Non-coach staff — the remove_member targets that were unprotected.
  { id: 'm-physio', teamId: CLUB, userId: 'u-physio', role: 'medical', status: 'active', accessScope: scope(SEN) },
  { id: 'm-snc', teamId: CLUB, userId: 'u-snc', role: 'snc', status: 'active', accessScope: scope(SEN) },
  { id: 'm-analyst', teamId: CLUB, userId: 'u-analyst', role: 'analyst', status: 'active', accessScope: scope(SEN) },
  // A player, to pin the unchanged player-removal path.
  { id: 'm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active', playerGroupId: SEN },
];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club SA' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
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
const levelOf = id => kvMembers().find(m => m.id === id)?.staffLevel;
const statusOf = id => kvMembers().find(m => m.id === id)?.status;

// ── set_staff_level ──────────────────────────────────────────────────────────

test('SET_STAFF_LEVEL — a group-scoped head coach cannot re-rank another group\'s coach', async () => {
  await seed();
  const r = await call('u-sen-head', { action: 'set_staff_level', memberId: 'm-u18-asst', staffLevel: 'head' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(levelOf('m-u18-asst'), 'assistant', 'target level unchanged');
});

test('SET_STAFF_LEVEL — a group-scoped head coach MAY re-rank a coach in their own group (the head-coach power is preserved)', async () => {
  await seed();
  const r = await call('u-sen-head', { action: 'set_staff_level', memberId: 'm-sen-asst', staffLevel: 'manager' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(levelOf('m-sen-asst'), 'manager', 'same-group re-rank applied');
});

test('SET_STAFF_LEVEL — a group-scoped head coach cannot re-rank a club-wide administrator', async () => {
  await seed();
  // The owner operates every group, so a Seniors head coach does not cover them.
  const r = await call('u-sen-head', { action: 'set_staff_level', memberId: 'm-owner', staffLevel: 'assistant' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(levelOf('m-owner'), undefined, 'owner untouched');
});

test('SET_STAFF_LEVEL — a forged group parameter does not grant the scoped caller authority', async () => {
  await seed();
  const r = await call('u-sen-head', {
    action: 'set_staff_level', memberId: 'm-u18-asst', staffLevel: 'head', groupId: U18, group: U18 });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(levelOf('m-u18-asst'), 'assistant');
});

test('SET_STAFF_LEVEL — a covered self-demotion still works (no escalation path exists: heads are the top tier, and non-heads lack MANAGE_COACHES)', async () => {
  await seed();
  // A second head exists (m-clubhead), so the last-head guard does not fire.
  const r = await call('u-sen-head', { action: 'set_staff_level', memberId: 'm-sen-head', staffLevel: 'manager' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(levelOf('m-sen-head'), 'manager');
});

test('SET_STAFF_LEVEL — a Coach-access holder (no MANAGE_COACHES) is refused, as before', async () => {
  await seed();
  const r = await call('u-sen-coach', { action: 'set_staff_level', memberId: 'm-sen-asst', staffLevel: 'head' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
});

test('SET_STAFF_LEVEL — the club owner (club-wide) re-ranks any coach, as before', async () => {
  await seed();
  const r = await call('u-owner', { action: 'set_staff_level', memberId: 'm-u18-asst', staffLevel: 'head' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(levelOf('m-u18-asst'), 'head');
});

// ── remove_member / archive_member ─────────────────────────────────────────

for (const [label, targetId] of [['Medical', 'm-physio'], ['S&C', 'm-snc'], ['Analyst', 'm-analyst']]) {
  test(`REMOVE_MEMBER — a Coach-access holder cannot archive a ${label} staff member`, async () => {
    await seed();
    const r = await call('u-sen-coach', { action: 'archive_member', memberId: targetId });
    assert.equal(r.code, 403, JSON.stringify(r.body));
    assert.match(String(r.body.error || ''), /staff/i);
    assert.equal(statusOf(targetId), 'active', `${label} member untouched`);
  });

  test(`REMOVE_MEMBER — a Coach-access holder cannot permanently remove a ${label} staff member`, async () => {
    await seed();
    const r = await call('u-sen-coach', { action: 'remove_member', memberId: targetId });
    assert.equal(r.code, 403, JSON.stringify(r.body));
    assert.equal(statusOf(targetId), 'active');
  });
}

test('REMOVE_MEMBER — the club owner (MANAGE_COACHES) may still archive a Medical member', async () => {
  await seed();
  const r = await call('u-owner', { action: 'archive_member', memberId: 'm-physio' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(statusOf('m-physio'), 'archived');
});

test('REMOVE_MEMBER — a Coach-access holder cannot archive a coach, as before', async () => {
  await seed();
  const r = await call('u-sen-coach', { action: 'archive_member', memberId: 'm-sen-asst' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
});

test('REMOVE_MEMBER — a Coach-access holder may still archive a PLAYER in their own group', async () => {
  await seed();
  const r = await call('u-sen-coach', { action: 'archive_member', memberId: 'm-player' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(statusOf('m-player'), 'archived');
});
