/**
 * PLATFORM ADMINISTRATION — granting and revoking the authority to provision.
 *
 * Platform authority is one field on one USER record (user.platformRole), and
 * isPlatformAdmin() is the only question anybody asks about it. Until now the
 * only way to create one was to edit the database by hand, so a second founder
 * could not be given the same capability without a developer.
 *
 * The whole point of this surface is that it grants NOTHING inside any club.
 * It is not an owner, not Full Access, not a head coach and not a membership:
 * a grant creates no club and no membership, and a revoke leaves every
 * membership, ownership and plan exactly as it found them. These tests hold
 * that line, and hold the authorisation wall in front of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.platformadmin.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
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
const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { isPlatformAdmin } = store;

const CLUB = 'kestrel-rfc';
/**
 * One platform administrator (as production has), plus a real club whose
 * owner, admin and player are the people who must NEVER reach this surface.
 */
function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Kestrel RFC', plan: 'trial', planStatus: 'active' },
  ]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon',    email: 'simon@coacheasier.com', displayName: 'Simon',    platformRole: 'platform_admin' },
    { id: 'u-cofound',  email: 'CoFounder@Example.com', displayName: 'Cofounder' },
    { id: 'u-owner',    email: 'owner@kestrel.test',    displayName: 'Club Owner' },
    { id: 'u-admin',    email: 'admin@kestrel.test',    displayName: 'Club Admin' },
    { id: 'u-player',   email: 'player@kestrel.test',   displayName: 'A Player' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-owner',  teamId: CLUB, userId: 'u-owner',  role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-admin',  teamId: CLUB, userId: 'u-admin',  role: 'admin', status: 'active', accessProfile: 'full' },
    { id: 'm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active',
      playerGroupId: 'grp_initial' },
    // The co-founder is an ORDINARY member of this club. Their platform grant
    // must not change any of this, and revoking it must not either.
    { id: 'm-cofound', teamId: CLUB, userId: 'u-cofound', role: 'player', status: 'active',
      playerGroupId: 'grp_initial' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('ce:invites', JSON.stringify([]));
}

function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
async function call(handler, { method = 'POST', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api/identity', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const identityGet = (query, token) => call(identityHandler, { method: 'GET', query, token });
const publish = (method, query, body, token) => call(publishHandler, { method, query, body, token });

const users = () => JSON.parse(kv.get('app:identity:users') || '[]');
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const userById = id => users().find(u => u.id === id) || null;
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };
const sessionFor = (userId, teamId = CLUB, role = 'coach') => store.createSession({ userId, teamId, role });
const grant = (email, token) => identity({ action: 'grant_platform_admin', email }, token);
const revoke = (userId, token) => identity({ action: 'revoke_platform_admin', userId }, token);

// ── A–E: the grant, and what it actually enables ────────────────────────────

test('A. an existing platform admin grants platform authority to a colleague', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  assert.equal(isPlatformAdmin(userById('u-cofound')), false, 'not an admin to begin with');

  const r = await grant('cofounder@example.com', simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.alreadyGranted, false);
  assert.equal(isPlatformAdmin(userById('u-cofound')), true, 'the user record now carries it');
  assert.equal(userById('u-cofound').platformRoleGrantedBy, 'u-simon');
  assert.ok(userById('u-cofound').platformRoleGrantedAt);
  assert.deepEqual(r.body.admins.map(a => a.id).sort(), ['u-cofound', 'u-simon']);
  // No password material ever travels back.
  assert.equal(JSON.stringify(r.body).includes('passwordHash'), false);
});

test('B. the granted user resolves as a platform admin on a FRESH session', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  await grant('cofounder@example.com', simon.token);

  // A brand-new session, resolved by the server from scratch.
  const fresh = await sessionFor('u-cofound', CLUB, 'player');
  const resolved = await store.resolveSession(fresh.token);
  assert.equal(isPlatformAdmin(resolved.user), true);
  // And the session payload carries it, which is what reveals the UI.
  const payload = await identityGet({ action: 'session' }, fresh.token);
  assert.equal(payload.code, 200);
  assert.equal(payload.body.user.platformRole, 'platform_admin');
});

