/**
 * MATCH CENTRE STAFF SCOPING — the Coach Draft Compare panel.
 *
 *  The panel listed EVERY staff identity in the club (role filter only) —
 *  the one staff surface that never received the group-scope filter Members
 *  got. It now consumes the same server-computed standing ids
 *  (clubWideStaffIds + per-group staffUserIds, i.e. operationalGroupsFor),
 *  keyed by the SELECTED FIXTURE's group (legacy unscoped fixture =
 *  initial group; no linked fixture = the operating group). These tests
 *  drive the REAL panel renderer with ids computed by the REAL structure
 *  handler — so Match Centre visibility and Members → Coaches & staff are
 *  proven to agree by construction AND by assertion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.mc-staff.test';
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

const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { operationalGroupsFor } = await import('../api/_accessScope.js');

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

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 'team_woma', groupId: WOM, name: "Women's Premier", status: 'active' },
  ] };

// The controlled cast — every shape the product rule names.
const MEMBERS = [
  { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-sen', teamId: CLUB, userId: 'u-senc', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  { id: 'm-u18', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-wom', teamId: CLUB, userId: 'u-womc', role: 'coach', staffLevel: 'manager', status: 'active', accessProfile: 'coach', accessScope: scope([WOM]) },
  { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', staffLevel: 'assistant', status: 'active', playerGroupId: SEN, accessScope: scope([U18]) },
  { id: 'm-med', teamId: CLUB, userId: 'u-med18', role: 'medical', status: 'active', accessScope: scope([U18]) },
  { id: 'm-plain', teamId: CLUB, userId: 'u-plain', role: 'player', status: 'active', playerGroupId: U18 },
];
const NAMES = { 'u-simon': 'Simon ClubWide', 'u-senc': 'Sen Coach', 'u-u18c': 'U18 Coach',
  'u-womc': 'Wom Coach', 'u-dual': 'Dual Coach', 'u-med18': 'U18 Medic', 'u-plain': 'Plain Player' };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: NAMES[m.userId] }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
}
async function realAccessIds() {
  const { token } = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await publishHandler({ method: 'GET', query: { resource: 'structure' },
    headers: { cookie: `ce_session=${token}` }, body: null, on() {} }, res);
  return {
    clubWideStaffIds: res.body.clubWideStaffIds || [],
    groupStaffIds: Object.fromEntries(Object.entries(res.body.counts?.groups || {})
      .map(([g, x]) => [g, x.staffUserIds || []])),
  };
}

/** Render the REAL panel for a fixture of group `fxGroupId` with the REAL
 *  server-computed access ids — returns the list of staff names shown. */
function panelNames(access, fxGroupId, { linked = true, operationalGroupId = '' } = {}) {
  const html = new Function(`"use strict";
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const state = {
      currentUserId: 'u-viewer',   // not in the cast — every staff member renders as an 'other' row
      operationalGroupId: ${JSON.stringify(operationalGroupId || fxGroupId || '')},
      users: ${JSON.stringify(MEMBERS.map(m => ({ id: m.userId, role: m.role, name: NAMES[m.userId] })))},
    };
    // loaded:true — these pins model a club whose access ids HAVE arrived;
    // the not-yet-loaded state now fails closed (group-isolation regression fix).
    const _adminData = { loaded: true, structureAccess: ${JSON.stringify(access)} };
    const _coachDraftsList = [];
    function isCoach() { return true; }
    function esc(s) { return String(s == null ? '' : s); }
    function matchCentreFixtureId() { return ${JSON.stringify(linked ? 'fx_1' : '')}; }
    function matchCentreSideId() { return ''; }
    function matchCentreSelectedFixture() {
      return ${linked ? JSON.stringify({ id: 'fx_1', opposition: 'Rivals', date: '2026-08-22', groupId: fxGroupId === SEN ? '' : fxGroupId }) : 'null'};
    }
    function matchCentreSelectedSide() { return null; }
    function mcFixtureDateLabel(d) { return String(d); }
    ${fn('_draftTimeAgo')}
    const _MC_STAFF_ROLE_LABEL = { coach: 'Coach', admin: 'Admin', medical: 'Medical' };
    ${fn('mcComparePanelHTML')}
    return mcComparePanelHTML();
  `)();
  return Object.values(NAMES).filter(n => html.includes(n));
}

// The Members list rule, for the agreement proof.
const membersList = (access, gid) => MEMBERS
  .filter(m => ['coach', 'admin', 'medical'].includes(m.role))
  .map(m => m.userId)
  .filter(id => (access.clubWideStaffIds || []).includes(id) || ((access.groupStaffIds || {})[gid] || []).includes(id))
  .map(id => NAMES[id]);

