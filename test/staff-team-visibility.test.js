/**
 * BUILD AE — STAFF TEAM VISIBILITY, end to end.
 *
 * "Other coaches and managers log in but cannot see the team." This suite
 * drives the REAL server handlers with the REAL production shapes (from the
 * read-only audit of the live club): a group club — Seniors, U18 (holding two
 * teams), Women's — staffed by
 *
 *   · an assistant coach scoped to U18 who ALSO PLAYS in Seniors (dual-role,
 *     the live shape of every U18 coach in production),
 *   · an admin/assistant scoped to U18 with a manager profile,
 *   · a Seniors-only assistant,
 *   · a club-wide head coach (multi-group, mustChoose),
 *   · an ordinary U18 player,
 *
 * and asserts each of them resolves exactly the operational context the spec
 * demands — server payload AND the client's adoption of it — with the server
 * refusing every cross-group request regardless of what a client asserts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-visibility.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(args[0]) || []).slice(0);
  if (command === 'LTRIM' || command === 'EXPIRE') result = 'OK';
  if (command === 'SCAN') { const re = new RegExp('^' + String(args[2] || '*').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const store = await import('../api/_identityStore.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}

const CLUB = 'club-vis';
const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_wom';
const scoped = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  // CASE A — the production shape: U18 assistant coach who PLAYS in Seniors.
  { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active',
    accessProfile: 'coach', accessScope: scoped([U18]), playerGroupId: SEN },
  // CASE B — U18 manager (admin/assistant with manager profile, live shape).
  { id: 'm-u18m', teamId: CLUB, userId: 'u-u18m', role: 'admin', staffLevel: 'assistant', status: 'active',
    accessProfile: 'manager', accessScope: scoped([U18]) },
  // CASE C — multi-group staff (U18 + Seniors, explicitly).
  { id: 'm-multi', teamId: CLUB, userId: 'u-multi', role: 'coach', staffLevel: 'assistant', status: 'active',
    accessProfile: 'coach', accessScope: scoped([U18, SEN]) },
  // CASE D — Seniors-only assistant.
  { id: 'm-senc', teamId: CLUB, userId: 'u-senc', role: 'coach', staffLevel: 'assistant', status: 'active',
    accessProfile: 'coach', accessScope: scoped([SEN]) },
  // CASE E — ordinary U18 player.
  { id: 'm-p18', teamId: CLUB, userId: 'u-p18', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-psen', teamId: CLUB, userId: 'u-psen', role: 'player', status: 'active', playerGroupId: SEN },
];

function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Vis FC' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:player_profiles', JSON.stringify([
    { userId: 'u-p18', teamId: CLUB, displayName: 'U18 Player', legacyPlayerId: '' },
    { userId: 'u-psen', teamId: CLUB, displayName: 'Sen Player', legacyPlayerId: '' },
    { userId: 'u-u18c', teamId: CLUB, displayName: 'Dual Coach', legacyPlayerId: '' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' }],
    teams: [
      { id: 't-sen', name: 'Premier', groupId: SEN, status: 'active' },
      { id: 't-u18a', name: 'U18 Premier', groupId: U18, status: 'active' },
      { id: 't-u18b', name: 'U18 Second', groupId: U18, status: 'active' }] }));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Vis FC', fixtures: [
    { id: 'fx-sen', team: 'Premier', opposition: 'A', date: '2026-09-12', groupId: SEN },
    { id: 'fx-u18', team: 'U18 Premier', opposition: 'B', date: '2026-09-12', groupId: U18 }] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p-18', name: 'U18 Player', userId: 'u-p18' },
    { id: 'p-sen', name: 'Sen Player', userId: 'u-psen' },
    { id: 'p-dual', name: 'Dual Coach', userId: 'u-u18c' }] }));
  kv.set(`app:publish:${CLUB}:group:${U18}:sessions`, JSON.stringify([
    { id: 'tue', title: 'U18 Tuesday', date: '2026-09-08', type: 'Training' }]));
}

function response() {
  return { statusCode: null, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
}
async function call(handler, userId, method, query, body) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await store.createSession({ userId, teamId: CLUB, role: m.role });
  const res = response();
  await handler({ method, url: '/api/x?' + query,
    query: Object.fromEntries(new URLSearchParams(query)),
    headers: { cookie: `${store.SESSION_COOKIE}=${encodeURIComponent(s.token)}` },
    body }, res);
  return res;
}
const pub = (u, q, method = 'GET', body) => call(publishHandler, u, method, q, body);
const avail = (u, q) => call(availabilityHandler, u, 'GET', q);

/** The session payload the client adopts — via the same computation login and
 *  session reads share (withIdentityComputed → operationalContextFor). */
