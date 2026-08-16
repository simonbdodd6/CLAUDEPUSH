/**
 * DUAL-ROLE: SENIORS PLAYER + U18 COACH.
 *
 *  Production forensics (read-only): the affected coach holds ONE member row
 *  — role coach (assistant), playerGroupId grp_initial (plays Seniors),
 *  accessScope NULL. A null staff scope derives the legacy initial-group
 *  standing, so he operates SENIORS as staff and U18 never appears in his
 *  selector. The MODEL is sound: with accessScope naming U18 the same row
 *  resolves exactly right (plays Seniors, coaches U18, nothing else). The
 *  repair is the existing admin grant (Members → tick U18), proven here
 *  through the real set_member_access handler.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.dual-coach.test';
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
const store = await import('../api/_identityStore.js');
const { resolvePlayerGroup, resolveEligibility, effectiveAccessScope, operationalGroupsFor,
  assertOperationalGroup } = await import('../api/_accessScope.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

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

// The exact production shapes.
const LOUIS_TODAY = { id: 'm-louis', teamId: CLUB, userId: 'u-louis', role: 'coach',
  staffLevel: 'assistant', status: 'active', playerGroupId: SEN };
const LOUIS_FIXED = { ...LOUIS_TODAY,
  accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } };
const PLAIN_PLAYER = { id: 'm-p', teamId: CLUB, userId: 'u-p', role: 'player', status: 'active', playerGroupId: SEN };
const U18_COACH = { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant',
  status: 'active', accessProfile: 'coach', accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } };

function seed(members) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-louis', email: 'l@c.test', displayName: 'Louis' },
    { id: 'u-p', email: 'p@c.test', displayName: 'Plain Player' },
    { id: 'u-u18c', email: 'u@c.test', displayName: 'U18 Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    ...members,
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
}

// ── 1 + 9: single-role members resolve exactly as before ──────────────────
test('a Seniors-only player: plays Seniors, holds ZERO staff permissions', () => {
  assert.equal(resolvePlayerGroup(PLAIN_PLAYER, STRUCTURE).groupId, SEN);
  assert.deepEqual(resolveEligibility(PLAIN_PLAYER, STRUCTURE).teamIds.sort(), ['team_dev', 'team_prem']);
  const perms = permissionsFor(PLAIN_PLAYER);
  for (const p of [PERM.MANAGE_PLAYERS, PERM.PUBLISH_SQUADS, PERM.REPORTS, PERM.MANAGE_TEAMS]) {
    assert.equal(perms.has(p), false, `player must not hold ${p}`);
  }
});

test('a U18-only scoped coach operates U18 and nothing else', () => {
  assert.deepEqual(operationalGroupsFor(U18_COACH, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);
  assert.equal(resolvePlayerGroup(U18_COACH, STRUCTURE).groupId, '', 'not a player anywhere');
});

// ── the root cause, pinned ────────────────────────────────────────────────
test('ROOT CAUSE: the null-scope shape derives SENIORS staff standing — U18 never appears', () => {
  assert.deepEqual(operationalGroupsFor(LOUIS_TODAY, STRUCTURE, { as: 'staff' }).map(g => g.id), [SEN],
    'today he operates Seniors as staff, not U18');
  assert.throws(() => assertOperationalGroup({ user: { id: 'u-louis' }, teamMember: LOUIS_TODAY }, STRUCTURE, U18, { as: 'staff' }),
    'asking for U18 as staff is refused with the null scope');
});

// ── 3-6: the FIXED dual shape resolves both sides correctly ───────────────
test('dual-role fixed: plays Seniors, coaches U18, no Women\'s, not club-wide, not a U18 player', () => {
  // PLAYER side intact.
  assert.equal(resolvePlayerGroup(LOUIS_FIXED, STRUCTURE).groupId, SEN, 'playerGroupId remains Seniors');
  assert.deepEqual(resolveEligibility(LOUIS_FIXED, STRUCTURE).teamIds.sort(), ['team_dev', 'team_prem'],
    'still eligible for the Seniors teams');
  assert.deepEqual(operationalGroupsFor(LOUIS_FIXED, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN]);
  // STAFF side: U18 only.
  assert.deepEqual(operationalGroupsFor(LOUIS_FIXED, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);
  assert.doesNotThrow(() => assertOperationalGroup({ user: { id: 'u-louis' }, teamMember: LOUIS_FIXED }, STRUCTURE, U18, { as: 'staff' }));
  // Coach permissions apply (assistant staff level).
  const perms = permissionsFor(LOUIS_FIXED);
  for (const p of [PERM.MANAGE_PLAYERS, PERM.PUBLISH_SQUADS, PERM.REPORTS]) {
    assert.equal(perms.has(p), true, `coach permission ${p}`);
  }
  // ISOLATION.
  assert.notEqual(resolvePlayerGroup(LOUIS_FIXED, STRUCTURE).groupId, U18, 'never becomes a U18 player');
  assert.equal(effectiveAccessScope(LOUIS_FIXED).clubWide, false, 'never club-wide');
  assert.throws(() => assertOperationalGroup({ user: { id: 'u-louis' }, teamMember: LOUIS_FIXED }, STRUCTURE, WOM, { as: 'staff' }),
    "Women's stays refused");
});

// ── 7-8: the session payload carries BOTH capacities, and survives re-login ─
test('the session payload preserves both sides across logins', async () => {
  seed([LOUIS_FIXED]);
  for (let round = 0; round < 2; round++) {           // login, then "reload"
    const { token } = await store.createSession({ userId: 'u-louis', teamId: CLUB, role: 'coach' });
    const ctx = await store.resolveSessionFromRequest({ headers: { cookie: `ce_session=${token}` } });
    assert.deepEqual(ctx.operational.staff.groups.map(g => g.id), [U18], `round ${round}: staff side`);
    assert.deepEqual(ctx.operational.player.groups.map(g => g.id), [SEN], `round ${round}: player side`);
    assert.equal(ctx.teamMember.playerGroupId, SEN);
  }
});

// ── the PRODUCTION REPAIR, proven through the real admin handler ──────────
test('the existing admin grant transforms today\'s shape into the fixed one', async () => {
  seed([{ ...LOUIS_TODAY }]);
  const { token } = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body: { action: 'set_member_access', memberId: 'm-louis',
      accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } }, on() {} }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const saved = JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === 'm-louis');
  assert.equal(saved.playerGroupId, SEN, 'the player side is untouched by the staff grant');
  assert.deepEqual(operationalGroupsFor(saved, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18],
    'he now coaches U18');
  assert.deepEqual(resolveEligibility(saved, STRUCTURE).teamIds.sort(), ['team_dev', 'team_prem'],
    'Seniors eligibility survives');
});
