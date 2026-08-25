/**
 * GIVING AN EXISTING MEMBER PLAYER CAPACITY — without deleting or reinviting.
 *
 * The identity model already answers this: where a person PLAYS is
 * `member.playerGroupId`, read through isPlayingMember(). A club physio who
 * also plays is ONE membership carrying role 'medical', medicalAccess true and
 * a playerGroupId. Nothing new is invented here — no isPlayer, no
 * playerAccess, no second membership.
 *
 * What was missing was the ROUTE and the CONTROL. `setPlayerGroup` existed in
 * the store but no API action called it and no screen offered it, so the only
 * way a member ever acquired a player group was by claiming a fresh invite.
 * These tests pin the assignment path end to end, and pin just as hard what it
 * must NOT do: it grants a capacity, never a permission.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.player-assign.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const store = await import('../api/_identityStore.js');
const scope = await import('../api/_accessScope.js');
const { permissionsFor, canonicalRole, PERM } = await import('../api/_permissions.js');
const { default: identityHandler } = await import('../api/identity.js');

const CLUB = 'club-a', OTHER = 'club-b', SEN = 'grp-sen', U18 = 'grp-u18', OLD = 'grp-vets';
const STRUCTURE = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', status: 'active' },
           { id: U18, name: 'U18', status: 'active' },
           { id: OLD, name: 'Veterans', status: 'archived' }],
  teams:  [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
           { id: 't-dev',  groupId: SEN, name: 'Premier Development', status: 'active' },
           { id: 't-u18',  groupId: U18, name: 'U18', status: 'active' }],
};
/** The club next door — its group ids must never be assignable here. */
const OTHER_STRUCTURE = {
  version: 1,
  groups: [{ id: 'grp-foreign', name: 'Their Seniors', status: 'active' }],
  teams:  [{ id: 't-foreign', groupId: 'grp-foreign', name: 'Their Premier', status: 'active' }],
};

/** The real-world starting point: an existing Medical member, already active. */
const MEDICAL = { id: 'tm-med', teamId: CLUB, userId: 'user_med', role: 'medical',
                  status: 'active', medicalAccess: true,
                  joinedAt: '2026-01-05T10:00:00.000Z', approvedAt: '2026-01-05T10:00:00.000Z' };
const ADMIN   = { id: 'tm-admin', teamId: CLUB, userId: 'user_admin', role: 'admin',
                  status: 'active', isOwner: true };
const PLAYER  = { id: 'tm-play', teamId: CLUB, userId: 'user_play', role: 'player',
                  status: 'active', playerGroupId: SEN };
const COACH   = { id: 'tm-coach', teamId: CLUB, userId: 'user_coach', role: 'coach',
                  status: 'active', staffLevel: 'head',
                  accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } };

