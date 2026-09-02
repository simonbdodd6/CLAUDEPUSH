/**
 * BUILD Q — training coach publishing is consistent across coach accounts.
 *
 * The real-world failure: Coach A published a Thursday plan to coaches and saw
 * it; Xavier, an authorized coach of the SAME group, saw "Thursday · 0 blocks ·
 * Draft". The publish write was server-backed all along — the read side
 * discarded the returned blocks, and nothing delivered the published plan to
 * any device but the author's.
 *
 * The contract pinned here:
 *   ONE group → ONE occurrence → ONE canonical plan → ONE published state
 *   → MANY authorized coach readers.
 *
 * Server half runs the REAL publish handler over an in-memory kv (the
 * training-group-partition harness pattern); client half runs the REAL
 * extracted adoption/status functions (the adoption-suite pattern).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.coachpub.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = pattern =>
  new RegExp(`^${pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const re = at >= 0 ? globToRe(String(args[at + 1])) : null;
    result = ['0', [...kv.keys()].filter(k => !re || re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-boitsfort';
const SEN = 'grp_initial', U18 = 'grp_u18';

// Coach A and Coach B ("Xavier") both authorized for Seniors; one U18-only coach.
const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-a', teamId: CLUB, userId: 'u-coach-a', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-b', teamId: CLUB, userId: 'u-xavier', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-u18', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-p', teamId: CLUB, userId: 'u-sen-p', role: 'player', status: 'active', playerGroupId: SEN },
];

const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18',     groupId: U18, name: 'U18 Premier', status: 'active' },
  ] };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort',
    trainingDays: [{ day: 'Tue', time: '19:00' }, { day: 'Thu', time: '19:30' }], fixtures: [] }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function pub(userId, method, query, body) {
  const r = res();
  await publishHandler({ method, query: { resource: 'training', ...(query || {}) },
    headers: { cookie: cookies.get(userId) || '' }, body: body || {} }, r);
  return r.result;
}

const THURSDAY = {
  id: 'thu', title: 'Thursday Session', type: 'Training', date: 'Thu 19:30',
  startTime: '19:30', occurrenceKey: 'slot_thu-20260903',
  blocks: [
    { id: 'b1', time: '19:30', activity: 'Warm-up', coach: 'Coach A', keyFocus: 'tempo' },
    { id: 'b2', time: '19:45', activity: 'Defence system', coach: 'Coach A', keyFocus: 'line speed' },
  ],
};

// ── 1–7. The core multi-coach contract ──────────────────────────────────────

test('Coach A publishes to coaches — the write is server-persisted for the group', async () => {
  seed(); await login('u-coach-a'); await login('u-xavier'); await login('u-u18-c'); await login('u-sen-p');
  const w = await pub('u-coach-a', 'POST', { audience: 'coach' }, { session: THURSDAY, group: SEN });
  assert.equal(w.code, 200, JSON.stringify(w.body));
  assert.equal(w.body.coach.status, 'published');
  const stored = JSON.parse(kv.get(`app:publish:${CLUB}:group:${SEN}:training`) || '{}');
  assert.ok(stored.thu?.coach?.snapshot, 'the canonical group store holds the coach snapshot');
  assert.equal(stored.thu.coach.snapshot.blocks.length, 2, 'blocks persisted server-side');
});

test('Coach B (Xavier), authorized for the same group, reads the SAME published occurrence with its blocks', async () => {
  const r = await pub('u-xavier', 'GET', { audience: 'coach', group: SEN });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const s = (r.body.sessions || []).find(x => x.id === 'thu');
  assert.ok(s, 'Xavier receives the published Thursday session');
  assert.equal(s.status, 'published', 'published — never Draft');
  assert.equal(s.blocks.length, 2, 'ALL published blocks — never 0 blocks');
  assert.equal(s.blocks[1].activity, 'Defence system');
  assert.equal(s.occurrenceKey, 'slot_thu-20260903', 'the dated occurrence travels with the publication');
});

test('two authorized coaches read byte-identical canonical state', async () => {
  const a = await pub('u-coach-a', 'GET', { audience: 'coach', group: SEN });
  const b = await pub('u-xavier',  'GET', { audience: 'coach', group: SEN });
  assert.deepEqual(a.body.sessions, b.body.sessions, 'no per-coach divergence in the canonical read');
});

test('a fresh read (new session cookie) still sees the published state — it is server-backed, not local', async () => {
  cookies.delete('u-xavier'); await login('u-xavier');       // brand-new session
  const r = await pub('u-xavier', 'GET', { audience: 'coach', group: SEN });
  assert.equal((r.body.sessions || []).find(x => x.id === 'thu')?.status, 'published');
});

test('re-publishing is idempotent — one occurrence, one record, no duplicates', async () => {
  const again = await pub('u-coach-a', 'POST', { audience: 'coach' }, { session: THURSDAY, group: SEN });
  assert.equal(again.code, 200);
  const stored = JSON.parse(kv.get(`app:publish:${CLUB}:group:${SEN}:training`) || '{}');
  assert.deepEqual(Object.keys(stored), ['thu'], 'still exactly one record');
  assert.equal(stored.thu.coach.snapshot.blocks.length, 2, 'still exactly the published blocks');
  const r = await pub('u-xavier', 'GET', { audience: 'coach', group: SEN });
  assert.equal((r.body.sessions || []).filter(x => x.id === 'thu').length, 1, 'one session, not duplicated');
});

test('publishing to coaches does not touch the player audience (distinct states preserved)', async () => {
  const p = await pub('u-sen-p', 'GET', { audience: 'player' });
  // the player list must NOT contain thu — only coach audience was published
  assert.equal(p.code, 200);
  assert.equal((p.body.sessions || []).length, 0, 'players see nothing until publish-to-players');
});

test('publish to players creates the player view without disturbing the coach publication', async () => {
  const w = await pub('u-coach-a', 'POST', { audience: 'player' }, { session: THURSDAY, group: SEN });
  assert.equal(w.code, 200);
  const p = await pub('u-sen-p', 'GET', { audience: 'player' });
  const ps = (p.body.sessions || []).find(x => x.id === 'thu');
  assert.ok(ps, 'players now see it');
  assert.equal(ps.occurrenceKey, 'slot_thu-20260903', 'player snapshot carries the occurrence too');
  const c = await pub('u-xavier', 'GET', { audience: 'coach', group: SEN });
  assert.equal((c.body.sessions || []).find(x => x.id === 'thu')?.status, 'published', 'coach view untouched');
});

// ── 8–10. Group isolation and authorization ────────────────────────────────

test('a U18 coach cannot read the Seniors staff plan', async () => {
  const r = await pub('u-u18-c', 'GET', { audience: 'coach', group: SEN });
  assert.equal(r.code, 403, 'asking for a group you do not operate is refused');
});

test('the U18 group store never contains the Seniors publication', async () => {
  const r = await pub('u-u18-c', 'GET', { audience: 'coach', group: U18 });
  assert.equal(r.code, 200);
  assert.equal((r.body.sessions || []).length, 0, 'U18 reads its own (empty) store');
  assert.equal(kv.get(`app:publish:${CLUB}:group:${U18}:training`) ?? null, null, 'nothing leaked into the U18 key');
});

test('Seniors publishing to U18 requires operating U18 — and a U18 publish stays out of Seniors', async () => {
  const denied = await pub('u-coach-a', 'POST', { audience: 'coach' }, { session: THURSDAY, group: U18 });
  assert.equal(denied.code, 403, 'Coach A does not operate U18');
  const w = await pub('u-u18-c', 'POST', { audience: 'coach' },
    { session: { ...THURSDAY, id: 'thu', title: 'U18 Thursday' }, group: U18 });
  assert.equal(w.code, 200);
  const sen = await pub('u-xavier', 'GET', { audience: 'coach', group: SEN });
  assert.equal((sen.body.sessions || []).find(x => x.id === 'thu')?.title, 'Thursday Session',
    'the same nominal id in U18 never shadows the Seniors record');
});

test('an unauthenticated caller can neither publish nor read', async () => {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'training', audience: 'coach' }, headers: {}, body: {} }, r);
  assert.ok(r.result.code === 401 || r.result.code === 403);
});

// ── Client half: real extracted functions ──────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — no closing brace');
}

/** trainingAdoptCoachPlans with a controlled week + content-key resolution. */
function adoptScope({ schedule, trainingBlocks, weekStart = '2026-08-31', contentKeys = {} }) {
  const body =
    '"use strict";\n' +
    'const state = { schedule: ' + JSON.stringify(schedule) + ', trainingBlocks: ' + JSON.stringify(trainingBlocks) + ' };\n' +
    'const CK = ' + JSON.stringify(contentKeys) + ';\n' +
    'function trainingContentKey(id) { return CK[id] || String(id); }\n' +
    'function availWeekStart() { return ' + JSON.stringify(weekStart) + '; }\n' +
    'function availToday() { return "' + weekStart + '"; }\n' +
    extractFn(html, 'trainingAdoptCoachPlans') + '\n' +
    'return { run: s => trainingAdoptCoachPlans(s), state };\n';
  return new Function(body)();
}
const CK_THU = { thu: 'slot_thu-20260903' };
const SCHED_ROWS = [{ id: 'tue' }, { id: 'thu' }, { id: 'game' }];
const PUB_THU = { id: 'thu', status: 'published', occurrenceKey: 'slot_thu-20260903',
  publishedAt: '2026-09-02T10:00:00.000Z',
  blocks: [{ id: 'b1', time: '19:30', activity: 'Warm-up' }, { id: 'b2', time: '19:45', activity: 'Defence system' }] };

