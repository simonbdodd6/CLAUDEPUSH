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
  p.pain.present = true;                       // → restrictionsKnown
  p.health.movementsToAvoid = ['deep_knee_flexion'];  // → hasMovementRestrictions
  return p;
}
/** The three fields withheld together for minors. */
const GATED = ['trainingRestricted', 'hasMovementRestrictions', 'restrictionsKnown'];
const readProfile = (coach, athlete) => call(coach, { query: { athleteProfile: athlete } });

test('20. GATE — a U18 athlete\'s restriction signal never reaches their coach', async () => {
  seed(); await login('u-u18-player'); await login('u-u18-coach');
  await saveOwn('u-u18-player', restrictedProfile('16_17'));
  const r = await readProfile('u-u18-coach', 'u-u18-player');
  assert.equal(r.code, 200);
  for (const f of GATED) assert.equal(r.body.profile.restrictions[f], false, `${f} withheld`);
  // The athlete's OWN stored record still holds it — nothing was destroyed.
  const stored = store.authoringProfileFor(await store.loadPerformanceRecord(CLUB), 'u-u18-player');
  assert.equal(stored.restrictions.trainingRestricted, true, 'the athlete\'s own record is intact');
});

test('21. GATE — a U16 athlete\'s signal is withheld too', async () => {
  seed(); await login('u-u16-player'); await login('u-u18-coach');
  await saveOwn('u-u16-player', restrictedProfile('under_16'));
  const r = await readProfile('u-u18-coach', 'u-u16-player');
  assert.equal(r.code, 200);
  for (const f of GATED) assert.equal(r.body.profile.restrictions[f], false, f);
});

test('22. ADULTS UNAFFECTED — the signal and its review prompt still work', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', restrictedProfile('21_29'));
  const r = await readProfile('u-sen-coach', 'u-sen-player');
  for (const f of GATED) assert.equal(r.body.profile.restrictions[f], true, `${f} unchanged for an adult`);
  // ...and it still drives the SC5 review flag the coach relies on.
  const input = engineInputFromAuthoringProfile(r.body.profile, { teamCategory: 'adult' });
  assert.equal(input.hasActiveRestriction, true);
});

test('23. FAIL CLOSED — an unresolved age band withholds it, even in an adult squad', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', restrictedProfile('unknown'));
  const r = await readProfile('u-sen-coach', 'u-sen-player');
  for (const f of GATED) assert.equal(r.body.profile.restrictions[f], false,
    `${f}: withheld unless the athlete is POSITIVELY resolved as an adult`);
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
                       { athleteProfile: 'u-u18-player', developmentCategory: 'adult' },
                       { athleteProfile: 'u-u18-player', hasMovementRestrictions: 'true' },
                       { athleteProfile: 'u-u18-player', restrictionsKnown: 'true' }]) {
    const r = await call('u-u18-coach', { query });
    for (const f of GATED) assert.equal(r.body.profile.restrictions[f], false, `${f} ${JSON.stringify(query)}`);
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
  assert.equal(gated.restrictions.coachRestrictionCount, stored.restrictions.coachRestrictionCount,
    'a coach\'s own recorded restrictions survive — they are not the athlete\'s disclosure');
  for (const f of GATED) assert.ok(f in gated.restrictions, `${f}: the key survives, so shape never varies`);
});


// ── 26-31: A COACH MAY SAVE THEIR OWN PROFILE ─────────────────────────────
//
// PRODUCTION BUG. A head coach completed their own Performance profile and it
// never reached the server: app:performance:<club> stayed absent entirely.
//
// The staff branch refused every `save_athlete_profile` with "Only the athlete
// can update their Performance profile". That rule exists to stop a coach
// authoring SOMEONE ELSE's profile, and it should — but it was written as
// "staff may not save any profile", including their own. Meanwhile the coach
// Performance shell offers the full PERF_TABS, which includes "My Profile",
// "My Programme" and "Workouts": the product invites a coach to build their own
// athlete profile and then declined to keep it. The client maps the 403 to
// _perfProfileSync = 'error', so the screen reported "Saved on this device".
//
// The athlete id comes from the SESSION for staff exactly as it does for a
// player, so a coach still cannot reach another athlete's record.

