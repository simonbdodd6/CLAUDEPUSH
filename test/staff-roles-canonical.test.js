/**
 * CANONICAL STAFF_ROLES — one definition of "is this member's role a staff
 * classification?", consumed by every staff-vs-player site (previously ~23
 * hand-copied ['coach','admin','medical'] lists that silently omitted snc and
 * analyst — the roles Performance/S&C will use).
 *
 * The contract these tests pin, and the line they hold:
 *   • coach / admin / medical / snc / analyst ARE staff.
 *   • player / parent / guest / unknown / '' are NOT.
 *   • CLASSIFICATION GRANTS NO AUTHORITY. Being classified staff must not add
 *     any permission, must not imply Medical access, must not imply club-wide
 *     reach, and must not widen a group-scoped member's groups. Authority stays
 *     with ROLE_PERMISSIONS / access profiles / operationalGroupsFor, unchanged.
 *
 * Behaviour is exercised through the REAL exported helpers, never source text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-roles.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
globalThis.fetch = async () => ({ ok: true, json: async () => ({ result: null }) });

const {
  STAFF_ROLES, isStaffRole, permissionsFor, canonicalRole, PERM, isClubOwner,
} = await import('../api/_permissions.js');
const { operationalGroupsFor, effectiveAccessScope } = await import('../api/_accessScope.js');
const { canonicalAccountOptions } = await import('../src/player-identity.js');

// ── THE SET ──────────────────────────────────────────────────────────────────

test('the canonical set is exactly the five staff roles', () => {
  assert.deepEqual([...STAFF_ROLES].sort(), ['admin', 'analyst', 'coach', 'medical', 'snc']);
});

test('STAFF_ROLES is frozen (no accidental mutation of the shared source)', () => {
  assert.ok(Object.isFrozen(STAFF_ROLES));
  assert.throws(() => { STAFF_ROLES.push('player'); });
});

// ── CLASSIFICATION ─────────────────────────────────────────────────────────

for (const role of ['coach', 'admin', 'medical', 'snc', 'analyst']) {
  test(`${role} is classified as staff`, () => assert.equal(isStaffRole(role), true));
}
for (const role of ['player', 'parent', 'guest', 'unknown-future-role', '', null, undefined]) {
  test(`${JSON.stringify(role)} is NOT classified as staff`, () => assert.equal(isStaffRole(role), false));
}

test('classification is case-insensitive and trims the stored value', () => {
  assert.equal(isStaffRole('SNC'), true);
  assert.equal(isStaffRole('Analyst'), true);
  assert.equal(isStaffRole('MEDICAL'), true);
});

// ── CLASSIFICATION GRANTS NO AUTHORITY ──────────────────────────────────────

const member = (role, over = {}) => ({ role, status: 'active', ...over });

test('snc gains NO Medical authority merely by being staff', () => {
  const perms = permissionsFor(member('snc'));
  assert.equal(perms.has(PERM.MEDICAL_ACCESS), false, 'S&C must not receive medical access');
});

test('analyst gains NO Medical authority merely by being staff', () => {
  const perms = permissionsFor(member('analyst'));
  assert.equal(perms.has(PERM.MEDICAL_ACCESS), false, 'analyst must not receive medical access');
});

test('snc is not club owner and holds only its own role permissions', () => {
  const m = member('snc');
  assert.equal(isClubOwner(m), false);
  const perms = [...permissionsFor(m)].sort();
  // Exactly the snc role grant — nothing widened by staff classification.
  assert.deepEqual(perms, [PERM.PUBLISH_TRAINING, PERM.MESSAGING, PERM.REPORTS].sort());
});

test('analyst holds only its own role permissions, no club administration', () => {
  const perms = permissionsFor(member('analyst'));
  assert.equal(perms.has(PERM.MANAGE_COACHES), false);
  assert.equal(perms.has(PERM.DANGER_ZONE), false);
  assert.equal(perms.has(PERM.MANAGE_SUBSCRIPTIONS), false);
  assert.deepEqual([...perms].sort(), [PERM.REPORTS, PERM.AI_INTELLIGENCE].sort());
});

test('staff classification does not imply club-wide access scope', () => {
  // A group-scoped snc: effectiveAccessScope must NOT be club-wide.
  const scoped = member('snc', { accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } });
  assert.equal(effectiveAccessScope(scoped).clubWide, false);
});

// ── GROUP-SCOPED STAFF REMAIN GROUP-SCOPED ──────────────────────────────────

const STRUCTURE = {
  version: 1,
  groups: [
    { id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' },
    { id: 'grp-u18', name: 'U18', type: 'age-grade', status: 'active' },
    { id: 'grp-wom', name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: 'grp_initial', name: 'Premier', status: 'active' }],
};

test('a group-scoped snc operates ONLY its granted group', () => {
  const snc = member('snc', { accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } });
  const groups = operationalGroupsFor(snc, STRUCTURE, { as: 'staff' }).map(g => g.id);
  assert.deepEqual(groups, ['grp-u18'], 'no other group is reachable');
});

test('a group-scoped analyst operates ONLY its granted group', () => {
  const analyst = member('analyst', { accessScope: { clubWide: false, groups: [{ groupId: 'grp-wom', status: 'active' }], teams: [] } });
  const groups = operationalGroupsFor(analyst, STRUCTURE, { as: 'staff' }).map(g => g.id);
  assert.deepEqual(groups, ['grp-wom']);
});

// ── EXISTING AUTHORITY UNCHANGED ────────────────────────────────────────────

test('admin authority is unchanged (still holds club-administration permissions)', () => {
  const perms = permissionsFor(member('admin'));
  assert.equal(perms.has(PERM.MANAGE_COACHES), true);
  assert.equal(perms.has(PERM.MEDICAL_ACCESS), true);
  assert.equal(perms.has(PERM.DANGER_ZONE), true);
});

test('coach (head) authority is unchanged', () => {
  const perms = permissionsFor(member('coach'));           // canonicalRole → head_coach
  assert.equal(canonicalRole(member('coach')), 'head_coach');
  assert.equal(perms.has(PERM.PUBLISH_SQUADS), true);
  assert.equal(perms.has(PERM.MANAGE_PLAYERS), true);
});

test('medical authority is unchanged (still the medical grant, nothing more)', () => {
  const perms = permissionsFor(member('medical'));
  assert.equal(perms.has(PERM.MEDICAL_ACCESS), true);
  assert.equal(perms.has(PERM.MANAGE_COACHES), false, 'medical is not staff-management');
  assert.equal(perms.has(PERM.PUBLISH_SQUADS), false, 'medical is not a coach');
});

test('player holds no club permissions (classification did not add any)', () => {
  assert.deepEqual([...permissionsFor(member('player'))], []);
});

// ── A REAL CONSUMER: the staff-account directory now includes snc & analyst ──

test('canonicalAccountOptions now surfaces snc and analyst as staff accounts', () => {
  const users = [
    { id: 'u-coach',   role: 'coach',   displayName: 'A Coach' },
    { id: 'u-medic',   role: 'medical', displayName: 'A Physio' },
    { id: 'u-snc',     role: 'snc',     displayName: 'An S&C Coach' },
    { id: 'u-analyst', role: 'analyst', displayName: 'An Analyst' },
    { id: 'u-player',  role: 'player',  displayName: 'A Player' },
  ];
  const opts = canonicalAccountOptions({ users, players: [] });
  const ids = opts.map(o => o.id);
  assert.ok(ids.includes('u-snc'), 'snc surfaces as a staff account');
  assert.ok(ids.includes('u-analyst'), 'analyst surfaces as a staff account');
  assert.ok(ids.includes('u-coach') && ids.includes('u-medic'), 'existing staff still surface');
  assert.ok(!ids.includes('u-player'), 'a player is not a staff account');
});
