/**
 * THREE GROUPS, SIX TEAMS — the U18 + Women's onboarding foundation.
 *
 * One club, three player groups (Seniors = the club's INITIAL group, U18,
 * Women's), two teams each. The rules pinned here:
 *
 *   · AVAILABILITY is partitioned by group: answers live at
 *     availability:<club>:group:<groupId>:<sessionId>. A player's group comes
 *     from THEIR membership, never from the client; coach reads name a group
 *     and are asserted; the legacy club-wide history is readable only through
 *     the INITIAL group's documented fallback. Clearing is per group.
 *   · FIXTURES belong to a group. Legacy unscoped fixtures belong to the
 *     INITIAL group (production's Seniors) — deterministic compatibility,
 *     never a guess onto a newer group. A side and a fixture must play in the
 *     SAME group.
 *   · PLAYING and COACHING stay separate: playerGroupId is where a person
 *     plays; accessScope is where they coach. One login can be a Seniors
 *     player and a U18 coach without either leaking into the other.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.three-group.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = pattern =>
  new RegExp(`^${pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const re = at >= 0 ? globToRe(String(args[at + 1])) : null;
    result = ['0', [...kv.keys()].filter(k => !re || re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { operationalGroupsFor } = await import('../api/_accessScope.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-boitsfort';
const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_womens';
const T = {
  prem: 'team_premier', dev: 'team_dev',
  u18p: 'team_u18_prem', u18d: 'team_u18_dev',
  womp: 'team_wom_prem', womd: 'team_wom_dev',
};
const FX_SEN_LEGACY = 'fx_sen_legacy';   // no groupId — the uploaded season
const FX_U18 = 'fx_u18_cup';

const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-sen-c', teamId: CLUB, userId: 'u-sen-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-u18-c', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-wom-c', teamId: CLUB, userId: 'u-wom-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: WOM, status: 'active' }], teams: [] } },
  // Alex: Seniors PLAYER who also coaches U18 — one login, two capacities.
  { id: 'm-alex', teamId: CLUB, userId: 'u-alex', role: 'coach', status: 'active', accessProfile: 'coach',
    playerGroupId: SEN,
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-sen-p', teamId: CLUB, userId: 'u-sen-p', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-p', teamId: CLUB, userId: 'u-u18-p', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-wom-p', teamId: CLUB, userId: 'u-wom-p', role: 'player', status: 'active', playerGroupId: WOM },
];

const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: T.prem, groupId: SEN, name: 'Premier',                    status: 'active' },
    { id: T.dev,  groupId: SEN, name: 'Premier Development',        status: 'active' },
    { id: T.u18p, groupId: U18, name: 'U18 Premier',                status: 'active' },
    { id: T.u18d, groupId: U18, name: 'U18 Premier Development',    status: 'active' },
    { id: T.womp, groupId: WOM, name: "Women's Premier",            status: 'active' },
    { id: T.womd, groupId: WOM, name: "Women's Premier Development", status: 'active' },
  ] };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  // Player profiles drive the coach-board identity resolution.
  kv.set('app:identity:player_profiles', JSON.stringify(
    MEMBERS.filter(m => m.playerGroupId).map(m => ({ teamId: CLUB, userId: m.userId }))));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [
    { id: FX_SEN_LEGACY, opposition: 'Mons', date: '2026-08-22', status: 'scheduled' },              // legacy, no group
    { id: FX_U18, opposition: 'U18 Rivals', date: '2026-08-23', status: 'scheduled', groupId: U18 },
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
async function avail(userId, method, query, body) {
  const r = res();
  await availabilityHandler({ method, query: query || {}, body: body || {},
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
async function pub(userId, method, query, body) {
  const r = res();
  await publishHandler({ method, query: query || {}, body: body || {},
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}

// ── AVAILABILITY — group-partitioned storage ──────────────────────────────
test('each group\'s answers land in that group\'s keyspace — no mixing', async () => {
  seed(); await login('u-sen-p'); await login('u-u18-p'); await login('u-wom-p');
  assert.equal((await avail('u-sen-p', 'POST', {}, { sessionId: 'tue', response: 'available' })).code, 200);
  assert.equal((await avail('u-u18-p', 'POST', {}, { sessionId: 'tue', response: 'maybe' })).code, 200);
  assert.equal((await avail('u-wom-p', 'POST', {}, { sessionId: 'tue', response: 'unavailable' })).code, 200);

  const at = gid => JSON.parse(kv.get(`app:availability:${CLUB}:group:${gid}:tue`) || '{}');
  assert.equal(Object.values(at(SEN)).some(v => v.userId === 'u-sen-p'), true, 'Seniors answer in Seniors keyspace');
  assert.equal(Object.values(at(U18)).some(v => v.userId === 'u-u18-p'), true, 'U18 answer in U18 keyspace');
  assert.equal(Object.values(at(WOM)).some(v => v.userId === 'u-wom-p'), true, "Women's answer in Women's keyspace");
  assert.equal(Object.values(at(SEN)).some(v => v.userId === 'u-u18-p'), false, 'U18 never bleeds into Seniors');
  assert.equal(Object.values(at(U18)).some(v => v.userId === 'u-wom-p'), false, "Women's never bleeds into U18");
});

test('the coach board reads exactly the named group\'s answers', async () => {
  seed(); await login('u-sen-p'); await login('u-u18-p'); await login('u-owner');
  await avail('u-sen-p', 'POST', {}, { sessionId: 'tue', response: 'available' });
  await avail('u-u18-p', 'POST', {}, { sessionId: 'tue', response: 'maybe' });

  const sen = await avail('u-owner', 'GET', { resolveRoster: '1', group: SEN });
  assert.equal(sen.code, 200);
  assert.ok(sen.body.resolved['u-sen-p'], 'Seniors board holds the Seniors answer');
  assert.equal(sen.body.resolved['u-u18-p'], undefined, 'and never the U18 one');

  const u18 = await avail('u-owner', 'GET', { resolveRoster: '1', group: U18 });
  assert.ok(u18.body.resolved['u-u18-p']);
  assert.equal(u18.body.resolved['u-sen-p'], undefined);
});

test('legacy club-wide history surfaces ONLY through the initial (Seniors) group', async () => {
  seed(); await login('u-owner');
  // Production's pre-group record: the club-scoped key with no group segment.
  kv.set(`app:availability:${CLUB}:game`, JSON.stringify({
    legacyKey: { userId: 'u-sen-p', response: 'available', label: 'Old Senior' } }));

  const sen = await avail('u-owner', 'GET', { resolveRoster: '1', group: SEN });
  assert.ok(sen.body.resolved['u-sen-p'], 'Seniors inherit their own history');
  const u18 = await avail('u-owner', 'GET', { resolveRoster: '1', group: U18 });
  assert.equal(u18.body.resolved['u-sen-p'], undefined, 'U18 starts EMPTY — no inherited history');
  const wom = await avail('u-owner', 'GET', { resolveRoster: '1', group: WOM });
  assert.equal(wom.body.resolved['u-sen-p'], undefined, "Women's starts empty too");
});

test('a multi-group reader must name the group; a forged group is refused', async () => {
  seed(); await login('u-owner'); await login('u-u18-c');
  assert.equal((await avail('u-owner', 'GET', { resolveRoster: '1' })).code, 400,
    'three groups: naming one is required');
  assert.equal((await avail('u-u18-c', 'GET', { resolveRoster: '1', group: SEN })).code, 403,
    'a U18 coach cannot read the Seniors board');
  assert.equal((await avail('u-u18-c', 'GET', { resolveRoster: '1', group: 'grp_forged' })).code, 404,
    'an unknown group id does not exist for anyone');
  assert.equal((await avail('u-u18-c', 'GET', { resolveRoster: '1', group: U18 })).code, 200,
    'their own group answers');
});

test('clear_week clears ONE group and cannot touch the others', async () => {
  seed(); await login('u-sen-p'); await login('u-u18-p'); await login('u-owner');
  await avail('u-sen-p', 'POST', {}, { sessionId: 'game', response: 'available' });
  await avail('u-u18-p', 'POST', {}, { sessionId: 'game', response: 'maybe' });

  const r = await avail('u-owner', 'POST', {}, { action: 'clear_week', sessions: ['game'], group: U18 });
  assert.equal(r.code, 200);
  const at = gid => JSON.parse(kv.get(`app:availability:${CLUB}:group:${gid}:game`) || 'null');
  assert.deepEqual(at(U18), {}, 'U18 cleared');
  assert.equal(Object.values(at(SEN) || {}).some(v => v.userId === 'u-sen-p'), true, 'Seniors untouched');
});

test('the player\'s group comes from THEIR membership — a client cannot choose', async () => {
  seed(); await login('u-u18-p');
  // A hostile client passing group hints changes nothing: the write derives
  // the group from the session membership.
  await avail('u-u18-p', 'POST', {}, { sessionId: 'thu', response: 'available', group: SEN, groupId: SEN });
  assert.equal(kv.has(`app:availability:${CLUB}:group:${SEN}:thu`), false, 'nothing in Seniors');
  assert.equal(Object.values(JSON.parse(kv.get(`app:availability:${CLUB}:group:${U18}:thu`) || '{}'))
    .some(v => v.userId === 'u-u18-p'), true, 'landed in their OWN group');
});

// ── FIXTURES — group ownership + side coherence ───────────────────────────
test('a legacy unscoped fixture belongs to Seniors: its sides work, U18 sides do not', async () => {
  seed(); await login('u-owner');
  const ok = await pub('u-owner', 'POST', {}, { type: 'squad',
    data: { published: true, opposition: 'Mons', fixtureId: FX_SEN_LEGACY, sideId: T.prem } });
  assert.equal(ok.code, 200, 'Seniors side on the legacy Seniors fixture');
  const bad = await pub('u-owner', 'POST', {}, { type: 'squad',
    data: { published: true, opposition: 'Mons', fixtureId: FX_SEN_LEGACY, sideId: T.u18p } });
  assert.equal(bad.code, 400, 'a U18 team sheet on a Seniors fixture is refused');
  assert.match(bad.body.error, /group/i);
});

test('a U18 fixture accepts U18 sides only — never Seniors or Women\'s', async () => {
  seed(); await login('u-owner');
  assert.equal((await pub('u-owner', 'POST', {}, { type: 'squad',
    data: { published: true, opposition: 'X', fixtureId: FX_U18, sideId: T.u18d } })).code, 200);
  for (const wrong of [T.prem, T.womp]) {
    assert.equal((await pub('u-owner', 'POST', {}, { type: 'squad',
      data: { published: true, opposition: 'X', fixtureId: FX_U18, sideId: wrong } })).code, 400, wrong);
  }
});

test('coherence guards drafts and coach reads too', async () => {
  seed(); await login('u-owner');
  assert.equal((await pub('u-owner', 'POST', {}, { type: 'draft',
    data: { opposition: 'X', fixtureId: FX_U18, sideId: T.prem } })).code, 400, 'draft refused');
  assert.equal((await pub('u-owner', 'GET', { type: 'squad', fixture: FX_U18, side: T.prem })).code, 400, 'read refused');
});

test('fixture creation stamps the asserted group; multi-group must choose', async () => {
  seed(); await login('u-u18-c'); await login('u-owner');
  const created = await pub('u-u18-c', 'POST', { resource: 'fixtures' },
    { action: 'create', fixture: { opposition: 'New Opp', date: '2026-09-12' } });
  assert.equal(created.code, 201, 'single-group coach: their group is the default');
  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  const fx = club.fixtures.find(f => f.opposition === 'New Opp');
  assert.equal(fx.groupId, U18, 'stamped with the coach\'s group');

  const vague = await pub('u-owner', 'POST', { resource: 'fixtures' },
    { action: 'create', fixture: { opposition: 'Vague Opp', date: '2026-09-13' } });
  assert.equal(vague.code, 400, 'a three-group owner must say which group');
  const forged = await pub('u-u18-c', 'POST', { resource: 'fixtures' },
    { action: 'create', groupId: SEN, fixture: { opposition: 'Sneaky', date: '2026-09-14' } });
  assert.equal(forged.code, 403, 'a U18 coach cannot create Seniors fixtures');
});

test('matchday-teams serves each coach exactly their groups\' teams', async () => {
  seed(); await login('u-sen-c'); await login('u-wom-c'); await login('u-owner');
  const sen = await pub('u-sen-c', 'GET', { resource: 'matchday-teams' });
  assert.deepEqual(sen.body.teams.map(t => t.id).sort(), [T.prem, T.dev].sort());
  const wom = await pub('u-wom-c', 'GET', { resource: 'matchday-teams' });
  assert.deepEqual(wom.body.teams.map(t => t.id).sort(), [T.womp, T.womd].sort());
  const owner = await pub('u-owner', 'GET', { resource: 'matchday-teams' });
  assert.equal(owner.body.teams.length, 6, 'the owner can reach all six');
  assert.equal(owner.body.groups.length, 3, 'and switches between three groups');
});

// ── ONE LOGIN, TWO CAPACITIES ─────────────────────────────────────────────
test('Alex: Seniors player + U18 coach — capacities never merge', () => {
  const alex = MEMBERS.find(m => m.userId === 'u-alex');
  const playing = operationalGroupsFor(alex, STRUCTURE, { as: 'player' }).map(g => g.id);
  const coaching = operationalGroupsFor(alex, STRUCTURE, { as: 'staff' }).map(g => g.id);
  assert.deepEqual(playing, [SEN], 'plays for Seniors');
  assert.deepEqual(coaching, [U18], 'coaches U18');
});

test('coaching scope never manufactures player membership or eligibility', async () => {
  const { resolveEligibility } = await import('../api/_accessScope.js');
  const alex = MEMBERS.find(m => m.userId === 'u-alex');
  const elig = resolveEligibility(alex, STRUCTURE);
  assert.deepEqual([...elig.teamIds].sort(), [T.prem, T.dev].sort(),
    'Alex is PICKABLE for the Seniors teams only — never U18, despite coaching there');
});

test('Alex\'s availability answer lands in SENIORS — where he plays', async () => {
  seed(); await login('u-alex');
  await avail('u-alex', 'POST', {}, { sessionId: 'tue', response: 'available' });
  assert.equal(Object.values(JSON.parse(kv.get(`app:availability:${CLUB}:group:${SEN}:tue`) || '{}'))
    .some(v => v.userId === 'u-alex'), true);
  assert.equal(kv.has(`app:availability:${CLUB}:group:${U18}:tue`), false,
    'coaching U18 does not write him into U18');
});

test('a multi-group coach operates both their groups and only those', () => {
  const multi = { id: 'm-x', teamId: CLUB, userId: 'u-x', role: 'coach', status: 'active',
    accessProfile: 'coach', playerGroupId: SEN,
    accessScope: { clubWide: false, groups: [
      { groupId: U18, status: 'active' }, { groupId: WOM, status: 'active' }], teams: [] } };
  const coaching = operationalGroupsFor(multi, STRUCTURE, { as: 'staff' }).map(g => g.id).sort();
  assert.deepEqual(coaching, [U18, WOM].sort(), 'U18 + Women\'s, never Seniors');
  assert.deepEqual(operationalGroupsFor(multi, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN],
    'and still a Seniors player');
});

test('the club owner operates all three groups from one login', () => {
  const owner = MEMBERS.find(m => m.userId === 'u-owner');
  const groups = operationalGroupsFor(owner, STRUCTURE, { as: 'staff' }).map(g => g.id).sort();
  assert.deepEqual(groups, [SEN, U18, WOM].sort());
});

// ── CLIENT — pools and fixture context per group ──────────────────────────
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

function clientPool(groupId, memberCount) {
  // Controlled roster: 44 Seniors, 30 U18, 28 Women's — one membership each.
  const players = [];
  const members = [];
  const add = (gid, n, prefix) => {
    for (let i = 0; i < n; i++) {
      players.push({ id: `${prefix}${i}`, userId: `u-${prefix}${i}`, name: `${prefix} ${i}` });
      members.push({ status: 'active', userId: `u-${prefix}${i}`, playerGroupId: gid });
    }
  };
  add(SEN, 44, 'sen'); add(U18, 30, 'u18'); add(WOM, 28, 'wom');
  return new Function(`
    const state = { operationalGroupId: arguments[0] };
    // loaded:true — models arrived admin data; pending now fails closed (group-isolation fix).
    const _adminData = { loaded: true, members: arguments[2] };
    function canonicalVisiblePlayers() { return arguments.length ? arguments[1] || [] : []; }
    const _players = arguments[1];
    function operationalGroups() { return [
      { id: '${SEN}', name: 'Seniors' }, { id: '${U18}', name: 'U18' }, { id: '${WOM}', name: "Women's" }]; }
    ${fn('operationalPlayers').replace('canonicalVisiblePlayers()', '_players')}
    return operationalPlayers();
  `)(groupId, players, members);
}

test('player pools: 44 Seniors, 30 U18, 28 Women\'s — no cross-group members', () => {
  assert.equal(clientPool(SEN).length, 44);
  assert.equal(clientPool(U18).length, 30);
  assert.equal(clientPool(WOM).length, 28);
  assert.equal(clientPool(U18).some(p => String(p.id).startsWith('sen')), false,
    'a Seniors player never appears in the U18 pool');
});

test('contextFixtures: each context sees its own fixtures; legacy = Seniors', () => {
  const fixtures = [
    { id: 'fx_legacy', opposition: 'Mons', date: '2026-08-22' },                  // unscoped
    { id: 'fx_u18', opposition: 'Rivals', date: '2026-08-23', groupId: U18 },
    { id: 'fx_wom', opposition: 'Foes', date: '2026-08-24', groupId: WOM },
  ];
  const run = gid => new Function(`
    const state = { operationalGroupId: arguments[0], fixtures: arguments[1] };
    function operationalGroups() { return [
      { id: '${SEN}' }, { id: '${U18}' }, { id: '${WOM}' }]; }
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    return contextFixtures().map(f => f.id);
  `)(gid, fixtures);
  assert.deepEqual(run(SEN), ['fx_legacy'], 'the uploaded season stays Seniors');
  assert.deepEqual(run(U18), ['fx_u18'], 'U18 sees only U18 fixtures');
  assert.deepEqual(run(WOM), ['fx_wom']);
  assert.deepEqual(run(null), ['fx_legacy', 'fx_u18', 'fx_wom'], 'no context: unfiltered legacy mode');
});

test('the MC candidate pool and availability rows go through the group pool', () => {
  const body = fn('renderMatchday');
  assert.match(body, /operationalPlayers\(\)\.filter\(p => isRosterPlayerRecord/, 'pool is group-scoped');
  assert.match(body, /_opPoolIds/, 'availability rows filtered to the group pool');
});

test('the coach board and player week read fixtures through the group context', () => {
  assert.match(fn('coachAvailEvents'), /contextFixtures\(\)/);
  assert.match(fn('availEventsForViewedWeek'), /contextFixtures\(\)/);
  assert.match(fn('matchCentreFixtureList'), /contextFixtures\(\)/);
});
