/**
 * PLAYER FIXTURE FRESHNESS (Build 107)
 *
 * A player's device learned the club's fixtures once, at page load or sign-in,
 * and returning to the app re-read only the player's own answers. A match
 * added or moved after that load did not exist for the device until the app
 * was fully reopened; even then the list landed after the first paint and
 * nothing repainted the Availability screen; and while no fixtures were known
 * the screen offered a generic undated "Match" whose answer was stored under
 * `game` and never reached the coach's board for the real Saturday match.
 *
 * Three client rules, tested here:
 *   KNOWN    the fixture list is a basis for decisions only once the server has
 *            confirmed it for the club in force (fixturesKnown); unknown ⇒ no
 *            invented generic match, a known-empty list keeps it.
 *   REPAINT  a confirmed list that changes what the player can see repaints
 *            the screen they are on; identical data repaints nothing.
 *   REFRESH  returning to the app and entering Availability re-read the list —
 *            one request, shared in flight, coalesced, never from a render.
 *
 * SANDBOX tests run the real client functions over stubs. BROWSER tests run the
 * real client in Chromium (desktop and Pixel 5) against the REAL handlers over
 * an in-memory store; the server write path is exercised, never doubled.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ── The application's own week ──
const WEEKFN = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')}
  ${fn('availabilityEventsForWeek')} ${fn('availToday')}
  return { availWeekStart, availAddDays, availabilityEventsForWeek, availToday };
`)();
const TODAY = WEEKFN.availToday();
const WEEK = WEEKFN.availWeekStart(TODAY);
const SATURDAY = WEEKFN.availAddDays(WEEK, 5);
const FRIDAY = WEEKFN.availAddDays(WEEK, 4);

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE GENERATOR — unknown, known-empty, known fixture
// ═══════════════════════════════════════════════════════════════════════════
test('1. GENERATOR — an UNKNOWN fixture list invents no generic match; a KNOWN empty list keeps it; a known fixture is itself', () => {
  const week = WEEK, fx = { id: 'fx_sat', opposition: 'Alpha', date: SATURDAY, time: '14:00' };
  const ids = sources => WEEKFN.availabilityEventsForWeek(week, { slots: [], currentWeekStart: week, ...sources }).map(e => e.id);
  assert.deepEqual(ids({ fixtures: [], fixturesKnown: false }), [], 'A. unknown + empty: nothing is invented');
  assert.deepEqual(ids({ fixtures: [], fixturesKnown: true }), ['game'], 'B. known + empty: the generic card remains for a group that enters no fixtures');
  assert.deepEqual(ids({ fixtures: [] }), ['game'], 'callers without the signal keep the rule they had');
  assert.deepEqual(ids({ fixtures: [fx], fixturesKnown: true }), ['fx_sat'], 'C. a known fixture is its own id — never game');
  assert.deepEqual(ids({ fixtures: [fx], fixturesKnown: false }), ['fx_sat'], 'a fixture the device holds is shown even before confirmation; only the INVENTED card waits');
  assert.deepEqual(ids({ fixtures: [{ ...fx, date: WEEKFN.availAddDays(SATURDAY, 7) }], fixturesKnown: true }), [], 'a fixture elsewhere still means no generic card');
});

test('2. CALLERS — every live caller passes the signal, and the chase context reports loading while the list is unknown', () => {
  for (const name of ['availEventsForViewedWeek', 'coachAvailEvents', 'availabilityWeekSessions']) {
    assert.match(stripComments(fn(name)), /fixturesKnown: typeof fixturesKnown === 'function' \? fixturesKnown\(\) : true/, name + ' passes fixturesKnown');
  }
  assert.match(stripComments(fn('availabilityChaseContext')), /if \(typeof fixturesKnown === 'function' && !fixturesKnown\(\)\) return context\('loading'\);/, 'the coach chase context treats an unknown list as loading');
  // Run it: unknown ⇒ loading; known ⇒ the week's sessions.
  const chase = known => new Function(`
    const state = { operationalGroupId: 'g1' };
    let _trainingSchedule = { slots: [] }, _trainingScheduleGroupId = 'g1', _clubContextId = 'club';
    function availabilityReadUnknown() { return false; }
    function operationalGroups() { return [{ id: 'g1' }]; }
    function ensureTrainingSchedule() {}
    function trainingGroupParam() { return 'g1'; }
    function currentResolvedAvailability() { return {}; }
    function contextFixtures() { return [{ id: 'fx_sat', opposition: 'Alpha', date: '${SATURDAY}', groupId: 'g1' }]; }
    function normalizeFixture(f) { return f; }
    function operationalPlayers() { return []; }
    function playerIsArchived() { return false; }
    function availabilityNonResponders() { return []; }
    function availabilityRequestedSessions() { return []; }
    function fixturesKnown() { return ${known}; }
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')} ${fn('availToday')}
    ${fn('availabilityChaseContext')}
    return availabilityChaseContext();
  `)();
  assert.equal(chase(false).status, 'loading');
  assert.equal(chase(true).status, 'ready');
  assert.deepEqual(chase(true).sessions.map(s => s.id), ['fx_sat']);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE CLIENT FUNCTIONS over stubs
// ═══════════════════════════════════════════════════════════════════════════
/**
 * A sandbox holding the REAL freshness functions, clubStateOwned,
 * resetTeamScopedState, loadClubConfigFromServer, refreshAvailabilityOnReturn
 * and setSection, with a scripted fetch and counters for everything they touch.
 */
