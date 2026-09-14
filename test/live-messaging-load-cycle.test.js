/**
 * PERF-FIX-1 — the coach Availability/Messaging screen must not re-run its
 * whole live-data network cycle on every render().
 *
 * render() calls loadLiveMessaging() unconditionally while that section is
 * open, and render() fires on far more than a section change (every
 * saveState, nav badge update, poll repaint). Each cycle is all network:
 * the schedules panel fetches /api/schedules + /api/templates, and the board
 * fetches the resolved availability map. Production logs showed the same
 * endpoints repeating several times within seconds.
 *
 * These tests drive the REAL extracted client functions. They assert
 * BEHAVIOUR — how many cycles run, how many loader calls happen — not source
 * text. Nothing here changes what a caller may READ: the availability
 * semantics, group scoping and tenant isolation all live server-side and are
 * untouched by the guard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}

const WINDOW_MS = Number(src.match(/const LIVE_MESSAGING_MIN_INTERVAL_MS = (\d+);/)[1]);

/**
 * A harness around the REAL loadLiveMessaging + its guard helpers. `script` is
 * a sequence of actions run against them; the result counts loader calls.
 */
function runCycles(script, { availabilityThrows = false } = {}) {
  const body = `"use strict";
    const calls = { cycles: 0, schedules: 0, templates: 0, log: 0, responses: 0, push: 0, availability: [] };
    let now = 1000000;
    const state = { activeView: 'coach', activeCoachSection: 'message' };
    let _availPollTimer = null;
    function setInterval() { return 42; }
    function clearInterval() {}
    function renderPushStatusCard() { calls.push++; }
    function loadLiveSchedules() { calls.schedules++; }
    function loadLiveTemplates() { calls.templates++; }
    function loadLiveLog() { calls.log++; }
    function loadLiveResponses() { calls.responses++; }
    async function refreshLiveAvailability(opts) {
      calls.cycles++;
      calls.availability.push(opts || {});
      if (${JSON.stringify(availabilityThrows)}) throw new Error('availability read failed');
    }
    const Date = { now: () => now };
    ${extractFn('liveMessagingCycleDue')}
    ${extractFn('liveMessagingArmReload')}
    ${extractFn('loadLiveMessaging')}
    // Module state the real functions close over.
    let _liveMessagingLoadedAt = 0;
    let _liveMessagingInFlight = false;
    const LIVE_MESSAGING_MIN_INTERVAL_MS = ${WINDOW_MS};
    const advance = (ms) => { now += ms; };
    return (async () => { ${script} ; return calls; })();
  `;
  return new Function(body)();
}

// ── 1. one genuine entry = one cycle ──────────────────────────────────────
test('entering the section runs exactly one live-data cycle', async () => {
  const calls = await runCycles(`await loadLiveMessaging();`);
  assert.equal(calls.cycles, 1, 'one availability refresh');
  assert.equal(calls.schedules, 1, 'schedules panel loaded once');
  assert.equal(calls.responses, 1, 'responses loader invoked once');
});

// ── 2. repeated renders inside the window do NOT repeat the cycle ─────────
test('repeated renders within the window run only ONE cycle', async () => {
  // Ten renders back-to-back — what a few seconds of ordinary use produces.
  const calls = await runCycles(`
    for (let i = 0; i < 10; i++) await loadLiveMessaging();
  `);
  assert.equal(calls.cycles, 1, 'nine of the ten renders were absorbed');
  assert.equal(calls.schedules, 1, '/api/schedules + /api/templates fetched once, not ten times');
  assert.equal(calls.log, 1);
});

test('renders still inside the window after some time do not re-run', async () => {
  const calls = await runCycles(`
    await loadLiveMessaging();
    advance(${WINDOW_MS - 1});
    await loadLiveMessaging();
  `);
  assert.equal(calls.cycles, 1, 'one millisecond short of the window is still throttled');
});

test('the guard is a throttle, not a cache — it expires', async () => {
  const calls = await runCycles(`
    await loadLiveMessaging();
    advance(${WINDOW_MS});
    await loadLiveMessaging();
  `);
  assert.equal(calls.cycles, 2, 'a later render past the window refreshes');
});

// ── 3. leaving and re-entering refreshes immediately ──────────────────────
test('leaving the section re-arms: re-entry loads fresh data at once', async () => {
  const calls = await runCycles(`
    await loadLiveMessaging();
    await loadLiveMessaging();          // throttled
    liveMessagingArmReload();           // render() does this when not on the section
    await loadLiveMessaging();          // genuine re-entry
  `);
  assert.equal(calls.cycles, 2, 're-entry is never made to wait out the window');
  assert.equal(calls.schedules, 2);
});

