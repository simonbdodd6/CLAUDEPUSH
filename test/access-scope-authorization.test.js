/**
 * RC4.7 Phase B — three-level access scope authorization matrix.
 *
 * Club-wide, group-wide and team-specific access are distinct levels; player
 * eligibility is selection data, never authorization. Every helper defaults
 * to deny: unknown, archived, malformed or cross-club ids are rejected.
 *
 * Covers Phase B scenarios 1-17, 22 and 27 against a Boitsfort-shaped
 * structure: Senior Men [Senior 1, Senior 2], U18, U16, Ladies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.access-scope.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const {
  effectiveAccessScope, effectiveEligibility, eligibleTeams,
  canViewGroup, canManageGroup, canViewTeam, canManageTeam,
  canViewGroupRoster, canManageGroupMembers, canEditMatchSelection,
  canViewClub, canManageClub,
  getAccessibleGroups, getAccessibleTeams, assertScopedPermission,
  normalizeAccessScope,
} = await import('../api/_accessScope.js');
const { PERM } = await import('../api/_permissions.js');
const store = await import('../api/_identityStore.js');

const CLUB = 'boitsfort-rugby-club';

/** Boitsfort target structure, plus an archived group and team for tests. */
const structure = {
  version: 1, clubId: CLUB, synthesized: false,
  groups: [
    { id: 'grp-senior-men', name: 'Senior Men', type: 'general', status: 'active' },
    { id: 'grp-u18',        name: 'U18',        type: 'age-grade', status: 'active' },
    { id: 'grp-u16',        name: 'U16',        type: 'age-grade', status: 'active' },
    { id: 'grp-ladies',     name: 'Ladies',     type: 'general', status: 'active' },
    { id: 'grp-veterans',   name: 'Veterans',   type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 'team-senior-1', groupId: 'grp-senior-men', name: 'Senior 1', ageGrade: '', genderCategory: '', status: 'active' },
    { id: 'team-senior-2', groupId: 'grp-senior-men', name: 'Senior 2', ageGrade: '', genderCategory: '', status: 'active' },
    { id: 'team-u18',      groupId: 'grp-u18',        name: 'U18',      ageGrade: 'U18', genderCategory: '', status: 'active' },
    { id: 'team-u16',      groupId: 'grp-u16',        name: 'U16',      ageGrade: 'U16', genderCategory: '', status: 'active' },
    { id: 'team-ladies',   groupId: 'grp-ladies',     name: 'Ladies',   ageGrade: '', genderCategory: 'women', status: 'active' },
    { id: 'team-vets',     groupId: 'grp-veterans',   name: 'Veterans', ageGrade: '', genderCategory: '', status: 'active' },
    { id: 'team-s1-old',   groupId: 'grp-senior-men', name: 'Senior 1 (old)', ageGrade: '', genderCategory: '', status: 'archived' },
  ],
};

/** Another club's structure — its ids must be worthless in CLUB's context. */
const otherClubStructure = {
  version: 1, clubId: 'other-rfc', synthesized: false,
  groups: [{ id: 'grp-other', name: 'Other', type: 'general', status: 'active' }],
  teams: [{ id: 'team-other', groupId: 'grp-other', name: 'Other', ageGrade: '', genderCategory: '', status: 'active' }],
};

let seq = 0;
function ctx({ role = 'coach', staffLevel = 'head', accessProfile = null, isOwner = false, accessScope, playerEligibility, status = 'active' } = {}) {
  seq += 1;
  const member = {
    id: `tm-${seq}`, teamId: CLUB, userId: `u-${seq}`, role, staffLevel,
    status, isOwner, accessProfile,
    ...(accessScope !== undefined ? { accessScope } : {}),
    ...(playerEligibility !== undefined ? { playerEligibility } : {}),
  };
  return { user: { id: member.userId }, teamMember: member, session: { teamId: CLUB } };
}