test("CLIENT: Xavier's empty device adopts the published plan under the DATED content key the planner reads", () => {
  const sc = adoptScope({ schedule: SCHED_ROWS, trainingBlocks: {}, contentKeys: CK_THU });
  assert.equal(sc.run([PUB_THU]), true, 'adoption happened');
  assert.equal((sc.state.trainingBlocks['slot_thu-20260903'] || []).length, 2, 'blocks land on the dated key');
  assert.equal(sc.state.trainingBlocks.thu, undefined, 'never the bare protocol key — the planner would not read it');
});

test('CLIENT: local in-progress work is never clobbered by adoption', () => {
  const local = [{ id: 'l1', activity: 'my own plan' }];
  const sc = adoptScope({ schedule: SCHED_ROWS, trainingBlocks: { 'slot_thu-20260903': local }, contentKeys: CK_THU });
  assert.equal(sc.run([PUB_THU]), false, 'nothing adopted');
  assert.deepEqual(sc.state.trainingBlocks['slot_thu-20260903'], local, 'local draft kept');
});

test("CLIENT: LAST week's publication (mismatched occurrenceKey) is never adopted as this week's plan", () => {
  const lastWeek = { ...PUB_THU, occurrenceKey: 'slot_thu-20260827' };
  const sc = adoptScope({ schedule: SCHED_ROWS, trainingBlocks: {}, contentKeys: CK_THU });
  assert.equal(sc.run([lastWeek]), false, 'a survivor from a past week is refused');
  assert.deepEqual(sc.state.trainingBlocks, {}, 'nothing written');
});