test('C+D+E. the granted admin reaches provisioning, creates a club, and may choose Pro', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  await grant('cofounder@example.com', simon.token);
  const cofounder = await sessionFor('u-cofound', CLUB, 'player');

  // C: the platform-only listing endpoint now answers them.
  const list = await identityGet({ action: 'platform_admins' }, cofounder.token);
  assert.equal(list.code, 200, JSON.stringify(list.body));

  // D + E: they provision a real club, on Pro.
  const provisioned = await identity({ action: 'provision_club', clubName: 'Cofounder RFC',
    adminEmail: 'first@cofounder.test', plan: 'pro' }, cofounder.token);
  assert.equal(provisioned.code, 201, JSON.stringify(provisioned.body));
  assert.equal(provisioned.body.team.plan, 'pro');
  const stored = JSON.parse(kv.get('app:identity:teams')).find(t => t.id === provisioned.body.team.id);
  assert.equal(stored.plan, 'pro', 'the plan is persisted server-side');
  assert.ok(String(provisioned.body.inviteUrl).includes('?inv='), 'with a founder invitation');
});

// ── F–J: the authorisation wall ─────────────────────────────────────────────

test('F+G+H+I. club owner, club admin, player and anonymous are all refused', async () => {
  seed();
  const cases = [
    ['club owner', await sessionFor('u-owner')],
    ['club admin', await sessionFor('u-admin', CLUB, 'admin')],
    ['player',     await sessionFor('u-player', CLUB, 'player')],
  ];
  for (const [label, s] of cases) {
    const g = await grant('cofounder@example.com', s.token);
    assert.equal(g.code, 403, `${label} grant: ${JSON.stringify(g.body)}`);
    assert.match(String(g.body.error), /Platform administrators only/i);
    const v = await revoke('u-simon', s.token);
    assert.equal(v.code, 403, `${label} revoke: ${JSON.stringify(v.body)}`);
    const l = await identityGet({ action: 'platform_admins' }, s.token);
    assert.equal(l.code, 403, `${label} list: ${JSON.stringify(l.body)}`);
  }
  // Anonymous — no session at all.
  assert.equal((await grant('cofounder@example.com', '')).code, 403);
  assert.equal((await revoke('u-simon', '')).code, 403);
  assert.equal((await identityGet({ action: 'platform_admins' }, '')).code, 403);

  // Nothing was granted, and Simon is still the only administrator.
  assert.equal(isPlatformAdmin(userById('u-cofound')), false);
  assert.deepEqual(users().filter(isPlatformAdmin).map(u => u.id), ['u-simon']);
});

test('J. a forged platform role in the body or query is ignored', async () => {
  seed();
  const owner = await sessionFor('u-owner');
  // Everything a client could try to say about itself.
  const forged = await identity({ action: 'grant_platform_admin', email: 'cofounder@example.com',
    platformRole: 'platform_admin', isPlatformAdmin: true, role: 'platform_admin',
    user: { platformRole: 'platform_admin' } }, owner.token);
  assert.equal(forged.code, 403, JSON.stringify(forged.body));
  const viaQuery = await call(identityHandler, { method: 'GET',
    query: { action: 'platform_admins', platformRole: 'platform_admin' }, token: owner.token });
  assert.equal(viaQuery.code, 403);
  assert.equal(isPlatformAdmin(userById('u-cofound')), false);
  // The owner did not gain it for themselves either.
  assert.equal(isPlatformAdmin(userById('u-owner')), false);
});

// ── K: idempotency ──────────────────────────────────────────────────────────