async function sessionPayloadFor(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await store.createSession({ userId, teamId: CLUB, role: m.role });
  return store.resolveSession(s.token);
}

/** The client's adoption of that payload: real adoptIdentityPayload +
 *  resolveOperationalGroup over a minimal world. */
function adoptOnClient(payload, { activeView = 'coach', priorGroupId = null } = {}) {
  const renders = [];
  const w = new Function('payload', 'renders', `
    "use strict";
    const state = { activeView: '${activeView}', operationalGroupId: ${JSON.stringify(priorGroupId)} };
    let _myPermissions = null, _myPlatformRole = '', _myOperational = null;
    let _myMembership = null, _myMemberships = [];
    let _verifyNotice = null;
    function render() { renders.push(state.operationalGroupId); }
    function renderVerifyEmailBanner() {}
    function syncTrainingStateToGroup() {}
    function operationalCapacity() { return state.activeView === 'player' ? 'player' : 'staff'; }
    ${extractFn(html, 'resolveOperationalGroup')}
    ${extractFn(html, 'operationalGroups')}
    ${extractFn(html, 'adoptIdentityPayload')}
    adoptIdentityPayload(payload);
    return { state, groups: operationalGroups(), permissions: _myPermissions, renders };
  `)(payload, renders);
  return w;
}

// ─────────────── CASE A — U18 coach (dual-role, the live shape) ─────────────

test('CASE A: the U18 coach\'s session payload offers U18 as their staff group', async () => {
  seed();
  const p = await sessionPayloadFor('u-u18c');
  assert.ok(p?.operational, 'the payload carries the operational context');
  assert.deepEqual(p.operational.staff.groups.map(g => g.id), [U18], 'staff side: U18 and only U18');
  assert.equal(p.operational.staff.defaultGroupId, U18, 'one group needs no choosing');
  assert.equal(p.operational.staff.mustChoose, false);
  // dual-role: the player side is where they PLAY, kept apart
  assert.deepEqual(p.operational.player.groups.map(g => g.id), [SEN], 'they play in Seniors');
});

test('CASE A: a fresh client adoption lands the coach IN U18 — no stale state needed', async () => {
  seed();
  const p = await sessionPayloadFor('u-u18c');
  const c = adoptOnClient(p, { activeView: 'coach', priorGroupId: null });
  assert.equal(c.state.operationalGroupId, U18, 'the group in force is U18, from the server\'s answer');
  assert.deepEqual(c.groups.map(g => g.id), [U18]);
  assert.ok(c.permissions.includes('publish_training'), 'coach permissions adopted');
});

test('CASE A: a stale device group (Seniors) is corrected to U18 on adoption, with a repaint', async () => {
  seed();
  const p = await sessionPayloadFor('u-u18c');
  // The device last operated Seniors (pre-scoping era). The server no longer
  // allows that group for this coach, so adoption must move them and repaint.
  const c = adoptOnClient(p, { activeView: 'coach', priorGroupId: SEN });
  assert.equal(c.state.operationalGroupId, U18, 'stale Seniors does not survive');
  assert.ok(c.renders.length >= 1, 'the change after first paint repaints the screens');
});

test('CASE A: U18 structure (both teams), roster, availability, training and fixtures all answer', async () => {
  seed();
  const structure = await pub('u-u18c', 'resource=structure');
  assert.equal(structure.statusCode, 200, 'a scoped coach may read the structure');
  const teams = structure.body.structure.teams.filter(t => t.groupId === U18).map(t => t.name).sort();
  assert.deepEqual(teams, ['U18 Premier', 'U18 Second'], 'both U18 teams are visible');

  const roster = await pub('u-u18c', `resource=roster&group=${U18}`);
  assert.equal(roster.statusCode, 200);
  assert.deepEqual(roster.body.players.map(p => p.name), ['U18 Player'], 'U18 players only');

  const av = await avail('u-u18c', `resolveRoster=1&group=${U18}`);
  assert.equal(av.statusCode, 200, 'availability answers for the authorized group');

  const training = await pub('u-u18c', `resource=training-schedule&group=${U18}`);
  assert.equal(training.statusCode, 200, 'training schedule answers for U18');

  const club = await pub('u-u18c', 'resource=club');
  assert.equal(club.statusCode, 200);
  assert.ok(club.body.club.fixtures.some(f => f.id === 'fx-u18'), 'the U18 fixture is in the club record');
});

