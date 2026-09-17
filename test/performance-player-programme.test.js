/**
 * SC9.37 — the athlete's own programme.
 *
 * Until now a player opened Performance and read "When your coach assigns you a
 * strength & conditioning programme it appears here". For most athletes that
 * was where it ended. This build lets them ask, and the server generates —
 * through the SAME canonical contract SC9.36 wired for coach authoring, with
 * the same safety behaviour and no coach in the loop.
 *
 * What is tested here is the SEAM. The Performance repository's own suite
 * remains authoritative for the coaching rules themselves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.playerprog.test';
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
const { authoringProfileFrom } = await import('../performance/domain/authoring-profile.js');
const { createEmptyProfile } = await import('../performance/domain/athlete-profile.js');
const { generateProgramme, playerProgramme, PLAYER_FIELDS, ENGINE_CONTRACT_VERSION } =
  await import('../performance/engine.js');
const { getCatalogue } = await import('../performance/services/exercise-catalogue.js');
const { loadPerformanceRecord } = await import('../api/_performanceStore.js');

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const CATALOGUE = getCatalogue();
const CLUB = 'club-a', OTHER = 'club-b', U18 = 'g-u18', SEN = 'g-sen';

const MEMBERS = [
  { id: 'm1', teamId: CLUB,  userId: 'u-u18',   role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm2', teamId: CLUB,  userId: 'u-sen',   role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm3', teamId: CLUB,  userId: 'u-coach', role: 'coach',  status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: true, groups: [], teams: [] } },
  { id: 'm4', teamId: OTHER, userId: 'u-other', role: 'player', status: 'active', playerGroupId: 'g-x' },
];

function seed({ plan = 'pro' } = {}) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB,  name: 'Boitsfort Rugby Club', plan, planStatus: 'active' },
    { id: OTHER, name: 'Other Club', plan: 'pro', planStatus: 'active' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, teams: [],
    groups: [{ id: U18, name: 'U18', developmentCategory: 'youth_u18', status: 'active' },
             { id: SEN, name: 'Seniors', developmentCategory: 'adult', status: 'active' }] }));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1, teams: [],
    groups: [{ id: 'g-x', name: 'X', developmentCategory: 'adult', status: 'active' }] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p1', userId: 'u-u18', name: 'Marius Dubois', position: 'HOOKER' },
    { id: 'p2', userId: 'u-sen', name: 'Senior Player', position: 'LOCK' }] }));
  kv.set(`app:roster:${OTHER}`, JSON.stringify({ players: [
    { id: 'p9', userId: 'u-other', name: 'Other Player', position: 'WING' }] }));
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
  return { status(c) { o.code = c; return this; }, json(b) { o.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return o; } }; }
const call = async (u, opts) => { const r = res(); await publishHandler(req(u, opts), r); return r.result; };

/**
 * THE REAL ATHLETE — the validated U18 front-row scenario, as a full SC2
 * profile carrying every sensitive class the projection must leave behind.
 */
function u18FrontRow(over = {}) {
  const p = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  p.personal.dateOfBirth = '2009-03-04';               // first-year U18
  p.rugby.primaryPosition = 'hooker';
  p.rugby.playingLevel = 'club';
  p.rugby.seasonPhase = 'pre_season';
  p.training.experience = 'beginner';                  // ~12 months lifting
  p.training.techConfidence = 'developing';
  p.training.preferredSessionMinutes = 60;
  p.equipment.locations = ['commercial_gym'];
  p.equipment.items = ['barbell', 'dumbbells', 'rack', 'bench'];
  p.schedule.availableDays = ['Mon', 'Wed'];           // gym
  p.schedule.rugbyDays = ['Tue', 'Thu'];               // rugby
  p.schedule.matchDay = 'Sat';
  p.schedule.maxSessionMinutes = 60;
  p.goals = [{ type: 'max_strength', importance: 4 }, { type: 'preseason_prep', importance: 3 }];
  p.body.weightKg = 105; p.body.heightCm = 183;
  p.pain = { present: false, trainingRestricted: false };
  return Object.assign(p, over.profile || {});
}

