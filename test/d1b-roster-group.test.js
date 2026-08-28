/**
 * D1b Pass 2 — the operational roster, through the REAL handler.
 *
 * Club administration legitimately reads the whole club, so the roster stays
 * club-wide unless a caller ASKS for a group. When they do, the group is
 * authorised against their own capacity, so editing ?group= cannot reach
 * another squad. Membership playerGroupId is the authority — never a team
 * name, age text or roster label.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.roster-group.test';
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
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-roster', OTHER = 'club-other';
const SEN = 'grp-seniors', U18 = 'grp-u18', VET = 'grp-vets';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: VET, name: 'Veterans', type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
  ],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });

const MEMBERS = [
  { id: 'm-sen-a', teamId: CLUB, userId: 'u-sen-a', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen-b', teamId: CLUB, userId: 'u-sen-b', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-a', teamId: CLUB, userId: 'u-u18-a', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-u18-b', teamId: CLUB, userId: 'u-u18-b', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  // Dual role: plays Seniors, coaches U18.
  { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18), playerGroupId: SEN },
];

/** The last row has NO membership at all — a roster-only, unlinked player. */
const ROSTER = [
  { id: 'p-sen-a', userId: 'u-sen-a', name: 'Senior A', position: 'PROP', phone: '+3247001' },
  { id: 'p-sen-b', userId: 'u-sen-b', name: 'Senior B', position: 'LOCK' },
  { id: 'p-u18-a', userId: 'u-u18-a', name: 'U18 A', position: 'FLY' },
  { id: 'p-u18-b', userId: 'u-u18-b', name: 'U18 B', position: 'WING' },
  { id: 'p-orphan', name: 'Unlinked Player', position: 'SUB' },
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({
    version: 1, groups: [{ id: 'grp-foreign', name: 'Foreign', status: 'active' }], teams: [],
  }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER, updatedAt: '2026-01-01T00:00:00.000Z' }));
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
async function roster(userId, query = {}) {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'roster', ...query },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const names = r => (r.body.players || []).map(p => p.name).sort();

// ── AUTHORISED GROUP READS ─────────────────────────────────────────────────
test('a Seniors-authorised coach asking for Seniors gets Seniors only', async () => {
  seed(); await login('u-sen-coach');
  const r = await roster('u-sen-coach', { group: SEN });
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['Senior A', 'Senior B']);
  assert.equal(JSON.stringify(r.body).includes('U18'), false, 'no U18 row leaks');
  assert.equal(r.body.group.name, 'Seniors');
});

test('a U18-authorised coach asking for U18 gets U18 only', async () => {
  seed(); await login('u-u18-coach');
  const r = await roster('u-u18-coach', { group: U18 });
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['U18 A', 'U18 B']);
  assert.equal(JSON.stringify(r.body).includes('Senior A'), false);
});

test('a multi-scope admin may request either group, one at a time', async () => {
  seed(); await login('u-admin');
  assert.deepEqual(names(await roster('u-admin', { group: SEN })), ['Senior A', 'Senior B']);
  assert.deepEqual(names(await roster('u-admin', { group: U18 })), ['U18 A', 'U18 B']);
});

// ── REFUSALS ───────────────────────────────────────────────────────────────
test('an inaccessible group is refused 403, not silently emptied', async () => {
  seed(); await login('u-sen-coach');
  const r = await roster('u-sen-coach', { group: U18 });
  assert.equal(r.code, 403);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.players, undefined, 'no data at all on refusal');
});

test('a foreign club\'s group and a forged id are both unknown here', async () => {
  seed(); await login('u-admin');
  assert.equal((await roster('u-admin', { group: 'grp-foreign' })).code, 404, 'another club\'s group');
  assert.equal((await roster('u-admin', { group: 'grp-forged' })).code, 404);
  assert.equal((await roster('u-admin', { group: 't-prem' })).code, 404, 'a team id is not a group id');
});

