/**
 * ROSTER SYNC HARDENING — canonical membership and the roster projection
 * cannot drift indefinitely.
 *
 * THE INVARIANT: every ACTIVE membership that PLAYS and resolves to a live
 * group has a roster row — created server-side at the boundary where the
 * membership changed (invite claim, join approval, restore, group
 * assignment) and healed at every roster write. Its corollaries:
 *
 *   INTENT vs OMISSION — removing a player is a MEMBERSHIP action. A roster
 *   payload that merely omits an active player's row is a stale device echo
 *   and never deletes it; once the membership is archived/removed the row
 *   drops exactly as before and is never resurrected.
 *
 *   UNASSIGNED — a multi-group member with no resolvable group gets NO
 *   fabricated row (the model refuses to guess); assignment materialises it.
 *
 *   UNLINKED — trialist/CSV rows (no account) keep their old semantics:
 *   not protected, not created, not deleted by the reconciler.
 *
 * Everything here tests BEHAVIOUR through the real store functions and the
 * real publish handler; fixtures are fabricated sentinels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.rsh.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { claimInvite, approveJoinRequest, restoreTeamMember, removeTeamMember,
        setPlayerGroup, ensureRosterProjection, createSession, SESSION_COOKIE,
        DEFAULT_TEAM } = store;
const { protectCanonicalRows, reconcileMissingRows, rowMatchesMember } =
  await import('../api/_rosterProjection.js');
const { default: publishHandler } = await import('../api/publish.js');

const CLUB = 'club-rsh';
const SEN = 'grp_initial', U18 = 'grp-u18';
const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const rosterKey = `app:roster:${CLUB}`;
const j = k => JSON.parse(kv.get(k) || 'null');
const rosterRows = () => (j(rosterKey)?.players) || [];
const rowFor = uid => rosterRows().find(r => String(r.userId) === uid || String(r.id) === uid);

function seed({ members = [], users = [], profiles = [], roster = null, structure = STRUCTURE } = {}) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club RSH' }]));
  kv.set('app:identity:team_members', JSON.stringify(members));
  kv.set('app:identity:users', JSON.stringify(users));
  kv.set('app:identity:player_profiles', JSON.stringify(profiles));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  if (roster) kv.set(rosterKey, JSON.stringify({ players: roster, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'seed' }));
}
const member = (n, over = {}) => ({
  id: `m-${n}`, teamId: CLUB, userId: `u-${n}`, role: 'player', status: 'active',
  playerGroupId: SEN, ...over,
});
const user = (n, over = {}) => ({ id: `u-${n}`, email: `${n}@rsh.test`, displayName: `Player ${n}`, ...over });
const profile = (n, over = {}) => ({
  id: `pr-${n}`, teamMemberId: `m-${n}`, teamId: CLUB, userId: `u-${n}`,
  displayName: `Player ${n}`, position: 'TBC', phone: '', email: `${n}@rsh.test`,
  legacyPlayerId: `u-${n}`, createdAt: '2026-08-01T00:00:00.000Z', ...over,
});

async function coachSession(userId, over = {}) {
  const members = j('app:identity:team_members') || [];
  members.push({ id: `m-${userId}`, teamId: CLUB, userId, role: 'coach', status: 'active',
    accessProfile: 'full', isOwner: true, ...over });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const users = j('app:identity:users') || [];
  users.push({ id: userId, email: `${userId}@rsh.test`, displayName: userId });
  kv.set('app:identity:users', JSON.stringify(users));
  const s = await createSession({ userId, teamId: CLUB, role: 'coach' });
  return `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function rosterPost(cookie, players) {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'roster' }, body: { players },
    headers: { cookie } }, r);
  return r.result;
}

// ─── NEW JOINER — the projection exists the moment the membership does ──────

test('NEW JOINER — a claimed player invite creates the roster projection immediately', async () => {
  seed();
  kv.set('ce:invites', JSON.stringify([{ status: 'pending', teamId: CLUB, token: 'JoinTok000000001',
    role: 'player', name: 'Nora Newjoiner', playerGroupId: U18, createdAt: '2026-09-01T00:00:00.000Z' }]));
  const { teamMember } = await claimInvite({
    token: 'JoinTok000000001', name: 'Nora Newjoiner', email: 'nora@rsh.test', password: 'realPassword12',
  });
  const row = rowFor(teamMember.userId);
  assert.ok(row, 'roster row exists without any coach device syncing');
  assert.equal(row.id, teamMember.userId, 'row keyed by the permanent user id');
  assert.equal(row.name, 'Nora Newjoiner');
  assert.equal(row.registrationStatus, 'registered');
  assert.equal(row.position, 'TBC');
  assert.ok(!('dateOfBirth' in row) && !('parentGuardianName' in row) && !('emergencyContact' in row),
    'no sensitive fields fabricated');
});

test('NEW JOINER — the projection row is visible to the group coach through the roster GET', async () => {
  seed({ members: [member('n1', { playerGroupId: U18 })], users: [user('n1')], profiles: [profile('n1')] });
  const cookie = await coachSession('u-boss');
  await rosterPost(cookie, []);   // any organic save heals the projection
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'roster', group: U18 },
    headers: { cookie } }, r);
  assert.equal(r.result.code, 200);
  assert.deepEqual(r.result.body.players.map(p => p.name), ['Player n1']);
});

test('NEW JOINER — a staff-only claim creates no roster row', async () => {
  seed();
  kv.set('ce:invites', JSON.stringify([{ status: 'pending', teamId: CLUB, token: 'MedicTok00000001',
    role: 'medical', name: 'Club Physio', createdAt: '2026-09-01T00:00:00.000Z' }]));
  await claimInvite({ token: 'MedicTok00000001', name: 'Club Physio',
    email: 'physio@rsh.test', password: 'realPassword12' });
  assert.equal(rosterRows().length, 0, 'staff never sit in the roster');
});

test('NEW JOINER — approving a join request creates the projection', async () => {
  seed({ members: [member('jr', { status: 'pending' })], users: [user('jr')] });
  await approveJoinRequest('m-jr', 'u-approver', CLUB);
  assert.ok(rowFor('u-jr'), 'projection created at approval');
});

test('BOUNDARY — assigning a group to a group-less member materialises the row', async () => {
  // Multi-group club, no explicit group → the model refuses to guess: NO row.
  seed({ members: [member('ua', { playerGroupId: undefined })], users: [user('ua')], profiles: [] });
  await ensureRosterProjection(CLUB);
  assert.equal(rowFor('u-ua'), undefined, 'no fabricated row for an unassigned member');
  await setPlayerGroup('m-ua', U18, 'u-admin', CLUB);
  assert.ok(rowFor('u-ua'), 'assignment resolves the group and the projection follows');
});

test('BOUNDARY — restoring an archived member re-establishes the projection', async () => {
  seed({ members: [member('rx'), member('other', { userId: 'u-other', id: 'm-other' })],
         users: [user('rx'), user('other', { id: 'u-other' })],
         profiles: [profile('rx')],
         roster: [{ id: 'u-rx', userId: 'u-rx', name: 'Player rx' },
                  { id: 'u-other', userId: 'u-other', name: 'Player other' }] });
  await removeTeamMember('m-rx', 'u-someone-else', CLUB, { archive: true });
  // While archived, a save legitimately drops the row.
  const cookie = await coachSession('u-boss');
  await rosterPost(cookie, [{ id: 'u-other', userId: 'u-other', name: 'Player other' }]);
  assert.equal(rowFor('u-rx'), undefined, 'archived member row removable by omission');
  await restoreTeamMember('m-rx', 'u-someone-else', CLUB);
  assert.ok(rowFor('u-rx'), 'restore re-creates the projection');
});

// ─── IDEMPOTENCY ────────────────────────────────────────────────────────────

test('IDEMPOTENT — repeated reconciliation: one row, no churn, no writes', async () => {
  seed({ members: [member('a'), member('b', { userId: 'u-b', id: 'm-b', playerGroupId: U18 })],
         users: [user('a'), user('b', { id: 'u-b' })], profiles: [profile('a')] });
  const first = await ensureRosterProjection(CLUB);
  assert.equal(first.changed, true);
  assert.equal(first.created, 2);
  const snapshot = JSON.stringify(rosterRows());
  const second = await ensureRosterProjection(CLUB);
  assert.equal(second.changed, false, 'second run writes nothing');
  assert.equal(JSON.stringify(rosterRows()), snapshot, 'zero field churn');
  assert.equal(rosterRows().length, 2, 'no duplicates');
});

test('IDEMPOTENT — an existing row is never destructively overwritten', async () => {
  seed({ members: [member('e')], users: [user('e')], profiles: [profile('e')],
         roster: [{ id: 'u-e', userId: 'u-e', name: 'Coach-Edited Name', position: 'HOOKER',
                    phone: 'COACH-TYPED', medical: 'COACH-NOTE' }] });
  await ensureRosterProjection(CLUB);
  const row = rowFor('u-e');
  assert.equal(row.name, 'Coach-Edited Name', 'coach edits survive');
  assert.equal(row.position, 'HOOKER');
  assert.equal(row.medical, 'COACH-NOTE');
  assert.equal(rosterRows().length, 1);
});

test('RELINK — a CSV row the person grew into gains a durable userId and nothing else', async () => {
  seed({ members: [member('csv')], users: [user('csv')],
         profiles: [profile('csv', { email: 'csv@rsh.test' })],
         roster: [{ id: 'row-csv-1', name: 'Player csv', email: 'csv@rsh.test', position: 'PROP' }] });
  await ensureRosterProjection(CLUB);
  assert.equal(rosterRows().length, 1, 'no twin created — matched by email bridge');
  const row = rosterRows()[0];
  assert.equal(row.userId, 'u-csv', 'userId stamped for a durable link');
  assert.equal(row.position, 'PROP', 'nothing else touched');
  assert.equal(row.id, 'row-csv-1', 'row identity untouched');
});

test('NEVER CONFLATE — a row claimed by another account is not this member\'s row', async () => {
  seed({ members: [member('dup')], users: [user('dup')],
         profiles: [profile('dup', { displayName: 'John Smith' })],
         roster: [{ id: 'row-other', userId: 'u-entirely-different', name: 'John Smith',
                    email: 'dup@rsh.test' }] });
  await ensureRosterProjection(CLUB);
  assert.equal(rosterRows().length, 2, 'a second John Smith gets his OWN row');
  assert.equal(rowFor('u-entirely-different').id, 'row-other', 'the other account\'s row untouched');
  assert.ok(rowFor('u-dup'), 'the member has their own projection');
});

// ─── STALE WRITE / CONCURRENCY ──────────────────────────────────────────────

test('RACE — a stale club-wide snapshot cannot delete the player who joined after it', async () => {
  // T0: A exists and a coach device loads the roster. T1: B joins (active
  // membership + row). T2/T3: the stale device saves its T0 snapshot.
  seed({ members: [member('A'), member('B', { userId: 'u-B', id: 'm-B' })],
         users: [user('A'), user('B', { id: 'u-B' })],
         profiles: [profile('A'), profile('B', { id: 'pr-B', teamMemberId: 'm-B', userId: 'u-B', displayName: 'Player B' })],
         roster: [{ id: 'u-A', userId: 'u-A', name: 'Player A' },
                  { id: 'u-B', userId: 'u-B', name: 'Player B' }] });
  const cookie = await coachSession('u-boss');
  const r = await rosterPost(cookie, [{ id: 'u-A', userId: 'u-A', name: 'Player A', position: 'FLY' }]);
  assert.equal(r.code, 200);
  assert.ok(rowFor('u-B'), 'Player B survives the stale omission');
  assert.equal(rowFor('u-A').position, 'FLY', 'the stale device\'s legitimate edit still lands');
});

test('RACE — intentional archive is NOT undone by a later stale save (no resurrection)', async () => {
  seed({ members: [member('A'), member('B', { userId: 'u-B', id: 'm-B' })],
         users: [user('A'), user('B', { id: 'u-B' })],
         profiles: [profile('A')],
         roster: [{ id: 'u-A', userId: 'u-A', name: 'Player A' },
                  { id: 'u-B', userId: 'u-B', name: 'Player B' }] });
  await removeTeamMember('m-B', 'u-someone-else', CLUB, { archive: true });
  const cookie = await coachSession('u-boss');
  // A stale save omitting B: the archived membership no longer protects the row.
  await rosterPost(cookie, [{ id: 'u-A', userId: 'u-A', name: 'Player A' }]);
  assert.equal(rowFor('u-B'), undefined, 'archived player removable by omission');
  // Any number of later saves must not bring B back.
  await rosterPost(cookie, [{ id: 'u-A', userId: 'u-A', name: 'Player A' }]);
  assert.equal(rowFor('u-B'), undefined, 'never resurrected by reconciliation');
});

test('RACE — a scoped coach\'s stale save cannot delete their own group\'s new joiner either', async () => {
  seed({ members: [member('s1', { playerGroupId: U18 }), member('s2', { userId: 'u-s2', id: 'm-s2', playerGroupId: U18 })],
         users: [user('s1'), user('s2', { id: 'u-s2' })],
         profiles: [profile('s1'), profile('s2', { id: 'pr-s2', teamMemberId: 'm-s2', userId: 'u-s2', displayName: 'Player s2' })],
         roster: [{ id: 'u-s1', userId: 'u-s1', name: 'Player s1' },
                  { id: 'u-s2', userId: 'u-s2', name: 'Player s2' }] });
  const cookie = await coachSession('u-u18coach', {
    isOwner: false, accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] },
  });
  await rosterPost(cookie, [{ id: 'u-s1', userId: 'u-s1', name: 'Player s1' }]);
  assert.ok(rowFor('u-s2'), 'in-scope active player survives the scoped stale omission');
});

test('SECURITY — reconciliation does not hand a scoped caller other groups\' rows', async () => {
  // A Seniors player is MISSING a row; the U18 coach saves. The projection is
  // created server-side — but never surfaces in the scoped caller's read.
  seed({ members: [member('sen1'), member('u18a', { userId: 'u-u18a', id: 'm-u18a', playerGroupId: U18 })],
         users: [user('sen1'), user('u18a', { id: 'u-u18a' })],
         profiles: [profile('sen1')],
         roster: [{ id: 'u-u18a', userId: 'u-u18a', name: 'Player u18a' }] });
  const cookie = await coachSession('u-u18coach', {
    isOwner: false, accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] },
  });
  const post = await rosterPost(cookie, [{ id: 'u-u18a', userId: 'u-u18a', name: 'Player u18a' }]);
  assert.equal(post.code, 200);
  assert.equal(post.body.players, undefined, 'the write response carries no rows');
  assert.ok(rowFor('u-sen1'), 'the Seniors projection was healed server-side');
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'roster' }, headers: { cookie } }, r);
  assert.deepEqual(r.result.body.players.map(p => p.name), ['Player u18a'],
    'the healed Seniors row is not readable by the U18 coach');
});

test('SECURITY — a forged row groupId does not move a player or widen scope', async () => {
  seed({ members: [member('f1', { playerGroupId: U18 })], users: [user('f1')], profiles: [profile('f1')],
         roster: [{ id: 'u-f1', userId: 'u-f1', name: 'Player f1' }] });
  const cookie = await coachSession('u-u18coach', {
    isOwner: false, accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] },
  });
  // The row claims to be Seniors; membership says U18 — membership wins.
  await rosterPost(cookie, [{ id: 'u-f1', userId: 'u-f1', name: 'Player f1',
    groupId: SEN, playerGroupId: SEN, group: 'Seniors' }]);
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'roster', group: U18 }, headers: { cookie } }, r);
  assert.deepEqual(r.result.body.players.map(p => p.name), ['Player f1'],
    'row remains in the membership\'s group regardless of forged fields');
});

// ─── UNLINKED ROWS ──────────────────────────────────────────────────────────

test('UNLINKED — trialist/CSV rows are neither protected nor fabricated nor deleted', async () => {
  seed({ members: [member('l1')], users: [user('l1')], profiles: [profile('l1')],
         roster: [{ id: 'u-l1', userId: 'u-l1', name: 'Player l1' },
                  { id: 'trial-1', name: 'Trialist One', position: 'WING' }] });
  await ensureRosterProjection(CLUB);
  assert.ok(rosterRows().find(p => p.id === 'trial-1'), 'reconciliation leaves the trialist alone');
  assert.equal(rosterRows().length, 2);
  const cookie = await coachSession('u-boss');
  // The covering caller may still remove the trialist by omission…
  await rosterPost(cookie, [{ id: 'u-l1', userId: 'u-l1', name: 'Player l1' }]);
  assert.equal(rosterRows().find(p => p.id === 'trial-1'), undefined, 'unlinked row removable');
  assert.ok(rowFor('u-l1'), '…while the active player is not');
});

// ─── GROUP CHANGE ───────────────────────────────────────────────────────────

test('GROUP CHANGE — the projection follows canonical membership, scoped access follows it', async () => {
  seed({ members: [member('gc', { playerGroupId: SEN })], users: [user('gc')], profiles: [profile('gc')],
         roster: [{ id: 'u-gc', userId: 'u-gc', name: 'Player gc', position: 'LOCK' }] });
  await setPlayerGroup('m-gc', U18, 'u-admin', CLUB);
  assert.equal(rosterRows().length, 1, 'one row before and after — no duplicate on group change');
  assert.equal(rowFor('u-gc').position, 'LOCK', 'row content untouched by the move');
  const u18cookie = await coachSession('u-u18coach', {
    isOwner: false, accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] },
  });
  const sencookie = await coachSession('u-sencoach', {
    isOwner: false, accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] },
  });
  const rU18 = res(); const rSen = res();
  await publishHandler({ method: 'GET', query: { resource: 'roster' }, headers: { cookie: u18cookie } }, rU18);
  await publishHandler({ method: 'GET', query: { resource: 'roster' }, headers: { cookie: sencookie } }, rSen);
  assert.deepEqual(rU18.result.body.players.map(p => p.name), ['Player gc'], 'new group sees them');
  assert.deepEqual(rSen.result.body.players, [], 'stale old-group access grants nothing');
});

// ─── PURE-FUNCTION EDGES (mutation-testing anchors) ─────────────────────────

test('PURE — protection ignores other clubs\' members and the size cap never drops kept rows', async () => {
  const members = [member('x'), member('foreign', { id: 'm-f', userId: 'u-f', teamId: 'other-club' })];
  const storedRows = [
    { id: 'u-x', userId: 'u-x', name: 'Mine' },
    { id: 'u-f', userId: 'u-f', name: 'Foreign' },
  ];
  const { rows, kept } = protectCanonicalRows({
    storedRows, nextRows: [], members, profiles: [], teamId: CLUB });
  assert.deepEqual(kept.map(r => r.name), ['Mine'], 'only THIS club\'s active player is protected');
  assert.deepEqual(rows.map(r => r.name), ['Mine']);
});

test('PURE — creation respects the cap; protection is not subject to it', async () => {
  const members = [member('c1'), member('c2', { id: 'm-c2', userId: 'u-c2' })];
  const users = [user('c1'), user('c2', { id: 'u-c2' })];
  const full = [{ id: 'filler', name: 'Filler Row' }];
  const rec = reconcileMissingRows({
    rows: full, members, users, profiles: [], structure: STRUCTURE, teamId: CLUB, maxPlayers: 2 });
  assert.equal(rec.rows.length, 2, 'creation stopped at the cap');
  assert.equal(rec.created.length, 1);
});

test('PURE — rowMatchesMember: every bridge, and the different-account guard', async () => {
  const m = member('br'); const prof = profile('br', { legacyPlayerId: 'inv-12345678' });
  assert.ok(rowMatchesMember({ id: 'z', userId: 'u-br' }, m, prof), 'userId bridge');
  assert.ok(rowMatchesMember({ id: 'u-br' }, m, prof), 'row-id bridge');
  assert.ok(rowMatchesMember({ id: 'z', legacyPlayerId: 'inv-12345678' }, m, prof), 'invite-id bridge');
  assert.ok(rowMatchesMember({ id: 'inv-12345678' }, m, prof), 'row-id-as-invite bridge');
  assert.ok(rowMatchesMember({ id: 'z', email: 'BR@RSH.TEST' }, m, prof), 'email bridge (case-blind)');
  assert.ok(rowMatchesMember({ id: 'z', name: '  player   BR ' }, m, prof), 'name bridge (normalised)');
  assert.ok(!rowMatchesMember({ id: 'z', userId: 'u-someone', email: 'br@rsh.test', name: 'Player br' }, m, prof),
    'a row claimed by another account never matches, whatever else agrees');
});
