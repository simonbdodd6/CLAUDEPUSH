/**
 * RC4.7 — player eligibility defaults, Medical access, registration and the
 * derived profile values.
 *
 * Eligibility defaults are a READ-TIME derivation: a player with no explicit
 * selection resolves to every active team in the groups they belong to, so a
 * Seniors player is pickable for Premier and Premier Development without any
 * migration and without overwriting an admin's explicit choices.
 *
 * Medical is an additive permission on the SAME membership — a person can be a
 * player and a physio at once, keeping their profile and eligibility, and
 * gaining nothing but the Medical page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.player-defaults.test';
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
const {
  resolveEligibility, eligibleTeams, effectiveAccessScope, effectiveEligibility,
} = await import('../api/_accessScope.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const CLUB = 'boitsfort-rugby-club';

// The live Boitsfort shape: one Seniors group with two selectable squads.
const STRUCTURE = {
  version: 1,
  groups: [
    { id: 'grp-seniors', name: 'Seniors', type: 'general', status: 'active' },
    { id: 'grp-u18', name: 'U18', type: 'age-grade', status: 'active' },
    { id: 'grp-old', name: 'Veterans', type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 'team-premier', groupId: 'grp-seniors', name: 'Premier', status: 'active' },
    { id: 'team-prem-dev', groupId: 'grp-seniors', name: 'Premier Development', status: 'active' },
    { id: 'team-retired', groupId: 'grp-seniors', name: 'Old Boys', status: 'archived' },
    { id: 'team-u18', groupId: 'grp-u18', name: 'U18', status: 'active' },
  ],
};

const groupScope = (...ids) => ({ clubWide: false, groups: ids.map(groupId => ({ groupId, status: 'active' })), teams: [] });
const teamScope = (...ids) => ({ clubWide: false, groups: [], teams: ids.map(teamId => ({ teamId, status: 'active' })) });

// D1a — a player's group is now EXPLICIT (playerGroupId), never inferred from
// staff access scope. Fixtures declare it directly.
const player = over => ({ id: 'tm-p', teamId: CLUB, userId: 'u-p', role: 'player', status: 'active',
  playerGroupId: 'grp-seniors', ...over });

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort Rugby Club', teamName: 'Seniors' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-owner', email: 'owner@club.test', displayName: 'Owner' },
    { id: 'u-physio', email: 'physio@club.test', displayName: 'Player Physio' },
    { id: 'u-plain', email: 'plain@club.test', displayName: 'Plain Player' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
    // D1a — players declare where they PLAY explicitly; accessScope stays as
    // their (separate) staff access.
    { id: 'tm-physio', teamId: CLUB, userId: 'u-physio', role: 'player', status: 'active',
      playerGroupId: 'grp-seniors', accessScope: groupScope('grp-seniors') },
    { id: 'tm-plain', teamId: CLUB, userId: 'u-plain', role: 'player', status: 'active',
      playerGroupId: 'grp-seniors', accessScope: groupScope('grp-seniors') },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([
    { id: 'pr-physio', teamMemberId: 'tm-physio', teamId: CLUB, userId: 'u-physio',
      displayName: 'Player Physio', legacyPlayerId: 'inv-physio' },
    { id: 'pr-plain', teamMemberId: 'tm-plain', teamId: CLUB, userId: 'u-plain',
      displayName: 'Plain Player', legacyPlayerId: 'inv-plain' },
  ]));
}

async function tokenFor(userId, role = 'coach') {
  const { token } = await store.createSession({ userId, teamId: CLUB, role });
  return token;
}
function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end() { return this; },
  };
}
const act = async (token, body) => {
  const res = buildRes();
  await identityHandler({
    method: 'POST', url: '/api/identity', query: {}, body, on() {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}` },
  }, res);
  return res;
};
const memberById = id => JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === id);

test.beforeEach(() => seed());

// ── PLAYER ELIGIBILITY DEFAULTS ────────────────────────────────────────────
test('a Seniors player with no explicit eligibility defaults to Premier + Premier Development', () => {
  const elig = resolveEligibility(player({ accessScope: groupScope('grp-seniors') }), STRUCTURE);
  assert.deepEqual(elig.teamIds.sort(), ['team-prem-dev', 'team-premier']);
  assert.equal(elig.derived, true, 'flagged as a default, not a stored choice');
  assert.ok(elig.primaryTeamId, 'a primary squad is offered');
});

test('archived teams are never added automatically', () => {
  const elig = resolveEligibility(player({ accessScope: groupScope('grp-seniors') }), STRUCTURE);
  assert.equal(elig.teamIds.includes('team-retired'), false, 'archived squad excluded');
  // …and an archived GROUP contributes nothing either.
  const vets = resolveEligibility(player({ playerGroupId: 'grp-old', accessScope: groupScope('grp-old') }), STRUCTURE);
  assert.deepEqual(vets.teamIds, []);
});

test('stored eligibility no longer restricts — the GROUP rule is authoritative', () => {
  // Shared-squad model: honouring a stored per-player list is exactly how one
  // Seniors team showed 0 eligible while its sibling held the whole squad.
  // The list stays in storage but can only express a primary preference now.
  const explicit = player({
    accessScope: groupScope('grp-seniors'),
    playerEligibility: { teamIds: ['team-premier'], primaryTeamId: 'team-premier' },
  });
  const elig = resolveEligibility(explicit, STRUCTURE);
  assert.deepEqual(elig.teamIds.sort(), ['team-prem-dev', 'team-premier'],
    'the whole group pool, regardless of the stored list');
  assert.equal(elig.primaryTeamId, 'team-premier', 'the in-group primary preference survives');
  assert.equal(elig.derived, true, 'and it is a derivation, not a stored choice');
  // An explicitly EMPTY stored selection cannot suppress the group rule either.
  const none = player({ accessScope: groupScope('grp-seniors'), playerEligibility: { teamIds: [] } });
  assert.deepEqual(resolveEligibility(none, STRUCTURE).teamIds.sort(),
    ['team-prem-dev', 'team-premier']);
});

test('defaults never cross a group or club boundary', () => {
  const u18 = resolveEligibility(player({ playerGroupId: 'grp-u18', accessScope: groupScope('grp-u18') }), STRUCTURE);
  assert.deepEqual(u18.teamIds, ['team-u18'], 'U18 player gets U18 only');
  assert.equal(u18.teamIds.includes('team-premier'), false);
  // A grant naming another club's group resolves to nothing here.
  const foreign = resolveEligibility(player({ playerGroupId: 'grp-of-another-club' }), STRUCTURE);
  assert.deepEqual(foreign.teamIds, []);
  // D1a — team-only STAFF access no longer confers playing eligibility. Where
  // someone coaches is not where they play.
  const teamOnly = resolveEligibility(
    { id: 'tm-x', teamId: CLUB, userId: 'u-x', role: 'coach', staffLevel: 'head', status: 'active',
      accessScope: teamScope('team-prem-dev') }, STRUCTURE);
  assert.deepEqual(teamOnly.teamIds, [], 'coaching a team does not make you a player in it');
});

test('primary squad stays independent of eligibility, and staff derive none', () => {
  const p = player({ accessScope: groupScope('grp-seniors'),
    playerEligibility: { teamIds: ['team-premier', 'team-prem-dev'], primaryTeamId: 'team-prem-dev' } });
  assert.equal(resolveEligibility(p, STRUCTURE).primaryTeamId, 'team-prem-dev',
    'primary is a separate stored choice');
  const coach = { id: 'tm-c', teamId: CLUB, userId: 'u-c', role: 'coach', staffLevel: 'head',
    status: 'active', accessScope: groupScope('grp-seniors') };
  assert.deepEqual(resolveEligibility(coach, STRUCTURE).teamIds, [], 'staff never derive eligibility');
  assert.deepEqual(eligibleTeams(coach, STRUCTURE), []);
});

test('the derivation writes nothing — it is display-only', () => {
  const before = kv.get('app:identity:team_members');
  resolveEligibility(player({ accessScope: groupScope('grp-seniors') }), STRUCTURE);
  assert.equal(kv.get('app:identity:team_members'), before, 'storage untouched');
});

// ── MEDICAL ACCESS ─────────────────────────────────────────────────────────
test('a player gains Medical access without losing player state', async () => {
  const owner = await tokenFor('u-owner');
  const res = await act(owner, { action: 'set_medical_access', memberId: 'tm-physio', medicalAccess: true });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));

  const m = memberById('tm-physio');
  assert.equal(m.medicalAccess, true);
  assert.equal(m.role, 'player', 'still a player');
  assert.equal(permissionsFor(m).has(PERM.MEDICAL_ACCESS), true, 'medical granted');
  // Player state intact.
  const profiles = JSON.parse(kv.get('app:identity:player_profiles'));
  assert.equal(profiles.filter(p => p.userId === 'u-physio').length, 1, 'player profile intact');
  assert.deepEqual(resolveEligibility(m, STRUCTURE).teamIds.sort(),
    ['team-prem-dev', 'team-premier'], 'eligibility intact');
  // ONE identity, ONE membership.
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.filter(x => x.userId === 'u-physio').length, 1);
});

test('Medical access grants nothing beyond the Medical page', async () => {
  const owner = await tokenFor('u-owner');
  await act(owner, { action: 'set_medical_access', memberId: 'tm-physio', medicalAccess: true });
  const perms = permissionsFor(memberById('tm-physio'));
  assert.equal(perms.has(PERM.MEDICAL_ACCESS), true);
  for (const denied of [PERM.MANAGE_TEAMS, PERM.ASSIGN_ACCESS, PERM.MANAGE_COACHES,
                        PERM.MANAGE_PLAYERS, PERM.PUBLISH_SQUADS, PERM.DANGER_ZONE]) {
    assert.equal(perms.has(denied), false, `must not grant ${denied}`);
  }
  // Scope is unchanged — medical does not widen where they can reach.
  assert.deepEqual(effectiveAccessScope(memberById('tm-physio')).groups.map(g => g.groupId),
    ['grp-seniors']);
});

test('Medical access can be removed without touching player state', async () => {
  const owner = await tokenFor('u-owner');
  await act(owner, { action: 'set_medical_access', memberId: 'tm-physio', medicalAccess: true });
  const off = await act(owner, { action: 'set_medical_access', memberId: 'tm-physio', medicalAccess: false });
  assert.equal(off.statusCode, 200);

  const m = memberById('tm-physio');
  assert.equal(m.medicalAccess, false);
  assert.equal(permissionsFor(m).has(PERM.MEDICAL_ACCESS), false, 'medical withdrawn');
  assert.equal(m.role, 'player', 'still a player');
  assert.equal(m.status, 'active', 'membership intact');
  assert.equal(JSON.parse(kv.get('app:identity:player_profiles'))
    .filter(p => p.userId === 'u-physio').length, 1, 'player profile survives');
});

test('an ordinary player has no medical access, and cannot grant it', async () => {
  assert.equal(permissionsFor(memberById('tm-plain')).has(PERM.MEDICAL_ACCESS), false);
  const playerToken = await tokenFor('u-plain', 'player');
  const res = await act(playerToken, { action: 'set_medical_access', memberId: 'tm-plain', medicalAccess: true });
  assert.equal(res.statusCode, 403, JSON.stringify(res.body));
  assert.notEqual(memberById('tm-plain').medicalAccess, true, 'self-grant refused');
});

test('a scope-limited coach cannot hand out Medical access', async () => {
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'tm-sc', teamId: CLUB, userId: 'u-sc', role: 'coach', staffLevel: 'head',
    status: 'active', accessScope: groupScope('grp-seniors') });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const users = JSON.parse(kv.get('app:identity:users'));
  users.push({ id: 'u-sc', email: 'sc@club.test', displayName: 'Scoped Coach' });
  kv.set('app:identity:users', JSON.stringify(users));

  const res = await act(await tokenFor('u-sc'), {
    action: 'set_medical_access', memberId: 'tm-plain', medicalAccess: true });
  assert.equal(res.statusCode, 403, 'club-wide administration required');
});

// ── DUAL ROLE + eligibility interplay ──────────────────────────────────────
test('a medical-enabled player keeps eligibility after also becoming staff', async () => {
  const owner = await tokenFor('u-owner');
  await act(owner, { action: 'set_medical_access', memberId: 'tm-physio', medicalAccess: true });
  await act(owner, { action: 'set_member_eligibility', memberId: 'tm-physio',
    teamIds: ['team-premier', 'team-prem-dev'], primaryTeamId: 'team-premier' });
  await act(owner, { action: 'set_member_access', memberId: 'tm-physio', role: 'coach', staffLevel: 'assistant' });

  const m = memberById('tm-physio');
  assert.equal(m.role, 'coach', 'now staff');
  assert.equal(m.medicalAccess, true, 'medical retained');
  assert.deepEqual(effectiveEligibility(m).teamIds, ['team-premier', 'team-prem-dev'],
    'squad eligibility survives the role change');
  assert.equal(JSON.parse(kv.get('app:identity:player_profiles'))
    .filter(p => p.userId === 'u-physio').length, 1, 'player profile survives');
});