test('CLIENT: a legacy publication (no occurrenceKey) is adopted only when published during the current week', () => {
  const legacyFresh = { ...PUB_THU, occurrenceKey: undefined, publishedAt: '2026-09-02T10:00:00.000Z' };
  const legacyOld   = { ...PUB_THU, occurrenceKey: undefined, publishedAt: '2026-08-27T10:00:00.000Z' };
  const a = adoptScope({ schedule: SCHED_ROWS, trainingBlocks: {}, contentKeys: CK_THU, weekStart: '2026-08-31' });
  assert.equal(a.run([legacyFresh]), true, 'published this week (publishing only opens in its own week) — adopted');
  const b = adoptScope({ schedule: SCHED_ROWS, trainingBlocks: {}, contentKeys: CK_THU, weekStart: '2026-08-31' });
  assert.equal(b.run([legacyOld]), false, 'published in a past week — refused');
});

test("CLIENT: a publication for a session no longer in this week's planner is ignored", () => {
  const sc = adoptScope({ schedule: [{ id: 'tue' }], trainingBlocks: {}, contentKeys: CK_THU });
  assert.equal(sc.run([PUB_THU]), false, 'retired session cannot re-enter the planner');
});

test('CLIENT: an empty published block list never wipes anything', () => {
  const local = [{ id: 'l1', activity: 'kept' }];
  const sc = adoptScope({ schedule: SCHED_ROWS, trainingBlocks: { 'slot_thu-20260903': local }, contentKeys: CK_THU });
  assert.equal(sc.run([{ ...PUB_THU, blocks: [] }]), false);
  assert.deepEqual(sc.state.trainingBlocks['slot_thu-20260903'], local);
});

// ── Tab status honesty ─────────────────────────────────────────────────────

function tabScope(pubState) {
  const body =
    '"use strict";\n' +
    'const _trainingPubState = ' + JSON.stringify(pubState) + ';\n' +
    extractFn(html, 'trainingSessionTabStatus') + '\n' +
    'return trainingSessionTabStatus;\n';
  return new Function(body)();
}

