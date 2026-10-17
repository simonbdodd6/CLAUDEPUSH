/**
 * Build 117 — tenant and group isolation across the Core → Brain boundary.
 *
 * Two clubs, each with real sessions and the real publish handler (mocked Upstash). In the staging club
 * a Seniors coach and a U18 coach each publish their own group's work; a second club's coach publishes
 * too. Then every Brain read (the Core provider → the copied real Brain M113/M114/M112/M230) is checked
 * against the existing Core scope model: a coach's Brain read contains only their own group's memories,
 * the Seniors coach never receives U18 and vice-versa, and no club can receive another club's memory —
 * including a cross-club scope that reuses a real coach id. Producers are enabled in this process only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.brain-staging-isolation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.COACH_MEMORY_PRODUCERS_ENABLED = 'true';   // this process only

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

const identity = await import('../api/_identityStore.js');
const memStore = await import('../api/_coachMemoryStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { loadCoachMemoriesForBrain } = await import('../api/_coachMemoryProvider.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = identity;
const { extractCoachDnaSignals } = await import('../packages/coach-memory/dna-signals.js');
const { buildCoachDnaProfile } = await import('../packages/coach-memory/dna-profile.js');
const { synthesizeCoachMemories } = await import('../packages/coach-memory/synthesis.js');
const { buildCoachDnaCoachView } = await import('../packages/coach-intelligence/coach-dna-coach-view.js');

const CLUB = 'club-stg', OTHER = 'club-other';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18';
const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  { id: 'm-sen-coach', teamId: CLUB,  userId: 'u-sen-coach',   role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB,  userId: 'u-u18-coach',   role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-other',     teamId: OTHER, userId: 'u-other-coach', role: 'coach', status: 'active', accessProfile: 'full' },
];
const STRUCTURE = { version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }, { id: U18, name: 'U18', type: 'age-grade', status: 'active' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }, { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' }] };
const OTHER_STRUCTURE = { version: 1, groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }], teams: [{ id: 't-o1', groupId: SEN, name: 'Firsts', status: 'active' }] };

const cookies = new Map();
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Staging Club' }, { id: OTHER, name: 'Other Club' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify(OTHER_STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: [
    { id: 'fx-sen', groupId: SEN, sideId: 't-prem', team: 'Premier',     opposition: 'Mons',  date: '2026-08-20', status: 'scheduled' },
    { id: 'fx-u18', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Liège', date: '2026-08-22', status: 'scheduled' },
  ] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ fixtures: [{ id: 'fx-o', groupId: SEN, sideId: 't-o1', team: 'Firsts', opposition: 'Away', date: '2026-08-23', status: 'scheduled' }] }));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
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
const sheet = (fixtureId, sideId, n) => ({ type: 'squad', data: { published: true, fixtureId, sideId,
  formationNames: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), `P${i + 1}`])), benchPlayers: ['B1', 'B2'] } });
const sessions = n => ({ type: 'sessions', data: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `S${i + 1}`, type: 'Training' })) });
const coachView = entries => {
  const profile = buildCoachDnaProfile(extractCoachDnaSignals(entries));
  return buildCoachDnaCoachView({ profile, synthesis: synthesizeCoachMemories(entries) });
};

// Seniors coach: TRAINING only. U18 coach: a TEAM SHEET only. Other club's coach: both.
// Distinct memory types per coach make any cross-group or cross-club leak visible in the Brain output.
await seed();
const r = {
  senTraining: await post('u-sen-coach', sessions(2)),
  u18Squad:    await post('u-u18-coach', sheet('fx-u18', 't-u18a', 15)),
  otherTraining: await post('u-other-coach', sessions(4)),
  otherSquad:  await post('u-other-coach', sheet('fx-o', 't-o1', 13)),
  // and two refusals that must write nothing: U18 coach on a Seniors fixture; U18 coach on the other club's fixture
  u18OnSen:    await post('u-u18-coach', sheet('fx-sen', 't-prem', 15)),
  u18OnOther:  await post('u-u18-coach', sheet('fx-o', 't-o1', 15)),
};

test('setup: each coach published their own group\'s work; cross-group and cross-club publishes were refused', () => {
  for (const k of ['senTraining', 'u18Squad', 'otherTraining', 'otherSquad']) assert.equal(r[k].code, 200, `${k}: ${JSON.stringify(r[k].body)}`);
  assert.equal(r.senTraining.body.groupId, SEN);
  assert.notEqual(r.u18OnSen.code, 200, 'U18 coach cannot publish a Seniors sheet');
  assert.notEqual(r.u18OnOther.code, 200, 'U18 coach cannot publish into another club');
});

test('the U18 coach\'s Brain read contains U18 memory only — selection, never the Seniors training', async () => {
  const entries = await loadCoachMemoriesForBrain({ teamId: CLUB, coachId: 'u-u18-coach' });
  assert.deepEqual(entries.map(e => e.type), ['selection-preference']);
  assert.deepEqual(entries[0].ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: U18 }]);
  assert.equal(entries[0].coachId, 'u-u18-coach'); assert.equal(entries[0].clubId, CLUB);
  const view = coachView(entries);
  assert.deepEqual(view.themes.map(t => t.type), ['selection-preference']);
  assert.ok(!JSON.stringify(view).includes('Training'), 'no Seniors training theme in the U18 coach\'s view');
  assert.equal(view.knowledge.totalMemories, 1);
});

test('the Seniors coach\'s Brain read contains Seniors memory only — training, never the U18 selection', async () => {
  const entries = await loadCoachMemoriesForBrain({ teamId: CLUB, coachId: 'u-sen-coach' });
  assert.deepEqual(entries.map(e => e.type), ['training-preference']);
  assert.deepEqual(entries[0].ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: SEN }]);
  const view = coachView(entries);
  assert.deepEqual(view.themes.map(t => t.type), ['training-preference']);
  assert.ok(!JSON.stringify(view).includes('Selection'));
  assert.ok(!JSON.stringify(entries).includes(U18), 'the U18 group id never appears in the Seniors read');
});

test('a different club cannot receive the staging club\'s memory — even when a real coach id is reused', async () => {
  // the other club's own coach sees exactly their own two memories, linked to THEIR club
  const other = await loadCoachMemoriesForBrain({ teamId: OTHER, coachId: 'u-other-coach' });
  assert.deepEqual(other.map(e => e.type).sort(), ['selection-preference', 'training-preference']);
  for (const e of other) { assert.equal(e.clubId, OTHER); assert.equal(e.ontologyLinks[0].id, OTHER); }
  assert.ok(!JSON.stringify(other).includes(CLUB), 'the staging club never appears in the other club\'s read');
  // cross-club scopes read nothing: the tenant is the storage key, not a filter
  assert.deepEqual([...await loadCoachMemoriesForBrain({ teamId: OTHER, coachId: 'u-u18-coach' })], []);
  assert.deepEqual([...await loadCoachMemoriesForBrain({ teamId: OTHER, coachId: 'u-sen-coach' })], []);
  assert.deepEqual([...await loadCoachMemoriesForBrain({ teamId: CLUB, coachId: 'u-other-coach' })], []);
  // and the refused publishes left no trace anywhere
  assert.equal([...kv.keys()].filter(k => k.includes('coach_memory:')).length, 3, 'exactly three collections: one per publishing coach');
  assert.equal((await memStore.listCoachMemories({ teamId: CLUB, coachId: 'u-u18-coach' })).length, 1);
});

test('Brain views are built per coach from per-coach reads — combining them is impossible by construction', async () => {
  // The provider API has no "all coaches" or "whole club" read: a Brain view can only ever be built from
  // ONE coach's scope, so a club-wide or cross-coach Coach DNA cannot be assembled by accident.
  const mod = await import('../api/_coachMemoryProvider.js');
  assert.deepEqual(Object.keys(mod).sort(), ['createCoachMemoryProvider', 'loadCoachMemoriesForBrain']);
  const storeMod = await import('../api/_coachMemoryStore.js');
  assert.ok(!Object.keys(storeMod).some(k => /all|club|scan|every/i.test(k)), `no club-wide read on the store: ${Object.keys(storeMod).join(', ')}`);
});
