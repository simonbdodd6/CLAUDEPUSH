/**
 * MATCH CENTRE PICKER — mobile scroll/search + the Selection filter.
 *
 * Two mobile UX fixes and one feature, all presentation-only:
 *   • the player LIST is the one scroll region (flex:1 + min-height:0 inside the
 *     fixed-height popup), so lower players are reachable on a phone;
 *   • the popup becomes a keyboard-safe bottom sheet at ≤480px;
 *   • a Selection filter (All / Not selected / Selected) derived LIVE from the
 *     Team Sheet selection state — no new dataset, no change to selection or
 *     persistence, and never wider than the operating group.
 *
 * The Selection tests drive the REAL mcComputeAvailable + mcPickerCandidates +
 * operationalPlayers over a multi-group club; the scroll/search/markup tests
 * assert the DOM/CSS contract (physical scrolling is not unit-testable).
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

const SENIORS = 'grp_seniors', U18 = 'grp_u18', U16 = 'grp_u16';

// The REAL pool functions over a multi-group club. `placed` are the names on the
// current Team Sheet (formationNames). Returns the three selection sets plus a
// search mirror per mode (exactly mcRenderPickerList's filter).
function club({ group = U18, placed = [] } = {}) {
  const roster = [
    { id: 'p1', userId: 'u1', name: 'Sam Senior', position: 'Prop' },
    { id: 'p2', userId: 'u2', name: 'Sid Senior', position: 'Lock' },
    { id: 'p3', userId: 'u3', name: 'Yuri Youth', position: 'Hooker' },
    { id: 'p4', userId: 'u4', name: 'Tom Teen',   position: 'Prop' },
    { id: 'p5', userId: 'u5', name: 'Ann Archived', position: 'Wing', lifecycleStatus: 'archived' },
    { id: 'p6', userId: 'u6', name: 'Cara Coach', position: 'Coach' },   // staff
    { id: 'p7', userId: 'u7', name: 'Mia Minor',  position: 'Centre' },  // U16
  ];
  const members = [
    { userId: 'u1', status: 'active', playerGroupId: SENIORS },
    { userId: 'u2', status: 'active', playerGroupId: SENIORS },
    { userId: 'u3', status: 'active', playerGroupId: U18 },
    { userId: 'u4', status: 'active', playerGroupId: U18 },
    { userId: 'u5', status: 'active', playerGroupId: U18 },
    { userId: 'u6', status: 'active', playerGroupId: U18 },
    { userId: 'u7', status: 'active', playerGroupId: U16 },
  ];
  return new Function('roster', 'membersIn', 'groupIn', 'placedIn', `
    "use strict";
    const state = { operationalGroupId: groupIn, players: roster, users: [],
      formationNames: Object.fromEntries(placedIn.map((v, i) => [String(i + 1), v])),
      benchPlayers: [] };
    const _adminData = { loaded: true, members: membersIn };
    function canI() { return true; }
    function ensureAdminData() {}
    function canonicalVisiblePlayers() { return state.players; }
    function isRosterPlayerRecord(player = {}) {
      const position = String(player.position || '').trim().toLowerCase();
      return Boolean(player.id && player.name) && !['coach','admin','medical staff'].includes(position);
    }
    function mcPersonKey(n) { return String(n || '').trim().toLowerCase(); }
    ${fn('clubUsesPlayerGroups')}
    ${fn('playerGroupIdOf')}
    ${fn('operationalPlayers')}
    ${fn('mcComputeAvailable')}
    ${fn('mcPlacedKeys')}
    // Single-side context (no sibling side loaded): the cross-team helpers no-op,
    // so mcPickerCandidates behaves exactly as the single-team selection filter.
    function mcIneligibleKeys() { return new Set(); }
    function mcSelectedKeys() { return mcPlacedKeys(); }
    ${fn('mcPickerCandidates')}
    const names = arr => arr.map(p => p.name).sort();
    const searchIn = (base, q) => { q = String(q||'').trim().toLowerCase();
      return base.filter(p => !q || String(p.name).toLowerCase().indexOf(q) !== -1 || String(p.position||'').toLowerCase().indexOf(q) !== -1).map(p => p.name); };
    return {
      unselected: () => names(mcComputeAvailable()),
      selected:   () => names(mcPickerCandidates('selected')),
      all:        () => names(mcPickerCandidates('all')),
      scoped:     () => names(operationalPlayers().filter(isRosterPlayerRecord)),
      searchUnsel: q => searchIn(mcComputeAvailable(), q).sort(),
      searchSel:   q => searchIn(mcPickerCandidates('selected'), q).sort(),
    };
  `)(roster, members, group, placed);
}

// ── Selection filter behaviour ───────────────────────────────────────────────

test('1+8: default (Not selected) is the pool minus placed; desktop pool rule unchanged', () => {
  const c = club({ group: U18, placed: [] });
  assert.deepEqual(c.unselected(), ['Tom Teen', 'Yuri Youth'], 'nothing placed → everyone eligible');
});

test('3+4: search narrows the current selection set; clearing restores it', () => {
  const c = club({ group: U18, placed: [] });
  assert.deepEqual(c.searchUnsel('tom'), ['Tom Teen']);
  assert.deepEqual(c.searchUnsel('prop'), ['Tom Teen'], 'position matches too');
  assert.deepEqual(c.searchUnsel(''), ['Tom Teen', 'Yuri Youth'], 'clearing restores the full set');
});

test('placing a player removes them from "Not selected" and reveals them under "Selected"', () => {
  const c = club({ group: U18, placed: ['Yuri Youth'] });
  assert.deepEqual(c.unselected(), ['Tom Teen'], 'a placed player leaves Not selected at once');
  assert.deepEqual(c.selected(), ['Yuri Youth'], 'and is discoverable under Selected');
  assert.deepEqual(c.all(), ['Tom Teen', 'Yuri Youth'], 'All shows both');
});

test('removing a player from the sheet makes them visible again under "Not selected"', () => {
  const placed = club({ group: U18, placed: ['Yuri Youth'] });
  assert.ok(!placed.unselected().includes('Yuri Youth'));
  const removed = club({ group: U18, placed: [] });   // same club, Yuri no longer placed
  assert.ok(removed.unselected().includes('Yuri Youth'), 'back under Not selected once removed');
  assert.deepEqual(removed.selected(), [], 'and no longer under Selected');
});

test('Selected filtered by search still works', () => {
  const c = club({ group: U18, placed: ['Yuri Youth', 'Tom Teen'] });
  assert.deepEqual(c.selected(), ['Tom Teen', 'Yuri Youth']);
  assert.deepEqual(c.searchSel('yuri'), ['Yuri Youth']);
  assert.deepEqual(c.searchSel('zzz'), []);
});

// ── 9: no selection mode may widen past the operating group ──────────────────

test('9: group isolation holds for ALL three modes (no senior/U16/archived/staff)', () => {
  const forbidden = ['Sam Senior', 'Sid Senior', 'Mia Minor', 'Ann Archived', 'Cara Coach'];
  for (const placed of [[], ['Yuri Youth'], ['Yuri Youth', 'Tom Teen']]) {
    const c = club({ group: U18, placed });
    for (const mode of ['unselected', 'selected', 'all']) {
      const list = c[mode]();
      for (const name of forbidden) assert.ok(!list.includes(name), `${mode} leaked ${name} (placed=${placed})`);
      // and every result is within the group's roster scope
      const scoped = new Set(c.scoped());
      for (const name of list) assert.ok(scoped.has(name), `${mode} surfaced ${name} outside the group`);
    }
  }
});

test('switching team switches every mode\'s pool with nothing left over', () => {
  assert.deepEqual(club({ group: SENIORS }).all(), ['Sam Senior', 'Sid Senior']);
  assert.deepEqual(club({ group: U18 }).all(), ['Tom Teen', 'Yuri Youth']);
  assert.deepEqual(club({ group: U16 }).all(), ['Mia Minor']);
});

test('mcPickerCandidates is presentation-only — it never mutates state', () => {
  // A run of every mode leaves the roster/placement inputs untouched (the sandbox
  // asserts values, not identity — a mutation would change the returned sets).
  const c = club({ group: U18, placed: ['Yuri Youth'] });
  assert.deepEqual(c.unselected(), ['Tom Teen']);
  assert.deepEqual(c.unselected(), ['Tom Teen'], 'repeatable — no accumulating side effect');
  assert.deepEqual(c.all(), ['Tom Teen', 'Yuri Youth']);
});

// ── DOM / CSS contract (physical scroll + markup, not unit-testable behaviour) ─

test('2+5: the list is the scroll region — flex:1, min-height:0, overflow-y:auto', () => {
  const rule = src.match(/\.mc-picker-list\s*\{[^}]*\}/);
  assert.ok(rule, '.mc-picker-list rule exists');
  assert.match(rule[0], /flex:\s*1\s+1\s+auto/, 'the list flexes to fill the popup');
  assert.match(rule[0], /min-height:\s*0/, 'so it can shrink and scroll instead of overflowing');
  assert.match(rule[0], /overflow-y:\s*auto/, 'the list scrolls internally');
});

test('mobile: the popup becomes a fixed, keyboard-safe bottom sheet at ≤480px', () => {
  const rule = src.match(/#mc-picker\s*\{\s*position:\s*fixed\s*!important[\s\S]*?\}/);
  assert.ok(rule, 'a mobile #mc-picker fixed bottom-sheet rule exists');
  assert.match(rule[0], /bottom:[^;]*!important/, 'anchored to the bottom, clear of the keyboard/home indicator');
  assert.match(rule[0], /dvh/, 'height tracks the dynamic viewport (shrinks with the keyboard)');
  const before = src.slice(Math.max(0, src.indexOf(rule[0]) - 300), src.indexOf(rule[0]));
  assert.match(before, /@media \(max-width: 480px\)/, 'and it lives inside the phone breakpoint');
});

test('the picker renders a search box AND the 3-way Selection control', () => {
  const ensure = fn('mcEnsurePicker');
  assert.match(ensure, /id="mc-slot-filter"[^>]*role="searchbox"/, 'search input renders');
  assert.match(ensure, /mc-picker-seg/, 'the selection segmented control renders');
  for (const sel of ['unselected', 'selected', 'all']) {
    assert.ok(ensure.includes(`data-sel="${sel}"`), `has the ${sel} segment`);
  }
});

test('every open defaults to Not selected', () => {
  const open = fn('mcOpenPicker');
  assert.match(open, /_mcPickSel\s*=\s*'unselected'/, 'selection resets to the default on open');
  assert.match(src, /let _mcPickSel = 'unselected';/, 'and the module default is Not selected');
});

test('6+10: selecting still routes through mcPick; search survives a filter switch', () => {
  const render = fn('mcRenderPickerList');
  assert.match(render, /onclick="mcPick\(this\.dataset\.pick\)"/, 'rows still select via mcPick (unchanged persistence)');
  const setSel = fn('mcSetPickSel');
  assert.match(setSel, /mcRenderPickerList\(s\s*\?\s*s\.textContent\s*:\s*''\)/, 'switching filter preserves the typed search');
});

test('7: close still just hides the popup (no selection/persistence touched)', () => {
  assert.match(fn('mcClosePicker'), /classList\.add\('hidden'\)/);
});

// ── the eligibility invariant the picker render still upholds ─────────────────

test('11: mcRenderPickerList still filters mcComputeAvailable and never reaches state.players', () => {
  const render = fn('mcRenderPickerList');
  assert.match(render, /mcComputeAvailable\(\)\s*\n?\s*\.filter/, 'the default path filters the eligible pool');
  assert.ok(!/canonicalVisiblePlayers|state\.players/.test(render), 'the renderer never reaches past the group-scoped pool');
});
