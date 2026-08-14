/**
 * RC4.7 D1a — explicit player group, separate from staff access.
 *
 *   PLAYER GROUP  (member.playerGroupId) → where a person PLAYS, and therefore
 *                                          which teams they are eligible for.
 *   STAFF ACCESS  (member.accessScope)   → where a person may COACH / ADMIN.
 *
 * Before D1a, eligibility was derived from accessScope, so a Seniors coaching
 * grant made someone eligible to PLAY for Seniors and club-wide administration
 * made someone a player everywhere. These pin the separation, the migration
 * that backfills legacy players, and the refusal to guess once a club has more
 * than one active group.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.player-group.test';
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

const store = await import('../api/_identityStore.js');
const { default: inviteHandler } = await import('../api/invite.js');
const {
  resolvePlayerGroup, playerGroupIdOf, isPlayingMember,
  resolveEligibility, eligibleTeams, effectiveAccessScope, getAccessibleGroups,
} = await import('../api/_accessScope.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const CLUB = 'club-a';
const SEN = 'grp-seniors', U18 = 'grp-u18', OLD = 'grp-vets';

/** Two active groups — the state the club enters when U18 is created. */
const TWO_GROUPS = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: OLD, name: 'Veterans', type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-dev', groupId: SEN, name: 'Premier Development', status: 'active' },
    { id: 't-gone', groupId: SEN, name: 'Old Boys', status: 'archived' },
    { id: 't-u18', groupId: U18, name: 'U18', status: 'active' },
    { id: 't-vets', groupId: OLD, name: 'Vets', status: 'active' },
  ],
};
/** One active group — today's production state, before U18 exists. */
const ONE_GROUP = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', status: 'active' },
           { id: OLD, name: 'Veterans', status: 'archived' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
          { id: 't-dev', groupId: SEN, name: 'Premier Development', status: 'active' }],
};

const member = over => ({ id: 'tm-1', teamId: CLUB, userId: 'u-1', status: 'active', ...over });
const groupScope = (...ids) => ({ clubWide: false, groups: ids.map(groupId => ({ groupId, status: 'active' })), teams: [] });

// ── 1. Player group is explicit and authoritative ──────────────────────────
test('an explicit playerGroupId determines eligibility, and only within that group', () => {
  const seniors = member({ role: 'player', playerGroupId: SEN });
  assert.deepEqual(resolveEligibility(seniors, TWO_GROUPS).teamIds.sort(), ['t-dev', 't-prem']);

  const u18 = member({ role: 'player', playerGroupId: U18 });
  assert.deepEqual(resolveEligibility(u18, TWO_GROUPS).teamIds, ['t-u18'], 'U18 only');
  assert.equal(resolveEligibility(u18, TWO_GROUPS).teamIds.includes('t-prem'), false);

  // Archived teams inside the group are excluded.
  assert.equal(resolveEligibility(seniors, TWO_GROUPS).teamIds.includes('t-gone'), false);
});

test('staff access NEVER confers playing eligibility', () => {
  // A Seniors coach with no player group does not play.
  const coach = member({ role: 'coach', staffLevel: 'head', accessScope: groupScope(SEN) });
  assert.deepEqual(resolveEligibility(coach, TWO_GROUPS).teamIds, []);
  assert.equal(isPlayingMember(coach), false);

  // Club-wide administration does not make someone a player everywhere.
  const owner = member({ role: 'coach', staffLevel: 'head', isOwner: true, accessProfile: 'full',
    accessScope: { clubWide: true, groups: [], teams: [] } });
  assert.deepEqual(resolveEligibility(owner, TWO_GROUPS).teamIds, []);

  // A U18 player who coaches Seniors still plays only for U18.
  const dual = member({ role: 'player', playerGroupId: U18, accessScope: groupScope(SEN) });
  assert.deepEqual(resolveEligibility(dual, TWO_GROUPS).teamIds, ['t-u18'],
    'coaching Seniors does not add Seniors playing eligibility');
});