test('K. granting twice changes nothing the second time', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const first = await grant('cofounder@example.com', simon.token);
  assert.equal(first.body.alreadyGranted, false);
  const grantedAt = userById('u-cofound').platformRoleGrantedAt;

  const second = await grant('cofounder@example.com', simon.token);
  assert.equal(second.code, 200, JSON.stringify(second.body));
  assert.equal(second.body.alreadyGranted, true, 'reported as already in place');
  assert.equal(userById('u-cofound').platformRoleGrantedAt, grantedAt, 'the record is untouched');
  assert.equal(users().filter(u => u.id === 'u-cofound').length, 1, 'no duplicate user record');
  assert.equal(users().filter(isPlatformAdmin).length, 2, 'no duplicate administrator');
  // A no-op is not audited as a change.
  assert.equal(audits().filter(e => e.event === 'platform_admin_granted').length, 1);
});

// ── L–M: revoke, and the last-administrator wall ────────────────────────────

test('L. a platform admin can revoke another platform admin', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  await grant('cofounder@example.com', simon.token);
  assert.equal(users().filter(isPlatformAdmin).length, 2);

  const r = await revoke('u-cofound', simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(isPlatformAdmin(userById('u-cofound')), false);
  assert.deepEqual(r.body.admins.map(a => a.id), ['u-simon']);
  assert.equal(userById('u-cofound').platformRoleRevokedBy, 'u-simon');

  // Their session no longer resolves as platform authority.
  const after = await sessionFor('u-cofound', CLUB, 'player');
  assert.equal(isPlatformAdmin((await store.resolveSession(after.token)).user), false);
  // And provisioning is closed to them again.
  const blocked = await identity({ action: 'provision_club', clubName: 'Nope RFC',
    adminEmail: 'nope@x.test', plan: 'pro' }, after.token);
  assert.equal(blocked.code, 403, JSON.stringify(blocked.body));
});

test('M. the LAST platform admin cannot be revoked — enforced on the server', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  assert.equal(users().filter(isPlatformAdmin).length, 1);

  const r = await revoke('u-simon', simon.token);
  assert.equal(r.code, 400, JSON.stringify(r.body));
  assert.match(String(r.body.error), /last platform administrator/i);
  assert.equal(isPlatformAdmin(userById('u-simon')), true, 'still an administrator');

  // The wall is the COUNT, not the identity: with two, either may go — and
  // once one has gone, the remaining one is protected again.
  await grant('cofounder@example.com', simon.token);
  assert.equal((await revoke('u-cofound', simon.token)).code, 200);
  assert.equal((await revoke('u-simon', simon.token)).code, 400, 'protected once alone again');
  assert.equal(users().filter(isPlatformAdmin).length, 1);
});

// ── N–Q: the grant is platform-only, and nothing else moves ─────────────────

test('N+O. revoking changes no membership, no ownership and no club', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const membersBefore = JSON.stringify(members());
  const teamsBefore = JSON.stringify(JSON.parse(kv.get('app:identity:teams')));

  await grant('cofounder@example.com', simon.token);
  assert.equal(JSON.stringify(members()), membersBefore, 'granting touches no membership');

  await revoke('u-cofound', simon.token);
  assert.equal(JSON.stringify(members()), membersBefore, 'revoking touches no membership');
  assert.equal(JSON.stringify(JSON.parse(kv.get('app:identity:teams'))), teamsBefore,
    'and no club or plan is altered');

  // The co-founder is still exactly the club member they always were, and the
  // club still has exactly its original owner.
  const theirs = members().find(m => m.userId === 'u-cofound');
  assert.equal(theirs.role, 'player');
  assert.equal(theirs.status, 'active');
  assert.equal(theirs.playerGroupId, 'grp_initial');
  assert.equal(theirs.isOwner, undefined, 'never made an owner');
  assert.deepEqual(members().filter(m => m.isOwner).map(m => m.userId), ['u-owner']);
  // Their account survives a revoke.
  assert.ok(userById('u-cofound'), 'the account itself is untouched');
  assert.equal(userById('u-cofound').email, 'CoFounder@Example.com');
});