function sandbox({ view = 'player', section = 'availability', club = 'club-a', owned = true, fixtures = [], synced = '', signedOut = false,
                   serverFixtures = [], serverClub = undefined, fixturesDelay = 0, fixturesStatus = 200, isCoach = false } = {}) {
  return new Function('CFG', `
    const state = { activeView: CFG.view, activePlayerSection: CFG.section, activeCoachSection: 'overview', stateTeamId: CFG.owned ? CFG.club : 'other-club',
      fixtures: CFG.fixtures, fixturesSyncedAt: CFG.synced, players: [], clubName: '', teamName: '', seasonName: '', clubLogo: '', clubColours: null,
      matchCentre: {}, currentUserId: 'u1', users: [{ id: 'u1', role: CFG.isCoach ? 'coach' : 'player' }], messages: [], operationalGroupId: 'g1' };
    const defaultState = { matchCentre: {}, teamSheet: null, trainingByGroup: {}, trainingBlocks: [] };
    let _clubContextId = CFG.club, _serverAuthState = 'ok', _clubConfigChecked = false, _playerFixturesInFlight = null, _playerFixturesLandedAt = 0;
    let _coachDraft = null, _trainingStateGroupId = null;
    const counts = { fetches: [], saves: [], repaints: { availability: 0, home: 0, fixtures: 0 }, renders: 0, nav: 0, flushes: 0, selfReads: 0, boardRefresh: 0, firstRun: 0, toasts: [] };
    const server = { fixtures: CFG.serverFixtures, club: CFG.serverClub, fixturesDelay: CFG.fixturesDelay, fixturesStatus: CFG.fixturesStatus };
    async function fetch(url) {
      counts.fetches.push(url);
      if (url === '/api/publish?resource=fixtures') {
        if (server.fixturesDelay) await new Promise(r => globalThis.setTimeout(r, server.fixturesDelay));
        return { ok: server.fixturesStatus === 200, status: server.fixturesStatus, json: async () => ({ ok: true, fixtures: structuredClone(server.fixtures) }) };
      }
      if (url === '/api/publish?resource=club') return { ok: true, status: 200, json: async () => ({ ok: true, club: server.club === undefined ? null : structuredClone(server.club) }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    function sessionSignedOut() { return CFG.signedOut; }
    function saveState(label) { counts.saves.push(label); }
    function renderPlayerAvailabilityV2() { counts.repaints.availability++; }
    function renderPlayerHome() { counts.repaints.home++; }
    function renderPlayerFixtures() { counts.repaints.fixtures++; }
    function render() { counts.renders++; }
    function renderNav() { counts.nav++; }
    function applyClubBranding() {} function markSynced() {} function isCoach() { return CFG.isCoach; }
    function ensureAutopilotSchedule() { return Promise.resolve(); }
    function showFirstRunSetup() { counts.firstRun++; }
    function saveClubConfigToServer() { return Promise.resolve(null); }
    function normalizeWeeklyAvailability(v) { return v || {}; }
    function refreshLiveAvailability() { counts.boardRefresh++; }
    function playerAvailRetryNow() { counts.selfReads++; }
    function availabilityFlushPending() { counts.flushes++; return Promise.resolve(0); }
    function resolveOperationalGroup() {} function allowedCoachSections(x) { return x; } function playerSectionAllowed() { return true; }
    function coachSectionEntered() {} function showToast(t) { counts.toasts.push(t); }
    function rosterFingerprint() { return ''; }
    ${fn('normalizeFixture')}
    ${fn('clubStateOwned')}
    ${fn('fixturesKnown')}
    ${fn('noteFixturesSynced')}
    ${fn('fixturesFingerprint')}
    ${fn('repaintPlayerFixtures')}
    ${fn('fixturesArrived')}
    ${fn('refreshPlayerFixtures')}
    ${fn('applyClubConfigLocally')}
    ${fn('loadClubConfigFromServer')}
    ${fn('refreshAvailabilityOnReturn')}
    ${fn('setSection')}
    ${fn('resetTeamScopedState')}
    return { state, counts, server, fixturesKnown, noteFixturesSynced, fixturesFingerprint, refreshPlayerFixtures, loadClubConfigFromServer,
             refreshAvailabilityOnReturn, setSection, resetTeamScopedState, fixturesArrived,
             leaveClub: () => { _clubContextId = 'club-b'; }, landedAt: () => _playerFixturesLandedAt, inFlight: () => _playerFixturesInFlight,
             fixtureGets: () => counts.fetches.filter(u => u === '/api/publish?resource=fixtures').length };
  `)({ view, section, club, owned, fixtures, synced, signedOut, serverFixtures, serverClub, fixturesDelay, fixturesStatus, isCoach });
}
const SAT = { id: 'fx_sat', opposition: 'Alpha', date: SATURDAY, time: '14:00', groupId: 'g1', sideId: '', team: 'U18 Premier', homeAway: 'home', status: 'scheduled' };
const FRI = { id: 'fx_fri', opposition: 'Newly Added', date: FRIDAY, time: '19:30', groupId: 'g1', sideId: '', team: 'U18 Premier', homeAway: 'home', status: 'scheduled' };
const tick = () => new Promise(r => setTimeout(r, 5));

