/**
 * A STAFF MEMBER WITH NO COACHING SCOPE MUST STILL BE ADMINISTRABLE.
 *
 * The Members screen filters its Coaches & staff list by the operating group,
 * using the server-computed standing ids (clubWideStaffIds / groupStaffIds).
 * The filter asked "is this person staff OF THIS GROUP?" and hid everyone else.
 *
 * That is right for a Seniors-only assistant — they are not U18 staff. It is
 * wrong for someone who holds NO coaching scope at all: a club physio, a medic,
 * an analyst. They were never scoped INTO Seniors, so they are not scoped OUT
 * of it; they belong to the club. Hiding them behind a group filter hid them in
 * EVERY group at once, and because the Members row is the only way to open a
 * member's editor, their record became unreachable and uncorrectable.
 *
 * Observed in production: a Medical member whose derived scope was materialised
 * into an explicit one and then emptied (grant a team, remove the team) vanished
 * from Members under every group while his membership, medical access and login
 * were all intact.
 *
 * This is a VISIBILITY fix and these tests pin that: nobody gains a permission,
 * nobody joins a group, and scoped staff stay group-isolated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-visibility.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scope = await import('../api/_accessScope.js');
const { permissionsFor, canonicalRole, PERM } = await import('../api/_permissions.js');

const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_women';
const STRUCTURE = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', status: 'active' },
           { id: U18, name: 'U18', status: 'active' },
           { id: WOM, name: "Women's", status: 'active' }],
  teams:  [{ id: 'team_initial', groupId: SEN, name: 'Premier', status: 'active' },
           { id: 'team_f9113560', groupId: SEN, name: 'Premier Development', status: 'active' },
           { id: 't-u18', groupId: U18, name: 'U18', status: 'active' }],
};

// ── the REAL filter, lifted from renderPlayers() ────────────────────────────

/** Slice an arrow-function const out of the bundle, brace-matched. */
function arrowConst(name) {
  const start = src.indexOf(`const ${name} = u => {`);
  assert.ok(start > 0, `${name} exists in index.html`);
  let depth = 0, end = src.indexOf('{', start);
  for (let b = end; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1) + ';';
}

/** Build the real Members staff filter over a given group + standing ids. */
function membersFilter(gid, acc) {
  return new Function('_gid', '_acc', `${arrowConst('_staffInScope')} return _staffInScope;`)(gid, acc);
}
/** The Match Centre filter, which has DIFFERENT semantics (see test 15). */
function matchCentreFilter(gid, acc, loaded = true) {
  return new Function('_mcGid', '_mcAcc', '_adminData',
    `${arrowConst('_mcStaffInScope')} return _mcStaffInScope;`)(gid, acc, { loaded });
}

/**
 * The standing ids EXACTLY as api/publish.js (resource=structure) computes
 * them, so the fixture can never drift from the server.
 */
function standingIds(members, structure = STRUCTURE) {
  const clubWideStaffIds = [];
  const groups = {};
  for (const g of structure.groups) groups[g.id] = [];
  for (const m of members.filter(x => x.status === 'active')) {
    if (canonicalRole(m) === 'player') continue;                  // staffish only
    const eff = scope.effectiveAccessScope(m);
    if (eff.clubWide) { clubWideStaffIds.push(String(m.userId)); continue; }
    for (const g of scope.operationalGroupsFor(m, structure, { as: 'staff' })) {
      if (groups[g.id]) groups[g.id].push(String(m.userId));
    }
  }
  return { clubWideStaffIds, groupStaffIds: groups };
}

const user = (id, role) => ({ id, role, name: `${id} name` });

// The production shapes, named for what they are.
const MEDIC_NO_SCOPE_KEY = { id: 'tm-medA', teamId: 'c1', userId: 'u-medA',
  role: 'medical', status: 'active', medicalAccess: true };
/** The regression case: explicit scope, no groups, only REMOVED team grants. */
const MEDIC_EMPTY_SCOPE  = { id: 'tm-medB', teamId: 'c1', userId: 'u-medB',
  role: 'medical', status: 'active', medicalAccess: true,
  accessScope: { clubWide: false, groups: [],
                 teams: [{ teamId: 'team_initial', role: null, status: 'removed' },
                         { teamId: 'team_f9113560', role: null, status: 'removed' }] } };