test('an archived group is refused', async () => {
  seed(); await login('u-admin');
  const r = await roster('u-admin', { group: VET });
  assert.equal(r.code, 400);
  assert.match(r.body.error, /archived/);
});

// ── PLAYER CAPABILITY ──────────────────────────────────────────────────────
test('the roster endpoint is not open to a plain player at all', async () => {
  seed(); await login('u-sen-a');
  // MANAGE_PLAYERS gates the whole handler, so a player is refused BEFORE any
  // group logic — asking for their own group does not open it.
  const own = await roster('u-sen-a', { group: SEN });
  assert.equal(own.code, 403, 'own group is still not a player-readable resource');
  const other = await roster('u-sen-a', { group: U18 });
  assert.equal(other.code, 403, 'and certainly not another group');
  const all = await roster('u-sen-a');
  assert.equal(all.code, 403, 'nor the club-wide read');
});

// ── DUAL ROLE ──────────────────────────────────────────────────────────────
test('dual role reads the group they COACH, not the one they play in', async () => {
  seed(); await login('u-dual');
  const coached = await roster('u-dual', { group: U18 });
  assert.equal(coached.code, 200);
  assert.deepEqual(names(coached), ['U18 A', 'U18 B'], 'their staff scope is U18');

  const played = await roster('u-dual', { group: SEN });
  assert.equal(played.code, 403,
    'playing in Seniors grants no staff read of the Seniors roster');
});

// ── CLUB-WIDE ADMIN PATH PRESERVED ─────────────────────────────────────────
test('no ?group= preserves the existing club-wide read', async () => {
  seed(); await login('u-admin');
  const r = await roster('u-admin');
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['Senior A', 'Senior B', 'U18 A', 'U18 B', 'Unlinked Player'],
    'Club Administration still sees the whole club');
  assert.equal(r.body.group, undefined, 'no group context claimed');
  assert.equal(r.body.updatedAt, '2026-01-01T00:00:00.000Z', 'metadata unchanged');
});

// ── ROSTER-ONLY ROWS ───────────────────────────────────────────────────────
test('an unlinked roster row is never placed in a group, and is counted honestly', async () => {
  seed(); await login('u-admin');
  const sen = await roster('u-admin', { group: SEN });
  const u18 = await roster('u-admin', { group: U18 });
  assert.equal(names(sen).includes('Unlinked Player'), false, 'not guessed into Seniors');
  assert.equal(names(u18).includes('Unlinked Player'), false, 'not guessed into U18');
  assert.equal(sen.body.unassigned, 1, 'reported, not hidden');
  assert.equal(u18.body.unassigned, 1);
  // It is still reachable through the club-wide administration path.
  assert.equal(names(await roster('u-admin')).includes('Unlinked Player'), true);
});

// ── PRIVACY: NO NEW EXPOSURE ───────────────────────────────────────────────
test('group filtering narrows rows and adds no new fields', async () => {
  seed(); await login('u-sen-coach');
  const filtered = await roster('u-sen-coach', { group: SEN });
  await login('u-admin');
  const clubWide = await roster('u-admin');

  const senA = filtered.body.players.find(p => p.name === 'Senior A');
  const senAWide = clubWide.body.players.find(p => p.name === 'Senior A');
  assert.deepEqual(Object.keys(senA).sort(), Object.keys(senAWide).sort(),
    'the same row shape the endpoint already returned — a strict subset of rows, not new data');
  assert.equal(senA.phone, '+3247001', 'roster reads legitimately include contact data for staff');
});

// ── TODAY'S PRODUCTION SHAPE ───────────────────────────────────────────────
test('a one-group club is unaffected', async () => {
  seed();
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [{ id: SEN, name: 'Seniors', status: 'active' }],
    teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
  }));
  await login('u-sen-coach');
  assert.deepEqual(names(await roster('u-sen-coach', { group: SEN })), ['Senior A', 'Senior B']);
  const all = await roster('u-sen-coach');
  assert.equal(all.body.players.length, 5, 'the club-wide read is untouched');
});

