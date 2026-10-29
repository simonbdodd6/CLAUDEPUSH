/**
 * AN INVITATION NAMES THE CLUB IT IS FOR (Nick onboarding loop 1).
 *
 * A brand-new club has no club-config record by design — the founder saves
 * one in the first-run setup, later. Until then the invitation email and the
 * claim screen fell back to the legacy default club's name, so every
 * invitation a provisioned club sent before its first-run setup was titled
 * "You're invited to join Boitsfort RFC", and the person opening the link saw
 * no club name at all. The club's name has existed on the TENANT record since
 * provisioning; api/invite.js now reads it (inviteClubName → tenantClubName).
 *
 * Real handlers against an in-memory store, from an EMPTY world with one
 * platform administrator — the production shape of a new club. Pins:
 *   1. the founder's claim screen names the club before any config exists;
 *   2. the invitation email names the club, never the default club;
 *   3. a re-send names it too;
 *   4. a saved club-config name still wins (unchanged precedence);
 *   5. the legacy default tenant keeps its historical name, with and without
 *      the development placeholder;
 *   6. a club with neither record fails SAFE: "your club", teamName '';
 *   7. nothing in the request names the club;
 *   8. the read is read-only and touches no billing field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.invite-club-name.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;

const kv = new Map();
/** Every email handed to the provider, as the provider would receive it. */
const sentEmails = [];
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) {
    try { sentEmails.push(JSON.parse(options.body || '{}')); } catch { sentEmails.push({}); }
    return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  }
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'INCR') { const n = Number(kv.get(args[0]) || 0) + 1; kv.set(args[0], String(n)); result = n; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { DEFAULT_TEAM } = store;

function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
async function call(handler, { method = 'GET', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const inviteCreate = (body, token) => call(inviteHandler, { method: 'POST', body, token });
const inviteValidate = token => call(inviteHandler, { method: 'GET', query: { token } });
const inviteResend = (token, session) => call(inviteHandler, { method: 'PATCH', body: { token, action: 'resend' }, token: session });
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];
const lastEmail = () => sentEmails[sentEmails.length - 1];
const emailText = e => JSON.stringify(e);

/** An EMPTY world plus the single platform administrator production has. */
function emptyWorld() {
  kv.clear();
  sentEmails.length = 0;
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin', platformRole: 'platform_admin' },
  ]));
  kv.set('app:identity:teams', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
}

/** provision → (optionally) claim: a brand-new club exactly as Nick creates one. */
async function provision(clubName, adminEmail) {
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });
  const r = await identity({ action: 'provision_club', clubName, adminEmail, adminName: 'Frankie Founder' }, platform.token);
  assert.equal(r.code, 201, JSON.stringify(r.body));
  return { clubId: r.body.team.id, team: r.body.team,
           founderToken: decodeURIComponent(String(r.body.inviteUrl).split('inv=')[1]) };
}
async function claimFounder(club, adminEmail) {
  const claimed = await identity({ action: 'claim_invite', token: club.founderToken, email: adminEmail,
    name: 'Frankie Founder', password: 'longEnough123' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  return tokenOf(claimed);
}
/** A staff session in a club that may have NO team record at all. */
async function staffSession(teamId, userId = `u-${teamId}`) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id: userId, email: `${userId}@club.test`, displayName: 'Casey Coach' });
  kv.set('app:identity:users', JSON.stringify(users));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: `tm-${userId}`, teamId, userId, role: 'coach', staffLevel: 'head', status: 'active', accessScope: { clubWide: true } });
  kv.set('app:identity:team_members', JSON.stringify(members));
  return (await store.createSession({ userId, teamId, role: 'coach' })).token;
}

const withMailer = async fn => { process.env.RESEND_API_KEY = 'test-key'; try { return await fn(); } finally { delete process.env.RESEND_API_KEY; } };
// A production runtime (api/_identityStore.js isProductionRuntime): no dev
// placeholder team, so the explicit default-tenant fallback is what answers.
// VERCEL_ENV must say which environment, or api/_kv.js refuses storage.
const asProduction = async fn => {
  process.env.VERCEL = '1'; process.env.VERCEL_ENV = 'production';
  try { return await fn(); } finally { delete process.env.VERCEL; delete process.env.VERCEL_ENV; }
};

// ── 1. The founder's own claim screen ───────────────────────────────────────

test('1. the founder invite names the club on the claim screen before any club-config record exists', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  assert.equal(kv.has(`app:club:${club.clubId}`), false, 'precondition: no club-config record');
  const v = await inviteValidate(club.founderToken);
  assert.equal(v.code, 200, JSON.stringify(v.body));
  assert.equal(v.body.valid, true);
  assert.equal(v.body.teamName, 'Newbridge RFC', 'the claim screen names the club');
});

// ── 2 + 3. The invitation email, and its re-send ─────────────────────────────

test('2. a provisioned club with no club-config record emails its OWN name — never the default club', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  const session = await claimFounder(club, 'founder@newbridge.test');
  assert.equal(kv.has(`app:club:${club.clubId}`), false, 'precondition: still no club-config record after the claim');

  const r = await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player',
    email: 'pat@newbridge.test', sendEmail: true }, session));
  assert.equal(r.code, 201, JSON.stringify(r.body));
  assert.equal(r.body.emailDelivery.sent, true, 'the email was handed to the provider');
  const email = lastEmail();
  assert.equal(email.subject, "You're invited to join Newbridge RFC on CoachEasier");
  assert.match(String(email.text), /join Newbridge RFC on CoachEasier/);
  assert.match(String(email.html), /You're invited to join Newbridge RFC</);
  assert.equal(emailText(email).includes('Boitsfort'), false, 'the default club is never named');

  // The same invitation's claim screen agrees.
  const v = await inviteValidate(r.body.token);
  assert.equal(v.body.teamName, 'Newbridge RFC');
});