test('P+Q. platform authority grants no club membership and reads no club data', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  await grant('cofounder@example.com', simon.token);

  // The grant created no membership anywhere — the co-founder belongs to
  // exactly the one club they already did, and Simon to none at all.
  assert.deepEqual(members().filter(m => m.userId === 'u-cofound').map(m => m.teamId), [CLUB]);
  assert.deepEqual(members().filter(m => m.userId === 'u-simon'), []);

  // A platform admin with NO membership in a club cannot read that club's
  // data: platform authority is provisioning, not tenant access.
  const simonNoTeam = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const roster = await publish('GET', { resource: 'structure' }, null, simonNoTeam.token);
  assert.ok(roster.code === 401 || roster.code === 403,
    `platform role is not club access — expected an auth refusal, got HTTP ${roster.code}`);

  // And a club the co-founder provisions does not fold into their old club.
  const cofounder = await sessionFor('u-cofound', CLUB, 'player');
  const made = await identity({ action: 'provision_club', clubName: 'Isolated RFC',
    adminEmail: 'first@isolated.test' }, cofounder.token);
  assert.equal(made.code, 201, JSON.stringify(made.body));
  assert.notEqual(made.body.team.id, CLUB);
  assert.deepEqual(members().filter(m => m.teamId === made.body.team.id), [],
    'a provisioned club starts with no members at all');
});

// ── R: audit ────────────────────────────────────────────────────────────────

test('R. grants and revocations are audited, without sensitive material', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  await grant('cofounder@example.com', simon.token);
  await revoke('u-cofound', simon.token);

  const granted = audits().find(e => e.event === 'platform_admin_granted');
  const revoked = audits().find(e => e.event === 'platform_admin_revoked');
  for (const [label, entry] of [['grant', granted], ['revoke', revoked]]) {
    assert.ok(entry, `${label} is audited`);
    assert.equal(entry.targetUserId, 'u-cofound', `${label} names the target`);
    assert.equal(entry.changedBy, 'u-simon', `${label} names the actor`);
    assert.match(String(entry.at), /^\d{4}-\d{2}-\d{2}T/, `${label} is timestamped`);
  }
  const raw = JSON.stringify(audits());
  for (const secret of ['passwordHash', 'passwordSalt', 'ce_session', simon.token]) {
    assert.equal(raw.includes(secret), false, `audit must not carry ${secret.slice(0, 12)}`);
  }
});

// ── Email / identity edge cases ─────────────────────────────────────────────

test('S. email is normalised the same way the rest of identity normalises it', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  // Stored as "CoFounder@Example.com"; granted with different case + padding.
  const r = await grant('   COFOUNDER@EXAMPLE.COM  ', simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(isPlatformAdmin(userById('u-cofound')), true, 'matched the existing identity');
  assert.equal(users().length, 5, 'no second account was created');
});

test('T. unknown and malformed addresses are refused, and create nothing', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const before = JSON.stringify(users());

  const unknown = await grant('nobody@nowhere.test', simon.token);
  assert.equal(unknown.code, 404, JSON.stringify(unknown.body));
  assert.match(String(unknown.body.error), /No CoachEasier account/i);
  assert.match(String(unknown.body.error), /sign in once/i, 'and says what to do about it');

  for (const bad of ['', '   ', 'not-an-email', 'a@b', '@example.com', 'two@@example.com']) {
    const r = await grant(bad, simon.token);
    assert.equal(r.code, 400, `${JSON.stringify(bad)}: ${JSON.stringify(r.body)}`);
  }
  assert.equal(JSON.stringify(users()), before, 'no account created or modified by any refusal');
  assert.deepEqual(users().filter(isPlatformAdmin).map(u => u.id), ['u-simon']);
});

test('U. revoking someone who is not an administrator is refused', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  for (const target of ['u-owner', 'u-player', 'nope', '']) {
    const r = await revoke(target, simon.token);
    assert.ok(r.code === 404 || r.code === 400, `${target}: HTTP ${r.code}`);
  }
  assert.deepEqual(users().filter(isPlatformAdmin).map(u => u.id), ['u-simon']);
  assert.equal(JSON.stringify(members()).includes('"isOwner":true'), true, 'the club owner is untouched');
});

