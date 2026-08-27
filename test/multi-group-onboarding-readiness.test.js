/**
 * FINAL MULTI-GROUP ONBOARDING READINESS — the last checks before the real
 * U18 and Women's groups can be created in production.
 *
 *  · MEDICAL under the actual 3-group model, incl. the shipped orphan rule
 *  · PLAYER FIXTURES derive from playerGroupId (never coach context)
 *  · AVAILABILITY BOARD group scoping + group-scoped reminder pushes
 *  · STAFF INVITES granting one or SEVERAL accessScope groups, and the
 *    existing-player → coach upgrade that must never fork the identity
 *  · the CROSS-GROUP access matrix across every partitioned subsystem
 *  · the full ONBOARDING DRY RUN: Seniors-only club → 3 groups / 6 teams,
 *    invites, upgrades — every new group starting empty
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.readiness.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const lists = new Map();
const rangeList = (list, start, end) => {
  const s = Number(start), e = Number(end);
  return list.slice(s, (e < 0 ? list.length + e : e) + 1);
};
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM')  { lists.set(args[0], rangeList(lists.get(args[0]) || [], args[1], args[2])); result = 'OK'; }
  if (command === 'RENAME') { lists.set(args[1], lists.get(args[0]) || []); lists.delete(args[0]); result = 'OK'; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  return { ok: true, json: async () => ({ result }) };
};

// Real (throwaway) VAPID keys so the push handler runs its full path; the
// endpoints point at a closed local port, so nothing is ever delivered.
const webpush = (await import('web-push')).default;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY  = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const idStore = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { default: chatHandler } = await import('../api/chat.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { default: pushHandler } = await import('../api/push.js');
const { operationalGroupsFor, resolveEligibility, effectiveAccessScope } = await import('../api/_accessScope.js');

/**
 * Every invitation, wherever it lives. Invitations are stored one list per
 * club now (api/_inviteStore.js); the pre-namespace global list is still read
 * so records created before the split are visible too.
 */
function allStoredInvites(map) {
  const out = [];
  for (const [k, v] of map) {
    if (!/^app:invites:/.test(k)) continue;
    try { out.push(...(JSON.parse(v) || [])); } catch {}
  }
  try { out.push(...(JSON.parse(map.get('ce:invites') || '[]') || [])); } catch {}
  return out;
}

const { createSession, claimInvite, SESSION_COOKIE, DEFAULT_TEAM } = idStore;

const CLUB = DEFAULT_TEAM.id;
const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_womens';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });

const STRUCTURE3 = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_dev',     groupId: SEN, name: 'Premier Development', status: 'active' },
    { id: 'team_u18p',    groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 'team_u18d',    groupId: U18, name: 'U18 Premier Development', status: 'active' },
    { id: 'team_womp',    groupId: WOM, name: "Women's Premier", status: 'active' },
    { id: 'team_womd',    groupId: WOM, name: "Women's Premier Development", status: 'active' },
  ] };

const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-sen-m', teamId: CLUB, userId: 'u-sen-m', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]), medicalAccess: true },
  { id: 'm-u18-m', teamId: CLUB, userId: 'u-u18-m', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18]), medicalAccess: true },
  { id: 'm-wom-m', teamId: CLUB, userId: 'u-wom-m', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([WOM]), medicalAccess: true },
  { id: 'm-uw-m',  teamId: CLUB, userId: 'u-uw-m',  role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18, WOM]), medicalAccess: true },
  { id: 'm-alex', teamId: CLUB, userId: 'u-alex', role: 'coach', status: 'active', accessProfile: 'coach',
    playerGroupId: SEN, accessScope: scope([U18, WOM]) },
  { id: 'm-s1', teamId: CLUB, userId: 'u-s1', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u1', teamId: CLUB, userId: 'u-u1', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-w1', teamId: CLUB, userId: 'u-w1', role: 'player', status: 'active', playerGroupId: WOM },
];

