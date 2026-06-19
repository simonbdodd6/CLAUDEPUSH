/**
 * Phase 2 — demo identity email (config) safety proof.
 *
 * Phase 2 changes the *production* env var COACH_DEMO_EMAIL from a real person's
 * address (simonbdodd@gmail.com) to a dedicated non-human demo address. That
 * value lives in Vercel env, NOT in the repo — so this suite proves the code
 * behaves correctly when COACH_DEMO_EMAIL is the dedicated demo address:
 *
 *   1. demo login still works with the dedicated email
 *   2. the demo coach still owns/sits on boitsfort-rfc (DEFAULT_TEAM)
 *   3. a real human email is no longer bound to the demo account *by the env*
 *      (the persisted-Redis binding is Phase 3 — out of scope here)
 *   4. no other behaviour changes — a normal self-serve coach is unaffected
 *
 * Touches NO Redis, NO availability API, NO production config; read-only against
 * a mocked Upstash store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// The dedicated, non-human demo email Phase 2 introduces. Env is read at module
// load, so it must be set BEFORE importing the store.
const DEMO_EMAIL    = 'demo.coach@coachseye.test';
const DEMO_PASSWORD = 'DemoPass123';
process.env.COACH_DEMO_EMAIL        = DEMO_EMAIL;
process.env.COACH_DEMO_PASSWORD     = DEMO_PASSWORD;
process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.coach-demo-email.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(args[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { createClub, loginUser, destroySession, DEFAULT_TEAM } = await import('../api/_identityStore.js');

// ── 1 + 2. Demo login works AND the demo coach owns boitsfort-rfc ─────────────
test('demo login works with the dedicated non-human demo email', async () => {
  kv.clear();
  const r = await loginUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  assert.equal(r.session.userId, 'coach-demo', 'resolves to the seeded legacy demo account');
  assert.equal(r.session.role, 'coach', 'demo account logs in as a coach');
});

test('demo coach still owns / lands on boitsfort-rfc (DEFAULT_TEAM)', async () => {
  kv.clear();
  const r = await loginUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  assert.equal(r.session.teamId, DEFAULT_TEAM.id, 'demo coach is scoped to boitsfort-rfc');
  assert.equal(r.teamMember.teamId, DEFAULT_TEAM.id);
  assert.equal(r.teamMember.role, 'coach');
});

test('wrong demo password is rejected', async () => {
  kv.clear();
  await assert.rejects(() => loginUser({ email: DEMO_EMAIL, password: 'wrong' }), /Invalid email or password/);
});

// ── 3. A real human email is no longer bound to the demo account via the env ──
test('a real human email is NOT tied to the demo account by the env var', async () => {
  kv.clear();
  // With COACH_DEMO_EMAIL = the dedicated address, the legacy matcher no longer
  // recognises a human email, so it does not seed/return coach-demo for it.
  // (Production also has a PERSISTED coach-demo record under the old email — that
  // is removed in Phase 3, not here.)
  await assert.rejects(
    () => loginUser({ email: 'simonbdodd@gmail.com', password: DEMO_PASSWORD }),
    /Invalid email or password/,
    'human email no longer resolves to coach-demo through the env path',
  );
});

// ── 4. No other behaviour changes — a normal self-serve coach is unaffected ───
test('a normal self-serve coach is unaffected by the demo email change', async () => {
  kv.clear();
  const created = await createClub({
    clubName: 'Real Coach RFC', teamName: 'Seniors', sport: 'Rugby',
    name: 'Real Coach', email: 'real.coach@club.test', password: 'Passw0rd123',
  });
  await destroySession(created.session.token);
  const r = await loginUser({ email: 'real.coach@club.test', password: 'Passw0rd123' });
  assert.equal(r.session.teamId, created.team.id, 'real coach logs into their own club');
  assert.notEqual(r.session.teamId, DEFAULT_TEAM.id, 'and is not pulled onto the demo team');
});
