/**
 * RC4.7 Phase C.1 — dual-role member integrity.
 *
 * One email → one user → one membership, which may hold BOTH a player profile
 * (with roster history and squad eligibility) AND staff access. Claiming a
 * staff invitation must merge the new role/scope on top of existing player
 * state, never destroy it.
 *
 * Before this fix, claimInvite HARD-DELETED the claimer's player profile —
 * including legacyPlayerId, the key linking their availability history.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.dual-role.test';
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
const { effectiveAccessScope, effectiveEligibility, getAccessibleGroups, eligibleTeams, canViewGroup } = await import('../api/_accessScope.js');

const CLUB = 'boitsfort-rugby-club';
const PASSWORD = 'Dual-Role-2026!';

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
  ],
};

const read = key => JSON.parse(kv.get(key) || '[]');
const profilesOf = userId => read('app:identity:player_profiles').filter(p => p.userId === userId);
const membersOf = userId => read('app:identity:team_members').filter(m => m.userId === userId);
const usersWith = email => read('app:identity:users').filter(u => u.email === email);

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort Rugby Club', teamName: 'Seniors' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('app:identity:users', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('ce:invites', JSON.stringify([]));
}

/** Mint an invite directly in storage — the creation gates are tested elsewhere. */
function putInvite(invite) {
  const invites = read('ce:invites');
  invites.unshift({
    token: `tok-${invites.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
    name: '', email: '', status: 'pending', teamId: CLUB,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 864e5).toISOString(),
    createdBy: 'u-owner', acceptedAt: null,
    ...invite,
  });
  kv.set('ce:invites', JSON.stringify(invites));
  return invites[0].token;
}

/** An established player: membership + profile + explicit dual eligibility. */
async function seedEstablishedPlayer(email = 'dual@club.test') {
  // The shipped invite creator ALWAYS stamps playerGroupId on player invites
  // (derived from the scope when needed) — model exactly that shape.
  const token = putInvite({ role: 'player', scope: { groupId: 'grp-senior-men' }, playerGroupId: 'grp-senior-men' });
  const claimed = await store.claimInvite({ token, name: 'Dual Role Person', email, password: PASSWORD });
  const members = read('app:identity:team_members');
  const member = members.find(m => m.id === claimed.teamMember.id);
  member.playerEligibility = { teamIds: ['team-senior-1', 'team-senior-2'], primaryTeamId: 'team-senior-2' };
  kv.set('app:identity:team_members', JSON.stringify(members));
  return claimed;
}

test.beforeEach(() => seed());

// ── 1-5: an existing player claims each kind of staff invitation ────────────
for (const [label, invite] of [
  ['coach', { role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-senior-men' } }],
  ['medical', { role: 'medical', scope: { groupId: 'grp-senior-men' } }],
  ['admin', { role: 'admin', scope: { clubWide: true } }],
]) {
  test(`existing player claiming a ${label} invite keeps their player profile and squad state`, async () => {
    const player = await seedEstablishedPlayer();
    const profileBefore = profilesOf(player.user.id)[0];
    assert.ok(profileBefore, 'player profile exists before the staff claim');
    const legacyIdBefore = profileBefore.legacyPlayerId;

    const token = putInvite(invite);
    const claimed = await store.claimInvite({
      token, name: 'Dual Role Person', email: 'dual@club.test', password: PASSWORD,
    });

    // Player profile survives, same record — history intact.
    const after = profilesOf(player.user.id);
    assert.equal(after.length, 1, `${label}: exactly one profile, still present`);
    assert.equal(after[0].id, profileBefore.id, 'the SAME profile record');
    assert.equal(after[0].legacyPlayerId, legacyIdBefore,
      'legacyPlayerId preserved — availability history stays linked');

    // Staff role applied to the same single membership.
    assert.equal(claimed.teamMember.role, invite.role, `${label}: staff role applied`);
    assert.equal(membersOf(player.user.id).length, 1, 'no duplicate membership');
    assert.equal(usersWith('dual@club.test').length, 1, 'no duplicate user');

    // Eligibility and primary squad survive the role change.
    const elig = effectiveEligibility(claimed.teamMember);
    assert.deepEqual(elig.teamIds, ['team-senior-1', 'team-senior-2'], `${label}: eligibility preserved`);
    assert.equal(elig.primaryTeamId, 'team-senior-2', `${label}: primary squad preserved`);
  });
}

test('a legacy player with only DERIVED eligibility keeps it after a staff claim', async () => {
  // No stored eligibility at all — the derivation must be materialised rather
  // than silently lost when the role flips to staff.
  // Claim through a modern scoped invite, then strip BOTH eligibility and
  // playerGroupId to model the true pre-D1a legacy member (a group-less
  // player invite is no longer claimable in a multi-group club by design).
  const token = putInvite({ role: 'player', scope: { groupId: 'grp-senior-men' }, playerGroupId: 'grp-senior-men' });
  const player = await store.claimInvite({
    token, name: 'Legacy Player', email: 'legacy@club.test', password: PASSWORD });
  const members = read('app:identity:team_members');
  const m = members.find(x => x.id === player.teamMember.id);
  delete m.playerEligibility;
  delete m.playerGroupId;
  kv.set('app:identity:team_members', JSON.stringify(members));
  const derivedBefore = effectiveEligibility(read('app:identity:team_members')
    .find(x => x.id === player.teamMember.id));
  assert.ok(derivedBefore.teamIds.length, 'derives the initial team as a player');

  const staffToken = putInvite({ role: 'coach', staffLevel: 'assistant' });
  const claimed = await store.claimInvite({
    token: staffToken, name: 'Legacy Player', email: 'legacy@club.test', password: PASSWORD });

  assert.equal(profilesOf(player.user.id).length, 1, 'profile preserved');
  const after = effectiveEligibility(claimed.teamMember);
  assert.deepEqual(after.teamIds, derivedBefore.teamIds, 'eligibility materialised, not lost');
});

// ── 6: staff later gains player eligibility ─────────────────────────────────
test('an existing staff member can gain player eligibility without losing staff access', async () => {
  const token = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-u18' } });
  const coach = await store.claimInvite({
    token, name: 'Playing Coach', email: 'coach@club.test', password: PASSWORD });
  const scopeBefore = effectiveAccessScope(coach.teamMember);

  await store.setPlayerEligibility(coach.teamMember.id,
    { teamIds: ['team-u18'], primaryTeamId: 'team-u18' }, 'u-owner', CLUB);

  const member = membersOf(coach.user.id)[0];
  assert.deepEqual(effectiveEligibility(member).teamIds, ['team-u18'], 'eligibility granted');
  assert.equal(member.role, 'coach', 'still staff');
  assert.deepEqual(effectiveAccessScope(member), scopeBefore, 'staff scope untouched');
  assert.equal(membersOf(coach.user.id).length, 1, 'still one membership');
});

// ── 7-8: brand-new invitees ─────────────────────────────────────────────────
test('a brand-new staff-only invitee gets NO player profile', async () => {
  const token = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-u18' } });
  const claimed = await store.claimInvite({
    token, name: 'Fresh Coach', email: 'fresh.coach@club.test', password: PASSWORD });
  assert.equal(profilesOf(claimed.user.id).length, 0, 'no roster profile created');
  assert.equal(claimed.playerProfile, null, 'claim reports no profile');
  assert.deepEqual(effectiveEligibility(claimed.teamMember).teamIds, [], 'no eligibility derived');
});

test('a brand-new player invitee gets the right profile and eligibility', async () => {
  const token = putInvite({ role: 'player', scope: { teamId: 'team-senior-1' }, playerGroupId: 'grp-senior-men' });
  const claimed = await store.claimInvite({
    token, name: 'Fresh Player', email: 'fresh.player@club.test', password: PASSWORD,
    position: 'Prop' });
  const profiles = profilesOf(claimed.user.id);
  assert.equal(profiles.length, 1, 'profile created');
  assert.equal(profiles[0].teamId, CLUB);
  assert.deepEqual(effectiveEligibility(claimed.teamMember).teamIds, ['team-senior-1']);
  assert.equal(effectiveAccessScope(claimed.teamMember).clubWide, false, 'no staff access granted');
});

// ── 9-12: merge, no duplicates, no elevation, scope validation ──────────────
test('existing access grants are merged, never reduced', async () => {
  const player = await seedEstablishedPlayer();   // group: senior men
  const token = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-u18' } });
  const claimed = await store.claimInvite({
    token, name: 'Dual Role Person', email: 'dual@club.test', password: PASSWORD });

  const scope = effectiveAccessScope(claimed.teamMember);
  const groups = scope.groups.filter(g => g.status === 'active').map(g => g.groupId).sort();
  assert.deepEqual(groups, ['grp-senior-men', 'grp-u18'],
    'the new grant is ADDED to the one they already held');
  assert.equal(profilesOf(player.user.id).length, 1, 'player profile still intact');
});

test('a client cannot elevate scope through the claim request', async () => {
  const token = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-u18' } });
  const claimed = await store.claimInvite({
    token, name: 'Sneaky', email: 'sneaky@club.test', password: PASSWORD,
    // All ignored — only the STORED invite scope is applied.
    scope: { level: 'club' }, accessScope: { clubWide: true },
    playerEligibility: { teamIds: ['team-senior-1', 'team-senior-2'] },
    role: 'admin', isOwner: true,
  });
  const scope = effectiveAccessScope(claimed.teamMember);
  assert.equal(scope.clubWide, false, 'no club-wide elevation');
  assert.deepEqual(scope.groups.filter(g => g.status === 'active').map(g => g.groupId), ['grp-u18']);
  assert.equal(claimed.teamMember.role, 'coach', 'role comes from the invite, not the request');
  assert.notEqual(claimed.teamMember.isOwner, true, 'ownership cannot be claimed');
  assert.deepEqual(effectiveEligibility(claimed.teamMember).teamIds, [],
    'client-supplied eligibility ignored for a staff-only claimer');
});

test('archived and cross-club scopes on an invite are ignored, never granted', async () => {
  // An invalid invite scope grants NOTHING. The member is then left on the
  // standard legacy derivation (grp_initial), which is not part of this club's
  // stored structure and therefore resolves to no accessible scope at all —
  // so what matters is the resolved access, not the raw grant list.
  const structure = JSON.parse(kv.get(`app:structure:${CLUB}`));

  const archived = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-old' } });
  const a = await store.claimInvite({
    token: archived, name: 'Arch', email: 'arch@club.test', password: PASSWORD });
  assert.equal(effectiveAccessScope(a.teamMember).groups.some(g => g.groupId === 'grp-old'), false,
    'the archived group was never granted');
  assert.deepEqual(getAccessibleGroups(a.teamMember, structure), [], 'no reachable group');
  assert.equal(canViewGroup({ user: { id: a.user.id }, teamMember: a.teamMember }, structure, 'grp-old'),
    false, 'archived scope remains unreachable');

  const foreign = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-of-another-club' } });
  const f = await store.claimInvite({
    token: foreign, name: 'Foreign', email: 'foreign@club.test', password: PASSWORD });
  assert.equal(effectiveAccessScope(f.teamMember).groups.some(g => g.groupId === 'grp-of-another-club'),
    false, 'the cross-club group was never granted');
  assert.deepEqual(getAccessibleGroups(f.teamMember, structure), [], 'no reachable group');

  // A tampered PLAYER invite naming only a foreign team carries no player
  // group — in a multi-group club the claim guard now refuses it outright,
  // before any account or membership write (stronger than the old
  // claim-but-grant-nothing behaviour).
  const foreignTeam = putInvite({ role: 'player', scope: { teamId: 'team-of-another-club' } });
  await assert.rejects(
    () => store.claimInvite({
      token: foreignTeam, name: 'Foreign Two', email: 'foreign2@club.test', password: PASSWORD }),
    err => err.status === 410);
  assert.equal(usersWith('foreign2@club.test').length, 0, 'no account was created');
});

test('claiming twice creates no duplicate user, membership or profile', async () => {
  const player = await seedEstablishedPlayer();
  const t1 = putInvite({ role: 'coach', staffLevel: 'head', scope: { groupId: 'grp-u18' } });
  await store.claimInvite({ token: t1, name: 'Dual Role Person', email: 'dual@club.test', password: PASSWORD });
  const t2 = putInvite({ role: 'medical', scope: { groupId: 'grp-senior-men' } });
  await store.claimInvite({ token: t2, name: 'Dual Role Person', email: 'dual@club.test', password: PASSWORD });

  assert.equal(usersWith('dual@club.test').length, 1, 'one user');
  assert.equal(membersOf(player.user.id).length, 1, 'one membership');
  assert.equal(profilesOf(player.user.id).length, 1, 'one profile');
});