test('an unknown, archived or cross-club player group resolves to nothing', () => {
  for (const gid of [OLD, 'grp-of-another-club', 'grp-nope']) {
    const m = member({ role: 'player', playerGroupId: gid });
    const r = resolvePlayerGroup(m, TWO_GROUPS);
    assert.equal(r.groupId, '', `${gid} must not resolve`);
    assert.equal(r.needsAssignment, true, 'flagged for admin attention');
    assert.deepEqual(resolveEligibility(m, TWO_GROUPS).teamIds, []);
  }
});

test('stored eligibility cannot narrow the group pool, and never crosses it', () => {
  // Shared-squad model: the stored list is legacy data. It no longer narrows —
  // that behaviour is how one Seniors team read 0 eligible while its sibling
  // held the whole squad. Within the group it may only prefer a primary.
  const narrowed = member({ role: 'player', playerGroupId: SEN,
    playerEligibility: { teamIds: ['t-prem'], primaryTeamId: 't-prem' } });
  const n = resolveEligibility(narrowed, TWO_GROUPS);
  assert.deepEqual(n.teamIds.sort(), ['t-dev', 't-prem'].sort(), 'the whole Seniors pool');
  assert.equal(n.primaryTeamId, 't-prem', 'primary preference honoured in-group');

  // A stored selection naming a team OUTSIDE the player's group is discarded.
  const crossing = member({ role: 'player', playerGroupId: U18,
    playerEligibility: { teamIds: ['t-prem', 't-u18'], primaryTeamId: 't-prem' } });
  const r = resolveEligibility(crossing, TWO_GROUPS);
  assert.deepEqual(r.teamIds, ['t-u18'], 'the out-of-group team is dropped');
  assert.equal(r.primaryTeamId, 't-u18', 'primary re-derived inside the group');
});

// ── 2. The fallback becomes migration-compatibility only ───────────────────
test('with ONE active group a legacy player still resolves (compatibility path)', () => {
  const legacy = member({ role: 'player' });                    // no playerGroupId
  const r = resolvePlayerGroup(legacy, ONE_GROUP);
  assert.equal(r.groupId, SEN);
  assert.equal(r.source, 'legacy', 'flagged as the temporary path');
  assert.deepEqual(resolveEligibility(legacy, ONE_GROUP).teamIds.sort(), ['t-dev', 't-prem']);
});

test('with MULTIPLE active groups the model refuses to guess', () => {
  const legacy = member({ role: 'player' });
  const r = resolvePlayerGroup(legacy, TWO_GROUPS);
  assert.equal(r.groupId, '', 'no group chosen');
  assert.equal(r.source, 'none');
  assert.equal(r.needsAssignment, true, 'surfaced as a data-integrity state');
  assert.deepEqual(resolveEligibility(legacy, TWO_GROUPS).teamIds, [],
    'never silently placed in the wrong group');
  // And it must not fall back to staff access either.
  const withScope = member({ role: 'player', accessScope: groupScope(SEN) });
  assert.deepEqual(resolveEligibility(withScope, TWO_GROUPS).teamIds, []);
});

test('a staff-only member never derives a player group', () => {
  const staff = member({ role: 'coach', staffLevel: 'head', accessScope: groupScope(SEN) });
  assert.equal(resolvePlayerGroup(staff, ONE_GROUP).groupId, '', 'even with one group');
  assert.equal(playerGroupIdOf(staff), '');
});

// ── 3. Migration ───────────────────────────────────────────────────────────
function seedForMigration(structure, members) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club A', teamName: 'Seniors' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set('app:identity:team_members', JSON.stringify(members));
}
const readMembers = () => JSON.parse(kv.get('app:identity:team_members'));