test('26. a coach can save their OWN Performance profile', async () => {
  seed(); await login('u-sen-coach');
  const r = await saveOwn('u-sen-coach', fullProfile());
  assert.equal(r.code, 200, 'a staff member may persist their own profile');
  assert.equal(r.body.profile.athleteUserId, 'u-sen-coach', 'stored under their own id');
  assert.equal(r.body.profile.clubId, CLUB, 'and their own club');
});

test('27. an owner/admin can save their own profile too', async () => {
  seed(); await login('u-admin');
  const r = await saveOwn('u-admin', fullProfile());
  assert.equal(r.code, 200);
  assert.equal(r.body.profile.athleteUserId, 'u-admin');
});

test('28. a coach still CANNOT write another athlete\'s profile', async () => {
  seed(); await login('u-sen-coach');
  const forged = await call('u-sen-coach', { method: 'POST', body: {
    op: 'save_athlete_profile', athleteUserId: 'u-sen-player',
    profile: authoringProfileFrom(fullProfile(), { now: new Date('2026-08-22') }) } });
  assert.equal(forged.code, 403, 'naming another athlete is refused');
  assert.match(String(forged.body.error), /Only the athlete/);
  // …and nothing was written for that athlete.
  const stored = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(stored.code, 200);
  assert.equal(stored.body.profile, null, 'the target athlete still has no profile');
});

test('29. a coach saving their own profile writes ONLY their own record', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');
  await saveOwn('u-sen-player', fullProfile());          // the athlete saves first
  const before = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  await saveOwn('u-sen-coach', fullProfile());           // now the coach saves theirs
  const after = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.deepEqual(after.body.profile, before.body.profile,
    "the athlete's stored profile is untouched by the coach saving their own");
});

test('30. the coach\'s own saved profile carries no pain, health or wellness data', async () => {
  seed(); await login('u-sen-coach');
  const r = await saveOwn('u-sen-coach', fullProfile());
  const raw = JSON.stringify(r.body.profile);
  for (const banned of ['left knee', 'sore after match', 'ACL rupture', 'deep_knee_flexion',
                        'physio', 'no deep squats', 'wellness', 'weightKg', 'heightCm']) {
    assert.equal(raw.includes(banned), false, `${banned} must never enter the projection`);
  }
  // The restriction FLAGS are present but gated exactly as for any athlete.
  assert.ok(r.body.profile.restrictions, 'restriction flags exist');
});

test('31. another club\'s coach still cannot save into this club', async () => {
  seed(); await login('u-other-coach'); await login('u-admin');
  const r = await saveOwn('u-other-coach', fullProfile());
  // Their session resolves to OTHER, so anything they write lands there — and
  // this club's record must not gain a profile from it.
  const here = await call('u-admin', { query: { athleteProfile: 'u-other-coach' } });
  assert.notEqual(here.code, 200, 'a foreign athlete id is not resolvable in this club');
  assert.equal(r.code === 200 ? r.body.profile.clubId : OTHER, OTHER, 'written to their OWN club, never ours');
});

// ── The whole seam, joined up ───────────────────────────────────────────────
// Every earlier test covers one link. This one walks the previously broken
// NEW-PLAYER journey end to end, with the REAL generator feeding the REAL API:
// no profile → completion sync → coach sees ready → generate → publish →
// assign → the player retrieves their programme.

const { generateBlueprint } = await import('../performance/domain/programme-blueprint.js');
const { programmeDraftFromBlueprint } = await import('../performance/domain/blueprint-to-programme.js');
const { publishProgrammeVersion, snapshotForProgrammeAssignment } =
  await import('../performance/domain/programme-versioning.js');
const { validateProgrammeVersion } = await import('../performance/domain/programme.js');
const { getCatalogue } = await import('../performance/services/exercise-catalogue.js');
const { COLLECTIONS } = await import('../performance/services/exercise-collections-catalogue.js');

