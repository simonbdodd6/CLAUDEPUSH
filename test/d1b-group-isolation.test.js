/**
 * D1b — OPERATIONAL GROUP ISOLATION.
 *
 * Every operational screen is read in the context of exactly one group. Which
 * groups an identity may operate in depends on the capacity they are acting in:
 * staff read their accessScope, a player reads their playerGroupId, and a
 * dual-role member gets BOTH — separately, never merged.
 *
 * These pin the authorisation boundary itself. Client filtering is
 * presentation; the server must refuse a forged group id, so the medical
 * endpoint is exercised through the real handler.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.d1b.test';
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

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const {
  operationalGroupsFor, defaultOperationalGroup, assertOperationalGroup,
} = await import('../api/_accessScope.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-d1b';
const SEN = 'grp-seniors', U18 = 'grp-u18', VET = 'grp-vets';

const TWO_GROUPS = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: VET, name: 'Veterans', type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-dev', groupId: SEN, name: 'Premier Development', status: 'active' },
    { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 't-u18b', groupId: U18, name: 'U18 Premier Development', status: 'active' },
  ],
};
const ONE_GROUP = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });

const MEMBERS = [
  { id: 'm-sen-a', teamId: CLUB, userId: 'u-sen-a', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen-b', teamId: CLUB, userId: 'u-sen-b', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-a', teamId: CLUB, userId: 'u-u18-a', role: 'player', status: 'active', playerGroupId: U18, medicalAccess: true },
  { id: 'm-u18-b', teamId: CLUB, userId: 'u-u18-b', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN), medicalAccess: true },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18), medicalAccess: true },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true, medicalAccess: true },
  // Dual role: plays U18, coaches Seniors.
  { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN), playerGroupId: U18, medicalAccess: true },
];
const by = id => MEMBERS.find(m => m.id === id);

function seed(structure = TWO_GROUPS) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club D1b' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p-sen-a', userId: 'u-sen-a', name: 'Senior A', position: 'PROP', phone: '+3247000' },
    { id: 'p-sen-b', userId: 'u-sen-b', name: 'Senior B', position: 'LOCK' },
    { id: 'p-u18-a', userId: 'u-u18-a', name: 'U18 A', position: 'FLY' },
    { id: 'p-u18-b', userId: 'u-u18-b', name: 'U18 B', position: 'WING' },
  ] }));
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB, cases: [
    { id: 'mc-sen', playerId: 'p-sen-a', playerGroupId: SEN, status: 'active', condition: 'Senior hamstring', timeline: [] },
    { id: 'mc-u18', playerId: 'p-u18-a', playerGroupId: U18, status: 'active', condition: 'U18 ankle', timeline: [] },
  ] }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function medical(userId, query = {}) {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical', ...query },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}

// ── THE CONTEXT ITSELF ─────────────────────────────────────────────────────
test('staff read accessScope; a player reads playerGroupId', () => {
  const st = TWO_GROUPS;
  assert.deepEqual(operationalGroupsFor(by('m-sen-coach'), st).map(g => g.name), ['Seniors']);
  assert.deepEqual(operationalGroupsFor(by('m-u18-coach'), st).map(g => g.name), ['U18']);
  assert.deepEqual(operationalGroupsFor(by('m-admin'), st).map(g => g.name), ['Seniors', 'U18']);
  assert.deepEqual(operationalGroupsFor(by('m-u18-a'), st, { as: 'player' }).map(g => g.name), ['U18']);
  assert.deepEqual(operationalGroupsFor(by('m-sen-a'), st, { as: 'player' }).map(g => g.name), ['Seniors']);
  assert.equal(operationalGroupsFor(by('m-sen-coach'), st).some(g => g.name === 'Veterans'), false,
    'archived groups are never operational');
});

test('dual role keeps the two capacities apart', () => {
  const dual = by('m-dual');
  assert.deepEqual(operationalGroupsFor(dual, TWO_GROUPS, { as: 'player' }).map(g => g.name), ['U18'],
    'plays U18');
  assert.deepEqual(operationalGroupsFor(dual, TWO_GROUPS, { as: 'staff' }).map(g => g.name), ['Seniors'],
    'coaches Seniors');
});

test('one accessible group auto-selects; several must be chosen', () => {
  const single = defaultOperationalGroup(by('m-sen-coach'), TWO_GROUPS);
  assert.equal(single.group.name, 'Seniors');
  assert.equal(single.mustChoose, false, 'no selector needed');

  const many = defaultOperationalGroup(by('m-admin'), TWO_GROUPS);
  assert.equal(many.group, null, 'nothing is guessed');
  assert.equal(many.mustChoose, true);
  assert.deepEqual(many.groups.map(g => g.name), ['Seniors', 'U18']);
});

// ── BACKWARD COMPATIBILITY ─────────────────────────────────────────────────
test('a legacy member with no stored scope still works in a one-group club', () => {
  const legacy = { id: 'm-legacy', teamId: CLUB, userId: 'u-legacy', role: 'coach', status: 'active' };
  assert.deepEqual(operationalGroupsFor(legacy, ONE_GROUP).map(g => g.name), ['Seniors'],
    'today\'s club: no new friction, whatever the group id happens to be');
  assert.deepEqual(operationalGroupsFor(legacy, TWO_GROUPS).map(g => g.name), [],
    'once there are two, it refuses to guess rather than leak');
});

// ── SERVER-SIDE AUTHORISATION ──────────────────────────────────────────────
test('a forged, foreign, archived or unpermitted group id is refused', () => {
  const ctx = { user: { id: 'u-sen-coach' }, teamMember: by('m-sen-coach') };
  const thrown = fn => { try { fn(); return null; } catch (e) { return e.status; } };

  assert.equal(thrown(() => assertOperationalGroup(ctx, TWO_GROUPS, 'grp-forged')), 404, 'unknown');
  assert.equal(thrown(() => assertOperationalGroup(ctx, TWO_GROUPS, 't-prem')), 404,
    'a team id is not a group id');
  assert.equal(thrown(() => assertOperationalGroup(ctx, TWO_GROUPS, VET)), 400, 'archived');
  assert.equal(thrown(() => assertOperationalGroup(ctx, TWO_GROUPS, U18)), 403,
    'a Seniors coach may not operate in U18');
  assert.equal(assertOperationalGroup(ctx, TWO_GROUPS, SEN).name, 'Seniors', 'their own group is fine');
});

test('a player cannot name another group, even by editing the request', () => {
  const ctx = { user: { id: 'u-u18-a' }, teamMember: by('m-u18-a') };
  assert.equal(assertOperationalGroup(ctx, TWO_GROUPS, U18, { as: 'player' }).name, 'U18');
  try {
    assertOperationalGroup(ctx, TWO_GROUPS, SEN, { as: 'player' });
    assert.fail('a U18 player reached Seniors');
  } catch (e) { assert.equal(e.status, 403); }
});

// ── MEDICAL, THROUGH THE REAL ENDPOINT ─────────────────────────────────────
test('MEDICAL — a Seniors coach sees only Seniors cases and players', async () => {
  seed(); await login('u-sen-coach');
  const r = await medical('u-sen-coach');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.cases.map(c => c.condition), ['Senior hamstring']);
  assert.deepEqual(r.body.players.map(p => p.name).sort(), ['Senior A', 'Senior B']);
  assert.equal(JSON.stringify(r.body).includes('U18'), false, 'no U18 data at all');
  assert.equal(r.body.group.name, 'Seniors', 'auto-selected — their only group');
});

test('MEDICAL — a U18 coach sees only U18', async () => {
  seed(); await login('u-u18-coach');
  const r = await medical('u-u18-coach');
  assert.deepEqual(r.body.cases.map(c => c.condition), ['U18 ankle']);
  // The players list is the GROUP's roster, not the caseload — both U18
  // players appear, only one of them has an open case.
  assert.deepEqual(r.body.players.map(p => p.name).sort(), ['U18 A', 'U18 B']);
  assert.equal(JSON.stringify(r.body).includes('Senior hamstring'), false);
});

test('MEDICAL — a forged ?group= cannot cross the boundary', async () => {
  seed(); await login('u-sen-coach');
  const forged = await medical('u-sen-coach', { group: U18 });
  assert.equal(forged.code, 403, 'refused server-side, not hidden client-side');
  assert.equal(forged.body.ok, false);

  const unknown = await medical('u-sen-coach', { group: 'grp-nope' });
  assert.equal(unknown.code, 404);
});

test('MEDICAL — a player+Medical is scoped to the group they PLAY in', async () => {
  seed(); await login('u-u18-a');
  const r = await medical('u-u18-a');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.cases.map(c => c.condition), ['U18 ankle'], 'their own group only');
  assert.equal(JSON.stringify(r.body).includes('Senior hamstring'), false);

  const forged = await medical('u-u18-a', { group: SEN });
  assert.equal(forged.code, 403, 'a player cannot request another squad\'s medical data');
});

test('MEDICAL — a club-wide admin may switch, and sees only what they ask for', async () => {
  seed(); await login('u-admin');
  const both = await medical('u-admin');
  assert.deepEqual(both.body.groups.map(g => g.name), ['Seniors', 'U18'], 'offered both');

  const sen = await medical('u-admin', { group: SEN });
  assert.deepEqual(sen.body.cases.map(c => c.condition), ['Senior hamstring']);
  const u18 = await medical('u-admin', { group: U18 });
  assert.deepEqual(u18.body.cases.map(c => c.condition), ['U18 ankle']);
});

test('MEDICAL — the projection still leaks no contact data', async () => {
  seed(); await login('u-sen-coach');
  const r = await medical('u-sen-coach');
  assert.equal(JSON.stringify(r.body).includes('+3247000'), false, 'phone still excluded');
  assert.deepEqual(Object.keys(r.body.players[0]).sort(),
    ['groupName', 'id', 'name', 'playerGroupId', 'position'].sort());
});

// ── TODAY'S PRODUCTION SHAPE ───────────────────────────────────────────────
test('MEDICAL — a one-group club behaves exactly as before', async () => {
  seed(ONE_GROUP);
  // Only the Seniors members are meaningful in a Seniors-only club.
  await login('u-sen-coach');
  const r = await medical('u-sen-coach');
  assert.equal(r.code, 200);
  assert.equal(r.body.group.name, 'Seniors');
  assert.equal(r.body.groups.length, 1, 'nothing to switch between — no selector');
  assert.deepEqual(r.body.players.map(p => p.name).sort(), ['Senior A', 'Senior B']);
});