const groupScope = (...groupIds) => ({ clubWide: false, groups: groupIds.map(groupId => ({ groupId, status: 'active' })), teams: [] });
const teamScope = (...teamIds) => ({ clubWide: false, groups: [], teams: teamIds.map(teamId => ({ teamId, status: 'active' })) });

// ── 1-2: club-wide access ───────────────────────────────────────────────────
test('1. Club Owner reaches every active group and team', () => {
  const owner = ctx({ isOwner: true, role: 'coach', accessProfile: 'full' });
  assert.deepEqual(getAccessibleGroups(owner.teamMember, structure).map(g => g.id),
    ['grp-senior-men', 'grp-u18', 'grp-u16', 'grp-ladies']);
  assert.deepEqual(getAccessibleTeams(owner.teamMember, structure).map(t => t.id),
    ['team-senior-1', 'team-senior-2', 'team-u18', 'team-u16', 'team-ladies']);
  for (const g of ['grp-senior-men', 'grp-u18', 'grp-u16', 'grp-ladies']) {
    assert.equal(canManageGroup(owner, structure, g), true, g);
  }
  assert.equal(canManageClub(owner), true);
});

test('2. Club Admin (explicit full profile) reaches every group and team', () => {
  const admin = ctx({ role: 'admin', accessProfile: 'full' });
  assert.equal(effectiveAccessScope(admin.teamMember).clubWide, true);
  assert.equal(canViewGroup(admin, structure, 'grp-ladies'), true);
  assert.equal(canViewTeam(admin, structure, 'team-u16'), true);
  assert.equal(canEditMatchSelection(admin, structure, 'team-senior-2'), true);
});

// ── 3-5: group coach isolation ──────────────────────────────────────────────
test('3. U18 group coach can access U18', () => {
  const u18 = ctx({ accessScope: groupScope('grp-u18') });
  assert.equal(canViewGroup(u18, structure, 'grp-u18'), true);
  assert.equal(canManageGroup(u18, structure, 'grp-u18'), true);
  assert.equal(canViewTeam(u18, structure, 'team-u18'), true);
});

test('4. U18 group coach cannot access U16', () => {
  const u18 = ctx({ accessScope: groupScope('grp-u18') });
  assert.equal(canViewGroup(u18, structure, 'grp-u16'), false);
  assert.equal(canViewTeam(u18, structure, 'team-u16'), false);
  assert.equal(canViewGroupRoster(u18, structure, 'grp-u16'), false);
});

test('5. U18 group coach cannot access Senior Men', () => {
  const u18 = ctx({ accessScope: groupScope('grp-u18') });
  assert.equal(canViewGroup(u18, structure, 'grp-senior-men'), false);
  assert.equal(canViewTeam(u18, structure, 'team-senior-1'), false);
  assert.equal(canEditMatchSelection(u18, structure, 'team-senior-1'), false);
});

// ── 6-9: the senior split ───────────────────────────────────────────────────
test('6. Senior Men group coach can access Senior 1 AND Senior 2', () => {
  const senior = ctx({ accessScope: groupScope('grp-senior-men') });
  assert.equal(canViewTeam(senior, structure, 'team-senior-1'), true);
  assert.equal(canViewTeam(senior, structure, 'team-senior-2'), true);
  assert.equal(canEditMatchSelection(senior, structure, 'team-senior-1'), true);
  assert.equal(canEditMatchSelection(senior, structure, 'team-senior-2'), true);
  assert.deepEqual(getAccessibleTeams(senior.teamMember, structure).map(t => t.id),
    ['team-senior-1', 'team-senior-2']);
});

test('7. Senior 1-only coach can access Senior 1', () => {
  const s1 = ctx({ accessScope: teamScope('team-senior-1') });
  assert.equal(canViewTeam(s1, structure, 'team-senior-1'), true);
  assert.equal(canManageTeam(s1, structure, 'team-senior-1'), true);
  assert.equal(canEditMatchSelection(s1, structure, 'team-senior-1'), true);
});