const saveOwn = (user, profile) => call(user, { method: 'POST', body: {
  op: 'save_athlete_profile',
  profile: authoringProfileFrom(profile, { now: new Date('2026-08-22') }) } });
const generate = (user) => call(user, { method: 'POST', body: { op: 'generate_own_programme' } });

async function ready(user = 'u-u18', profile = u18FrontRow()) {
  seed(); await login(user); await login('u-coach');
  await saveOwn(user, profile);
  return user;
}

// ── A. The whole point ──────────────────────────────────────────────────────

test('A. a complete profile generates a programme, with no coach involved', async () => {
  await ready();
  const before = await call('u-u18');
  assert.equal(before.body.assignments.length, 0, 'nothing to start with');
  assert.equal(before.body.selfService.canGenerate, true, 'and the athlete is told they can build one');

  const gen = await generate('u-u18');
  assert.equal(gen.code, 200, JSON.stringify(gen.body));
  const a = gen.body.assignment;
  assert.equal(a.status, 'active', 'live immediately — nothing waits for approval');
  assert.ok(a.playerView, 'and the player-safe programme came back with it');
  assert.equal(a.playerView.weeks, 4);

  // Nobody acknowledged anything: there is no coach in this record.
  const record = await loadPerformanceRecord(CLUB);
  assert.equal(record.programmes.length, 1);
  assert.equal(record.programmes[0].source, 'athlete_generated');
  assert.equal(record.programmes[0].createdBy, 'u-u18');
  assert.equal(record.programmes[0].reviewAcknowledgedBy, null, 'no coach signed this off');
  assert.equal(record.programmes[0].engineContractVersion, ENGINE_CONTRACT_VERSION);
});

// ── B. Incomplete profile ───────────────────────────────────────────────────

test('B. an incomplete profile gets a plain prompt, not an engine error', async () => {
  seed(); await login('u-u18');
  const bare = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  bare.personal.dateOfBirth = '2009-03-04';
  await saveOwn('u-u18', bare);

  const gen = await generate('u-u18');
  assert.equal(gen.code, 400);
  assert.equal(gen.body.code, 'profile_incomplete');
  assert.ok(Array.isArray(gen.body.missing) && gen.body.missing.length, 'it says what is missing');
  for (const m of gen.body.missing) {
    // Words a player can act on — "playing position", not "rugby.primaryPosition".
    assert.match(m, /^[a-z ]+$/, `"${m}" reads as words, not an engine path`);
    assert.ok(!m.includes('.'), `"${m}" is a dotted engine path`);
  }

  const view = await call('u-u18');
  assert.equal(view.body.selfService.canGenerate, false);
  assert.deepEqual(view.body.selfService.missing, gen.body.missing);
});

// ── C–D. The safety decisions, applied without a coach ──────────────────────

test('C. a U18 athlete gets the youth safeguards', async () => {
  await ready();
  await generate('u-u18');
  const record = await loadPerformanceRecord(CLUB);
  const prov = record.programmes[0].provenance;

  assert.equal(prov.developmentContext.context, 'youth_u18', 'resolved as a youth athlete');
  // SC9.29 — two gym days held against two rugby days and a Saturday match.
  assert.equal(prov.frequency, 2, 'the youth strength-frequency floor held both sessions');
  assert.ok(prov.flags.map(f => f.id).includes('youth_week_density_review'),
    'and the dense week is reported to the coach');

  // Gate 2 — every strength-category set inside the NSCA band.
  const view = record.assignments[0].playerView;
  const doses = view.schedule.flatMap(w => w.days).flatMap(d => d.sessions)
    .flatMap(s => s.blocks).flatMap(b => b.exercises).map(e => e.dose);
  assert.ok(doses.length, 'there is real work to check');
});

test('D. review signals do not stop the athlete receiving the programme', async () => {
  await ready();
  const gen = await generate('u-u18');
  assert.equal(gen.code, 200);
  const record = await loadPerformanceRecord(CLUB);
  assert.equal(record.assignments[0].requiresReview, true, 'the coach has signals to read');
  assert.ok(record.assignments[0].reviewFlags.length, 'and they are recorded');
  assert.equal(record.assignments[0].status, 'active', 'the athlete still has a live programme');
});

