/**
 * MATCH CENTRE SIBLING-LOCK FAIL-OPEN (MATCH-CENTRE-AVAILABILITY-FIX-1).
 *
 * Production defect: the sibling side's snapshot (_mcOtherSide) loaded only on
 * a fixture/side TAP, and every lock predicate failed OPEN to an empty set when
 * it was null or stale. A boot-restored desktop therefore listed U18 Premier's
 * published starters (Marius van Praag, Adrian Trabada da Silva) as Available
 * for U18 Premier Development, let them be dragged/picked, draft-saved and
 * published. The phone looked correct only because its tap flow reloaded first.
 *
 * The fix: (1) a render-driven, 12s-throttled refresher so the snapshot loads
 * without a gesture and heals the teams race and sibling publishes; (2) an
 * explicit RESOLVED marker — the guards fail CLOSED (with a "checking" message)
 * while the sibling answer is genuinely unknown; (3) the desktop rail wears the
 * locks in every view. Predicates themselves were already correct.
 *
 * Drives the REAL extracted functions with a controllable fetch/clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

const MARIUS = 'Marius van Praag';
const ADRIAN = 'Adrian Trabada da Silva';
const BENCHKID = 'Bench Kid';
const FREE = 'Free Player';

/**
 * A Match Centre sandbox around the REAL loader, refresher, predicates and
 * guards. `cfg`:
 *   devCategory  — group classification ('youth_u18' | 'unknown' | …)
 *   teamsKnown   — has the teams payload landed?
 *   sibling      — server sheet the sibling fetch returns (or null)
 *   fetchFails   — network failure
 */
function mc(cfg = {}) {
  const calls = { fetches: 0, toasts: [], renders: 0, placed: [], draftSaves: 0 };
  const body = `
    "use strict";
    const CALLS = arguments[0], CFG = arguments[1];
    let NOW = 1000000;
    const Date_now = () => NOW;
    const Date = { now: Date_now };
    const state = { matchCentre: { fixtureId: 'fx-dend', sideId: 'team-dev' }, operationalGroupId: 'grp-u18',
                    formationNames: {}, benchPlayers: [] };
    const _mcTeams = CFG.teamsKnown ? { groups: [{ id: 'grp-u18', developmentCategory: CFG.devCategory }],
      teams: [{ id: 'team-prem', groupId: 'grp-u18', name: 'U18 Premier' },
              { id: 'team-dev',  groupId: 'grp-u18', name: 'U18 Premier Development' }] } : null;
    const _adminData = null;
    function isCoach() { return true; }
    function matchCentreFixtureId() { return state.matchCentre.fixtureId; }
    function matchCentreSideId() { return state.matchCentre.sideId; }
    function matchCentreSidesActive() {
      if (!_mcTeams) return [];
      return _mcTeams.teams.filter(t => t.groupId === 'grp-u18');
    }
    function mcPersonKey(n) { return n ? 'id:' + String(n).trim().toLowerCase() : ''; }
    function render() { CALLS.renders++; }
    function showToast(m) { CALLS.toasts.push(String(m)); }
    function esc(s) { return String(s); }
    function saveState() {}
    function saveCoachDraftDebounced() { CALLS.draftSaves++; }
    function stopMatchdayAutoScroll() {}
    function _mcClearDragFx() {}
    function _mcParseSource(v) { return v ? JSON.parse(v) : null; }
    function _mcCurrentName() { return ''; }
    function _mcSetTarget(dest, name) { CALLS.placed.push({ dest, name }); }
    function _mcSame() { return false; }
    async function fetch(url) {
      CALLS.fetches++;
      if (CFG.fetchFails) throw new Error('offline');
      const isSquad = url.includes('type=squad');
      return { ok: true, json: async () => (isSquad ? { squad: CFG.sibling } : { draft: null }) };
    }
    ${fn('mcTeamsSidesKnown')}
    ${fn('mcSiblingStateResolved')}
    let _mcOtherSide = null;
    let _mcOtherSideResolvedKey = '';
    let _mcOtherSideFetchedAt = 0;
    ${fn('_mcOtherSideKeySet')}
    ${fn('mcOtherSideStartingKeys')}
    ${fn('mcOtherSideBenchKeys')}
    ${fn('mcOperatingGroupDevCategory')}
    ${fn('mcBenchLocksSibling')}
    ${fn('mcIneligibleKeys')}
    ${fn('mcPickerLocked')}
    ${fn('mcRefreshOtherSideSelections')}
    ${fn('mcLoadOtherSideSelections')}
    let _mcPickTarget = { type: 'slot', label: '10' };
    ${fn('mcPick')}
    function mcClosePicker() {}
    ${fn('_mcDrop')}
    return {
      state,
      refresh: mcRefreshOtherSideSelections,
      resolved: mcSiblingStateResolved,
      locked: n => mcPickerLocked(n),
      pick: n => mcPick(n),
      drop: (n, src) => _mcDrop({ type: 'slot', label: '10' }, {
        preventDefault() {}, dataTransfer: { getData: k => k === 'playerName' ? n : (src ? JSON.stringify(src) : '') } }),
      tick: ms => { NOW += ms; },
      setStale: snap => { _mcOtherSide = snap; },
      setResolvedKey: k => { _mcOtherSideResolvedKey = k; },
      snapshot: () => _mcOtherSide,
    };`;
  return { api: new Function(body)(calls, {
    devCategory: cfg.devCategory ?? 'youth_u18',
    teamsKnown: cfg.teamsKnown ?? true,
    sibling: cfg.sibling === undefined
      ? { formationNames: { 10: MARIUS, 12: ADRIAN }, benchPlayers: [BENCHKID] }
      : cfg.sibling,
    fetchFails: !!cfg.fetchFails,
  }), calls };
}
const tick = () => new Promise(r => setTimeout(r, 0));