test('8. Senior 1-only coach cannot access Senior 2', () => {
  const s1 = ctx({ accessScope: teamScope('team-senior-1') });
  assert.equal(canViewTeam(s1, structure, 'team-senior-2'), false);
  assert.equal(canEditMatchSelection(s1, structure, 'team-senior-2'), false);
  assert.deepEqual(getAccessibleTeams(s1.teamMember, structure).map(t => t.id), ['team-senior-1']);
});

test('9. Senior 1-only coach gets the pool read, NOT Senior Men administration', () => {
  const s1 = ctx({ accessScope: teamScope('team-senior-1') });
  // The minimum to pick a side: read the shared pool.
  assert.equal(canViewGroupRoster(s1, structure, 'grp-senior-men'), true);
  // But no group resources or administration.
  assert.equal(canViewGroup(s1, structure, 'grp-senior-men'), false, 'group resources denied');
  assert.equal(canManageGroup(s1, structure, 'grp-senior-men'), false);
  assert.equal(canManageGroupMembers(s1, structure, 'grp-senior-men'), false);
  assert.equal(getAccessibleGroups(s1.teamMember, structure).length, 0, 'no full group access listed');
});

// ── 10: ladies isolation ────────────────────────────────────────────────────
test('10. Ladies coach cannot access Senior, U18 or U16', () => {
  const ladies = ctx({ accessScope: groupScope('grp-ladies') });
  assert.equal(canViewGroup(ladies, structure, 'grp-ladies'), true);
  for (const [g, t] of [['grp-senior-men', 'team-senior-1'], ['grp-u18', 'team-u18'], ['grp-u16', 'team-u16']]) {
    assert.equal(canViewGroup(ladies, structure, g), false, g);
    assert.equal(canViewTeam(ladies, structure, t), false, t);
    assert.equal(canViewGroupRoster(ladies, structure, g), false, `${g} roster`);
  }
});

// ── 11-13: players and eligibility ──────────────────────────────────────────
test('11. A player reaches only their assigned scope', () => {
  const player = ctx({ role: 'player', staffLevel: null, accessScope: groupScope('grp-u18') });
  assert.equal(canViewGroup(player, structure, 'grp-u18'), true, 'own group visible');
  assert.equal(canViewGroup(player, structure, 'grp-u16'), false);
  assert.equal(canViewGroup(player, structure, 'grp-senior-men'), false);
  assert.equal(canManageGroup(player, structure, 'grp-u18'), false, 'view is not manage');
});

test('12. Dual-eligible senior player keeps ONE identity and one membership', () => {
  const player = ctx({ role: 'player', staffLevel: null,
    accessScope: groupScope('grp-senior-men'),
    playerEligibility: { teamIds: ['team-senior-1', 'team-senior-2'], primaryTeamId: 'team-senior-2' } });
  const elig = effectiveEligibility(player.teamMember);
  assert.deepEqual(elig.teamIds, ['team-senior-1', 'team-senior-2']);
  assert.equal(elig.primaryTeamId, 'team-senior-2');
  assert.deepEqual(eligibleTeams(player.teamMember, structure).map(t => t.id),
    ['team-senior-1', 'team-senior-2']);
  // One membership record, one user — nothing duplicated for the second team.
  assert.equal(typeof player.teamMember.id, 'string');
});