test('backfill assigns the single active group to legacy players only', async () => {
  seedForMigration(ONE_GROUP, [
    { id: 'p1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active' },
    { id: 'p2', teamId: CLUB, userId: 'u2', role: 'player', status: 'active' },
    { id: 'p3', teamId: CLUB, userId: 'u3', role: 'player', status: 'active', playerGroupId: 'grp-kept' },
    { id: 's1', teamId: CLUB, userId: 'u4', role: 'coach', staffLevel: 'head', status: 'active',
      accessScope: groupScope(SEN), medicalAccess: true },
    { id: 'x1', teamId: CLUB, userId: 'u5', role: 'player', status: 'removed' },
  ]);
  const report = await store.backfillPlayerGroups(CLUB);
  assert.equal(report.applied, true);
  assert.equal(report.assigned, 2, 'only the two legacy players');
  assert.equal(report.groupId, SEN);

  const after = readMembers();
  assert.equal(after.find(m => m.id === 'p1').playerGroupId, SEN);
  assert.equal(after.find(m => m.id === 'p2').playerGroupId, SEN);
  assert.equal(after.find(m => m.id === 'p3').playerGroupId, 'grp-kept', 'existing value never overwritten');
  assert.equal(after.find(m => m.id === 's1').playerGroupId, undefined, 'staff untouched');
  assert.equal(after.find(m => m.id === 'x1').playerGroupId, undefined, 'inactive untouched');

  // Staff access, medical and roles are all untouched.
  const staff = after.find(m => m.id === 's1');
  assert.equal(staff.medicalAccess, true);
  assert.deepEqual(effectiveAccessScope(staff).groups.map(g => g.groupId), [SEN]);
  assert.equal(staff.role, 'coach');
});

test('backfill is idempotent', async () => {
  seedForMigration(ONE_GROUP, [
    { id: 'p1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active' },
  ]);
  const first = await store.backfillPlayerGroups(CLUB);
  const snapshot = kv.get('app:identity:team_members');
  const second = await store.backfillPlayerGroups(CLUB);
  assert.equal(first.assigned, 1);
  assert.equal(second.assigned, 0, 'second run assigns nothing');
  assert.equal(kv.get('app:identity:team_members'), snapshot, 'storage byte-identical');
});

test('backfill refuses when the club has several active groups', async () => {
  seedForMigration(TWO_GROUPS, [
    { id: 'p1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active' },
  ]);
  const before = kv.get('app:identity:team_members');
  const report = await store.backfillPlayerGroups(CLUB);
  assert.equal(report.applied, false);
  assert.equal(report.assigned, 0);
  assert.match(report.reason, /refusing to guess/);
  assert.equal(kv.get('app:identity:team_members'), before, 'nothing written');
});

test('backfill refuses when there is no active group, and supports a dry run', async () => {
  seedForMigration({ version: 1, groups: [{ id: OLD, name: 'Vets', status: 'archived' }], teams: [] }, [
    { id: 'p1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active' },
  ]);
  const none = await store.backfillPlayerGroups(CLUB);
  assert.equal(none.applied, false);
  assert.match(none.reason, /no active group/);

  seedForMigration(ONE_GROUP, [
    { id: 'p1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active' },
  ]);
  const before = kv.get('app:identity:team_members');
  const dry = await store.backfillPlayerGroups(CLUB, { dryRun: true });
  assert.equal(dry.wouldAssign, 1);
  assert.equal(dry.applied, false);
  assert.equal(kv.get('app:identity:team_members'), before, 'dry run writes nothing');
});

// ── 4. setPlayerGroup validation ───────────────────────────────────────────
test('setPlayerGroup validates the group against the club structure', async () => {
  seedForMigration(TWO_GROUPS, [
    { id: 'p1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active', playerGroupId: SEN },
  ]);
  await store.setPlayerGroup('p1', U18, 'u-admin', CLUB);
  assert.equal(readMembers()[0].playerGroupId, U18, 'explicit transfer is allowed');

  for (const [bad, code] of [['grp-nope', 404], ['grp-of-another-club', 404], [OLD, 400]]) {
    await assert.rejects(() => store.setPlayerGroup('p1', bad, 'u-admin', CLUB),
      e => e.status === code, `${bad} rejected`);
  }
  assert.equal(readMembers()[0].playerGroupId, U18, 'unchanged after every rejection');

  // Clearing is allowed (a player becoming staff-only).
  await store.setPlayerGroup('p1', '', 'u-admin', CLUB);
  assert.equal(readMembers()[0].playerGroupId, undefined);
});

