/**
 * RC4.7 Phase C — member access administration (identity actions).
 *
 * set_member_access / set_member_eligibility / remove_member_scope: club-wide
 * administrators only, every id validated against the club structure, archived
 * targets rejected, the owner unmovable from whole-club access, identity and
 * history always preserved. ACCESS and ELIGIBILITY stay strictly separate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.member-access.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const store = await import('../api/_identityStore.js');
const { effectiveAccessScope, effectiveEligibility } = await import('../api/_accessScope.js');

const CLUB = 'boitsfort-rugby-club';
const OTHER_CLUB = 'other-rfc';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: 'grp-senior-men', name: 'Senior Men', type: 'general', status: 'active' },
    { id: 'grp-u18', name: 'U18', type: 'age-grade', status: 'active' },
    { id: 'grp-old', name: 'Veterans', type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 'team-senior-1', groupId: 'grp-senior-men', name: 'Senior 1', status: 'active' },
    { id: 'team-senior-2', groupId: 'grp-senior-men', name: 'Senior 2', status: 'active' },
    { id: 'team-u18', groupId: 'grp-u18', name: 'U18', status: 'active' },
    { id: 'team-retired', groupId: 'grp-senior-men', name: 'Old Boys', status: 'archived' },
  ],
};

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Boitsfort Rugby Club', teamName: 'Seniors' },
    { id: OTHER_CLUB, name: 'Other RFC' },
  ]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-owner', email: 'owner@club.test', displayName: 'Owner' },
    { id: 'u-coach', email: 'coach@club.test', displayName: 'Coach' },
    { id: 'u-coach2', email: 'admin2@club.test', displayName: 'Second Admin' },
    { id: 'u-player', email: 'player@club.test', displayName: 'Player' },
    { id: 'u-foreign', email: 'foreign@other.test', displayName: 'Foreign' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'tm-admin2', teamId: CLUB, userId: 'u-coach2', role: 'admin', status: 'active', accessProfile: 'full' },
    { id: 'tm-coach', teamId: CLUB, userId: 'u-coach', role: 'coach', staffLevel: 'head', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } },
    { id: 'tm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'grp-senior-men', status: 'active' }], teams: [] },
      playerEligibility: { teamIds: ['team-senior-1'], primaryTeamId: 'team-senior-1' } },
    { id: 'tm-foreign', teamId: OTHER_CLUB, userId: 'u-foreign', role: 'player', status: 'active' },
  ]));
}

async function sessionFor(userId, role = 'coach') {
  const { token } = await store.createSession({ userId, teamId: CLUB, role });
  return token;
}

function buildReq(body, token) {
  return {
    method: 'POST', url: '/api/identity',
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}` },
    query: {}, body, on() {},
  };
}

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

const act = async (token, body) => {
  const res = buildRes();
  await identityHandler(buildReq(body, token), res);
  return res;
};

const memberById = id =>
  JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === id);

let ownerToken, coachToken;
test.beforeEach(async () => {
  seed();
  ownerToken = await sessionFor('u-owner');
  coachToken = await sessionFor('u-coach');
});

// ── Access editing ──────────────────────────────────────────────────────────
test('change club role: coach becomes medical, then back — no duplicate user', async () => {
  const res = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach', role: 'medical' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(memberById('tm-coach').role, 'medical');
  assert.equal(memberById('tm-coach').staffLevel, undefined, 'staffLevel cleared for non-coach roles');

  await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach', role: 'coach', staffLevel: 'assistant' });
  assert.equal(memberById('tm-coach').role, 'coach');
  assert.equal(memberById('tm-coach').staffLevel, 'assistant');

  const users = JSON.parse(kv.get('app:identity:users'));
  assert.equal(users.filter(u => u.id === 'u-coach').length, 1, 'one identity throughout');
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.filter(m => m.userId === 'u-coach').length, 1, 'one membership throughout');
});

test('change scoped access: move a coach from U18 to Senior Men + Senior 1 role override', async () => {
  const res = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach',
    accessScope: { clubWide: false,
      groups: [{ groupId: 'grp-senior-men', status: 'active' }],
      teams: [{ teamId: 'team-senior-1', role: 'manager', status: 'active' }] } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const scope = effectiveAccessScope(memberById('tm-coach'));
  assert.deepEqual(scope.groups.filter(g => g.status === 'active').map(g => g.groupId), ['grp-senior-men']);
  assert.equal(scope.teams[0].role, 'manager', 'per-scope role stored');
});

test('grants naming archived or unknown scopes are rejected before saving', async () => {
  const archived = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach',
    accessScope: { clubWide: false, groups: [{ groupId: 'grp-old', status: 'active' }], teams: [] } });
  assert.equal(archived.statusCode, 400);
  assert.match(archived.body.error, /archived/);

  const archivedTeam = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach',
    accessScope: { clubWide: false, groups: [], teams: [{ teamId: 'team-retired', status: 'active' }] } });
  assert.equal(archivedTeam.statusCode, 400);

  const unknown = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach',
    accessScope: { clubWide: false, groups: [{ groupId: 'grp-nope', status: 'active' }], teams: [] } });
  assert.equal(unknown.statusCode, 404);

  // Nothing changed on the member.
  const scope = effectiveAccessScope(memberById('tm-coach'));
  assert.deepEqual(scope.groups.map(g => g.groupId), ['grp-u18'], 'original scope intact');
});

test('a scoped coach cannot edit access at all (403), even their own', async () => {
  for (const body of [
    { action: 'set_member_access', memberId: 'tm-player', role: 'coach' },
    { action: 'set_member_access', memberId: 'tm-coach',
      accessScope: { clubWide: true, groups: [], teams: [] } },
    { action: 'remove_member_scope', memberId: 'tm-player', groupId: 'grp-senior-men' },
  ]) {
    const res = await act(coachToken, body);
    assert.equal(res.statusCode, 403, JSON.stringify(res.body));
  }
});

test('cross-club edits are rejected — a member of another club is unreachable', async () => {
  const res = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-foreign', role: 'coach' });
  assert.ok([403, 404].includes(res.statusCode), `got ${res.statusCode}`);
  assert.equal(memberById('tm-foreign').role, 'player', 'foreign membership untouched');
});

test('the owner cannot be demoted from whole-club access', async () => {
  const roleChange = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-owner', role: 'player' });
  assert.equal(roleChange.statusCode, 400);
  assert.match(roleChange.body.error, /owner/i);

  const scopeChange = await act(ownerToken, { action: 'set_member_access', memberId: 'tm-owner',
    accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } });
  assert.equal(scopeChange.statusCode, 400);
  assert.match(scopeChange.body.error, /whole-club access/);
  assert.equal(effectiveAccessScope(memberById('tm-owner')).clubWide, true, 'owner stays club-wide');
});

test('the last full-access administrator cannot be role-changed away', async () => {
  // The guard protects ROLE-DERIVED full access: an explicit accessProfile
  // survives a role change (its removal is separately guarded in
  // set_access_profile), so model the last admin as role-derived full —
  // role 'admin' with no explicit profile, and no other full holder.
  // tm-coach must not count either: a HEAD coach derives full under the
  // RC4.9C compatibility matrix, so demote them to assistant (derives 'coach').
  const members = JSON.parse(kv.get('app:identity:team_members'))
    .filter(m => m.id !== 'tm-owner')
    .map(m => m.id === 'tm-admin2' ? { ...m, accessProfile: undefined }
            : m.id === 'tm-coach' ? { ...m, staffLevel: 'assistant' } : m);
  kv.set('app:identity:team_members', JSON.stringify(members));
  const adminToken = await sessionFor('u-coach2', 'admin');
  const res = await act(adminToken, { action: 'set_member_access', memberId: 'tm-admin2', role: 'player' });
  assert.equal(res.statusCode, 400, JSON.stringify(res.body));
  assert.match(res.body.error, /last full-access administrator/);
  assert.equal(memberById('tm-admin2').role, 'admin', 'role unchanged');
});

test('an explicit full profile survives a role change — the club stays administrable', async () => {
  // tm-admin2 carries explicit accessProfile 'full': changing their ROLE is
  // allowed even when they are the only admin, because the profile (and with
  // it, full capability) remains until set_access_profile changes it.
  const members = JSON.parse(kv.get('app:identity:team_members'))
    .filter(m => m.id !== 'tm-owner');
  kv.set('app:identity:team_members', JSON.stringify(members));
  const adminToken = await sessionFor('u-coach2', 'admin');
  const res = await act(adminToken, { action: 'set_member_access', memberId: 'tm-admin2', role: 'coach', staffLevel: 'head' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(memberById('tm-admin2').accessProfile, 'full', 'explicit profile retained');
});

// ── Eligibility (never permissions) ─────────────────────────────────────────
test('update eligibility + primary team; eligibility grants no capability', async () => {
  const res = await act(ownerToken, { action: 'set_member_eligibility', memberId: 'tm-player',
    teamIds: ['team-senior-1', 'team-senior-2'], primaryTeamId: 'team-senior-2' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const elig = effectiveEligibility(memberById('tm-player'));
  assert.deepEqual(elig.teamIds, ['team-senior-1', 'team-senior-2']);
  assert.equal(elig.primaryTeamId, 'team-senior-2');
  // Permissions unchanged: still a player, still no staff capability.
  assert.equal(memberById('tm-player').role, 'player');
  const scope = effectiveAccessScope(memberById('tm-player'));
  assert.equal(scope.clubWide, false);
  assert.deepEqual(scope.teams, [], 'eligibility did NOT create access grants');
});

test('remove eligibility entirely', async () => {
  const res = await act(ownerToken, { action: 'set_member_eligibility', memberId: 'tm-player',
    teamIds: [], primaryTeamId: null });
  assert.equal(res.statusCode, 200);
  const elig = effectiveEligibility(memberById('tm-player'));
  assert.deepEqual(elig.teamIds, []);
  assert.equal(elig.primaryTeamId, null);
});

test('eligibility for archived or unknown teams is rejected', async () => {
  const archived = await act(ownerToken, { action: 'set_member_eligibility', memberId: 'tm-player',
    teamIds: ['team-retired'] });
  assert.equal(archived.statusCode, 400);
  const unknown = await act(ownerToken, { action: 'set_member_eligibility', memberId: 'tm-player',
    teamIds: ['team-nope'] });
  assert.equal(unknown.statusCode, 404);
});

// ── Safe removal ────────────────────────────────────────────────────────────
test('remove one scoped grant: soft removal, history kept, identity preserved', async () => {
  await act(ownerToken, { action: 'set_member_access', memberId: 'tm-coach',
    accessScope: { clubWide: false,
      groups: [{ groupId: 'grp-u18', status: 'active' }, { groupId: 'grp-senior-men', status: 'active' }],
      teams: [] } });
  const res = await act(ownerToken, { action: 'remove_member_scope', memberId: 'tm-coach', groupId: 'grp-u18' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));

  const member = memberById('tm-coach');
  assert.equal(member.status, 'active', 'membership survives');
  const raw = member.accessScope;
  assert.equal(raw.groups.find(g => g.groupId === 'grp-u18')?.status, 'removed', 'historical grant kept as removed');
  const scope = effectiveAccessScope(member);
  assert.deepEqual(scope.groups.filter(g => g.status === 'active').map(g => g.groupId), ['grp-senior-men']);
  assert.equal(JSON.parse(kv.get('app:identity:users')).some(u => u.id === 'u-coach'), true, 'user identity intact');
});

test('deactivate + restore membership preserves scoped grants and history', async () => {
  const before = effectiveAccessScope(memberById('tm-coach'));
  const arch = await act(ownerToken, { action: 'archive_member', memberId: 'tm-coach' });
  assert.equal(arch.statusCode, 200, JSON.stringify(arch.body));
  assert.notEqual(memberById('tm-coach').status, 'active', 'deactivated');
  assert.equal(effectiveAccessScope(memberById('tm-coach')).clubWide, false);
  assert.deepEqual(effectiveAccessScope(memberById('tm-coach')).groups, [], 'no scope while inactive');

  const back = await act(ownerToken, { action: 'restore_member', memberId: 'tm-coach' });
  assert.equal(back.statusCode, 200, JSON.stringify(back.body));
  assert.equal(memberById('tm-coach').status, 'active');
  assert.deepEqual(effectiveAccessScope(memberById('tm-coach')), before, 'grants restored intact');
});