const cookies = new Map();
async function seed(structure = STRUCTURE3, members = MEMBERS) {
  kv.clear(); lists.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(members));
  kv.set('app:identity:users', JSON.stringify(
    members.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: `Name ${m.userId}` }))));
  kv.set('app:identity:player_profiles', JSON.stringify(
    members.filter(m => m.playerGroupId || m.role === 'player')
      .map(m => ({ teamId: CLUB, userId: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: members
    .filter(m => m.playerGroupId || m.role === 'player')
    .map(m => ({ id: `p-${m.userId}`, userId: m.userId, name: `Name ${m.userId}`, position: 'Prop' })) }));
  for (const m of members) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}

function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, writeHead(c) { out.code = c; return this; },
           get result() { return out; } };
}
async function call(handler, userId, method, query, body) {
  const r = res();
  await handler({ method, query: query || {}, body: body || {},
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const pub   = (u, m, q, b) => call(publishHandler, u, m, q, b);
const avail = (u, m, q, b) => call(availabilityHandler, u, m, q, b);
const invit = (u, m, q, b) => call(inviteHandler, u, m, q, b);
const push  = (u, m, q, b) => call(pushHandler, u, m, q, b);
async function chat(userId, method, url, body = null) {
  const r = { statusCode: 0, body: '', setHeader() {}, writeHead(s) { this.statusCode = s; }, end(c = '') { this.body = String(c); } };
  await chatHandler({ method, url, headers: { cookie: cookies.get(userId) || '' },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } }, r);
  return { code: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
}

// ── PART 3 — MEDICAL under the real 3-group model ─────────────────────────
function seedMedicalCases() {
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ cases: [
    { id: 'case-sen', playerId: 'p-u-s1', playerGroupId: SEN, status: 'active', title: 'Seniors knock', timeline: [] },
    { id: 'case-u18', playerId: 'p-u-u1', playerGroupId: U18, status: 'active', title: 'U18 knock', timeline: [] },
    { id: 'case-wom', playerId: 'p-u-w1', playerGroupId: WOM, status: 'active', title: "Women's knock", timeline: [] },
    { id: 'case-orphan', playerId: 'p-legacy', playerGroupId: '', status: 'active', title: 'Legacy orphan', timeline: [] },
  ], updatedAt: 1 }));
}

test('MEDICAL: each medic sees exactly their groups\' cases — never a sibling\'s', async () => {
  await seed(); seedMedicalCases();
  const ids = async (u, q = {}) => (await pub(u, 'GET', { resource: 'medical', ...q })).body.cases.map(c => c.id).sort();
  assert.deepEqual(await ids('u-sen-m'), ['case-sen'], 'Seniors medic');
  assert.deepEqual(await ids('u-u18-m'), ['case-u18'], 'U18 medic');
  assert.deepEqual(await ids('u-wom-m'), ['case-wom'], "Women's medic");
  assert.deepEqual(await ids('u-uw-m'), ['case-u18', 'case-wom'], 'U18+Women\'s medic: those two, no Seniors, no orphan');
});

test('MEDICAL: the orphan case surfaces ONLY under whole-club coverage', async () => {
  await seed(); seedMedicalCases();
  const owner = (await pub('u-owner', 'GET', { resource: 'medical' })).body.cases.map(c => c.id).sort();
  assert.deepEqual(owner, ['case-orphan', 'case-sen', 'case-u18', 'case-wom'],
    'the owner covers every group, so the unattributable case is safe to show');
  // The INITIAL group owns unattributable legacy data: a whole-club-covering
  // caller asking for it still sees orphans there (the Medical screen now
  // stamps the operating group, so this keeps orphans reachable). Any OTHER
  // group ask stays strictly narrower and never returns orphans.
  const ownerAsked = (await pub('u-owner', 'GET', { resource: 'medical', group: SEN })).body.cases.map(c => c.id).sort();
  assert.deepEqual(ownerAsked, ['case-orphan', 'case-sen'], 'initial-group ask by whole-club coverage includes orphans');
  const ownerAskedU18 = (await pub('u-owner', 'GET', { resource: 'medical', group: U18 })).body.cases.map(c => c.id);
  assert.deepEqual(ownerAskedU18, ['case-u18'], 'a NON-initial group ask never returns orphans');
  const u18 = (await pub('u-u18-m', 'GET', { resource: 'medical' })).body.cases.map(c => c.id);
  assert.equal(u18.includes('case-orphan'), false, 'a scoped medic never sees the orphan');
});