test('an explicit force runs a cycle regardless of the window', async () => {
  const calls = await runCycles(`
    await loadLiveMessaging();
    await loadLiveMessaging({ force: true });
  `);
  assert.equal(calls.cycles, 2);
});

// ── 4. a failure must not latch the guard shut ────────────────────────────
test('a failed cycle re-arms so the next render retries', async () => {
  const calls = await runCycles(`
    await loadLiveMessaging();          // fails inside refreshLiveAvailability
    await loadLiveMessaging();          // must NOT be throttled
  `, { availabilityThrows: true });
  assert.equal(calls.cycles, 2, 'a failed load never locks the loader out');
});

test('a failure does not leave the in-flight flag stuck', async () => {
  // If the flag latched, EVERY later call would be refused forever.
  const calls = await runCycles(`
    await loadLiveMessaging();
    await loadLiveMessaging();
    await loadLiveMessaging();
  `, { availabilityThrows: true });
  assert.equal(calls.cycles, 3, 'each retry is allowed through');
});

// ── 4b. a cycle already in flight is not joined by a second one ───────────
test('a render during a slow cycle does not start a second one', async () => {
  // The production case: the board read crosses the Atlantic, and render()
  // fires again while it is still outstanding. Without the in-flight guard
  // every such render launches another full cycle.
  const calls = await new Function(`"use strict";
    const calls = { cycles: 0, schedules: 0 };
    let now = 1000000;
    const state = { activeView: 'coach', activeCoachSection: 'message' };
    let _availPollTimer = null;
    let release;
    const pending = new Promise(r => { release = r; });
    function setInterval() { return 42; } function clearInterval() {}
    function renderPushStatusCard() {} function loadLiveSchedules() { calls.schedules++; }
    function loadLiveTemplates() {} function loadLiveLog() {} function loadLiveResponses() {}
    function refreshLiveAvailability() { calls.cycles++; return pending; }
    const Date = { now: () => now };
    ${extractFn('liveMessagingCycleDue')}
    ${extractFn('liveMessagingArmReload')}
    ${extractFn('loadLiveMessaging')}
    let _liveMessagingLoadedAt = 0;
    let _liveMessagingInFlight = false;
    const LIVE_MESSAGING_MIN_INTERVAL_MS = ${WINDOW_MS};
    return (async () => {
      const first = loadLiveMessaging();        // starts, then blocks on the board read
      await Promise.resolve();
      // NOT awaited: a refused call returns at once, but a call that wrongly
      // started would block on the same pending read and deadlock the test.
      loadLiveMessaging();                      // a render arrives mid-flight
      loadLiveMessaging();                      // and another
      await Promise.resolve(); await Promise.resolve();
      release(); await first;
      return calls;
    })();
  `)();
  assert.equal(calls.cycles, 1, 'only the first cycle ran while it was outstanding');
  assert.equal(calls.schedules, 1, 'the panels were not re-fetched mid-flight');
});

test('a cycle that outlives the window is still not piled onto', async () => {
  // The timestamp is stamped when a cycle STARTS, so it covers overlapping
  // renders inside the window on its own. The in-flight guard exists for the
  // case it cannot cover: a slow or hung cycle still running once the window
  // has expired. Without it, every later render would launch another cycle on
  // top of the stuck one — the pile-up this fix exists to prevent.
  const calls = await new Function(`"use strict";
    const calls = { cycles: 0 };
    let now = 1000000;
    const state = { activeView: 'coach', activeCoachSection: 'message' };
    let _availPollTimer = null;
    let release;
    const pending = new Promise(r => { release = r; });
    function setInterval() { return 42; } function clearInterval() {}
    function renderPushStatusCard() {} function loadLiveSchedules() {}
    function loadLiveTemplates() {} function loadLiveLog() {} function loadLiveResponses() {}
    function refreshLiveAvailability() { calls.cycles++; return pending; }
    const Date = { now: () => now };
    ${extractFn('liveMessagingCycleDue')}
    ${extractFn('liveMessagingArmReload')}
    ${extractFn('loadLiveMessaging')}
    let _liveMessagingLoadedAt = 0;
    let _liveMessagingInFlight = false;
    const LIVE_MESSAGING_MIN_INTERVAL_MS = ${WINDOW_MS};
    return (async () => {
      const first = loadLiveMessaging();
      await Promise.resolve();
      now += ${WINDOW_MS * 3};          // the cycle is hung well past the window
      loadLiveMessaging();              // not awaited — see the note above
      loadLiveMessaging();
      await Promise.resolve(); await Promise.resolve();
      release(); await first;
      return calls;
    })();
  `)();
  assert.equal(calls.cycles, 1, 'the outstanding cycle is never doubled up on');
});