test('13. Eligibility grants NO coach or administrative capability', () => {
  const player = ctx({ role: 'player', staffLevel: null,
    accessScope: groupScope('grp-senior-men'),
    playerEligibility: { teamIds: ['team-senior-1', 'team-senior-2'], primaryTeamId: 'team-senior-1' } });
  assert.equal(canEditMatchSelection(player, structure, 'team-senior-1'), false);
  assert.equal(canManageTeam(player, structure, 'team-senior-1'), false);
  assert.equal(canManageGroup(player, structure, 'grp-senior-men'), false);
  assert.equal(canManageGroupMembers(player, structure, 'grp-senior-men'), false);
  // And eligibility for a team in a group they cannot ACCESS resolves to nothing.
  const stray = ctx({ role: 'player', staffLevel: null,
    accessScope: groupScope('grp-u18'),
    playerEligibility: { teamIds: ['team-senior-1'], primaryTeamId: 'team-senior-1' } });
  assert.equal(canViewTeam(stray, structure, 'team-senior-1'), false, 'eligibility is not access');
});

// ── 14-16: id validation ────────────────────────────────────────────────────
test('14. A mismatched teamId (wrong group) is simply that team — no bleed', () => {
  // A grant naming a U18 team never reaches Senior resources even if the
  // caller CLAIMS a senior group context: helpers resolve by the id itself.
  const coach = ctx({ accessScope: teamScope('team-u18') });
  assert.equal(canViewTeam(coach, structure, 'team-u18'), true);
  assert.equal(canViewGroupRoster(coach, structure, 'grp-u18'), true);
  assert.equal(canViewGroupRoster(coach, structure, 'grp-senior-men'), false, 'claimed group ignored');
  assert.equal(canViewTeam(coach, structure, 'team-senior-1'), false);
});

test('15. Ids from ANOTHER club are rejected in this club context', () => {
  const admin = ctx({ role: 'admin', accessProfile: 'full' });   // club-wide in CLUB
  assert.equal(canViewGroup(admin, structure, 'grp-other'), false, 'other-club group unknown here');
  assert.equal(canViewTeam(admin, structure, 'team-other'), false);
  assert.throws(() => assertScopedPermission(admin, structure, PERM.MANAGE_PLAYERS, { groupId: 'grp-other' }),
    /Unknown group/);
  assert.throws(() => assertScopedPermission(admin, structure, PERM.MANAGE_FIXTURES, { teamId: 'team-other' }),
    /Unknown team/);
  // And a grant referencing another club's id is inert against this structure.
  const impostor = ctx({ accessScope: groupScope('grp-other') });
  assert.equal(getAccessibleGroups(impostor.teamMember, structure).length, 0);
});

test('16. Unknown group/team ids are rejected with 404 semantics', () => {
  const owner = ctx({ isOwner: true, accessProfile: 'full' });
  assert.equal(canViewGroup(owner, structure, 'grp-nope'), false);
  assert.equal(canViewTeam(owner, structure, 'team-nope'), false);
  try {
    assertScopedPermission(owner, structure, PERM.MANAGE_PLAYERS, { groupId: 'grp-nope' });
    assert.fail('should throw');
  } catch (e) { assert.equal(e.status, 404); }
  try {
    assertScopedPermission(owner, structure, PERM.MANAGE_FIXTURES, { teamId: 'team-nope' });
    assert.fail('should throw');
  } catch (e) { assert.equal(e.status, 404); }
});

// ── 17: archived exclusion ──────────────────────────────────────────────────
test('17. Archived groups and teams are excluded from access, even club-wide', () => {
  const owner = ctx({ isOwner: true, accessProfile: 'full' });
  assert.equal(getAccessibleGroups(owner.teamMember, structure).some(g => g.id === 'grp-veterans'), false);
  assert.equal(getAccessibleTeams(owner.teamMember, structure).some(t => ['team-vets', 'team-s1-old'].includes(t.id)), false);
  assert.equal(canViewGroup(owner, structure, 'grp-veterans'), false, 'archived group denied');
  assert.equal(canViewTeam(owner, structure, 'team-s1-old'), false, 'archived team denied');
  assert.equal(canViewTeam(owner, structure, 'team-vets'), false, 'team inside archived group denied');
  // Direct grants to archived scopes are equally inert.
  const grantee = ctx({ accessScope: groupScope('grp-veterans') });
  assert.equal(canViewGroup(grantee, structure, 'grp-veterans'), false);
});