test('MEDICAL: forged groups are refused; a player reads their own group only', async () => {
  await seed(); seedMedicalCases();
  assert.equal((await pub('u-u18-m', 'GET', { resource: 'medical', group: SEN })).code, 403);
  assert.equal((await pub('u-u18-m', 'GET', { resource: 'medical', group: 'grp_forged' })).code, 404);
  // A player holding medical access reads through the PLAYER capacity.
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'm-s9', teamId: CLUB, userId: 'u-s9', role: 'player', status: 'active', playerGroupId: SEN, medicalAccess: true });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const users9 = JSON.parse(kv.get('app:identity:users'));
  users9.push({ id: 'u-s9', email: 'u-s9@c.test', displayName: 'Name u-s9' });
  kv.set('app:identity:users', JSON.stringify(users9));
  const s = await createSession({ userId: 'u-s9', teamId: CLUB, role: 'player' });
  cookies.set('u-s9', `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  const mine = (await pub('u-s9', 'GET', { resource: 'medical' })).body.cases.map(c => c.id);
  assert.deepEqual(mine, ['case-sen'], 'player capacity → their playing group');
  assert.equal((await pub('u-s9', 'GET', { resource: 'medical', group: U18 })).code, 403, 'forged player read refused');
});

test('MEDICAL: an unlinked player with three active groups is refused, never guessed', async () => {
  await seed(); seedMedicalCases();
  const r = await pub('u-owner', 'POST', { resource: 'medical' },
    { action: 'upsert_case', playerId: 'p-unlinked', title: 'Mystery knock' });
  assert.equal(r.code, 400);
  assert.match(r.body.error, /not linked to a squad/i);
  const rec = JSON.parse(kv.get(`app:medical:${CLUB}`));
  assert.equal(rec.cases.some(c => c.playerId === 'p-unlinked'), false, 'nothing was written');
});

test('MEDICAL: a linked member\'s case takes the group from THEIR membership — body hints ignored', async () => {
  await seed(); seedMedicalCases();
  const r = await pub('u-owner', 'POST', { resource: 'medical' },
    { action: 'upsert_case', userId: 'u-u1', playerId: 'p-u-u1x', title: 'New U18 case', playerGroupId: SEN });
  assert.equal(r.code, 200);
  assert.equal(r.body.case.playerGroupId, U18, 'membership wins over the forged body group');
});

// ── PART 2 — PLAYER FIXTURES derive from the playing group ────────────────
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
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

const FIXTURES = [
  { id: 'fx_legacy', opposition: 'Mons' },                       // pre-group = Seniors
  { id: 'fx_sen', opposition: 'Old Rivals', groupId: SEN },
  { id: 'fx_u18', opposition: 'U18 Cup', groupId: U18 },
  { id: 'fx_wom', opposition: "Women's Derby", groupId: WOM },
];
// A club that predates groups entirely: no fixture carries a groupId. This is
// the ONLY shape for which "keep the whole list" is the right answer.
const PRE_STRUCTURE_FIXTURES = [
  { id: 'fx_a', opposition: 'Mons' },
  { id: 'fx_b', opposition: 'Old Rivals' },
  { id: 'fx_c', opposition: 'Kituro' },
];
function playerFixturesFor(playingGid, fixtures = FIXTURES) {
  return new Function(`
    const state = { fixtures: arguments[0] };
    const _myOperational = { player: { groups: arguments[1] ? [{ id: arguments[1] }] : [] } };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    ${fn('fixtureBelongsToGroup')}
    ${fn('playerContextFixtures')}
    return playerContextFixtures().map(f => f.id);
  `)(fixtures, playingGid);
}

test('PLAYER FIXTURES: each player sees their PLAYING group\'s season — legacy stays Seniors', () => {
  assert.deepEqual(playerFixturesFor(SEN), ['fx_legacy', 'fx_sen'], 'Seniors inherit the uploaded season');
  assert.deepEqual(playerFixturesFor(U18), ['fx_u18'], 'U18 never sees Seniors legacy fixtures');
  assert.deepEqual(playerFixturesFor(WOM), ['fx_wom']);
});

// UPDATED at 69ee109f (player-home group isolation). This assertion used to
// expect the WHOLE list here, because the resolver failed OPEN when it had no
// player group. That was the production defect: a U18 player, or any player
// rendered before their session payload landed, was shown the Seniors season.
//
// The distinction the old assertion missed is that its own fixture set is NOT
// a pre-structure club — three of its four fixtures carry a groupId. UNKNOWN ≠
// LEGACY: in a club that HAS groups, an unresolved player group means unknown,
// and unknown must show nothing group-specific rather than everything. The
// genuine pre-structure case is covered immediately below, unchanged in intent.
test('PLAYER FIXTURES: in a GROUPED club, an unresolved player group shows nothing', () => {
  assert.deepEqual(playerFixturesFor(''), [],
    'no resolved playing group in a grouped club → fail closed, never the whole season');
  assert.deepEqual(playerFixturesFor('grp_not_a_real_group'), [],
    'an unknown group is unknown, not a licence for the full list');
});

test('PLAYER FIXTURES: a genuinely pre-structure club keeps its full legacy list', () => {
  // No fixture carries a groupId, so there is no group boundary to enforce and
  // nothing to leak. A club upgrading to groups must not lose its season.
  assert.deepEqual(playerFixturesFor('', PRE_STRUCTURE_FIXTURES), ['fx_a', 'fx_b', 'fx_c'],
    'pre-structure club, no player group → the whole list is correct');
  assert.deepEqual(playerFixturesFor(SEN, PRE_STRUCTURE_FIXTURES), ['fx_a', 'fx_b', 'fx_c'],
    'and a grouped player in that club still sees it');
});

test('PLAYER FIXTURES: the page renders through the playing-group filter, never coach context', () => {
  const body = fn('renderPlayerFixtures');
  assert.match(body, /playerContextFixtures\(\)/);
  assert.equal(/state\.operationalGroupId/.test(fn('playerContextFixtures')), false,
    'derived from the identity payload, not the operational (coaching) group');
});

test('PLAYER FIXTURES: a player\'s ?fixture= hint at the squad API stays ignored', async () => {
  await seed();
  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  club.fixtures = FIXTURES; kv.set(`app:club:${CLUB}`, JSON.stringify(club));
  const r = await pub('u-s1', 'GET', { type: 'squad', fixture: 'fx_u18' });
  assert.equal(r.code, 200);
  assert.equal(r.body.squad, null, 'answered with the player-facing view (nothing published), not the named fixture');
});

// ── PART 1 — AVAILABILITY BOARD scoping + reminder context ────────────────
test('AVAILABILITY BOARD: rows, counts, chase lists and the inline switcher are group-scoped', () => {
  assert.match(fn('sessionRows'), /operationalPlayers\(\)\.map/, 'board rows');
  const v2 = fn('renderMessageCenterV2');
  assert.match(v2, /const opPlayers\s+= operationalPlayers\(\)/, 'summary counts');
  assert.equal(/state\.players\.length/.test(v2), false, 'no whole-club count remains on the board');
  assert.match(v2, /operationalGroupSwitcherHTML\(\)/, 'inline switcher in the board header');
  const chase = fn('chaseAllNonResponders');
  assert.match(chase, /operationalPlayers\(\)/, 'chase list follows the group');
  assert.match(chase, /group:\s+state\.operationalGroupId \|\| undefined/, 'chase push names the group');
  assert.match(fn('remindNonResponders'), /group:\s+state\.operationalGroupId \|\| undefined/, 'session reminder too');
  assert.match(fn('sendPushToPlayers'), /_pushGroup/, 'the shared push helper is group-stamped');
});

test('REMINDER PUSH: the server narrows delivery to the named group and refuses forged ones', async () => {
  await seed();
  kv.set('app:subscriptions', JSON.stringify([
    { userId: 'u-s1', label: 'Name u-s1', subscription: { endpoint: 'https://127.0.0.1:9/s1', keys: { p256dh: 'x', auth: 'y' } } },
    { userId: 'u-u1', label: 'Name u-u1', subscription: { endpoint: 'https://127.0.0.1:9/u1', keys: { p256dh: 'x', auth: 'y' } } },
    { userId: 'u-w1', label: 'Name u-w1', subscription: { endpoint: 'https://127.0.0.1:9/w1', keys: { p256dh: 'x', auth: 'y' } } },
  ]));
  const forged = await push('u-u18-m', 'POST', {}, { title: 'x', body: 'reminder', audience: 'all', group: SEN });
  assert.equal(forged.code, 403, 'a U18 coach cannot ping Seniors');
  const unknown = await push('u-u18-m', 'POST', {}, { title: 'x', body: 'reminder', audience: 'all', group: 'grp_forged' });
  assert.equal(unknown.code, 404);
  const scoped = await push('u-u18-m', 'POST', {}, { title: 'x', body: 'reminder', audience: 'all', group: U18 });
  assert.equal(scoped.code, 200);
  assert.equal(scoped.body.total, 1, 'delivery narrowed to the ONE U18 subscription — never the whole club');
});

// ── PART 4 — STAFF INVITES: multi-group accessScope + identity-preserving upgrade ──
test('INVITES: a staff invite may grant several groups; every group is validated against the creator', async () => {
  await seed();
  const multi = await invit('u-owner', 'POST', {}, { name: 'New Coach', role: 'coach',
    scope: { level: 'groups', groupIds: [U18, WOM] } });
  assert.equal(multi.code, 201, JSON.stringify(multi.body));
  const forged = await invit('u-owner', 'POST', {}, { name: 'X', role: 'coach',
    scope: { level: 'groups', groupIds: [U18, 'grp_forged'] } });
  assert.equal(forged.code, 404, 'one unknown group refuses the WHOLE invite');
});

test('INVITES: a scoped head coach cannot mint a combination beyond their own authority', async () => {
  await seed();
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'm-hc', teamId: CLUB, userId: 'u-hc', role: 'coach', status: 'active',
    accessProfile: 'head_coach', staffLevel: 'head', accessScope: scope([U18]) });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const usersHc = JSON.parse(kv.get('app:identity:users'));
  usersHc.push({ id: 'u-hc', email: 'u-hc@c.test', displayName: 'Name u-hc' });
  kv.set('app:identity:users', JSON.stringify(usersHc));
  const s = await createSession({ userId: 'u-hc', teamId: CLUB, role: 'coach' });
  cookies.set('u-hc', `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  const over = await invit('u-hc', 'POST', {}, { name: 'X', role: 'coach',
    scope: { level: 'groups', groupIds: [U18, WOM] } });
  assert.equal(over.code, 403, 'they do not manage Women\'s — the combination is refused');
  const ok = await invit('u-hc', 'POST', {}, { name: 'Y', role: 'coach',
    scope: { level: 'groups', groupIds: [U18] } });
  assert.equal(ok.code, 201, 'their own group alone is fine (collapses to the single-group shape)');
  assert.equal(ok.body.invite.scope.groupId, U18, 'single-entry list collapsed to the existing shape');
});