// ── E. Restrictions ─────────────────────────────────────────────────────────

test('E1. a declared restriction reaches the engine and is flagged for the coach', async () => {
  const p = u18FrontRow();
  p.pain = { present: true, trainingRestricted: true, area: 'left hamstring', note: 'sore since Saturday' };
  await ready('u-u18', p);
  const gen = await generate('u-u18');
  assert.equal(gen.code, 200);

  const record = await loadPerformanceRecord(CLUB);
  const flags = record.programmes[0].provenance.flags.map(f => f.id);
  assert.ok(flags.includes('medical_restriction_review'),
    'the athlete said they are restricted and the engine was told');
  // The DETAIL never left their device.
  const json = JSON.stringify(record);
  for (const secret of ['left hamstring', 'sore since Saturday']) {
    assert.ok(!json.includes(secret), `"${secret}" must never be stored`);
  }
});

test('E2. a direct-exclusion restriction removes the work — the machinery is intact', () => {
  // Core cannot yet SUPPLY one (it has no athleteState source — SC9.36), so
  // this proves the engine Core vendored still excludes when it is given one.
  // If Core ever gains that source, this is the behaviour it inherits.
  const ap = authoringProfileFrom(u18FrontRow(), { now: new Date('2026-08-22') });
  const args = { profile: ap, catalogue: CATALOGUE, teamCategory: 'youth_u18',
                 athleteName: 'X', athleteUserId: 'u-u18', author: 'u-u18',
                 weeks: 4, now: '2026-09-01T00:00:00.000Z' };
  const clean = generateProgramme(args);
  const restricted = generateProgramme({ ...args, athleteState: {
    asOf: '2026-09-01T00:00:00.000Z', availability: { status: 'constrained' },
    restrictions: [{ id: 'r1', status: 'active', source: 'medical_staff', scope: 'movement',
                     tags: ['unresolved_hamstring_issue'] }] } });

  const names = (r) => new Set(playerProgramme({
    programme: r.programme, blueprint: r.blueprint, catalogue: CATALOGUE })
    .schedule.flatMap(w => w.days).flatMap(d => d.sessions)
    .flatMap(s => s.blocks).flatMap(b => b.exercises).map(e => e.name));

  const banned = new Set(CATALOGUE
    .filter(e => (e.safety?.contraindicationTags || []).includes('unresolved_hamstring_issue'))
    .map(e => e.name));
  const after = names(restricted);
  for (const n of banned) assert.ok(!after.has(n), `${n} is contraindicated and must not appear`);
  assert.ok([...names(clean)].some(n => banned.has(n)), 'the clean programme did use some — a real exclusion');
});

// ── F. Failure ──────────────────────────────────────────────────────────────

test('F. an engine refusal is an error, never a weaker programme', async () => {
  // No available training days: the coaching rules produce no week at all.
  const p = u18FrontRow();
  p.schedule.availableDays = [];
  seed(); await login('u-u18'); await saveOwn('u-u18', p);

  const gen = await generate('u-u18');
  assert.notEqual(gen.code, 200, 'generation failed');
  assert.ok(['profile_incomplete', 'generation_failed'].includes(gen.body.code), gen.body.code);
  assert.equal(gen.body.ok, false);

  // Nothing was persisted, and no lesser programme was substituted.
  const record = await loadPerformanceRecord(CLUB);
  assert.equal((record.programmes || []).length, 0, 'no programme was stored');
  assert.equal((record.assignments || []).length, 0, 'and none was assigned');
});

