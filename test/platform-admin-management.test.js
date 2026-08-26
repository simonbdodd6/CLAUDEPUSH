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
