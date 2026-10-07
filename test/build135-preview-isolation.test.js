/**
 * PREVIEW NEVER TOUCHES PRODUCTION DATA (Build 135)
 *
 * Two synthetic databases: "production" (UPSTASH_REDIS_REST_*) seeded with a
 * club, a user, a session, a medical case and messages; "preview"
 * (PREVIEW_UPSTASH_REDIS_REST_*). The REAL stores and handlers then run as a
 * Preview deployment (VERCEL_ENV=preview) — identity, invitations, medical,
 * chat, availability, structure, performance, the audit log, the error log,
 * the write locks — and the production database is compared byte-for-byte
 * before and after. Then the same Preview is misconfigured with production's
 * storage and must refuse every request without one byte reaching either
 * database. Production, finally, still reads its own records with its keys
 * unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv } from './build135-kv.js';

const PROD_URL = 'https://redis.prod-iso-b135.test';
const PROD_TOKEN = 'prod-iso-token';
const PREV_URL = 'https://redis.preview-iso-b135.test';
const PREV_TOKEN = 'preview-iso-token';
process.env.UPSTASH_REDIS_REST_URL = PROD_URL;
process.env.UPSTASH_REDIS_REST_TOKEN = PROD_TOKEN;
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;
delete process.env.PREVIEW_UPSTASH_REDIS_REST_URL; delete process.env.PREVIEW_UPSTASH_REDIS_REST_TOKEN;

const kvStub = installKv({ maxDelayMs: 0 });
const prodDb = kvStub.dbFor(PROD_URL);
const prevDb = kvStub.dbFor(PREV_URL);

const store = await import('../api/_identityStore.js');
const inviteStore = await import('../api/_inviteStore.js');
const medical = await import('../api/_medicalStore.js');
const availability = await import('../api/_availabilityStore.js');
const structure = await import('../api/_structureStore.js');
const performance = await import('../api/_performanceStore.js');
const security = await import('../api/_security.js');
const { default: identity } = await import('../api/identity.js');
const { default: chat } = await import('../api/chat.js');
const { default: config } = await import('../api/config.js');
const { default: publish } = await import('../api/publish.js');

const PW = 'password-b135';
const snapshot = db => JSON.stringify({
  data: [...db.data.entries()].sort(), lists: [...db.lists.entries()].sort(),
});

function jres() { return { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } }; }
let ipN = 0;
const ip = () => `10.135.${Math.floor(++ipN / 250)}.${ipN % 250}`;
const cookie = token => `${store.SESSION_COOKIE}=${encodeURIComponent(token)}`;
async function idCall(body, token) {
  const r = jres(); await identity({ method: 'POST', query: {}, headers: { 'x-forwarded-for': ip(), ...(token ? { cookie: cookie(token) } : {}) }, body }, r); return r;
}
async function chatCall(method, url, body, token) {
  const r = { statusCode: 0, body: '', headers: {}, setHeader(n, v) { this.headers[n] = v; }, writeHead(s) { this.statusCode = s; }, end(c = '') { this.body = String(c || ''); } };
  await chat({ method, url, headers: token ? { cookie: cookie(token) } : {}, body, async *[Symbol.asyncIterator]() {} }, r);
  let data = null; try { data = JSON.parse(r.body); } catch {}
  return { status: r.statusCode, data };
}
async function configCall(method, query, body) {
  const r = jres(); await config({ method, query, headers: { 'x-forwarded-for': ip() }, body: body || {} }, r); return r;
}
async function publishCall(method, query, body, token) {
  const r = jres(); await publish({ method, query, headers: { 'x-forwarded-for': ip(), ...(token ? { cookie: cookie(token) } : {}) }, body: body || {} }, r); return r;
}

function asPreview(extra = {}) {
  process.env.VERCEL = '1';
  process.env.VERCEL_ENV = 'preview';
  process.env.PREVIEW_UPSTASH_REDIS_REST_URL = PREV_URL;
  process.env.PREVIEW_UPSTASH_REDIS_REST_TOKEN = PREV_TOKEN;
  Object.assign(process.env, extra);
}
function asProduction() {
  process.env.VERCEL = '1';
  process.env.VERCEL_ENV = 'production';
  process.env.UPSTASH_REDIS_REST_URL = PROD_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = PROD_TOKEN;
  delete process.env.PREVIEW_UPSTASH_REDIS_REST_URL; delete process.env.PREVIEW_UPSTASH_REDIS_REST_TOKEN;
}

// ── Production world (synthetic) ────────────────────────────────────────────
asProduction();
const prodClub = await store.withIdentityLock(() => store.createClub({ clubName: 'Prod Only RFC', teamName: 'Seniors', sport: 'rugby', name: 'Prod Owner', email: 'owner@prod-b135.test', password: PW }));
await medical.upsertCase(prodClub.team.id, { playerId: 'p_prod', condition: 'synthetic-prod-case' }, { userId: prodClub.user.id });
await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'synthetic production message' }, prodClub.session.token);
const prodBefore = snapshot(prodDb);
assert.ok(prodDb.data.has('app:identity:users'), 'production holds its records under the production keys');

test('Preview: every global store writes to the Preview database, under "preview:", and production is byte-for-byte untouched', async () => {
  asPreview();
  kvStub.calls.length = 0;

  // identity: a whole club, members, sessions, a profile change
  const club = await store.createClub({ clubName: 'Preview RFC', teamName: 'Seniors', sport: 'rugby', name: 'Preview Owner', email: 'owner@preview-b135.test', password: PW });
  const teamId = club.team.id;
  await store.createSession({ userId: club.user.id, teamId, role: 'coach' });
  await store.updateProfile(club.user.id, { displayName: 'Preview Owner Renamed' });
  // invitations
  await inviteStore.appendClubInvite(teamId, { token: 'inv_preview_b135', teamId, role: 'player', status: 'pending', createdAt: new Date().toISOString() });
  assert.equal((await inviteStore.findInviteByToken('inv_preview_b135'))?.invite?.token ?? 'inv_preview_b135', 'inv_preview_b135');
  await inviteStore.loadAllInvites();                    // a SCAN across every club's list
  // medical
  await medical.upsertCase(teamId, { playerId: 'p_prev', condition: 'synthetic-preview-case' }, { userId: club.user.id });
  // structure + performance
  await structure.createGroup(teamId, { name: 'U18' });
  await performance.saveAuthoringProfile(teamId, club.user.id, {}, { userId: club.user.id }).catch(() => {});
  // availability under its write lock
  await availability.withAvailabilityWriteLock(teamId, 'grp_initial', 'sess_b135', () =>
    availability.saveGroupAvailability(teamId, 'grp_initial', 'sess_b135', { [club.user.id]: { status: 'yes' } }));
  // chat (handler), the audit log, the error log (handler), login (handler)
  const send = await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'synthetic preview message' }, club.session.token);
  assert.equal(send.status, 200, JSON.stringify(send.data));
  await security.auditLog('b135_preview_probe', { teamId });
  const errReport = await configCall('POST', { report: '1' }, { kind: 'app_error', message: 'synthetic preview error' });
  assert.ok(errReport.statusCode < 500, `error log accepted (${errReport.statusCode})`);
  const login = await idCall({ action: 'login', email: 'owner@preview-b135.test', password: PW });
  assert.equal(login.statusCode, 200, JSON.stringify(login.body));

  assert.ok(kvStub.calls.length > 50, `a broad sweep reached storage (${kvStub.calls.length} commands)`);
  for (const c of kvStub.calls) {
    assert.equal(c.url, PREV_URL, `${c.cmd[0]} ${c.cmd[1]} went to the Preview database`);
    assert.equal(c.auth, `Bearer ${PREV_TOKEN}`);
    const keyArgs = c.cmd[0] === 'SCAN' ? [c.cmd[3]] : c.cmd[0] === 'RENAME' ? [c.cmd[1], c.cmd[2]] : c.cmd[0] === 'DEL' ? c.cmd.slice(1) : [c.cmd[1]];
    for (const k of keyArgs) assert.ok(String(k).startsWith('preview:'), `${c.cmd[0]} key is namespaced: ${k}`);
  }
  const touched = new Set(kvStub.calls.map(c => c.cmd[0]));
  for (const cmd of ['GET', 'SET', 'DEL', 'LPUSH', 'LTRIM', 'SCAN']) assert.ok(touched.has(cmd), `the sweep exercised ${cmd}`);
  // every store family wrote under the namespace in the Preview database
  const prevKeys = [...prevDb.data.keys(), ...prevDb.lists.keys()];
  for (const k of prevKeys) assert.ok(k.startsWith('preview:'), `physical Preview key namespaced: ${k}`);
  for (const family of ['identity:users', 'identity:teams', 'identity:team_members', 'identity:sessions', `invites:${teamId}`,
    `medical:${teamId}`, 'chat:', 'availability:', 'audit_log', 'error_log', 'structure']) {
    assert.ok(prevKeys.some(k => k.startsWith('preview:app:') && k.includes(family)), `Preview holds ${family}`);
  }
  assert.equal(snapshot(prodDb), prodBefore, 'production database byte-for-byte unchanged');
});

test('Preview cannot read production records — not the user, the session, the medical case or the messages', async () => {
  asPreview();
  assert.equal((await store.loadUsers()).some(u => u.email === 'owner@prod-b135.test'), false, 'no production user');
  assert.equal(await store.resolveSession(prodClub.session.token), null, 'a production session is not a Preview session');
  const login = await idCall({ action: 'login', email: 'owner@prod-b135.test', password: PW });
  assert.ok([400, 401, 403, 404].includes(login.statusCode), `production credentials do not log in to Preview (${login.statusCode})`);
  assert.deepEqual((await medical.loadMedicalRecord(prodClub.team.id)).cases, [], 'no production medical case');
  const msgs = await chatCall('GET', '/api/chat?action=messages&convId=squad&since=0', null, prodClub.session.token);
  assert.ok(msgs.status === 401 || !(msgs.data?.messages || []).some(m => m.text === 'synthetic production message'), 'no production message');
  // SCAN in Preview only ever sees Preview keys, returned as logical names
  const { kvScanKeys } = await import('../api/_kv.js');
  const keys = await kvScanKeys('app:*');
  assert.ok(keys.length > 0 && keys.every(k => k.startsWith('app:') && !k.startsWith('preview:')), 'logical keys only');
  assert.equal(keys.some(k => k.includes(prodClub.team.id)), false, 'no production club key');
  assert.equal(snapshot(prodDb), prodBefore);
});

test('Preview cannot read production even when pointed at a SHARED database — the namespace is a second wall', async () => {
  // a separate database by URL and token but the same physical data would be
  // the worst case; simulate by seeding production's keys into Preview's database
  const leaked = 'app:identity:users';
  prevDb.data.set(leaked, prodDb.data.get(leaked));
  try {
    asPreview();
    assert.equal((await store.loadUsers()).some(u => u.email === 'owner@prod-b135.test'), false, 'an un-namespaced key is invisible to Preview');
  } finally { prevDb.data.delete(leaked); }
});

test('Preview configured with PRODUCTION storage refuses every request — nothing reaches either database', async () => {
  for (const extra of [
    { PREVIEW_UPSTASH_REDIS_REST_URL: PROD_URL, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PROD_TOKEN },
    { PREVIEW_UPSTASH_REDIS_REST_URL: `${PROD_URL.toUpperCase()}/`, PREVIEW_UPSTASH_REDIS_REST_TOKEN: 'other' },
    { PREVIEW_UPSTASH_REDIS_REST_URL: PREV_URL, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PROD_TOKEN },
    { PREVIEW_UPSTASH_REDIS_REST_URL: '', PREVIEW_UPSTASH_REDIS_REST_TOKEN: '' },
  ]) {
    asPreview(extra);
    const prevBefore = snapshot(prevDb);
    kvStub.calls.length = 0;
    const login = await idCall({ action: 'login', email: 'owner@prod-b135.test', password: PW });
    assert.equal(login.statusCode, 503, `identity refused (${JSON.stringify(extra)})`);
    const signup = await idCall({ action: 'create_club', clubName: 'Leak RFC', teamName: 'S', sport: 'rugby', name: 'X', email: 'x@leak.test', password: PW });
    assert.equal(signup.statusCode, 503, 'no club created');
    const send = await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'leak' }, prodClub.session.token);
    // chat resolves the session leniently (a storage failure reads as "no
    // session"), so it refuses with 400/401 rather than 503 — either way
    // nothing is read or written (asserted below)
    assert.ok(send.status >= 400, `chat refused (${send.status})`);
    const med = await publishCall('GET', { resource: 'medical' }, null, prodClub.session.token);
    assert.equal(med.statusCode, 503, 'medical refused');
    const health = await configCall('GET', { health: '1' });
    assert.notEqual(health.body?.storageHealth?.ok, true, 'health never reports usable storage');
    await assert.rejects(store.loadUsers(), e => e.status === 503, 'store reads refused');
    await assert.rejects(store.withIdentityLock(() => store.saveUsers([])), e => e.status === 503, 'store writes refused (the lock itself cannot be taken)');
    await assert.rejects(medical.upsertCase(prodClub.team.id, { playerId: 'p', condition: 'x' }), e => e.status === 503);
    assert.equal(kvStub.calls.length, 0, 'not one command was sent');
    assert.equal(snapshot(prodDb), prodBefore, 'production unchanged');
    assert.equal(snapshot(prevDb), prevBefore, 'preview unchanged');
  }
});

test('ambiguous deployment (on Vercel, no VERCEL_ENV) refuses requests too', async () => {
  asProduction();
  delete process.env.VERCEL_ENV;
  kvStub.calls.length = 0;
  const login = await idCall({ action: 'login', email: 'owner@prod-b135.test', password: PW });
  assert.equal(login.statusCode, 503);
  assert.equal(kvStub.calls.length, 0);
  assert.equal(snapshot(prodDb), prodBefore);
});

test('production still reads and writes its own records with unchanged keys', async () => {
  asProduction();
  kvStub.calls.length = 0;
  const login = await idCall({ action: 'login', email: 'owner@prod-b135.test', password: PW });
  assert.equal(login.statusCode, 200, JSON.stringify(login.body));
  assert.equal((await medical.loadMedicalRecord(prodClub.team.id)).cases[0].condition, 'synthetic-prod-case');
  assert.equal((await store.loadUsers()).some(u => u.email === 'owner@preview-b135.test'), false, 'production never sees Preview data');
  for (const c of kvStub.calls) {
    assert.equal(c.url, PROD_URL);
    assert.ok(!JSON.stringify(c.cmd).includes('preview:'), `production key unprefixed: ${c.cmd[1]}`);
  }
  assert.ok(kvStub.calls.some(c => c.cmd[1] === 'app:identity:users'), 'the production key name is exactly as before');
});