// ── C + D: render-driven load, no gesture required ───────────────────────────
test('C/D — boot-restored fixture: render-driven refresh loads the sibling snapshot and locks the starters', async () => {
  const { api, calls } = mc();
  assert.equal(api.resolved(), false, 'before any load the sibling answer is UNKNOWN');
  api.refresh();                       // renderMatchday's call — no gesture
  await tick();
  assert.ok(calls.fetches >= 2, 'squad+draft fetched without any fixture tap');
  assert.equal(api.resolved(), true, 'snapshot resolved for the current fixture+side');
  assert.equal(api.locked(MARIUS), true, 'A — sibling XV starter locked (Marius)');
  assert.equal(api.locked(ADRIAN), true, 'A — sibling XV starter locked (Adrian)');
  assert.equal(api.locked(BENCHKID), true, 'B — U18 (youth) sibling BENCH locked too');
  assert.equal(api.locked(FREE), false, 'an uncommitted player stays selectable');
});

// ── FAIL-CLOSED while unresolved ─────────────────────────────────────────────
test('fail-closed — while unresolved, pick and avail-drop are held with an explicit message; rearrange stays free', async () => {
  const { api, calls } = mc();
  assert.equal(api.resolved(), false);
  api.pick(MARIUS);
  api.drop(FREE);                       // new player from the rail
  assert.equal(calls.placed.length, 0, 'nothing was placed while the sibling answer is unknown');
  assert.equal(calls.toasts.filter(t => /checking the other team/i.test(t)).length, 2, 'both refusals say why');
  api.drop(FREE, { type: 'bench', idx: 1 });   // srcTarget set = moving within THIS sheet
  assert.equal(calls.placed.length, 2, 'rearranging players already on this sheet is never blocked (move + swap-back)');
  api.pick('');                          // clearing a slot is always allowed
});

// ── E: teams race ────────────────────────────────────────────────────────────
test('E — teams race: unknown sides never resolve to "no sibling"; once teams land the next refresh loads', async () => {
  const { api, calls } = mc({ teamsKnown: false });
  api.refresh(); await tick();
  assert.equal(calls.fetches, 0, 'nothing fetched before the sides are knowable');
  assert.equal(api.resolved(), false, 'and crucially NOT resolved — no silent "no sibling" guess');
  api.pick(MARIUS);
  assert.equal(calls.placed.length, 0, 'guards stay closed through the race');
});

test('E2 — with teams known and a single-team group, "no sibling" IS the answer and nothing blocks', async () => {
  const { api, calls } = mc({ sibling: null });
  // teamsKnown but make it single-side: strip the sibling by resolving a
  // fixture with only one active side → matchCentreSidesActive pairs exist
  // here, so emulate via a null sheet instead: the snapshot resolves with no
  // committed players and nothing locks.
  api.refresh(); await tick();
  assert.equal(api.resolved(), true);
  assert.equal(api.locked(MARIUS), false, 'no sibling commitments → nobody locked');
  api.pick(FREE);
  assert.equal(calls.placed.length, 1, 'picking proceeds normally once resolved');
});

// ── F: staleness heals on the throttle ──────────────────────────────────────
test('F — a sibling publish is picked up by the next throttled refresh (>12s), not refetched per render', async () => {
  const { api, calls } = mc();
  api.refresh(); await tick();
  const afterFirst = calls.fetches;
  api.refresh(); await tick();
  assert.equal(calls.fetches, afterFirst, 'within 12s the refresh is throttled');
  api.tick(12001);
  api.refresh(); await tick();
  assert.ok(calls.fetches > afterFirst, 'after 12s the snapshot re-fetches — a sibling publish reaches this desktop');
});

