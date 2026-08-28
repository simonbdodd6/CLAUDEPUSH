/**
 * GROUP ISOLATION REGRESSION — Match Centre players + staff + Training writes,
 * across the REAL four-group production shape (Seniors/U18/U16/Women's).
 *
 * Root cause pinned here (client): "admin data not yet loaded" was
 * indistinguishable from "pre-structure club", so operationalPlayers() and
 * the Match Centre staff filter FAILED OPEN to whole-club lists — exactly
 * what an installed PWA shows when its admin-data fetch aborts (and the
 * `attempted` latch then blocked every retry for the session). The fix:
 * UNKNOWN ≠ LEGACY — pending data fails closed, the load retries, and a
 * loaded pre-structure club keeps its documented full-roster behaviour.
 *
 * Training (server) is proven SOUND: every mutation asserts the target group
 * against the caller's own staff scope — the observed "other coaches
 * creating sessions" is legitimate in-scope creation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.group-iso.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

const CLUB = 'boitsfort';
const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', U16 = 'grp_402a580b', WOM = 'grp_1b0fb56b';
const GROUPS = { SEN, U18, U16, WOM };

// ─── operationalPlayers over the REAL function ─────────────────────────────
function poolHarness({ gid, loaded, members, rows, canManage = true }) {
  return new Function(`
    "use strict";
    const state = { operationalGroupId: ${JSON.stringify(gid)} };
    const _adminData = { loaded: ${JSON.stringify(loaded)}, members: ${JSON.stringify(members)} };
    const calls = { ensure: 0 };
    function canonicalVisiblePlayers() { return ${JSON.stringify(rows)}; }
    function canI() { return ${JSON.stringify(canManage)}; }
    function ensureAdminData() { calls.ensure++; }
    ${fn('clubUsesPlayerGroups')}
    ${fn('operationalPlayers')}
    return { pool: operationalPlayers().map(p => p.name), calls };
  `)();
}

const MEMBERS = [
  { id: 'm1', teamId: CLUB, userId: 'u-sen', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm2', teamId: CLUB, userId: 'u-u18', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm3', teamId: CLUB, userId: 'u-u16', role: 'player', status: 'active', playerGroupId: U16 },
  { id: 'm4', teamId: CLUB, userId: 'u-wom', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm5', teamId: CLUB, userId: 'u-test', role: 'player', status: 'active' },   // unassigned "test" record
];
const ROWS = [
  { id: 'p1', userId: 'u-sen', name: 'Senior One' },
  { id: 'p2', userId: 'u-u18', name: 'U18 One' },
  { id: 'p3', userId: 'u-u16', name: 'U16 One' },
  { id: 'p4', userId: 'u-wom', name: 'Wom One' },
  { id: 'p5', userId: 'u-test', name: 'Test Medical' },
  { id: 'p6', name: 'Orphan NoUser' },                                              // roster row with no account
];

test('four-group player pool: every group sees exactly its own players; unassigned/test and orphan rows appear nowhere', () => {
  const expect = { SEN: ['Senior One'], U18: ['U18 One'], U16: ['U16 One'], WOM: ['Wom One'] };
  for (const [label, gid] of Object.entries(GROUPS)) {
    const { pool } = poolHarness({ gid, loaded: true, members: MEMBERS, rows: ROWS });
    assert.deepEqual(pool, expect[label], `${label} pool`);
  }
});

test('PENDING admin data fails CLOSED (the PWA leak): empty pool + a (re)load request, never the whole club', () => {
  const { pool, calls } = poolHarness({ gid: SEN, loaded: false, members: [], rows: ROWS });
  assert.deepEqual(pool, [], 'no players painted while the membership list is unknown');
  assert.equal(calls.ensure, 1, 'the pool asks for the data it needs');
});

test('a LOADED pre-structure club (no grouped memberships) keeps the documented full roster', () => {
  const flat = MEMBERS.map(m => ({ ...m, playerGroupId: undefined }));
  const { pool } = poolHarness({ gid: SEN, loaded: true, members: flat, rows: ROWS });
  assert.equal(pool.length, ROWS.length, 'legacy behaviour intact once data has genuinely loaded');
});

test('group switch fully re-resolves the pool — no stale players can survive a Seniors→U18→U16→Womens→Seniors tour', () => {
  const tour = ['SEN', 'U18', 'U16', 'WOM', 'SEN'];
  const seen = tour.map(label => poolHarness({ gid: GROUPS[label], loaded: true, members: MEMBERS, rows: ROWS }).pool);
  assert.deepEqual(seen[0], seen[4], 'returning to Seniors gives the identical Seniors pool');
  for (let i = 1; i < 4; i++) {
    assert.equal(seen[i].some(n => seen[0].includes(n)), false, `no Seniors name leaks into ${tour[i]}`);
  }
});

// ─── ensureAdminData retry (the latch that froze the PWA) ──────────────────
test('a failed admin-data load retries after backoff instead of latching for the whole session', () => {
  const h = new Function(`
    "use strict";
    const calls = { loads: 0 };
    let _adminData = { loaded: false, loading: false, attempted: true };
    let _adminDataAttemptAt = 0;                    // failure long ago
    function canI() { return true; }
    function loadAdminData() { calls.loads++; }
    ${fn('ensureAdminData')}
    ensureAdminData();                              // stale failure → retry
    _adminDataAttemptAt = Date.now();               // fresh failure → backoff holds
    ensureAdminData();
    return calls;
  `)();
  assert.equal(h.loads, 1, 'retries once the backoff elapses, not before');
});

// ─── Match Centre staff: four-group matrix with REAL server access ids ─────
const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { SESSION_COOKIE } = store;
function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function callPublish(query, body, session, method = 'GET') {
  const r = res();
  await publishHandler({ method, query, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` }, body: body || {} }, r);
  return r;
}

const scope = (...gids) => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const STAFF = [
  { id: 's-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head', isOwner: true, status: 'active', accessProfile: 'full' },
  { id: 's-sen', teamId: CLUB, userId: 'u-c-sen', role: 'coach', staffLevel: 'assistant', status: 'active', accessScope: scope(SEN) },
  { id: 's-u18', teamId: CLUB, userId: 'u-c-u18', role: 'coach', staffLevel: 'assistant', status: 'active', accessScope: scope(U18) },
  { id: 's-u16', teamId: CLUB, userId: 'u-c-u16', role: 'coach', staffLevel: 'assistant', status: 'active', accessScope: scope(U16) },
  { id: 's-wom', teamId: CLUB, userId: 'u-c-wom', role: 'coach', staffLevel: 'assistant', status: 'active', accessScope: scope(WOM) },
  { id: 's-med16', teamId: CLUB, userId: 'u-m-u16', role: 'medical', status: 'active', accessScope: scope(U16) },
];
function seedClub() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify([...STAFF, ...MEMBERS]));
  kv.set('app:identity:users', JSON.stringify([...STAFF, ...MEMBERS].map(m =>
    ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId, role: m.role }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
      { id: U16, name: 'U16', type: 'age-grade', status: 'active' },
      { id: WOM, name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [
      { id: 't-sen', groupId: SEN, name: 'Premier', status: 'active' },
      { id: 't-u18', groupId: U18, name: 'U18 Premier', status: 'active' },
      { id: 't-u16', groupId: U16, name: 'U16 Premier', status: 'active' },
      { id: 't-wom', groupId: WOM, name: "Women's Premier", status: 'active' },
    ] }));
}
async function sessionFor(userId, role = 'coach') {
  return store.createSession({ userId, teamId: CLUB, role });
}

async function realAccessIds() {
  const owner = await sessionFor('u-owner');
  const r = await callPublish({ resource: 'structure' }, null, owner);
  assert.equal(r.statusCode, 200);
  return {
    clubWideStaffIds: r.body.clubWideStaffIds || [],
    groupStaffIds: Object.fromEntries(Object.entries(r.body.counts?.groups || {})
      .map(([gid, g]) => [gid, g.staffUserIds || []])),
  };
}

function staffPanelNames(access, fxGroupId) {
  const users = STAFF.map(m => ({ id: m.userId, role: m.role, name: m.userId }));
  return new Function(`
    "use strict";
    const state = { users: ${JSON.stringify(users)}, currentUserId: 'u-viewer', operationalGroupId: '' };
    const _adminData = { loaded: true, structureAccess: ${JSON.stringify(access)} };
    const _coachDraftsList = [];
    const CE_INITIAL_GROUP_ID = ${JSON.stringify(SEN)};
    function isCoach() { return true; }
    function esc(v) { return String(v == null ? '' : v); }
    function _draftTimeAgo() { return ''; }
    const _MC_STAFF_ROLE_LABEL = { coach: 'Coach', admin: 'Admin', medical: 'Medical' };
    function matchCentreSideId() { return ''; }
    function matchCentreSelectedSide() { return null; }
    function matchCentreSelectedFixture() { return { id: 'fx', groupId: ${JSON.stringify(fxGroupId)} }; }
    function matchCentreFixtureId() { return 'fx'; }
    function mcFixtureDateLabel() { return ''; }
    ${fn('mcComparePanelHTML')}
    const html = mcComparePanelHTML();
    return ${JSON.stringify(STAFF.map(s => s.userId))}.filter(u => html.includes(u));
  `)();
}

test('four-group staff matrix from REAL server access ids: each group-only staffer appears only in their group; club-wide everywhere', async () => {
  seedClub();
  const access = await realAccessIds();
  const matrix = {
    [SEN]: ['u-owner', 'u-c-sen'],
    [U18]: ['u-owner', 'u-c-u18'],
    [U16]: ['u-owner', 'u-c-u16', 'u-m-u16'],
    [WOM]: ['u-owner', 'u-c-wom'],
  };
  for (const [gid, expected] of Object.entries(matrix)) {
    assert.deepEqual(staffPanelNames(access, gid).sort(), expected.sort(), `staff on fixture of ${gid}`);
  }
  // A legacy unscoped fixture is INITIAL-group data — Seniors staff, never everyone.
  assert.deepEqual(staffPanelNames(access, '').sort(), matrix[SEN].sort(), 'legacy fixture = Seniors staff only');
});

test('staff panel with PENDING access ids shows NO other staff (fail closed), never the whole club', async () => {
  const names = new Function(`
    "use strict";
    const state = { users: ${JSON.stringify(STAFF.map(m => ({ id: m.userId, role: m.role, name: m.userId })))}, currentUserId: 'u-viewer', operationalGroupId: '' };
    const _adminData = { loaded: false };
    const _coachDraftsList = [];
    const CE_INITIAL_GROUP_ID = ${JSON.stringify(SEN)};
    function isCoach() { return true; }
    function esc(v) { return String(v == null ? '' : v); }
    function _draftTimeAgo() { return ''; }
    const _MC_STAFF_ROLE_LABEL = { coach: 'Coach', admin: 'Admin', medical: 'Medical' };
    function matchCentreSideId() { return ''; }
    function matchCentreSelectedSide() { return null; }
    function matchCentreSelectedFixture() { return { id: 'fx', groupId: ${JSON.stringify(SEN)} }; }
    function matchCentreFixtureId() { return 'fx'; }
    function mcFixtureDateLabel() { return ''; }
    ${fn('mcComparePanelHTML')}
    const html = mcComparePanelHTML();
    return ${JSON.stringify(STAFF.map(s => s.userId))}.filter(u => html.includes(u));
  `)();
  assert.deepEqual(names, [], 'unknown access = nobody painted, not everybody');
});

// ─── TRAINING AUTHORIZATION MATRIX (real publish handler) ──────────────────
const trainingKeyFor = gid => `app:publish:${CLUB}:group:${gid}:training`;
const trainingSnapshot = () => JSON.stringify([...kv.entries()].filter(([k]) => k.includes(':training')).sort());

async function saveTraining(session, gid, id) {
  return callPublish({ resource: 'training', audience: 'coach' }, { session: { id, title: `S-${id}` }, group: gid }, session, 'POST');
}

test('training write matrix: every scoped coach writes ONLY their own group; refusals mutate nothing', async () => {
  seedClub();
  const coaches = {
    [SEN]: await sessionFor('u-c-sen'), [U18]: await sessionFor('u-c-u18'),
    [U16]: await sessionFor('u-c-u16'), [WOM]: await sessionFor('u-c-wom'),
  };
  const gids = [SEN, U18, U16, WOM];
  for (const own of gids) {
    for (const target of gids) {
      const before = trainingSnapshot();
      const r = await saveTraining(coaches[own], target, `t-${own}-${target}`);
      if (own === target) {
        assert.equal(r.statusCode, 200, `coach of ${own} may write ${target}`);
        const stored = JSON.parse(kv.get(trainingKeyFor(target)) || '{}');
        assert.ok(stored[`t-${own}-${target}`], 'landed in exactly the target group key');
        for (const other of gids.filter(g => g !== target)) {
          const o = JSON.parse(kv.get(trainingKeyFor(other)) || '{}');
          assert.equal(o[`t-${own}-${target}`], undefined, `nothing bled into ${other}`);
        }
      } else {
        assert.equal(r.statusCode, 403, `coach of ${own} REFUSED for ${target}`);
        assert.equal(trainingSnapshot(), before, 'refusal is zero-mutation');
      }
    }
  }
});

test('club-wide admin may write every group; forged/missing group on a scoped writer fails safely', async () => {
  seedClub();
  const owner = await sessionFor('u-owner');
  for (const gid of [SEN, U18, U16, WOM]) {
    const r = await saveTraining(owner, gid, `own-${gid}`);
    assert.equal(r.statusCode, 200, `club-wide admin writes ${gid}`);
  }
  const u16 = await sessionFor('u-c-u16');
  const forged = await saveTraining(u16, 'grp_nonexistent', 'forge-1');
  assert.ok([403, 404].includes(forged.statusCode), 'unknown/forged group refused');
  const before = trainingSnapshot();
  const missing = await callPublish({ resource: 'training', audience: 'coach' }, { session: { id: 'no-group', title: 'X' } }, u16, 'POST');
  // A single-group coach defaults to their one group — never to Seniors.
  assert.equal(missing.statusCode, 200, 'single-scope coach defaults to their own group');
  const u16Store = JSON.parse(kv.get(trainingKeyFor(U16)) || '{}');
  assert.ok(u16Store['no-group'], 'defaulted write landed in the writer\'s OWN group');
  const senStore = JSON.parse(kv.get(trainingKeyFor(SEN)) || '{}');
  assert.equal(senStore['no-group'], undefined, 'no Seniors/default fallback');
});

test('training reads are group-scoped: one group\'s sessions never surface in another', async () => {
  seedClub();
  const u18 = await sessionFor('u-c-u18');
  await saveTraining(u18, U18, 'u18-only');
  const sen = await sessionFor('u-c-sen');
  const senRead = await callPublish({ resource: 'training', group: SEN }, null, sen);
  assert.equal(senRead.statusCode, 200);
  assert.equal(JSON.stringify(senRead.body).includes('u18-only'), false, 'U18 session invisible on Seniors read');
  const crossRead = await callPublish({ resource: 'training', group: U18 }, null, sen);
  assert.equal(crossRead.statusCode, 403, 'a Seniors-only coach cannot even READ the U18 training store');
});
