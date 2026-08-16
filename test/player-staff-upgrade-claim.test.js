/**
 * EXISTING PLAYER → U18 STAFF INVITE UPGRADE (the Benjamin case).
 *
 *  The SERVER path already supports this: a staff invite claimed with the
 *  existing account's email + password FORCES the role upgrade on the SAME
 *  member (never a duplicate), preserves the player side (playerGroupId,
 *  eligibility, profile — Phase C.1), and stamps EXACTLY the invite's scope
 *  (priorWasStaff=false ⇒ the upgrade starts from the invite's grant, never
 *  the legacy Seniors derivation). What misled real users was the invite
 *  UI: account-creation copy with no existing-account path. The modal now
 *  says an existing account just signs in, and flips into sign-in wording
 *  after the 403 password check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-upgrade.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', []];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { resolvePlayerGroup, resolveEligibility, effectiveAccessScope, operationalGroupsFor } =
  await import('../api/_accessScope.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const CLUB = 'boitsfort', OTHER = 'otherclub';
const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_dev',  groupId: SEN, name: 'Premier development', status: 'active' },
    { id: 'team_u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
  ] };

async function seedWithBenjamin() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }, { id: OTHER, name: 'Other Club' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-otheradmin', email: 'o@x.test', displayName: 'Other Admin' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-otheradmin', teamId: OTHER, userId: 'u-otheradmin', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1,
    groups: [{ id: 'grp_o', name: 'First XV', type: 'general', status: 'active' }],
    teams: [{ id: 'team_o', groupId: 'grp_o', name: 'First XV', status: 'active' }] }));
  kv.set('ce:invites', JSON.stringify([]));
  // Benjamin registers as a Seniors PLAYER first (real claim path).
  const admin = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const link = await inviteApi({ group: true, playerGroupId: SEN, scope: { groupId: SEN } }, admin.token);
  const claim = await store.claimInvite({ token: link.body.token, name: 'Benjamin Rossignol',
    email: 'benjamin@club.test', password: 'benExisting12' });
  return { admin, benjamin: claim };
}
async function inviteApi(body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body, on() {} }, res);
  return res;
}
const staffInviteBody = { name: 'Benjamin Rossignol', email: 'benjamin@club.test',
  role: 'coach', staffLevel: 'assistant', scope: { level: 'group', groupId: U18 } };
const membersNow = () => JSON.parse(kv.get('app:identity:team_members'));
const usersNow = () => JSON.parse(kv.get('app:identity:users'));

// ── 1-9: the whole upgrade, end to end ────────────────────────────────────
test('an existing Seniors player claims a U18 staff invite onto the SAME account', async () => {
  const { admin, benjamin } = await seedWithBenjamin();
  const usersBefore = usersNow().length;
  const inv = await inviteApi(staffInviteBody, admin.token);
  assert.equal([200, 201].includes(inv.code), true, JSON.stringify(inv.body));
  const token = inv.body.invite?.token || inv.body.token;

  // 1+10 setup: correct EXISTING password claims; (wrong password tested below).
  const upgraded = await store.claimInvite({ token, name: 'Benjamin Rossignol',
    email: 'benjamin@club.test', password: 'benExisting12' });

  // 2+7(no dup): same user, same member row.
  assert.equal(upgraded.user.id, benjamin.user.id, 'same account reused');
  assert.equal(usersNow().length, usersBefore, 'no second user created');
  const rows = membersNow().filter(m => m.teamId === CLUB && m.userId === benjamin.user.id);
  assert.equal(rows.length, 1, 'one membership, upgraded in place');
  const m = rows[0];

  // 3-4: player side preserved.
  assert.equal(m.playerGroupId, SEN, 'playerGroupId stays Seniors');
  assert.equal(resolvePlayerGroup(m, STRUCTURE).groupId, SEN);
  assert.deepEqual(resolveEligibility(m, STRUCTURE).teamIds.sort(), ['team_dev', 'team_prem'],
    'Seniors eligibility intact');

  // 5-7: staff side added — U18 only, coach permissions live.
  assert.equal(m.role, 'coach', 'role upgraded');
  const scope = effectiveAccessScope(m);
  assert.deepEqual(scope.groups.filter(g => g.status === 'active').map(g => g.groupId), [U18],
    'accessScope = U18 exactly (never the legacy Seniors derivation)');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);
  const perms = permissionsFor(m);
  for (const p of [PERM.MANAGE_PLAYERS, PERM.PUBLISH_SQUADS, PERM.REPORTS]) {
    assert.equal(perms.has(p), true, `coach permission ${p}`);
  }

  // 6: the session payload exposes both capacities immediately.
  const fresh = await store.createSession({ userId: benjamin.user.id, teamId: CLUB, role: 'coach' });
  const ctx = await store.resolveSessionFromRequest({ headers: { cookie: `ce_session=${fresh.token}` } });
  assert.deepEqual(ctx.operational.staff.groups.map(g => g.id), [U18]);
  assert.deepEqual(ctx.operational.player.groups.map(g => g.id), [SEN]);

  // 8-9: isolation.
  assert.notEqual(resolvePlayerGroup(m, STRUCTURE).groupId, U18, 'not a U18 player');
  assert.equal(scope.clubWide, false, 'not club-wide');
  assert.equal(scope.groups.some(g => g.groupId === WOM), false, 'no Women\'s');
});

// ── 10: the account-takeover guard stands ─────────────────────────────────
test('a wrong existing password is refused — the guard is not weakened', async () => {
  const { admin } = await seedWithBenjamin();
  const inv = await inviteApi(staffInviteBody, admin.token);
  const token = inv.body.invite?.token || inv.body.token;
  await assert.rejects(
    store.claimInvite({ token, name: 'Benjamin Rossignol',
      email: 'benjamin@club.test', password: 'wrongPassword99' }),
    err => { assert.equal(err.status, 403); return true; });
  const m = membersNow().find(x => x.teamId === CLUB && x.role !== 'coach' || false);
  assert.ok(membersNow().filter(x => x.teamId === CLUB).every(x => x.userId !== undefined), 'nothing corrupted');
});

// ── 11: a brand-new staff claimer still works ─────────────────────────────
test('a fresh new staff user claims a scoped invite normally', async () => {
  const { admin } = await seedWithBenjamin();
  const inv = await inviteApi({ ...staffInviteBody, name: 'Brand New Coach', email: 'newcoach@club.test' }, admin.token);
  const token = inv.body.invite?.token || inv.body.token;
  const claim = await store.claimInvite({ token, name: 'Brand New Coach',
    email: 'newcoach@club.test', password: 'freshPassword12' });
  assert.equal(claim.teamMember.role, 'coach');
  assert.equal(claim.teamMember.playerGroupId, undefined, 'staff-only — no playing group invented');
  assert.deepEqual(effectiveAccessScope(claim.teamMember).groups.map(g => g.groupId), [U18]);
});

// ── 12: repeat claim is idempotent ────────────────────────────────────────
test('re-claiming (double submit) never duplicates membership or widens scope', async () => {
  const { admin, benjamin } = await seedWithBenjamin();
  const inv = await inviteApi(staffInviteBody, admin.token);
  const token = inv.body.invite?.token || inv.body.token;
  await store.claimInvite({ token, name: 'Benjamin Rossignol', email: 'benjamin@club.test', password: 'benExisting12' });
  // Single-use invite: a second submit is refused as already claimed —
  // and even that refusal changes nothing about the membership.
  await assert.rejects(
    store.claimInvite({ token, name: 'Benjamin Rossignol', email: 'benjamin@club.test', password: 'benExisting12' }),
    err => { assert.equal(err.status, 409); return true; });
  const rows = membersNow().filter(m => m.teamId === CLUB && m.userId === benjamin.user.id);
  assert.equal(rows.length, 1);
  assert.deepEqual(effectiveAccessScope(rows[0]).groups.map(g => g.groupId), [U18]);
});

// ── 13: another club's invite cannot touch the Boitsfort membership ───────
test('a foreign club\'s staff invite never alters the Boitsfort member', async () => {
  const { benjamin } = await seedWithBenjamin();
  const before = JSON.stringify(membersNow().find(m => m.teamId === CLUB && m.userId === benjamin.user.id));
  const other = await store.createSession({ userId: 'u-otheradmin', teamId: OTHER, role: 'coach' });
  const inv = await inviteApi({ name: 'Benjamin Rossignol', email: 'benjamin@club.test',
    role: 'coach', staffLevel: 'assistant', scope: { level: 'group', groupId: 'grp_o' } }, other.token);
  const token = inv.body.invite?.token || inv.body.token;
  await store.claimInvite({ token, name: 'Benjamin Rossignol',
    email: 'benjamin@club.test', password: 'benExisting12' });
  const after = JSON.stringify(membersNow().find(m => m.teamId === CLUB && m.userId === benjamin.user.id));
  assert.equal(after, before, 'the Boitsfort membership is byte-identical');
  const otherRows = membersNow().filter(m => m.teamId === OTHER && m.userId === benjamin.user.id);
  assert.equal(otherRows.length, 1, 'the foreign membership lives in the foreign club only');
});

// ── the UI: existing-account wording exists and flips on 403 ──────────────
test('the invite modal offers the existing-account path and switches to sign-in wording on 403', () => {
  assert.match(src, /Already have a CoachEasier account\? Use its email and your <strong>existing<\/strong> password/,
    'up-front existing-account guidance');
  assert.match(src, /New password — or your existing one/, 'password field admits both paths');
  assert.match(src, /Sign in to add this access/, 'post-403 title');
  assert.match(src, /Sign in &amp; add access/, 'post-403 button');
  assert.equal(src.includes('>Create account &amp; join →</button>'), false,
    'the misleading create-only button copy is gone');
});