const SENIORS_COACH = { id: 'tm-coach', teamId: 'c1', userId: 'u-coach',
  role: 'coach', status: 'active', staffLevel: 'assistant',
  accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } };
const CLUB_WIDE_ADMIN = { id: 'tm-admin', teamId: 'c1', userId: 'u-admin',
  role: 'admin', status: 'active', isOwner: true,
  accessScope: { clubWide: true, groups: [], teams: [] } };
const PLAYER = { id: 'tm-play', teamId: 'c1', userId: 'u-play', role: 'player',
  status: 'active', playerGroupId: SEN };
const PLAYER_MEDIC = { id: 'tm-pm', teamId: 'c1', userId: 'u-pm', role: 'player',
  status: 'active', playerGroupId: SEN, medicalAccess: true };

const ALL = [MEDIC_NO_SCOPE_KEY, MEDIC_EMPTY_SCOPE, SENIORS_COACH, CLUB_WIDE_ADMIN, PLAYER, PLAYER_MEDIC];
const ACC = standingIds(ALL);

// ════ 1-3 — UNSCOPED STAFF ARE ADMINISTRABLE ═══════════════════════════════

test('1: a Medical member with NO accessScope key is visible under Seniors', () => {
  // Legacy derivation puts them in the initial group, so this already held.
  assert.equal(membersFilter(SEN, ACC)(user('u-medA', 'medical')), true);
});

test('2: REGRESSION — a Medical member with an EXPLICIT EMPTY scope is visible under Seniors', () => {
  // The production case. Before the fix this returned false and the member
  // vanished from the only screen that can edit them.
  assert.equal(scope.operationalGroupsFor(MEDIC_EMPTY_SCOPE, STRUCTURE, { as: 'staff' }).length, 0,
    'they genuinely hold no coaching group — that is the point');
  assert.equal(ACC.clubWideStaffIds.includes('u-medB'), false, 'and are not club-wide');
  assert.equal(membersFilter(SEN, ACC)(user('u-medB', 'medical')), true,
    'yet an administrator can still see and open them');
});

test('3: the same member is visible under U18 too — they belong to the club', () => {
  assert.equal(membersFilter(U18, ACC)(user('u-medB', 'medical')), true);
  assert.equal(membersFilter(WOM, ACC)(user('u-medB', 'medical')), true);
});

// ════ 4-6 — GROUP ISOLATION IS UNCHANGED ═══════════════════════════════════

test('4: a Seniors-only coach is visible under Seniors', () => {
  assert.equal(membersFilter(SEN, ACC)(user('u-coach', 'coach')), true);
});

test('5: a Seniors-only coach is NOT visible under U18 — isolation holds', () => {
  assert.equal(membersFilter(U18, ACC)(user('u-coach', 'coach')), false,
    'scoped staff stay scoped — the fix must not leak them across groups');
  assert.equal(membersFilter(WOM, ACC)(user('u-coach', 'coach')), false);
});

test('6: a club-wide administrator is visible under every group', () => {
  for (const gid of [SEN, U18, WOM]) {
    assert.equal(membersFilter(gid, ACC)(user('u-admin', 'admin')), true, `club-wide under ${gid}`);
  }
});

test('6c: clubWideStaffIds is authoritative on its own, independent of group ids', () => {
  // The server pushes a club-wide member to clubWideStaffIds and to NO group,
  // so the unscoped rule would cover them by accident. Pin the club-wide
  // branch directly: an id that is BOTH club-wide and listed under one group
  // must still be visible under the OTHER groups. Without the club-wide check
  // they would read as merely scoped, and vanish outside that one group.
  const acc = { clubWideStaffIds: ['u-both'], groupStaffIds: { [SEN]: ['u-both'], [U18]: [], [WOM]: [] } };
  for (const gid of [SEN, U18, WOM]) {
    assert.equal(membersFilter(gid, acc)(user('u-both', 'admin')), true,
      `club-wide beats group scoping under ${gid}`);
  }
  // And the branch is genuinely consulted, not dead code.
  assert.match(arrowConst('_staffInScope'), /clubWideStaffIds/);
});

