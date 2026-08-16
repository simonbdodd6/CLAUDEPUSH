/**
 * MULTI-GROUP UI ISOLATION — the four production-confirmed leak repairs.
 *
 *  OVERVIEW  every variant reads fixtures/match state through the group
 *            context: legacy fixtures + the working match belong to the
 *            initial group only.
 *  MEMBERS   the staff list follows server-computed operational access —
 *            club-wide staff everywhere, scoped staff only in their groups.
 *  MESSAGES  the feed can only ever paint the OPEN conversation, and a
 *            newly-selected thread paints immediately.
 *  MEDICAL   the caseload follows the operating group; orphans surface only
 *            with whole-club coverage on the initial group.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.ui-iso-unit.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'DEL') result = 1;
  if (command === 'SCAN') result = ['0', []];
  return { ok: true, json: async () => ({ result }) };
};

const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');

const CLUB = 'boitsfort';
const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });

const MEMBERS = [
  { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-florian', teamId: CLUB, userId: 'u-florian', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  { id: 'm-laurine', teamId: CLUB, userId: 'u-laurine', role: 'medical', status: 'active', medicalAccess: true },
  { id: 'm-u18m', teamId: CLUB, userId: 'u-u18m', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18]), medicalAccess: true },
  { id: 'm-s1', teamId: CLUB, userId: 'u-s1', role: 'player', status: 'active', playerGroupId: SEN },
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'general', status: 'active' },
      { id: WOM, name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [
      { id: 'team_f9113560', groupId: SEN, name: 'Premier', status: 'active' },
      { id: 'team_initial', groupId: SEN, name: 'Premier development', status: 'active' },
      { id: 'team_158989ae', groupId: U18, name: 'U18 Premier', status: 'active' },
      { id: 'team_8ec72f63', groupId: WOM, name: "Women's Premier", status: 'active' },
    ] }));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [{ id: 'p-u-s1', userId: 'u-s1', name: 'Sen One' }] }));
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ cases: [
    { id: 'case-sen', playerId: 'p-u-s1', playerGroupId: SEN, status: 'active', timeline: [] },
    { id: 'case-orphan', playerId: 'p-old', playerGroupId: '', status: 'active', timeline: [] },
  ], updatedAt: 1 }));
}
const cookies = new Map();
async function login(u) {
  const m = MEMBERS.find(x => x.userId === u);
  const s = await createSession({ userId: u, teamId: CLUB, role: m.role });
  cookies.set(u, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function pub(u, method, query, body) {
  const out = { code: 0, body: null };
  const r = { status(c) { out.code = c; return r; }, json(b) { out.body = b; return r; }, end() { return r; }, setHeader() {} };
  await publishHandler({ method, query: query || {}, body: body || {}, headers: { cookie: cookies.get(u) || '' } }, r);
  return out;
}

// ── Client extraction harness ─────────────────────────────────────────────
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
  { id: 'fx_legacy', opposition: 'Mons' },                       // ungrouped = Seniors
  { id: 'fx_u18', opposition: 'U18 Cup', groupId: U18 },
];
function ctx(gid, matchCentre = {}) {
  return new Function(`
    const state = { operationalGroupId: arguments[0], fixtures: arguments[1], matchCentre: arguments[2] };
    function operationalGroups() { return [{ id: '${SEN}' }, { id: '${U18}' }, { id: '${WOM}' }]; }
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    ${fn('contextMatchCentre')}
    ${fn('upcomingFixtures').replace("new Date().toISOString().slice(0, 10)", "'2020-01-01'")}
    return { fixtures: contextFixtures().map(f => f.id), mc: contextMatchCentre(),
             upcoming: upcomingFixtures(9).map(f => f.id) };
  `)(gid, FIXTURES, matchCentre);
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────
test('OVERVIEW 1-3: legacy fixtures render for Seniors only, across the switch sequence', () => {
  assert.deepEqual(ctx(SEN).upcoming, ['fx_legacy'], 'Seniors sees the legacy season');
  assert.deepEqual(ctx(U18).upcoming, ['fx_u18'], 'U18 sees only U18 fixtures — never the Seniors legacy season');
  assert.deepEqual(ctx(WOM).upcoming, [], "Women's currently has zero fixtures");
  // Seniors → U18 → Women's → Seniors: each render follows the current group.
  for (const [gid, want] of [[SEN, ['fx_legacy']], [U18, ['fx_u18']], [WOM, []], [SEN, ['fx_legacy']]]) {
    assert.deepEqual(ctx(gid).upcoming, want);
  }
});

test('OVERVIEW: the working match state follows its fixture\'s group; unlinked = Seniors', () => {
  const senMatch = { opposition: 'Mons', kickoffDate: '2099-01-01', fixtureId: 'fx_legacy' };
  assert.equal(ctx(SEN, senMatch).mc.opposition, 'Mons', 'Seniors sees the Seniors match');
  assert.deepEqual(ctx(U18, senMatch).mc, {}, 'U18 never surfaces the Seniors match/countdown');
  const legacyMatch = { opposition: 'Old Rivals', kickoffDate: '2099-01-01' };   // no fixture link
  assert.equal(ctx(SEN, legacyMatch).mc.opposition, 'Old Rivals', 'unlinked legacy match belongs to Seniors');
  assert.deepEqual(ctx(WOM, legacyMatch).mc, {}, 'and never to a newer group');
});

test('OVERVIEW: every variant reads through the context helpers', () => {
  for (const fname of ['renderClubCommandDashboard', 'renderExecutiveDashboard']) {
    const body = fn(fname);
    assert.match(body, /contextMatchCentre\(\)/, `${fname} match state`);
    assert.equal(/state\.fixtures/.test(body), false, `${fname} has no raw fixture read`);
  }
  assert.match(fn('upcomingFixtures'), /contextFixtures\(\)/);
  assert.match(fn('autopilotFillMatchFromFixture'), /contextFixtures\(\)/, 'autopilot adopts in-group fixtures only');
});

// ── MEMBERS ───────────────────────────────────────────────────────────────
test('MEMBERS 4-6: server computes per-group staff access with the canonical resolver', async () => {
  seed(); await login('u-simon');
  const r = await pub('u-simon', 'GET', { resource: 'structure' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.clubWideStaffIds, ['u-simon'], 'club-wide staff listed by id');
  const g = r.body.counts.groups;
  assert.deepEqual(g[SEN].staffUserIds.sort(), ['u-florian', 'u-laurine'].sort(),
    'Seniors: the scoped assistant AND the legacy-null medic (initial-group derivation)');
  assert.deepEqual(g[U18].staffUserIds, ['u-u18m'], 'U18: its scoped coach only');
  assert.deepEqual(g[WOM].staffUserIds, [], "Women's: nobody scoped yet");
});

test('MEMBERS: the staff list filter follows the operating group', () => {
  const body = fn('renderPlayers');
  assert.match(body, /_staffInScope/, 'staff rows go through the scope filter');
  assert.match(body, /clubWideStaffIds/, 'club-wide staff appear everywhere');
  assert.match(body, /groupStaffIds/, 'scoped staff appear only in their groups');
  const run = (gid, acc) => new Function(`
    const state = { operationalGroupId: arguments[0] };
    const _adminData = { structureAccess: arguments[1] };
    const _acc = _adminData.structureAccess;
    const _gid = state.operationalGroupId;
    const _staffInScope = u => {
      if (!_gid || !_acc) return true;
      if ((_acc.clubWideStaffIds || []).includes(String(u.id))) return true;
      return ((_acc.groupStaffIds || {})[_gid] || []).includes(String(u.id));
    };
    return ['u-simon', 'u-florian', 'u-laurine'].filter(id => _staffInScope({ id }));
  `)(gid, acc);
  const acc = { clubWideStaffIds: ['u-simon'], groupStaffIds: { [SEN]: ['u-florian', 'u-laurine'], [U18]: [], [WOM]: [] } };
  assert.deepEqual(run(SEN, acc), ['u-simon', 'u-florian', 'u-laurine'], 'Seniors shows everyone');
  assert.deepEqual(run(U18, acc), ['u-simon'], 'U18 shows club-wide staff only');
  assert.deepEqual(run(WOM, acc), ['u-simon'], "Women's likewise");
  assert.deepEqual(run(null, acc), ['u-simon', 'u-florian', 'u-laurine'], 'no group context: full list (legacy)');
});

// ── MESSAGES ──────────────────────────────────────────────────────────────
test('MESSAGES 7-10: the feed only paints the OPEN conversation; selection paints immediately', () => {
  const render = fn('chatRenderMessages');
  assert.match(render, /String\(convId \|\| ''\) !== String\(_open \|\| ''\)\) return/,
    'a stale/mismatched render call can never draw another thread\'s history');
  const select = fn('selectChat');
  const paintIdx = select.indexOf('chatRenderMessages(chatId, mode)');
  const fetchIdx = select.indexOf('await chatFetchMessages(chatId)');
  assert.ok(paintIdx > 0 && fetchIdx > 0 && paintIdx < fetchIdx,
    'the new thread paints (cached or empty) BEFORE any fetch await — no stale-feed window');
  assert.match(fn('setOperationalGroup'), /group:\$\{groupId\}/,
    'switching groups re-points an open group channel to the new group');
  // Group channels never fall back to the legacy local inbox.
  assert.match(fn('chatGetLocalMsgs'), /return false/, 'unknown conv ids resolve to NO local messages');
});

// ── MEDICAL ───────────────────────────────────────────────────────────────
test('MEDICAL 11-15: the caseload follows the asked group; orphans ride only with initial + whole-club', async () => {
  seed(); await login('u-simon'); await login('u-laurine'); await login('u-u18m');
  const ids = async (u, q) => (await pub(u, 'GET', { resource: 'medical', ...q })).body.cases.map(c => c.id).sort();
  assert.deepEqual(await ids('u-simon', { group: SEN }), ['case-orphan', 'case-sen'],
    'club-wide + initial-group ask: Seniors cases AND the orphan');
  assert.deepEqual(await ids('u-simon', { group: U18 }), [], 'same authority + U18 ask: nothing — broad access never collapses the group filter');
  assert.deepEqual(await ids('u-simon', { group: WOM }), [], "Women's likewise");
  assert.deepEqual(await ids('u-simon', {}), ['case-orphan', 'case-sen'], 'unscoped whole-club read unchanged');
  assert.deepEqual(await ids('u-laurine', {}), ['case-sen'],
    'a Seniors-only medic (legacy-null scope) never sees the orphan');
  assert.deepEqual(await ids('u-u18m', {}), [], 'the U18 medic sees no Seniors case and no orphan');
});

test('MEDICAL: the client stamps the operating group and resets on switch', () => {
  const load = fn('loadMedicalFromServer');
  assert.match(load, /&group=\$\{encodeURIComponent\(gid\)\}/, 'the fetch names the operating group');
  assert.match(load, /stale reply/, 'a reply for a departed group is discarded and re-chased');
  assert.match(fn('syncTrainingStateToGroup'), /_sharedMedical = \{ loaded: false/,
    'the group transition drops the cached caseload');
});