test('3. KNOWN — the list is known only once confirmed for the club in force, and a club transition forgets it', () => {
  assert.equal(sandbox({ synced: '' }).fixturesKnown(), false, 'never confirmed');
  assert.equal(sandbox({ synced: '2026-09-30T00:00:00.000Z' }).fixturesKnown(), true, 'confirmed for this club');
  assert.equal(sandbox({ synced: '2026-09-30T00:00:00.000Z', owned: false }).fixturesKnown(), false, 'a marker on state the server has not vouched for proves nothing');
  const s = sandbox({ synced: '2026-09-30T00:00:00.000Z' });
  s.resetTeamScopedState();
  assert.equal(s.state.fixturesSyncedAt, '', 'the next club starts unknown');
  assert.deepEqual(s.state.fixtures, []);
  const n = sandbox();
  assert.equal(n.noteFixturesSynced(), true, 'the first confirmation reports unknown → known');
  assert.equal(n.noteFixturesSynced(), false, 'a later confirmation reports no change');
  assert.match(stripComments(fn('resetTeamScopedState')), /state\.fixturesSyncedAt = '';/);
});

test('4. FINGERPRINT — what the player can see: the raw and the sanitised spelling of one record agree; a moved date does not', () => {
  const s = sandbox();
  const raw = { id: 'fx_sat', opposition: 'Alpha', date: SATURDAY, time: '14:00', groupId: 'g1', createdAt: 'x', updatedAt: 'y' };
  const sanitised = { ...raw, venue: '', competition: '', homeAway: '', status: 'scheduled', sideId: '', team: '', arrivalTime: '', notes: '', updatedAt: 'z' };
  assert.equal(s.fixturesFingerprint([raw]), s.fixturesFingerprint([sanitised]), 'the same fixture in either spelling');
  assert.notEqual(s.fixturesFingerprint([raw]), s.fixturesFingerprint([{ ...raw, date: FRIDAY }]), 'a moved fixture');
  assert.notEqual(s.fixturesFingerprint([raw]), s.fixturesFingerprint([raw, FRI]), 'an added fixture');
  assert.notEqual(s.fixturesFingerprint([raw]), s.fixturesFingerprint([{ ...raw, status: 'cancelled' }]), 'a cancelled fixture');
  assert.equal(s.fixturesFingerprint(null), s.fixturesFingerprint([]), 'no list is an empty list');
});

test('5. REFRESH — re-reads the list, adopts a change, repaints the screen the player is on, and saves; identical data repaints nothing', async () => {
  const s = sandbox({ fixtures: [SAT], synced: '2026-09-30T00:00:00.000Z', serverFixtures: [SAT, FRI] });
  assert.equal(await s.refreshPlayerFixtures(), true, 'a change was adopted');
  assert.equal(s.fixtureGets(), 1);
  assert.deepEqual(s.state.fixtures.map(f => f.id), ['fx_sat', 'fx_fri']);
  assert.equal(s.counts.repaints.availability, 1, 'the Availability screen was repainted');
  assert.deepEqual(s.counts.saves, ['Fixtures synced']);
  assert.equal(s.counts.renders, 0, 'no whole-app render');
  // the same list again
  assert.equal(await s.refreshPlayerFixtures(), false, 'nothing changed');
  assert.equal(s.counts.repaints.availability, 1, 'identical data repaints nothing');
  assert.equal(s.counts.saves.length, 1, 'and saves nothing');
  // the screen the player is on decides what is repainted
  const home = sandbox({ section: 'home', fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI] });
  await home.refreshPlayerFixtures();
  assert.deepEqual(home.counts.repaints, { availability: 0, home: 1, fixtures: 0 });
  const other = sandbox({ section: 'messages', fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI] });
  await other.refreshPlayerFixtures();
  assert.deepEqual(other.counts.repaints, { availability: 0, home: 0, fixtures: 0 }, 'a screen without fixtures is left alone');
  assert.deepEqual(other.state.fixtures.map(f => f.id), ['fx_sat', 'fx_fri'], 'but the list is adopted for when they get there');
});

test('6. REFRESH — becoming KNOWN repaints even when the list is identical, so a known-empty group gets its generic card', async () => {
  const s = sandbox({ fixtures: [], synced: '', serverFixtures: [] });
  assert.equal(s.fixturesKnown(), false);
  assert.equal(await s.refreshPlayerFixtures(), true);
  assert.equal(s.fixturesKnown(), true);
  assert.equal(s.counts.repaints.availability, 1);
  assert.deepEqual(s.counts.saves, ['Fixtures synced'], 'the marker is persisted');
});

test('7. REFRESH — one request at a time (shared while in flight), coalesced by maxAgeMs, and never for a coach, a signed-out device or an unowned club', async () => {
  const s = sandbox({ fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI], fixturesDelay: 30 });
  const a = s.refreshPlayerFixtures(), b = s.refreshPlayerFixtures({ maxAgeMs: 1500 }), c = s.refreshPlayerFixtures();
  assert.ok(s.inFlight(), 'in flight');
  assert.deepEqual(await Promise.all([a, b, c]), [true, true, true], 'every caller gets the one outcome');
  assert.equal(s.fixtureGets(), 1, 'ONE request');
  assert.equal(s.counts.repaints.availability, 1, 'ONE repaint');
  assert.equal(await s.refreshPlayerFixtures({ maxAgeMs: 1500 }), null, 'a landing this recent is not asked again');
  assert.equal(s.fixtureGets(), 1);
  assert.equal(await s.refreshPlayerFixtures(), false, 'without a window it asks, and finds nothing new');
  assert.equal(s.fixtureGets(), 2);
  for (const [why, cfg] of [['coach view', { view: 'coach' }], ['signed out', { signedOut: true }], ['club not in force', { owned: false }]]) {
    const n = sandbox({ ...cfg, fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI] });
    assert.equal(await n.refreshPlayerFixtures(), null, why + ': nothing asked');
    assert.equal(n.fixtureGets(), 0, why + ': no request');
  }
});