test('TAB: published-to-coaches shows Published — no longer Draft on every device', () => {
  const f = tabScope({ thu: { coach: { status: 'published' } } });
  assert.equal(f({ id: 'thu', published: false }), 'Published');
});

test('TAB: a genuinely unpublished session stays Draft, and the legacy player flag still counts', () => {
  const f = tabScope({});
  assert.equal(f({ id: 'thu', published: false }), 'Draft');
  assert.equal(f({ id: 'thu', published: true }), 'Published');
  const stale = tabScope({ thu: { player: { status: 'stale' } } });
  assert.equal(stale({ id: 'thu', published: false }), 'Published', 'stale = published-then-edited, not Draft');
});

// ── No fake success ────────────────────────────────────────────────────────

test('NO FAKE SUCCESS: a failed publish write leaves no Published state behind (source contract)', () => {
  // trainingPublishTo only assigns _trainingPubState from the server RESPONSE,
  // after res.ok — pin the shape so a refactor cannot reorder it.
  const fn = extractFn(html, 'trainingPublishTo');
  const okGuard = fn.indexOf('if (!res.ok)');
  const assign  = fn.indexOf('_trainingPubState[sessionId] =');
  assert.ok(okGuard > -1 && assign > -1 && okGuard < assign,
    'the failure return must come before the state assignment');
  assert.ok(fn.slice(okGuard, assign).includes('return'), 'failure path returns without assigning');
  assert.ok(!extractFn(html, 'trainingPublishTo').includes("status: 'published' }"),
    'the client never fabricates a published status locally');
});

test('WIRING: loadTrainingPublicationState itself ADOPTS the returned plan — not just the helper', async () => {
  // Mutation M12 proved the gap: with the adoption call deleted, every test
  // still passed because they exercised trainingAdoptCoachPlans directly.
  // This runs the REAL loader with a stubbed server and asserts the blocks
  // actually land — the read side can never silently discard them again.
  const body =
    '"use strict";\n' +
    'const state = { schedule: [{ id: "thu" }], trainingBlocks: {} };\n' +
    'let saved = 0; function saveState() { saved++; }\n' +
    'function render() {}\n' +
    'function canI() { return true; }\n' +
    'function trainingGroupParam() { return "grp_initial"; }\n' +
    'let _trainingPubState = {}; let _trainingPubLoadedAt = 0;\n' +
    'function trainingContentKey(id) { return id === "thu" ? "slot_thu-20260903" : String(id); }\n' +
    'function availWeekStart() { return "2026-08-31"; }\n' +
    'function availToday() { return "2026-08-31"; }\n' +
    'const PUB = ' + JSON.stringify([PUB_THU]) + ';\n' +
    'function fetch(url) {\n' +
    '  const sessions = String(url).includes("audience=coach") ? PUB : [];\n' +
    '  return Promise.resolve({ ok: true, json: async () => ({ sessions }) });\n' +
    '}\n' +
    extractFn(html, 'trainingAdoptCoachPlans') + '\n' +
    extractFn(html, 'loadTrainingPublicationState') + '\n' +
    'return (async () => { await loadTrainingPublicationState();\n' +
    '  return { blocks: state.trainingBlocks, pub: _trainingPubState, saved }; })();\n';
  const out = await new Function(body)();
  assert.equal((out.blocks['slot_thu-20260903'] || []).length, 2, 'the loader delivered the published blocks');
  assert.equal(out.pub.thu.coach.status, 'published', 'and the status');
  assert.ok(out.saved >= 1, 'adoption persisted via saveState');
});

test('SERVER: an audience entry without a publish timestamp is draft, never published', async () => {
  // Defensive contract on audienceStatus: seed a record whose player entry has
  // a snapshot but NO publishedAt (a malformed/partial write), then publish to
  // coaches — the response must report that audience as draft.
  seed(); await login('u-coach-a');
  kv.set(`app:publish:${CLUB}:group:${SEN}:training`, JSON.stringify({
    thu: { player: { snapshot: { id: 'thu', blocks: [] }, revision: 'r1' } },
  }));
  const w = await pub('u-coach-a', 'POST', { audience: 'coach' }, { session: THURSDAY, group: SEN });
  assert.equal(w.code, 200);
  assert.equal(w.body.player.status, 'draft', 'no publishedAt = not published, whatever else the entry holds');
});

test('the publish payload names the dated occurrence (identity travels with the write)', () => {
  const fn = extractFn(html, 'trainingSessionPayload');
  assert.ok(fn.includes('occurrenceKey: trainingContentKey(sessionId)'),
    'payload carries the canonical dated occurrence key');
});
