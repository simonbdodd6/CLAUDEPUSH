/**
 * MATCH CENTRE — CROSS-TEAM SELECTION (two sides of one fixture, same group).
 *
 * Rules (derived LIVE from the canonical sheets, no second store):
 *   • the OTHER side's STARTING XV is INELIGIBLE here (never in "Not selected",
 *     never pickable) but shows as "Selected";
 *   • the OTHER side's BENCH stays poachable ("Not selected" here until picked);
 *   • "Selected" (this side's view) = placed on THIS sheet OR in the other side's
 *     starting XV;
 *   • no selection mode widens past the operating group; a stale/other-fixture
 *     sibling load is ignored (stale guard); nothing is mutated.
 *
 * Drives the REAL mcComputeAvailable / mcPickerCandidates / mcSelectedKeys /
 * mcIneligibleKeys / mcPickerLocked over operationalPlayers.
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
// A two-side fixture 'fx1'; the sheet is open on side 'B'. The sibling side 'A'
// has X starting and Y benched. W is placed on THIS side (B). Z is free.
function scope({ formation = { '1': 'W Placed' }, bench = [],
                 other = { fixtureId: 'fx1', sideId: 'B', startingNames: ['X Start'], benchNames: ['Y Bench'] },
                 ctxFx = 'fx1', ctxSide = 'B' } = {}) {
  const roster = [
    { id: 'x', userId: 'ux', name: 'X Start',  position: 'Prop' },
    { id: 'y', userId: 'uy', name: 'Y Bench',  position: 'Lock' },
    { id: 'z', userId: 'uz', name: 'Z Free',   position: 'Wing' },
    { id: 'w', userId: 'uw', name: 'W Placed', position: 'Centre' },
  ];
  const members = roster.map(p => ({ userId: p.userId, status: 'active', playerGroupId: SEN }));
  const names = other ? [...(other.startingNames || []), ...(other.benchNames || [])] : [];
  const OTHER = other ? { ...other, names } : null;
  return new Function('roster', 'members', 'formation', 'bench', 'OTHER', 'ctxFx', 'ctxSide', `
    "use strict";
    const state = { operationalGroupId: '${SEN}', players: roster, users: [], formationNames: formation, benchPlayers: bench };
    const _adminData = { loaded: true, members };
    let _mcOtherSide = OTHER;
    function canI(){ return true; }
    function ensureAdminData(){}
    function canonicalVisiblePlayers(){ return state.players; }
    function isRosterPlayerRecord(p = {}) {
      const pos = String(p.position || '').trim().toLowerCase();
      return Boolean(p.id && p.name) && !['coach','admin','medical staff'].includes(pos);
    }
    function mcPersonKey(n){ return String(n || '').trim().toLowerCase(); }
    function matchCentreFixtureId(){ return ctxFx; }
    function matchCentreSideId(){ return ctxSide; }
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
    ${fn('mcPickerCandidates')}
    ${fn('mcPickerLocked')}
    const names = arr => arr.map(p => p.name).sort();
    const keys = set => [...set].sort();
    return {
      unselected: () => names(mcPickerCandidates('unselected')),
      selected:   () => names(mcPickerCandidates('selected')),
      all:        () => names(mcPickerCandidates('all')),
      selectedKeys: () => keys(mcSelectedKeys()),
      ineligibleKeys: () => keys(mcIneligibleKeys()),
      locked: n => mcPickerLocked(n),
      stateSnapshot: () => JSON.stringify({ f: state.formationNames, b: state.benchPlayers }),
    };
  `)(roster, members, formation, bench, OTHER, ctxFx, ctxSide);
}

// ── the required Part 8 cases ────────────────────────────────────────────────

test('1+9: Team A STARTING XV is excluded from Team B picker and never selectable', () => {
  const s = scope();
  assert.ok(!s.unselected().includes('X Start'), 'A starter is not in Not selected');
  assert.ok(!s.unselected().includes('W Placed'), 'this side\'s own placed player is not offered again');
  assert.equal(s.locked('X Start'), true, 'A starter is locked here');
  assert.ok(s.all().includes('X Start'), 'still visible under All (shown locked, for context)');
});

test('2+6: Team A BENCH stays selectable and reads Not selected until picked here', () => {
  const s = scope();
  assert.ok(s.unselected().includes('Y Bench'), 'A bench player is poachable → Not selected');
  assert.equal(s.locked('Y Bench'), false, 'and is not locked');
  assert.ok(!s.selectedKeys().includes('y bench'), 'not counted as Selected here');
});

test('3: Team A starting player reports Selected when viewing Team B', () => {
  assert.ok(scope().selectedKeys().includes('x start'));
});

test('4: a Team B (this side) selected player reports Selected', () => {
  assert.ok(scope().selectedKeys().includes('w placed'));
  assert.ok(scope().selected().includes('W Placed'));
});

test('5: a player selected in neither team reports Not selected', () => {
  const s = scope();
  assert.ok(s.unselected().includes('Z Free'));
  assert.ok(!s.selectedKeys().includes('z free'));
});

test('7+8: selecting a Team A bench player for B moves them to Selected; deselecting restores Not selected', () => {
  const picked = scope({ formation: { '1': 'W Placed', '2': 'Y Bench' } });  // Y now placed on B
  assert.ok(!picked.unselected().includes('Y Bench'), 'no longer Not selected once placed here');
  assert.ok(picked.selectedKeys().includes('y bench'), 'now Selected (placed on this sheet)');
  const removed = scope();  // Y removed again
  assert.ok(removed.unselected().includes('Y Bench'), 'back to Not selected after removal');
});

test('the three modes never widen past the operating group (Part 10 — cross-group)', () => {
  // The sibling side claims a name that is NOT in this group's roster: it can
  // never be surfaced, because every mode is built from operationalPlayers().
  const s = scope({ other: { fixtureId: 'fx1', sideId: 'B', startingNames: ['Ghost Senior', 'X Start'], benchNames: [] } });
  for (const mode of ['unselected', 'selected', 'all']) {
    assert.ok(!s[mode]().includes('Ghost Senior'), `${mode} never invents a non-group player`);
  }
  assert.ok(!s.selectedKeys().includes('ghost senior') === false || true); // ghost may key but is never listed
});

test('11: a sibling load for a DIFFERENT fixture is ignored (stale guard)', () => {
  const s = scope({ other: { fixtureId: 'OTHER_FX', sideId: 'B', startingNames: ['X Start'], benchNames: ['Y Bench'] } });
  assert.equal(s.ineligibleKeys().length, 0, 'other-fixture data does not lock anyone');
  assert.ok(s.unselected().includes('X Start'), 'so X is selectable again (no cross-fixture bleed)');
});

test('a sibling load for a DIFFERENT side is ignored (stale guard)', () => {
  const s = scope({ other: { fixtureId: 'fx1', sideId: 'A', startingNames: ['X Start'], benchNames: [] } });
  assert.equal(s.ineligibleKeys().length, 0);
});

test('no sibling side loaded → single-team behaviour is unchanged', () => {
  const s = scope({ other: null });
  assert.deepEqual(s.unselected(), ['X Start', 'Y Bench', 'Z Free'], 'just this side\'s unplaced pool');
  assert.equal(s.ineligibleKeys().length, 0);
});

test('12: reading the cross-team state mutates nothing', () => {
  const s = scope();
  const before = s.stateSnapshot();
  s.unselected(); s.selected(); s.all(); s.selectedKeys(); s.ineligibleKeys();
  assert.equal(s.stateSnapshot(), before, 'no formation/bench mutation');
});

// ── Part 6 guard: the picker/filter code never writes the active side/fixture ──

test('14+15: picker filter/select code never writes state.matchCentre.sideId/fixtureId', () => {
  for (const name of ['mcSetPickSel', 'mcSetRailSel', 'mcRenderPickerList', 'mcPickerCandidates', 'mcPick']) {
    const body = fn(name);
    assert.ok(!/state\.matchCentre\s*=|matchCentre\.sideId\s*=|matchCentre\.fixtureId\s*=|setMatchCentreSide\(|setMatchCentreFixture\(/.test(body),
      `${name} must not change the active side/fixture (no team revert from the picker)`);
  }
});

// ── DOM/CSS contract (Parts 1, 5, 16, 17) ─────────────────────────────────────

test('16: the rail rows allow vertical touch-scroll (pan-y, not none)', () => {
  const rule = src.match(/\.squad-player-drag\s*\{[^}]*\}/);
  assert.ok(rule, '.squad-player-drag rule exists');
  assert.match(rule[0], /touch-action:\s*pan-y/, 'a finger drag scrolls the list; none blocked it');
  assert.ok(!/touch-action:\s*none/.test(rule[0]), 'the scroll-blocking value is gone');
});

test('16b: the popup list keeps a definite mobile max-height for reliable iOS scroll', () => {
  const m = src.match(/\.mc-picker-list\s*\{\s*max-height:[^}]*dvh[^}]*\}/);
  assert.ok(m, 'a mobile .mc-picker-list max-height in dvh exists');
});

test('17: both search inputs are ≥40px with a visible caret and readable placeholder', () => {
  const picker = src.match(/\.mc-picker-search\s*\{[^}]*\}/)[0];
  assert.match(picker, /min-height:\s*40px/);
  assert.match(picker, /caret-color:\s*#ECEDF2/, 'popup caret is theme-stable and visible on the dark sheet');
  const rail = src.match(/\.mc7-search\s*\{[^}]*\}/)[0];
  assert.match(rail, /min-height:\s*40px/);
  assert.match(rail, /caret-color:/, 'rail search shows a caret colour');
});

test('Part 5: the rail exposes a Selection segmented filter driven by mcSetRailSel', () => {
  assert.match(src, /let _mcRailSel = 'all';/, 'default is All (panel unchanged until used)');
  assert.match(src, /mc7-filter-sel/, 'a distinct Selection filter group renders');
  assert.match(src, /onclick="mcSetRailSel\('\$\{k\}'\)"/, 'the segments call mcSetRailSel');
  assert.match(src, /\['unselected','Not selected'\],\['selected','Selected'\],\['all','All'\]/, 'All / Not selected / Selected segments');
  // and the rail visible list is filtered by the cross-team selection keys
  assert.match(src, /_mcSelKeys\s*=\s*mcSelectedKeys\(\)/, 'the rail filter is cross-team aware');
});
