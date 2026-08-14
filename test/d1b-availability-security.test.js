/**
 * D1b Pass 3 (partial) — the two availability SECURITY defects.
 *
 *  1. clear_week required only MANAGE_PLAYERS, which every coach and manager
 *     profile holds — so a U18 manager could blank the Seniors board. Clearing
 *     is now a group action, authorised against the caller's own scope.
 *
 *  2. The weekly reminder called activeMemberIdSet(members) with no teamId.
 *     _lib.js treats null as "match every member", so the job targeted the
 *     active members of EVERY club despite a comment claiming club isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.avail-sec.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { activeMemberIdSet, subscriptionsForMembers } = await import('../api/_lib.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-a', CLUB_B = 'club-b';
const SEN = 'grp-seniors', U18 = 'grp-u18';

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });

const MEMBERS = [
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN) },
  // A MANAGER — the profile that made the old gate dangerous.
  { id: 'm-u18-mgr', teamId: CLUB, userId: 'u-u18-mgr', role: 'coach', staffLevel: 'manager',
    status: 'active', accessProfile: 'manager', accessScope: scope(U18) },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  { id: 'm-b-player', teamId: CLUB_B, userId: 'u-b-player', role: 'player', status: 'active' },
  { id: 'm-a-player', teamId: CLUB, userId: 'u-a-player', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-removed', teamId: CLUB, userId: 'u-removed', role: 'player', status: 'removed' },
];

function seed() {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club A' }, { id: CLUB_B, name: 'Club B' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [{ id: SEN, name: 'Seniors', status: 'active' }, { id: U18, name: 'U18', status: 'active' }],
    teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
            { id: 't-u18', groupId: U18, name: 'U18 Premier', status: 'active' }],
  }));
  // Existing Seniors answers on the pre-group club-scoped key.
  kv.set(`app:availability:${CLUB}:game`, JSON.stringify({ 'u-a-player': { response: 'available', label: 'Senior A' } }));
}

/** Availability writes only — session bookkeeping is not what we're asserting on. */
const availWrites = () => [...new Set(writes.filter(k => k.includes(':availability:')))];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function clearWeek(userId, body = {}) {
  const r = res();
  await availabilityHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' },
    body: { action: 'clear_week', sessions: ['game'], ...body } }, r);
  return r.result;
}

// ── 1. CLEAR_WEEK IS A GROUP ACTION ────────────────────────────────────────
test('a U18 manager cannot clear the Seniors board', async () => {
  seed(); await login('u-u18-mgr');
  const r = await clearWeek('u-u18-mgr', { group: SEN });
  assert.equal(r.code, 403, 'refused — MANAGE_PLAYERS alone is no longer enough');
  assert.deepEqual(availWrites(), [], 'and nothing was written');
});

test('a Seniors coach cannot clear the U18 board', async () => {
  seed(); await login('u-sen-coach');
  const r = await clearWeek('u-sen-coach', { group: U18 });
  assert.equal(r.code, 403);
  assert.deepEqual(availWrites(), []);
});

test('clearing writes ONLY the authorised group\'s key', async () => {
  seed(); await login('u-sen-coach');
  const r = await clearWeek('u-sen-coach', { group: SEN });
  assert.equal(r.code, 200);
  assert.equal(r.body.group.name, 'Seniors');
  // D1b Pass 3 storage split COMPLETE: the clear writes the GROUP key, so
  // clearing Seniors can never touch U18's records (and vice versa).
  assert.deepEqual(availWrites(), [`app:availability:${CLUB}:group:${SEN}:game`],
    'exactly the authorised group\'s keyspace');
});

test('a multi-scope admin must name the group — there is no clear-everything', async () => {
  seed(); await login('u-admin');
  const vague = await clearWeek('u-admin');
  assert.equal(vague.code, 400);
  assert.match(vague.body.error, /Choose which group/);
  assert.deepEqual(availWrites(), [], 'nothing cleared while it is ambiguous');

  const explicit = await clearWeek('u-admin', { group: U18 });
  assert.equal(explicit.code, 200);
  assert.deepEqual(availWrites(), [`app:availability:${CLUB}:group:${U18}:game`],
    'the named group\'s keyspace only — Seniors untouched');
});

test('a forged or foreign group is refused', async () => {
  seed(); await login('u-admin');
  assert.equal((await clearWeek('u-admin', { group: 'grp-forged' })).code, 404);
  assert.equal((await clearWeek('u-admin', { group: 't-prem' })).code, 404, 'team id is not a group id');
  assert.deepEqual(availWrites(), [], 'no write on any refusal');
});

test('a single-scope coach needs no explicit group — today\'s shape still works', async () => {
  seed(); await login('u-sen-coach');
  const r = await clearWeek('u-sen-coach');           // no group named
  assert.equal(r.code, 200, 'their one group is unambiguous');
  assert.equal(r.body.group.id, SEN);
});

// ── 2. THE REMINDER MUST NOT CROSS CLUBS ───────────────────────────────────
test('activeMemberIdSet with no teamId really does match every club', () => {
  // The behaviour that caused the defect, pinned so it cannot surprise again.
  const all = activeMemberIdSet(MEMBERS);
  assert.equal(all.has('u-b-player'), true, 'club B leaks in without a teamId');
  const scoped = activeMemberIdSet(MEMBERS, CLUB);
  assert.equal(scoped.has('u-b-player'), false, 'and is correctly excluded with one');
  assert.equal(scoped.has('u-removed'), false, 'removed members never included');
});

test('the reminder now builds its audience per club', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../api/cron.js', import.meta.url), 'utf8');
  assert.match(src, /const reminderClubIds = \[\.\.\.new Set\(reminderMembers/,
    'the job enumerates the clubs that actually have memberships');
  assert.match(src, /activeMemberIdSet\(reminderMembers, clubId\)/,
    'and scopes each set to its club');
  assert.equal(/activeMemberIdSet\(reminderMembers\)\s*\)/.test(src), false,
    'the unscoped call is gone');
});

test('per-club scoping reaches every real member and no non-member', () => {
  // Union of per-club sets == every active member, and nobody else.
  const clubIds = [...new Set(MEMBERS.filter(m => m.status === 'active' && m.teamId).map(m => String(m.teamId)))];
  const scoped = new Set();
  for (const id of clubIds) for (const u of activeMemberIdSet(MEMBERS, id)) scoped.add(u);

  assert.equal(scoped.has('u-a-player'), true, 'club A member included');
  assert.equal(scoped.has('u-b-player'), true, 'club B member still gets their own reminder');
  assert.equal(scoped.has('u-removed'), false, 'removed member excluded');

  const subs = [
    { subscription: { endpoint: 'e1' }, userId: 'u-a-player', label: 'A' },
    { subscription: { endpoint: 'e2' }, userId: 'u-removed', label: 'R' },
    { subscription: { endpoint: 'e3' }, userId: 'u-nobody', label: 'N' },
  ];
  const targets = subscriptionsForMembers(subs, scoped).map(s => s.userId);
  assert.deepEqual(targets, ['u-a-player'], 'no removed member, no non-member');
});