test('3. a re-send names the club too', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  const session = await claimFounder(club, 'founder@newbridge.test');
  const created = await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player',
    email: 'pat@newbridge.test', sendEmail: true }, session));
  assert.equal(created.code, 201, JSON.stringify(created.body));
  sentEmails.length = 0;
  const resent = await withMailer(() => inviteResend(created.body.token, session));
  assert.equal(resent.code, 200, JSON.stringify(resent.body));
  assert.equal(sentEmails.length, 1, 'exactly one re-sent email');
  assert.equal(lastEmail().subject, "You're invited to join Newbridge RFC on CoachEasier");
  assert.equal(emailText(lastEmail()).includes('Boitsfort'), false);
});

// ── 4. Precedence is unchanged: a saved club-config name wins ────────────────

test('4. a saved club-config name still wins over the tenant record (unchanged precedence)', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  const session = await claimFounder(club, 'founder@newbridge.test');
  // Written directly so the two records genuinely differ (the Settings save
  // path renames both; legacy clubs can still hold a drifted copy).
  kv.set(`app:club:${club.clubId}`, JSON.stringify({ clubName: 'Newbridge Rugby Club' }));
  const r = await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player',
    email: 'pat@newbridge.test', sendEmail: true }, session));
  assert.equal(r.code, 201, JSON.stringify(r.body));
  assert.equal(lastEmail().subject, "You're invited to join Newbridge Rugby Club on CoachEasier");
  assert.equal((await inviteValidate(r.body.token)).body.teamName, 'Newbridge Rugby Club');
});

// ── 5. The legacy default tenant is unchanged ────────────────────────────────

test('5. the legacy default club keeps its historical name with no config record — with and without the dev placeholder', async () => {
  // (a) development runtime: the placeholder team record answers.
  emptyWorld();
  let session = await staffSession(DEFAULT_TEAM.id, 'u-legacy-dev');
  let r = await withMailer(() => inviteCreate({ name: 'Legacy Player', role: 'player',
    email: 'legacy@boitsfort.test', sendEmail: true }, session));
  assert.equal(r.code, 201, JSON.stringify(r.body));
  assert.equal(lastEmail().subject, `You're invited to join ${DEFAULT_TEAM.name} on CoachEasier`);
  assert.equal((await inviteValidate(r.body.token)).body.teamName, DEFAULT_TEAM.name,
    'the claim screen now names the default club too (it used to be blank without a config record)');

  // (b) production runtime: no placeholder, no stored record — the explicit
  // default-tenant fallback answers, exactly as before this change.
  emptyWorld();
  session = await staffSession(DEFAULT_TEAM.id, 'u-legacy-prod');
  await asProduction(async () => {
    r = await withMailer(() => inviteCreate({ name: 'Legacy Player', role: 'player',
      email: 'legacy2@boitsfort.test', sendEmail: true }, session));
    assert.equal(r.code, 201, JSON.stringify(r.body));
    assert.equal(lastEmail().subject, `You're invited to join ${DEFAULT_TEAM.name} on CoachEasier`);
  });
});

// ── 6. Missing tenant data fails safe ────────────────────────────────────────

test('6. a club with neither a club-config nor a team record says "your club" and names no other club', async () => {
  emptyWorld();
  const session = await staffSession('ghost-club');
  await asProduction(async () => {                 // no dev placeholder can stand in
    const r = await withMailer(() => inviteCreate({ name: 'Ghost Player', role: 'player',
      email: 'ghost@ghost.test', sendEmail: true }, session));
    assert.equal(r.code, 201, JSON.stringify(r.body));
    const email = lastEmail();
    assert.equal(email.subject, "You're invited to join your club on CoachEasier");
    assert.equal(emailText(email).includes('Boitsfort'), false, 'never the default club');
    assert.equal(emailText(email).includes('join Ghost Player'), false, 'never the invitee as the club');
    const v = await inviteValidate(r.body.token);
    assert.equal(v.code, 200);
    assert.equal(v.body.teamName, '', 'the claim screen says nothing rather than guessing');
  });
});

// ── 7. Nothing in the request names the club ─────────────────────────────────

test('7. a club name in the request body is ignored', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  const session = await claimFounder(club, 'founder@newbridge.test');
  const r = await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player', email: 'pat@newbridge.test',
    sendEmail: true, clubName: 'Evil FC', teamName: 'Evil FC', team: { name: 'Evil FC' } }, session));
  assert.equal(r.code, 201, JSON.stringify(r.body));
  assert.equal(emailText(lastEmail()).includes('Evil FC'), false);
  assert.equal(lastEmail().subject, "You're invited to join Newbridge RFC on CoachEasier");
});

// ── 8. Read-only, and no billing field moves ─────────────────────────────────

test('8. resolving the name writes nothing and leaves the tenant record (plan, trial) byte-identical', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  const session = await claimFounder(club, 'founder@newbridge.test');
  const before = kv.get('app:identity:teams');
  await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player', email: 'pat@newbridge.test', sendEmail: true }, session));
  await inviteValidate(club.founderToken);
  assert.equal(kv.get('app:identity:teams'), before, 'the tenant list is untouched');
  const team = JSON.parse(before).find(t => t.id === club.clubId);
  assert.equal(team.plan, club.team.plan);
  assert.equal(team.planStatus, club.team.planStatus);
  assert.equal(await store.tenantClubName(club.clubId), 'Newbridge RFC');
  assert.equal(await store.tenantClubName('no-such-club'), '', 'unknown → empty, never invented');
  assert.equal(await store.tenantClubName(''), '');
});
