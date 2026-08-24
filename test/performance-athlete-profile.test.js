/**
 * SC8 — server-backed athlete profiles: cross-device, scoped, minimised.
 *
 * The defect these exist to prevent: a coach who is also an athlete generating
 * Athlete B's programme from the COACH's own device-local profile. The fix is
 * that authoring reads a server projection scoped to the athlete — and that the
 * projection carries programming inputs only, never wellness or health data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.perfprofile.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map(); const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_performanceStore.js');
const identity = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { authoringProfileFrom, authoringProfileUsable, missingAuthoringInputs,
        engineInputFromAuthoringProfile, FORBIDDEN_PROFILE_SECTIONS } = await import('../performance/domain/authoring-profile.js');
const { createEmptyProfile } = await import('../performance/domain/athlete-profile.js');

const CLUB = 'club-p', OTHER = 'club-o', SEN = 'g-sen', U18 = 'g-u18', U16 = 'g-u16';
const MEMBERS = [
  { id: 'm1', teamId: CLUB, userId: 'u-sen-player', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm2', teamId: CLUB, userId: 'u-u18-player', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm8', teamId: CLUB, userId: 'u-u16-player', role: 'player', status: 'active', playerGroupId: U16 },
  { id: 'm3', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, role: 'coach', status: 'active' }], teams: [] } },
  { id: 'm4', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, role: 'coach', status: 'active' },
                                             { groupId: U16, role: 'coach', status: 'active' }], teams: [] } },
  { id: 'm5', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  { id: 'm6', teamId: CLUB, userId: 'u-medic', role: 'medical', status: 'active' },
  { id: 'm7', teamId: OTHER, userId: 'u-other-coach', role: 'coach', status: 'active', accessProfile: 'coach' },
];
function seed({ plan = 'pro' } = {}) {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'P Club', plan, planStatus: 'active' },
    { id: OTHER, name: 'O Club', plan: 'pro', planStatus: 'active' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [{ id: SEN, name: 'Seniors', developmentCategory: 'adult', status: 'active' },
             { id: U18, name: 'U18', developmentCategory: 'youth_u18', status: 'active' },
             { id: U16, name: 'U16', developmentCategory: 'youth_u16', status: 'active' }],
    teams: [{ id: 't1', groupId: SEN, name: 'Prem', status: 'active' }] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p1', userId: 'u-sen-player', name: 'Senior Player', position: 'LOCK' },
    { id: 'p2', userId: 'u-u18-player', name: 'U18 Player', position: 'WING' },
    { id: 'p3', userId: 'u-u16-player', name: 'U16 Player', position: 'CENTRE' }] }));
}
const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await identity.createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${identity.SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
const req = (u, { method = 'GET', body = null, query = {} } = {}) =>
  ({ method, body, query: { resource: 'performance', ...query }, headers: { cookie: cookies.get(u) || '' } });
function res() { const o = { code: 0, body: null };
  return { status(c) { o.code = c; return this; }, json(b) { o.body = b; return this; }, end() { return this; }, setHeader() {}, get result() { return o; } }; }
const call = async (u, opts) => { const r = res(); await publishHandler(req(u, opts), r); return r.result; };

/** A full SC2 profile carrying every sensitive class. */
function fullProfile(over = {}) {
  const p = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  p.personal.dateOfBirth = '2009-03-04';
  p.rugby.primaryPosition = over.position || 'hooker';
  p.rugby.playingLevel = 'club'; p.rugby.seasonPhase = 'pre_season';
  p.training.experience = over.experience || 'beginner';
  p.training.techConfidence = 'developing';
  p.equipment.locations = ['full_gym']; p.equipment.items = ['barbell'];
  p.schedule.availableDays = ['Mon', 'Wed']; p.schedule.rugbyDays = ['Tue']; p.schedule.matchDay = 'Sat';
  p.goals = [{ type: 'strength', importance: 4 }];
  p.body.weightKg = 104; p.body.heightCm = 188;
  p.pain = { present: true, area: 'left knee', severity: 'moderate', note: 'sore after match', trainingRestricted: true };
  p.health.injuryHistory = [{ what: 'ACL rupture 2024' }];
  p.health.movementsToAvoid = ['deep_knee_flexion'];
  p.health.physioInstructions = 'no deep squats until reviewed';
  p.health.medicalClearanceRequired = true;
  return p;
}
const saveOwn = (user, profile) => call(user, { method: 'POST', body: { op: 'save_athlete_profile', profile: authoringProfileFrom(profile, { now: new Date('2026-08-22') }) } });