test('CASE A: the same coach is REFUSED every Seniors read the client could forge', async () => {
  seed();
  for (const q of [`resource=roster&group=${SEN}`, `resource=training-schedule&group=${SEN}`]) {
    const r = await pub('u-u18c', q);
    assert.equal(r.statusCode, 403, `${q} must be refused`);
  }
  const av = await avail('u-u18c', `resolveRoster=1&group=${SEN}`);
  assert.ok(av.statusCode === 403 || av.statusCode === 401, 'availability refuses the forged group');
});

// ─────────────── CASE B — U18 manager ───────────────────────────────────────

test('CASE B: the U18 manager resolves U18 and reads it; Seniors is refused', async () => {
  seed();
  const p = await sessionPayloadFor('u-u18m');
  assert.deepEqual(p.operational.staff.groups.map(g => g.id), [U18]);
  assert.equal(p.operational.staff.defaultGroupId, U18);
  const c = adoptOnClient(p);
  assert.equal(c.state.operationalGroupId, U18);
  assert.ok(c.permissions.includes('manage_players'), 'manager holds roster admin');
  assert.ok(!c.permissions.includes('publish_training'), 'but never coaching publication');
  assert.equal((await pub('u-u18m', `resource=roster&group=${U18}`)).statusCode, 200);
  assert.equal((await pub('u-u18m', `resource=roster&group=${SEN}`)).statusCode, 403);
});

// ─────────────── CASE C — multi-group staff ─────────────────────────────────

test('CASE C: multi-group staff get both groups, must choose, and can read only those', async () => {
  seed();
  const p = await sessionPayloadFor('u-multi');
  assert.deepEqual(p.operational.staff.groups.map(g => g.id).sort(), [SEN, U18].sort());
  assert.equal(p.operational.staff.mustChoose, true, 'two groups: nothing is guessed');
  const c = adoptOnClient(p);
  assert.deepEqual(c.groups.map(g => g.id).sort(), [SEN, U18].sort(), 'the switcher offers exactly the two');
  assert.equal((await pub('u-multi', `resource=roster&group=${U18}`)).statusCode, 200);
  assert.equal((await pub('u-multi', `resource=roster&group=${SEN}`)).statusCode, 200);
  assert.equal((await pub('u-multi', `resource=roster&group=${WOM}`)).statusCode, 403,
    'the third group was never granted');
});

// ─────────────── CASE D — Seniors-only staff ────────────────────────────────

test('CASE D: Seniors-only staff never receive U18', async () => {
  seed();
  const p = await sessionPayloadFor('u-senc');
  assert.deepEqual(p.operational.staff.groups.map(g => g.id), [SEN]);
  const c = adoptOnClient(p);
  assert.equal(c.state.operationalGroupId, SEN);
  assert.equal((await pub('u-senc', `resource=roster&group=${U18}`)).statusCode, 403);
  const r = await pub('u-senc', `resource=roster&group=${SEN}`);
  assert.deepEqual(r.body.players.map(x => x.name).sort(), ['Dual Coach', 'Sen Player'],
    'their own group answers — including the dual-role coach who PLAYS there');
});

// ─────────────── CASE E — ordinary player ───────────────────────────────────

test('CASE E: an ordinary player gains no staff visibility from the group existing', async () => {
  seed();
  const p = await sessionPayloadFor('u-p18');
  assert.deepEqual(p.operational.staff.groups, [], 'no staff side at all');
  assert.deepEqual(p.operational.player.groups.map(g => g.id), [U18], 'they play in U18');
  assert.equal((await pub('u-p18', 'resource=structure')).statusCode, 403, 'structure is staff-only');
  assert.equal((await pub('u-p18', `resource=roster&group=${U18}`)).statusCode, 403, 'roster admin is staff-only');
});

// ─────────────── the group model itself ─────────────────────────────────────

test('U18 Premier and U18 Second are TEAMS inside the one U18 group, not groups', async () => {
  seed();
  const structure = await pub('u-owner', 'resource=structure');
  const s = structure.body.structure;
  assert.deepEqual(s.groups.filter(g => g.status === 'active').map(g => g.id).sort(),
    [SEN, U18, WOM].sort(), 'three groups, and neither U18 team is among them');
  assert.ok(s.teams.every(t => t.groupId), 'every team belongs to a group');
  assert.deepEqual(s.teams.filter(t => t.groupId === U18).map(t => t.name).sort(),
    ['U18 Premier', 'U18 Second']);
});

test('the client adoption never invents a group the server did not offer', async () => {
  seed();
  const p = await sessionPayloadFor('u-u18c');
  // A hostile/corrupt device asserts Women's before adoption.
  const c = adoptOnClient(p, { priorGroupId: WOM });
  assert.equal(c.state.operationalGroupId, U18, 'the unauthorized assertion is discarded');
});