test('8. REFRESH — a reply for a club this device has since left is discarded (Build 97 rule), and a failed read keeps the local view', async () => {
  const s = sandbox({ fixtures: [SAT], synced: 'x', serverFixtures: [FRI], fixturesDelay: 20 });
  const p = s.refreshPlayerFixtures();
  s.leaveClub();
  assert.equal(await p, null);
  assert.deepEqual(s.state.fixtures.map(f => f.id), ['fx_sat'], 'the other club\'s list was not adopted');
  assert.equal(s.counts.repaints.availability, 0);
  const bad = sandbox({ fixtures: [SAT], synced: 'x', serverFixtures: [FRI], fixturesStatus: 500 });
  assert.equal(await bad.refreshPlayerFixtures(), null);
  assert.deepEqual(bad.state.fixtures.map(f => f.id), ['fx_sat']);
  assert.equal(bad.inFlight(), null, 'the latch is released after a failure');
});

test('9. CLUB DATA ARRIVAL — a changed fixture list repaints the player\'s screen; identical data repaints nothing; a club with no record is known-empty', async () => {
  // changed: the club's list has a new fixture
  const s = sandbox({ fixtures: [SAT], synced: 'x', serverClub: { clubName: 'Club', fixtures: [SAT, FRI] } });
  await s.loadClubConfigFromServer();
  assert.deepEqual(s.state.fixtures.map(f => f.id), ['fx_sat', 'fx_fri']);
  assert.equal(s.counts.repaints.availability, 1, 'repainted');
  assert.ok(s.landedAt() > 0, 'a confirmed list counts as a landing (coalesces the next section entry)');
  // identical
  const same = sandbox({ fixtures: [SAT], synced: 'x', serverClub: { clubName: '', fixtures: [SAT] } });
  await same.loadClubConfigFromServer();
  assert.equal(same.counts.repaints.availability, 0, 'identical data: no repaint');
  assert.equal(same.counts.nav, 0, 'and no navigation redraw either');
  // first confirmation on a fresh device: unknown → known repaints (the generic card may now appear)
  const fresh = sandbox({ fixtures: [], synced: '', serverClub: null });
  await fresh.loadClubConfigFromServer();
  assert.equal(fresh.fixturesKnown(), true, 'a club with no record has no fixtures — known');
  assert.equal(fresh.counts.repaints.availability, 1);
  assert.deepEqual(fresh.counts.saves, ['Fixtures synced']);
  // the coach's legacy path is untouched: a proven same-club coach with no record still seeds
  assert.match(stripComments(fn('loadClubConfigFromServer')), /if \(!clubStateOwned\(\)\) return;\s*await saveClubConfigToServer\(\);/);
});

test('10. RETURN — returning to the app re-reads answers AND fixtures for a player, coalescing the visibility/focus pair; the coach board path is unchanged', async () => {
  const s = sandbox({ fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI] });
  s.refreshAvailabilityOnReturn(); s.refreshAvailabilityOnReturn();   // the pair a phone fires
  await tick(); await tick();
  assert.equal(s.counts.selfReads, 2, 'the self-read behaves as before');
  assert.equal(s.counts.flushes, 2, 'the pending flush behaves as before');
  assert.equal(s.fixtureGets(), 1, 'ONE fixture request for the pair');
  assert.deepEqual(s.state.fixtures.map(f => f.id), ['fx_sat', 'fx_fri']);
  assert.match(stripComments(fn('refreshAvailabilityOnReturn')), /state\.activeView === 'player' && typeof refreshPlayerFixtures === 'function'\) refreshPlayerFixtures\(\{ maxAgeMs: 1500 \}\)/);
  const coach = sandbox({ view: 'coach', fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI] });
  coach.state.activeCoachSection = 'message';
  coach.refreshAvailabilityOnReturn(); await tick();
  assert.equal(coach.counts.boardRefresh, 1, 'the coach board still refreshes');
  assert.equal(coach.fixtureGets(), 0, 'and no player fixture read is made in the coach shell');
});