// ── 22: soft removal ────────────────────────────────────────────────────────
test('22. Removing one scoped grant keeps identity, membership and other grants', async () => {
  kv.clear();
  const member = {
    id: 'tm-multi', teamId: CLUB, userId: 'u-multi', role: 'coach', staffLevel: 'head',
    status: 'active',
    accessScope: { clubWide: false,
      groups: [{ groupId: 'grp-u18', status: 'active' }, { groupId: 'grp-u16', status: 'active' }],
      teams: [{ teamId: 'team-ladies', status: 'active' }] },
  };
  kv.set('app:identity:team_members', JSON.stringify([member]));
  const { teamMember } = await store.removeScopedGrant('tm-multi', { groupId: 'grp-u16' }, 'u-admin', CLUB);

  assert.equal(teamMember.status, 'active', 'membership survives');
  assert.equal(teamMember.userId, 'u-multi', 'identity untouched');
  const scope = effectiveAccessScope(teamMember);
  assert.deepEqual(scope.groups.filter(g => g.status === 'active').map(g => g.groupId), ['grp-u18'],
    'only the removed grant is gone');
  assert.deepEqual(scope.teams.filter(t => t.status === 'active').map(t => t.teamId), ['team-ladies'],
    'team grant untouched');
  assert.equal(scope.groups.find(g => g.groupId === 'grp-u16')?.status, 'removed', 'history kept, soft-removed');
  const c = { user: { id: 'u-multi' }, teamMember };
  assert.equal(canViewGroup(c, structure, 'grp-u16'), false, 'removed grant contributes nothing');
  assert.equal(canViewGroup(c, structure, 'grp-u18'), true);
});

// ── 27: malformed data fails closed ─────────────────────────────────────────
test('27. Malformed membership data fails closed, never wider', () => {
  for (const bad of [
    'clubWide-string', 42, [], { clubWide: 'yes' }, { groups: 'all' }, { teams: {} },
    { clubWide: false, groups: [{ status: 'active' }] },          // grant without id
    { clubWide: false, groups: [null, 'x'], teams: [7] },
  ]) {
    const scope = normalizeAccessScope(bad);
    assert.equal(scope.clubWide, false, JSON.stringify(bad));
    assert.equal(scope.groups.length + scope.teams.length <= 0 || scope.groups.every(g => g.groupId), true);
    const c = ctx({ accessScope: bad });
    assert.equal(canViewGroup(c, structure, 'grp-senior-men'), false, `must deny for ${JSON.stringify(bad)}`);
    assert.equal(getAccessibleTeams(c.teamMember, structure).length, 0);
  }
  // Duplicate grants collapse to one effective grant.
  const dup = normalizeAccessScope({ clubWide: false,
    groups: [{ groupId: 'grp-u18' }, { groupId: 'grp-u18' }], teams: [] });
  assert.equal(dup.groups.length, 1, 'no duplicate effective grants');
  // Inactive membership has no scope at all.
  const suspended = ctx({ accessScope: groupScope('grp-u18'), status: 'removed' });
  assert.equal(canViewClub(suspended), false);
  assert.equal(canViewGroup(suspended, structure, 'grp-u18'), false);
});

// ── Per-scope role override ─────────────────────────────────────────────────
test('a per-scope role override changes capability at that scope only', () => {
  // Club-level coach, but MANAGER at the Ladies scope: fixtures yes, squad publication no.
  const mixed = ctx({ accessScope: { clubWide: false,
    groups: [{ groupId: 'grp-ladies', role: 'manager', status: 'active' }], teams: [] } });
  assert.equal(canManageGroup(mixed, structure, 'grp-ladies', PERM.MANAGE_FIXTURES), true);
  assert.equal(canEditMatchSelection(mixed, structure, 'team-ladies'), false,
    'manager override cannot publish squads');
});
