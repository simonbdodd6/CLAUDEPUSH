/**
 * RC4.7 Phase B — deterministic structure migration + legacy scope derivation.
 *
 * The migration is COMPUTED, never written on read (the c79c07a8 rule):
 * loadClubStructure synthesizes the initial group/team purely; membership
 * scope derives from the documented role mapping at authorization time.
 * Persistence happens only through explicit calls and is idempotent.
 *
 * Covers Phase B scenarios 18-21 and the no-write guarantees.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.structure-migration.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
let writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); writes.push(args[0]); result = 'OK'; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const {
  loadClubStructure, persistClubStructure, synthesizeInitialStructure,
  INITIAL_GROUP_ID, INITIAL_TEAM_ID, groupById, teamById,
  assertGroupBelongsToClub, assertTeamBelongsToClub,
} = await import('../api/_structureStore.js');
const { effectiveAccessScope, effectiveEligibility } = await import('../api/_accessScope.js');

const CLUB = 'boitsfort-rugby-club';
const seedClub = () => kv.set('app:identity:teams', JSON.stringify([
  { id: CLUB, name: 'Boitsfort Rugby Club', teamName: 'Seniors', teamCode: 'BOITSF42' },
]));

const member = over => ({ id: 'tm-x', teamId: CLUB, userId: 'u-x', status: 'active', ...over });

// ── Structure synthesis ─────────────────────────────────────────────────────
test('a pre-structure club presents one deterministic initial group and team', async () => {
  kv.clear(); writes = []; seedClub();
  const s = await loadClubStructure(CLUB);
  assert.equal(s.synthesized, true);
  assert.equal(s.groups.length, 1);
  assert.equal(s.teams.length, 1);
  assert.equal(s.groups[0].id, INITIAL_GROUP_ID);
  assert.equal(s.teams[0].id, INITIAL_TEAM_ID);
  assert.equal(s.teams[0].groupId, INITIAL_GROUP_ID);
  assert.equal(s.groups[0].name, 'Seniors', 'named from the club record');
  assert.equal(s.groups[0].status, 'active');
});

test('loading the structure NEVER writes — reads cannot mutate production', async () => {
  kv.clear(); writes = []; seedClub();
  await loadClubStructure(CLUB);
  await loadClubStructure(CLUB);
  await loadClubStructure(CLUB);
  assert.deepEqual(writes, [], 'zero SET commands issued by reads');
  assert.equal(kv.has(`app:structure:${CLUB}`), false, 'nothing persisted');
});

test('synthesis is pure and deterministic — same club, same result, every call', async () => {
  kv.clear(); seedClub();
  const a = await loadClubStructure(CLUB);
  const b = await loadClubStructure(CLUB);
  assert.deepEqual(a, b);
  const c = synthesizeInitialStructure(CLUB, { teamName: 'Seniors' });
  assert.equal(c.groups[0].id, a.groups[0].id);
  assert.equal(c.teams[0].id, a.teams[0].id);
});

test('a club with no record at all still synthesizes safely', async () => {
  kv.clear(); writes = [];
  const s = await loadClubStructure('some-unknown-club');
  assert.equal(s.groups[0].name, 'First Team', 'documented fallback name');
  assert.deepEqual(writes, []);
});

// ── 21 + persistence ────────────────────────────────────────────────────────
test('21. persisting twice (and loading after) creates no duplicates', async () => {
  kv.clear(); writes = []; seedClub();
  const first = await persistClubStructure(CLUB);
  const second = await persistClubStructure(CLUB);
  const third = await loadClubStructure(CLUB);
  for (const s of [first, second, third]) {
    assert.equal(s.groups.length, 1, 'exactly one group, always');
    assert.equal(s.teams.length, 1, 'exactly one team, always');
  }
  assert.equal(writes.filter(k => k === `app:structure:${CLUB}`).length, 1,
    'the record was written exactly once');
  assert.equal(third.synthesized, false, 'now stored');
});

test('a stored structure wins over synthesis and normalizes malformed entries', async () => {
  kv.clear(); seedClub();
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [
      { id: 'grp-senior-men', name: 'Senior Men', status: 'active' },
      { id: '', name: 'ghost' },                       // no id → dropped
      null,                                            // malformed → dropped
      { id: 'grp-u18', name: 'U18', status: 'bogus' }, // bad status → active
    ],
    teams: [
      { id: 'team-senior-1', groupId: 'grp-senior-men', name: 'Senior 1' },
      { id: 'team-orphan' },                           // no groupId → dropped
    ],
  }));
  const s = await loadClubStructure(CLUB);
  assert.deepEqual(s.groups.map(g => g.id), ['grp-senior-men', 'grp-u18']);
  assert.equal(s.groups[1].status, 'active');
  assert.deepEqual(s.teams.map(t => t.id), ['team-senior-1']);
  assert.equal(groupById(s, INITIAL_GROUP_ID), null, 'synthesized ids gone once stored');
});

test('belongs-to-club guards throw 404 for foreign or unknown ids', async () => {
  kv.clear(); seedClub();
  const s = await loadClubStructure(CLUB);
  assert.equal(assertGroupBelongsToClub(s, INITIAL_GROUP_ID).id, INITIAL_GROUP_ID);
  assert.equal(assertTeamBelongsToClub(s, INITIAL_TEAM_ID).id, INITIAL_TEAM_ID);
  for (const [fn, id] of [[assertGroupBelongsToClub, 'grp-other-club'], [assertTeamBelongsToClub, 'team-other-club']]) {
    try { fn(s, id); assert.fail('should throw'); }
    catch (e) { assert.equal(e.status, 404); }
  }
});

// ── 18-20: membership scope derivation (the documented mapping) ─────────────
test('18. Existing owner derives club-wide access', () => {
  const scope = effectiveAccessScope(member({ role: 'coach', staffLevel: 'head', isOwner: true, accessProfile: 'full' }));
  assert.equal(scope.clubWide, true);
});

test('explicit full profile and admin/dor roles derive club-wide access', () => {
  for (const m of [
    member({ role: 'coach', staffLevel: 'head', accessProfile: 'full' }),  // explicit RC4.9C assignment
    member({ role: 'admin' }),
    member({ role: 'dor' }),
  ]) {
    assert.equal(effectiveAccessScope(m).clubWide, true, JSON.stringify(m));
  }
});

test('19. Existing coach derives the initial group — NOT the whole club', () => {
  for (const m of [
    member({ role: 'coach', staffLevel: 'head' }),        // derived-full by role, not explicit
    member({ role: 'coach', staffLevel: 'assistant' }),
    member({ role: 'coach', staffLevel: 'manager' }),
    member({ role: 'medical' }),
    member({ role: 'snc' }),
    member({ role: 'analyst' }),
  ]) {
    const scope = effectiveAccessScope(m);
    assert.equal(scope.clubWide, false, JSON.stringify(m));
    assert.deepEqual(scope.groups.map(g => g.groupId), [INITIAL_GROUP_ID]);
    assert.deepEqual(scope.teams, []);
  }
});

test('20. Existing player derives the initial group + initial-team eligibility', () => {
  const m = member({ role: 'player' });
  const scope = effectiveAccessScope(m);
  assert.equal(scope.clubWide, false);
  assert.deepEqual(scope.groups.map(g => g.groupId), [INITIAL_GROUP_ID]);
  const elig = effectiveEligibility(m);
  assert.deepEqual(elig.teamIds, [INITIAL_TEAM_ID]);
  assert.equal(elig.primaryTeamId, INITIAL_TEAM_ID);
});

test('eligibility never derives for staff, and a stored scope always wins', () => {
  assert.deepEqual(effectiveEligibility(member({ role: 'coach', staffLevel: 'head' })).teamIds, []);
  const stored = member({ role: 'coach', staffLevel: 'head',
    accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } });
  const scope = effectiveAccessScope(stored);
  assert.equal(scope.clubWide, false);
  assert.deepEqual(scope.groups.map(g => g.groupId), ['grp-u18'], 'stored scope beats derivation');
  // Storing an explicitly EMPTY scope means exactly that — no scopes.
  const revoked = member({ role: 'coach', staffLevel: 'head',
    accessScope: { clubWide: false, groups: [], teams: [] } });
  assert.deepEqual(effectiveAccessScope(revoked).groups, [], 'empty stored scope is honoured');
});