function seedInvite(inv) {
  // Seeded as a pre-namespace record: the legacy list is still read, so this
  // is exactly the shape of an invitation created before invitations were
  // split per club.
  const legacy = JSON.parse(kv.get('ce:invites') || '[]');
  legacy.push({ status: 'pending', createdAt: new Date().toISOString(), teamId: CLUB, ...inv });
  kv.set('ce:invites', JSON.stringify(legacy));
}
const memberOf = uid => JSON.parse(kv.get('app:identity:team_members'))
  .filter(m => m.teamId === CLUB && m.userId === uid);

test('UPGRADE: an existing Seniors player claiming a U18-coach invite stays ONE identity', async () => {
  await seed();
  // s1 already exists as a Seniors player with an account.
  seedInvite({ token: 'U18CoachTok00001', role: 'coach', staffLevel: 'assistant', name: 'Name u-s1',
    email: 'u-s1@c.test', scope: { groupId: U18 } });
  await claimInvite({ token: 'U18CoachTok00001', name: 'Name u-s1', email: 'u-s1@c.test', password: 'realPassword12', allowExisting: true });
  const rows = memberOf('u-s1');
  assert.equal(rows.length, 1, 'no duplicate membership');
  const m = rows[0];
  assert.equal(m.role, 'coach', 'upgraded to staff');
  assert.equal(m.playerGroupId, SEN, 'playerGroupId untouched — still plays Seniors');
  const sc = effectiveAccessScope(m);
  assert.deepEqual(sc.groups.filter(g => g.status === 'active').map(g => g.groupId), [U18],
    'coaching scope is exactly the granted group');
  const users = JSON.parse(kv.get('app:identity:users')).filter(u => u.email === 'u-s1@c.test');
  assert.equal(users.length, 1, 'one account, one login');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE3, { as: 'player' }).map(g => g.id), [SEN], 'plays Seniors');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE3, { as: 'staff' }).map(g => g.id), [U18], 'coaches U18');
});

