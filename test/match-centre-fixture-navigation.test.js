/**
 * Match Centre — PASS B: FIXTURE NAVIGATION + SWITCH LIFECYCLE + FILTERS.
 *
 * Pass A made storage fixture-scoped; this pass makes the workflow visible.
 * The selected fixture drives the header, availability, the candidate filters
 * and the coach drafts panel. Switching fixtures flushes the outgoing sheet to
 * its own key, clears locally, and loads the incoming fixture's own draft —
 * XV/bench never travel between fixtures, not even transiently.
 *
 * Everything here runs the REAL client functions sliced from index.html
 * against controlled state and a controlled in-memory /api/publish. No network,
 * no production data, no reminders actually sent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Slice a function out of the source (same extractor as the sibling suites,
 *  plus: an `async` prefix is preserved so extracted awaits stay legal). */
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
  const isAsync = src.slice(Math.max(0, start - 6), start) === 'async ';
  return (isAsync ? 'async ' : '') + src.slice(start, end + 1);
}

const MONS = 'fx_aug22', AMSTEL = 'fx_aug29', KITURO = 'fx_sep05';
const FIXTURES = [
  // Deliberately OUT of date order to prove ordering is by date, not input.
  { id: AMSTEL, opposition: 'Amstelveense', date: '2026-08-29', kickoffTime: '14:30', venue: 'Away ground', homeAway: 'away' },
  { id: KITURO, opposition: 'Kituro',       date: '2026-09-05', kickoffTime: '15:00', venue: 'Stade Fallon', homeAway: 'home' },
  { id: MONS,   opposition: 'Mons',         date: '2026-08-22', kickoffTime: '15:00', venue: 'Stade Fallon', homeAway: 'home' },
];

/**
 * A controlled /api/publish that stores drafts and squads per fixture, exactly
 * like the Pass A server shape. `hold` lets a test delay one response to prove
 * the stale-reply guard.
 */
