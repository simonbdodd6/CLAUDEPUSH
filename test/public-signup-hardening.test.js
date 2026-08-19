/**
 * PHASE A — PUBLIC SIGNUP HARDENING.
 *
 * createClub is the engine behind the (still server-closed) public wizard.
 * These tests pin the hardened contract against the REAL store + REAL
 * identity handler over a mocked Upstash that honours SET-NX and can inject
 * write failures at exact points:
 *
 *   · idempotency: one logical signup = one club, retryable after any
 *     partial failure, key bound to its own signup only;
 *   · ordering/recovery: user → team → membership → session, each stage
 *     individually resumable, nothing ever deleted;
 *   · duplicate club names refused by ONE shared policy (createClub +
 *     provisionClub);
 *   · every privileged field remains server-generated;
 *   · the public gate and platform provisioning are unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.signup-hardening.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;

const kv = new Map();
let failNextSetMatching = null;   // { pattern, remaining } — injected write failure
const dels = [];
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') {
    if (failNextSetMatching && failNextSetMatching.remaining > 0 && a[0].includes(failNextSetMatching.pattern)) {
      failNextSetMatching.remaining--;
      throw new TypeError('simulated network failure');
    }
    if (a.includes('NX') && kv.has(a[0])) r = null;             // honour SET ... NX
    else { kv.set(a[0], a[1]); r = 'OK'; }
  }
  if (c === 'DEL') { dels.push(a[0]); kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: identity } = await import('../api/identity.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, headers: {}, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(k, v){ this.headers[k] = v; }, end(){ return this; } }; }
async function callIdentity(body, { cookie = '', ip = '9.9.9.9' } = {}) {
  const r = res();
  await identity({ method: 'POST', query: {}, headers: { cookie, 'x-forwarded-for': ip }, body }, r);
  return r;
}

let _n = 0;
const IDEM = () => 'idemkey' + String(++_n).padStart(9, '0');
const signup = (over = {}) => ({
  clubName: over.clubName ?? `Testers RFC ${++_n}`,
  teamName: 'Seniors', sport: 'Rugby',
  name: 'Founder Coach',
  email: over.email ?? `founder${_n}@signup.test`,
  password: 'password123',
  ...over,
});
// loadTeams() seeds DEFAULT_TEAM in-memory under the test flag (long-standing
// dev convenience, persisted by any save) — count only REAL created tenants.
const teams = () => JSON.parse(kv.get('app:identity:teams') || '[]').filter(t => t.id !== 'boitsfort-rfc');
const users = () => JSON.parse(kv.get('app:identity:users') || '[]');
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const reset = () => { kv.clear(); dels.length = 0; failNextSetMatching = null; _n = 0; };

// ─── 1+2+3+11+25+30 — one healthy tenant with server-made everything ───────
test('a brand-new signup creates exactly one complete tenant with correct trial fields', async () => {
  reset();
  const input = signup();
  const out = await store.createClub({ ...input, idempotencyKey: IDEM() });

  assert.equal(teams().length, 1, 'one team');
  assert.equal(users().length, 1, 'one user');
  assert.equal(members().length, 1, 'one membership');
  const t = teams()[0], m = members()[0], u = users()[0];
  assert.notEqual(t.id, input.clubName, 'teamId is server-generated (slug), not client text');
  assert.equal(m.isOwner, true); assert.equal(m.role, 'coach'); assert.equal(m.staffLevel, 'head');
  assert.equal(m.accessProfile, 'full');
  assert.equal(m.teamId, t.id); assert.equal(m.userId, u.id);
  assert.equal(members().filter(x => x.userId === u.id).length, 1, 'owner of ONLY that tenant');
  assert.equal(t.plan, 'trial'); assert.equal(t.planStatus, 'active');
  const trialDays = (new Date(t.trialEndsAt) - new Date(t.createdAt)) / 86400000;
  assert.ok(Math.abs(trialDays - 30) < 0.01, '30-day trial');
  const resolved = await store.resolveSession(out.session.token);
  assert.equal(resolved.session.teamId, t.id, 'valid session scoped to the new tenant');
});

// ─── 4+5+6 — same key: retries and double-submits converge on ONE club ─────
test('same key + same payload always returns the same tenant, never a duplicate', async () => {
  reset();
  const input = signup();
  const k = IDEM();
  const first = await store.createClub({ ...input, idempotencyKey: k });
  const retryAfterSuccess = await store.createClub({ ...input, idempotencyKey: k }); // lost-response retry
  const thirdTap = await store.createClub({ ...input, idempotencyKey: k });          // double-tap

  assert.equal(teams().length, 1, 'exactly one club after three submissions');
  assert.equal(users().length, 1); assert.equal(members().length, 1);
  assert.equal(retryAfterSuccess.team.id, first.team.id);
  assert.equal(thirdTap.team.id, first.team.id);
  assert.equal(retryAfterSuccess.resumed, true, 'replay is marked as a resume');
  const resolved = await store.resolveSession(retryAfterSuccess.session.token);
  assert.equal(resolved.session.teamId, first.team.id, 'retry still yields a working session');
});

// ─── 7+8+9 — a key binds to ONE signup and exposes nothing else ────────────
test('conflicting reuse of a key is refused; a key can never read another signup', async () => {
  reset();
  const input = signup();
  const k = IDEM();
  await store.createClub({ ...input, idempotencyKey: k });

  await assert.rejects(store.createClub({ ...input, email: 'other@signup.test', idempotencyKey: k }),
    e => e.status === 409, 'same key + different email → 409');
  await assert.rejects(store.createClub({ ...input, clubName: 'Different RFC', idempotencyKey: k }),
    e => e.status === 409, 'same key + different club name → 409');
  // An attacker who learns the key but not the payload gets nothing.
  await assert.rejects(store.createClub({ ...signup(), idempotencyKey: k }),
    e => e.status === 409, 'foreign payload on a stolen key → 409, no data out');
  assert.equal(teams().length, 1, 'no extra tenants from any refused attempt');
});

// ─── 10–16 — forged privileged fields are inert ────────────────────────────
test('forged teamId/clubId/role/staffLevel/accessScope/isOwner/platformRole are all ignored', async () => {
  reset();
  const out = await store.createClub({
    ...signup(),
    idempotencyKey: IDEM(),
    teamId: 'boitsfort', clubId: 'boitsfort',
    role: 'admin', staffLevel: 'manager',
    accessScope: { clubWide: true },
    isOwner: false,
    platformRole: 'platform_admin',
  });
  assert.notEqual(out.team.id, 'boitsfort', 'forged teamId never adopted');
  assert.equal(teams().some(t => t.id === 'boitsfort'), false);
  const m = members()[0], u = users()[0];
  assert.equal(m.role, 'coach', 'role is server-set');
  assert.equal(m.staffLevel, 'head', 'staffLevel is server-set');
  assert.equal(m.accessScope, undefined, 'no accessScope smuggled in');
  assert.equal(m.isOwner, true, 'owner flag is server-set');
  assert.equal(u.platformRole, undefined, 'platformRole can never come from signup');
});

// ─── 17+18 — ONE duplicate-name policy ─────────────────────────────────────
test('logical duplicate club names are refused; genuinely different names pass', async () => {
  reset();
  await store.createClub({ ...signup({ clubName: 'Mons RFC' }), idempotencyKey: IDEM() });
  await assert.rejects(store.createClub({ ...signup({ clubName: 'Mons RFC' }), idempotencyKey: IDEM() }),
    e => e.status === 409, 'exact duplicate → 409');
  await assert.rejects(store.createClub({ ...signup({ clubName: '  mons   rfc ' }), idempotencyKey: IDEM() }),
    e => e.status === 409, 'case/whitespace variant → 409');
  const ok = await store.createClub({ ...signup({ clubName: 'Mons Rugby Academy' }), idempotencyKey: IDEM() });
  assert.ok(ok.team.id, 'near-but-different name is allowed');
  assert.equal(teams().length, 2);
});

test('a duplicate-name refusal creates NOTHING — the email can immediately sign up under a free name', async () => {
  reset();
  await store.createClub({ ...signup({ clubName: 'Taken RFC' }), idempotencyKey: IDEM() });
  const second = signup({ clubName: 'Taken RFC' });
  await assert.rejects(store.createClub({ ...second, idempotencyKey: IDEM() }), e => e.status === 409);
  assert.equal(users().some(u => u.email === second.email), false,
    'the refused signup burned no account (pre-flight name check runs before any write)');
  const ok = await store.createClub({ ...second, clubName: 'Free Name RFC', idempotencyKey: IDEM() });
  assert.ok(ok.team.id, 'same email succeeds under a free name');
});

test('provisionClub uses the SAME duplicate policy', async () => {
  reset();
  await store.createClub({ ...signup({ clubName: 'Shared Policy RFC' }), idempotencyKey: IDEM() });
  await assert.rejects(store.provisionClub({ clubName: '  shared  policy rfc', adminEmail: 'a@p.test' }),
    e => e.status === 409, 'provisioning refuses a signup-created name, one definition');
});

// ─── 19 — genuine pre-existing email keeps the login-instead 409 ───────────
test('a genuinely pre-existing email is refused with the log-in path (fresh key)', async () => {
  reset();
  const first = signup();
  await store.createClub({ ...first, idempotencyKey: IDEM() });
  await assert.rejects(store.createClub({ ...signup({ email: first.email }), idempotencyKey: IDEM() }),
    e => e.status === 409 && /log in instead/.test(e.message), 'existing account → truthful 409');
  assert.equal(users().length, 1, 'no duplicate user');
});

test('the email-conflict 409 carries code account_exists through the REAL handler', async () => {
  reset();
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-plat', email: 'plat2@x.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const plat = await store.createSession({ userId: 'u-plat', teamId: 'boitsfort', role: 'coach' });
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(plat.token)}`;
  const input = signup();
  const r1 = await callIdentity({ action: 'create_club', ...input, idempotencyKey: IDEM() }, { cookie, ip: '2.2.2.1' });
  assert.equal(r1.statusCode, 201);
  const r2 = await callIdentity({ action: 'create_club', ...signup({ email: input.email }), idempotencyKey: IDEM() }, { cookie, ip: '2.2.2.2' });
  assert.equal(r2.statusCode, 409);
  assert.equal(r2.body.code, 'account_exists', 'client can branch to truthful log-in copy without text sniffing');
});

// ─── 20–23 — failure injection at every stage; retry completes ONE tenant ──
for (const [label, pattern] of [
  ['user write fails', 'identity:users'],
  ['team write fails', 'identity:teams'],
  ['membership write fails', 'identity:team_members'],
  ['session write fails', 'identity:sessions'],
]) {
  test(`partial failure (${label}) → same-key retry completes exactly one healthy tenant`, async () => {
    reset();
    const input = signup();
    const k = IDEM();
    failNextSetMatching = { pattern, remaining: 1 };
    await assert.rejects(store.createClub({ ...input, idempotencyKey: k }), 'first attempt fails');
    failNextSetMatching = null;

    const out = await store.createClub({ ...input, idempotencyKey: k });
    assert.equal(teams().length, 1, 'one team after recovery');
    assert.equal(users().length, 1, 'one user after recovery');
    assert.equal(members().length, 1, 'one membership after recovery');
    const resolved = await store.resolveSession(out.session.token);
    assert.equal(resolved.session.teamId, out.team.id, 'working session after recovery');
    assert.equal(resolved.teamMember.isOwner, true);
  });
}

// ─── 9(cont)+retry-password — our half-signup never swaps credentials ──────
test('retrying OUR half-created signup with a different password is refused, not silently merged', async () => {
  reset();
  const input = signup();
  const k = IDEM();
  failNextSetMatching = { pattern: 'identity:teams', remaining: 1 };
  await assert.rejects(store.createClub({ ...input, idempotencyKey: k }));
  failNextSetMatching = null;
  await assert.rejects(store.createClub({ ...input, password: 'differentpass99', idempotencyKey: k }),
    e => e.status === 409 && /different password/.test(e.message));
  const ok = await store.createClub({ ...input, idempotencyKey: k });
  assert.ok(ok.team.id, 'the ORIGINAL credentials still complete the signup');
});

// ─── 24 — a failed signup deletes nothing and touches no foreign data ──────
test('failed signup never deletes or mutates unrelated existing data', async () => {
  reset();
  await store.createClub({ ...signup({ clubName: 'Preexisting RFC' }), idempotencyKey: IDEM() });
  const before = new Map([...kv.entries()]);
  failNextSetMatching = { pattern: 'identity:team_members', remaining: 1 };
  await assert.rejects(store.createClub({ ...signup(), idempotencyKey: IDEM() }));
  failNextSetMatching = null;
  assert.equal(dels.length, 0, 'no DELs ever issued by signup');
  for (const [k2, v] of before) {
    if (k2.includes('identity:') && kv.get(k2) !== v) {
      const b = JSON.parse(v), a = JSON.parse(kv.get(k2));
      assert.ok(Array.isArray(b) && Array.isArray(a) && a.length >= b.length,
        `only appends on ${k2}, never rewrites of foreign rows`);
      b.forEach(row => assert.deepEqual(a.find(x => x.id === row.id), row,
        `pre-existing row ${row.id} byte-identical`));
    }
  }
});

// ─── 26 — the public gate is untouched: flag off → anonymous 403 ───────────
test('PUBLIC_CLUB_SIGNUP unset: anonymous create_club through the REAL handler is 403', async () => {
  reset();
  const r = await callIdentity({ action: 'create_club', ...signup(), idempotencyKey: IDEM() });
  assert.equal(r.statusCode, 403);
  assert.match(r.body.error, /not open yet/);
  assert.equal(teams().length, 0, 'nothing created');
});

// ─── 27+28+29 — platform provisioning unchanged; tenants stay isolated ─────
test('platform admin create_club passes idempotency through the handler; club admin cannot provision; tenants isolated', async () => {
  reset();
  // Seed a platform admin + a normal club-owner session.
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-plat', email: 'plat@x.test', displayName: 'Platform', platformRole: 'platform_admin' }]));
  const plat = await store.createSession({ userId: 'u-plat', teamId: 'boitsfort', role: 'coach' });
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(plat.token)}`;

  const k = IDEM();
  const body = { action: 'create_club', ...signup({ clubName: 'Handler RFC' }), idempotencyKey: k };
  const r1 = await callIdentity(body, { cookie, ip: '1.1.1.1' });
  assert.equal(r1.statusCode, 201);
  const r2 = await callIdentity(body, { cookie, ip: '1.1.1.2' });
  assert.equal(r2.statusCode, 201, 'handler replay succeeds');
  assert.equal(r2.body.team.id, r1.body.team.id, 'handler-level retry returns the SAME tenant');
  assert.equal(teams().filter(t => t.name === 'Handler RFC').length, 1);

  // provision_club: platform admin OK, the new club's own founder 403.
  const prov = await callIdentity({ action: 'provision_club', clubName: 'Provisioned RFC', adminEmail: 'first@prov.test' }, { cookie, ip: '1.1.1.3' });
  assert.equal(prov.statusCode, 201, 'platform provisioning unchanged');
  const founderSession = r1.body.session; // token was stripped by publicAuthResult
  assert.equal(founderSession.token, undefined, 'no raw token in the handler payload');
  const founder = await store.createSession({ userId: r1.body.user.id, teamId: r1.body.team.id, role: 'coach' });
  const deny = await callIdentity({ action: 'provision_club', clubName: 'Nope FC', adminEmail: 'x@y.test' },
    { cookie: `${SESSION_COOKIE}=${encodeURIComponent(founder.token)}`, ip: '1.1.1.4' });
  assert.equal(deny.statusCode, 403, 'a club owner is NOT a platform admin');

  // Isolation both ways: the new tenant's membership list never mixes clubs.
  const newTeamId = r1.body.team.id;
  const mixed = members().filter(m => m.teamId === newTeamId && m.userId === 'u-plat');
  assert.equal(mixed.length, 0, 'creating a club grants the platform admin no membership in it');
  assert.equal(members().some(m => m.teamId === 'boitsfort' && m.userId === r1.body.user.id), false,
    'the new founder holds nothing in the default club');
});