test('6b: with no group in force, or before the ids load, nothing is hidden', () => {
  assert.equal(membersFilter(null, ACC)(user('u-coach', 'coach')), true, 'no group context');
  assert.equal(membersFilter(SEN, null)(user('u-coach', 'coach')), true, 'ids not loaded yet');
});

// ════ 7-8 — PLAYERS ARE NOT TOUCHED ════════════════════════════════════════

test('7: an ordinary player is unaffected — they are not in the staff list at all', () => {
  // Players never reach _staffInScope: the staff list filters on role first.
  const STAFF_ROLES = ['coach', 'admin', 'medical'];
  assert.equal(STAFF_ROLES.includes(PLAYER.role), false, 'a player is not a staff row');
  // And their own list is still driven by playerGroupId, untouched here.
  assert.deepEqual(scope.operationalGroupsFor(PLAYER, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN]);
  // NOTE: operationalGroupsFor(as:'staff') is NOT empty for a scope-less member —
  // effectiveAccessScope derives the initial group for anyone with no stored
  // scope. That derivation is exactly why the standing-id builder filters on
  // canonicalRole FIRST, so a player is never counted as staff.
  assert.equal(canonicalRole(PLAYER), 'player');
  assert.equal(ACC.groupStaffIds[SEN].includes('u-play'), false, 'never a staff id');
  assert.equal(ACC.clubWideStaffIds.includes('u-play'), false, 'nor a club-wide staff id');
});

test('8: a player who also holds Medical access is unchanged', () => {
  assert.equal(scope.isPlayingMember(PLAYER_MEDIC), true, 'still plays');
  assert.deepEqual(scope.operationalGroupsFor(PLAYER_MEDIC, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN]);
  assert.equal(permissionsFor(PLAYER_MEDIC).has(PERM.MEDICAL_ACCESS), true, 'still medical');
  assert.equal(ACC.groupStaffIds[SEN].includes('u-pm'), false,
    'a player-medic is not staff, so the staff filter never applies to them');
});

// ════ 9-13 — VISIBILITY ONLY ═══════════════════════════════════════════════

test('9: the fix changes NO permission', () => {
  for (const m of ALL) {
    const before = [...permissionsFor(m)].sort();
    membersFilter(SEN, ACC)(user(m.userId, m.role));         // rendering the list
    assert.deepEqual([...permissionsFor(m)].sort(), before, `${m.id} permissions unchanged`);
  }
  // And the unscoped medic still holds exactly what the medical role grants.
  assert.deepEqual([...permissionsFor(MEDIC_EMPTY_SCOPE)].sort(),
    [PERM.MEDICAL_ACCESS, PERM.MESSAGING, PERM.REPORTS].sort(),
    'no coaching permission appears from being visible');
  for (const p of [PERM.MANAGE_PLAYERS, PERM.MANAGE_TEAMS, PERM.PUBLISH_SQUADS,
                   PERM.PUBLISH_TRAINING, PERM.ASSIGN_ACCESS, PERM.MANAGE_COACHES]) {
    assert.equal(permissionsFor(MEDIC_EMPTY_SCOPE).has(p), false, `must not gain ${p}`);
  }
});

test('10: the fix changes NO operational group resolution', () => {
  for (const m of ALL) {
    const staffBefore = scope.operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id);
    const playerBefore = scope.operationalGroupsFor(m, STRUCTURE, { as: 'player' }).map(g => g.id);
    membersFilter(SEN, ACC)(user(m.userId, m.role));
    assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id), staffBefore);
    assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'player' }).map(g => g.id), playerBefore);
  }
  assert.deepEqual(scope.operationalGroupsFor(MEDIC_EMPTY_SCOPE, STRUCTURE, { as: 'staff' }), [],
    'the unscoped medic is STILL in no group — visible is not the same as scoped');
  assert.throws(() => scope.assertOperationalGroup(
    { user: { id: 'u-medB' }, teamMember: MEDIC_EMPTY_SCOPE }, STRUCTURE, SEN, { as: 'staff' }),
    /Not authorized/, 'and the server still refuses them that group');
});