test('UPGRADE: the U18+Women\'s combination merges into one identity the same way', async () => {
  await seed();
  seedInvite({ token: 'UWCoachTok000001', role: 'coach', staffLevel: 'assistant', name: 'Name u-s1',
    email: 'u-s1@c.test', scope: { groupIds: [U18, WOM] } });
  await claimInvite({ token: 'UWCoachTok000001', name: 'Name u-s1', email: 'u-s1@c.test', password: 'realPassword12', allowExisting: true });
  const m = memberOf('u-s1')[0];
  assert.equal(m.playerGroupId, SEN);
  assert.deepEqual(effectiveAccessScope(m).groups.filter(g => g.status === 'active').map(g => g.groupId).sort(),
    [U18, WOM].sort(), 'both coached groups granted');
  assert.equal(memberOf('u-s1').length, 1);
});

test('UPGRADE: an existing U18 coach claiming a Women\'s invite MERGES scope — nothing lost, nothing extra', async () => {
  await seed();
  seedInvite({ token: 'WomAddTok0000001', role: 'coach', staffLevel: 'assistant', name: 'Name u-u18-m',
    email: 'u-u18-m@c.test', scope: { groupId: WOM } });
  await claimInvite({ token: 'WomAddTok0000001', name: 'Name u-u18-m', email: 'u-u18-m@c.test', password: 'realPassword12', allowExisting: true });
  const m = memberOf('u-u18-m')[0];
  assert.deepEqual(effectiveAccessScope(m).groups.filter(g => g.status === 'active').map(g => g.groupId).sort(),
    [U18, WOM].sort(), 'U18 kept, Women\'s added — never all groups');
  assert.equal(effectiveAccessScope(m).clubWide, false, 'scope never silently becomes club-wide');
});