// ── Data minimisation ───────────────────────────────────────────────────────

test('1. the projection carries programming inputs only — no health data', async () => {
  const ap = authoringProfileFrom(fullProfile(), { now: new Date('2026-08-22') });
  const json = JSON.stringify(ap);
  for (const secret of ['left knee', 'sore after match', 'ACL rupture 2024',
                        'deep_knee_flexion', 'no deep squats until reviewed', '2009-03-04', '104', '188']) {
    assert.ok(!json.includes(secret), `projection must not carry "${secret}"`);
  }
  for (const key of FORBIDDEN_PROFILE_SECTIONS) {
    assert.ok(!json.includes(`"${key}":`), `projection must not carry a "${key}" section`);
  }
  // Age travels as a BAND derived from the date, never the date itself.
  assert.equal(ap.personal.ageBand, '16_17');
  // A restriction is signalled, never described.
  assert.deepEqual(ap.restrictions, { restrictionsKnown: true, trainingRestricted: true,
    hasMovementRestrictions: true, coachRestrictionCount: 0 });
});

test('2. the SERVER drops sensitive fields even if a client posts them', async () => {
  seed(); await login('u-sen-player');
  const hostile = { ...authoringProfileFrom(fullProfile(), { now: new Date('2026-08-22') }),
    health: { injuryHistory: ['ACL'], physioInstructions: 'secret' },
    pain: { area: 'left knee', note: 'sore' }, wellnessLog: [{ sleep: 2 }],
    body: { weightKg: 104 }, personal: { ageBand: '16_17', dateOfBirth: '2009-03-04' } };
  const r = await call('u-sen-player', { method: 'POST', body: { op: 'save_athlete_profile', profile: hostile } });
  assert.equal(r.code, 200);
  const stored = JSON.stringify((await store.loadPerformanceRecord(CLUB)).profiles[0]);
  for (const secret of ['injuryHistory', 'physioInstructions', 'wellnessLog', 'weightKg', 'dateOfBirth', 'left knee', 'sore']) {
    assert.ok(!stored.includes(secret), `storage must drop ${secret}`);
  }
  assert.ok(stored.includes('16_17'), 'the age band it legitimately needs is kept');
});

// ── Player: own profile only, across devices ────────────────────────────────

test('3. CROSS-DEVICE — a player saves on device A and reads the same on device B', async () => {
  seed(); await login('u-sen-player');
  await saveOwn('u-sen-player', fullProfile({ position: 'flanker' }));
  // "Device B" = a second session for the same identity, with no local state.
  cookies.delete('u-sen-player'); await login('u-sen-player');
  const r = await call('u-sen-player');
  assert.equal(r.code, 200);
  assert.equal(r.body.profile.rugby.primaryPosition, 'flanker');
  assert.equal(r.body.profile.profileComplete, true);
});

test('4. a player writing cannot overwrite another athlete\'s profile', async () => {
  seed(); await login('u-sen-player'); await login('u-u18-player');
  await saveOwn('u-sen-player', fullProfile({ position: 'prop' }));
  // A forged athleteUserId in the body is ignored — the session decides.
  const forged = { ...authoringProfileFrom(fullProfile({ position: 'winger' }), { now: new Date() }), athleteUserId: 'u-sen-player' };
  await call('u-u18-player', { method: 'POST', body: { op: 'save_athlete_profile', profile: forged } });
  const record = await store.loadPerformanceRecord(CLUB);
  assert.equal(store.authoringProfileFor(record, 'u-sen-player').rugby.primaryPosition, 'prop',
    'the first athlete\'s profile is untouched');
  assert.equal(store.authoringProfileFor(record, 'u-u18-player').rugby.primaryPosition, 'winger',
    'the writer only ever wrote their own');
});

