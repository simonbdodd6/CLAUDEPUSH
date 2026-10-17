/**
 * Build 117 — staging pipeline, entirely in-process:
 *
 *   Core publish (real handler) → M6/M7 producers → M4 capture → M1 store → M3 provider (+ M2 adapter)
 *   → loadCoachMemoriesForBrain → COPIED real Brain packages: M113 extractCoachDnaSignals →
 *   M114 buildCoachDnaProfile, M112 synthesizeCoachMemories → M230 buildCoachDnaCoachView.
 *
 * A two-group club (Seniors = INITIAL group, U18) with a group-scoped U18 coach, real sessions, the real
 * publish handler and a mocked Upstash — the same harness family as squad-group-isolation.test.js. The
 * Brain side is the byte-identical copy in packages/ (see packages/BRAIN_PROVENANCE.json); no Brain
 * provider rewrite and no endpoint exist yet — the Core provider is called directly and its output is
 * fed straight into the Brain's pure reasoning. Producers are enabled IN THIS PROCESS ONLY.
 * All data is synthetic — every player name/id, opposition and venue is a SENTINEL marker so the
 * privacy assertions can prove none of it reaches a memory or the Coach View.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.brain-staging-pipeline.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.COACH_MEMORY_PRODUCERS_ENABLED = 'true';   // this process only — production stays unset

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

// ── Core ────────────────────────────────────────────────────────────────────
const identity = await import('../api/_identityStore.js');
const memStore = await import('../api/_coachMemoryStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { loadCoachMemoriesForBrain, createCoachMemoryProvider } = await import('../api/_coachMemoryProvider.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = identity;
// ── Brain (byte-identical copies, provenance-tested) ────────────────────────
const { extractCoachDnaSignals } = await import('../packages/coach-memory/dna-signals.js');     // M113
const { buildCoachDnaProfile } = await import('../packages/coach-memory/dna-profile.js');       // M114
const { synthesizeCoachMemories } = await import('../packages/coach-memory/synthesis.js');      // M112
const { validateCoachMemoryEntry } = await import('../packages/coach-memory/model.js');         // M108
const { buildCoachDnaCoachView } = await import('../packages/coach-intelligence/coach-dna-coach-view.js'); // M230

// ── A staging club with two playing groups ──────────────────────────────────
const CLUB = 'club-stg';
const SEN = INITIAL_GROUP_ID;
const U18 = 'grp-u18';
const U18_COACH = 'u-u18-coach';
const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
  ],
};
const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: U18_COACH,     role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-u18-player', teamId: CLUB, userId: 'u-u18-player', role: 'player', status: 'active', playerGroupId: U18 },
];
const FIXTURES = [
  { id: 'fx-sen', groupId: SEN, sideId: 't-prem', team: 'Premier',     opposition: 'Opposition Sentinel SEN', date: '2026-08-20', status: 'scheduled' },
  { id: 'fx-u18', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Opposition Sentinel U18', date: '2026-08-22', status: 'scheduled' },
];

const cookies = new Map();
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Staging Club' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@sentinel.test`, displayName: `${m.userId} Name Sentinel` }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: FIXTURES }));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: CLUB, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}

// Sentinel-laden Core inputs: 3 training sessions, a 15 + 8 team sheet.
const SESSIONS = Array.from({ length: 3 }, (_, i) => ({ id: `s${i + 1}`, title: `Session Title Sentinel ${i + 1}`, type: 'Training', venue: 'Venue Sentinel' }));
const STARTER_NAMES = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `Starter Sentinel ${i + 1}`]));
const STARTER_KEYS  = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `id:pid-starter-${i + 1}`]));
const BENCH_NAMES   = Array.from({ length: 8 }, (_, i) => `Bench Sentinel ${i + 1}`);
const BENCH_KEYS    = Array.from({ length: 8 }, (_, i) => `id:pid-bench-${i + 1}`);
const U18_SHEET = { type: 'squad', data: {
  published: true, publishedAt: '2026-08-21T10:00:00.000Z', fixtureId: 'fx-u18', sideId: 't-u18a',
  opposition: 'Opposition Sentinel U18', venue: 'Venue Sentinel', announcement: 'Announcement Sentinel', gamePlan: 'Game Plan Sentinel',
  formationNames: STARTER_NAMES, formationKeys: STARTER_KEYS, benchPlayers: BENCH_NAMES, benchKeys: BENCH_KEYS,
} };
const MARKERS = ['Sentinel', 'pid-', 'id:', '@', 'sentinel.test', 'fx-u18', 't-u18a', 'u-u18-player'];
const assertNoMarkers = (value, what) => {
  const s = JSON.stringify(value);
  for (const m of MARKERS) assert.ok(!s.includes(m), `${what} must not contain "${m}": ${s.slice(0, 400)}`);
};

// One run of the whole pipeline, shared by the assertions below (deterministic: same inputs → same outputs).
async function runPipeline() {
  await seed();
  const training = await post(U18_COACH, { type: 'sessions', data: SESSIONS });        // 3. publish training as U18
  const squad = await post(U18_COACH, U18_SHEET);                                        // 4. publish the U18 team sheet
  const stored = await memStore.listCoachMemories({ teamId: CLUB, coachId: U18_COACH }); // 5. what Core persisted
  const entries = await loadCoachMemoriesForBrain({ teamId: CLUB, coachId: U18_COACH }); // 6. the Core provider
  const signals = extractCoachDnaSignals(entries);                                       // 7–8. M113 (validates every entry)
  const profile = buildCoachDnaProfile(signals);                                         //      M114
  const synthesis = synthesizeCoachMemories(entries);                                    // 9.   M112
  const view = buildCoachDnaCoachView({ profile, synthesis });                           //      M230
  return { training, squad, stored, entries, signals, profile, synthesis, view };
}
const P = await runPipeline();

test('1–4. the staging club publishes training and a team sheet as the group-scoped U18 coach', () => {
  assert.equal(P.training.code, 200, JSON.stringify(P.training.body));
  assert.equal(P.training.body.groupId, U18, 'training resolved to the coach\'s own group');
  assert.equal(P.squad.code, 200, JSON.stringify(P.squad.body));
  assert.equal(P.squad.body.squad.fixtureId, 'fx-u18');
  // Core behaviour is unchanged by the staging build: the sheet and the group-scoped schedule are stored
  assert.ok(kv.get(`app:publish:${CLUB}:fixture:fx-u18:side:t-u18a:squad`), 'U18 sheet stored');
  assert.ok([...kv.keys()].some(k => k.startsWith(`app:publish:${CLUB}:group:`) && k.endsWith(':sessions')), 'group-scoped schedule stored');
});

test('5. exactly the expected M6 and M7 memories exist — and only for the U18 coach', async () => {
  // Compared sorted by type: two writes in the same millisecond tie on createdAt and the store then
  // orders by the (random-suffixed) id, so the stored ORDER of the pair is not asserted.
  assert.deepEqual(P.stored.map(m => [m.type, m.source, m.statement]).sort((a, b) => a[0].localeCompare(b[0])), [
    ['selection-preference', 'selection-decision', 'Published a squad with 15 starters and 8 replacements.'],
    ['training-preference', 'assistant-derived', 'Published a training schedule of 3 sessions.'],
  ]);
  for (const m of P.stored) assert.deepEqual(m.ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: U18 }]);
  assert.deepEqual(await memStore.listCoachMemories({ teamId: CLUB, coachId: 'u-sen-coach' }), []);
  assert.equal([...kv.keys()].filter(k => k.includes('coach_memory:')).length, 1, 'one collection: the publishing coach');
});

test('6. loadCoachMemoriesForBrain returns Brain-ready entries that pass the copied M108 validator', () => {
  assert.equal(P.entries.length, 2);
  for (const e of P.entries) {
    assert.equal(validateCoachMemoryEntry(e), true);                      // the REAL Brain contract, not a mirror
    assert.deepEqual(Object.keys(e).slice(0, 3), ['id', 'coachId', 'clubId']);
  }
  assert.ok(Object.isFrozen(P.entries) && Object.isFrozen(P.entries[0]));
});

test('7–8. M113 → M114: the copied Brain derives real DNA signals and a profile from Core memories', () => {
  assert.deepEqual(P.signals.signals.map(s => [s.category, s.occurrences]).sort(), [['selection-preference', 1], ['training-preference', 1]]);
  assert.equal(P.signals.summary.totalSignals, 2);
  assert.deepEqual(P.signals.signals.flatMap(s => s.supportingMemoryIds).sort(), P.entries.map(e => e.id).sort(), 'every memory supports a signal');
  assert.ok(Array.isArray(P.profile.dominantSignals) && P.profile.dominantSignals.length === 2);
  for (const s of P.profile.dominantSignals) assert.ok(s.strength > 0 && s.strength <= 1);
});

test('9–11. M112 + M230: a real Coach View is produced with the selection and training themes', () => {
  const v = P.view;
  // Equal strengths tie-break on category (ASC) inside the Brain, so the headline is deterministic
  // whatever order the two memories were stored in.
  assert.equal(v.headline, 'Selection focus — 2 memories across 2 themes, high confidence');
  assert.equal(v.confidence.level, 'HIGH');
  assert.deepEqual(v.themes.map(t => t.type).sort(), ['selection-preference', 'training-preference']);
  assert.deepEqual(v.themes.map(t => t.label).sort(), ['Selection', 'Training']);
  assert.deepEqual(v.dominantSignals.map(s => s.category).sort(), ['selection-preference', 'training-preference']);
  assert.equal(v.knowledge.totalMemories, 2);
  assert.equal(v.knowledge.uniqueTypes, 2);
  assert.equal(v.summary, 'Coach has 2 recorded coaching memories across 2 coaching themes.');
  assert.deepEqual(v.metadata, { explainable: true, deterministic: true, llmGenerated: false });
  assert.ok(Object.isFrozen(v));
});

test('12. no player names, player ids, emails, opposition or venue reach a memory, the entries or the Coach View', () => {
  assertNoMarkers(P.stored, 'stored memories');
  assertNoMarkers(P.entries, 'provider entries');
  assertNoMarkers(P.signals, 'M113 signals');
  assertNoMarkers(P.profile, 'M114 profile');
  assertNoMarkers(P.synthesis, 'M112 synthesis');
  assertNoMarkers(P.view, 'M230 coach view');
  // the only identifiers anywhere in the Brain input are the coach, the club and the playing group
  const ids = new Set(P.entries.flatMap(e => [e.coachId, e.clubId, ...e.ontologyLinks.map(l => l.id)]));
  assert.deepEqual([...ids].sort(), [CLUB, U18, U18_COACH].sort());
});

test('13. owner and scope: coachId = the U18 coach, clubId = the staging club, team link = U18', () => {
  for (const e of P.entries) {
    assert.equal(e.coachId, U18_COACH);
    assert.equal(e.clubId, CLUB);
    assert.deepEqual(e.ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: U18 }]);
    assert.ok(!e.ontologyLinks.some(l => l.id === SEN), 'never the Seniors group');
  }
});

test('14. the data stays group-scoped end to end: Seniors sees none of it, and the pipeline is deterministic', async () => {
  // the Seniors coach's Brain read is neutral DNA — nothing of U18's leaks across the group boundary
  const sen = await createCoachMemoryProvider({ teamId: CLUB, coachId: 'u-sen-coach' });
  assert.deepEqual([...sen.getCoachMemories()], []);
  assert.equal(sen.getCoachMemoryAdapterReport().neutralDna, true);
  // a second full run from a clean store yields a byte-identical Coach View (ids/timestamps aside)
  const strip = v => JSON.stringify(v, (k, x) => (k === 'id' || k === 'createdAt' || k === 'supportingMemoryIds' ? undefined : x));
  const again = await runPipeline();
  assert.equal(strip(again.view), strip(P.view));
  assert.equal(strip(again.signals), strip(P.signals));
});