// ── 5. Group-aware invitations + claim ─────────────────────────────────────
function seedClub(structure) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club A', teamName: 'Seniors' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set('app:identity:users', JSON.stringify([{ id: 'u-owner', email: 'o@c.test', displayName: 'Owner' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
  ]));
  kv.set('ce:invites', JSON.stringify([]));
}
const buildRes = () => ({
  statusCode: 200, body: null, headers: {},
  status(c) { this.statusCode = c; return this; },
  json(d) { this.body = d; return this; },
  setHeader(n, v) { this.headers[n] = v; }, end() { return this; },
});
async function invite(token, body) {
  const res = buildRes();
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {}, body, on() {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' } }, res);
  return res;
}

test('a player invite carries its group, and the claim stamps it', async () => {
  seedClub(TWO_GROUPS);
  const { token } = await store.createSession({ userId: 'u-owner', teamId: CLUB, role: 'coach' });

  const u18 = await invite(token, { name: 'U18 Kid', role: 'player', playerGroupId: U18, sendEmail: false });
  assert.equal(u18.statusCode, 201, JSON.stringify(u18.body));
  assert.equal(u18.body.invite.playerGroupId, U18);

  const claimed = await store.claimInvite({ token: u18.body.token, name: 'U18 Kid',
    email: 'u18kid@c.test', password: 'Group-2026-Pass!' });
  assert.equal(claimed.teamMember.playerGroupId, U18, 'membership plays for U18');
  const structure = JSON.parse(kv.get(`app:structure:${CLUB}`));
  assert.deepEqual(resolveEligibility(claimed.teamMember, structure).teamIds, ['t-u18'],
    'U18 eligibility only — no Seniors');
});

test('an invalid or unauthorised player group is rejected at creation', async () => {
  seedClub(TWO_GROUPS);
  const { token } = await store.createSession({ userId: 'u-owner', teamId: CLUB, role: 'coach' });
  for (const [gid, code] of [['grp-nope', 404], [OLD, 400], ['grp-of-another-club', 404]]) {
    const res = await invite(token, { name: 'X', role: 'player', playerGroupId: gid, sendEmail: false });
    assert.equal(res.statusCode, code, `${gid}: ${JSON.stringify(res.body)}`);
  }
  // With several groups, omitting it is refused rather than guessed.
  const vague = await invite(token, { name: 'X', role: 'player', sendEmail: false });
  assert.equal(vague.statusCode, 400);
  assert.match(vague.body.error, /Choose which group/);
});

test('with one active group the player group may be omitted', async () => {
  seedClub(ONE_GROUP);
  const { token } = await store.createSession({ userId: 'u-owner', teamId: CLUB, role: 'coach' });
  const res = await invite(token, { name: 'Legacy', role: 'player', sendEmail: false });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.invite.playerGroupId, SEN, 'the only group is unambiguous');
});