test('the full visibility matrix — every shape, every group, fixture-driven', async () => {
  seed();
  const access = await realAccessIds();

  // ── Seniors fixture (legacy unscoped → initial-group identity) ──────────
  const sen = panelNames(access, SEN);
  assert.ok(sen.includes('Simon ClubWide'), '1: club-wide in Seniors MC');
  assert.ok(sen.includes('Sen Coach'), '8: Seniors-only coach in Seniors');
  assert.ok(!sen.includes('U18 Coach'), '5: U18-only coach NOT in Seniors');
  assert.ok(!sen.includes('Wom Coach'), "7: Women's-only coach NOT in Seniors");
  assert.ok(!sen.includes('Dual Coach'), '9: dual-role U18 coach NOT Seniors staff (plays there only)');
  assert.ok(!sen.includes('U18 Medic'), '12: U18-scoped medic NOT in Seniors');
  assert.ok(!sen.includes('Plain Player'), '10: playerGroupId grants nothing');

  // ── U18 fixture ─────────────────────────────────────────────────────────
  const u18 = panelNames(access, U18);
  assert.ok(u18.includes('Simon ClubWide'), '2: club-wide in U18 MC');
  assert.ok(u18.includes('U18 Coach'), '4: U18-only coach in U18');
  assert.ok(u18.includes('Dual Coach'), '9: dual-role coach in U18');
  assert.ok(u18.includes('U18 Medic'), '12: U18-scoped medic in U18');
  assert.ok(!u18.includes('Sen Coach'), '8/14: Seniors-only coach never leaks into U18');
  assert.ok(!u18.includes('Wom Coach'), "7: Women's-only coach NOT in U18");
  assert.ok(!u18.includes('Plain Player'), '10: a U18 PLAYER is never U18 staff');

  // ── Women's fixture ─────────────────────────────────────────────────────
  const wom = panelNames(access, WOM);
  assert.ok(wom.includes('Simon ClubWide'), "3: club-wide in Women's MC");
  assert.ok(wom.includes('Wom Coach'), "7: Women's-only coach in Women's");
  assert.ok(!wom.includes('U18 Coach'), '6: U18-only coach NOT in Women\'s');
  assert.ok(!wom.includes('Dual Coach'), "9: dual-role U18 coach NOT in Women's");
  assert.ok(!wom.includes('U18 Medic'), "11/12: scoped medic NOT in Women's");
  assert.ok(!wom.includes('Sen Coach'), "14: no Seniors fallback in Women's");
});

test('the dual-role member remains a Seniors PLAYER while appearing as U18 staff', () => {
  const dual = MEMBERS.find(m => m.id === 'm-dual');
  assert.equal(dual.playerGroupId, SEN);
  assert.deepEqual(operationalGroupsFor(dual, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);
});

test('an unscoped medic derives the initial group — never global (11)', async () => {
  seed();
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'm-mednull', teamId: CLUB, userId: 'u-mednull', role: 'medical', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const access = await realAccessIds();
  assert.ok(!access.clubWideStaffIds.includes('u-mednull'), 'medical role alone is not club-wide');
  assert.ok((access.groupStaffIds[SEN] || []).includes('u-mednull'), 'legacy derivation: initial group only');
  assert.ok(!(access.groupStaffIds[U18] || []).includes('u-mednull'));
  assert.ok(!(access.groupStaffIds[WOM] || []).includes('u-mednull'));
});

test('fixture identity drives the filter: same operator, different fixture → different staff (13)', async () => {
  seed();
  const access = await realAccessIds();
  // The operator stays "in U18", but the fixture rendered decides the list.
  const u18Fx = panelNames(access, U18, { operationalGroupId: U18 });
  const womFx = panelNames(access, WOM, { operationalGroupId: U18 });
  assert.ok(u18Fx.includes('U18 Coach') && !u18Fx.includes('Wom Coach'));
  assert.ok(womFx.includes('Wom Coach') && !womFx.includes('U18 Coach'),
    'the FIXTURE group, not the operator context, decides');
  // No linked fixture → the operating group stands in.
  const unlinked = panelNames(access, U18, { linked: false, operationalGroupId: U18 });
  assert.ok(unlinked.includes('U18 Coach') && !unlinked.includes('Wom Coach'), 'unlinked falls to operating group');
});

test('Match Centre agrees with operationalGroupsFor AND Members for every group (15+16)', async () => {
  seed();
  const access = await realAccessIds();
  for (const gid of [SEN, U18, WOM]) {
    const mc = panelNames(access, gid).sort();
    const members = [...new Set(membersList(access, gid))].sort();
    assert.deepEqual(mc, members, `group ${gid}: one rule, two surfaces`);
    // And both ARE operationalGroupsFor: every shown non-club-wide member's
    // staff groups include gid.
    for (const name of mc) {
      const uid = Object.entries(NAMES).find(([, n]) => n === name)[0];
      if (access.clubWideStaffIds.includes(uid)) continue;
      const m = MEMBERS.find(x => x.userId === uid);
      assert.ok(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).some(g => g.id === gid),
        `${name} shown in ${gid} must operate it`);
    }
  }
});