// ── CLIENT OPERATIONAL CONTEXT ─────────────────────────────────────────────
// The server publishes which groups this identity may operate in, per
// capacity; the client adopts that answer rather than re-deriving the rules,
// so the UI can never offer a group the API would refuse.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let depth = 0, end = src.indexOf('{', start);
  for (let b = end; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

/** Evaluate the real client helpers against a stubbed session context. */
function ctx(operational, activeView = 'coach', members = [], players = []) {
  const state = { activeView, operationalGroupId: null, players };
  return new Function(`
    const state = arguments[0];
    let _myOperational = arguments[1];
    // loaded:true — models arrived admin data; pending data now fails closed.
    const _adminData = { loaded: true, members: arguments[2] };
    function canonicalVisiblePlayers() { return state.players; }
    function showToast() {}
    function saveState() {}
    function render() {}
    // Training group partition: switching groups swaps the training stash.
    const defaultState = { schedule: [], trainingBlocks: {}, tacticsDrawings: {} };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    let _trainingSchedule = null, _trainingScheduleAttempted = false,
        _trainingPubState = {}, _trainingPubLoadedAt = 0, _publishedStateLoadedAt = 0;
    // Match Centre detach machinery (fixture/draft identity fix 51b44de7) and
    // Performance detach machinery (selected-group isolation a1461ba1).
    // setOperationalGroup() grew these AFTER this harness was written, which is
    // why every test that called it died on a ReferenceError before asserting.
    // Inert stubs — this suite exercises the ACCESS-SCOPE boundary only, and
    // the real setOperationalGroup still runs against them.
    let _mcSheetFixtureId = '';
    function matchCentreFixtureId() { return ''; }
    function mcFlushDraftNow() {}
    function mcDetachFixture() {}
    let _perfAssign = { loaded: true, athletes: [] };
    let _perfAuthor = { step: null };
    ${fn('captureTrainingState')}
    ${fn('stashTrainingState')}
    ${fn('adoptTrainingState')}
    ${fn('syncTrainingStateToGroup')}
    ${fn('operationalCapacity')}
    ${fn('operationalGroups')}
    ${fn('resolveOperationalGroup')}
    ${fn('setOperationalGroup')}
    ${fn('operationalGroupName')}
    ${fn('operationalPlayers')}
    return { state, operationalGroups, resolveOperationalGroup, setOperationalGroup,
             operationalPlayers, operationalGroupName,
             setView(v) { state.activeView = v; resolveOperationalGroup(); } };
  `)(state, operational, members, players);
}

const SEN_G = { id: SEN, name: 'Seniors' }, U18_G = { id: U18, name: 'U18' };
const one = { staff: { groups: [SEN_G], defaultGroupId: SEN, mustChoose: false },
              player: { groups: [], defaultGroupId: null, mustChoose: false } };
const many = { staff: { groups: [SEN_G, U18_G], defaultGroupId: null, mustChoose: true },
               player: { groups: [], defaultGroupId: null, mustChoose: false } };
const dual = { staff: { groups: [U18_G], defaultGroupId: U18, mustChoose: false },
               player: { groups: [SEN_G], defaultGroupId: SEN, mustChoose: false } };

test('CLIENT — one accessible group auto-selects', () => {
  const c = ctx(one); c.resolveOperationalGroup();
  assert.equal(c.state.operationalGroupId, SEN);
  assert.equal(c.operationalGroupName(), 'Seniors');
});

test('CLIENT — several groups never default silently', () => {
  const c = ctx(many); c.resolveOperationalGroup();
  assert.equal(c.state.operationalGroupId, null, 'the switcher must ask');
  assert.deepEqual(c.operationalGroups().map(g => g.name), ['Seniors', 'U18']);
});

test('CLIENT — the selector is limited to accessScope, and refuses anything else', () => {
  const c = ctx(many); c.resolveOperationalGroup();
  c.setOperationalGroup(U18);
  assert.equal(c.state.operationalGroupId, U18);
  c.setOperationalGroup('grp-forged');
  assert.equal(c.state.operationalGroupId, U18, 'an unauthorised id is rejected, selection unchanged');
});

test('CLIENT — dual role swaps group on view switch, never merges', () => {
  const c = ctx(dual, 'coach'); c.resolveOperationalGroup();
  assert.equal(c.state.operationalGroupId, U18, 'coaches U18');
  c.setView('player');
  assert.equal(c.state.operationalGroupId, SEN, 'plays Seniors');
  c.setView('coach');
  assert.equal(c.state.operationalGroupId, U18, 'and back');
});

test('CLIENT — a player is offered no choice at all', () => {
  const c = ctx(dual, 'player'); c.resolveOperationalGroup();
  assert.deepEqual(c.operationalGroups().map(g => g.name), ['Seniors'], 'exactly their own group');
  // The guard now lives in the markup builder (renderOperationalGroupSwitcher
  // delegates to it, so a live control is never rebuilt out from under an open
  // dropdown). Same guarantee, asserted where it is enforced — and both
  // switcher hosts share the one builder, so neither can drift.
  assert.match(fn('operationalGroupSwitcherLabelHTML'),
    /state\.activeView === 'player' \|\| groups\.length < 2/,
    'never rendered for a player, nor when there is no real choice');
  assert.match(fn('operationalGroupSwitcherHTML'),
    /state\.activeView === 'player' \|\| groups\.length < 2/,
    'the Match Centre / Messages switcher applies the same guard');
  assert.match(fn('renderOperationalGroupSwitcher'), /operationalGroupSwitcherLabelHTML\(\)/,
    'the renderer takes its markup from that guarded builder');
});

test('CLIENT — zero accessible groups does not guess', () => {
  const c = ctx({ staff: { groups: [], defaultGroupId: null, mustChoose: false },
                  player: { groups: [], defaultGroupId: null, mustChoose: false } });
  c.resolveOperationalGroup();
  assert.equal(c.state.operationalGroupId, null);
});

test('CLIENT — Members narrows by membership playerGroupId, not by name', () => {
  const members = [
    { id: 'm1', userId: 'u-sen-a', status: 'active', playerGroupId: SEN },
    { id: 'm2', userId: 'u-u18-a', status: 'active', playerGroupId: U18 },
  ];
  const players = [
    { id: 'p1', userId: 'u-sen-a', name: 'Senior A' },
    { id: 'p2', userId: 'u-u18-a', name: 'U18 A' },
    { id: 'p3', name: 'Unlinked Player' },
  ];
  const c = ctx(many, 'coach', members, players);
  c.resolveOperationalGroup();
  c.setOperationalGroup(SEN);
  assert.deepEqual(c.operationalPlayers().map(p => p.name), ['Senior A'],
    'the unlinked row is not guessed into a group');
  c.setOperationalGroup(U18);
  assert.deepEqual(c.operationalPlayers().map(p => p.name), ['U18 A']);

  // A single-group COACH in a grouped club is scoped to their group too —
  // their club may hold squads they never see (final readiness pass).
  const single = ctx(one, 'coach', members, players);
  single.resolveOperationalGroup();
  assert.deepEqual(single.operationalPlayers().map(p => p.name), ['Senior A'],
    'grouped memberships scope even a single-group context');

  // A PRE-STRUCTURE club — no grouped memberships at all — keeps today's
  // full roster: there is genuinely nothing to isolate.
  const ungrouped = members.map(m => ({ ...m, playerGroupId: undefined }));
  const legacy = ctx(one, 'coach', ungrouped, players);
  legacy.resolveOperationalGroup();
  assert.equal(legacy.operationalPlayers().length, 3, 'unchanged when there is nothing to isolate');
});