// ── 5. the in-cycle duplicate panel reload is gone ────────────────────────
test('the cycle tells refreshLiveAvailability not to reload the panels again', async () => {
  const calls = await runCycles(`await loadLiveMessaging();`);
  assert.equal(calls.availability[0].skipPanelReload, true,
    'loadLiveMessaging already loaded the panels; the refresh must not repeat them');
});

/**
 * The other half of that contract, on the REAL refreshLiveAvailability: with
 * skipPanelReload it must NOT re-fetch the panels, and without it (a manual
 * refresh, or the refresh on returning to the tab) it still must.
 */
function runRefresh(opts) {
  const body = `"use strict";
    const calls = { schedules: 0, templates: 0, log: 0, picker: 0, push: 0, fetches: [] };
    const state = { operationalGroupId: 'g1', players: [] };
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = '', _availLastSync = null;
    const document = { getElementById: () => null };
    function operationalGroups() { return [{ id: 'g1' }]; }
    async function ensureCoachRosterIdentityLinked() {}
    async function fetch(url) { calls.fetches.push(url); return { ok: true, json: async () => ({ resolved: {} }) }; }
    function renderMessageCenter() {}
    function renderAudiencePicker() { calls.picker++; }
    function renderPushStatusCard() { calls.push++; }
    function loadLiveSchedules() { calls.schedules++; }
    function loadLiveTemplates() { calls.templates++; }
    function loadLiveLog() { calls.log++; }
    function saveState() {}
    function sessionKey(s) { return s; }
    function liveAvailabilityPlayerKeys() { return []; }
    const timers = [];
    function setTimeout(fn) { timers.push(fn); return 1; }
    ${extractFn('refreshLiveAvailability')}
    return (async () => {
      await refreshLiveAvailability(${JSON.stringify(opts)});
      timers.forEach(fn => fn());      // run the deferred panel block
      return calls;
    })();
  `;
  return new Function(body)();
}

test('skipPanelReload: the real refresh does not re-fetch the panels', async () => {
  const calls = await runRefresh({ skipPanelReload: true });
  assert.equal(calls.schedules, 0, 'no second /api/schedules + /api/templates pair');
  assert.equal(calls.templates, 0);
  assert.equal(calls.log, 0);
  // The UI repaint still happens — only the duplicate network work is dropped.
  assert.equal(calls.picker, 1, 'audience picker still repainted after the refresh');
  assert.equal(calls.push, 1, 'push status card still repainted');
});

test('a manual refresh still reloads the panels (behaviour preserved)', async () => {
  const calls = await runRefresh({});
  assert.equal(calls.schedules, 1, 'asking for a refresh still refreshes the panels');
  assert.equal(calls.templates, 1);
  assert.equal(calls.log, 1);
});

test('a board-only poll tick never touches the panels (unchanged)', async () => {
  const calls = await runRefresh({ boardOnly: true });
  assert.equal(calls.schedules, 0);
  assert.equal(calls.picker, 0, 'board-only ticks stay cheap, as before');
});