test('32. E2E — a new player completes their profile and ends up with a programme', async () => {
  seed(); await login('u-sen-player'); await login('u-sen-coach');

  // BEFORE: the server has no profile — the coach sees "waiting" and the
  // generate gate refuses, exactly as production did for every new player.
  let coachView = await call('u-sen-coach');
  assert.equal(coachView.code, 200);
  assert.equal(coachView.body.athletes.find(a => a.userId === 'u-sen-player').profileComplete, false);
  const empty = await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } });
  assert.equal(authoringProfileUsable(empty.body.profile), false, 'generation is blocked before sync');

  // THE FIX: completing onboarding publishes the projection (perfObSubmit now
  // sends exactly this op with exactly this payload — pinned by the UI tests).
  const athlete = fullProfile({ position: 'flanker', experience: 'intermediate' });
  athlete.personal.dateOfBirth = '1998-05-05';   // an adult Seniors athlete
  const synced = await saveOwn('u-sen-player', athlete);
  assert.equal(synced.code, 200);

  // The coach's list now says so.
  coachView = await call('u-sen-coach');
  assert.equal(coachView.body.athletes.find(a => a.userId === 'u-sen-player').profileComplete, true,
    'the athlete reads as ready in the coach list');

  // GENERATE from the server projection — the seam no test previously walked.
  const ap = (await call('u-sen-coach', { query: { athleteProfile: 'u-sen-player' } })).body.profile;
  assert.equal(authoringProfileUsable(ap), true);
  const input = engineInputFromAuthoringProfile(ap, { teamCategory: 'adult' });
  const blueprint = generateBlueprint(input, { catalogue: getCatalogue() });
  assert.ok(blueprint.frequency > 0, 'the rules produce real sessions');
  const built = programmeDraftFromBlueprint(blueprint, {
    catalogue: getCatalogue(), athleteName: 'Senior Player', athleteUserId: 'u-sen-player',
    author: 'u-sen-coach', weeks: 4, schedule: ap.schedule, now: '2026-08-26T00:00:00.000Z',
  });
  const check = validateProgrammeVersion(built.programme.versions[0],
    { catalogue: getCatalogue(), collections: COLLECTIONS });
  assert.equal(check.ok, true, `generated programme is valid: ${JSON.stringify(check.errors || [])}`);

  // PUBLISH and ASSIGN through the real API, as the coach UI does.
  const draft = await call('u-sen-coach', { method: 'POST', body: {
    op: 'save_draft', athleteUserId: 'u-sen-player', title: built.programme.title,
    programme: built.programme, provenance: built.provenance,
    requiresReview: built.provenance?.requiresReview === true } });
  assert.equal(draft.code, 200, JSON.stringify(draft.body));
  const programmeId = draft.body.programme.programmeId;
  publishProgrammeVersion(built.programme, 1, { actor: 'u-sen-coach', now: '2026-08-26T00:00:00.000Z' });
  const published = await call('u-sen-coach', { method: 'POST', body: {
    op: 'publish_programme', programmeId, versionNumber: 1,
    programme: built.programme, reviewAcknowledged: true } });
  assert.equal(published.code, 200, JSON.stringify(published.body));
  const snapshot = snapshotForProgrammeAssignment(built.programme, 1,
    { catalogue: getCatalogue(), now: '2026-08-26T00:00:00.000Z' });
  const assigned = await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: snapshot.programmeVersionId, versionNumber: snapshot.versionNumber,
    snapshot, startDate: '2026-09-01' } });
  assert.equal(assigned.code, 200, JSON.stringify(assigned.body));

  // AND THE PLAYER GETS IT: their own read returns the pinned programme.
  const mine = await call('u-sen-player');
  assert.equal(mine.code, 200);
  assert.equal(mine.body.assignments.length, 1);
  assert.equal(mine.body.assignments[0].programmeTitle, built.programme.title);
  assert.ok(mine.body.assignments[0].snapshot, 'the player trains from the pinned snapshot');
  assert.equal(mine.body.assignments[0].status, 'scheduled');
});