// ── 6. Dual role + conflicting claims ──────────────────────────────────────
test('a U18 player who later claims a staff invite keeps their player group', async () => {
  seedClub(TWO_GROUPS);
  const { token } = await store.createSession({ userId: 'u-owner', teamId: CLUB, role: 'coach' });
  const p = await invite(token, { name: 'Dual', role: 'player', playerGroupId: U18, sendEmail: false });
  await store.claimInvite({ token: p.body.token, name: 'Dual', email: 'dual@c.test', password: 'Group-2026-Pass!' });

  // Now a Seniors coaching invite for the same person.
  const c = await invite(token, { name: 'Dual', role: 'coach', staffLevel: 'head',
    scope: { level: 'group', groupId: SEN }, sendEmail: false });
  const after = await store.claimInvite({ token: c.body.token, name: 'Dual',
    email: 'dual@c.test', password: 'Group-2026-Pass!' });

  const stored = JSON.parse(kv.get('app:identity:team_members'))
    .find(m => m.userId === after.teamMember.userId);
  assert.equal(stored.playerGroupId, U18, `STORED playerGroupId (returned=${after.teamMember.playerGroupId})`);
  assert.equal(after.teamMember.playerGroupId, U18, 'still plays for U18');
  // Assert on REACHABLE access: the merge base can also materialise the Phase C
  // legacy derivation (grp_initial), which is not part of this club's structure
  // and therefore grants nothing. What matters is which groups actually resolve.
  const struct0 = JSON.parse(kv.get(`app:structure:${CLUB}`));
  assert.deepEqual(getAccessibleGroups(after.teamMember, struct0).map(g => g.id), [SEN],
    'gains Seniors staff access, and only Seniors');
  const structure = JSON.parse(kv.get(`app:structure:${CLUB}`));
  assert.deepEqual(resolveEligibility(after.teamMember, structure).teamIds, ['t-u18'],
    'playing eligibility stays U18');
  assert.equal(JSON.parse(kv.get('app:identity:team_members'))
    .filter(m => m.userId === after.teamMember.userId).length, 1, 'one membership');
});

test('a conflicting second player-group claim never moves the player silently', async () => {
  seedClub(TWO_GROUPS);
  const { token } = await store.createSession({ userId: 'u-owner', teamId: CLUB, role: 'coach' });
  const first = await invite(token, { name: 'Mover', role: 'player', playerGroupId: U18, sendEmail: false });
  await store.claimInvite({ token: first.body.token, name: 'Mover', email: 'mover@c.test', password: 'Group-2026-Pass!' });

  const second = await invite(token, { name: 'Mover', role: 'player', playerGroupId: SEN, sendEmail: false });
  const after = await store.claimInvite({ token: second.body.token, name: 'Mover',
    email: 'mover@c.test', password: 'Group-2026-Pass!' });

  assert.equal(after.teamMember.playerGroupId, U18, 'original group retained');
  assert.equal(after.teamMember.playerGroupConflictWith, SEN, 'the conflict is recorded for an admin');
  const structure = JSON.parse(kv.get(`app:structure:${CLUB}`));
  assert.deepEqual(resolveEligibility(after.teamMember, structure).teamIds, ['t-u18']);
});

// ── 7. The brief's local scenario ──────────────────────────────────────────
test('local scenario: Seniors player, U18 player, Seniors coach, dual role', () => {
  const seniorsPlayer = member({ id: 'm1', role: 'player', playerGroupId: SEN });
  const u18Player     = member({ id: 'm2', role: 'player', playerGroupId: U18 });
  const seniorsCoach  = member({ id: 'm3', role: 'coach', staffLevel: 'head', accessScope: groupScope(SEN) });
  const dualRole      = member({ id: 'm4', role: 'player', playerGroupId: U18, accessScope: groupScope(SEN) });

  assert.deepEqual(resolveEligibility(seniorsPlayer, TWO_GROUPS).teamIds.sort(), ['t-dev', 't-prem']);
  assert.deepEqual(resolveEligibility(u18Player, TWO_GROUPS).teamIds, ['t-u18']);
  assert.deepEqual(resolveEligibility(seniorsCoach, TWO_GROUPS).teamIds, [], 'coach does not play');
  assert.deepEqual(resolveEligibility(dualRole, TWO_GROUPS).teamIds, ['t-u18'], 'plays U18 only');
  assert.deepEqual(effectiveAccessScope(dualRole).groups.map(g => g.groupId), [SEN], 'coaches Seniors');

  // eligibleTeams resolves the same way against the live structure.
  assert.deepEqual(eligibleTeams(u18Player, TWO_GROUPS).map(t => t.name), ['U18']);
  assert.deepEqual(eligibleTeams(seniorsCoach, TWO_GROUPS), []);
});