// ── 5b. render() wiring ───────────────────────────────────────────────────
test('render() loads on the section and re-arms when off it', () => {
  // render() is a thousand-line orchestrator that cannot be executed in a
  // sandbox, so its two branches are asserted as wiring — the same approach
  // the existing client suites use for render-path contracts. Without the
  // else branch, leaving the section would never re-arm and a returning coach
  // would be served whatever the window still held.
  const fn = extractFn('render');
  const tail = fn.slice(fn.indexOf('activeCoachSection === "message"'));
  assert.match(tail, /loadLiveMessaging\(\)/, 'the section still loads its live data');
  assert.match(tail, /else\s*\{\s*liveMessagingArmReload\(\);/,
    'being off the section re-arms the next entry');
});

// ── 5c. the <details> toggle must not refetch on every render ─────────────
// The schedules panel's <details> is rebuilt by each render of this screen and
// the browser fires `toggle` when an already-open <details> is parsed in, so
// the raw handler re-fetched the panel every render, outside the cycle guard.
function runToggle(script) {
  const body = `"use strict";
    const calls = { loads: 0 };
    let now = 1000000;
    let _liveSchedulesLoadedAt = 0;
    let _liveSchedulesHtml = '';
    const LIVE_MESSAGING_MIN_INTERVAL_MS = ${WINDOW_MS};
    const Date = { now: () => now };
    // A render rebuilds the panel with its placeholder.
    const panel = { innerHTML: 'Loading...' };
    const document = { getElementById: () => panel };
    function rerender() { panel.innerHTML = 'Loading...'; }
    function loadLiveSchedules() {
      calls.loads++;
      _liveSchedulesLoadedAt = Date.now();
      panel.innerHTML = '<div>schedule rows</div>';
      _liveSchedulesHtml = panel.innerHTML;
    }
    ${extractFn('loadLiveSchedulesOnToggle')}
    const advance = (ms) => { now += ms; };
    ${script}
    return { ...calls, panelHtml: panel.innerHTML };
  `;
  return new Function(body)();
}

test('the panel loads on a first toggle', () => {
  assert.equal(runToggle(`loadLiveSchedulesOnToggle();`).loads, 1);
});

test('re-renders firing toggle repeatedly reload the panel only once', () => {
  const calls = runToggle(`
    for (let i = 0; i < 10; i++) { rerender(); loadLiveSchedulesOnToggle(); }
  `);
  assert.equal(calls.loads, 1, 'ten spurious toggles cost one load, not ten');
});

test('a throttled toggle still leaves the panel showing its content', () => {
  // The regression this must prevent: render rebuilds the panel with its
  // placeholder, the toggle is throttled, and the coach is left looking at
  // "Loading..." until the window expires.
  const calls = runToggle(`
    loadLiveSchedulesOnToggle();      // first load fills it
    rerender();                        // a render wipes it back to the placeholder
    loadLiveSchedulesOnToggle();       // throttled — but must repaint
  `);
  assert.equal(calls.loads, 1, 'no refetch');
  assert.match(calls.panelHtml, /schedule rows/, 'the panel shows content, not "Loading..."');
});

/**
 * The REAL loadLiveSchedules paired with the REAL toggle handler, so what the
 * loader actually stores (and refuses to store) is what gets asserted.
 */
function runRealSchedules({ fails = false, schedules = [{ id: 's1', name: 'Chase', active: true, days: ['mon'], time: '18:00' }] } = {}) {
  const body = `"use strict";
    const calls = { fetches: 0 };
    let now = 1000000;
    let _liveSchedulesLoadedAt = 0;
    let _liveSchedulesHtml = '';
    const LIVE_MESSAGING_MIN_INTERVAL_MS = ${WINDOW_MS};
    const Date = { now: () => now };
    const panel = { innerHTML: 'Loading...' };
    const document = { getElementById: () => panel };
    function esc(s) { return String(s); }
    async function fetch(url) {
      calls.fetches++;
      if (${JSON.stringify(fails)}) throw new Error('network down');
      return { json: async () => (/templates/.test(url)
        ? { templates: [] }
        : { schedules: ${JSON.stringify(schedules)} }) };
    }
    ${extractFn('loadLiveSchedulesOnToggle')}
    ${extractFn('loadLiveSchedules')}
    return (async () => {
      await loadLiveSchedules();                 // the real load
      const afterLoad = panel.innerHTML;
      const fetchesAfterLoad = calls.fetches;
      panel.innerHTML = 'Loading...';            // a render rebuilds the panel
      loadLiveSchedulesOnToggle();               // the rebuilt <details> fires
      return { afterLoad, fetchesAfterLoad, afterToggle: panel.innerHTML, fetches: calls.fetches };
    })();
  `;
  return new Function(body)();
}

test('the real loader stores its markup, so a throttled toggle can repaint it', async () => {
  const r = await runRealSchedules();
  assert.match(r.afterLoad, /Chase/, 'the real loader painted the schedule');
  assert.equal(r.fetchesAfterLoad, 2, 'one /api/schedules + one /api/templates');
  assert.match(r.afterToggle, /Chase/, 'the rebuilt panel was repainted from what was stored');
  assert.equal(r.fetches, 2, 'and NOT re-fetched');
});

test('the real loader stores nothing on failure, so the next toggle retries', async () => {
  const r = await runRealSchedules({ fails: true });
  assert.match(r.afterLoad, /Could not load schedules/, 'the error is shown, not hidden');
  assert.equal(r.fetches > r.fetchesAfterLoad, true,
    'the failed panel is re-fetched rather than repainted as if it were content');
  assert.doesNotMatch(r.afterToggle, /Could not load schedules/,
    'an error is never replayed as cached content');
});

test('a failed load is never repainted as content, and retries', () => {
  const calls = new Function(`"use strict";
    const calls = { loads: 0 };
    let now = 1000000;
    let _liveSchedulesLoadedAt = 0;
    let _liveSchedulesHtml = '';
    const LIVE_MESSAGING_MIN_INTERVAL_MS = ${WINDOW_MS};
    const Date = { now: () => now };
    const panel = { innerHTML: 'Loading...' };
    const document = { getElementById: () => panel };
    function loadLiveSchedules() {        // mirrors the catch branch
      calls.loads++;
      panel.innerHTML = 'Could not load schedules';
      _liveSchedulesHtml = '';
      _liveSchedulesLoadedAt = 0;
    }
    ${extractFn('loadLiveSchedulesOnToggle')}
    loadLiveSchedulesOnToggle();
    loadLiveSchedulesOnToggle();
    return calls;
  `)();
  assert.equal(calls.loads, 2, 'an error never latches the panel — the next toggle retries');
});

test('a toggle after the window still reloads (not a permanent cache)', () => {
  const calls = runToggle(`
    loadLiveSchedulesOnToggle();
    advance(${WINDOW_MS});
    loadLiveSchedulesOnToggle();
  `);
  assert.equal(calls.loads, 2);
});

test('a load from any other path suppresses the spurious toggle that follows', () => {
  // Entering the section: the cycle loads the panel, then the rebuilt
  // <details> fires toggle. That toggle must not repeat the fetch.
  const calls = runToggle(`
    loadLiveSchedules();              // the live-data cycle loaded it
    loadLiveSchedulesOnToggle();      // the re-created <details> fires
  `);
  assert.equal(calls.loads, 1, 'entry costs one load in total');
});

// ── 6. the legacy game/tue/thu requests: RETAINED, proven dormant ─────────
test('loadLiveResponses issues NO requests while its panel is absent', async () => {
  // Evidence for retaining rather than deleting: the legacy sessionId=game|
  // tue|thu calls cannot fire, because the panel they fill was removed from
  // the Beta UI. They cost nothing, so this fix leaves them alone.
  const calls = await new Function(`"use strict";
    const calls = { fetches: [] };
    const document = { getElementById: () => null };   // panel not in the Beta DOM
    async function fetch(url) { calls.fetches.push(url); return { json: async () => ({}) }; }
    ${extractFn('loadLiveResponses')}
    return (async () => { await loadLiveResponses(); return calls; })();
  `)();
  assert.deepEqual(calls.fetches, [], 'dormant loader makes no availability requests');
});

test('the Beta markup really does omit the responses panel', () => {
  // The runtime claim above only holds while no element carries that id.
  const markup = src.replace(/getElementById\("live-responses-panel"\)/g, '');
  assert.equal(/id="live-responses-panel"/.test(markup), false,
    'no markup defines live-responses-panel, so the loader stays dormant');
});

// ── 7/8. availability semantics + scoping untouched ───────────────────────
test('the group-scoped board read is unchanged by this fix', async () => {
  const calls = await runRefresh({ skipPanelReload: true });
  assert.equal(calls.fetches.length, 1, 'exactly one board read per refresh');
  assert.match(calls.fetches[0], /^\/api\/availability\?resolveRoster=1/,
    'still the canonical resolved-roster read');
  assert.match(calls.fetches[0], /group=g1/,
    'still scoped to the operational group — no widening');
});

test('a multi-group coach with no group chosen still reads nothing', async () => {
  // Unchanged fail-safe: asking without a group would be refused server-side.
  const calls = await new Function(`"use strict";
    const calls = { fetches: [] };
    const state = { operationalGroupId: '', players: [] };
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = '', _availLastSync = null;
    const document = { getElementById: () => null };
    function operationalGroups() { return [{ id: 'g1' }, { id: 'g2' }]; }
    async function ensureCoachRosterIdentityLinked() {}
    async function fetch(url) { calls.fetches.push(url); return { ok: true, json: async () => ({}) }; }
    function renderMessageCenter() {} function renderAudiencePicker() {} function renderPushStatusCard() {}
    function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function saveState() {} function sessionKey(s) { return s; } function liveAvailabilityPlayerKeys() { return []; }
    function setTimeout() { return 1; }
    ${extractFn('refreshLiveAvailability')}
    return (async () => { await refreshLiveAvailability({ skipPanelReload: true }); return calls; })();
  `)();
  assert.deepEqual(calls.fetches, [], 'no group chosen → no board read, exactly as before');
});