// ── The original administrator is unchanged ─────────────────────────────────

test('V. the original platform admin keeps everything they had', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  await grant('cofounder@example.com', simon.token);

  // Still resolves, still lists, still provisions, still picks a plan.
  assert.equal(isPlatformAdmin((await store.resolveSession(simon.token)).user), true);
  assert.equal((await identityGet({ action: 'platform_admins' }, simon.token)).code, 200);
  for (const plan of ['trial', 'core', 'pro']) {
    const r = await identity({ action: 'provision_club', clubName: `Simon ${plan} RFC`,
      adminEmail: `${plan}@simon.test`, plan }, simon.token);
    assert.equal(r.code, 201, `${plan}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.team.plan, plan);
  }
  // Even after the co-founder revokes nobody, Simon's own record is intact.
  const record = userById('u-simon');
  assert.equal(record.platformRole, 'platform_admin');
  assert.equal(record.platformRoleRevokedAt, undefined);
});

test('W. the admin surface is platform-gated in the client, and never public', async () => {
  const html = await (await import('node:fs/promises')).readFile(
    new URL('../index.html', import.meta.url), 'utf8');
  const card = html.slice(html.indexOf('function renderPlatformAdminsCard'),
                          html.indexOf('async function platformGrantAdmin'));
  assert.match(card, /_myPlatformRole !== 'platform_admin'/, 'hidden from everyone else');
  assert.match(card, /The last platform administrator cannot be removed/i, 'explains the wall');
  assert.match(card, /grants nothing inside a club/i, 'states what the role is not');
  // The grant/revoke calls name the platform actions and nothing club-shaped.
  const grantFn = html.slice(html.indexOf('async function platformGrantAdmin'),
                             html.indexOf('async function platformRevokeAdmin'));
  assert.match(grantFn, /action: 'grant_platform_admin'/);
  assert.equal(/isOwner|accessProfile|staffLevel|teamId/.test(grantFn), false,
    'granting platform access never sends club fields');
  // The card is reachable only from the platform-admin card, not from any
  // ordinary settings or member surface.
  assert.equal((html.match(/renderPlatformAdminsCard\(\)/g) || []).length, 2,
    'defined once and rendered from exactly one place');
});

// ── CHANGING AN EXISTING CLUB'S PLAN ────────────────────────────────────────
// The last operation that required editing the database by hand. It reuses the
// provisioning vocabulary exactly — trial/core/pro — and changes only what a
// plan is: entitlement reads the same field it always did and simply observes
// the new value. Administering a club's plan is emphatically NOT membership of
// that club, and these tests hold that line too.

const { PROVISIONABLE_PLANS, TRIAL_PERIOD_MS } = store;
const teams = () => JSON.parse(kv.get('app:identity:teams') || '[]');
const teamById = id => teams().find(t => t.id === id) || null;
const changePlan = (teamId, plan, token) =>
  identity({ action: 'change_club_plan', teamId, plan }, token);

/** Two clubs with different plans, so isolation has something to prove. */
function seedClubs() {
  seed();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Kestrel RFC', plan: 'core', planStatus: 'active', trialEndsAt: null,
      createdAt: '2026-01-01T00:00:00.000Z', teamCode: 'KESTR11',
      stripeCustomerId: null, stripeSubscriptionId: null },
    { id: 'other-rfc', name: 'Other RFC', plan: 'trial', planStatus: 'active',
      trialEndsAt: '2026-12-01T00:00:00.000Z', createdAt: '2026-02-02T00:00:00.000Z',
      teamCode: 'OTHER22', stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x' },
  ]));
}
/** The server's own entitlement answer for a club, as api/publish.js reads it. */
async function performanceFor(token) {
  const r = await publish('GET', { resource: 'performance' }, null, token);
  return { code: r.code, entitled: r.code === 200, reason: r.body?.code || null };
}

test('X1. a platform admin lists the clubs, and sees commercial state ONLY', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  const r = await identityGet({ action: 'platform_clubs' }, simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.clubs.map(c => c.id).sort(), ['kestrel-rfc', 'other-rfc']);
  const kestrel = r.body.clubs.find(c => c.id === CLUB);
  assert.deepEqual(Object.keys(kestrel).sort(),
    ['createdAt', 'id', 'name', 'plan', 'planStatus', 'trialEndsAt'],
    'the projection is exactly the commercial fields');
  // Nothing about the club's PEOPLE or content is reachable here.
  const raw = JSON.stringify(r.body);
  for (const leak of ['u-player', 'u-owner', 'playerGroupId', 'stripeCustomerId', 'teamCode',
                      'medical', 'members', 'players']) {
    assert.equal(raw.includes(leak), false, `the listing must not carry ${leak}`);
  }
});

test('X2. changing a club to PRO entitles Performance; trialEndsAt is cleared', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  const owner = await sessionFor('u-owner');
  assert.equal((await performanceFor(owner.token)).entitled, false, 'core to begin with');

  const r = await changePlan(CLUB, 'pro', simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.unchanged, false);
  assert.equal(r.body.previousPlan, 'core');
  assert.equal(r.body.club.plan, 'pro');

  const stored = teamById(CLUB);
  assert.equal(stored.plan, 'pro');
  assert.equal(stored.planStatus, 'active');
  assert.equal(stored.trialEndsAt, null, 'a paying club carries no trial expiry');

  // Entitlement simply observes the new plan — a fresh session, no cache.
  const after = await sessionFor('u-owner');
  const perf = await performanceFor(after.token);
  assert.equal(perf.entitled, true, `Performance must open on pro: ${JSON.stringify(perf)}`);
  const payload = await identityGet({ action: 'session' }, after.token);
  assert.equal(payload.body.teamPlan, 'pro');
});

test('X3. moving to CORE and back to TRIAL follows the existing plan semantics', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  await changePlan(CLUB, 'pro', simon.token);

  // pro → core: unentitled again, still no expiry.
  const toCore = await changePlan(CLUB, 'core', simon.token);
  assert.equal(toCore.code, 200, JSON.stringify(toCore.body));
  assert.equal(toCore.body.previousPlan, 'pro');
  assert.equal(teamById(CLUB).plan, 'core');
  assert.equal(teamById(CLUB).trialEndsAt, null);
  const owner = await sessionFor('u-owner');
  const perf = await performanceFor(owner.token);
  assert.equal(perf.entitled, false);
  assert.equal(perf.code, 402);
  assert.equal(perf.reason, 'performance_not_entitled');

  // core → trial: a FRESH trial on the existing 30-day policy, not a stale date.
  const before = Date.now();
  const toTrial = await changePlan(CLUB, 'trial', simon.token);
  assert.equal(toTrial.code, 200, JSON.stringify(toTrial.body));
  const ends = new Date(teamById(CLUB).trialEndsAt).getTime();
  assert.ok(ends >= before + TRIAL_PERIOD_MS - 5000 && ends <= Date.now() + TRIAL_PERIOD_MS + 5000,
    'the trial runs the same period provisioning uses');
  assert.equal(teamById(CLUB).plan, 'trial');
  assert.equal((await performanceFor(await sessionFor('u-owner').then(s => s.token))).entitled, false,
    'trial is still not entitled');
});

test('X4. selecting the plan a club already has writes nothing and audits nothing', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  const before = JSON.stringify(teamById(CLUB));

  const r = await changePlan(CLUB, 'core', simon.token);     // already core
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.unchanged, true, 'reported as a no-op');
  assert.equal(r.body.previousPlan, 'core');
  assert.equal(JSON.stringify(teamById(CLUB)), before, 'the record is byte-identical');
  assert.equal(audits().filter(e => e.event === 'club_plan_changed').length, 0,
    'a no-op is never audited as a change');

  // Case and padding normalise, and a genuine change after it still audits once.
  const shouty = await changePlan(CLUB, '  PRO  ', simon.token);
  assert.equal(shouty.code, 200, JSON.stringify(shouty.body));
  assert.equal(teamById(CLUB).plan, 'pro');
  assert.equal(audits().filter(e => e.event === 'club_plan_changed').length, 1);
});

test('X5. only a PLATFORM admin may change a plan — everyone else is refused', async () => {
  seedClubs();
  const before = JSON.stringify(teams());
  const cases = [
    ['club owner', (await sessionFor('u-owner')).token],
    ['club admin', (await sessionFor('u-admin', CLUB, 'admin')).token],
    ['player',     (await sessionFor('u-player', CLUB, 'player')).token],
    ['anonymous',  ''],
  ];
  for (const [label, token] of cases) {
    const r = await changePlan(CLUB, 'pro', token);
    assert.equal(r.code, 403, `${label}: ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.error), /Platform administrators only/i);
    const l = await identityGet({ action: 'platform_clubs' }, token);
    assert.equal(l.code, 403, `${label} listing: ${JSON.stringify(l.body)}`);
  }
  // Forged authority in the body or the query is ignored.
  const owner = await sessionFor('u-owner');
  const forged = await identity({ action: 'change_club_plan', teamId: CLUB, plan: 'pro',
    platformRole: 'platform_admin', isPlatformAdmin: true,
    user: { platformRole: 'platform_admin' } }, owner.token);
  assert.equal(forged.code, 403, JSON.stringify(forged.body));
  const viaQuery = await call(identityHandler, { method: 'GET',
    query: { action: 'platform_clubs', platformRole: 'platform_admin' }, token: owner.token });
  assert.equal(viaQuery.code, 403);
  assert.equal(JSON.stringify(teams()), before, 'no refusal changed any club');
});