test('11: the fix creates no playerGroupId and no accessScope', () => {
  const before = JSON.stringify(MEDIC_EMPTY_SCOPE);
  membersFilter(SEN, ACC)(user('u-medB', 'medical'));
  assert.equal(JSON.stringify(MEDIC_EMPTY_SCOPE), before, 'the membership object is not mutated');
  assert.equal('playerGroupId' in MEDIC_EMPTY_SCOPE, false, 'no player capacity invented');
  assert.equal(scope.isPlayingMember(MEDIC_EMPTY_SCOPE), false);
  assert.deepEqual(MEDIC_EMPTY_SCOPE.accessScope.groups, [], 'the empty scope stays empty');
});

test('12: the fix is pure presentation — it writes nothing at all', () => {
  const body = arrowConst('_staffInScope');
  for (const banned of [/fetch\(/, /adminAction/, /saveState/, /=\s*['"]/, /\.push\(/, /delete /]) {
    assert.doesNotMatch(body, banned, `the filter must not ${banned}`);
  }
  assert.match(body, /return /, 'it only ever returns a boolean');
});

test('13: standing ids never cross a tenant boundary', () => {
  // A member of another club is simply not in this club's member list, so
  // their id can appear in no group and in no club-wide list.
  const foreign = { id: 'tm-x', teamId: 'c2', userId: 'u-foreign', role: 'medical', status: 'active' };
  const ids = standingIds([...ALL, foreign].filter(m => m.teamId === 'c1'));
  assert.equal(ids.clubWideStaffIds.includes('u-foreign'), false);
  for (const gid of Object.keys(ids.groupStaffIds)) {
    assert.equal(ids.groupStaffIds[gid].includes('u-foreign'), false, `absent from ${gid}`);
  }
  // Tenant separation is a property of the LIST, not of the filter: the staff
  // list iterates state.users — this club's loaded identity payload — and a
  // filter can only ever NARROW that list, never add to it. So no change to
  // the filter can introduce a member of another club.
  const listSrc = src.slice(src.indexOf('const staffMembers = (state.users || [])'),
                            src.indexOf('.map(u => ({', src.indexOf('const staffMembers = (state.users || [])')));
  assert.match(listSrc, /^const staffMembers = \(state\.users \|\| \[\]\)/,
    'the source list is this club\'s loaded users');
  assert.match(listSrc, /\.filter\(_staffInScope\)/, 'the scope check only filters that list');
  assert.doesNotMatch(listSrc, /concat|push|\.\.\./, 'nothing is ever added to it');
});

// ════ 14-15 — THE OTHER STAFF SURFACES ═════════════════════════════════════

test('14: exactly ONE staff surface changed, and it is the Members list', () => {
  // Three surfaces share the shape of this filter. Only Members is about
  // ADMINISTRATION; the other two are about operational participation and
  // discovery, so their semantics are deliberately left alone.
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const members = strip(arrowConst('_staffInScope'));
  const matchCentre = strip(arrowConst('_mcStaffInScope'));
  assert.match(members, /groupStaffIds/, 'Members still consults the standing ids');
  assert.match(members, /Object\.values/, 'Members adds the unscoped rule');
  assert.doesNotMatch(matchCentre, /Object\.values/,
    'Match Centre keeps its existing operational semantics');
});

test('15: Match Centre staff scoping is unchanged, including its fail-closed rule', () => {
  const mc = matchCentreFilter(SEN, ACC);
  assert.equal(mc(user('u-coach', 'coach')), true, 'Seniors coach on a Seniors fixture');
  assert.equal(matchCentreFilter(U18, ACC)(user('u-coach', 'coach')), false, 'not on a U18 fixture');
  assert.equal(mc(user('u-admin', 'admin')), true, 'club-wide staff everywhere');
  // The unscoped medic is deliberately NOT promoted into Match Centre: being
  // administrable is not the same as participating in team selection.
  assert.equal(mc(user('u-medB', 'medical')), false,
    'an unscoped medic gains no Match Centre presence from this fix');
  // UNKNOWN ≠ LEGACY: before the ids load, Match Centre shows NO ONE.
  assert.equal(matchCentreFilter(SEN, ACC, false)(user('u-admin', 'admin')), false,
    'fail-closed while admin data is pending — unchanged');
});