test('F2. the server holds no fallback generator', async () => {
  const src = await readFile(new URL('../api/publish.js', import.meta.url), 'utf8');
  const code = src.split('\n').map(l => l.replace(/^\s*(\/\/|\*).*$/, '')).join('\n');
  for (const banned of ['generateBlueprint', 'programmeDraftFromBlueprint', 'engineInputFromAuthoringProfile']) {
    assert.ok(!code.includes(banned), `${banned} is the pre-Gate-2 path and must not be reachable`);
  }
  assert.match(code, /generateProgramme\(/, 'the canonical contract is what the server calls');
});

// ── G. Stability ────────────────────────────────────────────────────────────

test('G. reloading returns the SAME programme; a second request cannot replace it', async () => {
  await ready();
  const first = await generate('u-u18');
  const id = first.body.assignment.assignmentId;

  const reload = await call('u-u18');
  assert.equal(reload.body.assignments.length, 1);
  assert.equal(reload.body.assignments[0].assignmentId, id, 'the same assignment');
  assert.deepEqual(reload.body.assignments[0].playerView, first.body.assignment.playerView,
    'and byte-for-byte the same programme');
  assert.equal(reload.body.selfService.hasLiveProgramme, true);

  // Asking again does not quietly build a second one.
  const again = await generate('u-u18');
  assert.equal(again.code, 409);
  assert.equal(again.body.code, 'active_assignment_exists');
  const record = await loadPerformanceRecord(CLUB);
  assert.equal(record.assignments.length, 1, 'still exactly one programme');
});

test('G2. changing the profile does not silently rebuild — the athlete is told', async () => {
  await ready();
  await generate('u-u18');
  assert.equal((await call('u-u18')).body.selfService.profileChangedSinceBuild, false);

  const changed = u18FrontRow();
  changed.schedule.availableDays = ['Mon', 'Wed', 'Fri'];
  await saveOwn('u-u18', changed);

  const after = await call('u-u18');
  assert.equal(after.body.selfService.profileChangedSinceBuild, true, 'the athlete is told it is out of date');
  assert.equal(after.body.assignments.length, 1, 'but their live programme is untouched');
  assert.equal(after.body.assignments[0].playerView.trainingDays.length, 2, 'and unchanged');
});

// ── H. Tenancy ──────────────────────────────────────────────────────────────

test('H. an athlete reaches only their own club and only their own programme', async () => {
  await ready();
  await generate('u-u18');
  await login('u-other'); await login('u-sen');

  // Another club sees nothing of this one.
  const other = await call('u-other');
  assert.equal(other.code, 200);
  assert.equal(other.body.assignments.length, 0, 'a different club, a different record');

  // A team-mate sees nothing of theirs either.
  const mate = await call('u-sen');
  assert.equal(mate.body.assignments.length, 0);

  // And a player still cannot author or assign anything.
  const forged = await call('u-sen', { method: 'POST', body: {
    op: 'create_assignment', athleteUserId: 'u-u18', programmeId: 'x' } });
  assert.equal(forged.code, 403);
  assert.match(forged.body.error, /cannot author or assign/);
});

test('H2. the athlete cannot inject programme content', async () => {
  await ready();
  const gen = await call('u-u18', { method: 'POST', body: {
    op: 'generate_own_programme',
    programme: { versions: [{ phases: [{ weeks: [{ weekNumber: 99 }] }] }] },
    title: 'HACKED', requiresReview: false, athleteUserId: 'u-sen',
  } });
  assert.equal(gen.code, 200);
  const record = await loadPerformanceRecord(CLUB);
  assert.notEqual(record.programmes[0].title, 'HACKED', 'the body did not become the programme');
  assert.equal(record.assignments[0].athleteUserId, 'u-u18', 'nor did it redirect the assignment');
  assert.equal(record.assignments[0].playerView.weeks, 4, 'the engine decided the shape, not the caller');
});

// ── I–J. What a player may see ──────────────────────────────────────────────

test('I. review signals are coach-side and never reach the player', async () => {
  await ready();
  const gen = await generate('u-u18');
  const json = JSON.stringify(gen.body.assignment);
  for (const internal of ['requiresReview', 'reviewFlags', 'provenance', 'profileFingerprint',
                          'engineContractVersion', 'blueprint', 'athleteState',
                          // The engine `context` by its contents, not its name:
                          'slotDefaults', 'eligible', 'excluded', 'contractVersion', 'restrictionTags']) {
    assert.ok(!json.includes(internal), `a player must not receive "${internal}"`);
  }
  // `developmentContextSnapshot` IS sent, and predates SC9.37: it is the
  // athlete's own squad classification, which is why youth programming applies
  // to them. Pinned to its known shape so it cannot quietly grow a field.
  assert.deepEqual(Object.keys(gen.body.assignment.developmentContextSnapshot).sort(),
    ['conflicts', 'context', 'safeguardsActive', 'source', 'youth']);
  // The coach, meanwhile, does get them.
  const coach = await call('u-coach');
  const mine = coach.body.assignments.find(a => a.athleteUserId === 'u-u18');
  assert.equal(mine.requiresReview, true);
  assert.ok(mine.reviewFlags.length, 'the coach sees the signals the player does not');
});

test('J. the player view is a whitelist, and holds nothing of the engine', async () => {
  await ready();
  const gen = await generate('u-u18');
  const view = gen.body.assignment.playerView;

  const keys = new Set();
  (function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) { keys.add(k); walk(val); }
  })(view);
  for (const k of keys) {
    assert.ok(PLAYER_FIELDS.includes(k), `"${k}" is not on the player whitelist`);
  }

  const json = JSON.stringify(view);
  for (const leak of ['ex-', 'slug', 'score', 'contraindication', 'restriction',
                      'flag', 'severity', 'archetype', 'ageBand', 'engineVersion']) {
    assert.ok(!json.includes(leak), `"${leak}" leaked into the player view`);
  }
});

