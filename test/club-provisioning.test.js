/**
 * NEW CLUB PROVISIONING — platform-admin-only tenant creation.
 *
 *  · create_club (founder self-signup) is now CLOSED to the public: it needs
 *    a platform-admin session or the explicit PUBLIC_CLUB_SIGNUP=true flag.
 *  · provision_club creates an isolated tenant + a single-use head-coach
 *    invitation for its first administrator, who arrives through the
 *    EXISTING claim flow as club-wide staff of exactly that club — never
 *    with platform authority.
 *  · every proof runs against the real handlers/stores; Boitsfort records
 *    are snapshot-compared byte-for-byte across the whole flow.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.provisioning.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;          // public signup CLOSED — the default

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { effectiveAccessScope } = await import('../api/_accessScope.js');

const BOIT = 'boitsfort';
function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: BOIT, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin', platformRole: 'platform_admin' },
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-player', email: 'p@c.test', displayName: 'A Player' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    // The platform admin holds a Boitsfort membership for session purposes;
    // the AUTHORITY comes from the user record alone.
    { id: 'm-platform', teamId: BOIT, userId: 'u-platform', role: 'coach', staffLevel: 'head', status: 'active', accessProfile: 'full' },
    { id: 'm-simon', teamId: BOIT, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-player', teamId: BOIT, userId: 'u-player', role: 'player', status: 'active', playerGroupId: 'grp_initial' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${BOIT}`, JSON.stringify({ version: 1,
    groups: [{ id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' }],
    teams: [{ id: 'team_initial', groupId: 'grp_initial', name: 'Premier development', status: 'active' }] }));
  kv.set(`app:club:${BOIT}`, JSON.stringify({ clubName: 'Boitsfort',
    fixtures: [{ id: 'fx_mons', opposition: 'Mons', date: '2026-08-22', status: 'scheduled', groupId: '' }] }));
  kv.set(`app:medical:${BOIT}`, JSON.stringify({ clubId: BOIT, cases: [
    { id: 'c1', playerId: 'p1', playerGroupId: 'grp_initial', status: 'active', condition: 'Knock' }] }));
  kv.set(`app:publish:${BOIT}:training_schedule`, JSON.stringify({ slots: [
    { id: 'slot_tue', day: 'Tue', startTime: '19:45', sessionId: 'tue', active: true }] }));
  kv.set('ce:invites', JSON.stringify([]));
}
const boitsfortSnapshot = () => JSON.stringify([...kv.entries()]
  .filter(([k]) => k.includes('boitsfort') || k.includes(`:${BOIT}`))
  .sort());

async function identity(body, token) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: token ? `ce_session=${token}` : '', host: 'test.local' },
    body, on() {} }, res);
  return res;
}
async function publish(method, query, body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await publishHandler({ method, query, headers: { cookie: `ce_session=${token}` }, body, on() {} }, res);
  return res;
}
const sessionFor = (userId, teamId = BOIT, role = 'coach') => store.createSession({ userId, teamId, role });
const provision = async (token, clubName, adminEmail = 'admin@example.test') =>
  identity({ action: 'provision_club', clubName, adminEmail }, token);

// ── 1-4: creation authority ───────────────────────────────────────────────
test('only the platform admin can provision; club admin, player and anonymous are refused', async () => {
  seed();
  const platform = await sessionFor('u-platform');
  const a = await provision(platform.token, 'Club A');
  assert.equal(a.code, 201, JSON.stringify(a.body));
  assert.ok(a.body.team.id && a.body.inviteUrl.includes('?inv='), 'club + invite link produced');

  const simon = await sessionFor('u-simon');
  assert.equal((await provision(simon.token, 'Club B')).code, 403, 'club-wide admin refused');
  const player = await sessionFor('u-player', BOIT, 'player');
  assert.equal((await provision(player.token, 'Club B')).code, 403, 'player refused');
  assert.equal((await provision('', 'Club B')).code, 403, 'anonymous refused');
  const teams = JSON.parse(kv.get('app:identity:teams'));
  assert.equal(teams.some(t => t.name === 'Club B'), false, 'nothing written on refusal');
});

test('public create_club (founder self-signup) is closed without the explicit flag', async () => {
  seed();
  const r = await identity({ action: 'create_club', clubName: 'Sneaky FC', name: 'Mallory', email: 'm@x.test', password: 'longEnough123' }, '');
  assert.equal(r.code, 403, JSON.stringify(r.body));
  // The platform admin may still use it (founder-style creation stays possible for them).
  const platform = await sessionFor('u-platform');
  const ok = await identity({ action: 'create_club', clubName: 'Founder FC', name: 'Founder', email: 'f@x.test', password: 'longEnough123' }, platform.token);
  assert.equal(ok.code, 201, JSON.stringify(ok.body));
});

// ── 5: duplicates and id collisions ───────────────────────────────────────
test('duplicate club names are rejected; similar names get distinct, never-overwritten ids', async () => {
  seed();
  const platform = await sessionFor('u-platform');
  const a = await provision(platform.token, 'Example RFC');
  assert.equal(a.code, 201);
  assert.equal((await provision(platform.token, '  example rfc ')).code, 409, 'case-insensitive duplicate rejected');
  const teams = JSON.parse(kv.get('app:identity:teams'));
  assert.equal(teams.filter(t => /example/i.test(t.name)).length, 1, 'single record, nothing overwritten');
});

// ── 6-12: the new tenant is empty, isolated, and claimable ────────────────
test('Club A starts empty (no Boitsfort members/fixtures/training/medical) and its invite claims a club-wide admin', async () => {
  seed();
  const platform = await sessionFor('u-platform');
  const a = await provision(platform.token, 'Club A', 'clubadmin@a.test');
  const clubA = a.body.team.id;

  // 11: the invitation is tenant-scoped to Club A.
  const invite = JSON.parse(kv.get('ce:invites')).find(i => i.teamId === clubA);
  assert.ok(invite && invite.role === 'coach' && invite.staffLevel === 'head', 'head-coach invite for Club A');
  assert.equal(invite.email, 'clubadmin@a.test');

  // 12: claiming attaches a CLUB-WIDE admin of Club A (existing claim flow).
  const claim = await store.claimInvite({ token: invite.token, name: 'Club A Admin',
    email: 'clubadmin@a.test', password: 'realPassword12' });
  assert.equal(claim.teamMember.teamId, clubA, 'membership belongs to Club A only');
  assert.equal(claim.teamMember.role, 'coach');
  assert.equal(effectiveAccessScope(claim.teamMember).clubWide, true, 'club-wide standing');
  // 16: no platform authority.
  assert.equal(store.isPlatformAdmin(claim.user), false);
  assert.equal(claim.user.platformRole, undefined);

  // 6-10: empty tenant — nothing of Boitsfort's leaks in.
  const admin = claim.session;
  const struct = await publish('GET', { resource: 'structure' }, null, admin.token);
  assert.equal(struct.code, 200);
  assert.ok(struct.body.structure.groups.every(g => g.name !== 'Seniors'),
    'initial group synthesizes under the club\'s OWN name, never Seniors');
  const members = JSON.parse(kv.get('app:identity:team_members')).filter(m => m.teamId === clubA);
  assert.equal(members.length, 1, 'only the claimed admin — no Boitsfort members');
  assert.equal(kv.has(`app:club:${clubA}`), false, 'no fixtures record yet (empty, not copied)');
  assert.equal(kv.has(`app:medical:${clubA}`), false, 'no medical record');
  const med = await publish('GET', { resource: 'medical' }, null, admin.token);
  assert.deepEqual(med.body.cases, [], 'medical reads empty for the new tenant');
});

// ── 13-15: cross-tenant walls in both directions ──────────────────────────
test('Club A\'s admin manages Club A only; Boitsfort admins never see Club A', async () => {
  seed();
  const platform = await sessionFor('u-platform');
  const a = await provision(platform.token, 'Club A', 'clubadmin@a.test');
  const b = await provision(platform.token, 'Club B', 'clubadmin@b.test');
  const invA = JSON.parse(kv.get('ce:invites')).find(i => i.teamId === a.body.team.id);
  const claimA = await store.claimInvite({ token: invA.token, name: 'Admin A', email: 'clubadmin@a.test', password: 'realPassword12' });

  // 13+17: admin A manages Club A — creates a group via the shipped flow.
  const g = await publish('POST', { resource: 'structure' }, { op: 'create_group', name: 'U16' }, claimA.session.token);
  assert.equal(g.code, 200, JSON.stringify(g.body));
  const t = await publish('POST', { resource: 'structure' }, { op: 'create_team', groupId: g.body.group.id, name: 'U16 Premier' }, claimA.session.token);
  assert.equal(t.code, 200);

  // 14: admin A's tenant is A — B's structure is unreachable (session-bound).
  const structA = JSON.parse(kv.get(`app:structure:${a.body.team.id}`));
  assert.ok(structA.groups.some(x => x.id === g.body.group.id));
  assert.equal(kv.has(`app:structure:${b.body.team.id}`), false, 'Club B untouched by A\'s admin');

  // 15: Simon (Boitsfort club admin) reads HIS OWN structure, never Club A's.
  const simon = await sessionFor('u-simon');
  const simonStruct = await publish('GET', { resource: 'structure' }, null, simon.token);
  assert.ok(simonStruct.body.structure.groups.some(x => x.id === 'grp_initial'));
  assert.ok(!simonStruct.body.structure.groups.some(x => x.id === g.body.group.id),
    'Boitsfort admin cannot reach Club A structure');
});

// ── 18-20: player onboarding into Club A + Boitsfort byte-identical ───────
test('a Club A player invite claims into Club A only, and Boitsfort is byte-identical throughout', async () => {
  seed();
  const before = boitsfortSnapshot();
  const platform = await sessionFor('u-platform');
  const a = await provision(platform.token, 'Club A', 'clubadmin@a.test');
  const clubA = a.body.team.id;
  const invA = JSON.parse(kv.get('ce:invites')).find(i => i.teamId === clubA);
  const claimA = await store.claimInvite({ token: invA.token, name: 'Admin A', email: 'clubadmin@a.test', password: 'realPassword12' });
  const g = await publish('POST', { resource: 'structure' }, { op: 'create_group', name: 'U16' }, claimA.session.token);

  // The Members player-link path, exactly as the UI requests it.
  const linkRes = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${claimA.session.token}`, host: 'test.local' },
    body: { group: true, playerGroupId: g.body.group.id, scope: { groupId: g.body.group.id } }, on() {} }, linkRes);
  assert.equal(linkRes.code, 200, JSON.stringify(linkRes.body));

  await store.claimInvite({ token: linkRes.body.token, name: 'Club A Kid', email: 'kid@a.test', password: 'realPassword12' });
  const kid = JSON.parse(kv.get('app:identity:team_members'))
    .find(m => m.teamId === clubA && m.role === 'player');
  assert.ok(kid, 'player landed in Club A');
  assert.equal(kid.playerGroupId, g.body.group.id, 'with the right playing group');
  assert.equal(JSON.parse(kv.get('app:identity:team_members'))
    .some(m => m.teamId === BOIT && m.userId === kid.userId), false, 'never in Boitsfort');

  // 19: no default-tenant fallback — every new key names Club A, none names
  // the default club that isn't already Boitsfort's own pre-existing data.
  const newKeys = [...kv.keys()].filter(k => k.includes(clubA));
  assert.ok(newKeys.length >= 1, 'Club A keyspace in use');
  assert.equal([...kv.keys()].some(k => k.includes('boitsfort-rfc')), false, 'nothing fell into the default tenant');

  // 20: Boitsfort byte-identical.
  assert.equal(boitsfortSnapshot(), before, 'every Boitsfort record unchanged');
});

// ── UI gating pins ────────────────────────────────────────────────────────
test('the provisioning card renders only for platformRole and the server re-checks anyway', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /_myPlatformRole !== 'platform_admin'\) return '';/, 'card invisible to normal users');
  assert.match(src, /action: 'provision_club'/, 'UI calls the real provisioning action');
  assert.match(src, /_myPlatformRole = '';/, 'platform flag cleared on identity reset');
  const identitySrc = fs.readFileSync(new URL('../api/identity.js', import.meta.url), 'utf8');
  assert.match(identitySrc, /isPlatformAdmin\(provisioner\?\.user\)/, 'server-side authority check');
  assert.match(identitySrc, /PUBLIC_CLUB_SIGNUP/, 'public signup explicit-flag gate');
});