// ── G + H: adult policy unchanged ────────────────────────────────────────────
test('G/H — adult/unknown group: sibling XV locked, sibling bench poachable', async () => {
  const { api, calls } = mc({ devCategory: 'unknown' });
  api.refresh(); await tick();
  assert.equal(api.locked(MARIUS), true, 'G — adult sibling starter locked');
  assert.equal(api.locked(BENCHKID), false, 'H — adult sibling bench NOT locked');
  api.pick(BENCHKID);
  assert.equal(calls.placed.length, 1, 'the poach is allowed');
});

// ── M + N: guards cannot be bypassed once resolved ──────────────────────────
test('M/N — drag-drop and tap both refuse a locked sibling starter (resolved state)', async () => {
  const { api, calls } = mc();
  api.refresh(); await tick();
  api.pick(MARIUS);
  api.drop(ADRIAN);
  assert.equal(calls.placed.length, 0, 'neither surface can place a committed sibling starter');
  assert.equal(calls.toasts.filter(t => /starting for/i.test(t)).length, 2, 'each refusal names the committing team');
  assert.equal(calls.draftSaves, 0, 'no draft write happened');
});

// ── O: stale snapshot for another fixture is never applied ───────────────────
test('O — a stale snapshot from another fixture neither locks nor unlocks: it is simply not the answer', async () => {
  const { api, calls } = mc();
  // Pretend an old fixture's snapshot is still in memory…
  api.setStale({ fixtureId: 'fx-OLD', sideId: 'team-dev', teamName: 'U18 Premier',
                 names: [MARIUS], startingNames: [MARIUS], benchNames: [] });
  assert.equal(api.locked(MARIUS), false, 'mismatched data produces no phantom lock');
  assert.equal(api.resolved(), false, '…but the current fixture stays UNRESOLVED');
  api.pick(MARIUS);
  assert.equal(calls.placed.length, 0, 'so the guard still refuses (fail closed), never fail-open');
  // And once the CURRENT fixture resolves with nobody committed, he is free:
  api.setResolvedKey('fx-dend|team-dev'); api.setStale(null);
  assert.equal(api.locked(MARIUS), false);
  api.pick(MARIUS);
  assert.equal(calls.placed.length, 1, 'resolved-empty means genuinely selectable');
});

// ── Network failure: closed, not stale-open, and retried on the throttle ────
test('network failure — unresolved (closed), and the throttle allows a later retry', async () => {
  const { api, calls } = mc({ fetchFails: true });
  api.refresh(); await tick();
  assert.equal(api.resolved(), false, 'an error never counts as an answer');
  api.pick(MARIUS);
  assert.equal(calls.placed.length, 0);
  api.tick(12001);
  api.refresh(); await tick();
  assert.ok(calls.fetches >= 4, 'retried after the throttle window');
});

// ── K + I/J quick pins (existing behaviour preserved) ────────────────────────
test('K/I/J — selected-set union and availability buckets unchanged', () => {
  const src = fn('mcSelectedKeys');
  assert.match(src, /mcPlacedKeys\(\)/); assert.match(src, /mcIneligibleKeys\(\)/);
  const bucket = fn('mcSelectableAvailBucket');
  assert.match(bucket, /'unavailable'/); assert.match(bucket, /'noreply'/);
});

// ── L + rail contract: the desktop rail wears the locks in EVERY view ───────
test('L/rail — locked rows are non-draggable, labelled, and the pending state is explicit', () => {
  // The rail template is inline in renderMatchday; pin its lock contract.
  assert.match(html, /const _railLockXV\s+= mcOtherSideStartingKeys\(\);/, 'rail computes the XV lock set');
  assert.match(html, /const _railLockBench = mcBenchLocksSibling\(\) \? mcOtherSideBenchKeys\(\) : new Set\(\);/, 'youth bench lock set');
  assert.match(html, /const _railPending\s+= !mcSiblingStateResolved\(\);/, 'explicit pending flag');
  assert.match(html, /locked \? ' mc7-locked' : ' squad-player-drag'/, 'locked rows lose the drag affordance class');
  assert.match(html, /draggable="\$\{locked \? 'false' : 'true'\}"/, 'locked rows are not draggable');
  assert.match(html, /mc7-locktag/, 'locked rows carry the committing-team tag');
  assert.match(html, /Checking the other team.s selections/, 'the pending state is shown to the coach');
  assert.match(html, /\$\{locked \? '' : 'ondragstart="handlePlayerDragStart\(event\)"/, 'no dragstart handler on locked rows');
});

// ── render wiring: the refresher actually runs from renderMatchday ──────────
test('wiring — renderMatchday invokes the render-driven sibling refresh', () => {
  const rm = fn('renderMatchday');
  assert.match(rm, /mcRefreshOtherSideSelections\(\)/, 'render-driven load is wired');
});
