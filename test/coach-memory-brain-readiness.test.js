/**
 * Build 115 — Core → Coach Memory → Brain staging-integration readiness.
 *
 * The Core side of the pipeline is: producers / POST /api/coach-memory → M4 capture → M1 store
 * (one key per team+coach) → M3 provider → M2 adapter → `getCoachMemories()`, the synchronous
 * provider contract the Brain branch's buildBrainProviders() consumes (gated there by BRAIN_ENABLED
 * + a per-team flag). This suite proves that boundary end-to-end on the Core side, with real
 * sessions, the real publish handler and a mocked Upstash:
 *
 *   - default configuration writes nothing and nothing in Core activates the Brain read path;
 *   - memories produced by M5 / M6 / M7 traverse store → adapter → provider into entries that satisfy
 *     the Brain's M108 entry contract — INCLUDING the owner fields (coachId, clubId) that the Brain's
 *     validateCoachMemoryEntry requires and M113 extractCoachDnaSignals enforces (the gap Build 115
 *     closes: without them the Brain throws on the first real memory);
 *   - tenant, coach and playing-group context survive intact; no player PII appears;
 *   - store failure degrades to neutral DNA and never touches the coaching operation.
 *
 * Core never imports the Brain repository. BRAIN_M108 below MIRRORS the Brain's
 * packages/coach-memory/model.js validateCoachMemoryEntry (Brain M108) — keep in sync, exactly as
 * api/_coachMemoryBrainAdapter.js mirrors its enums. All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.coach-memory-brain-readiness.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
// These tests exercise real POST /api/coach-memory writes, so the Build 129 write gate is opened.
// Its default-off behaviour is covered by test/coach-memory-write-gate.test.js.
process.env.COACH_MEMORY_WRITE_ENABLED = 'true';

const kv = new Map();
let failMemoryReads = false;
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  if (c === 'GET' && failMemoryReads && String(a[0]).includes('coach_memory:')) {
    return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
  }
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'LRANGE') r = [];
  if (c === 'LPUSH' || c === 'LTRIM' || c === 'EXPIRE') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const identity = await import('../api/_identityStore.js');
const memStore = await import('../api/_coachMemoryStore.js');
const { adaptCoachMemoriesForBrain, COACH_MEMORY_TYPES, COACH_MEMORY_SOURCES, ONTOLOGY_KINDS } = await import('../api/_coachMemoryBrainAdapter.js');
const { createCoachMemoryProvider, loadCoachMemoriesForBrain } = await import('../api/_coachMemoryProvider.js');
const { COACH_MEMORY_PRODUCERS_FLAG } = await import('../api/_coachMemoryProducers.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = identity;

const setFlag = v => { if (v === undefined) delete process.env[COACH_MEMORY_PRODUCERS_FLAG]; else process.env[COACH_MEMORY_PRODUCERS_FLAG] = v; };

// ── Mirror of the Brain's M108 validateCoachMemoryEntry (packages/coach-memory/model.js) ──────────
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const isUnit = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
function BRAIN_M108(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('coach memory entry must be an object');
  if (!isNonEmptyString(entry.id)) throw new TypeError('coach memory entry requires a non-empty string id');
  if (!isNonEmptyString(entry.coachId)) throw new TypeError('coach memory entry requires a non-empty string coachId');
  if (!isNonEmptyString(entry.clubId)) throw new TypeError('coach memory entry requires a non-empty string clubId');
  if (!COACH_MEMORY_TYPES.includes(entry.type)) throw new TypeError(`invalid type "${entry.type}"`);
  if (!isNonEmptyString(entry.statement)) throw new TypeError('requires a non-empty statement');
  if (!COACH_MEMORY_SOURCES.includes(entry.source)) throw new TypeError(`invalid source "${entry.source}"`);
  if (!isUnit(entry.confidence) || !isUnit(entry.weight)) throw new TypeError('confidence/weight must be in [0,1]');
  if (!Array.isArray(entry.tags) || !entry.tags.every(t => typeof t === 'string')) throw new TypeError('tags must be strings');
  if (!Array.isArray(entry.ontologyLinks) || !entry.ontologyLinks.every(l => l && ONTOLOGY_KINDS.includes(l.kind) && isNonEmptyString(l.id))) throw new TypeError('bad ontologyLinks');
  if (!Array.isArray(entry.evidenceRefs) || !entry.evidenceRefs.every(r => typeof r === 'string')) throw new TypeError('evidenceRefs must be strings');
  if (!isNonEmptyString(entry.createdAt)) throw new TypeError('requires a non-empty createdAt string');
  return true;
}
// Mirror of M113's input gate: every entry validated, ids unique — then grouping by type.
function brainM113Categories(entries) {
  const seen = new Set();
  for (const e of entries) { BRAIN_M108(e); if (seen.has(e.id)) throw new TypeError(`duplicate memory id "${e.id}"`); seen.add(e.id); }
  return [...new Set(entries.map(e => e.type))].sort();
}

// ── Harness: real clubs, real sessions, the real publish handler ─────────────────────────────────
function res() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } };
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function newClub(clubName) {
  return identity.createClub({ clubName, teamName: 'Seniors', sport: 'rugby', name: 'Head Coach', email: `coach${++_t}@readiness.test`, password: 'password123' });
}
async function call(session, { query = {}, body }) {
  const r = res();
  await publish({ method: 'POST', headers: { cookie: ck(session) }, query, body }, r);
  return r;
}
const publishSessions = (s, n) => call(s, { body: { type: 'sessions', data: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `Session Sentinel ${i + 1}`, type: 'Training' })) } });
const publishSquad = (s) => call(s, { body: { type: 'squad', data: {
  published: true, publishedAt: '2026-08-21T10:00:00.000Z', opposition: 'Opposition Sentinel',
  formationNames: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `Starter Sentinel ${i + 1}`])),
  formationKeys: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `id:pid-starter-${i + 1}`])),
  benchPlayers: Array.from({ length: 8 }, (_, i) => `Bench Sentinel ${i + 1}`),
} } });
const captureDirect = (s, extra = {}) => call(s, { query: { resource: 'coach-memory' }, body: {
  type: 'philosophy', statement: 'Possession first; patience in the 22.', confidence: 0.8, weight: 0.6,
  tags: ['attack'], ontologyLinks: [], evidenceRefs: [], source: 'manual', ...extra,
} });
const scopeOf = club => ({ teamId: club.team.id, coachId: club.user.id });
const memoryKeys = () => [...kv.keys()].filter(k => k.includes('coach_memory:'));

test.beforeEach(() => { kv.clear(); _t = 0; failMemoryReads = false; setFlag(undefined); });
test.after(() => setFlag(undefined));

// ── 1 / 2 / 11. Default configuration ───────────────────────────────────────────────────────────

test('1. default configuration: coaching actions succeed and nothing is written; the Brain read is neutral', async () => {
  const club = await newClub('Default RFC');
  assert.equal((await publishSessions(club.session, 3)).statusCode, 200);
  assert.equal((await publishSquad(club.session)).statusCode, 200);
  assert.deepEqual(memoryKeys(), [], 'no automatic memory without COACH_MEMORY_PRODUCERS_ENABLED=true');
  const provider = await createCoachMemoryProvider(scopeOf(club));
  assert.deepEqual([...provider.getCoachMemories()], []);
  assert.equal(provider.getCoachMemoryAdapterReport().neutralDna, true);
  assert.equal(provider.getCoachMemoryAdapterReport().ownerAttached, false);
});

test('2. nothing in Core activates the Brain read path — it stays dormant until the Brain branch wires it', () => {
  const api = new URL('../api/', import.meta.url);
  const entryPoints = fs.readdirSync(api).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(entryPoints.length, 12, 'the Vercel Hobby ceiling is unchanged');
  for (const f of entryPoints) {
    const src = fs.readFileSync(new URL(f, api), 'utf8');
    assert.ok(!src.includes('_coachMemoryProvider'), `${f} must not import the Brain-facing provider`);
    assert.ok(!src.includes('_coachMemoryBrainAdapter'), `${f} must not import the Brain adapter`);
  }
  // the client never reaches it either, and Core defines no Brain activation flag of its own
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('coachMemoryProvider') && !html.includes('loadCoachMemoriesForBrain'));
  const providerSrc = fs.readFileSync(new URL('../api/_coachMemoryProvider.js', import.meta.url), 'utf8');
  assert.ok(!/process\.env/.test(providerSrc.replace(/^\s*\/\/.*$/gm, '')), 'the provider reads no environment — activation lives in the Brain branch gates');
});

// ── 3 / 4. Through the existing adapter/provider boundary, into the Brain's M108 contract ────────

test('3. the provider routes through the existing M2 adapter — same entries, same order, plus the owner', async () => {
  setFlag('true');
  const club = await newClub('Boundary RFC');
  await publishSessions(club.session, 2);
  await publishSquad(club.session);
  const scope = scopeOf(club);

  const adapted = adaptCoachMemoriesForBrain(await memStore.listCoachMemories(scope));
  const provider = await createCoachMemoryProvider(scope);
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.adapterUsed, true);
  assert.equal(report.adapterFingerprint, adapted.adapterFingerprint, 'the provider ran exactly the M2 adapter');
  assert.equal(report.ownerAttached, true);
  // every adapted value passes through unchanged; only the two owner fields are added
  assert.deepEqual(provider.getCoachMemories().map(({ coachId, clubId, ...rest }) => rest), adapted.memories.map(m => ({ ...m })));
  for (const m of provider.getCoachMemories()) {
    assert.equal(m.coachId, scope.coachId);
    assert.equal(m.clubId, scope.teamId);
    assert.deepEqual(Object.keys(m).slice(0, 3), ['id', 'coachId', 'clubId'], 'Brain normalisation field order');
  }
});

test('4. M5, M6 and M7 memories all traverse Core and satisfy the Brain M108 / M113 input contract', async () => {
  setFlag('true');
  const club = await newClub('Pipeline RFC');
  assert.equal((await publishSessions(club.session, 3)).statusCode, 200);   // M6
  assert.equal((await publishSquad(club.session)).statusCode, 200);         // M7
  assert.equal((await captureDirect(club.session)).statusCode, 200);       // M5

  const entries = await loadCoachMemoriesForBrain(scopeOf(club));
  assert.equal(entries.length, 3);
  for (const e of entries) assert.equal(BRAIN_M108(e), true);
  assert.deepEqual(brainM113Categories(entries), ['philosophy', 'selection-preference', 'training-preference']);

  // the regression this build fixes: the adapter alone (no owner) is REJECTED by the Brain contract
  const ownerless = adaptCoachMemoriesForBrain(await memStore.listCoachMemories(scopeOf(club))).memories;
  assert.throws(() => BRAIN_M108(ownerless[0]), /coachId/);
});

// ── 5 / 6. Tenant, coach and group context; privacy ─────────────────────────────────────────────

test('5. tenant, coach and playing-group context stay intact across clubs', async () => {
  setFlag('true');
  const alpha = await newClub('Alpha RFC');
  const beta = await newClub('Beta RFC');
  await publishSessions(alpha.session, 2);
  await publishSquad(beta.session);

  const a = await loadCoachMemoriesForBrain(scopeOf(alpha));
  const b = await loadCoachMemoriesForBrain(scopeOf(beta));
  assert.deepEqual(a.map(m => m.type), ['training-preference']);
  assert.deepEqual(b.map(m => m.type), ['selection-preference']);
  assert.deepEqual(a.map(m => [m.clubId, m.coachId]), [[alpha.team.id, alpha.user.id]]);
  assert.deepEqual(b.map(m => [m.clubId, m.coachId]), [[beta.team.id, beta.user.id]]);
  // the club link always agrees with the owner; the team link names the playing group
  for (const m of [...a, ...b]) {
    assert.deepEqual(m.ontologyLinks, [{ kind: 'club', id: m.clubId }, { kind: 'team', id: 'grp_initial' }]);
  }
  // a cross-tenant scope (alpha's coach id under beta's club) reads nothing — the key is the tenant
  assert.deepEqual([...await loadCoachMemoriesForBrain({ teamId: beta.team.id, coachId: alpha.user.id })], []);
});

test('6. no player PII crosses the boundary — only the M108 fields, opaque tenant/group ids and counts', async () => {
  setFlag('true');
  const club = await newClub('Privacy RFC');
  await publishSessions(club.session, 3);
  await publishSquad(club.session);
  const entries = await loadCoachMemoriesForBrain(scopeOf(club));
  const serialised = JSON.stringify(entries);
  for (const needle of ['Sentinel', 'pid-', 'id:', '@', 'email', 'Opposition']) {
    assert.ok(!serialised.includes(needle), `"${needle}" must not reach the Brain: ${serialised}`);
  }
  const allowed = ['clubId', 'coachId', 'confidence', 'createdAt', 'evidenceRefs', 'id', 'ontologyLinks', 'source', 'statement', 'tags', 'type', 'weight'];
  for (const e of entries) assert.deepEqual(Object.keys(e).sort(), allowed);
  for (const e of entries) for (const l of e.ontologyLinks) assert.ok(['club', 'team'].includes(l.kind), `no person-level link: ${l.kind}`);
});

// ── 7. Failure isolation ────────────────────────────────────────────────────────────────────────

test('7. a failing memory store degrades the Brain read to neutral DNA and never touches coaching actions', async () => {
  setFlag('true');
  const club = await newClub('Failure RFC');
  await publishSessions(club.session, 2);
  failMemoryReads = true;
  const provider = await createCoachMemoryProvider(scopeOf(club));
  assert.deepEqual([...provider.getCoachMemories()], []);
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.storeAvailable, false);
  assert.equal(report.neutralDna, true);
  // an unusable scope can never name an owner or reach another tenant
  for (const bad of [{}, { teamId: club.team.id }, { coachId: club.user.id }, { teamId: '  ', coachId: 'x' }, null]) {
    assert.deepEqual([...await loadCoachMemoriesForBrain(bad)], []);
  }
  // the coaching operations do not depend on the read path at all
  const publishSrc = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.ok(!publishSrc.includes('_coachMemoryProvider'));
  failMemoryReads = false;
  assert.equal((await publishSquad(club.session)).statusCode, 200);
});

// ── 8 / 9 / 10 / 11. Existing behaviour unchanged ───────────────────────────────────────────────

test('8–11. M5 capture, M6/M7 producers and the kill-switch behave exactly as before', async () => {
  // kill-switch OFF (unset and 'false'): producers write nothing, direct capture still works
  for (const v of [undefined, 'false']) {
    kv.clear(); _t = 0; setFlag(v);
    const club = await newClub('Unchanged RFC');
    await publishSessions(club.session, 2);
    await publishSquad(club.session);
    const direct = await captureDirect(club.session, { statement: 'Direct capture is not a producer.' });
    assert.equal(direct.statusCode, 200, `flag=${String(v)}`);
    const stored = await memStore.listCoachMemories(scopeOf(club));
    assert.deepEqual(stored.map(m => m.source), ['manual'], 'only the direct capture — no automatic memories');
  }
  // kill-switch ON: the M6 and M7 statements and stored records are exactly as built
  kv.clear(); _t = 0; setFlag('true');
  const club = await newClub('Unchanged RFC');
  await publishSessions(club.session, 3);
  await publishSquad(club.session);
  const stored = await memStore.listCoachMemories(scopeOf(club));
  // Compared sorted by type: two writes in the same millisecond tie on createdAt and the store then
  // orders by the (random-suffixed) id, so the stored ORDER of these two is not asserted here.
  const byType = (a, b) => a[0].localeCompare(b[0]);
  assert.deepEqual(stored.map(m => [m.type, m.source, m.statement]).sort(byType), [
    ['selection-preference', 'selection-decision', 'Published a squad with 15 starters and 8 replacements.'],
    ['training-preference', 'assistant-derived', 'Published a training schedule of 3 sessions.'],
  ]);
  // storage is unchanged: owner fields are attached on the way to the Brain, never persisted
  for (const m of stored) { assert.equal(m.coachId, undefined); assert.equal(m.clubId, undefined); }
});
