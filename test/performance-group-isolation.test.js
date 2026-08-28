/**
 * PERFORMANCE — SELECTED-GROUP ISOLATION (production regression).
 *
 * Observed in production: a coach with "Viewing: U18" opened
 * Performance → Programmes → New programme and was shown the SENIORS squad
 * (Julien Simon, Alexandre Vandamme, Vincent Ferrante, …), while the U18
 * athlete they were looking for was nowhere to be found among the cards.
 *
 * Root cause: `perfAthletesHtml()` and `perfPickAthleteHtml()` rendered
 * `_perfAssign.athletes` RAW. That list is the server's ACCESS-SCOPE answer —
 * every athlete this coach is authorised to reach — which for a club-wide
 * coach is the entire club, every group. Correct as a security boundary,
 * wrong as a view: the selected operational group was never applied, so the
 * "Viewing" selector had no effect on Performance at all, and the U18 athlete
 * was simply buried among 77 unfiltered cards.
 *
 * The contract pinned here — the effective athlete set is the INTERSECTION of
 *   A. the athlete belongs to the selected operational group, AND
 *   B. the athlete is inside the coach's server-authorised scope
 * — where B is enforced by the server and can never be widened by the client,
 * and A narrows what is shown. Group NAMES are never parsed: membership comes
 * from the server-projected `groupId` on each athlete.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.perfgroup.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

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

const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', U16 = 'grp_402a580b';

// A roster shaped like the production one that produced the bug: Seniors names
// first (so an unfiltered list is dominated by them), U18 after.
const ATHLETES = [
  { userId: 'u-sen-1', name: 'Julien Simon',        groupId: SEN, groupName: 'Seniors' },
  { userId: 'u-sen-2', name: 'Alexandre Vandamme',  groupId: SEN, groupName: 'Seniors' },
  { userId: 'u-sen-3', name: 'Vincent Ferrante',    groupId: SEN, groupName: 'Seniors' },
  { userId: 'u-u18-1', name: 'U18 Athlete One',     groupId: U18, groupName: 'U18' },
  { userId: 'u-u18-2', name: 'U18 Athlete Two',     groupId: U18, groupName: 'U18' },
  { userId: 'u-u16-1', name: 'U16 Athlete One',     groupId: U16, groupName: 'U16' },
  { userId: 'u-none',  name: 'Ungrouped Player',    groupId: '',  groupName: '' },
];

/** Drive the REAL client scoping helper for a given selected group. */
function scoped(operationalGroupId, athletes = ATHLETES) {
  return new Function(`
    "use strict";
    const state = { operationalGroupId: ${JSON.stringify(operationalGroupId)} };
    const _perfAssign = { athletes: ${JSON.stringify(athletes)} };
    ${fn('perfScopedAthletes')}
    return perfScopedAthletes();
  `)();
}
const names = list => list.map(a => a.name);

// ── A / B — the picker follows the selected group ──────────────────────────

test('A: selected group U18 — the New Programme picker contains ONLY U18 athletes', () => {
  const list = scoped(U18);
  assert.deepEqual(names(list), ['U18 Athlete One', 'U18 Athlete Two']);
  for (const seniorName of ['Julien Simon', 'Alexandre Vandamme', 'Vincent Ferrante']) {
    assert.equal(names(list).includes(seniorName), false, `${seniorName} must not appear under Viewing: U18`);
  }
});

test('B: selected group Seniors — the same roster yields ONLY Seniors athletes', () => {
  const list = scoped(SEN);
  assert.deepEqual(names(list), ['Julien Simon', 'Alexandre Vandamme', 'Vincent Ferrante']);
  assert.equal(list.some(a => a.groupId === U18), false, 'no U18 athlete leaks into Seniors');
});

test('C: switching Seniors → U18 changes the list with no reload and no refetch', () => {
  // Same server payload, only the selected group differs — which is exactly
  // what a live switch does to the already-loaded list.
  assert.deepEqual(names(scoped(SEN)), ['Julien Simon', 'Alexandre Vandamme', 'Vincent Ferrante']);
  assert.deepEqual(names(scoped(U18)), ['U18 Athlete One', 'U18 Athlete Two']);
  assert.deepEqual(names(scoped(U16)), ['U16 Athlete One']);
});

// ── D / E — a newly added U18 athlete ─────────────────────────────────────