test('11. SECTION ENTRY — entering Availability re-reads fixtures (at most once per 30s); other sections and the coach shell do not', async () => {
  const s = sandbox({ section: 'home', fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI] });
  s.setSection('player', 'availability'); await tick(); await tick();
  assert.equal(s.fixtureGets(), 1, 'entering Availability asks once');
  assert.equal(s.counts.renders, 1, 'setSection renders as before');
  s.setSection('player', 'home'); s.setSection('player', 'availability'); await tick();
  assert.equal(s.fixtureGets(), 1, 'flicking between tabs asks nothing more');
  const c = sandbox({ view: 'coach', fixtures: [SAT], synced: 'x', serverFixtures: [SAT, FRI], isCoach: true });
  c.setSection('coach', 'message'); await tick();
  assert.equal(c.fixtureGets(), 0, 'the coach shell is untouched');
  assert.doesNotMatch(stripComments(fn('renderPlayerAvailabilityV2')), /refreshPlayerFixtures|loadFixturesFromServer|resource=fixtures/, 'the renderer never fetches fixtures');
  assert.doesNotMatch(stripComments(fn('render')), /refreshPlayerFixtures/, 'nor does render()');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. BROWSER — the real client against the real handlers
// ═══════════════════════════════════════════════════════════════════════════
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.fixture-freshness.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
process.env.LOCAL_TIMEZONE           = 'UTC';   // Build 134: the zone replaces the retired fixed LOCAL_TZ_OFFSET (was '0')
delete process.env.VERCEL; delete process.env.NODE_ENV; delete process.env.DEV_LOGIN;

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (a.includes('NX') && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { result = kv.delete(a[0]) ? 1 : 0; }
  if (cmd === 'SCAN' || cmd === 'KEYS') {
    const glob = cmd === 'SCAN' ? String(a[a.indexOf('MATCH') + 1] ?? '*') : String(a[0] ?? '*');
    const re = new RegExp('^' + glob.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const matching = [...kv.keys()].filter(k => re.test(k));
    result = cmd === 'SCAN' ? ['0', matching] : matching;
  }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  if (cmd === 'INCR') { const v = Number(kv.get(a[0]) || 0) + 1; kv.set(a[0], v); result = v; }
  return { ok: true, json: async () => ({ result }) };
};
const S  = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) handlers[name] = (await import(`../api/${name}.js`)).default;
const { SESSION_COOKIE } = S;
const PW = 'password123';
let kseq = 0; const kkey = () => String(kseq++).padStart(2, '0').repeat(10);
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
async function run(name, method, query, body, cookie, res) {
  const vreq = { method, headers: { ...(cookie ? { cookie } : {}), host: 'test.local', 'x-forwarded-proto': 'http' }, query: query || {}, body: body || {}, url: '/api/' + name, on() {} };
  let captured = null;
  const vres = { statusCode: 200, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res?.setHeader(k, v); }, getHeader(k) { return res?.getHeader(k); },
    writeHead(c, h) { res?.writeHead(c, h); return this; }, write(d) { res?.write(d); },
    json(d) { captured = d; if (res) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); } return this; },
    end(d) { if (res) { res.statusCode = this.statusCode; res.end(d); } return this; }, send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
  await handlers[name](vreq, vres);
  return { status: vres.statusCode, body: captured };
}
/** Seniors (initial group) + U18 with two teams. players: [{ key, name, group: 'U18' | 'SEN' | null }] */
async function makeClub(label, players) {
  const club = await S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`, email: `coach.${label.toLowerCase()}@ff.test`, password: PW, idempotencyKey: kkey() });
  const teamId = club.team.id;
  const U18 = (await ST.createGroup(teamId, { name: 'U18', developmentCategory: 'youth_u18' })).group.id;
  await ST.createTeam(teamId, { groupId: U18, name: 'U18 Premier' });
  await ST.createTeam(teamId, { groupId: U18, name: 'U18 Premier Development' });
  const SEN = ST.INITIAL_GROUP_ID;
  const code = (await S.loadStoredTeams()).find(t => t.id === teamId).teamCode;
  const c = { club, teamId, SEN, U18, people: {}, label, coachEmail: `coach.${label.toLowerCase()}@ff.test` };
  for (const p of players) {
    const [f, l] = p.name.split(' ');
    const email = `${p.key.toLowerCase()}.${label.toLowerCase()}@ff.test`;
    const made = await S.createJoinRequest({ teamCode: code, firstName: f, lastName: l, email, password: PW });
    await S.approveJoinRequest(made.teamMember.id, club.user.id, teamId);
    c.people[p.key] = { ...made, name: p.name, email, gid: p.group === 'U18' ? U18 : p.group === 'SEN' ? SEN : '' };
  }
  const members = await S.loadTeamMembers();
  for (const m of members) { const who = Object.values(c.people).find(p => p.user.id === m.userId); if (who && m.teamId === teamId && who.gid) m.playerGroupId = who.gid; }
  await S.saveTeamMembers(members);
  for (const p of Object.values(c.people)) p.session = await S.createSession({ userId: p.user.id, teamId, role: 'player' });
  c.coach = await S.createSession({ userId: club.user.id, teamId, role: 'coach' });
  return c;
}
const addFixture = async (c, groupId, fixture) => {
  const out = await run('publish', 'POST', { resource: 'fixtures' }, { action: 'create', groupId, fixture: { homeAway: 'home', time: '14:00', ...fixture } }, ck(c.coach));
  assert.ok(out.status < 300, `fixture ${fixture.opposition}: ${out.status} ${JSON.stringify(out.body)}`);
  return out.body.fixture;
};
const addSlot = async (c, group, day) => {
  const out = await run('publish', 'POST', { resource: 'training-schedule' }, { action: 'add', group, slot: { day, startTime: '19:00', venue: 'Pitch', active: true } }, ck(c.coach));
  assert.ok(out.status < 300, `slot ${day}: ${out.status}`);
};
/** Every stored answer for one session, across every group keyspace: [{ group, who: [...] }] */
function stored(c, sessionId) {
  const rows = [];
  for (const [k, v] of kv) {
    if (!k.startsWith(`app:availability:${c.teamId}:`) || !k.endsWith(':' + sessionId)) continue;
    let rec = v; try { rec = typeof v === 'string' ? JSON.parse(v) : v; } catch { rec = {}; }
    rows.push({ group: (k.match(/:group:([^:]+):/) || [])[1] === c.U18 ? 'U18' : (k.match(/:group:([^:]+):/) || [])[1] || 'legacy', who: Object.values(rec || {}).map(e => e && e.label) });
  }
  return rows;
}
const boardAnswer = async (c, groupId, userId, sessionId) => {
  const out = await run('availability', 'GET', { resolveRoster: '1', group: groupId }, null, ck(c.coach));
  return (((out.body.resolved || {})[String(userId).toLowerCase()] || {})[sessionId] || {}).response || 'NO REPLY';
};

let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const REWRITES = { roster: { handler: 'publish', query: { resource: 'roster' } } };
const NET = { log: [], delays: [] };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
// One server PER TEST (Build 106): a shared instance left listening by a test
// the runner cancelled made the next test fail on `listen` before it began.
const makeServer = () => http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let name = url.pathname.slice(5).split('/')[0];
    const query = Object.fromEntries(url.searchParams);
    if (REWRITES[name]) { Object.assign(query, REWRITES[name].query); name = REWRITES[name].handler; }
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const slow = NET.delays.find(d => d.match(name, req.method, query));
    if (slow) await (slow.gate || new Promise(r => setTimeout(r, slow.ms)));
    if (!handlers[name]) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try {
      const out = await run(name, req.method, query, body, req.headers.cookie, res);
      NET.log.push({ name, method: req.method, query, body, status: out.status, response: out.body });
    } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fnc, ms, every = 80) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await sleep(every); } };
const INIT = () => {
  try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {}
  window.__toasts = [];
  const hook = () => { const el = document.getElementById('toast'); if (!el) return setTimeout(hook, 20);
    new MutationObserver(() => { const t = el.textContent.trim(); if (t) window.__toasts.push(t); }).observe(el, { childList: true, characterData: true, subtree: true }); };
  document.addEventListener('DOMContentLoaded', hook);
};
// HOLD the club and fixture replies until the test releases them (Build 106).
// A fixed delay made the "not yet on screen" checks a race: on a loaded machine
// the 500ms the test slept stretched past the 1200ms the reply was delayed, the
// reply landed first, and the precondition failed — the very flake that
// blocked the release gate once. A held reply cannot land until released.
const holdClubAndFixtures = () => {
  let release;
  const gate = new Promise(r => { release = r; });
  NET.delays.length = 0;
  NET.delays.push({ match: (n, m, q) => n === 'publish' && m === 'GET' && (q.resource === 'club' || q.resource === 'fixtures'), gate });
  return () => { NET.delays.length = 0; release(); };
};
/** The player's screen has painted its cards (any card at all). */
const painted = page => waitFor(() => page.evaluate(() => document.querySelectorAll('#player-availability .avail-player-card').length > 0 || /Nothing scheduled|All responses submitted/.test(document.getElementById('player-availability')?.innerText || '')), 10000);
const fixtureGets = () => NET.log.filter(x => x.name === 'publish' && x.method === 'GET' && x.query.resource === 'fixtures').length;
const requests = () => NET.log.length;

async function open(browser, BASE, email, { phone, timezoneId, storageState } = {}) {
  const ctx = await browser.newContext({ ...(phone ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block', ...(timezoneId ? { timezoneId } : {}), ...(storageState ? { storageState } : {}) });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept().catch(() => {}));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if (!storageState) {
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
  }
  await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
  return { ctx, page, errors, consoleErrors };
}
const goAvailability = page => page.evaluate(() => { if (state.activeView !== 'player') setView('player'); setSection('player', 'availability'); });
/** The Availability screen as the player sees it, read from the DOM. */
const screen = page => page.evaluate(() => {
  const root = document.getElementById('player-availability');
  const cards = [...root.querySelectorAll('.avail-player-card')].map(card => {
    const buttons = [...card.querySelectorAll('.avail-btn')];
    const key = ((buttons[0]?.getAttribute('onclick') || '').match(/availabilityV2SetStatus\('([^']*)'/) || [])[1] || '';
    return { title: (card.querySelector('.avail-player-card-title')?.innerText || '').replace(/\s+/g, ' ').trim(),
             meta: [...card.querySelectorAll('.avail-player-card-meta')].map(e => e.innerText.trim()).join(' | '),
             chip: (card.querySelector('.avail-status-chip')?.innerText || '').trim(), sessionId: key ? keyToSessionId(key) : '',
             controls: buttons.filter(b => b.offsetParent !== null && !b.disabled).map(b => b.innerText.trim()) };
  });
  return { known: fixturesKnown(), week: availViewedWeek(), cards, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
});
const tapAvailable = async (page, sessionId, phone = true) => {
  await page.evaluate(() => { window.__toasts = []; });
  const card = page.locator('#player-availability .avail-player-card').filter({ has: page.locator(`.avail-btn[onclick*="'avail_${sessionId}'"], .avail-btn[onclick*="'${sessionId}'"]`) }).first();
  const btn = card.locator('.avail-btn', { hasText: /^Available$/ });
  if (phone) await btn.tap({ timeout: 5000 }); else await btn.click({ timeout: 5000 });
  await sleep(900);
  return page.evaluate(() => (window.__toasts || []).slice());
};

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): U18 Saturday match — answer lands on the board; a match added while the app stays open appears on return; delayed club data repaints; a fresh sign-in offers no generic card; a group with no fixture keeps its card once known`, { timeout: 300000 }, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const phone = view === 'phone';
    const budget = {};
    let ctx;
    let release = () => {};          // releases any held reply, so a failed step can never leave the server waiting
    const server = makeServer();
    try {
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const BASE = `http://127.0.0.1:${server.address().port}`;
      const c = await makeClub('Fresh' + view, [
        { key: 'Jordan', name: 'Jordan Player', group: 'U18' }, { key: 'Wes', name: 'Wes Working', group: 'U18' },
        { key: 'Nog', name: 'Nog Group', group: null }, { key: 'Sen', name: 'Sen Senior', group: 'SEN' },
      ]);
      await addSlot(c, c.U18, 'Tue');
      const premier = await addFixture(c, c.U18, { opposition: 'Alpha', date: SATURDAY, time: '14:00', team: 'U18 Premier' });
      const second  = await addFixture(c, c.U18, { opposition: 'Beta', date: SATURDAY, time: '11:00', team: 'U18 2' });
      const seniors = await addFixture(c, c.SEN, { opposition: 'Gamma', date: SATURDAY, time: '15:00' });

      // 1–4. Jordan opens Availability; the Saturday match exists; he answers; the board sees it.
      NET.log.length = 0;
      let j = await open(browser, BASE, c.people.Jordan.email, { phone });
      ctx = j.ctx;
      await goAvailability(j.page);
      await waitFor(() => j.page.evaluate(() => fixturesKnown() && !!_trainingSchedule), 15000);
      await sleep(1500);
      budget.initialLoad = { requests: requests(), fixtureGets: fixtureGets() };
      let s = await screen(j.page);
      assert.equal(s.known, true, 'the list is known');
      const ids = s.cards.map(x => x.sessionId);
      assert.ok(ids.length === 3 && ids[0].startsWith('slot_') && ids.includes(premier.id) && ids.includes(second.id), 'Tuesday training and both U18 Saturday fixtures, under their own ids: ' + ids);
      assert.equal(s.cards.filter(x => x.title === 'Saturday Match').length, 2, 'two U18 sides on one Saturday: two cards');
      assert.ok(!s.cards.some(x => x.sessionId === seniors.id), 'never the Seniors match');
      assert.ok(!s.cards.some(x => x.sessionId === 'game'), 'no generic card once real fixtures are known');
      assert.deepEqual(s.cards.find(x => x.sessionId === premier.id).controls, ['Available', 'Maybe', 'Unavailable'], 'all three controls');
      assert.deepEqual(await tapAvailable(j.page, premier.id, phone), ['Availability saved']);
      assert.deepEqual(stored(c, premier.id), [{ group: 'U18', who: ['Jordan Player'] }], 'written under the fixture id in the U18 keyspace');
      assert.equal(await boardAnswer(c, c.U18, c.people.Jordan.user.id, premier.id), 'available', 'the coach board sees it');
      assert.equal(s.overflow, false, 'no horizontal overflow');
      const snapshot = await ctx.storageState();

      // 5–8. The app stays open; the coach adds a fixture; Jordan returns; it appears without a restart.
      const added = await addFixture(c, c.U18, { opposition: 'Newly Added', date: FRIDAY, time: '19:30', team: 'U18 Premier' });
      NET.log.length = 0;
      await j.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
      assert.ok(await waitFor(() => j.page.evaluate(id => [...document.querySelectorAll('#player-availability .avail-btn')].some(b => (b.getAttribute('onclick') || '').includes(id)), added.id), 8000), 'the new fixture is on screen after returning');
      await sleep(400);
      budget.returnPair = { requests: requests(), fixtureGets: fixtureGets() };
      assert.equal(budget.returnPair.fixtureGets, 1, 'the visibility/focus pair made ONE fixture request');
      assert.deepEqual(await tapAvailable(j.page, added.id, phone), ['Availability saved'], 'and it can be answered');
      assert.deepEqual(stored(c, added.id), [{ group: 'U18', who: ['Jordan Player'] }]);
      // an idle return: nothing changed, nothing repainted
      await sleep(1600);
      NET.log.length = 0;
      const kept = await j.page.evaluate(() => new Promise(r => { const card = document.querySelector('#player-availability .avail-player-card'); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); setTimeout(() => r(card.isConnected), 1500); }));
      assert.ok(kept, 'unchanged data does not repaint the screen');
      budget.idleReturn = { requests: requests(), fixtureGets: fixtureGets() };
      assert.ok(budget.idleReturn.fixtureGets <= 1, 'at most one re-read on an idle return');
      assert.deepEqual(j.errors, [], 'no page errors'); assert.deepEqual(j.consoleErrors, [], 'no console errors');
      await ctx.close(); ctx = null;

      // 9–12. Delayed club data on a reopen: the fixture added since lands after the first paint, and the screen repaints.
      const moved = await addFixture(c, c.U18, { opposition: 'Late Arrival', date: WEEKFN.availAddDays(WEEK, 3), time: '18:00', team: 'U18 Premier' });
      release = holdClubAndFixtures();
      NET.log.length = 0;
      j = await open(browser, BASE, c.people.Jordan.email, { phone, storageState: snapshot });
      ctx = j.ctx;
      await goAvailability(j.page);
      assert.ok(await painted(j.page), 'the screen painted from the device state');
      s = await screen(j.page);
      assert.ok(!s.cards.some(x => x.sessionId === moved.id), 'before the reply lands the new fixture is not yet on screen (the device state predates it)');
      assert.ok(!s.cards.some(x => x.sessionId === 'game'), 'and no generic card is invented meanwhile');
      release();
      assert.ok(await waitFor(() => j.page.evaluate(id => [...document.querySelectorAll('#player-availability .avail-btn')].some(b => (b.getAttribute('onclick') || '').includes(id)), moved.id), 8000), 'the fixture appears without a tap once the reply lands');
      await sleep(600);
      budget.delayedReopen = { requests: requests(), fixtureGets: fixtureGets() };
      s = await screen(j.page);
      assert.ok(!s.cards.some(x => x.sessionId === 'game'), 'no generic card remains');
      assert.deepEqual(j.errors, []);
      await ctx.close(); ctx = null;

      // 13–15. A fresh sign-in on a new device, club and fixture replies slow: no generic card while unresolved, then the real match.
      release = holdClubAndFixtures();
      NET.log.length = 0;
      const w = await open(browser, BASE, c.people.Wes.email, { phone });
      ctx = w.ctx;
      await goAvailability(w.page);
      assert.ok(await painted(w.page), 'the screen painted while the fixture replies are held');
      s = await screen(w.page);
      assert.equal(s.known, false, 'fixtures are not yet known');
      assert.ok(!s.cards.some(x => x.sessionId === 'game'), 'UNKNOWN: no generic "Match" is offered');
      assert.ok(!s.cards.some(x => x.sessionId === premier.id), 'and the real fixture is not there yet either');
      release();
      assert.ok(await waitFor(() => w.page.evaluate(id => [...document.querySelectorAll('#player-availability .avail-btn')].some(b => (b.getAttribute('onclick') || '').includes(id)), premier.id), 10000), 'the real Saturday match appears once the list lands');
      s = await screen(w.page);
      assert.equal(s.known, true);
      assert.ok(!s.cards.some(x => x.sessionId === 'game'));
      assert.deepEqual(await tapAvailable(w.page, premier.id, phone), ['Availability saved']);
      assert.deepEqual(stored(c, premier.id), [{ group: 'U18', who: ['Jordan Player', 'Wes Working'] }], 'the answer is written against the real fixture id');
      assert.deepEqual(stored(c, 'game'), [], 'nothing was ever written under game');
      assert.deepEqual(w.errors, []);
      await ctx.close(); ctx = null;

      // Placement, unchanged in this build: a player with no group sees every group's fixtures; a Seniors player never the U18 match.
      const n = await open(browser, BASE, c.people.Nog.email, { phone }); ctx = n.ctx;
      await goAvailability(n.page); await waitFor(() => n.page.evaluate(() => fixturesKnown()), 10000); await sleep(800);
      s = await screen(n.page);
      assert.ok(s.cards.some(x => x.sessionId === premier.id) && s.cards.some(x => x.sessionId === seniors.id), 'no group: every group\'s fixtures (the existing rule)');
      await ctx.close(); ctx = null;
      const se = await open(browser, BASE, c.people.Sen.email, { phone }); ctx = se.ctx;
      await goAvailability(se.page); await waitFor(() => se.page.evaluate(() => fixturesKnown()), 10000); await sleep(800);
      s = await screen(se.page);
      assert.ok(s.cards.some(x => x.sessionId === seniors.id) && !s.cards.some(x => x.sessionId === premier.id), 'Seniors: the Seniors match, never the U18 one');
      await ctx.close(); ctx = null;

      // 16–17. A group with no fixture at all: nothing invented while unresolved; the generic card once the list is known-empty.
      const e = await makeClub('Empty' + view, [{ key: 'Solo', name: 'Solo Player', group: 'U18' }]);
      await addSlot(e, e.U18, 'Thu');
      release = holdClubAndFixtures();
      const so = await open(browser, BASE, e.people.Solo.email, { phone }); ctx = so.ctx;
      await goAvailability(so.page);
      assert.ok(await painted(so.page), 'the screen painted while the fixture replies are held');
      s = await screen(so.page);
      assert.equal(s.known, false);
      assert.ok(!s.cards.some(x => x.sessionId === 'game'), 'UNKNOWN: no generic card');
      release();
      assert.ok(await waitFor(() => so.page.evaluate(() => fixturesKnown() && [...document.querySelectorAll('#player-availability .avail-btn')].some(b => (b.getAttribute('onclick') || '').includes("'game'"))), 10000), 'KNOWN AND EMPTY: the generic card appears, without a tap');
      assert.deepEqual(await tapAvailable(so.page, 'game', phone), ['Availability saved'], 'and can be answered');
      assert.deepEqual(stored(e, 'game'), [{ group: 'U18', who: ['Solo Player'] }]);
      assert.deepEqual(so.errors, []);
      await ctx.close(); ctx = null;
      t.diagnostic('request budget ' + JSON.stringify(budget));
    } finally {
      release(); NET.delays.length = 0;
      try { await ctx?.close(); } catch {}
      await browser.close(); await new Promise(r => server.close(r));
    }
  });
}