function seed(members = [MEDICAL, ADMIN]) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Club A', teamCode: 'AAA111' },
    { id: OTHER, name: 'Club B', teamCode: 'BBB222' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify(OTHER_STRUCTURE));
  kv.set('app:identity:users', JSON.stringify(members.map(m => ({
    id: m.userId, email: `${m.userId}@x.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(members));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
}
const members  = () => JSON.parse(kv.get('app:identity:team_members'));
const profiles = () => JSON.parse(kv.get('app:identity:player_profiles') || '[]');
const M = id => members().find(m => m.id === id);

/** Drive the REAL route, with a REAL session minted for `actor`. */
async function call(body, actorId = 'user_admin') {
  const actor = members().find(m => m.userId === actorId);
  const { token } = await store.createSession({
    userId: actorId, teamId: actor?.teamId || CLUB, role: actor?.role || 'player' });
  const req = { method: 'POST', body, headers: { cookie: `ce_session=${token}` },
                query: {}, socket: { remoteAddress: '127.0.0.1' } };
  let status = 200, payload = null;
  const res = { status(s) { status = s; return this; }, json(p) { payload = p; return this; },
                setHeader() {}, end() {} };
  await identityHandler(req, res);
  return { status, payload };
}

// ════ 1-2 — THE CAPACITY QUESTION ══════════════════════════════════════════

test('1: a Medical member with NO player group is NOT a player', () => {
  const m = { ...MEDICAL };
  assert.equal(scope.isPlayingMember(m), false, 'medical role alone never implies playing');
  assert.equal(scope.playerGroupIdOf(m), '');
  assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'player' }), []);
  assert.deepEqual(scope.eligibleTeams(m, STRUCTURE), []);
});

test('2: the SAME membership plus a player group IS a player', () => {
  const m = { ...MEDICAL, playerGroupId: SEN };
  assert.equal(scope.isPlayingMember(m), true);
  assert.equal(canonicalRole(m), 'medical', 'and is still Medical');
  assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN]);
  assert.deepEqual(scope.eligibleTeams(m, STRUCTURE).map(t => t.name),
    ['Premier', 'Premier Development'],
    'team eligibility is DERIVED from the group — there is no separate team to assign');
});

// ════ 3-6 — THE ASSIGNMENT PATH ════════════════════════════════════════════

test('3: assigning a group keeps Medical access and every other field', async () => {
  seed();
  const before = M('tm-med');
  const { status, payload } = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  assert.equal(status, 200, payload?.error);
  const after = M('tm-med');

  assert.equal(after.playerGroupId, SEN, 'player capacity added');
  assert.equal(after.medicalAccess, true, 'Medical access PRESERVED');
  assert.equal(after.role, 'medical', 'still Medical');
  assert.equal(after.status, 'active');
  assert.equal(after.joinedAt, before.joinedAt, 'history preserved');
  assert.equal(after.userId, before.userId, 'same user');
  assert.equal(after.id, before.id, 'same membership');
  assert.equal(permissionsFor(after).has(PERM.MEDICAL_ACCESS), true, 'medical permission intact');
});

test('4: the player profile belongs to the SAME membership and user', async () => {
  seed();
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  const mine = profiles().filter(p => p.userId === 'user_med');
  assert.equal(mine.length, 1, 'exactly one player profile, created for them');
  assert.equal(mine[0].teamMemberId, 'tm-med', 'bound to the existing membership');
  assert.equal(mine[0].teamId, CLUB);
  assert.equal(mine[0].userId, 'user_med', 'the same account — no new identity');
});

test('5: no duplicate membership or account is ever created', async () => {
  seed();
  const beforeMembers = members().length, beforeUsers = JSON.parse(kv.get('app:identity:users')).length;
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });   // idempotent
  assert.equal(members().length, beforeMembers, 'membership count unchanged');
  assert.equal(JSON.parse(kv.get('app:identity:users')).length, beforeUsers, 'user count unchanged');
  assert.equal(members().filter(m => m.userId === 'user_med').length, 1, 'one membership only');
  assert.equal(profiles().filter(p => p.userId === 'user_med').length, 1, 'one profile only');
});

test('6: clearing the group removes PLAYER capacity but never Medical access', async () => {
  seed();
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  const { status } = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: '' });
  assert.equal(status, 200);
  const after = M('tm-med');
  assert.equal(scope.isPlayingMember(after), false, 'no longer a playing member');
  assert.equal(after.playerGroupId, undefined, 'the field is cleared, not blanked to a group');
  assert.equal(after.medicalAccess, true, 'MEDICAL ACCESS SURVIVES');
  assert.equal(after.role, 'medical');
  assert.equal(permissionsFor(after).has(PERM.MEDICAL_ACCESS), true);
  assert.equal(profiles().filter(p => p.userId === 'user_med').length, 1,
    'their player profile is KEPT — it carries history and is never destroyed');
});

// ════ 7-8 — NOTHING ELSE MOVES ═════════════════════════════════════════════

test('7: a normal player is unchanged by all of this', async () => {
  seed([MEDICAL, ADMIN, PLAYER]);
  const before = M('tm-play');
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  assert.deepEqual(M('tm-play'), before, 'the ordinary player record is untouched');
  assert.equal(scope.isPlayingMember(M('tm-play')), true);
});

test('8: Medical-only staff elsewhere in the club stay Medical-only', async () => {
  const other = { id: 'tm-phys', teamId: CLUB, userId: 'user_phys', role: 'medical',
                  status: 'active', medicalAccess: true };
  seed([MEDICAL, ADMIN, other]);
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  const untouched = M('tm-phys');
  assert.equal(scope.isPlayingMember(untouched), false, 'granting one member never grants another');
  assert.equal(untouched.playerGroupId, undefined);
  assert.equal(untouched.medicalAccess, true);
});

// ════ 9-10 — A CAPACITY, NEVER A PERMISSION ════════════════════════════════

test('9: player capacity does NOT make a Medical member a coach', () => {
  const m = { ...MEDICAL, playerGroupId: SEN };
  // Server: no staff group at all, so no operational staff context.
  assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'staff' }), [],
    'medical + playing grants no coaching scope');
  // Client: the released capacity rule keeps them out of the coach shell.
  const build = new Function('currentUser', '_myMembership', `
    ${fnOf('membershipPlays')} ${fnOf('landingViewFor')} ${fnOf('isCoach')}
    return { isCoach, landingViewFor };`);
  const client = build(() => ({ role: 'medical' }), m);
  assert.equal(client.isCoach(), false, 'not a coach');
  assert.equal(client.landingViewFor('medical', m), 'player', 'lands in the player portal');
});

test('10: player capacity grants NO coaching or admin permission', async () => {
  seed();
  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  const granted = permissionsFor(M('tm-med'));
  const before = permissionsFor({ ...MEDICAL });
  assert.deepEqual([...granted].sort(), [...before].sort(),
    'the permission set is byte-identical before and after — a capacity, not a grant');
  for (const p of [PERM.MANAGE_PLAYERS, PERM.MANAGE_TEAMS, PERM.MANAGE_COACHES,
                   PERM.ASSIGN_ACCESS, PERM.PUBLISH_SQUADS, PERM.PUBLISH_TRAINING,
                   PERM.DANGER_ZONE, PERM.PLAYER_DELETE, PERM.FINANCIAL]) {
    assert.equal(granted.has(p), false, `must not gain ${p}`);
  }
});

// ════ 11-12 — ISOLATION ════════════════════════════════════════════════════

test('11: another club\'s group can never be assigned, and neither can a foreign member', async () => {
  seed();
  const foreign = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: 'grp-foreign' });
  assert.equal(foreign.status, 404, 'the neighbouring club\'s group is simply unknown here');
  assert.equal(M('tm-med').playerGroupId, undefined, 'nothing was written');

  const bogus = await call({ action: 'set_player_group', memberId: 'tm-nonexistent', groupId: SEN });
  assert.ok(bogus.status >= 400, 'an unknown member is refused');
});

test('11b: an administrator cannot reach INTO another club\'s membership', async () => {
  // The neighbouring club's member, sitting in the same global members list —
  // separated only by teamId. An admin of club A must not be able to name
  // their id and write to it.
  const FOREIGN = { id: 'tm-foreign', teamId: OTHER, userId: 'user_foreign',
                    role: 'medical', status: 'active', medicalAccess: true };
  seed([MEDICAL, ADMIN, FOREIGN]);
  const { status } = await call(
    { action: 'set_player_group', memberId: 'tm-foreign', groupId: SEN }, 'user_admin');
  assert.equal(status, 403, 'refused at the tenant boundary');
  const after = members().find(m => m.id === 'tm-foreign');
  assert.equal(after.playerGroupId, undefined, 'the other club\'s member is untouched');
  assert.equal(after.teamId, OTHER, 'and was not moved');
  assert.equal(profiles().filter(p => p.userId === 'user_foreign').length, 0,
    'no profile was created in the other club');
});

test('12: an archived group is refused, and group scope is not widened', async () => {
  seed();
  const archived = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: OLD });
  assert.equal(archived.status, 400, 'archived groups cannot take players');
  assert.equal(M('tm-med').playerGroupId, undefined);

  await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN });
  const m = M('tm-med');
  assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN],
    'exactly one group — the one assigned');
  assert.throws(() => scope.assertOperationalGroup(
    { user: { id: 'user_med' }, teamMember: m }, STRUCTURE, U18, { as: 'player' }),
    /Not authorized/, 'they cannot reach another group');
});

// ════ AUTHORIZATION ════════════════════════════════════════════════════════

test('13: only a club-wide administrator may assign player capacity', async () => {
  seed([MEDICAL, ADMIN, COACH, PLAYER]);
  // The Medical member cannot give it to themselves.
  const self = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN }, 'user_med');
  assert.equal(self.status, 403, 'a Medical member cannot self-assign player capacity');
  assert.equal(M('tm-med').playerGroupId, undefined);

  // A group-scoped head coach is not a club-wide administrator.
  const coach = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN }, 'user_coach');
  assert.equal(coach.status, 403, 'a scoped coach is refused');
  assert.equal(M('tm-med').playerGroupId, undefined);

  // An ordinary player certainly cannot.
  const player = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN }, 'user_play');
  assert.equal(player.status, 403);

  // The club owner can.
  const owner = await call({ action: 'set_player_group', memberId: 'tm-med', groupId: SEN }, 'user_admin');
  assert.equal(owner.status, 200);
  assert.equal(M('tm-med').playerGroupId, SEN);
});

test('14: an anonymous caller is refused before anything is read', async () => {
  seed();
  const req = { method: 'POST', body: { action: 'set_player_group', memberId: 'tm-med', groupId: SEN },
                headers: {}, query: {}, socket: { remoteAddress: '1.2.3.4' } };
  let status = 200;
  const res = { status(s) { status = s; return this; }, json() { return this; }, setHeader() {}, end() {} };
  await identityHandler(req, res);
  assert.ok(status === 401 || status === 403, `anonymous refused, got ${status}`);
  assert.equal(M('tm-med').playerGroupId, undefined);
});

// ════ THE ADMINISTRATOR'S CONTROL ══════════════════════════════════════════

const stripComments = code => code
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function fnOf(name) {
  const m = src.match(new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`));
  assert.ok(m, `client function ${name} exists`);
  const start = src.indexOf(m[0]);
  let d = 0, pe = start;
  for (let b = src.indexOf('(', start); b < src.length; b++) {
    if (src[b] === '(') d++; else if (src[b] === ')') { d--; if (!d) { pe = b; break; } } }
  let e = src.indexOf('{', pe); d = 0;
  for (let b = e; b < src.length; b++) {
    if (src[b] === '{') d++; else if (src[b] === '}') { d--; if (!d) { e = b; break; } } }
  return src.slice(start, e + 1);
}

test('15: the Members screen offers the control, and it sends the real action', () => {
  const handler = stripComments(fnOf('adminSetPlayerGroup'));
  assert.match(handler, /action: 'set_player_group'/, 'calls the new action');
  assert.match(handler, /memberId/);
  assert.match(handler, /groupId/);

  const panel = stripComments(fnOf('renderScopeSection'));
  assert.match(panel, /\$\{playerGroupBlock\(member, name, activeGroups\)\}/,
    'the member panel renders the playing-group control');

  const block = stripComments(fnOf('playerGroupBlock'));
  assert.match(block, /adminSetPlayerGroup\(/, 'the control is wired to the action');
  // Options come from the CLUB STRUCTURE that was passed in — never typed,
  // never guessed, and never another club's ids.
  assert.match(block, /activeGroups\.map\(/, 'options are the club\'s own active groups');
  assert.match(block, /member\.playerGroupId/, 'it reflects the stored value');
  assert.match(block, /Not a playing member/, 'and offers withdrawal as well as assignment');

  // "Can be picked for" must follow the CAPACITY, so a playing medic appears.
  const elig = stripComments(fnOf('renderEligibilitySection'));
  assert.match(elig, /membershipPlays\(member\)/, 'squad eligibility follows the capacity');
  assert.doesNotMatch(elig, /member\.role \|\| ''\)\.toLowerCase\(\) !== 'player'/,
    'not the role name');
});

test('16: the control is gated on the same permission the server enforces', () => {
  const panel = stripComments(fnOf('renderScopeSection'));
  assert.match(panel, /canI\('assign_access'\)/,
    'the section is only rendered for access administrators');
});
