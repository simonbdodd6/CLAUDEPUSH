/**
 * COACHING ACCESS ON MEMBER PROFILES.
 *
 *  A club-wide admin grants scoped coaching to an EXISTING member straight
 *  from their profile — "Coaching access" checkboxes per active group — via
 *  the existing set_member_access contract (role + accessScope in one call).
 *  The end state is identical to the scoped staff-invite upgrade: same
 *  account, playerGroupId untouched, accessScope = exactly the ticked
 *  groups. Boxes start unticked for players (no phantom derived ticks),
 *  and only club-wide admins can mutate — server-authoritative.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.coaching-access.test';
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

const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { resolvePlayerGroup, resolveEligibility, effectiveAccessScope, operationalGroupsFor } =
  await import('../api/_accessScope.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
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
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-scoped', email: 'sc@c.test', displayName: 'Scoped Coach' },
    { id: 'u-ben', email: 'ben@c.test', displayName: 'Benjamin' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-scoped', teamId: CLUB, userId: 'u-scoped', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
    { id: 'm-ben', teamId: CLUB, userId: 'u-ben', role: 'player', status: 'active', playerGroupId: SEN },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('ce:invites', JSON.stringify([]));
}
async function setAccess(body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: token ? `ce_session=${token}` : '', host: 'test.local' },
    body: { action: 'set_member_access', ...body }, on() {} }, res);
  return res;
}
const sessionFor = (userId, role = 'coach') => store.createSession({ userId, teamId: CLUB, role });
const benNow = () => JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === 'm-ben');
// The exact payload the new profile checkbox sends for a player's first grant.
const grantU18 = { memberId: 'm-ben', role: 'coach', staffLevel: 'assistant', accessScope: scope([U18]) };

// ── 1 + 13 + 14: who sees/uses the controls ───────────────────────────────
test('the Coaching access section renders for club-wide admins and mutates via set_member_access only', () => {
  assert.match(src, />Coaching access</, 'the section exists on player profiles');
  assert.match(src, /adminGrantPlayerCoaching\(/, 'checkbox wiring');
  const fnStart = src.indexOf('async function adminGrantPlayerCoaching');
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.match(fnBody, /action: 'set_member_access'/, 'existing contract, no new permission system');
  assert.match(fnBody, /staffLevel: member\.staffLevel \|\| 'assistant'/, 'never silently head');
  assert.match(src, /canGrantCoaching = canI\('assign_access'\)/, 'client gate: assign_access + club-wide standing');
  assert.match(src, /checked: false,\s*\n\s*main: `Can coach/, 'player boxes start UNTICKED — no derived phantom ticks');
});

test('a group-scoped coach and a player are refused server-side', async () => {
  seed();
  const scoped = await sessionFor('u-scoped');
  assert.equal((await setAccess(grantU18, scoped.token)).code, 403, 'scoped coach refused');
  const player = await sessionFor('u-ben', 'player');
  assert.equal([401, 403].includes((await setAccess(grantU18, player.token)).code), true, 'player refused');
  assert.equal(benNow().role, 'player', 'nothing changed');
});

// ── 2-10: the grant — Benjamin before/after ───────────────────────────────
test('ticking U18 upgrades the SAME member: plays Seniors, coaches U18 only', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  const r = await setAccess(grantU18, admin.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const m = benNow();
  assert.equal(m.userId, 'u-ben', 'same member row, same user');
  assert.equal(JSON.parse(kv.get('app:identity:team_members')).filter(x => x.userId === 'u-ben').length, 1, 'no duplicate');
  assert.equal(m.playerGroupId, SEN, 'playerGroupId untouched');
  assert.deepEqual(resolveEligibility(m, STRUCTURE).teamIds.sort(), ['team_dev', 'team_prem'], 'Seniors eligibility intact');
  assert.equal(m.role, 'coach');
  assert.equal(m.staffLevel, 'assistant');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18], 'staff ops U18 only');
  const perms = permissionsFor(m);
  assert.equal(perms.has(PERM.MANAGE_PLAYERS), true, 'coach permissions live');
  assert.notEqual(resolvePlayerGroup(m, STRUCTURE).groupId, U18, 'not a U18 player');
  const sc = effectiveAccessScope(m);
  assert.equal(sc.clubWide, false, 'not club-wide');
  assert.equal(sc.groups.some(g => g.groupId === WOM), false, "no Women's");
});

// ── 11: unticking U18 removes coaching, never the player side ─────────────
test('unticking U18 (remove_member_scope) strips coaching and leaves the Seniors player intact', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  await setAccess(grantU18, admin.token);
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${admin.token}`, host: 'test.local' },
    body: { action: 'remove_member_scope', memberId: 'm-ben', groupId: U18 }, on() {} }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const m = benNow();
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id), [],
    'zero coaching groups — the stored EMPTY scope never falls back to legacy derivation');
  assert.equal(m.playerGroupId, SEN, 'still a Seniors player');
  assert.deepEqual(resolveEligibility(m, STRUCTURE).teamIds.sort(), ['team_dev', 'team_prem']);
});

// ── 12: U18 + Women's grants exactly those two ────────────────────────────
test("ticking U18 and Women's grants exactly those coaching groups — never a playing spot", async () => {
  seed();
  const admin = await sessionFor('u-simon');
  await setAccess(grantU18, admin.token);
  await setAccess({ memberId: 'm-ben', accessScope: scope([U18, WOM]) }, admin.token);
  const m = benNow();
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id).sort(), [U18, WOM].sort());
  assert.equal(m.playerGroupId, SEN, 'still plays Seniors only');
  assert.notEqual(resolvePlayerGroup(m, STRUCTURE).groupId, WOM);
});

// ── 15: the staff-invite path yields the identical end state ──────────────
test('profile grant and staff-invite upgrade produce the SAME shape', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  await setAccess(grantU18, admin.token);
  const viaProfile = { role: benNow().role, pg: benNow().playerGroupId,
    groups: effectiveAccessScope(benNow()).groups.filter(g => g.status === 'active').map(g => g.groupId) };

  seed();
  const admin2 = await sessionFor('u-simon');
  const invRes = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${admin2.token}`, host: 'test.local' },
    body: { name: 'Benjamin', email: 'ben@c.test', role: 'coach', staffLevel: 'assistant',
      scope: { level: 'group', groupId: U18 } }, on() {} }, invRes);
  // Benjamin needs a password for the claim path.
  const users = JSON.parse(kv.get('app:identity:users'));
  const claimToken = invRes.body.invite?.token || invRes.body.token;
  await store.claimInvite({ token: claimToken, name: 'Benjamin', email: 'ben@c.test', password: 'freshPassword12' });
  const viaInvite = { role: benNow().role, pg: benNow().playerGroupId,
    groups: effectiveAccessScope(benNow()).groups.filter(g => g.status === 'active').map(g => g.groupId) };
  assert.deepEqual(viaProfile, viaInvite, 'both admin flows converge on one safe shape');
});

// ── 16: login/reload preserves both capacities ────────────────────────────
test('the session payload carries both capacities after the profile grant, across logins', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  await setAccess(grantU18, admin.token);
  for (let round = 0; round < 2; round++) {
    const s = await store.createSession({ userId: 'u-ben', teamId: CLUB, role: 'coach' });
    const ctx = await store.resolveSessionFromRequest({ headers: { cookie: `ce_session=${s.token}` } });
    assert.deepEqual(ctx.operational.staff.groups.map(g => g.id), [U18], `round ${round}`);
    assert.deepEqual(ctx.operational.player.groups.map(g => g.id), [SEN], `round ${round}`);
  }
});
