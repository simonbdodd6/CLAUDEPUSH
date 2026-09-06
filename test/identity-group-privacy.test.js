/**
 * IDENTITY GROUP PRIVACY — the Members/identity read, and the member-state
 * writes that live beside it.
 *
 * The identity GET feeds Members administration and the staff directory. The
 * contract these tests pin:
 *
 *   READ  — a caller whose scope covers EVERY active group receives the whole
 *           club (Club Administration, and every one-group club, unchanged).
 *           A group-scoped caller receives: ALL STAFF identities (the pinned
 *           staff-visibility contract — club-wide, this-group and unscoped
 *           staff must stay reachable), their own record, and the PLAYER
 *           identities of their operable groups. Other groups' players are
 *           absent — memberships, user rows (emails) and player profiles
 *           (phone/email) alike. A dual-role member is visible as staff, but
 *           their PLAYING profile travels only where they play.
 *   WRITE — removing, archiving, permanently deleting or restoring a PLAYER
 *           requires operating that player's group; an unassigned player is
 *           club administration. Staff-target rules are unchanged here.
 *
 * All personal values below are fabricated sentinels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.igp.test';
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

const CLUB = 'club-igp';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18', WOM = 'grp-wom', U16 = 'grp-u16';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
    { id: U16, name: 'U16', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};
const ONE_GROUP = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = (...ids) => ({ clubWide: false, groups: ids.map(groupId => ({ groupId, status: 'active' })), teams: [] });

const MEMBERS = [
  { id: 'm-sen-a', teamId: CLUB, userId: 'u-sen-a', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen-b', teamId: CLUB, userId: 'u-sen-b', role: 'player', status: 'archived', playerGroupId: SEN },
  { id: 'm-u18-a', teamId: CLUB, userId: 'u-u18-a', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-u18-b', teamId: CLUB, userId: 'u-u18-b', role: 'player', status: 'archived', playerGroupId: U18 },
  { id: 'm-wom-a', teamId: CLUB, userId: 'u-wom-a', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm-lost',  teamId: CLUB, userId: 'u-lost',  role: 'player', status: 'active' },   // unassigned
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-two-coach', teamId: CLUB, userId: 'u-two-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN, U18) },
  // The unscoped-staff class the Members list must never lose: a club physio.
  { id: 'm-physio', teamId: CLUB, userId: 'u-physio', role: 'medical', status: 'active' },
  // Dual role: coaches U18, PLAYS Seniors — staff row everywhere, playing
  // profile only where they play.
  { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18), playerGroupId: SEN },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
];

const USERS = MEMBERS.map(m => ({
  id: m.userId, displayName: m.userId,
  email: `${m.userId}-EMAIL-SENTINEL@x.test`,
}));

const PROFILES = [
  { id: 'pp-sen-a', teamId: CLUB, userId: 'u-sen-a', displayName: 'Senior A', phone: 'SEN-PHONE-SENTINEL-A', email: 'sen-a-PROFILE-EMAIL@x.test' },
  { id: 'pp-u18-a', teamId: CLUB, userId: 'u-u18-a', displayName: 'U18 A', phone: 'U18-PHONE-SENTINEL-A' },
  { id: 'pp-wom-a', teamId: CLUB, userId: 'u-wom-a', displayName: 'Woman A', phone: 'WOM-PHONE-SENTINEL-A' },
  { id: 'pp-dual',  teamId: CLUB, userId: 'u-dual',  displayName: 'Dual Rôle', phone: 'DUAL-PHONE-SENTINEL' },
];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed(structure = STRUCTURE) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club IGP' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(USERS));
  kv.set('app:identity:player_profiles', JSON.stringify(PROFILES));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
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
const memberIds  = r => (r.body.team_members  || []).map(m => m.id).sort();
const profileIds = r => (r.body.player_profiles || []).map(p => p.id).sort();
const userIds    = r => (r.body.users || []).map(u => u.id).sort();
const kvMembers  = () => JSON.parse(kv.get('app:identity:team_members'));

const ALL_STAFF = ['m-admin', 'm-dual', 'm-physio', 'm-sen-coach', 'm-two-coach', 'm-u18-coach'];

// ── READ ────────────────────────────────────────────────────────────────────

test('READ — a U18-scoped coach gets all staff, U18 players, and no one else', async () => {
  await seed();
  const r = await call('u-u18-coach');
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 300));
  assert.deepEqual(memberIds(r), [...ALL_STAFF, 'm-u18-a', 'm-u18-b'].sort(),
    'staff + own-group players (archived own-group included for restore)');
  assert.deepEqual(profileIds(r), ['pp-u18-a'], 'only the U18 playing profile');
  const raw = JSON.stringify(r.body);
  assert.ok(raw.includes('U18-PHONE-SENTINEL-A'), 'own group\'s contact data intact');
  for (const leaked of ['SEN-PHONE-SENTINEL-A', 'WOM-PHONE-SENTINEL-A', 'DUAL-PHONE-SENTINEL',
                        'u-sen-a-EMAIL-SENTINEL', 'u-wom-a-EMAIL-SENTINEL', 'u-lost-EMAIL-SENTINEL',
                        'sen-a-PROFILE-EMAIL']) {
    assert.ok(!raw.includes(leaked), `${leaked} must be absent`);
  }
});

test('READ — the Seniors coach sees the dual-role member\'s profile, because they PLAY Seniors', async () => {
  await seed();
  const r = await call('u-sen-coach');
  assert.deepEqual(memberIds(r), [...ALL_STAFF, 'm-sen-a', 'm-sen-b'].sort());
  assert.deepEqual(profileIds(r), ['pp-dual', 'pp-sen-a'].sort());
  const raw = JSON.stringify(r.body);
  assert.ok(raw.includes('DUAL-PHONE-SENTINEL'), 'dual plays Seniors — profile visible here');
  assert.ok(!raw.includes('U18-PHONE-SENTINEL-A'));
  assert.ok(!raw.includes('u-u18-a-EMAIL-SENTINEL'));
});

test('READ — a two-group coach receives exactly the union', async () => {
  await seed();
  const r = await call('u-two-coach');
  assert.deepEqual(memberIds(r), [...ALL_STAFF, 'm-sen-a', 'm-sen-b', 'm-u18-a', 'm-u18-b'].sort());
  assert.ok(!JSON.stringify(r.body).includes('WOM-PHONE-SENTINEL-A'));
  assert.ok(!JSON.stringify(r.body).includes('u-lost-EMAIL-SENTINEL'), 'unassigned player is club administration');
});

test('READ — the club-wide admin keeps the complete member set', async () => {
  await seed();
  const r = await call('u-admin');
  assert.equal(r.body.team_members.length, MEMBERS.length);
  assert.equal(r.body.player_profiles.length, PROFILES.length);
  assert.equal(r.body.users.length, USERS.length);
  assert.equal(r.body.scoped, undefined, 'no scoping marker on the full read');
});

test('READ — forged group parameters do not broaden a scoped read', async () => {
  await seed();
  const plain  = await call('u-u18-coach');
  const forged = await call('u-u18-coach', {
    query: { group: SEN, groupId: SEN, selectedGroup: SEN },
    body: { group: SEN, groupId: SEN, selectedGroup: SEN },
  });
  assert.equal(forged.code, 200);
  assert.deepEqual(memberIds(forged), memberIds(plain));
  assert.deepEqual(profileIds(forged), profileIds(plain));
  assert.ok(!JSON.stringify(forged.body).includes('SEN-PHONE-SENTINEL-A'));
});

test('READ — the caller\'s own record always travels, and users cover exactly the kept members', async () => {
  await seed();
  const r = await call('u-u18-coach');
  const kept = new Set((r.body.team_members || []).map(m => m.userId));
  assert.ok(kept.has('u-u18-coach'), 'self present');
  assert.deepEqual(userIds(r), [...kept].sort(), 'one user row per kept member, none beyond');
});

test('READ — a one-group club is untouched: its scoped coach still receives everything', async () => {
  await seed(ONE_GROUP);
  const r = await call('u-sen-coach');
  assert.equal(r.body.team_members.length, MEMBERS.length, 'covers-the-club rule preserves legacy behaviour');
});

// ── WRITE ───────────────────────────────────────────────────────────────────

test('WRITE — archiving/removing a player needs their group: own group works, another\'s is refused', async () => {
  await seed();
  const cross = await call('u-u18-coach', { method: 'POST', body: { action: 'archive_member', memberId: 'm-sen-a' } });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.equal(kvMembers().find(m => m.id === 'm-sen-a').status, 'active', 'Seniors player untouched');

  const own = await call('u-u18-coach', { method: 'POST', body: { action: 'archive_member', memberId: 'm-u18-a' } });
  assert.equal(own.code, 200, JSON.stringify(own.body));
});

test('WRITE — permanent deletion of another group\'s player is refused before any confirmation logic', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST',
    body: { action: 'delete_member_permanently', memberId: 'm-sen-a', confirm: 'DELETE' } });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.ok(kvMembers().find(m => m.id === 'm-sen-a'), 'record still exists');
});

test('WRITE — restore follows the same boundary', async () => {
  await seed();
  const cross = await call('u-u18-coach', { method: 'POST', body: { action: 'restore_member', memberId: 'm-sen-b' } });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.equal(kvMembers().find(m => m.id === 'm-sen-b').status, 'archived');

  const own = await call('u-u18-coach', { method: 'POST', body: { action: 'restore_member', memberId: 'm-u18-b' } });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.equal(kvMembers().find(m => m.id === 'm-u18-b').status, 'active');
});

test('WRITE — an unassigned player is club administration: a scoped coach cannot remove them', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: { action: 'archive_member', memberId: 'm-lost' } });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(kvMembers().find(m => m.id === 'm-lost').status, 'active');
});

test('WRITE — group/access administration stays club-wide only (existing gates hold)', async () => {
  await seed();
  const move = await call('u-u18-coach', { method: 'POST',
    body: { action: 'set_player_group', memberId: 'm-sen-a', playerGroupId: U18 } });
  assert.equal(move.code, 403, JSON.stringify(move.body));
  const access = await call('u-u18-coach', { method: 'POST',
    body: { action: 'set_member_access', memberId: 'm-sen-a', role: 'coach' } });
  assert.equal(access.code, 403, JSON.stringify(access.body));
});

test('WRITE — the club-wide admin operates every group as before', async () => {
  await seed();
  const cross = await call('u-admin', { method: 'POST', body: { action: 'archive_member', memberId: 'm-wom-a' } });
  assert.equal(cross.code, 200, JSON.stringify(cross.body));
  const lost = await call('u-admin', { method: 'POST', body: { action: 'archive_member', memberId: 'm-lost' } });
  assert.equal(lost.code, 200, JSON.stringify(lost.body));
});
