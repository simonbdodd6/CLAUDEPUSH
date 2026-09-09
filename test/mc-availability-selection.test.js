/**
 * MATCH CENTRE — AVAILABILITY × SELECTION integrity.
 *
 * "Not selected" is a SELECTABLE candidate pool: eligible + not selected +
 * AVAILABLE. Unavailable and No-reply players are never selectable candidates
 * (they stay inspectable under the availability filter and "All"). "Selected"
 * stays a status view (an already-selected player shows even if now unavailable),
 * and "All" is unfiltered by availability. Availability and selection are
 * SEPARATE dimensions; search only narrows the derived set, never widens it.
 *
 * Drives the REAL mcPickerCandidates / mcAvailabilityBuckets /
 * mcSelectableAvailBucket / mcAvailFilterBucket + the cross-team helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (let b = i; b < src.length; b++) { if (src[b] === '{') d++; else if (src[b] === '}') { d--; if (!d) { i = b; break; } } }
  return src.slice(start, i + 1);
}

const SEN = 'grp_sen';
// Availability answers for fixture 'fx1' (side B open); sibling side A has Xan
// starting and Yan+Zed benched. Will is placed on B (and is now unavailable).
function scope() {
  const roster = [
    { id: 'a', userId: 'ua', name: 'Aaron Avail',   position: 'Prop' },
    { id: 'b', userId: 'ub', name: 'Bob Unavail',   position: 'Lock' },
    { id: 'c', userId: 'uc', name: 'Cai Noreply',   position: 'Wing' },
    { id: 'd', userId: 'ud', name: 'Dan Maybe',     position: 'Centre' },
    { id: 'w', userId: 'uw', name: 'Will Placed',   position: 'Hooker' },
    { id: 'x', userId: 'ux', name: 'Xan SibStart',  position: 'Flanker' },
    { id: 'y', userId: 'uy', name: 'Yan SibBench',  position: 'No.8' },
    { id: 'z', userId: 'uz', name: 'Zed SibBenchOut', position: 'Fly-half' },
  ];
  const members = roster.map(p => ({ userId: p.userId, status: 'active', playerGroupId: SEN }));
  const availRows = [   // {player:{id}, status}; Cai has NO row → no-reply
    { player: { id: 'a' }, status: 'available' },
    { player: { id: 'b' }, status: 'unavailable' },
    { player: { id: 'd' }, status: 'maybe' },
    { player: { id: 'w' }, status: 'unavailable' },
    { player: { id: 'x' }, status: 'available' },
    { player: { id: 'y' }, status: 'available' },
    { player: { id: 'z' }, status: 'unavailable' },
  ];
  const OTHER = { fixtureId: 'fx1', sideId: 'B', startingNames: ['Xan SibStart'],
                  benchNames: ['Yan SibBench', 'Zed SibBenchOut'], names: ['Xan SibStart', 'Yan SibBench', 'Zed SibBenchOut'] };
  return new Function('roster', 'members', 'availRows', 'OTHER', `
    "use strict";
    const state = { operationalGroupId: '${SEN}', players: roster, users: [],
      formationNames: { '1': 'Will Placed' }, benchPlayers: [], schedule: [{ id: 'fx1' }] };
    const _adminData = { loaded: true, members };
    let _mcOtherSide = OTHER;
    function canI(){ return true; } function ensureAdminData(){}
    function canonicalVisiblePlayers(){ return state.players; }
    function isRosterPlayerRecord(p = {}) {
      const pos = String(p.position || '').trim().toLowerCase();
      return Boolean(p.id && p.name) && !['coach','admin','medical staff'].includes(pos);
    }
    function mcPersonKey(n){ return String(n || '').trim().toLowerCase(); }
    function matchCentreFixtureId(){ return 'fx1'; }
    function matchCentreSideId(){ return 'B'; }
    function matchCentreSelectedFixture(){ return { id: 'fx1' }; }
    function sessionRows(id){ return id === 'fx1' ? availRows : []; }
    ${fn('mcAvailFilterBucket')}
    ${fn('clubUsesPlayerGroups')}
    ${fn('playerGroupIdOf')}
    ${fn('operationalPlayers')}
    ${fn('mcComputeAvailable')}
    ${fn('mcPlacedKeys')}
    ${fn('_mcOtherSideKeySet')}
    ${fn('mcOtherSideStartingKeys')}
    ${fn('mcOtherSideBenchKeys')}
    ${fn('mcIneligibleKeys')}
    ${fn('mcSelectedKeys')}
    ${fn('mcAvailabilityBuckets')}
    ${fn('mcSelectableAvailBucket')}
    ${fn('mcPickerLocked')}
    ${fn('mcPickerCandidates')}
    // Exactly the popup's Not-selected pipeline, and search over it (never before it).
    const match = (q, p) => { q = String(q||'').trim().toLowerCase();
      return !q || String(p.name).toLowerCase().indexOf(q) !== -1 || String(p.position||'').toLowerCase().indexOf(q) !== -1; };
    const names = arr => arr.map(p => p.name).sort();
    return {
      unselected: () => names(mcPickerCandidates('unselected')),
      selected:   () => names(mcPickerCandidates('selected')),
      all:        () => names(mcPickerCandidates('all')),
      searchUnsel: q => names(mcPickerCandidates('unselected').filter(p => match(q, p))),
      bucketOf: id => mcAvailabilityBuckets().get(id) || 'noreply',
      stateSnapshot: () => JSON.stringify({ f: state.formationNames, b: state.benchPlayers }),
    };
  `)(roster, members, availRows, OTHER);
}

test('1: Available + Not selected → in the selectable pool', () => {
  assert.ok(scope().unselected().includes('Aaron Avail'));
});

test('2: Unavailable + Not selected → NOT selectable', () => {
  assert.ok(!scope().unselected().includes('Bob Unavail'));
});

test('3: No reply + Not selected → NOT selectable', () => {
  const s = scope();
  assert.equal(s.bucketOf('c'), 'noreply', 'Cai has no availability answer');
  assert.ok(!s.unselected().includes('Cai Noreply'));
});

test('maybe stays selectable (soft yes; only unavailable/no-reply are dropped)', () => {
  assert.ok(scope().unselected().includes('Dan Maybe'));
});

test('4: an already-selected player stays under Selected even when now Unavailable', () => {
  const s = scope();
  assert.equal(s.bucketOf('w'), 'unavailable', 'Will is placed but now unavailable');
  assert.ok(s.selected().includes('Will Placed'), 'Selected is a status view, availability aside');
  assert.ok(!s.unselected().includes('Will Placed'), 'and never in Not selected (already placed)');
});

test('5: sibling starting XV stays locked/ineligible regardless of availability', () => {
  const s = scope();
  assert.ok(!s.unselected().includes('Xan SibStart'));
});

test('6: sibling BENCH + Available → selectable Not selected', () => {
  assert.ok(scope().unselected().includes('Yan SibBench'));
});

test('7: sibling BENCH + Unavailable → NOT a selectable Not-selected candidate', () => {
  const s = scope();
  assert.equal(s.bucketOf('z'), 'unavailable');
  assert.ok(!s.unselected().includes('Zed SibBenchOut'));
});

test('the Not-selected pool is exactly the available, eligible, unplaced players', () => {
  assert.deepEqual(scope().unselected(), ['Aaron Avail', 'Dan Maybe', 'Yan SibBench']);
});

test('All is NOT availability-filtered (inspect everyone eligible)', () => {
  const all = scope().all();
  assert.ok(all.includes('Bob Unavail') && all.includes('Cai Noreply'), 'unavailable/no-reply still inspectable under All');
});

// ── search cannot bypass any rule ────────────────────────────────────────────

test('8: search cannot bypass availability (an unavailable name never surfaces under Not selected)', () => {
  assert.deepEqual(scope().searchUnsel('bob'), [], 'Bob is unavailable — search does not resurrect them');
  assert.deepEqual(scope().searchUnsel('cai'), [], 'no-reply likewise');
});

test('10: search cannot bypass cross-team eligibility (sibling starter never surfaces)', () => {
  assert.deepEqual(scope().searchUnsel('xan'), []);
});

test('search narrows the Not-selected pool (a real available match still works)', () => {
  assert.deepEqual(scope().searchUnsel('aaron'), ['Aaron Avail']);
  assert.deepEqual(scope().searchUnsel('yan'), ['Yan SibBench']);
});

test('18: deriving the candidate list mutates nothing', () => {
  const s = scope();
  const before = s.stateSnapshot();
  s.unselected(); s.selected(); s.all(); s.searchUnsel('a');
  assert.equal(s.stateSnapshot(), before);
});

// ── shared authority: same predicate + source used everywhere ─────────────────

test('15: the rail and popup share ONE availability authority (mcSelectableAvailBucket + mcAvailabilityBuckets)', () => {
  // The rail's Not-selected filter and the popup both apply mcSelectableAvailBucket
  // to a bucket from the same source; verified by source references.
  const railBlock = src.slice(src.indexOf('const _mcSelKeys = mcSelectedKeys();'), src.indexOf('const _railSel'));
  assert.match(railBlock, /mcSelectableAvailBucket\(s\.match\)/, 'rail Not-selected uses the shared predicate on s.match');
  const render = fn('mcRenderPickerList');
  assert.match(render, /mcSelectableAvailBucket\(_availBuckets\.get/, 'popup Not-selected uses the shared predicate on mcAvailabilityBuckets');
});

test('16: the availability filter still exists on the rail (inspection preserved)', () => {
  assert.match(src, /mcSetAvailFilter/, 'availability filter control preserved');
  assert.match(src, /\['all','All'\],\['available','Available'\],\['maybe','Maybe'\],\['unavailable','Unavailable'\],\['noreply','No reply'\]/, 'all availability buckets still offered');
});