test('INVITE UI: group-level checkboxes, no team-level boxes, correct scope mapping', () => {
  const control = fn('inviteStaffScopeControl');
  assert.match(control, /data-staff-scope="group"/, 'per-group checkboxes');
  assert.match(control, /data-staff-scope="club"/, 'explicit whole-club option');
  assert.equal(/data-staff-scope="team"/.test(control), false, 'scope is at GROUP level — no team boxes');
  assert.match(control, /groups\.length <= 1\) return ''/, 'single-group club keeps its existing flow');
  const value = fn('inviteStaffScopeValue');
  assert.match(value, /groupIds: gids/, 'several boxes → the multi-group scope');
  assert.match(value, /groupId: gids\[0\]/, 'one box → the existing single-group shape');
  assert.match(fn('adminInviteStaff'), /inviteStaffScopeValue\('adm-staff-scope'\)/);
});

// ── PART 6 — CROSS-GROUP SECURITY MATRIX (representative endpoint per subsystem) ──
test('MATRIX: every subsystem refuses the groups a persona does not hold', async () => {
  await seed();
  kv.set(`app:publish:${CLUB}:group:${fixSeg(SEN)}:training_schedule`, JSON.stringify({ slots: [] }));
  function fixSeg(g) { return g; }
  const expect = async (promise, code, label) => assert.equal((await promise).code, code, label);

  // Availability (coach board read)
  await expect(avail('u-u18-m', 'GET', { resolveRoster: '1', group: SEN }), 403, 'availability: U18 medic → Seniors board');
  await expect(avail('u-owner', 'GET', { resolveRoster: '1', group: WOM }), 200, 'availability: owner → any group');
  // Training (schedule write)
  await expect(pub('u-uw-m', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: SEN, slot: { day: 'Wed', startTime: '18:00' } }), 403, 'training: U18+Wom coach → Seniors');
  // Fixtures (create)
  await expect(pub('u-wom-m', 'POST', { resource: 'fixtures' },
    { action: 'create', groupId: U18, fixture: { opposition: 'Sneak', date: '2026-09-01' } }), 403, 'fixtures: Wom coach → U18');
  // Match Centre (matchday-teams answers only their groups)
  const teams = await pub('u-uw-m', 'GET', { resource: 'matchday-teams' });
  assert.deepEqual(teams.body.teams.map(t => t.id).sort(), ['team_u18d', 'team_u18p', 'team_womd', 'team_womp'],
    'match centre: U18+Wom coach gets exactly their four teams');
  // Messaging (recipients)
  assert.equal((await chat('u-uw-m', 'GET', `/api/chat?action=group_recipients&groupId=${SEN}`)).code, 403,
    'messaging: U18+Wom coach → Seniors recipients');
  // Medical
  await expect(pub('u-wom-m', 'GET', { resource: 'medical', group: U18 }), 403, 'medical: Wom medic → U18');
  // Players: coach capacity denied outright
  await expect(pub('u-s1', 'GET', { resource: 'matchday-teams' }), 403, 'a player has no matchday-teams surface');
});

