/**
 * PERFORMANCE — DUAL-ROLE COACH / PLAYER.
 *
 * One person can hold TWO capacities: they coach one group and play in
 * another. Core already models this. `operationalGroupsFor(member, structure,
 * { as: 'staff' | 'player' })` answers each capacity separately, and
 * `isPlayingMember()` is the canonical "does this person play?" predicate —
 * an explicit playerGroupId OR the player role.
 *
 * Performance did not use it. Its athlete enumeration asked
 * `canonicalRole(m) === 'player'`, which is a ROLE test, and a coach is
 * head_coach/assistant/manager whatever else is true of them. So a coach who
 * also plays was invisible as an athlete — four such members exist at
 * Boitsfort today.
 *
 * The two capacities must NOT be collapsed. Coaching scope decides who they
 * may programme FOR. Their playerGroupId decides who they ARE as an athlete.
 * A member who coaches U18 and plays Seniors gets U18 athletes to work with
 * and a Seniors athlete record of their own, and neither grants the other.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.dualrole.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

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

const identity = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { isPlayingMember, playerGroupIdOf } = await import('../api/_accessScope.js');
const { canonicalRole } = await import('../api/_permissions.js');
const { authoringProfileFrom } = await import('../performance/domain/authoring-profile.js');
const { createEmptyProfile } = await import('../performance/domain/athlete-profile.js');

const CLUB = 'club-dual', OTHER = 'club-other';
const SEN = 'grp-seniors', U18 = 'grp-u18', U16 = 'grp-u16';
const scope = (...g) => ({ clubWide: false, groups: g.map(id => ({ groupId: id, role: 'coach', status: 'active' })), teams: [] });

const MEMBERS = [
  // Plain athletes.
  { id: 'm-sp', teamId: CLUB, userId: 'u-sen-player', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-up', teamId: CLUB, userId: 'u-u18-player', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-16p', teamId: CLUB, userId: 'u-u16-player', role: 'player', status: 'active', playerGroupId: U16 },
  // A legacy athlete with NO group at all — must keep appearing.
  { id: 'm-np', teamId: CLUB, userId: 'u-nogroup-player', role: 'player', status: 'active' },
  // Staff only. No playerGroupId — must NEVER become an athlete.
  { id: 'm-sc', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', staffLevel: 'assistant', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-uc', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', staffLevel: 'assistant', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18) },
  // THE DUAL-ROLE MEMBER: coaches U18, plays Seniors.
  { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', staffLevel: 'assistant', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18), playerGroupId: SEN },
  // A head coach / owner who also plays — the Boitsfort shape.
  { id: 'm-own', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head', isOwner: true,
    status: 'active', accessProfile: 'full' },
  // Medical, and another club.
  { id: 'm-med', teamId: CLUB, userId: 'u-medic', role: 'medical', status: 'active' },
  { id: 'm-ot', teamId: OTHER, userId: 'u-other-coach', role: 'coach', staffLevel: 'head', status: 'active', accessProfile: 'full' },
];

function seed({ plan = 'pro' } = {}) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Dual Club', plan, planStatus: 'active' },
    { id: OTHER, name: 'Other Club', plan: 'pro', planStatus: 'active' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify(
    MEMBERS.filter(m => m.role === 'player').map(m => ({ teamId: m.teamId, userId: m.userId }))));
  const groups = [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active', developmentCategory: 'adult' },
    { id: U18, name: 'U18', type: 'general', status: 'active', developmentCategory: 'youth_u18' },
    { id: U16, name: 'U16', type: 'general', status: 'active', developmentCategory: 'youth_u16' },
  ];
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups, teams: [] }));
  // The OTHER club deliberately reuses the same group NAMES with different ids.
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1, groups: [
    { id: 'grp-other-sen', name: 'Seniors', type: 'general', status: 'active', developmentCategory: 'adult' },
    { id: 'grp-other-u18', name: 'U18', type: 'general', status: 'active', developmentCategory: 'youth_u18' }], teams: [] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p1', userId: 'u-sen-player', name: 'Senior Player', position: 'LOCK' },
    { id: 'p2', userId: 'u-u18-player', name: 'U18 Player', position: 'WING' },
    { id: 'p3', userId: 'u-u16-player', name: 'U16 Player', position: 'CENTRE' },
    { id: 'p4', userId: 'u-nogroup-player', name: 'Ungrouped Player', position: 'PROP' },
    { id: 'p5', userId: 'u-dual', name: 'Dual Role', position: 'FLANKER' },
    { id: 'p6', userId: 'u-owner', name: 'Owner Coach', position: 'HOOKER' } ] }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await identity.createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${identity.SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() { const o = { code: 0, body: null };
  return { status(c) { o.code = c; return this; }, json(b) { o.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return o; } }; }
const call = async (u, { method = 'GET', body = null, query = {} } = {}) => {
  const r = res();
  await publishHandler({ method, body, query: { resource: 'performance', ...query },
    headers: { cookie: cookies.get(u) || '' } }, r);
  return r.result;
};
function profileFor(ageBand = '21_29') {
  const p = createEmptyProfile({ now: '2026-08-25T00:00:00.000Z' });
  p.personal.ageBand = ageBand;
  p.rugby.primaryPosition = 'flanker'; p.rugby.playingLevel = 'club'; p.rugby.seasonPhase = 'pre_season';
  p.training.experience = 'intermediate'; p.training.techConfidence = 'developing';
  p.equipment.locations = ['full_gym']; p.equipment.items = ['barbell'];
  p.schedule.availableDays = ['Mon', 'Wed']; p.schedule.matchDay = 'Sat';
  p.goals = [{ type: 'strength', importance: 4 }];
  p.pain = { present: true, area: 'left knee', severity: 'moderate', note: 'sore', trainingRestricted: true };
  p.health.movementsToAvoid = ['deep_knee_flexion'];
  return authoringProfileFrom(p, { now: new Date('2026-08-25') });
}
const athleteIds = body => (body?.athletes || []).map(a => a.userId).sort();

// ── The predicate itself — the Core convention, not a Performance invention ─

test('1: isPlayingMember is the canonical capacity test, and Performance uses it', async () => {
  const byId = id => MEMBERS.find(m => m.userId === id);
  assert.equal(isPlayingMember(byId('u-sen-player')), true, 'a plain athlete plays');
  assert.equal(isPlayingMember(byId('u-nogroup-player')), true, 'so does a legacy athlete with no group');
  assert.equal(isPlayingMember(byId('u-dual')), true, 'so does a coach WITH a playerGroupId');
  assert.equal(isPlayingMember(byId('u-sen-coach')), false, 'a coach with no playerGroupId does NOT');
  assert.equal(isPlayingMember(byId('u-owner')), false, 'nor does an owner with no playerGroupId');
  assert.equal(isPlayingMember(byId('u-medic')), false, 'nor a medic');
  // Capacity is never derived from the role alone.
  assert.equal(canonicalRole(byId('u-dual')), 'assistant', 'the dual member is still STAFF by role');
  assert.equal(playerGroupIdOf(byId('u-dual')), SEN, 'and an athlete by group');

  const src = await (await import('node:fs/promises')).readFile(new URL('../api/publish.js', import.meta.url), 'utf8');
  const start = src.indexOf('function scopedAthleteIds');
  const body = src.slice(start, src.indexOf('\n}', start));
  assert.match(body, /isPlayingMember/, 'enumeration asks the capacity question');
  assert.doesNotMatch(body, /canonicalRole\(m\) === 'player'/, 'not the role question');
});

// ── Invariants 1-3: who is an athlete ─────────────────────────────────────

test('2: a normal player is still an athlete (unchanged)', async () => {
  seed(); await login('u-owner');
  const r = await call('u-owner');
  assert.equal(r.code, 200);
  assert.ok(athleteIds(r.body).includes('u-sen-player'));
  assert.ok(athleteIds(r.body).includes('u-nogroup-player'), 'including a legacy athlete with no group');
});

test('3: a coach WITHOUT a playerGroupId is NOT an athlete', async () => {
  seed(); await login('u-owner');
  const ids = athleteIds((await call('u-owner')).body);
  for (const staffOnly of ['u-sen-coach', 'u-u18-coach', 'u-owner', 'u-medic']) {
    assert.equal(ids.includes(staffOnly), false, `${staffOnly} must not appear as an athlete`);
  }
});

test('4: a dual-role coach/player DOES appear as an athlete', async () => {
  seed(); await login('u-owner');
  const ids = athleteIds((await call('u-owner')).body);
  assert.ok(ids.includes('u-dual'), 'the member who coaches U18 and plays Seniors is an athlete');
  const entry = (await call('u-owner')).body.athletes.find(a => a.userId === 'u-dual');
  assert.equal(entry.groupId, SEN, 'listed under the group they PLAY in, not the one they coach');
});

// ── Invariant 4: athlete scope follows playerGroupId, never a name ─────────

test('5: a scoped coach sees a dual-role athlete only if they coach the group that member PLAYS in', async () => {
  seed(); await login('u-sen-coach'); await login('u-u18-coach');
  // u-dual PLAYS Seniors. The Seniors coach may programme for them.
  const sen = athleteIds((await call('u-sen-coach')).body);
  assert.ok(sen.includes('u-dual'), 'the Seniors coach sees the member who plays Seniors');
  // The U18 coach coaches the group u-dual COACHES, not the one they play in.
  const u18 = athleteIds((await call('u-u18-coach')).body);
  assert.equal(u18.includes('u-dual'), false,
    'coaching the same group as someone does not make them your athlete');
  assert.ok(u18.includes('u-u18-player'), 'but their real U18 athletes are there');
});

test('6: group NAME is never identity — another club reuses the same labels', async () => {
  seed(); await login('u-other-coach');
  const r = await call('u-other-coach');
  assert.equal(athleteIds(r.body).length, 0, 'the other club has no athletes of its own here');
  assert.equal(JSON.stringify(r.body).includes('u-dual'), false, 'and never sees ours');
});

// ── Invariants 5-7: tenant, unknown, out of scope ─────────────────────────

test('7: cross-tenant is impossible even naming the athlete directly', async () => {
  seed(); await login('u-other-coach');
  const r = await call('u-other-coach', { query: { athleteProfile: 'u-dual' } });
  assert.ok(r.code === 403 || r.code === 404, `refused (got ${r.code})`);
  assert.equal(JSON.stringify(r.body).includes('flanker'), false, 'no profile content leaked');
});

test('8: an unknown athlete is 404, an out-of-scope athlete is 403', async () => {
  seed(); await login('u-u18-coach');
  assert.equal((await call('u-u18-coach', { query: { athleteProfile: 'nobody' } })).code, 404);
  // u-dual plays Seniors; the U18 coach does not coach Seniors.
  assert.equal((await call('u-u18-coach', { query: { athleteProfile: 'u-dual' } })).code, 403);
});

// ── Invariant 3 continued: capacities do not leak into each other ──────────

test('9: a dual-role member keeps their COACH scope and gains nothing from playing', async () => {
  seed(); await login('u-dual');
  const r = await call('u-dual');
  assert.equal(r.code, 200);
  assert.equal(r.body.capacity, 'staff', 'they are still staff');
  const ids = athleteIds(r.body);
  assert.deepEqual(ids, ['u-u18-player'], 'exactly their U18 coaching scope');
  assert.equal(ids.includes('u-sen-player'), false,
    'playing Seniors does NOT let them programme for Seniors athletes');
  assert.equal(ids.includes('u-dual'), false, 'and they are not their own coaching subject');
});

test('10: a dual-role member cannot author for an athlete outside their COACHING scope', async () => {
  seed(); await login('u-dual');
  const r = await call('u-dual', { method: 'POST', body: {
    op: 'save_draft', title: 'X', athleteUserId: 'u-sen-player', goal: 'strength' } });
  assert.equal(r.code, 403, 'their player group grants no authoring rights');
});

// ── Invariant 12: they can resolve their OWN athlete identity ──────────────

test('11: a dual-role member receives their OWN athlete data, separately from their coaching list', async () => {
  seed(); await login('u-dual');
  await call('u-dual', { method: 'POST', body: { op: 'save_athlete_profile', profile: profileFor() } });
  const r = await call('u-dual');
  assert.equal(r.code, 200);
  assert.ok(r.body.self, 'the staff payload carries a `self` block');
  assert.ok(r.body.self.profile, 'including their own profile');
  assert.equal(r.body.self.profile.athleteUserId, 'u-dual');
  assert.ok(Array.isArray(r.body.self.assignments), 'and their own assignments');
});

test('12: `self` is ONLY ever the caller — never another athlete', async () => {
  seed(); await login('u-dual'); await login('u-u18-player');
  await call('u-u18-player', { method: 'POST', body: { op: 'save_athlete_profile', profile: profileFor('16_17') } });
  const r = await call('u-dual');
  assert.equal(r.body.self.profile?.athleteUserId ?? 'u-dual', 'u-dual',
    "another athlete's profile never appears as self");
  // athleteUserId is null in a player projection, so identity is proved by the
  // profile block and by the ABSENCE of the other athlete's data.
  assert.equal(JSON.stringify(r.body.self).includes('16_17'), false,
    "the other athlete's age band never appears in self");
});

test('13: a staff-only coach gets a `self` block that is empty, not another athlete\'s', async () => {
  seed(); await login('u-sen-coach'); await login('u-sen-player');
  await call('u-sen-player', { method: 'POST', body: { op: 'save_athlete_profile', profile: profileFor() } });
  const r = await call('u-sen-coach');
  assert.equal(r.body.self?.profile ?? null, null, 'a coach who does not play has no profile of their own');
  assert.deepEqual(r.body.self?.assignments ?? [], [], 'and no assignments of their own');
  // The athlete's profile is still reachable through the AUTHORING route.
  const authoring = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(authoring.code, 200, 'coaching access is unaffected');
});

// ── Invariant 8: the U16/U18 restriction gate is untouched ─────────────────

test('14: dual-role status never bypasses the U16/U18 restriction gate', async () => {
  seed(); await login('u-u18-coach'); await login('u-u18-player');
  await call('u-u18-player', { method: 'POST', body: { op: 'save_athlete_profile', profile: profileFor('16_17') } });
  const r = await call('u-u18-coach', { query: { athleteProfile: 'u-u18-player' } });
  assert.equal(r.code, 200);
  const rest = r.body.profile.restrictions;
  assert.equal(rest.trainingRestricted, false, 'withheld for a minor');
  assert.equal(rest.hasMovementRestrictions, false);
  assert.equal(rest.restrictionsKnown, false);
  assert.equal(JSON.stringify(r.body).includes('left knee'), false, 'and no pain detail at all');
});

test('15: an ADULT dual-role member\'s own restriction flags still work normally', async () => {
  seed(); await login('u-dual'); await login('u-sen-coach');
  await call('u-dual', { method: 'POST', body: { op: 'save_athlete_profile', profile: profileFor('21_29') } });
  // Their Seniors coach may read the projection; they are an adult in an adult squad.
  const r = await call('u-sen-coach', { query: { athleteProfile: 'u-dual' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.profile.restrictions.trainingRestricted, true, 'adults are unaffected by the gate');
});

// ── Invariant 9: no medical widening ──────────────────────────────────────

test('16: dual-role status grants no medical access, and no health data', async () => {
  seed(); await login('u-dual'); await login('u-sen-coach');
  await call('u-dual', { method: 'POST', body: { op: 'save_athlete_profile', profile: profileFor() } });
  const r = await call('u-sen-coach', { query: { athleteProfile: 'u-dual' } });
  const raw = JSON.stringify(r.body);
  for (const banned of ['left knee', 'sore', 'deep_knee_flexion', 'wellness', 'injuryHistory', 'physio']) {
    assert.equal(raw.includes(banned), false, `${banned} must never reach a Performance coach`);
  }
  // A medic still has no Performance authoring at all.
  await login('u-medic');
  const med = await call('u-medic');
  assert.equal(med.code, 403, 'medical role has no publish_training, so no Performance authoring');
});

// ── Invariant 2 continued: entitlement still per club ─────────────────────

test('17: an unentitled club has no athletes at all, dual-role or otherwise', async () => {
  seed({ plan: 'trial' }); await login('u-owner');
  const r = await call('u-owner');
  assert.equal(r.code, 402, 'entitlement is checked before any enumeration');
  assert.equal(JSON.stringify(r.body).includes('u-dual'), false);
});


// ── CLIENT: "mine" must never be read out of the coaching list ─────────────
//
// perfLiveAssignment/perfCurrentAssignment feed My Programme and Workouts —
// tabs the COACH shell also offers. They used to read _perfAssign.assignments,
// which for staff is every scoped athlete's assignment, so a coach opening
// their own workout would have been shown someone else's. Latent only because
// no assignment existed yet.

test('18: own-data resolvers read SELF, never the coaching list', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const fn = name => {
    const i = src.indexOf(`function ${name}(`);
    let b = src.indexOf('{', i), d = 0, end = b;
    for (let x = b; x < src.length; x++) { if (src[x] === '{') d++; else if (src[x] === '}') { d--; if (!d) { end = x; break; } } }
    return src.slice(i, end + 1);
  };
  for (const name of ['perfLiveAssignment', 'perfCurrentAssignment']) {
    assert.match(fn(name), /perfSelfAssignments\(\)/, `${name} reads own data`);
    assert.doesNotMatch(fn(name), /_perfAssign\.assignments/, `${name} must not read the coaching list`);
  }
  const acc = fn('perfSelfAssignments');
  assert.match(acc, /capacity === 'player'/, 'a player payload is already their own');
  assert.match(acc, /_perfAssign\.self\?\.assignments/, 'staff read the server-resolved self block');
});

test('19: a staff member with no assignments of their own resolves to nothing, not to an athlete', () => {
  const run = (capacity, assignments, self) => new Function(`
    const _perfAssign = { capacity: ${JSON.stringify(capacity)},
      assignments: ${JSON.stringify(assignments)}, self: ${JSON.stringify(self)} };
    function perfSelfAssignments() {
      if (_perfAssign.capacity === 'player') return _perfAssign.assignments || [];
      return _perfAssign.self?.assignments || [];
    }
    return perfSelfAssignments();
  `)();
  const others = [{ assignmentId: 'a1', athleteUserId: 'someone-else', snapshot: {} }];
  assert.deepEqual(run('staff', others, { assignments: [] }), [],
    "a coach with other people's assignments loaded has none of their own");
  assert.deepEqual(run('staff', others, null), [], 'and an absent self block is empty, not a fallback');
  assert.deepEqual(run('player', others, null), others, 'a player payload is already their own');
  const mine = [{ assignmentId: 'a2', athleteUserId: 'me', snapshot: {} }];
  assert.deepEqual(run('staff', others, { assignments: mine }), mine, 'a dual-role member gets THEIR assignment');
});

test('20: the player shell is unchanged — a player still receives only their own payload', async () => {
  seed(); await login('u-sen-player');
  const r = await call('u-sen-player');
  assert.equal(r.code, 200);
  assert.equal(r.body.capacity, 'player');
  assert.equal(r.body.athletes, undefined, 'a player is never given an athlete roster');
  assert.equal(r.body.programmes, undefined, 'nor a programme library');
  for (const a of r.body.assignments || []) assert.equal(a.athleteUserId, 'u-sen-player');
});


// ── MUTATION-DRIVEN: two guards my first pass left unproven ───────────────
//
// Mutation testing survived two changes, so these close the gaps:
//   D  scopedAthleteIds admitting every member (the projection masked it,
//      but `visible` also gates which ASSIGNMENTS and PROGRAMMES are returned)
//   E  `self` resolved from the whole record instead of the caller

const SNAPSHOT = {
  kind: 'programme_assignment_snapshot', programmeId: 'pg-1', programmeTitle: 'Test Programme',
  programmeVersionId: 'pg-1@v1', versionNumber: 1, exerciseSnapshots: {}, collectionIds: [],
  prescriptionTree: [{ kind: 'phase', id: 'ph1', weeks: [{ kind: 'week', id: 'w1', weekNumber: 1, days: [
    { kind: 'training_day', id: 'd1', day: 'Mon', sessions: [{ kind: 'session', id: 's1', title: 'Lower Strength', purpose: 'strength', estimatedMinutes: 45, blocks: [] }] },
  ] }] }],
  capturedAt: '2026-08-25T09:00:00.000Z',
};
async function assignTo(athleteUserId, coach) {
  const saved = await call(coach, { method: 'POST', body: {
    op: 'save_draft', title: 'Test Programme', athleteUserId, goal: 'strength', phase: 'pre_season',
    programme: { id: 'pg-1', title: 'Test Programme', versions: [{ versionNumber: 1, versionStatus: 'draft' }] } } });
  const programmeId = saved.body.programme.programmeId;
  await call(coach, { method: 'POST', body: {
    op: 'publish_programme', programmeId, versionNumber: 1,
    programme: { id: 'pg-1', title: 'Test Programme', versions: [{ versionNumber: 1, versionStatus: 'published' }] } } });
  const r = await call(coach, { method: 'POST', body: {
    op: 'create_assignment', athleteUserId, programmeId, versionNumber: 1,
    snapshot: { ...SNAPSHOT, programmeId }, startDate: '2026-08-25' } });
  return { programmeId, result: r };
}

test('21: `self` stays the caller even when ANOTHER athlete has a real assignment', async () => {
  seed(); await login('u-sen-coach'); await login('u-dual');
  const made = await assignTo('u-sen-player', 'u-sen-coach');
  assert.equal(made.result.code, 200, 'the other athlete really does have an assignment');

  const r = await call('u-dual');
  assert.equal(r.code, 200);
  // The coaching list is allowed to contain it; `self` is not.
  assert.deepEqual(r.body.self.assignments, [],
    "a dual-role member with no programme of their own has an EMPTY self block");
  // The player projection deliberately omits athleteUserId (it is their OWN
  // data), so identity is proved by which assignmentId reaches them.
  const otherId = made.result.body.assignment.assignmentId;
  assert.equal(JSON.stringify(r.body.self).includes(otherId), false,
    "the other athlete's assignment id never appears in self");

  // And the same for a staff-only coach who can see it as a coaching subject.
  const coach = await call('u-sen-coach');
  assert.ok((coach.body.assignments || []).some(a => a.athleteUserId === 'u-sen-player'),
    'the coaching list DOES carry their athlete');
  assert.deepEqual(coach.body.self.assignments, [],
    'but the coach has none of their own — no bleed from the coaching list');
});

test('22: a dual-role member DOES receive their own assignment in self', async () => {
  seed(); await login('u-sen-coach'); await login('u-dual');
  const made = await assignTo('u-dual', 'u-sen-coach');   // their Seniors coach assigns to them
  assert.equal(made.result.code, 200);
  const r = await call('u-dual');
  assert.equal(r.body.self.assignments.length, 1, 'their own programme reaches them');
  assert.equal(r.body.self.assignments[0].assignmentId, made.result.body.assignment.assignmentId,
    'and it is the assignment created FOR them');
  // PLAYER_ASSIGNMENT_FIELDS deliberately omits athleteUserId: a player
  // projection is their own data and does not repeat whose it is.
  assert.equal('athleteUserId' in r.body.self.assignments[0], false,
    'the player projection never carries an athlete id');
});

test('23: the enumeration boundary gates ASSIGNMENTS and PROGRAMMES, not just the list', async () => {
  // scopedAthleteIds feeds `visible`, which filters assignments and programmes.
  // If it admitted non-athletes, a coach could see records keyed to staff.
  seed(); await login('u-sen-coach'); await login('u-u18-coach');
  await assignTo('u-sen-player', 'u-sen-coach');
  const u18 = await call('u-u18-coach');
  assert.equal(u18.code, 200);
  assert.equal((u18.body.assignments || []).some(a => a.athleteUserId === 'u-sen-player'), false,
    'a U18 coach sees no Seniors assignment');
  assert.equal((u18.body.programmes || []).some(p => p.athleteUserId === 'u-sen-player'), false,
    'nor the programme authored for them');
  // The enumeration must never include a member who does not play.
  const all = await call('u-owner');
  for (const staffOnly of ['u-sen-coach', 'u-u18-coach', 'u-owner', 'u-medic']) {
    assert.equal((all.body.athletes || []).some(a => a.userId === staffOnly), false,
      `${staffOnly} must not be enumerable as an athlete`);
    assert.equal((all.body.assignments || []).some(a => a.athleteUserId === staffOnly), false,
      `${staffOnly} must not have assignments surfaced`);
  }
});


test('24: nothing may be authored or assigned FOR someone who does not play', async () => {
  // Found by mutation testing. resolveScopedAthlete matched any active member,
  // and a club-wide coach skips the group check, so an owner could author a
  // programme for a fellow coach who is not an athlete at all.
  seed(); await login('u-owner');
  for (const notAnAthlete of ['u-sen-coach', 'u-u18-coach', 'u-medic']) {
    const draft = await call('u-owner', { method: 'POST', body: {
      op: 'save_draft', title: 'X', athleteUserId: notAnAthlete, goal: 'strength',
      programme: { id: 'pg-1', title: 'X', versions: [{ versionNumber: 1, versionStatus: 'draft' }] } } });
    assert.equal(draft.code, 404, `${notAnAthlete} is not an athlete, so nothing is authored for them`);
    const profile = await call('u-owner', { query: { athleteProfile: notAnAthlete } });
    assert.equal(profile.code, 404, `${notAnAthlete} has no athlete projection to read`);
  }
  // The dual-role member DOES play, so they remain fully programmable.
  const ok = await call('u-owner', { query: { athleteProfile: 'u-dual' } });
  assert.equal(ok.code, 200, 'a coach who plays is still an athlete');
});