test('X6. an invalid plan is refused before any write', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  const before = JSON.stringify(teams());

  for (const bad of ['enterprise', 'unlimited', 'free', '', '  ', 'pro; drop', ['pro'], 42, true, {}]) {
    const r = await changePlan(CLUB, bad, simon.token);
    assert.equal(r.code, 400, `plan ${JSON.stringify(bad)}: ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.error), /plan must be one of/i);
  }
  assert.equal(PROVISIONABLE_PLANS.includes('enterprise'), false, 'enterprise stays unselectable');
  assert.equal(JSON.stringify(teams()), before, 'no partial state from any refusal');

  // An unknown club is refused too, and changes nothing.
  const unknown = await changePlan('no-such-club', 'pro', simon.token);
  assert.equal(unknown.code, 404, JSON.stringify(unknown.body));
  assert.equal(JSON.stringify(teams()), before);
});

test('X7. changing one club changes only that club — everything else is byte-identical', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  const otherBefore = JSON.stringify(teamById('other-rfc'));
  const membersBefore = JSON.stringify(members());
  const usersBefore = JSON.stringify(users());
  const invitesBefore = kv.get('ce:invites');

  await changePlan(CLUB, 'pro', simon.token);

  assert.equal(JSON.stringify(teamById('other-rfc')), otherBefore,
    "the other club's record is untouched, including its Stripe ids and trial");
  assert.equal(JSON.stringify(members()), membersBefore, 'no membership altered');
  assert.equal(JSON.stringify(users()), usersBefore, 'no user record altered');
  assert.equal(kv.get('ce:invites'), invitesBefore, 'no invitation altered');
  // Ownership of the changed club is exactly as it was.
  assert.deepEqual(members().filter(m => m.isOwner).map(m => m.userId), ['u-owner']);
  // The changed club kept every non-commercial field it had.
  const kestrel = teamById(CLUB);
  assert.equal(kestrel.name, 'Kestrel RFC');
  assert.equal(kestrel.teamCode, 'KESTR11');
  assert.equal(kestrel.createdAt, '2026-01-01T00:00:00.000Z');
  // The other club's entitlement is unaffected in its own right.
  assert.equal(teamById('other-rfc').plan, 'trial');
});

test('X8. administering a plan grants NO membership of the club', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  await changePlan(CLUB, 'pro', simon.token);

  // Simon has no membership anywhere, and changing a plan created none.
  assert.deepEqual(members().filter(m => m.userId === 'u-simon'), []);
  // So he still cannot read that club's data, even now that it is entitled.
  const simonAtClub = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const structure = await publish('GET', { resource: 'structure' }, null, simonAtClub.token);
  assert.ok(structure.code === 401 || structure.code === 403,
    `platform authority is not club access — got HTTP ${structure.code}`);
  const perf = await publish('GET', { resource: 'performance' }, null, simonAtClub.token);
  assert.ok(perf.code === 401 || perf.code === 403,
    `and not Performance access either — got HTTP ${perf.code}`);
});

test('X9. every real plan change is audited with both plans; no secrets travel', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  await changePlan(CLUB, 'pro', simon.token);
  await changePlan(CLUB, 'trial', simon.token);

  const entries = audits().filter(e => e.event === 'club_plan_changed');
  assert.equal(entries.length, 2, 'one entry per real change');
  const latest = entries[0];
  assert.equal(latest.teamId_club, CLUB);
  assert.equal(latest.clubName, 'Kestrel RFC');
  assert.equal(latest.previousPlan, 'pro');
  assert.equal(latest.newPlan, 'trial');
  assert.equal(latest.changedBy, 'u-simon');
  assert.match(String(latest.at), /^\d{4}-\d{2}-\d{2}T/);
  const raw = JSON.stringify(entries);
  for (const secret of ['passwordHash', 'passwordSalt', 'ce_session', simon.token, 'cus_x', 'sub_x']) {
    assert.equal(raw.includes(secret), false, `audit must not carry ${String(secret).slice(0, 12)}`);
  }
});

test('X10. provisioning a NEW club still behaves exactly as before', async () => {
  seedClubs();
  const simon = await sessionFor('u-simon');
  for (const [plan, entitled] of [['pro', true], ['trial', false], ['core', false]]) {
    const r = await identity({ action: 'provision_club', clubName: `Regression ${plan} RFC`,
      adminEmail: `${plan}@regression.test`, plan }, simon.token);
    assert.equal(r.code, 201, `${plan}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.team.plan, plan);
    const stored = teamById(r.body.team.id);
    assert.equal(stored.plan, plan);
    assert.equal(stored.planStatus, 'active');
    // Trial keeps its deadline; core and pro carry none — unchanged behaviour.
    if (plan === 'trial') assert.ok(stored.trialEndsAt); else assert.equal(stored.trialEndsAt, null);
    assert.equal(PROVISIONABLE_PLANS.includes(plan), true);
    assert.equal(entitled, plan === 'pro', 'sanity: only pro is entitled');
  }
});