function makeServer() {
  const drafts = new Map();   // fixtureId ('' = legacy anonymous) → record
  const squads = new Map();   // fixtureId → record
  const log = [];
  const holds = new Map();    // url-substring → resolver trigger
  const ok = data => ({ ok: true, json: async () => data });
  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    log.push({ url: u, body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET' });
    for (const [needle, gate] of holds) {
      if (u.includes(needle)) await gate;
    }
    if ((options.method || 'GET') === 'POST' && u.startsWith('/api/publish')) {
      const b = JSON.parse(options.body);
      if (b.type === 'draft') drafts.set(String(b.data.fixtureId || ''), structuredClone(b.data));
      if (b.type === 'squad') squads.set(String(b.data.fixtureId || ''), structuredClone(b.data));
      return ok({ ok: true });
    }
    if (u.startsWith('/api/publish?type=draft')) {
      const m = u.match(/fixture=([^&]+)/);
      const id = m ? decodeURIComponent(m[1]) : '';
      let draft = null;
      if (id) draft = drafts.get(id) || null;
      else {
        // Pre-Pass-B compatibility: most recently edited draft, any fixture.
        draft = [...drafts.values()].sort((a, b) =>
          String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
      }
      return ok({ ok: true, draft });
    }
    if (u.startsWith('/api/publish?type=squad')) {
      const m = u.match(/fixture=([^&]+)/);
      const id = m ? decodeURIComponent(m[1]) : '';
      return ok({ ok: true, squad: squads.get(id) || null });
    }
    if (u.startsWith('/api/push')) return ok({ ok: true, sent: 1 });
    return ok({ ok: true });
  };
  return { drafts, squads, log, holds, fetchImpl };
}

/** Build a live client context around the controlled server. */
function client(server, initialState = {}) {
  const state = {
    matchCentre: {}, fixtures: FIXTURES, formationNames: {}, benchPlayers: [],
    fphotoIds: {}, ...structuredClone(initialState),
  };
  const calls = { toasts: [], saves: 0, renders: 0 };
  const ctx = new Function(`
    const state = arguments[0];
    const calls = arguments[1];
    const fetch = arguments[2];
    function showToast(m) { calls.toasts.push(m); }
    function saveState() { calls.saves++; }
    function render() { calls.renders++; }
    function esc(v) { return String(v == null ? '' : v); }
    function isCoach() { return true; }
    let _coachDraftSaveTimer = null;
    // Dual-team pass: the REAL side helpers, with no structure loaded — the
    // sideless mode, in which every pre-side behaviour must hold unchanged.
    const _adminData = { structure: null };
    let _mcOtherSide = null;
    ${fn('matchCentreSides')}
    ${fn('matchCentreSidesActive')}
    ${fn('matchCentreSideId')}
    ${fn('matchCentreSelectedSide')}
    ${fn('mcOtherSideNames')}
    ${fn('mcLoadOtherSideSelections')}
    // Fixture group context (3-group foundation): the real helpers, with no
    // operational context — the unfiltered legacy mode every prior pin assumes.
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    function operationalGroups() { return []; }
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    ${fn('matchCentreFixtureList')}
    ${fn('mcFixtureDateLabel')}
    // single-group harness: group context passes fixtures through
    function contextFixtures() { return state.fixtures || []; }
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    ${fn('matchCentreHasSquadWork')}
    ${fn('saveCoachDraft')}
    ${fn('mcFlushDraftNow')}
    ${fn('mcApplyFixtureDisplay')}
    ${fn('mcClearFixtureDisplay')}
    ${fn('mcHydrateSelectedFixture')}
    ${fn('mcRefreshPublishedForFixture')}
    ${fn('setMatchCentreFixture')}
    ${fn('mcFixtureNav')}
    ${fn('matchCentreFixturePicker')}
    return { state, calls, matchCentreFixtureList, matchCentreFixtureId,
             matchCentreSelectedFixture, setMatchCentreFixture, mcFixtureNav,
             matchCentreFixturePicker, mcHydrateSelectedFixture, saveCoachDraft };
  `)(state, calls, server.fetchImpl);
  return ctx;
}

/** Let fire-and-forget hydrates finish. */
const settle = () => new Promise(r => setTimeout(r, 20));

// ── NAVIGATION ─────────────────────────────────────────────────────────────
test('the fixture list is real fixtures in chronological order', () => {
  const ctx = client(makeServer());
  assert.deepEqual(ctx.matchCentreFixtureList().map(f => f.id), [MONS, AMSTEL, KITURO],
    'date order, regardless of input order');
});

test('fixtures without an id or opponent never enter the list', () => {
  const ctx = client(makeServer());
  ctx.state.fixtures = [...FIXTURES, { id: '', opposition: 'Ghost', date: '2026-01-01' },
    { id: 'fx_x', opposition: '', date: '2026-01-02' }, null];
  assert.deepEqual(ctx.matchCentreFixtureList().map(f => f.id), [MONS, AMSTEL, KITURO]);
});

test('Next and Previous walk the chronological list from Mons', async () => {
  const ctx = client(makeServer());
  ctx.setMatchCentreFixture(MONS); await settle();
  ctx.mcFixtureNav(1); await settle();
  assert.equal(ctx.matchCentreFixtureId(), AMSTEL, 'Next → Amstelveense');
  ctx.mcFixtureNav(-1); await settle();
  assert.equal(ctx.matchCentreFixtureId(), MONS, 'Previous → Mons');
});

test('boundaries are safe at both ends', async () => {
  const ctx = client(makeServer());
  ctx.setMatchCentreFixture(MONS); await settle();
  ctx.mcFixtureNav(-1); await settle();
  assert.equal(ctx.matchCentreFixtureId(), MONS, 'Previous at the first fixture is a no-op');
  ctx.setMatchCentreFixture(KITURO); await settle();
  ctx.mcFixtureNav(1); await settle();
  assert.equal(ctx.matchCentreFixtureId(), KITURO, 'Next at the last fixture is a no-op');
});

test('from the unlinked state, Next enters at the earliest fixture', async () => {
  const ctx = client(makeServer());
  ctx.mcFixtureNav(-1); await settle();
  assert.equal(ctx.matchCentreFixtureId(), '', 'Previous from unlinked stays unlinked');
  ctx.mcFixtureNav(1); await settle();
  assert.equal(ctx.matchCentreFixtureId(), MONS);
});

test('an empty fixture list makes navigation a no-op, never a crash', () => {
  const ctx = client(makeServer());
  ctx.state.fixtures = [];
  ctx.mcFixtureNav(1); ctx.mcFixtureNav(-1);
  assert.equal(ctx.matchCentreFixtureId(), '');
});

test('the dropdown and the nav label stay in sync', async () => {
  const ctx = client(makeServer());
  ctx.setMatchCentreFixture(AMSTEL); await settle();
  const html = ctx.matchCentreFixturePicker();
  assert.match(html, new RegExp(`value="${AMSTEL}"[^>]*selected`), 'dropdown shows the selection');
  assert.match(html, /Amstelveense · 29 Aug/, 'the nav label names the same fixture');
  assert.match(html, /mcFixtureNav\(-1\)/); assert.match(html, /mcFixtureNav\(1\)/);
});

test('nav buttons disable exactly at the boundaries', async () => {
  const ctx = client(makeServer());
  ctx.setMatchCentreFixture(MONS); await settle();
  let html = ctx.matchCentreFixturePicker();
  assert.match(html, /id="mc-fixture-prev" disabled/, 'first fixture: Previous disabled');
  assert.doesNotMatch(html, /id="mc-fixture-next" disabled/, 'but Next is live');
  ctx.setMatchCentreFixture(KITURO); await settle();
  html = ctx.matchCentreFixturePicker();
  assert.match(html, /id="mc-fixture-next" disabled/, 'last fixture: Next disabled');
  assert.doesNotMatch(html, /id="mc-fixture-prev" disabled/);
});

test('the selection lives in persisted state, so it survives rerender', async () => {
  const ctx = client(makeServer());
  ctx.setMatchCentreFixture(AMSTEL); await settle();
  assert.equal(ctx.state.matchCentre.fixtureId, AMSTEL, 'stored in state.matchCentre');
  assert.ok(ctx.calls.saves > 0, 'and saveState ran, so it persists');
  // A rerender rebuilds from the same state — same selection.
  assert.match(ctx.matchCentreFixturePicker(), new RegExp(`value="${AMSTEL}"[^>]*selected`));
});

// ── THE CONTROLLED SWITCH PROOF: A/X ↔ B/Y ────────────────────────────────
test('Mons and Amstelveense squads never contaminate each other', async () => {
  const server = makeServer();
  const ctx = client(server);

  // Build the Mons sheet: XV = A, bench = X.
  ctx.setMatchCentreFixture(MONS); await settle();
  ctx.state.formationNames = { 1: 'Player A' };
  ctx.state.benchPlayers   = ['Bench X'];

  // Switch to Amstelveense and build a completely different sheet.
  ctx.setMatchCentreFixture(AMSTEL);
  assert.deepEqual(ctx.state.formationNames, {}, 'Mons XV did NOT travel — not even before hydrate');
  await settle();
  ctx.state.formationNames = { 1: 'Player B' };
  ctx.state.benchPlayers   = ['Bench Y'];

  // Back to Mons: the exact Mons sheet returns from ITS OWN key.
  ctx.setMatchCentreFixture(MONS); await settle();
  assert.deepEqual(ctx.state.formationNames, { 1: 'Player A' }, 'Mons XV restored exactly');
  assert.deepEqual(ctx.state.benchPlayers, ['Bench X'], 'Mons bench restored exactly');

  // And forward again: Amstelveense's own sheet, not Mons'.
  ctx.setMatchCentreFixture(AMSTEL); await settle();
  assert.deepEqual(ctx.state.formationNames, { 1: 'Player B' });
  assert.deepEqual(ctx.state.benchPlayers, ['Bench Y']);

  // The server holds one draft per fixture — nothing merged, nothing lost.
  assert.equal(server.drafts.get(MONS).formationNames[1], 'Player A');
  assert.equal(server.drafts.get(AMSTEL).formationNames[1], 'Player B');
});

test('the switch flush files the sheet under the OUTGOING fixture id', async () => {
  const server = makeServer();
  const ctx = client(server);
  ctx.setMatchCentreFixture(MONS); await settle();
  ctx.state.formationNames = { 1: 'Player A' };

  ctx.setMatchCentreFixture(AMSTEL); await settle();
  const flushPost = server.log.find(l => l.method === 'POST' && l.body?.type === 'draft'
    && l.body.data.formationNames?.[1] === 'Player A');
  assert.ok(flushPost, 'the Mons sheet was saved');
  assert.equal(flushPost.body.data.fixtureId, MONS,
    'under the Mons key — a pending sheet can never be filed under the new fixture');
});

test('a slow draft response for the OLD fixture cannot pollute the new one', async () => {
  const server = makeServer();
  const ctx = client(server);
  server.drafts.set(MONS,   { fixtureId: MONS,   formationNames: { 1: 'Player A' }, benchPlayers: [], updatedAt: '2026-08-14T10:00:00Z' });
  server.drafts.set(AMSTEL, { fixtureId: AMSTEL, formationNames: { 1: 'Player B' }, benchPlayers: [], updatedAt: '2026-08-14T11:00:00Z' });

  // Hold Mons' draft response until after the coach has moved to Amstelveense.
  let release; server.holds.set(`type=draft&fixture=${MONS}`, new Promise(r => { release = r; }));
  ctx.setMatchCentreFixture(MONS);          // hydrate now hangs on the hold
  ctx.setMatchCentreFixture(AMSTEL); await settle();
  assert.deepEqual(ctx.state.formationNames, { 1: 'Player B' }, 'Amstelveense loaded');

  release(); await settle();                // Mons' stale reply finally lands
  assert.deepEqual(ctx.state.formationNames, { 1: 'Player B' },
    'and is discarded — the stale-reply guard held');
  assert.equal(ctx.matchCentreFixtureId(), AMSTEL);
});

test('published is a per-fixture fact, read from that fixture\'s scoped record', async () => {
  const server = makeServer();
  server.squads.set(MONS, { fixtureId: MONS, published: true });
  const ctx = client(server);
  ctx.setMatchCentreFixture(MONS); await settle();
  assert.equal(ctx.state.matchCentre.published, true, 'Mons IS published');
  ctx.setMatchCentreFixture(AMSTEL); await settle();
  assert.equal(Boolean(ctx.state.matchCentre.published), false, 'Amstelveense is not');
  ctx.setMatchCentreFixture(MONS); await settle();
  assert.equal(ctx.state.matchCentre.published, true, 'and Mons still is');
});

test('the header display fields follow the selected fixture record', async () => {
  const ctx = client(makeServer());
  ctx.setMatchCentreFixture(MONS); await settle();
  assert.equal(ctx.state.matchCentre.opposition, 'Mons');
  assert.equal(ctx.state.matchCentre.kickoffDate, '2026-08-22');
  ctx.setMatchCentreFixture(AMSTEL); await settle();
  assert.equal(ctx.state.matchCentre.opposition, 'Amstelveense');
  assert.equal(ctx.state.matchCentre.kickoffDate, '2026-08-29');
  assert.equal(ctx.state.matchCentre.homeAway, 'away', 'home/away comes from the fixture too');
  // Unlink: honest cleared state, not the last fixture's leftovers.
  ctx.setMatchCentreFixture(''); await settle();
  assert.equal(ctx.state.matchCentre.opposition, '');
  assert.equal(ctx.state.matchCentre.kickoffDate, '');
});

test('a fixture with no stored draft yields an empty sheet, not a guess', async () => {
  const server = makeServer();
  const ctx = client(server);
  server.drafts.set('', { fixtureId: '', formationNames: { 1: 'Anonymous XV' }, benchPlayers: [], updatedAt: '2026-08-14T09:00:00Z' });
  ctx.setMatchCentreFixture(KITURO); await settle();
  assert.deepEqual(ctx.state.formationNames, {},
    'the anonymous legacy draft is never injected into a real fixture');
});

// ── SOURCE PINS — the render wiring the DOM tests rely on ─────────────────
test('renderMatchday resolves availability from the SELECTED fixture\'s event', () => {
  assert.match(src, /mcFx \? sessionRows\(String\(mcFx\.id\)\)/,
    'rows come from sessionRows(<fixtureId>) — the fixture\'s own dated event');
  assert.doesNotMatch(fn('renderMatchday'), /sessionKey\(_gameSessTbl\.id\)/,
    'the old generic-game read for the candidate table is gone');
});

test('the header h1 derives from the fixture record with home/away ordering', () => {
  const body = fn('renderMatchday');
  assert.match(body, /_hdrAway\s*\?/, 'away fixtures flip the ordering');
  assert.match(body, /_hdrOpp\s*=\s*mcFx \? \(mcFx\.opposition/, 'opponent from the fixture record');
  assert.match(body, /'Opponent TBC'/, 'the honest TBC state survives for unlinked');
});

test('the default filter is Available when a fixture is linked, All when not', () => {
  assert.match(fn('renderMatchday'), /_mcAvailFilter \|\| \(mcFx \? 'available' : 'all'\)/);
});

test('changing the filter is view-only — it cannot touch state at all', () => {
  const body = fn('mcSetAvailFilter');
  assert.doesNotMatch(body, /state\./, 'no state access of any kind');
  assert.match(body, /render\(\)/, 'it only re-renders');
});

test('search and sort still compose with the filter', () => {
  const body = fn('renderMatchday');
  assert.match(body, /mcAvailSearch\(this\.textContent\)/, 'search box intact');
  assert.match(body, /mcSetAvailSort\('pos'\)/, 'position sort intact');
  assert.match(body, /_visibleStats/, 'rows render from the FILTERED list');
  assert.match(fn('mcAvailSearch'), /mc7-trow/, 'search filters the same rows the filter renders');
});

// ── FILTER DEFINITIONS — exact ────────────────────────────────────────────
test('filter buckets are the exact recorded answers, nothing inferred', () => {
  const ctx = client(makeServer());
  const bucket = new Function(`${fn('mcAvailFilterBucket')}; return mcAvailFilterBucket;`)();
  assert.equal(bucket('available'), 'available');
  assert.equal(bucket('maybe'), 'maybe');
  assert.equal(bucket('unavailable'), 'unavailable');
  assert.equal(bucket('injured'), 'unavailable', 'legacy coach-set state reads as out');
  assert.equal(bucket('no-reply'), 'noreply');
  assert.equal(bucket(''), 'noreply', 'no response exists → No reply');
  assert.equal(bucket(undefined), 'noreply');
  assert.equal(bucket('something-else'), 'noreply', 'an unknown value never invents an answer');
});

test('the controlled four-player scenario buckets to 1/1/1/1', () => {
  const bucket = new Function(`${fn('mcAvailFilterBucket')}; return mcAvailFilterBucket;`)();
  const rows = [
    { player: { id: 'A' }, status: 'available' },
    { player: { id: 'B' }, status: 'maybe' },
    { player: { id: 'C' }, status: 'unavailable' },
    { player: { id: 'D' }, status: undefined },
  ];
  const counts = { all: rows.length, available: 0, maybe: 0, unavailable: 0, noreply: 0 };
  rows.forEach(r => counts[bucket(r.status)]++);
  assert.deepEqual(counts, { all: 4, available: 1, maybe: 1, unavailable: 1, noreply: 1 });
});

// ── COACH DRAFTS PANEL — selected fixture only ────────────────────────────
function draftsPanel(selectedFixtureId, coachDraftsList, users) {
  const state = {
    matchCentre: { fixtureId: selectedFixtureId }, fixtures: FIXTURES,
    currentUserId: 'me', users,
  };
  return new Function(`
    const state = arguments[0];
    const _coachDraftsList = arguments[1];
    function isCoach() { return true; }
    function esc(v) { return String(v == null ? '' : v); }
    function _draftTimeAgo(iso) { return iso ? 'at ' + iso : ''; }
    const _MC_STAFF_ROLE_LABEL = { coach: 'Coach', admin: 'Admin', medical: 'Medical' };
    function matchCentreSideId() { return ''; }          // sideless mode
    function matchCentreSelectedSide() { return null; }
    // single-group harness: group context passes fixtures through
    function contextFixtures() { return state.fixtures || []; }
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    ${fn('mcFixtureDateLabel')}
    ${fn('mcComparePanelHTML')}
    ${fn('mcViewCoachDraft')}
    const opened = [];
    function showToast() {}
    function _mcOpenCompareViewer(title, subtitle) { opened.push(subtitle); }
    return { html: mcComparePanelHTML(),
             open: id => { mcViewCoachDraft(id); return opened; } };
  `)(state, coachDraftsList);
}

const USERS = [
  { id: 'me', role: 'coach', name: 'Me' },
  { id: 'ca', role: 'coach', name: 'Coach A' },
  { id: 'cb', role: 'coach', name: 'Coach B' },
];
const DRAFT_ROWS = [
  { userId: 'ca', coachName: 'Coach A', role: 'coach', fixtureId: MONS,   updatedAt: 'mons-time',   squad: { opposition: 'Mons' } },
  { userId: 'ca', coachName: 'Coach A', role: 'coach', fixtureId: AMSTEL, updatedAt: 'amstel-time', squad: { opposition: 'Amstelveense' } },
  { userId: 'cb', coachName: 'Coach B', role: 'coach', fixtureId: MONS,   updatedAt: 'mons-b-time', squad: { opposition: 'Mons' } },
  { userId: 'cb', coachName: 'Coach B', role: 'coach', fixtureId: '',     updatedAt: 'anon-time',   squad: { opposition: 'Anon' } },
];

test('viewing Mons shows ONLY Mons drafts — one row per coach', () => {
  const { html } = draftsPanel(MONS, DRAFT_ROWS, USERS);
  assert.match(html, /Coach drafts — Mons · 22 Aug/, 'the panel names its fixture');
  assert.match(html, /at mons-time/, 'Coach A\'s MONS timestamp');
  assert.match(html, /at mons-b-time/, 'Coach B\'s MONS timestamp');
  assert.doesNotMatch(html, /at amstel-time/, 'Coach A\'s Amstelveense draft is not mixed in');
  assert.doesNotMatch(html, /at anon-time/, 'the anonymous legacy draft is not injected');
});

test('viewing Amstelveense shows only Coach A\'s Amstelveense draft', () => {
  const { html } = draftsPanel(AMSTEL, DRAFT_ROWS, USERS);
  assert.match(html, /at amstel-time/);
  assert.doesNotMatch(html, /at mons-time/);
  assert.doesNotMatch(html, /at mons-b-time/);
  assert.match(html, /Coach B<\/span>[\s\S]{0,200}?No draft yet/,
    'Coach B honestly has no draft FOR THIS FIXTURE');
});

test('unlinked shows only the anonymous legacy drafts', () => {
  const { html } = draftsPanel('', DRAFT_ROWS, USERS);
  assert.match(html, /Coach drafts — No linked fixture/);
  assert.match(html, /at anon-time/);
  assert.doesNotMatch(html, /at mons-time|at amstel-time|at mons-b-time/);
});

test('View opens the SAME record the row shows — never another fixture\'s', () => {
  const panel = draftsPanel(MONS, DRAFT_ROWS, USERS);
  const opened = panel.open('ca');
  assert.equal(opened.length, 1);
  assert.match(opened[0], /at mons-time/, 'Coach A\'s MONS draft opened, not Amstelveense\'s');
});

// ── REMINDERS — selected fixture context, computed client-side ────────────
/**
 * Build the real reminder pipeline (targets + sender) around a controlled
 * sessionRows and a recording fetch. Uses the REAL isRosterPlayerRecord, so
 * staff/archived exclusion is the production predicate, not a test stub.
 */
function remindHarness(rows, { confirm = true } = {}) {
  const pushes = [];
  const calls = { confirms: 0, toasts: [] };
  const api = new Function(`
    const pushes = arguments[0];
    const rows = arguments[1];
    const calls = arguments[2];
    const confirmAnswer = arguments[3];
    const state = { matchCentre: { fixtureId: '${MONS}' }, fixtures: ${JSON.stringify(FIXTURES)} };
    function isCoach() { return true; }
    function showToast(m) { calls.toasts.push(m); }
    async function ceConfirm() {
      calls.confirms++;
      await new Promise(r => setTimeout(r, 5));   // a real dialog takes time
      return confirmAnswer;
    }
    function chaseAllNonResponders() { throw new Error('legacy path must not run for a linked fixture'); }
    function sessionRows(id) {
      if (id !== '${MONS}') throw new Error('asked for the wrong fixture: ' + id);
      return rows;
    }
    async function fetch(url, options) {
      pushes.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true, sent: 1 }) };
    }
    function identityNameKey(v = '') { return String(v || '').trim().toLowerCase(); }
    ${fn('isRosterPlayerRecord')}
    ${fn('mcFixtureDateLabel')}
    // single-group harness: group context passes fixtures through
    function contextFixtures() { return state.fixtures || []; }
    ${fn('matchCentreSelectedFixture')}
    ${fn('mcFixtureRemindTargets')}
    let _mcRemindInFlight = false;
    ${fn('remindFixtureNonResponders')}
    return { remind: remindFixtureNonResponders, targets: () => mcFixtureRemindTargets('${MONS}') };
  `)(pushes, rows, calls, confirm);
  return { pushes, calls, ...api };
}

test('the fixture reminder targets exactly the non-responders for THAT fixture', async () => {
  const h = remindHarness([
    { player: { id: 'A', userId: 'uA', name: 'Player A', position: 'Prop' }, status: 'available' },
    { player: { id: 'D', userId: 'uD', name: 'Player D', position: 'Wing' }, status: 'no-reply' },
  ]);
  await h.remind();
  assert.equal(h.pushes.length, 1, 'one push — only the non-responder');
  assert.equal(h.pushes[0].targetUserId, 'uD', 'targeted at Player D');
  assert.equal(h.pushes[0].sessionId, MONS, 'carrying the fixture\'s own event id');
  assert.match(h.pushes[0].body, /Mons · 22 Aug/, 'and naming the fixture, not "this session"');
});

test('answered players — Available, Maybe OR Unavailable — are never reminded', async () => {
  const h = remindHarness([
    { player: { id: 'A', name: 'A', position: 'Prop' },   status: 'available' },
    { player: { id: 'B', name: 'B', position: 'Hooker' }, status: 'maybe' },
    { player: { id: 'C', name: 'C', position: 'Lock' },   status: 'unavailable' },
    { player: { id: 'D', name: 'D', position: 'Wing' },   status: '' },
  ]);
  await h.remind();
  assert.deepEqual(h.pushes.map(p => p.targetUserId), ['D'], 'any recorded answer excludes a player');
});

test('staff records and archived players are never reminder targets', async () => {
  const h = remindHarness([
    { player: { id: 's1', name: 'Head Coach', position: 'Coach' },  status: 'no-reply' },
    { player: { id: 's2', name: 'Physio', position: 'Medical Staff' }, status: 'no-reply' },
    { player: { id: 'x1', name: 'Old Boy', position: 'Prop', lifecycleStatus: 'archived' }, status: 'no-reply' },
    { player: { id: 'p1', name: 'Real Player', position: 'Prop' },  status: 'no-reply' },
  ]);
  assert.deepEqual(h.targets().map(p => p.id), ['p1'],
    'only the active roster player qualifies');
  await h.remind();
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0].targetUserId, 'p1');
});

test('a duplicate identity row yields AT MOST one push per player', async () => {
  const h = remindHarness([
    { player: { id: 'p1', name: 'Real Player', position: 'Prop' }, status: 'no-reply' },
    { player: { id: 'p1', name: 'Real Player', position: 'Prop' }, status: 'no-reply' },
    { player: { id: 'p1', name: 'Real Player', position: 'Prop' }, status: '' },
  ]);
  await h.remind();
  assert.equal(h.pushes.length, 1, 'de-duplicated by player id inside the target builder');
});

test('a double-tap while the confirm is open cannot double-send', async () => {
  const h = remindHarness([
    { player: { id: 'p1', name: 'Real Player', position: 'Prop' }, status: 'no-reply' },
  ]);
  await Promise.all([h.remind(), h.remind(), h.remind()]);   // one click + frantic re-taps
  assert.equal(h.calls.confirms, 1, 'one confirm dialog, not three');
  assert.equal(h.pushes.length, 1, 'one push batch');
  // And the guard resets: a genuine second click later works again.
  await h.remind();
  assert.equal(h.calls.confirms, 2);
  assert.equal(h.pushes.length, 2);
});

test('declining the confirm sends nothing and releases the guard', async () => {
  const h = remindHarness([
    { player: { id: 'p1', name: 'Real Player', position: 'Prop' }, status: 'no-reply' },
  ], { confirm: false });
  await h.remind();
  assert.equal(h.pushes.length, 0, 'declined — zero requests');
  await h.remind();
  assert.equal(h.calls.confirms, 2, 'the in-flight guard did not stick shut');
});

test('when everyone has replied, nothing is sent and no dialog opens', async () => {
  const h = remindHarness([
    { player: { id: 'A', name: 'A', position: 'Prop' }, status: 'available' },
  ]);
  await h.remind();
  assert.equal(h.pushes.length, 0);
  assert.equal(h.calls.confirms, 0, 'no confirm for an empty target list');
});

test('the remind button count is the true target count, not the raw pending KPI', () => {
  assert.match(fn('renderMatchday'), /remindCount\s*=\s*mcFx \? mcFixtureRemindTargets\(mcFx\.id\)\.length/,
    'linked: the button counts exactly who a click would push');
  assert.match(fn('renderMatchday'), /Remind \$\{remindCount\}/, 'and the label uses it');
});

// ── EXPORT + HISTORY SAFETY ───────────────────────────────────────────────
test('the export filename names the selected fixture and ITS date', () => {
  const body = fn('exportFormation');
  assert.match(body, /matchCentreSelectedFixture\(\)/);
  assert.match(body, /_fx\.date/, 'the fixture\'s date, not today\'s, when linked');
});

test('switching, filtering and hydrating never write selection history', () => {
  for (const name of ['setMatchCentreFixture', 'mcHydrateSelectedFixture',
                      'mcSetAvailFilter', 'mcRefreshPublishedForFixture', 'mcFlushDraftNow']) {
    const body = fn(name);
    assert.doesNotMatch(body, /squadSelections|appearance/, `${name} records no history`);
  }
});
