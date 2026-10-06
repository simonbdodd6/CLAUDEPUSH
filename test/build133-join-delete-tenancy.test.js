/**
 * A CLUB-SCOPED STAFF ACTION NEVER MUTATES ANOTHER CLUB'S PROFILE (Build 133, P0 #3)
 *
 * Build 132 traced a cross-tenant wipe on production:
 *   1. the public join (no session) found an EXISTING account by email alone
 *      and attached it to the code's club as a pending member — no password;
 *   2. that club's staff could then permanently delete the member, and the
 *      delete anonymised the person's player profile in EVERY club and deleted
 *      their login account if they were not active elsewhere.
 * An account with no password yet even had one SET by whoever typed its email.
 *
 * The fix, proved here against the real identity handler and store:
 *   - join attaches an existing account only when its password verifies;
 *     an unverified attempt writes nothing; a passwordless account is refused;
 *   - join is rate-limited per address and per address+email, and answers
 *     with ids and names only;
 *   - permanent delete ends THIS club's membership, profile and sessions and
 *     never touches another club's profile or the login account.
 * Every call goes straight to the API — no client validation is in the way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.b133-tenancy.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') {
    const nx = a.includes('NX');
    if (nx && kv.has(a[0])) r = null; else { kv.set(a[0], a[1]); r = 'OK'; }
  }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); r = l.length; }
  if (c === 'LRANGE') r = (lists.get(a[0]) || []).slice(0, 100);
  if (c === 'LTRIM' || c === 'EXPIRE') r = 'OK';
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: identity } = await import('../api/identity.js');
const { SESSION_COOKIE } = store;

const PW = 'password123';
let _ip = 0;
function res() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } }; }
/** Every call from its own address unless one is given: rate limits are proved separately. */
async function idCall(body, { cookie, ip } = {}) {
  const r = res();
  const headers = { 'x-forwarded-for': ip || `10.0.${Math.floor(++_ip / 250)}.${_ip % 250}` };
  if (cookie) headers.cookie = cookie;
  await identity({ method: 'POST', query: {}, headers, body }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const read = k => { const v = kv.get(k); return typeof v === 'string' ? JSON.parse(v) : (v || []); };
const users = () => read('app:identity:users');
const members = () => read('app:identity:team_members');
const profiles = () => read('app:identity:player_profiles');
const teams = () => read('app:identity:teams');
const codeOf = teamId => teams().find(t => t.id === teamId)?.teamCode;

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Owner`, email: `o${++_t}@b133.test`, password: PW });
}
/** A real player of `teamId` through the real invite claim (profile, membership, session). */
async function addPlayer(teamId, name, email = `p${++_t}@b133.test`) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  const claimed = await store.claimInvite({ position: '2 — Hooker', token, email, name, password: PW });
  return { ...claimed, email };
}
async function world() {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  const victim = await addPlayer(A.team.id, 'Vic Tim');
  // give the victim's club-A profile real personal data to protect
  const ps = profiles();
  const prof = ps.find(p => p.userId === victim.user.id && p.teamId === A.team.id);
  Object.assign(prof, { phone: '+32470000001', email: victim.email });
  kv.set('app:identity:player_profiles', JSON.stringify(ps));
  return { A, B, victim };
}
const snapshot = userId => ({
  user: JSON.stringify(users().find(u => u.id === userId) || null),
  members: JSON.stringify(members().filter(m => m.userId === userId)),
  profiles: JSON.stringify(profiles().filter(p => p.userId === userId)),
});

// ── JOIN ────────────────────────────────────────────────────────────────────

test('join: an EXISTING email with a WRONG password attaches nothing and changes nothing (Club B cannot claim Club A\'s player)', async () => {
  const { A, B, victim } = await world();
  const before = snapshot(victim.user.id);
  const r = await idCall({ action: 'join', teamCode: codeOf(B.team.id), firstName: 'Vic', lastName: 'Tim', email: victim.email, password: 'not-their-password' });
  assert.equal(r.statusCode, 401, JSON.stringify(r.body));
  assert.equal(r.body.ok, false);
  assert.ok(!JSON.stringify(r.body).includes(victim.user.id), 'the refusal does not leak the account id');
  assert.deepEqual(snapshot(victim.user.id), before, 'account, memberships and profiles are untouched');
  assert.equal(members().some(m => m.userId === victim.user.id && m.teamId === B.team.id), false, 'no Club B membership');
  assert.ok(A.team.id);
});

test('join: an existing account WITHOUT a password is refused — and no password is set on it', async () => {
  const { B } = await world();
  const list = users();
  list.push({ id: 'user_legacy_nopw', email: 'legacy@b133.test', displayName: 'Legacy Person', authProvider: 'password', passwordSet: false, createdAt: new Date().toISOString() });
  kv.set('app:identity:users', JSON.stringify(list));
  const r = await idCall({ action: 'join', teamCode: codeOf(B.team.id), firstName: 'Legacy', lastName: 'Person', email: 'legacy@b133.test', password: 'attacker-chosen' });
  assert.equal(r.statusCode, 401, JSON.stringify(r.body));
  const after = users().find(u => u.id === 'user_legacy_nopw');
  assert.equal(after.passwordHash, undefined, 'no password was written onto the account');
  assert.equal(members().some(m => m.userId === 'user_legacy_nopw'), false, 'no membership was created');
  // …and the attacker's password does not open it
  await assert.rejects(() => store.loginUser({ email: 'legacy@b133.test', password: 'attacker-chosen' }));
});

test('join: the account holder WITH their password may join a second club (multi-club stays possible)', async () => {
  const { A, B, victim } = await world();
  const r = await idCall({ action: 'join', teamCode: codeOf(B.team.id), firstName: 'Vic', lastName: 'Tim', email: victim.email, password: PW });
  assert.equal(r.statusCode, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.id, victim.user.id, 'the SAME account');
  const mine = members().filter(m => m.userId === victim.user.id);
  assert.deepEqual(mine.map(m => [m.teamId, m.status]).sort(), [[A.team.id, 'active'], [B.team.id, 'pending']].sort());
});

test('join: a new email creates its account as before; the answer carries ids and names only', async () => {
  const { B } = await world();
  const r = await idCall({ action: 'join', teamCode: codeOf(B.team.id), firstName: 'New', lastName: 'Person', email: 'new.person@b133.test', password: PW });
  assert.equal(r.statusCode, 201, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ['ok', 'team', 'teamMember', 'user']);
  assert.deepEqual(Object.keys(r.body.user).sort(), ['displayName', 'email', 'id']);
  assert.deepEqual(Object.keys(r.body.team).sort(), ['id', 'name']);
  const text = JSON.stringify(r.body);
  for (const leak of ['passwordHash', 'passwordSalt', 'stripeCustomerId', 'plan', 'lastTeamId', 'platformRole', 'teamCode']) {
    assert.ok(!text.includes(leak), `the answer does not carry ${leak}`);
  }
  assert.ok(users().some(u => u.email === 'new.person@b133.test' && u.passwordHash), 'account created with its password');
});

test('join: malformed and hostile input is refused before anything is written', async () => {
  const { B } = await world();
  const code = codeOf(B.team.id);
  const before = { u: users().length, m: members().length };
  const cases = [
    [{ firstName: '<img src=x onerror=alert(1)>', lastName: 'X', email: 'h1@b133.test' }, 400],
    [{ firstName: 'X', lastName: 'Y" onmouseover="alert(1)', email: 'h2@b133.test' }, 400],
    [{ firstName: 'X', lastName: 'Y', email: 'x"><svg/onload=alert(1)>@a.bc' }, 400],
    [{ firstName: 'X', lastName: 'Y', email: 'not-an-email' }, 400],
    [{ firstName: '', lastName: 'Y', email: 'h3@b133.test' }, 400],
  ];
  for (const [fields, status] of cases) {
    const r = await idCall({ action: 'join', teamCode: code, password: PW, ...fields });
    assert.equal(r.statusCode, status, `${JSON.stringify(fields)} → ${r.statusCode} ${JSON.stringify(r.body)}`);
  }
  const unknown = await idCall({ action: 'join', teamCode: 'NOPE99', firstName: 'X', lastName: 'Y', email: 'h4@b133.test', password: PW });
  assert.equal(unknown.statusCode, 404);
  assert.deepEqual({ u: users().length, m: members().length }, before, 'nothing written by any refused join');
});

test('join: rate-limited per address (code guessing) and per address+email (password guessing)', async () => {
  const { B, victim } = await world();
  const code = codeOf(B.team.id);
  // password guessing against one account from one address: the 6th try is refused
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await idCall({ action: 'join', teamCode: code, firstName: 'Vic', lastName: 'Tim', email: victim.email, password: `guess-${i}xx` }, { ip: '203.0.113.7' });
    statuses.push(r.statusCode);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429], 'five wrong passwords, then the limit');
  // code guessing from one address: 30 attempts, then refused (different emails each time)
  let last = 0;
  for (let i = 0; i < 31; i++) {
    const r = await idCall({ action: 'join', teamCode: `GUESS${10 + i}`, firstName: 'G', lastName: 'U', email: `g${i}@b133.test`, password: PW }, { ip: '198.51.100.9' });
    last = r.statusCode;
    if (i < 30) assert.equal(r.statusCode, 404, `attempt ${i + 1} reaches the code check`);
  }
  assert.equal(last, 429, 'the 31st attempt from one address is refused');
});

// ── PERMANENT DELETE ─────────────────────────────────────────────────────────

test('delete: Club B\'s permanent delete of its membership never touches Club A\'s profile, membership, sessions or the login account', async () => {
  const { A, B, victim } = await world();
  // the person legitimately joins Club B (password verified) and B approves them
  const j = await idCall({ action: 'join', teamCode: codeOf(B.team.id), firstName: 'Vic', lastName: 'Tim', email: victim.email, password: PW });
  assert.equal(j.statusCode, 201);
  const bMember = members().find(m => m.userId === victim.user.id && m.teamId === B.team.id);
  const ap = await idCall({ action: 'approve', memberId: bMember.id }, { cookie: ck(B.session) });
  assert.equal(ap.statusCode, 200, JSON.stringify(ap.body));
  const aProfileBefore = JSON.stringify(profiles().find(p => p.userId === victim.user.id && p.teamId === A.team.id));
  const aMemberBefore = JSON.stringify(members().find(m => m.userId === victim.user.id && m.teamId === A.team.id));

  const del = await idCall({ action: 'delete_member_permanently', memberId: bMember.id, confirm: 'DELETE' }, { cookie: ck(B.session) });
  assert.equal(del.statusCode, 200, JSON.stringify(del.body));
  assert.equal(del.body.accountDeleted, false);

  assert.equal(JSON.stringify(profiles().find(p => p.userId === victim.user.id && p.teamId === A.team.id)), aProfileBefore, 'Club A profile byte-identical');
  assert.equal(JSON.stringify(members().find(m => m.userId === victim.user.id && m.teamId === A.team.id)), aMemberBefore, 'Club A membership byte-identical');
  assert.equal(members().find(m => m.id === bMember.id).status, 'deleted', 'Club B membership ended');
  const bProfile = profiles().find(p => p.userId === victim.user.id && p.teamId === B.team.id);
  if (bProfile) assert.equal(bProfile.displayName, 'Removed member', 'Club B\'s own profile anonymised');
  assert.ok(users().some(u => u.id === victim.user.id), 'login account kept');
  // the person still signs in, and their Club A session still works
  const login = await store.loginUser({ email: victim.email, password: PW });
  assert.equal(login.teamMember?.teamId || login.session?.teamId, A.team.id, 'signs in to Club A');
  const aSession = await store.resolveSessionFromRequest({ headers: { cookie: ck(victim.session) } }).catch(() => null);
  assert.equal(aSession?.user?.id, victim.user.id, 'the Club A session survives');
});

test('delete: Club B cannot address a Club A membership at all', async () => {
  const { A, B, victim } = await world();
  const aMember = members().find(m => m.userId === victim.user.id && m.teamId === A.team.id);
  const before = snapshot(victim.user.id);
  const del = await idCall({ action: 'delete_member_permanently', memberId: aMember.id, confirm: 'DELETE' }, { cookie: ck(B.session) });
  assert.equal(del.statusCode, 404, JSON.stringify(del.body));
  const forged = await idCall({ action: 'delete_member_permanently', memberId: aMember.id, teamId: A.team.id, confirm: 'DELETE' }, { cookie: ck(B.session) });
  assert.ok([403, 404].includes(forged.statusCode), `a forged teamId is refused (${forged.statusCode})`);
  assert.deepEqual(snapshot(victim.user.id), before, 'nothing about the person changed');
});

test('delete: a member of ONE club is removed from that club only — the account remains, the club is closed to them', async () => {
  const { A, victim } = await world();
  const aMember = members().find(m => m.userId === victim.user.id && m.teamId === A.team.id);
  const del = await idCall({ action: 'delete_member_permanently', memberId: aMember.id, confirm: 'DELETE' }, { cookie: ck(A.session) });
  assert.equal(del.statusCode, 200, JSON.stringify(del.body));
  assert.equal(del.body.accountDeleted, false);
  assert.ok(del.body.sessionsRevoked >= 1, 'the club session is revoked');
  assert.ok(users().some(u => u.id === victim.user.id), 'login account kept');
  assert.equal(profiles().find(p => p.userId === victim.user.id && p.teamId === A.team.id).displayName, 'Removed member');
  const s = await store.resolveSessionFromRequest({ headers: { cookie: ck(victim.session) } }).catch(() => null);
  assert.ok(!s?.user?.id, 'the club session no longer resolves');
  const again = await store.loginUser({ email: victim.email, password: PW }).catch(e => ({ error: e }));
  assert.ok(again.error || !again.teamMember || again.teamMember.teamId !== A.team.id, 'signing in does not reach Club A');
});

test('profile scope: anonymisation names THIS club\'s profile only, even for a profile that names another club', async () => {
  const { A, B, victim } = await world();
  // a second profile for the same user in Club B, as an approved join creates
  const j = await idCall({ action: 'join', teamCode: codeOf(B.team.id), firstName: 'Vic', lastName: 'Tim', email: victim.email, password: PW });
  assert.equal(j.statusCode, 201);
  const bMember = members().find(m => m.userId === victim.user.id && m.teamId === B.team.id);
  await idCall({ action: 'approve', memberId: bMember.id }, { cookie: ck(B.session) });
  const aMember = members().find(m => m.userId === victim.user.id && m.teamId === A.team.id);
  const bProfileBefore = JSON.stringify(profiles().filter(p => p.userId === victim.user.id && p.teamId === B.team.id));
  const del = await idCall({ action: 'delete_member_permanently', memberId: aMember.id, confirm: 'DELETE' }, { cookie: ck(A.session) });
  assert.equal(del.statusCode, 200, JSON.stringify(del.body));
  assert.equal(JSON.stringify(profiles().filter(p => p.userId === victim.user.id && p.teamId === B.team.id)), bProfileBefore, 'Club B\'s profile untouched by Club A\'s delete');
  assert.equal(members().find(m => m.id === bMember.id).status, 'active', 'Club B membership still active');
});