test('X11. the Existing clubs card is platform-gated and free of commerce', async () => {
  const html = await (await import('node:fs/promises')).readFile(
    new URL('../index.html', import.meta.url), 'utf8');
  const card = html.slice(html.indexOf('function renderPlatformClubsCard'),
                          html.indexOf('function platformTogglePlanEditor'));
  assert.match(card, /_myPlatformRole !== 'platform_admin'/, 'hidden from everyone else');
  assert.match(card, /PROVISIONING_PLAN_OPTIONS/, 'reuses the one plan vocabulary');
  for (const forbidden of ['Upgrade', '/month', 'per month', 'Buy ', 'Checkout', 'Subscribe']) {
    assert.equal(card.includes(forbidden), false, `no commercial surface: ${forbidden}`);
  }
  assert.equal(/[$€£]\s?\d/.test(card), false, 'no prices on an internal admin card');
  // The change is confirmed, states the consequence, and names both plans.
  const fn = html.slice(html.indexOf('async function platformChangeClubPlan'),
                        html.indexOf('async function platformChangeClubPlan') + 2200);
  assert.match(fn, /ceConfirm\(/, 'never a one-click silent change');
  assert.match(fn, /plan and feature entitlement/i, 'states the consequence');
  assert.match(fn, /action: 'change_club_plan', teamId: clubId, plan: next/,
    'sends only the club and the plan');
});