test('5. a player reads only their own profile', async () => {
  seed(); await login('u-sen-player'); await login('u-u18-player');
  await saveOwn('u-sen-player', fullProfile({ position: 'prop' }));
  const other = await call('u-u18-player', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(other.body.profile, null, 'a player query parameter cannot fetch another athlete');
  assert.deepEqual(other.body.assignments, []);
});

// ── Coach scope ─────────────────────────────────────────────────────────────

test('6. a scoped coach reads the projection for an IN-SCOPE athlete', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', fullProfile({ position: 'lock' }));
  const r = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.profile.rugby.primaryPosition, 'lock');
  const json = JSON.stringify(r.body);
  for (const secret of ['ACL rupture 2024', 'left knee', 'physioInstructions', 'wellnessLog', 'dateOfBirth']) {
    assert.ok(!json.includes(secret), `a coach must never receive ${secret}`);
  }
});

test('7. OUT OF SCOPE — a Seniors coach cannot read a U18 athlete\'s profile', async () => {
  seed(); await login('u-u18-player'); await login('u-sen-coach');
  await saveOwn('u-u18-player', fullProfile());
  const r = await call('u-sen-coach', { query: { athleteProfile: 'u-u18-player' } });
  assert.equal(r.code, 403);
  assert.match(r.body.error, /outside your coaching scope/);
});

test('8. OUT OF SCOPE — a U18 coach cannot read a Seniors athlete\'s profile', async () => {
  seed(); await login('u-sen-player'); await login('u-u18-coach');
  await saveOwn('u-sen-player', fullProfile());
  assert.equal((await call('u-u18-coach', { query: { athleteProfile: 'u-sen-player' } })).code, 403);
});

test('9. ANOTHER CLUB gets nothing', async () => {
  seed(); await login('u-sen-player'); await login('u-other-coach');
  await saveOwn('u-sen-player', fullProfile());
  const r = await call('u-other-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.ok([403, 404].includes(r.code), `expected refusal, got ${r.code}`);
  assert.notEqual(r.body?.profile?.rugby?.primaryPosition, 'hooker');
});

test('10. a coach can never WRITE an athlete\'s profile', async () => {
  seed(); await login('u-sen-coach');
  const r = await call('u-sen-coach', { method: 'POST', body: {
    op: 'save_athlete_profile', athleteUserId: 'u-sen-player',
    profile: authoringProfileFrom(fullProfile(), { now: new Date() }) } });
  assert.equal(r.code, 403);
  assert.match(r.body.error, /Only the athlete/);
  assert.deepEqual((await store.loadPerformanceRecord(CLUB)).profiles, []);
});

test('11. medical and admin gain no restricted Performance health data', async () => {
  seed(); await login('u-sen-player'); await login('u-admin'); await login('u-medic');
  await saveOwn('u-sen-player', fullProfile());
  const admin = await call('u-admin', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(admin.code, 200, 'a club-wide admin may author, so may read the projection');
  const json = JSON.stringify(admin.body);
  for (const secret of ['ACL rupture 2024', 'physioInstructions', 'wellnessLog', 'left knee']) {
    assert.ok(!json.includes(secret), `even an admin never receives ${secret}`);
  }
  // Medical has no publish_training, so Performance authoring stays closed.
  const medic = await call('u-medic', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(medic.code, 403);
});

// ── The original defect ─────────────────────────────────────────────────────

test('12. THE DEFECT — coach authoring uses the ATHLETE\'s profile, never the coach\'s device', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('    async function perfGenerateDraft(');
  let i = start, d = 0, seen = false, gen = '';
  while (i < html.length) { if (html[i] === '{') { d++; seen = true; } else if (html[i] === '}') { d--; if (seen && d === 0) { gen = html.slice(start, i + 1); break; } } i++; }
  // Comments may NAME the banned read (they explain why we avoid it); code may
  // not. Strip line comments before checking.
  const code = gen.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/state\.performanceProfile/.test(code),
    'generation must not read this device\'s profile — that is the coach\'s own');
  assert.match(gen, /athleteProfile=\$\{encodeURIComponent\(athlete\.userId\)\}/,
    'it fetches the SELECTED athlete\'s projection from the server');
  assert.match(gen, /engineInputFromAuthoringProfile/, 'and feeds the projection to SC5');
  assert.match(gen, /authoringProfileUsable/, 'incomplete profiles are refused');
});

test('13. HARD CASE — coach has a local profile, athlete has none on the server → blocked', async () => {
  seed(); await login('u-sen-coach');
  // The coach is also an athlete and HAS a profile of their own.
  await saveOwn('u-sen-coach', fullProfile({ position: 'PROP_COACH_OWN' })).catch(() => {});
  const r = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.profile, null, 'the athlete has no profile — and the coach\'s is NOT substituted');
  assert.equal(authoringProfileUsable(r.body.profile), false, 'generation is blocked');
  assert.ok(missingAuthoringInputs(r.body.profile).length, 'and says what is missing');
});

