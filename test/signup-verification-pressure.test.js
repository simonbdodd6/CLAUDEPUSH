/**
 * PHASE B — EMAIL VERIFICATION PRESSURE for self-service signup.
 *
 * Policy pinned here (all through the REAL store + identity + invite +
 * availability handlers over a mocked Upstash):
 *
 *   · a self-service club's team record carries server-authored
 *     signupSource:'self_service'; ONE automatic verification email per
 *     fresh signup, replay-safe under the Phase-A idempotency key, and
 *     delivery failure never breaks the signup;
 *   · the club's FOUNDING OWNER must verify within 48h of club creation or
 *     NEW invite creation (player/staff, single-use/reusable) is refused
 *     with code email_verification_required — keyed to the founder, so a
 *     verified second admin cannot bypass it;
 *   · existing links keep claiming, every other feature keeps working, and
 *     verification restores invite creation instantly;
 *   · legacy clubs, provisioned clubs and legacy unverified users are
 *     untouched (no signupSource → exempt; no migration).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.verify-pressure.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;
delete process.env.RESEND_API_KEY;

const kv = new Map();
let failResendApi = false;
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (url, o = {}) => {
  if (String(url).startsWith('https://api.resend.com')) {
    if (failResendApi) throw new TypeError('simulated email network failure');
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  }
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { if (a.includes('NX') && kv.has(a[0])) r = null; else { kv.set(a[0], a[1]); r = 'OK'; } }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: identity } = await import('../api/identity.js');
const { default: invite } = await import('../api/invite.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, headers: {}, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(k, v){ this.headers[k] = v; }, end(){ return this; } }; }
let _ip = 0;
async function call(handler, method, body, { cookie = '', query = {} } = {}) {
  const r = res();
  await handler({ method, query, headers: { cookie, 'x-forwarded-for': `7.7.${(_ip >> 8) & 255}.${++_ip & 255}`, host: 'test.local', 'x-forwarded-proto': 'https' }, body }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

let _n = 0;
const IDEM = () => 'verifkey' + String(++_n).padStart(9, '0');
const signup = (over = {}) => ({
  clubName: over.clubName ?? `Verify RFC ${++_n}`,
  teamName: 'Seniors', sport: 'Rugby', name: 'Founder Coach',
  email: over.email ?? `vf${_n}@verify.test`,
  password: 'password123', ...over,
});
const verifications = () => JSON.parse(kv.get('app:identity:email_verifications') || '[]');
const teams = () => JSON.parse(kv.get('app:identity:teams') || '[]');
const users = () => JSON.parse(kv.get('app:identity:users') || '[]');
const reset = () => { kv.clear(); failResendApi = false; _n = 0; };

async function selfServiceClub(over = {}) {
  const input = signup(over);
  const r = await call(identity, 'POST', { action: 'create_club', ...input, idempotencyKey: IDEM() },
    { cookie: await platformCookie() });
  assert.equal(r.statusCode, 201);
  const founderSession = await store.createSession({ userId: r.body.user.id, teamId: r.body.team.id, role: 'coach' });
  return { ...r.body, input, founderSession };
}
let _platCookie = null;
async function platformCookie() {
  if (_platCookie && kv.get('app:identity:users')?.includes('u-plat-vp')) return _platCookie;
  const u = users(); u.push({ id: 'u-plat-vp', email: 'plat-vp@x.test', displayName: 'P', platformRole: 'platform_admin' });
  kv.set('app:identity:users', JSON.stringify(u));
  const s = await store.createSession({ userId: 'u-plat-vp', teamId: 'boitsfort-rfc', role: 'coach' });
  _platCookie = ck(s);
  return _platCookie;
}
function backdateClub(teamId, days = 3) {
  const t = JSON.parse(kv.get('app:identity:teams'));
  const team = t.find(x => x.id === teamId);
  team.createdAt = new Date(Date.now() - days * 86400000).toISOString();
  kv.set('app:identity:teams', JSON.stringify(t));
}

// ─── 1+2+18+19+30 — signup marks, sends once, forged fields inert ──────────
test('fresh self-service signup: unverified founder, server-authored marker, ONE auto verification email', async () => {
  reset();
  const club = await selfServiceClub({ emailVerified: true, signupSource: 'legacy' });   // forged fields ride along
  const team = teams().find(t => t.id === club.team.id);
  assert.equal(team.signupSource, 'self_service', 'marker is server-authored — forged body value inert');
  const founder = users().find(u => u.id === club.user.id);
  assert.equal(founder.emailVerified, false, 'forged emailVerified:true in the body is inert');
  assert.equal(club.verificationEmail?.requested, true, 'auto verification email requested');
  assert.equal(verifications().filter(v => v.userId === founder.id).length, 1, 'exactly one token minted');
  assert.equal(club.verificationEmail?.delivery?.reason, 'email_not_configured', 'delivery honestly reported (no key in test env)');

  const anon = await call(identity, 'POST', { action: 'create_club', ...signup(), idempotencyKey: IDEM() });
  assert.equal(anon.statusCode, 403, 'PUBLIC_CLUB_SIGNUP still refuses anonymous signup');
});

// ─── 3 — idempotent replay never re-sends ──────────────────────────────────
test('replaying the same signup key does NOT mint or send another verification email', async () => {
  reset();
  const input = signup();
  const k = IDEM();
  const cookie = await platformCookie();
  const r1 = await call(identity, 'POST', { action: 'create_club', ...input, idempotencyKey: k }, { cookie });
  const r2 = await call(identity, 'POST', { action: 'create_club', ...input, idempotencyKey: k }, { cookie });
  assert.equal(r2.statusCode, 201);
  assert.equal(r2.body.resumed, true);
  assert.equal(r2.body.verificationEmail?.requested, false, 'replay: no second automatic send');
  assert.equal(verifications().filter(v => v.userId === r1.body.user.id).length, 1, 'still exactly one token');
});

// ─── 4 — email delivery failure never breaks the signup ────────────────────
test('verification email network failure: signup still succeeds, club healthy, resend recovers', async () => {
  reset();
  process.env.RESEND_API_KEY = 'test-key';
  failResendApi = true;
  const club = await selfServiceClub();
  assert.equal(club.verificationEmail?.requested, true);
  assert.equal(club.verificationEmail?.delivery?.ok, false, 'failure reported non-fatally');
  assert.ok(teams().find(t => t.id === club.team.id), 'club fully created');
  // ── 5. resend works later through the existing action ──
  failResendApi = false;
  const resend = await call(identity, 'POST', { action: 'send_verification_email' }, { cookie: ck(club.founderSession) });
  assert.equal(resend.statusCode, 200);
  assert.equal(resend.body.emailDelivery?.sent, true, 'resend delivers once email works again');
  delete process.env.RESEND_API_KEY;
});

// ─── 6+7 — inside 48h everything invites normally ──────────────────────────
test('unverified founder INSIDE grace can create player + staff + reusable invites', async () => {
  reset();
  const club = await selfServiceClub();
  const cookie = ck(club.founderSession);
  const player = await call(invite, 'POST', { name: 'New Player', role: 'player', sendEmail: false }, { cookie });
  assert.equal(player.statusCode, 201, 'player invite inside grace');
  const staff = await call(invite, 'POST', { name: 'New Coach', role: 'coach', staffLevel: 'assistant', sendEmail: false }, { cookie });
  assert.equal(staff.statusCode, 201, 'staff invite inside grace');
  const link = await call(invite, 'POST', { group: true, role: 'player' }, { cookie });
  assert.equal(link.statusCode, 200, 'reusable link inside grace');
  assert.ok(link.body.url);
});

// ─── 8+9+10+17+20 — the 48h wall, existing links, verification restore ─────
test('after 48h unverified: NEW invites refused (incl. by a verified second admin); existing links claim; verification restores instantly', async () => {
  reset();
  const club = await selfServiceClub();
  const cookie = ck(club.founderSession);
  // Existing link + a verified second club-wide admin, both made inside grace.
  const preLink = await call(invite, 'POST', { group: true, role: 'player' }, { cookie });
  assert.equal(preLink.statusCode, 200);
  const adminInvite = await call(invite, 'POST', { name: 'Second Admin', role: 'admin', sendEmail: false }, { cookie });
  assert.equal(adminInvite.statusCode, 201);
  const admin = await store.claimInvite({ token: adminInvite.body.token, email: 'second@verify.test', name: 'Second Admin', password: 'password123' });
  { const u = users(); u.find(x => x.id === admin.user.id).emailVerified = true; kv.set('app:identity:users', JSON.stringify(u)); }

  backdateClub(club.team.id);

  const refusedP = await call(invite, 'POST', { name: 'Late Player', role: 'player', sendEmail: false }, { cookie });
  assert.equal(refusedP.statusCode, 403);
  assert.equal(refusedP.body.code, 'email_verification_required', 'player invite refused with the machine code');
  const refusedS = await call(invite, 'POST', { name: 'Late Coach', role: 'coach', staffLevel: 'assistant', sendEmail: false }, { cookie });
  assert.equal(refusedS.body.code, 'email_verification_required', 'staff invite refused');
  const refusedNewLink = await call(invite, 'POST', { group: true, role: 'medical' }, { cookie });
  assert.equal(refusedNewLink.body.code, 'email_verification_required', 'minting a NEW reusable link refused');

  const adminTry = await call(invite, 'POST', { name: 'Bypass Try', role: 'player', sendEmail: false }, { cookie: ck(admin.session) });
  assert.equal(adminTry.body.code, 'email_verification_required', 'verified SECOND admin cannot bypass the founder gate');

  const existingLink = await call(invite, 'POST', { group: true, role: 'player' }, { cookie });
  assert.equal(existingLink.statusCode, 200, 'the EXISTING reusable link is still returned');
  assert.equal(existingLink.body.token, preLink.body.token, 'same link, nothing new minted');
  const claimed = await store.claimInvite({ token: preLink.body.token, email: 'latecomer@verify.test', name: 'Late Comer', password: 'password123' });
  assert.ok(claimed.user.id, 'existing links still claim normally after the wall');

  // Verify the founder through the REAL token path → instantly restored.
  const tokenRec = verifications().find(v => v.userId === club.user.id && !v.usedAt);
  assert.ok(tokenRec, 'a token exists to complete');
  // The stored record holds the hash; mint a fresh token via the real action to verify with.
  const resend = await call(identity, 'POST', { action: 'send_verification_email' }, { cookie });
  assert.equal(resend.statusCode, 200);
  // send action doesn't return the raw token (email-only) — drive the store API as the email link would.
  const fresh = await store.createEmailVerificationToken(club.user.id);
  const verified = await call(identity, 'POST', { action: 'verify_email', token: fresh.token });
  assert.equal(verified.statusCode, 200);
  const nowOk = await call(invite, 'POST', { name: 'Post Verify', role: 'player', sendEmail: false }, { cookie });
  assert.equal(nowOk.statusCode, 201, 'invite creation restored immediately after verification');
});

// ─── 11–16 — nothing else is gated ─────────────────────────────────────────
test('after the wall, non-invite features keep working; the gate is consulted ONLY by invite creation', async () => {
  reset();
  const club = await selfServiceClub();
  const cookie = ck(club.founderSession);
  const pl = await call(invite, 'POST', { name: 'Only Player', role: 'player', sendEmail: false }, { cookie });
  const player = await store.claimInvite({ token: pl.body.token, email: 'op@verify.test', name: 'Only Player', password: 'password123' });
  backdateClub(club.team.id);

  const avail = await call(availability, 'POST', { sessionId: 'tue', response: 'available' }, { cookie: ck(player.session) });
  assert.equal(avail.statusCode, 200, 'availability still writable');
  const board = await call(availability, 'GET', null, { cookie, query: { resolveRoster: '1' } });
  assert.equal(board.statusCode, 200, 'coach board still readable');

  // Structural proof for every other surface: the verification gate helper is
  // imported by the invite handler ONLY — no other endpoint can be affected.
  const fs = await import('node:fs');
  const files = fs.readdirSync('api').filter(f => f.endsWith('.js') && f !== '_identityStore.js');
  const importers = files.filter(f => fs.readFileSync(`api/${f}`, 'utf8').includes('clubInviteVerificationState'));
  assert.deepEqual(importers, ['invite.js'], 'fixtures/training/MC/medical/messaging/admin are structurally untouched');
});

// ─── session payload notice ────────────────────────────────────────────────
test('the founder session carries the reminder until verified, then it disappears', async () => {
  reset();
  const club = await selfServiceClub();
  let ctx = await store.resolveSession(club.founderSession.token);
  assert.ok(ctx.selfServiceVerification, 'notice present while unverified');
  assert.ok(ctx.selfServiceVerification.graceEndsAt > ctx.session.createdAt, 'grace deadline exposed');
  assert.equal(ctx.selfServiceVerification.inGrace, true);
  const fresh = await store.createEmailVerificationToken(club.user.id);
  await store.verifyEmailToken(fresh.token);
  ctx = await store.resolveSession(club.founderSession.token);
  assert.equal(ctx.selfServiceVerification, undefined, 'notice gone after verification — same session, no logout');
});

// ─── 21+22+23 — legacy and provisioned clubs are exempt ────────────────────
test('Boitsfort, provisioned clubs and legacy unverified users are untouched by the gate', async () => {
  reset();
  // Boitsfort-style legacy club: unverified coach, no signupSource, ancient createdAt.
  kv.set('app:identity:teams', JSON.stringify([{ id: 'boitsfort', name: 'Boitsfort', createdAt: '2026-07-01T00:00:00.000Z' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-b', teamId: 'boitsfort', userId: 'u-legacy', role: 'coach', staffLevel: 'head', isOwner: true, status: 'active', accessProfile: 'full' }]));
  kv.set('app:identity:users', JSON.stringify([{ id: 'u-legacy', email: 'legacy@b.test', displayName: 'Legacy', emailVerified: false }]));
  const legacy = await store.createSession({ userId: 'u-legacy', teamId: 'boitsfort', role: 'coach' });
  const r = await call(invite, 'POST', { name: 'Anyone', role: 'player', sendEmail: false }, { cookie: ck(legacy) });
  assert.equal(r.statusCode, 201, 'legacy unverified club invites freely — no retroactive enforcement');

  // Platform-provisioned club: first admin claims, stays unverified, still exempt.
  const prov = await store.provisionClub({ clubName: 'Provisioned Verify FC', adminEmail: 'first@pv.test' });
  const firstAdmin = await store.claimInvite({ token: prov.invite.token, email: 'first@pv.test', name: 'First Admin', password: 'password123' });
  const t = JSON.parse(kv.get('app:identity:teams')); t.find(x => x.id === prov.team.id).createdAt = '2026-07-01T00:00:00.000Z';
  kv.set('app:identity:teams', JSON.stringify(t));
  const r2 = await call(invite, 'POST', { name: 'P One', role: 'player', sendEmail: false }, { cookie: ck(firstAdmin.session) });
  assert.equal(r2.statusCode, 201, 'provisioned club exempt (no signupSource)');
});

// ─── 24 — anonymous invite creation refused as before ──────────────────────
test('anonymous invite creation still refused', async () => {
  reset();
  const r = await call(invite, 'POST', { name: 'X', role: 'player' });
  assert.ok([401, 403].includes(r.statusCode), String(r.statusCode));
});

// ─── 27+28+29 — token safety unchanged ─────────────────────────────────────
test('verification tokens: single-use, user-bound, and verify NOTHING but the email flag', async () => {
  reset();
  const a = await selfServiceClub();
  const b = await selfServiceClub();
  const beforeB = JSON.stringify(users().find(u => u.id === b.user.id));
  const tokenA = await store.createEmailVerificationToken(a.user.id);
  const beforeA = users().find(u => u.id === a.user.id);
  await store.verifyEmailToken(tokenA.token);
  const afterA = users().find(u => u.id === a.user.id);
  assert.equal(afterA.emailVerified, true);
  for (const k of Object.keys(afterA)) {
    if (['emailVerified', 'emailVerifiedAt'].includes(k)) continue;
    assert.deepEqual(afterA[k], beforeA[k], `verification changed only the email flag (field ${k})`);
  }
  assert.equal(afterA.platformRole, undefined, 'no privilege via verification');
  assert.equal(JSON.stringify(users().find(u => u.id === b.user.id)), beforeB, 'other users byte-identical');
  await assert.rejects(store.verifyEmailToken(tokenA.token), e => e.status === 410, 'reuse refused');
  await assert.rejects(store.verifyEmailToken('bogus-token'), e => e.status === 410, 'invalid refused');
});