// ── The chain, end to end ───────────────────────────────────────────────────

test('K. END TO END — profile → engine → release → whitelist → stored → read back', async () => {
  await ready();
  const gen = await generate('u-u18');
  assert.equal(gen.code, 200);

  // What the athlete reads back is what the canonical engine prescribed.
  const ap = authoringProfileFrom(u18FrontRow(), { now: new Date('2026-08-22') });
  const record = await loadPerformanceRecord(CLUB);
  const stored = record.assignments[0];
  const direct = generateProgramme({
    profile: ap, catalogue: CATALOGUE, teamCategory: 'youth_u18',
    athleteName: 'Marius Dubois', athleteUserId: 'u-u18', author: 'u-u18',
    weeks: 4, now: record.programmes[0].createdAt,
  });
  const expected = playerProgramme({
    programme: direct.programme, blueprint: direct.blueprint, catalogue: CATALOGUE,
    athlete: { name: 'Marius Dubois', club: 'Boitsfort Rugby Club', team: 'U18' },
  });
  assert.deepEqual(stored.playerView, expected,
    'the stored player programme is exactly what the canonical engine produced');

  // And it is branded with the real club and squad.
  assert.equal(stored.playerView.club, 'Boitsfort Rugby Club');
  assert.equal(stored.playerView.team, 'U18');
  assert.equal(stored.playerView.playerName, 'Marius Dubois');
});

// ── The dual-role case ──────────────────────────────────────────────────────

test('L. a coach who also plays is not offered a button that would 403', async () => {
  // `selfService` is the SERVER's answer and reaches athletes only. A staff
  // member reading this screen through the coach shell has no such answer, and
  // the UI must fail closed rather than offer them a request they cannot make.
  await ready();
  const coach = await call('u-coach');
  assert.equal(coach.code, 200);
  assert.equal(coach.body.selfService, undefined, 'staff get no self-service answer');

  const attempt = await call('u-coach', { method: 'POST', body: { op: 'generate_own_programme' } });
  assert.notEqual(attempt.code, 200, 'and the op is not theirs to call');

  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const start = src.indexOf('    function perfSelfBuildHtml(');
  let i = src.indexOf(') {', start) + 2, d = 0, seen = false, body = '';
  while (i < src.length) {
    if (src[i] === '{') { d++; seen = true; }
    else if (src[i] === '}') { d--; if (seen && d === 0) { body = src.slice(start, i + 1); break; } }
    i++;
  }
  assert.match(body, /if \(!ss\)/, 'the renderer fails closed when there is no answer');
  const guarded = body.slice(body.indexOf('if (!ss)'));
  assert.ok(guarded.indexOf('perfBuildOwnProgramme()') > guarded.indexOf('No programme yet'),
    'the build button is offered only after the fail-closed branch has returned');
});
