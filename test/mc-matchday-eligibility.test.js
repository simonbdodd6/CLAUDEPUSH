/**
 * MATCH CENTRE — multi-team MATCHDAY ELIGIBILITY policy.
 *
 * A player may play only one AGE-GRADE game per day: for a group whose canonical
 * developmentCategory is youth_*, being on EITHER of the sibling side's sheets
 * (starting XV OR bench) commits them and locks them from this side. For a
 * senior/adult (or unclassified) group, only the sibling's STARTING XV locks —
 * its bench stays poachable. The policy is read from developmentCategory, never a
 * group name; it applies to Not selected, Selected, tap and drag alike.
 *
 * Drives the REAL mcBenchLocksSibling / mcOperatingGroupDevCategory /
 * mcIneligibleKeys / mcSelectedKeys / mcPickerCandidates / mcPickerLocked.
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

// The sibling side (loaded as _mcOtherSide) has X starting and Y benched; Z is
// free; W is placed on THIS side. `devCat` sets the operating group's policy;
// `benchStatus` sets Y's availability (default available).
function scope({ devCat = 'unknown', benchStatus = 'available' } = {}) {
  const GID = 'grp_x';
  const roster = [
    { id: 'x', userId: 'ux', name: 'X Start',  position: 'Prop' },
    { id: 'y', userId: 'uy', name: 'Y Bench',  position: 'Lock' },
    { id: 'z', userId: 'uz', name: 'Z Free',   position: 'Wing' },
    { id: 'w', userId: 'uw', name: 'W Placed', position: 'Centre' },
  ];
  const members = roster.map(p => ({ userId: p.userId, status: 'active', playerGroupId: GID }));
  const availRows = [
    { player: { id: 'x' }, status: 'available' },
    { player: { id: 'y' }, status: benchStatus },
    { player: { id: 'z' }, status: 'available' },
    { player: { id: 'w' }, status: 'available' },
  ];
  const OTHER = { fixtureId: 'fx1', sideId: 'B', startingNames: ['X Start'], benchNames: ['Y Bench'], names: ['X Start', 'Y Bench'] };
  return new Function('roster', 'members', 'availRows', 'OTHER', 'GID', 'DEVCAT', `
    "use strict";
    const state = { operationalGroupId: GID, players: roster, users: [],
      formationNames: { '1': 'W Placed' }, benchPlayers: [], schedule: [{ id: 'fx1' }] };
    const _adminData = { loaded: true, members, structure: null };
    let _mcOtherSide = OTHER;
    let _mcTeams = { groups: [{ id: GID, name: 'Group', developmentCategory: DEVCAT }], teams: [] };
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
    ${fn('mcOperatingGroupDevCategory')}
    ${fn('mcBenchLocksSibling')}
    ${fn('mcIneligibleKeys')}
    ${fn('mcSelectedKeys')}
    ${fn('mcAvailabilityBuckets')}
    ${fn('mcSelectableAvailBucket')}
    ${fn('mcPickerLocked')}
    ${fn('mcPickerCandidates')}
    const names = arr => arr.map(p => p.name).sort();
    return {
      devCat: () => mcOperatingGroupDevCategory(),
      benchLocks: () => mcBenchLocksSibling(),
      unselected: () => names(mcPickerCandidates('unselected')),
      selected:   () => names(mcPickerCandidates('selected')),
      lockedStart: () => mcPickerLocked('X Start'),
      lockedBench: () => mcPickerLocked('Y Bench'),
      inSelectedKeys: n => [...mcSelectedKeys()].includes(mcPersonKey(n)),
    };
  `)(roster, members, availRows, OTHER, GID, devCat);
}

// ── policy resolution ────────────────────────────────────────────────────────

test('developmentCategory drives the policy (youth_* → bench locks; else → poachable)', () => {
  assert.equal(scope({ devCat: 'youth_u18' }).benchLocks(), true);
  assert.equal(scope({ devCat: 'youth_u16' }).benchLocks(), true);
  assert.equal(scope({ devCat: 'adult' }).benchLocks(), false);
  assert.equal(scope({ devCat: 'unknown' }).benchLocks(), false);
  assert.equal(scope({ devCat: 'mixed_open' }).benchLocks(), false);
});

// ── U18 (youth): 1+2 (and by symmetry 3+4) ───────────────────────────────────

test('U18 — sibling STARTING XV and BENCH are both NOT selectable', () => {
  const u = scope({ devCat: 'youth_u18' });
  assert.ok(!u.unselected().includes('X Start'), 'starter not selectable');
  assert.ok(!u.unselected().includes('Y Bench'), 'BENCH also not selectable (one game per day)');
});

test('17+20+21: U18 sibling bench is locked (not pickable by tap or drag — both guard on mcPickerLocked)', () => {
  const u = scope({ devCat: 'youth_u18' });
  assert.equal(u.lockedBench(), true, 'mcPickerLocked true → mcPick and _mcDrop both refuse');
  assert.equal(u.lockedStart(), true);
});

test('16: U18 sibling bench is represented under Selected (locked), never vanishing', () => {
  const u = scope({ devCat: 'youth_u18' });
  assert.ok(u.inSelectedKeys('Y Bench'), 'committed to the sibling side → shows locked under Selected');
  assert.ok(u.selected().includes('Y Bench'));
});

test('5: a U18 player selected by neither side is available (if Available)', () => {
  assert.ok(scope({ devCat: 'youth_u18' }).unselected().includes('Z Free'));
});

// ── Seniors (adult / unclassified): 6-10, 18-19 ──────────────────────────────

test('7+9+18: Seniors — sibling BENCH stays a selectable Not-selected candidate (poachable)', () => {
  const s = scope({ devCat: 'adult' });
  assert.ok(s.unselected().includes('Y Bench'), 'senior bench is poachable');
  assert.equal(s.lockedBench(), false, 'and not locked');
  assert.ok(!s.inSelectedKeys('Y Bench'), 'not counted as Selected until picked here');
});

test('6+8: Seniors — sibling STARTING XV is still NOT selectable (only starters lock)', () => {
  const s = scope({ devCat: 'adult' });
  assert.ok(!s.unselected().includes('X Start'));
  assert.equal(s.lockedStart(), true);
});

test('an unclassified (unknown) group behaves as senior — unchanged from before', () => {
  const s = scope({ devCat: 'unknown' });
  assert.ok(s.unselected().includes('Y Bench'), 'no over-locking when the group is unclassified');
});

// ── availability × the policy (11-14) ────────────────────────────────────────

test('12+13: Seniors sibling bench that is Unavailable / No-reply is NOT selectable', () => {
  assert.ok(!scope({ devCat: 'adult', benchStatus: 'unavailable' }).unselected().includes('Y Bench'));
  assert.ok(!scope({ devCat: 'adult', benchStatus: 'no-reply' }).unselected().includes('Y Bench'));
});

test('14: Seniors sibling bench that is Maybe stays selectable (existing semantics)', () => {
  assert.ok(scope({ devCat: 'adult', benchStatus: 'maybe' }).unselected().includes('Y Bench'));
});

test('U18 bench stays locked regardless of its availability (eligibility beats availability)', () => {
  for (const st of ['available', 'unavailable', 'maybe', 'no-reply']) {
    assert.ok(!scope({ devCat: 'youth_u18', benchStatus: st }).unselected().includes('Y Bench'),
      `U18 bench never selectable (${st})`);
  }
});

// ── the exact selectable pool per policy ─────────────────────────────────────

test('the Not-selected pool matches the policy matrix', () => {
  // Both: X (sibling starter) out, W (placed) out, Z (free) in.
  // U18: Y (sibling bench) OUT.  Seniors: Y IN.
  assert.deepEqual(scope({ devCat: 'youth_u18' }).unselected(), ['Z Free']);
  assert.deepEqual(scope({ devCat: 'adult' }).unselected(), ['Y Bench', 'Z Free']);
});

// ── policy source: reads developmentCategory, falls back to admin structure ───

test('policy reads developmentCategory (from the MC teams payload; never a name)', () => {
  assert.equal(scope({ devCat: 'youth_u18' }).devCat(), 'youth_u18');
  const decide = fn('mcBenchLocksSibling');
  assert.match(decide, /developmentCategory|mcOperatingGroupDevCategory/i, 'decided from the canonical category');
  assert.ok(!/U18|Seniors|Under.?18/.test(decide), 'no hard-coded group name');
});