test('14. HARD CASE — athlete HAS a server profile → generation uses theirs, not the coach\'s', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', fullProfile({ position: 'scrum_half', experience: 'intermediate' }));
  await saveOwn('u-sen-coach', fullProfile({ position: 'PROP_COACH_OWN', experience: 'advanced' }));
  const r = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  const input = engineInputFromAuthoringProfile(r.body.profile, { teamCategory: 'adult' });
  assert.equal(input.position, 'scrum_half', 'the ATHLETE\'s position drives the programme');
  assert.equal(input.experience, 'intermediate', 'and the athlete\'s training age');
  assert.notEqual(input.position, 'PROP_COACH_OWN');
});

// ── Normalisation & status ──────────────────────────────────────────────────

test('15. malformed or absent profiles normalise safely, never throwing', async () => {
  for (const bad of [null, undefined, 'junk', 7, [], { rugby: 'nope' }, { goals: 'nope', equipment: 5 }]) {
    const n = store.normalizeAuthoringProfile(bad);
    assert.equal(n.kind, 'authoring_profile');
    assert.equal(n.profileComplete, false);
    assert.deepEqual(n.goals, []);
    assert.deepEqual(n.equipment.locations, []);
  }
  assert.equal(authoringProfileUsable(null), false);
  assert.equal(authoringProfileUsable({ kind: 'authoring_profile' }), false);
});

test('16. an incomplete profile reports WHAT is missing', () => {
  const bare = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  const ap = authoringProfileFrom(bare, { now: new Date('2026-08-22') });
  assert.equal(authoringProfileUsable(ap), false);
  const missing = missingAuthoringInputs(ap);
  assert.ok(missing.includes('playing position'));
  assert.ok(missing.includes('training experience'));
});

test('17. the coach athlete list reports profile STATUS, never profile content', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', fullProfile());
  const list = (await call('u-sen-coach')).body.athletes;
  const sen = list.find(a => a.userId === 'u-sen-player');
  assert.equal(sen.profileComplete, true);
  assert.equal(sen.rugby, undefined, 'the list carries status, not the projection itself');
  assert.equal(JSON.stringify(list).includes('ACL'), false);
});

test('18. only the performance key is written when a profile is saved', async () => {
  seed(); await login('u-sen-player');
  writes.length = 0;
  await saveOwn('u-sen-player', fullProfile());
  const touched = [...new Set(writes)].filter(k => !k.includes('session') && !k.includes('audit'));
  assert.deepEqual(touched, [`app:performance:${CLUB}`]);
});

test('19. an unentitled club cannot read or write profiles', async () => {
  seed({ plan: 'core' }); await login('u-sen-player'); await login('u-sen-coach');
  assert.equal((await call('u-sen-player')).code, 402);
  assert.equal((await saveOwn('u-sen-player', fullProfile())).code, 402);
  assert.equal((await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } })).code, 402);
});

// ── Minors gate on the restriction signal (interim) ──────────────────────────
//
// The signal is pain-derived and unconsented. Until the consent design clears
// legal review for minors it is withheld from coaches of U16 and U18 athletes,
// SERVER-side, in the only response that carries it.

/** A profile whose owner has said their training is restricted. */
function restrictedProfile(ageBand) {
  const p = fullProfile();
  p.personal.dateOfBirth = null;
  p.personal.ageBand = ageBand;
  p.pain.trainingRestricted = true;
  return p;
}
const readProfile = (coach, athlete) => call(coach, { query: { athleteProfile: athlete } });