test('browser (timezones): the U18 Saturday fixture stays in the current week in Europe/Brussels and America/Santiago', { timeout: 120000 }, async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  let ctx;
  const server = makeServer();
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const c = await makeClub('Zones', [{ key: 'Jordan', name: 'Jordan Player', group: 'U18' }]);
    const premier = await addFixture(c, c.U18, { opposition: 'Alpha', date: SATURDAY, time: '14:00', team: 'U18 Premier' });
    let snapshot = null;
    for (const timezoneId of ['Europe/Brussels', 'America/Santiago']) {
      const j = await open(browser, BASE, c.people.Jordan.email, { phone: true, timezoneId, ...(snapshot ? { storageState: snapshot } : {}) });
      ctx = j.ctx;
      if (!snapshot) snapshot = await ctx.storageState();
      await goAvailability(j.page);
      await waitFor(() => j.page.evaluate(() => fixturesKnown()), 10000); await sleep(600);
      const s = await screen(j.page);
      assert.equal(s.week, WEEK, timezoneId + ': the current week');
      const card = s.cards.find(x => x.sessionId === premier.id);
      assert.ok(card, timezoneId + ': the Saturday match is on screen');
      assert.match(card.meta, new RegExp('^' + SATURDAY), timezoneId + ': on its own date');
      await ctx.close(); ctx = null;
    }
  } finally {
    try { await ctx?.close(); } catch {}
    await browser.close(); await new Promise(r => server.close(r));
  }
});
