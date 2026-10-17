/**
 * Core Memory M5 — Gated HTTP capture route tests.
 *
 * Drives the REAL POST /api/coach-memory path with real created-club coach sessions and a mocked
 * Upstash (same harness family as the availability/identity route tests). The route is NOT its own
 * serverless function (Vercel Hobby ceiling of 12): vercel.json rewrites /api/coach-memory to
 * /api/publish?resource=coach-memory, so every call here goes through the publish function's
 * dispatcher exactly as production does. Verifies: an authorized
 * coach persists a memory; the body cannot choose tenant/id/timestamp; unauthenticated and
 * unprivileged callers are refused; invalid/oversized payloads are 400; method + preflight handling;
 * a 503 when storage is unconfigured; tenant isolation end-to-end; visibility through the unmodified
 * M3 provider; no body mutation; index.html untouched. All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-route.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';
// These tests exercise real POST /api/coach-memory writes, so the Build 129 write gate is opened.
// Its default-off behaviour is covered by test/coach-memory-write-gate.test.js.
process.env.COACH_MEMORY_WRITE_ENABLED = 'true';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  return { ok: true, json: async () => ({ result: r }) };
};

const identity = await import('../api/_identityStore.js');
const store = await import('../api/_coachMemoryStore.js');
const { createCoachMemoryProvider } = await import('../api/_coachMemoryProvider.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = identity;

// The deployed path: /api/coach-memory is rewritten to the publish function with this query.
const COACH_MEMORY_QUERY = Object.freeze({ resource: 'coach-memory' });

function res() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    end() { return this; },
  };
}
async function call(method, body, cookie, handler = publish) {
  const r = res();
  await handler({ method, headers: cookie ? { cookie } : {}, body: body || undefined, query: { ...COACH_MEMORY_QUERY } }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

let _t = 0;
async function newCoach(clubName = 'Alpha RFC') {
  return identity.createClub({ clubName, teamName: 'Seniors', sport: 'rugby', name: 'Head Coach', email: `coach${++_t}@major.test`, password: 'password123' });
}
async function newPlayer(teamId) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email: `player${_t}@major.test`, name: 'Test Player', role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  // A player claim now requires a recognised position (Core: "position at join").
  return identity.claimInvite({ position: '2 — Hooker', token, email: `player${_t}@major.test`, name: 'Test Player', password: 'password123' });
}

function memoryBody(overrides = {}) {
  return {
    type: 'training-preference',
    statement: 'Short high-tempo blocks hold this group\'s focus.',
    confidence: 0.8,
    weight: 0.6,
    tags: ['tempo'],
    ontologyLinks: [{ kind: 'training', id: 'session-block' }],
    evidenceRefs: ['note-001'],
    source: 'session-note',
    ...overrides,
  };
}

test.beforeEach(() => { kv.clear(); _t = 0; });

test('an authorized coach POST persists a memory and returns it', async () => {
  const coach = await newCoach();
  const scope = { teamId: coach.team.id, coachId: coach.user.id };
  const r = await call('POST', memoryBody(), ck(coach.session));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.match(r.body.memory.id, /^cmem_\d+_[a-z0-9]{1,8}$/);
  assert.match(r.body.memory.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(r.body.memory.type, 'training-preference');
  // actually persisted under the session's own scope
  const stored = await store.listCoachMemories(scope);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, r.body.memory.id);
});

test('body-supplied teamId / coachId / id / createdAt are ignored — server owns scope + identity', async () => {
  const coach = await newCoach();
  const other = await newCoach('Beta RFC');
  const r = await call('POST', memoryBody({ teamId: other.team.id, coachId: other.user.id, id: 'forged', createdAt: '2000-01-01T00:00:00.000Z' }), ck(coach.session));
  assert.equal(r.statusCode, 200);
  assert.notEqual(r.body.memory.id, 'forged');
  assert.notEqual(r.body.memory.createdAt, '2000-01-01T00:00:00.000Z');
  // written under the caller's scope, NOT the forged team/coach
  assert.equal((await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id })).length, 1);
  assert.equal((await store.listCoachMemories({ teamId: other.team.id, coachId: other.user.id })).length, 0);
});

test('an unauthenticated request is refused with 403 and stores nothing', async () => {
  const coach = await newCoach();
  const r = await call('POST', memoryBody());   // no cookie
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.ok, false);
  assert.equal((await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id })).length, 0);
});

test('an authenticated user without ai_intelligence is refused with 403', async () => {
  const coach = await newCoach();
  const player = await newPlayer(coach.team.id);
  const r = await call('POST', memoryBody(), ck(player.session));
  assert.equal(r.statusCode, 403);
  assert.equal((await store.listCoachMemories({ teamId: coach.team.id, coachId: player.user.id })).length, 0);
});

test('invalid content is 400 and stores nothing', async () => {
  const coach = await newCoach();
  for (const bad of [memoryBody({ type: 'match-plan' }), memoryBody({ source: 'scraped' }), memoryBody({ confidence: undefined }), memoryBody({ statement: '   ' })]) {
    const r = await call('POST', bad, ck(coach.session));
    assert.equal(r.statusCode, 400);
    assert.equal(r.body.ok, false);
  }
  assert.equal((await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id })).length, 0);
});

test('oversized statement or array fields are 400 (coarse abuse guard)', async () => {
  const coach = await newCoach();
  const bigStatement = await call('POST', memoryBody({ statement: 'x'.repeat(2001) }), ck(coach.session));
  assert.equal(bigStatement.statusCode, 400);
  assert.match(bigStatement.body.error, /statement is too long/);
  const bigTags = await call('POST', memoryBody({ tags: Array.from({ length: 101 }, (_, i) => `t${i}`) }), ck(coach.session));
  assert.equal(bigTags.statusCode, 400);
  assert.match(bigTags.body.error, /tags has too many items/);
  assert.equal((await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id })).length, 0);
});

test('non-POST methods are 405; OPTIONS is 200', async () => {
  const coach = await newCoach();
  for (const m of ['GET', 'PUT', 'DELETE']) {
    const r = await call(m, memoryBody(), ck(coach.session));
    assert.equal(r.statusCode, 405);
  }
  const opt = await call('OPTIONS', null, ck(coach.session));
  assert.equal(opt.statusCode, 200);
});

test('storage not configured yields 503 (child process with Upstash env cleared)', () => {
  // _kv.js captures its env at import time, so a truly-unconfigured graph needs a fresh process
  // with the Upstash vars blanked. Probes BOTH the deployed path (publish function dispatching
  // resource=coach-memory — its shared storage guard answers first) and the route module itself,
  // so the M5 contract holds whichever way the handler is reached.
  const script = `
    import publish from './api/publish.js';
    import route from './api/_coachMemoryRoute.js';
    const mk = () => ({ statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(d){this.body=d;return this;}, setHeader(){}, end(){return this;} });
    const viaPublish = mk(), direct = mk();
    await publish({ method: 'POST', headers: {}, body: {}, query: { resource: 'coach-memory' } }, viaPublish);
    await route({ method: 'POST', headers: {}, body: {}, query: {} }, direct);
    console.log(JSON.stringify({ viaPublish: { status: viaPublish.statusCode, body: viaPublish.body }, direct: { status: direct.statusCode, body: direct.body } }));
  `;
  const out = execFileSync('node', ['--input-type=module', '-e', script], {
    cwd: REPO_ROOT,
    env: { ...process.env, UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
    encoding: 'utf8',
  });
  const result = JSON.parse(out.trim());
  assert.equal(result.viaPublish.status, 503);
  assert.match(result.viaPublish.body.error, /not configured/);
  assert.equal(result.direct.status, 503);
  assert.equal(result.direct.body.error, 'Memory storage not configured');
});

test('routing contract: not a serverless function of its own; /api/coach-memory is rewritten onto publish', () => {
  // The Vercel Hobby ceiling is 12 functions — the route must live behind an existing one.
  const fns = fs.readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.ok(!fns.includes('coach-memory.js'), 'coach-memory must not be its own api function');
  assert.ok(fns.length <= 12, `api/ has ${fns.length} functions; the Hobby ceiling is 12`);
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrite = (vercel.rewrites || []).find(r => r.source === '/api/coach-memory');
  assert.deepEqual(rewrite, { source: '/api/coach-memory', destination: '/api/publish?resource=coach-memory' });
  // and the publish function dispatches that query to the route module
  const publishSrc = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(publishSrc, /=== 'coach-memory'\) return coachMemoryHandler\(req, res\)/);
});

test('reaching publish WITHOUT the coach-memory query never reaches the memory route', async () => {
  // A plain POST to the publish function (no resource) must not be routed to coach-memory: the
  // consolidation adds exactly one dispatch key and introduces no other way in.
  const coach = await newCoach();
  const r = res();
  await publish({ method: 'POST', headers: { cookie: ck(coach.session) }, body: memoryBody(), query: {} }, r);
  assert.notEqual(r.statusCode, 200);
  assert.equal((await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id })).length, 0);
});

test('tenant isolation end-to-end: each coach only writes into their own collection', async () => {
  const alpha = await newCoach('Alpha RFC');
  const beta = await newCoach('Beta RFC');
  await call('POST', memoryBody(), ck(alpha.session));
  await call('POST', memoryBody({ type: 'selection-preference' }), ck(beta.session));

  const alphaMem = await store.listCoachMemories({ teamId: alpha.team.id, coachId: alpha.user.id });
  const betaMem = await store.listCoachMemories({ teamId: beta.team.id, coachId: beta.user.id });
  assert.equal(alphaMem.length, 1);
  assert.equal(betaMem.length, 1);
  assert.equal(alphaMem[0].type, 'training-preference');
  assert.equal(betaMem[0].type, 'selection-preference');
  // neither coach's collection contains the other's memory
  assert.equal((await store.getCoachMemory({ teamId: alpha.team.id, coachId: alpha.user.id }, betaMem[0].id)), null);
});

test('a written memory is visible through the unmodified M3 provider after POST', async () => {
  const coach = await newCoach();
  const scope = { teamId: coach.team.id, coachId: coach.user.id };
  await call('POST', memoryBody(), ck(coach.session));
  const provider = await createCoachMemoryProvider(scope);
  const memories = provider.getCoachMemories();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'training-preference');
  assert.equal(provider.getCoachMemoryAdapterReport().neutralDna, false);
});

test('the request body object is not mutated by the route', async () => {
  const coach = await newCoach();
  const body = memoryBody({ tags: ['tempo', 'focus'] });
  const before = JSON.stringify(body);
  await call('POST', body, ck(coach.session));
  assert.equal(JSON.stringify(body), before);
});

test('exercising the route does not touch index.html', async () => {
  const before = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const coach = await newCoach();
  await call('POST', memoryBody(), ck(coach.session));
  const after = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(after, before);
});

// NOTE ON 409/500 MAPPING: a duplicate-id 409 is not naturally reachable over HTTP — the route uses
// the M4 production seam, which mints a random server id per request, so two POSTs never collide.
// The 409 branch is defensive-only. The unexpected-error 500 branch is exercised below by forcing a
// storage write failure, confirming the route never leaks internals.
test('an unexpected storage failure maps to a safe 500 (no internals leaked)', async () => {
  const coach = await newCoach();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_u, o = {}) => {
    const [c, ...a] = JSON.parse(o.body || '[]');
    if (c === 'SET' && String(a[0]).includes('coach_memory:')) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    return realFetch(_u, o);
  };
  try {
    const r = await call('POST', memoryBody(), ck(coach.session));
    assert.equal(r.statusCode, 500);
    assert.equal(r.body.error, 'Could not save coach memory');
    assert.doesNotMatch(JSON.stringify(r.body), /boom|Upstash|stack|at Object|\.js:/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
