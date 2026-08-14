/**
 * Match Centre — DUAL SIDES (Premier / Premier Development).
 *
 * A "side" is a validated club STRUCTURE TEAM id — never the tenant teamId.
 * Storage gains one dimension: club + fixture + side (+ coach for drafts), so
 * the same Seniors fixture holds one sheet per side, drawn from one player
 * pool. The player-facing read becomes a LIST of published sheets: each side
 * publishes and withdraws independently, and no sheet can masquerade as its
 * sibling. Legacy sideless records stay readable, explicitly unassigned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.mc-dual-side.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const writes = [];
const globToRe = pattern =>
  new RegExp(`^${pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
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
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-mc', OTHER = 'club-other';
const MONS = 'fx_aug22', AMSTEL = 'fx_aug29';
const PREM = 'team_premier', DEV = 'team_dev', OLD = 'team_old', FOREIGN_SIDE = 'team_foreign';

const MEMBERS = [
  { id: 'm-coach',  teamId: CLUB,  userId: 'u-coach',  role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-coach2', teamId: CLUB,  userId: 'u-coach2', role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-player', teamId: CLUB,  userId: 'u-player', role: 'player', status: 'active' },
  { id: 'm-other',  teamId: OTHER, userId: 'u-other',  role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-owner',  teamId: CLUB,  userId: 'u-owner',  role: 'admin',  status: 'active', isOwner: true },
  // Manager access: MANAGE_PLAYERS without PUBLISH_SQUADS — proves the
  // matchday-teams gate is the Match Centre capability, not roster admin.
  { id: 'm-mgr',    teamId: CLUB,  userId: 'u-mgr',    role: 'coach',  status: 'active', accessProfile: 'manager' },
  // A coach whose staff scope is the U18 group only.
  { id: 'm-u18',    teamId: CLUB,  userId: 'u-u18',    role: 'coach',  status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: 'grp_u18', status: 'active' }], teams: [] } },
];

function seed() {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [
    { id: MONS,   opposition: 'Mons',         date: '2026-08-22', status: 'scheduled' },
    { id: AMSTEL, opposition: 'Amstelveense', date: '2026-08-29', status: 'scheduled' },
  ] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ clubName: 'Other', fixtures: [
    { id: 'fx_other', opposition: 'Elsewhere', date: '2026-08-22', status: 'scheduled' },
  ] }));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: 'grp_seniors', name: 'Seniors', type: 'general', status: 'active' },
      { id: 'grp_u18',     name: 'U18',     type: 'general', status: 'active' },
    ],
    teams: [
      { id: PREM, groupId: 'grp_seniors', name: 'Premier',             status: 'active' },
      { id: DEV,  groupId: 'grp_seniors', name: 'Premier Development', status: 'active' },
      { id: OLD,  groupId: 'grp_seniors', name: 'Old Boys',            status: 'archived' },
      { id: 'team_u18', groupId: 'grp_u18', name: 'U18 XV',            status: 'active' },
    ] }));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1,
    groups: [{ id: 'grp_o', name: 'Their Seniors', type: 'general', status: 'active' }],
    teams: [{ id: FOREIGN_SIDE, groupId: 'grp_o', name: 'Their XV', status: 'active' }] }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}
async function get(userId, type, fixture, side) {
  const r = res();
  const query = { type };
  if (fixture !== undefined) query.fixture = fixture;
  if (side !== undefined) query.side = side;
  await publishHandler({ method: 'GET', query, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
async function del(userId, fixtureId, sideId) {
  const r = res();
  await publishHandler({ method: 'DELETE', query: { type: 'squad' },
    headers: { cookie: cookies.get(userId) || '' },
    body: { ...(fixtureId ? { fixtureId } : {}), ...(sideId ? { sideId } : {}) } }, r);
  return r.result;
}

const squad = (fixtureId, sideId, opposition) =>
  ({ published: true, opposition, fixtureId, sideId });
const keysMatching = re => [...kv.keys()].filter(k => re.test(k));

// ── VALIDATION — the side is never taken on trust ──────────────────────────
test('both real sides are accepted; every bad side is refused on every path', async () => {
  seed(); await login('u-coach');
  assert.equal((await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'A') })).code, 200);
  assert.equal((await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'B') })).code, 200);
  for (const bad of ['team_forged', FOREIGN_SIDE, OLD]) {
    assert.equal((await post('u-coach', { type: 'squad', data: squad(MONS, bad, 'X') })).code, 404, `publish ${bad}`);
    assert.equal((await post('u-coach', { type: 'draft', data: squad(MONS, bad, 'X') })).code, 404, `draft ${bad}`);
    assert.equal((await get('u-coach', 'squad', MONS, bad)).code, 404, `read ${bad}`);
    assert.equal((await get('u-coach', 'draft', MONS, bad)).code, 404, `read draft ${bad}`);
    assert.equal((await del('u-coach', MONS, bad)).code, 404, `delete ${bad}`);
  }
});

test('a side without a fixture is refused — a sheet needs its match', async () => {
  seed(); await login('u-coach');
  assert.equal((await post('u-coach', { type: 'squad', data: { published: true, sideId: PREM, opposition: 'X' } })).code, 400);
  assert.equal((await post('u-coach', { type: 'draft', data: { sideId: PREM, opposition: 'X' } })).code, 400);
});

// ── DRAFT ISOLATION — club + fixture + side + coach ────────────────────────
test('four-way isolation: fixture × side drafts never touch each other', async () => {
  seed(); await login('u-coach');
  const combos = [
    [MONS, PREM, 'Mons Premier XV'], [MONS, DEV, 'Mons Dev XV'],
    [AMSTEL, PREM, 'Amstel Premier XV'], [AMSTEL, DEV, 'Amstel Dev XV'],
  ];
  for (const [fx, side, opp] of combos) {
    assert.equal((await post('u-coach', { type: 'draft', data: squad(fx, side, opp) })).code, 200);
  }
  for (const [fx, side, opp] of combos) {
    assert.equal((await get('u-coach', 'draft', fx, side)).body.draft.opposition, opp,
      `${fx}+${side} holds its own draft`);
  }
  assert.equal(keysMatching(/:side:[^:]+:draft:/).length, 4, 'four distinct keys');
});

test('the same side keeps each coach\'s draft private', async () => {
  seed(); await login('u-coach'); await login('u-coach2');
  await post('u-coach',  { type: 'draft', data: squad(MONS, PREM, 'Coach One XV') });
  await post('u-coach2', { type: 'draft', data: squad(MONS, PREM, 'Coach Two XV') });
  assert.equal((await get('u-coach',  'draft', MONS, PREM)).body.draft.opposition, 'Coach One XV');
  assert.equal((await get('u-coach2', 'draft', MONS, PREM)).body.draft.opposition, 'Coach Two XV');
});

test('a side ask NEVER falls back to the sibling side or a sideless draft', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: squad(MONS, PREM, 'Premier XV') });
  await post('u-coach', { type: 'draft', data: { fixtureId: MONS, opposition: 'Sideless XV' } });
  assert.equal((await get('u-coach', 'draft', MONS, DEV)).body.draft, null,
    'Development has no draft — not Premier\'s, not the sideless one');
  assert.equal((await get('u-coach', 'draft', MONS)).body.draft.opposition, 'Sideless XV',
    'the sideless legacy draft still answers a sideless ask');
});

// ── PUBLISH ISOLATION ──────────────────────────────────────────────────────
test('publishing one side never alters the other', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'Dev B') });
  assert.equal((await get('u-coach', 'squad', MONS, PREM)).body.squad.opposition, 'Premier A');
  assert.equal((await get('u-coach', 'squad', MONS, DEV)).body.squad.opposition, 'Dev B');
  // Republish Premier with new content — Development untouched.
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A2') });
  assert.equal((await get('u-coach', 'squad', MONS, DEV)).body.squad.opposition, 'Dev B');
});

test('withdrawing one side preserves the other — both ways, no tombstones', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'Dev B') });

  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, sideId: PREM, published: false } });
  assert.equal(kv.has(`app:publish:${CLUB}:fixture:${MONS}:side:${PREM}:squad`), false,
    'really deleted — no null tombstone');
  assert.equal((await get('u-coach', 'squad', MONS, DEV)).body.squad.opposition, 'Dev B', 'Development intact');

  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  assert.equal((await del('u-coach', MONS, DEV)).code, 200);
  assert.equal(kv.has(`app:publish:${CLUB}:fixture:${MONS}:side:${DEV}:squad`), false);
  assert.equal((await get('u-coach', 'squad', MONS, PREM)).body.squad.opposition, 'Premier A', 'Premier intact');
});

// ── PLAYER MULTI-SHEET READ ────────────────────────────────────────────────
const sheets = async () => (await get('u-player', 'squad')).body;

test('Premier alone: one labelled sheet, and legacy `squad` still populated', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  const body = await sheets();
  assert.equal(body.publishedSheets.length, 1);
  assert.equal(body.publishedSheets[0].sideId, PREM);
  assert.equal(body.publishedSheets[0].teamName, 'Premier');
  assert.equal(body.publishedSheets[0].fixtureId, MONS);
  assert.equal(body.squad.opposition, 'Premier A', 'older cached clients keep working on one sheet');
});

test('Development alone works identically', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'Dev B') });
  const body = await sheets();
  assert.equal(body.publishedSheets.length, 1);
  assert.equal(body.publishedSheets[0].teamName, 'Premier Development');
});

test('BOTH published: two labelled sheets, and no single squad masquerades', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'Dev B') });
  const body = await sheets();
  assert.equal(body.publishedSheets.length, 2, 'both sheets exist simultaneously');
  const names = body.publishedSheets.map(s => s.teamName).sort();
  assert.deepEqual(names, ['Premier', 'Premier Development']);
  assert.equal(body.squad, null,
    'a single `squad` with two sheets on show could only lie — it is null');
});

test('withdrawing Premier leaves players the Development sheet (and vice versa)', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'Dev B') });

  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, sideId: PREM, published: false } });
  let body = await sheets();
  assert.equal(body.publishedSheets.length, 1);
  assert.equal(body.publishedSheets[0].teamName, 'Premier Development');
  assert.equal(body.squad.opposition, 'Dev B', 'back to one unambiguous sheet');

  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, sideId: DEV, published: false } });
  body = await sheets();
  assert.equal(body.publishedSheets.length, 0, 'nothing left on show');
  assert.equal(body.squad, null);
});

test('a legacy sideless publish surfaces as an explicitly UNASSIGNED sheet', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: { published: true, fixtureId: MONS, opposition: 'Sideless' } });
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  const body = await sheets();
  assert.equal(body.publishedSheets.length, 2);
  const legacy = body.publishedSheets.find(s => s.sideId === '');
  assert.ok(legacy, 'the sideless record is present');
  assert.equal(legacy.teamName, '', 'and is never heuristically assigned to a side');
});

test('the multi-sheet read never leaks a coach\'s private draft', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'draft', data: squad(MONS, PREM, 'Secret Draft') });
  await post('u-coach', { type: 'squad', data: squad(MONS, DEV, 'Dev B') });
  const body = await sheets();
  assert.equal(body.publishedSheets.length, 1, 'only the published sheet');
  assert.equal(JSON.stringify(body).includes('Secret Draft'), false, 'draft content absent');
});

test('a player supplying ?side= is still answered with the on-show state only', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  const r = await get('u-player', 'squad', MONS, DEV);
  assert.equal(r.code, 200, 'no probing oracle');
  assert.equal(r.body.publishedSheets.length, 1, 'the pointer read, not the asked side');
  assert.equal(r.body.publishedSheets[0].sideId, PREM);
});

test('a foreign club\'s side id can never read or write here', async () => {
  seed(); await login('u-coach'); await login('u-other');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  assert.equal((await post('u-other', { type: 'squad', data: squad('fx_other', PREM, 'Stolen') })).code, 404,
    'our side id is unknown to their club');
  assert.deepEqual(keysMatching(new RegExp(`publish:${OTHER}:.*side`)), [], 'nothing written over there');
});

// ── KEY SAFETY — hostile ids stay one segment ──────────────────────────────
test('hostile side ids are percent-encoded and cannot cross key boundaries', async () => {
  seed(); await login('u-coach');
  const NASTY = ['a:squad', 'x/y', '100%', 'front row', 'équipe–α'];
  const st = JSON.parse(kv.get(`app:structure:${CLUB}`));
  NASTY.forEach((id, i) => st.teams.push({ id, groupId: 'grp_seniors', name: 'N' + i, status: 'active' }));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(st));

  for (const id of NASTY) {
    assert.equal((await post('u-coach', { type: 'squad', data: squad(MONS, id, 'Odd ' + id) })).code, 200);
  }
  for (const id of NASTY) {
    assert.equal((await get('u-coach', 'squad', MONS, id)).body.squad.opposition, 'Odd ' + id,
      `round-trips: ${id}`);
  }
  assert.ok(kv.has(`app:publish:${CLUB}:fixture:${MONS}:side:a%3Asquad:squad`), 'one segment, encoded');
  assert.equal((await get('u-coach', 'squad', MONS, PREM)).body.squad, null,
    'no hostile id collided with a real side');
});

// ── DOWNSTREAM PROTECTION + WIPE ──────────────────────────────────────────
test('a side-scoped squad alone protects its fixture from import updates', async () => {
  seed(); await login('u-coach');
  kv.set(`app:publish:${CLUB}:fixture:${AMSTEL}:side:${PREM}:squad`,
    JSON.stringify({ published: true, opposition: 'Amstel Premier', fixtureId: AMSTEL, sideId: PREM }));
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'fixtures' },
    headers: { cookie: cookies.get('u-coach') || '' },
    body: { action: 'import', confirmed: true,
      fixtures: [{ decision: 'update', fixture: { opposition: 'Amstelveense', date: '2026-08-29', venue: 'Moved' } }] } }, r);
  assert.equal(r.result.body.summary.blocked, 1, 'the side sheet is real squad work');
});

test('the club wipe removes side-scoped records too', async () => {
  seed(); await login('u-coach'); await login('u-owner');
  await post('u-coach', { type: 'squad', data: squad(MONS, PREM, 'Premier A') });
  await post('u-coach', { type: 'draft', data: squad(MONS, DEV, 'Dev draft') });
  assert.equal(keysMatching(/:side:/).length, 2);
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'club' },
    headers: { cookie: cookies.get('u-owner') || '' },
    body: { action: 'delete_club_data', confirmName: 'Boitsfort' } }, r);
  assert.equal(r.result.code, 200);
  assert.deepEqual(keysMatching(/:side:/), [], 'no orphaned side records survive');
});

// ── MATCHDAY-TEAMS — the minimal scoped side-metadata read ────────────────
async function getTeams(userId) {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'matchday-teams' },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}

test('a club-wide coach receives the active teams of their groups — nothing else', async () => {
  seed(); await login('u-coach');
  const r = await getTeams('u-coach');
  assert.equal(r.code, 200);
  const ids = r.body.teams.map(t => t.id).sort();
  assert.deepEqual(ids, [PREM, DEV, 'team_u18'].sort(), 'club-wide staff: all active teams');
  assert.equal(r.body.teams.some(t => t.id === OLD), false, 'archived team excluded');
  assert.deepEqual(Object.keys(r.body.teams[0]).sort(), ['groupId', 'id', 'name'],
    'id, name, group — no roster, no members, no counts');
});

test('the club OWNER gets group-labelled teams for operational switching', async () => {
  seed(); await login('u-owner');
  const r = await getTeams('u-owner');
  assert.equal(r.code, 200);
  assert.ok(r.body.groups.length >= 2, 'groups included so the owner can switch context');
});

test('a U18-scoped coach receives U18 teams ONLY — never Seniors metadata', async () => {
  seed(); await login('u-u18');
  const r = await getTeams('u-u18');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.teams.map(t => t.id), ['team_u18']);
  assert.equal(JSON.stringify(r.body).includes('Premier'), false, 'no Seniors names leak');
});

test('the gate is PUBLISH_SQUADS: a manager (MANAGE_PLAYERS, no publish) is refused', async () => {
  seed(); await login('u-mgr');
  const r = await getTeams('u-mgr');
  assert.equal(r.code, 403, 'roster admin alone does not open the Match Centre selector');
});

test('a PLAYER cannot query the coach side-metadata read', async () => {
  seed(); await login('u-player');
  assert.equal((await getTeams('u-player')).code, 403);
});

test('another club\'s coach cannot see Boitsfort teams', async () => {
  seed(); await login('u-other');
  const r = await getTeams('u-other');
  // Their session resolves THEIR tenant: whatever comes back, none of it is ours.
  assert.equal(JSON.stringify(r.body || {}).includes('Premier'), false);
  assert.equal(JSON.stringify(r.body || {}).includes(PREM), false);
});

test('the handler is gated on publish_squads at source, not manage_players', async () => {
  const fs = await import('node:fs');
  const apiSrc = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  const body = apiSrc.slice(apiSrc.indexOf('async function matchdayTeamsHandler'),
                            apiSrc.indexOf('async function structureHandler'));
  assert.match(body, /PERM\.PUBLISH_SQUADS/);
  assert.doesNotMatch(body, /MANAGE_PLAYERS/);
  assert.match(body, /operationalGroupsFor/, 'scope comes from the operational-group authority');
});

// ── DRAFTS LIST ────────────────────────────────────────────────────────────
test('draft rows carry their sideId so panels can filter without mixing', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: squad(MONS, PREM, 'Premier XV') });
  await post('u-coach', { type: 'draft', data: squad(MONS, DEV, 'Dev XV') });
  const rows = (await get('u-coach', 'drafts')).body.drafts;
  assert.deepEqual(rows.map(d => d.sideId).sort(), [DEV, PREM].sort());
  for (const row of rows) {
    assert.equal(row.squad.sideId, row.sideId, 'each row is internally consistent');
  }
});