test('D: a new U18 athlete in the server projection appears immediately under U18', () => {
  const withNew = [...ATHLETES, { userId: 'u-new', name: 'New U18 Test Player', groupId: U18, groupName: 'U18' }];
  assert.equal(names(scoped(U18, withNew)).includes('New U18 Test Player'), true);
});

test('E: that new U18 athlete never appears in the Seniors view', () => {
  const withNew = [...ATHLETES, { userId: 'u-new', name: 'New U18 Test Player', groupId: U18, groupName: 'U18' }];
  assert.equal(names(scoped(SEN, withNew)).includes('New U18 Test Player'), false);
});

test('D2: a stale athlete list cannot survive a group switch — the cache is invalidated', () => {
  const body = fn('setOperationalGroup');
  assert.match(body, /_perfAssign/,
    'setOperationalGroup must invalidate the Performance athlete cache so a newly added athlete needs no logout');
  assert.match(body, /perfResetAuthoring|_perfAuthor/,
    'an in-flight authoring flow for the outgoing group must not survive the switch');
});

// ── Fail-closed and legacy behaviour ──────────────────────────────────────

test('F1: an athlete with NO group is excluded from every group view (fails closed)', () => {
  for (const gid of [SEN, U18, U16]) {
    assert.equal(names(scoped(gid)).includes('Ungrouped Player'), false, `ungrouped athlete leaked into ${gid}`);
  }
});

test('F2: no selected group in force → the scope answer is unchanged (no accidental blanking)', () => {
  assert.equal(scoped(null).length, ATHLETES.length);
  assert.equal(scoped('').length, ATHLETES.length);
});

test('F3: UNKNOWN ≠ LEGACY — a genuinely pre-group club keeps its full list', () => {
  const preGroup = ATHLETES.map(a => ({ ...a, groupId: '', groupName: '' }));
  assert.equal(scoped(SEN, preGroup).length, preGroup.length,
    'a club whose athletes carry no group at all is pre-structure, not "everyone hidden"');
});