test('20. GATE — a U18 athlete\'s restriction signal never reaches their coach', async () => {
  seed(); await login('u-u18-player'); await login('u-u18-coach');
  await saveOwn('u-u18-player', restrictedProfile('16_17'));
  const r = await readProfile('u-u18-coach', 'u-u18-player');
  assert.equal(r.code, 200);
  assert.equal(r.body.profile.restrictions.trainingRestricted, false, 'withheld');
  // The athlete's OWN stored record still holds it — nothing was destroyed.
  const stored = store.authoringProfileFor(await store.loadPerformanceRecord(CLUB), 'u-u18-player');
  assert.equal(stored.restrictions.trainingRestricted, true, 'the athlete\'s own record is intact');
});

test('21. GATE — a U16 athlete\'s signal is withheld too', async () => {
  seed(); await login('u-u16-player'); await login('u-u18-coach');
  await saveOwn('u-u16-player', restrictedProfile('under_16'));
  const r = await readProfile('u-u18-coach', 'u-u16-player');
  assert.equal(r.code, 200);
  assert.equal(r.body.profile.restrictions.trainingRestricted, false);
});

test('22. ADULTS UNAFFECTED — the signal and its review prompt still work', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', restrictedProfile('21_29'));
  const r = await readProfile('u-sen-coach', 'u-sen-player');
  assert.equal(r.body.profile.restrictions.trainingRestricted, true, 'an adult is unchanged');
  // ...and it still drives the SC5 review flag the coach relies on.
  const input = engineInputFromAuthoringProfile(r.body.profile, { teamCategory: 'adult' });
  assert.equal(input.hasActiveRestriction, true);
});

test('23. FAIL CLOSED — an unresolved age band withholds it, even in an adult squad', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', restrictedProfile('unknown'));
  const r = await readProfile('u-sen-coach', 'u-sen-player');
  assert.equal(r.body.profile.restrictions.trainingRestricted, false,
    'we withhold unless the athlete is POSITIVELY resolved as an adult');
  const input = engineInputFromAuthoringProfile(r.body.profile, { teamCategory: 'adult' });
  assert.equal(input.hasActiveRestriction, false, 'and no review prompt is raised from it');
});

test('24. a forged client request cannot restore the signal', async () => {
  seed(); await login('u-u18-player'); await login('u-u18-coach');
  await saveOwn('u-u18-player', restrictedProfile('16_17'));
  // Every shape a client could try: query flags, body, headers.
  for (const query of [{ athleteProfile: 'u-u18-player', trainingRestricted: 'true' },
                       { athleteProfile: 'u-u18-player', includeRestrictions: '1' },
                       { athleteProfile: 'u-u18-player', ageBand: '21_29' },
                       { athleteProfile: 'u-u18-player', developmentCategory: 'adult' }]) {
    const r = await call('u-u18-coach', { query });
    assert.equal(r.body.profile.restrictions.trainingRestricted, false, JSON.stringify(query));
  }
  // The gate reads the SERVER's structure record, so a forged group cannot move
  // the athlete into an adult squad.
  const r = await call('u-u18-coach', { method: 'POST', body: {
    op: 'save_athlete_profile', athleteUserId: 'u-u18-player',
    profile: { restrictions: { trainingRestricted: true } } } });
  assert.equal(r.code, 403, 'a coach still cannot write an athlete profile at all');
});

test('25. gating changes NO other projection field', async () => {
  seed(); await login('u-u18-player'); await login('u-sen-player'); await login('u-admin');
  const p = restrictedProfile('16_17');
  await saveOwn('u-u18-player', p);
  const gated = (await readProfile('u-admin', 'u-u18-player')).body.profile;
  const stored = store.authoringProfileFor(await store.loadPerformanceRecord(CLUB), 'u-u18-player');
  assert.deepEqual(Object.keys(gated).sort(), Object.keys(stored).sort(), 'same shape');
  for (const k of Object.keys(stored)) {
    if (k === 'restrictions') continue;
    assert.deepEqual(gated[k], stored[k], `${k} must be identical`);
  }
  assert.deepEqual(
    { ...gated.restrictions, trainingRestricted: null },
    { ...stored.restrictions, trainingRestricted: null },
    'the other restriction fields are identical');
  assert.ok('trainingRestricted' in gated.restrictions, 'the key survives, so shape never varies');
});