// ── PART 10 — ONBOARDING DRY RUN: Seniors-only club → 3 groups / 6 teams ──
test('DRY RUN: create U18 + Women\'s with four teams, invite and upgrade — every new group starts empty', async () => {
  // Start from TODAY's production shape: Seniors only, with legacy data.
  const structure1 = { version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
    teams: [
      { id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' },
      { id: 'team_dev',     groupId: SEN, name: 'Premier Development', status: 'active' },
    ] };
  // Alex starts as a plain Seniors PLAYER here — the dry run itself performs
  // his upgrade to U18+Women's coach, exactly as production will.
  await seed(structure1, MEMBERS.filter(m => ['u-owner', 'u-s1', 'u-alex'].includes(m.userId))
    .map(m => m.userId === 'u-alex' ? { ...m, role: 'player', accessScope: undefined } : m));
  // Legacy club data that must stay Seniors-only afterwards.
  kv.set(`app:availability:${CLUB}:tue`, JSON.stringify({ k: { userId: 'u-s1', response: 'available' } }));
  kv.set(`app:publish:${CLUB}:training_schedule`, JSON.stringify({ slots: [
    { id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, sessionId: 'tue' }] }));
  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  club.fixtures = [{ id: 'fx_legacy', opposition: 'Mons', date: '2026-08-22' }];
  kv.set(`app:club:${CLUB}`, JSON.stringify(club));

  // 1-2: create the groups and teams through the REAL structure API.
  const g1 = await pub('u-owner', 'POST', { resource: 'structure' }, { op: 'create_group', name: 'U18' });
  assert.equal(g1.code, 200);
  const u18id = g1.body.group.id;
  assert.equal((await pub('u-owner', 'POST', { resource: 'structure' }, { op: 'create_team', groupId: u18id, name: 'U18 Premier' })).code, 200);
  assert.equal((await pub('u-owner', 'POST', { resource: 'structure' }, { op: 'create_team', groupId: u18id, name: 'U18 Premier Development' })).code, 200);
  const g2 = await pub('u-owner', 'POST', { resource: 'structure' }, { op: 'create_group', name: "Women's" });
  const womid = g2.body.group.id;
  assert.equal((await pub('u-owner', 'POST', { resource: 'structure' }, { op: 'create_team', groupId: womid, name: "Women's Premier" })).code, 200);
  const last = await pub('u-owner', 'POST', { resource: 'structure' }, { op: 'create_team', groupId: womid, name: "Women's Premier Development" });
  assert.equal(last.code, 200);
  assert.equal(last.body.structure.groups.filter(g => g.status === 'active').length, 3, 'three groups');
  assert.equal(last.body.structure.teams.filter(t => t.status === 'active').length, 6, 'six teams');

  // 3: invites — one player and one coach per new group, via the REAL API.
  const mk = (name, role, extra) => invit('u-owner', 'POST', {}, { name, role, ...extra });
  assert.equal((await mk('New U18 Player', 'player', { playerGroupId: u18id })).code, 201);
  assert.equal((await mk('New Wom Player', 'player', { playerGroupId: womid })).code, 201);
  assert.equal((await mk('New U18 Coach', 'coach', { scope: { groupId: u18id } })).code, 201);
  assert.equal((await mk('New Wom Coach', 'coach', { scope: { groupId: womid } })).code, 201);
  const pending = allStoredInvites(kv).filter(i => i.status === 'pending');
  assert.equal(pending.length, 4);
  const tokenOf = name => pending.find(i => i.name === name).token;
  const claims = [
    { token: tokenOf('New U18 Player'), name: 'New U18 Player', email: 'u18p@c.test' },
    { token: tokenOf('New Wom Player'), name: 'New Wom Player', email: 'womp@c.test' },
    { token: tokenOf('New U18 Coach'), name: 'New U18 Coach', email: 'u18c@c.test' },
    { token: tokenOf('New Wom Coach'), name: 'New Wom Coach', email: 'womc@c.test' },
  ];
  for (const c of claims) await claimInvite({ ...c, password: 'realPassword12' });

  // 4: upgrades — existing Seniors players become U18 / U18+Women's coaches.
  seedInvite({ token: 'UpgradeTok000001', role: 'coach', staffLevel: 'assistant', name: 'Name u-s1',
    email: 'u-s1@c.test', scope: { groupId: u18id } });
  await claimInvite({ token: 'UpgradeTok000001', name: 'Name u-s1', email: 'u-s1@c.test', password: 'realPassword12', allowExisting: true });
  seedInvite({ token: 'UpgradeTok000002', role: 'coach', staffLevel: 'assistant', name: 'Name u-alex',
    email: 'u-alex@c.test', scope: { groupIds: [u18id, womid] } });
  await claimInvite({ token: 'UpgradeTok000002', name: 'Name u-alex', email: 'u-alex@c.test', password: 'realPassword12', allowExisting: true });

  // 5: verify identities and scopes.
  const structure = last.body.structure;
  const members = JSON.parse(kv.get('app:identity:team_members')).filter(m => m.teamId === CLUB);
  const by = uid => members.find(m => m.userId === uid);
  const byEmail = email => {
    const u = JSON.parse(kv.get('app:identity:users')).find(x => x.email === email);
    return members.find(m => m.userId === u?.id);
  };
  const u18Player = byEmail('u18p@c.test');
  assert.equal(u18Player.playerGroupId, u18id, 'invited player plays U18');
  assert.deepEqual(resolveEligibility(u18Player, structure).teamIds.sort(),
    structure.teams.filter(t => t.groupId === u18id).map(t => t.id).sort(), 'eligible for the two U18 teams only');
  const u18Coach = byEmail('u18c@c.test');
  assert.deepEqual(operationalGroupsFor(u18Coach, structure, { as: 'staff' }).map(g => g.id), [u18id]);
  const s1 = by('u-s1');
  assert.equal(s1.playerGroupId, SEN, 'upgraded player still plays Seniors');
  assert.deepEqual(operationalGroupsFor(s1, structure, { as: 'staff' }).map(g => g.id), [u18id], 'and coaches U18');
  const alex = by('u-alex');
  assert.equal(alex.playerGroupId, SEN);
  assert.deepEqual(operationalGroupsFor(alex, structure, { as: 'staff' }).map(g => g.id).sort(), [u18id, womid].sort());
  assert.equal(members.filter(m => m.userId === 'u-s1').length, 1, 'one membership per person throughout');

  // 6: every new group starts EMPTY; Seniors legacy stays Seniors.
  const u18Sched = await pub('u-owner', 'GET', { resource: 'training-schedule', group: u18id });
  assert.deepEqual(u18Sched.body.slots, [], 'U18 training starts empty');
  const senSched = await pub('u-owner', 'GET', { resource: 'training-schedule', group: SEN });
  assert.equal(senSched.body.slots.length, 1, 'Seniors keep their legacy Tuesday');
  const u18Board = await avail('u-owner', 'GET', { resolveRoster: '1', group: u18id });
  assert.deepEqual(u18Board.body.resolved, {}, 'U18 availability starts empty');
  const senBoard = await avail('u-owner', 'GET', { resolveRoster: '1', group: SEN });
  assert.ok(senBoard.body.resolved['u-s1'], 'Seniors legacy availability intact');
  // Legacy fixture belongs to Seniors only (client rule proven above; server groupOf):
  const fxCreate = await pub('u-owner', 'POST', { resource: 'fixtures' },
    { action: 'create', groupId: u18id, fixture: { opposition: 'First U18 match', date: '2026-09-05' } });
  assert.equal(fxCreate.code, 201, 'new U18 fixtures can be created after onboarding');
});

// ── PART 5 — the empty-scope rule that decides production readiness ───────
test('SCOPE RULES: what production staff records become once three groups exist', async () => {
  const { default: _ } = { default: null };
  const legacyNullScope = { id: 'm-l', teamId: CLUB, userId: 'u-l', role: 'coach', status: 'active', accessProfile: 'coach' };
  const explicitlyEmpty = { id: 'm-e', teamId: CLUB, userId: 'u-e', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [], teams: [] } };
  const owner = { id: 'm-o', teamId: CLUB, userId: 'u-o', role: 'admin', status: 'active', isOwner: true };
  assert.deepEqual(operationalGroupsFor(legacyNullScope, STRUCTURE3, { as: 'staff' }).map(g => g.id), [SEN],
    'NO stored scope → the legacy derivation pins them to the INITIAL group — never ambiguous, never club-wide');
  assert.deepEqual(operationalGroupsFor(explicitlyEmpty, STRUCTURE3, { as: 'staff' }), [],
    'EXPLICITLY-empty scope → no groups once several exist — flag these for a manual decision');
  assert.equal(effectiveAccessScope(owner).clubWide, true, 'owner stays club-wide across all three');
});