test('F4: group membership comes from the projected groupId — names are NEVER parsed', () => {
  const body = fn('perfScopedAthletes');
  assert.doesNotMatch(body, /groupName|U18|U16|Senior|includes\(['"]U/i,
    'the helper must not read or match on any group NAME');
  assert.match(body, /groupId/, 'membership is decided by the server-projected groupId');
  // A group NAMED "U18" that is not the selected group id must still be excluded.
  const mislabelled = [{ userId: 'x', name: 'Mislabelled', groupId: SEN, groupName: 'U18' }];
  assert.equal(scoped(U18, mislabelled).length, 0, 'a Seniors athlete labelled "U18" must not appear under U18');
});

// ── H — one contract across every Performance athlete surface ─────────────

test('H: Athletes and New Programme read the SAME scoping helper, not ad-hoc filters', () => {
  for (const surface of ['perfAthletesHtml', 'perfPickAthleteHtml']) {
    const body = fn(surface);
    assert.match(body, /perfScopedAthletes\(\)/, `${surface} must use the shared scoping helper`);
    assert.doesNotMatch(body, /_perfAssign\.athletes\b/, `${surface} must not read the unscoped list directly`);
  }
});

test('H2: no Performance surface reads the club-wide state.players roster', () => {
  // Comments are stripped first: perfAthletesHtml documents that it never
  // consults state.players, and that sentence is not a read.
  const code = body => body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const surface of ['perfAthletesHtml', 'perfPickAthleteHtml', 'perfScopedAthletes']) {
    assert.doesNotMatch(code(fn(surface)), /state\.players/, `${surface} must never read the club-wide roster`);
  }
});

test('H3: the coach athlete list is never widened — the helper only ever filters', () => {
  for (const gid of [SEN, U18, U16, null]) {
    const list = scoped(gid);
    assert.ok(list.length <= ATHLETES.length, 'never more athletes than the server sent');
    for (const a of list) assert.ok(ATHLETES.some(x => x.userId === a.userId), 'no athlete invented');
  }
});

// ── Dashboard: gated, not labelled ────────────────────────────────────────

test('DASH1: the Dashboard refuses sample data outside explicit development', () => {
  const body = fn('perfDashboardHtml');
  // The gate is the FIRST statement, so no sample constant is read in production.
  // It is now perfDemoDataAllowed() rather than _isLocalDemoHost(): the hostname
  // alone admitted capacitor://localhost and any other localhost-shaped origin.
  const firstStatement = body.slice(body.indexOf('{') + 1).split('\n').filter(l => l.trim() && !l.trim().startsWith('//'))[0];
  assert.match(firstStatement, /if \(!perfDemoDataAllowed\(\)\) return perfDashboardEmptyHtml\(\);/,
    'production returns the empty state before any sample data is touched');
});

test('DASH2: one rule for fabricated Performance data — no second implementation', () => {
  // Exactly one definition of each helper exists in the file.
  assert.equal((src.match(/function _isLocalDemoHost\s*\(/g) || []).length, 1, 'one host helper, not two');
  assert.equal((src.match(/function perfDemoDataAllowed\s*\(/g) || []).length, 1,
    'one demo-data rule, not two');
  // EVERY Performance path that can render a fixture goes through that one rule.
  for (const f of ['perfDashboardHtml', 'perfAnalyticsHtml', 'perfWkAssignment']) {
    assert.match(fn(f), /perfDemoDataAllowed\(\)/, `${f} must use the shared demo-data rule`);
  }
  // installDemoSquad is a manual console action, not a Performance render path,
  // and keeps the hostname helper it has always used.
  assert.match(fn('installDemoSquad'), /_isLocalDemoHost\(\)/);
  // The Performance rule is STRICTER than the host helper, not a copy of it.
  const rule = fn('perfDemoDataAllowed');
  assert.match(rule, /_devLoginEnabled/, 'requires the server-declared development deployment');
  assert.match(rule, /Capacitor|cordova/, 'refuses a native runtime');
});

test('DASH3: the production empty state invents no athlete, figure or date', () => {
  const empty = fn('perfDashboardEmptyHtml');
  // No sample data source, and no widget whose job is to display a figure.
  for (const banned of ['PERF_SAMPLE_ATHLETES', 'PERF_SAMPLE_PROGRAMMES', 'PERF_SAMPLE_METRICS',
                        'PERF_SAMPLE_ACTIVITY', 'PERF_SAMPLE_TODAY',
                        'perfSparkline', 'perfMeter', 'perfTrendChip', 'perf-big', 'perf-stat-row']) {
    assert.equal(empty.includes(banned), false, `the empty state must not reference ${banned}`);
  }
  assert.doesNotMatch(empty, /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/, 'no hard-coded day');
  assert.doesNotMatch(empty, /\b\d+\s*(August|September|%)/, 'no hard-coded date or percentage');
  // The words "readiness"/"adherence" may appear ONLY in prose saying the
  // reporting does not exist yet — never attached to a number.
  assert.doesNotMatch(empty, /(readiness|adherence)[^<]{0,20}\d/i, 'no figure attached to a metric');
  assert.match(empty, /still being built/, 'and the absence is stated plainly');
  // Honest, and in the tone the rest of Performance already uses.
  assert.match(empty, /No squad reporting yet/);
  assert.match(empty, /still being built/);
});

test('DASH4: display-only — no routing, id or entitlement change', () => {
  const empty = fn('perfDashboardEmptyHtml');
  assert.doesNotMatch(empty, /setSection|canUseFeature|teamPlan|minimumPlan|SECTION_/,
    'the empty state must not touch routing or entitlement');
  // It navigates within Performance using the existing tab helper only.
  for (const m of empty.match(/onclick="([^"]*)"/g) || []) {
    assert.match(m, /setPerfTab\('(athletes|programmes)'\)/, `unexpected handler: ${m}`);
  }
  // The dashboard tab id itself is unchanged.
  assert.match(src, /if \(tab === 'dashboard'\)\s+body = perfDashboardHtml\(\);/);
});

// ── Identity isolation of the cached list ────────────────────────────────

test('the cached Performance athlete list is cleared on an identity change', () => {
  const body = fn('resetIdentityScopedState');
  assert.match(body, /_perfAssign/,
    'a coach signing out must not leave their scoped athlete list for the next identity on a shared device');
});

// ══ SERVER SECURITY — the boundary the client can never widen ══════════════

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

const identity = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');

const CLUB = 'club-perf-iso', OTHER = 'club-other-iso';
const MEMBERS = [
  { id: 'm1', teamId: CLUB, userId: 'u-sen-p', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm2', teamId: CLUB, userId: 'u-u18-p', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm3', teamId: CLUB, userId: 'u-sen-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, role: 'coach', status: 'active' }], teams: [] } },
  { id: 'm4', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, role: 'coach', status: 'active' }], teams: [] } },
  { id: 'm5', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  { id: 'm6', teamId: OTHER, userId: 'u-other-p', role: 'player', status: 'active', playerGroupId: 'grp-x' },
];
kv.set('app:identity:teams', JSON.stringify([
  { id: CLUB, name: 'Iso Club', plan: 'pro', planStatus: 'active' },
  { id: OTHER, name: 'Other', plan: 'pro', planStatus: 'active' },
]));
kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [
  { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
  { id: U18, name: 'U18', type: 'general', status: 'active' }], teams: [] }));
kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
  { id: 'p1', userId: 'u-sen-p', name: 'Julien Simon', position: 'PROP' },
  { id: 'p2', userId: 'u-u18-p', name: 'U18 Athlete One', position: 'WING' }] }));

const cookies = new Map();
for (const m of MEMBERS) {
  const s = await identity.createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
  cookies.set(m.userId, `${identity.SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
const call = async (userId, { method = 'GET', body = null, query = {} } = {}) => {
  const out = { code: 0, body: null };
  const r = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, end() { return this; }, setHeader() {} };
  await publishHandler({ method, body, query: { resource: 'performance', ...query },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return out;
};

test('F: a U18-scoped coach cannot read Seniors athletes through Performance', async () => {
  const r = await call('u-u18-c');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.athletes.map(a => a.userId), ['u-u18-p']);
  assert.equal(JSON.stringify(r.body).includes('Julien Simon'), false, 'no Seniors athlete in the payload at all');
});

test('F2: a Seniors-scoped coach cannot read U18 athletes through Performance', async () => {
  const r = await call('u-sen-c');
  assert.deepEqual(r.body.athletes.map(a => a.userId), ['u-sen-p']);
  assert.equal(JSON.stringify(r.body).includes('U18 Athlete One'), false);
});

test('F3: a forged athlete id cannot bypass the authenticated scope', async () => {
  // The client selecting a group is irrelevant: the server reads the SESSION.
  const profile = await call('u-sen-c', { query: { athleteProfile: 'u-u18-p' } });
  assert.equal(profile.code, 403, 'reading an out-of-scope athlete profile is refused');
  const write = await call('u-sen-c', { method: 'POST', body: {
    op: 'save_draft', title: 'X', athleteUserId: 'u-u18-p', goal: 'strength' } });
  assert.equal(write.code, 403, 'authoring for an out-of-scope athlete is refused');
});

test('G: another club\'s athlete remains inaccessible', async () => {
  const r = await call('u-admin', { query: { athleteProfile: 'u-other-p' } });
  assert.ok(r.code === 403 || r.code === 404, `cross-club athlete refused (got ${r.code})`);
  const list = await call('u-admin');
  assert.equal(list.body.athletes.some(a => a.userId === 'u-other-p'), false, 'never enumerated');
});

test('G2: a club-wide coach legitimately sees every group — the SELECTED group narrows the view, not the grant', async () => {
  const r = await call('u-admin');
  const ids = r.body.athletes.map(a => a.userId).sort();
  assert.deepEqual(ids, ['u-sen-p', 'u-u18-p'], 'the server answer is the full authorised scope');
  // …and every athlete carries the groupId the client filter narrows on, so the
  // view can be scoped without the client ever deciding who is reachable.
  for (const a of r.body.athletes) assert.ok(a.groupId, 'each athlete carries its server-resolved groupId');
  const u18View = scoped(U18, r.body.athletes);
  assert.deepEqual(u18View.map(a => a.userId), ['u-u18-p'], 'selecting U18 narrows an admin to U18 only');
});

test('F4: the client cannot widen scope by sending a group of its own', async () => {
  // Any group the client names is ignored — scope comes from the session.
  const r = await call('u-u18-c', { query: { group: SEN, groupId: SEN, operationalGroupId: SEN } });
  assert.deepEqual(r.body.athletes.map(a => a.userId), ['u-u18-p'],
    'a client-supplied group cannot widen the server answer');
});
