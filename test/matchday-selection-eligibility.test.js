/**
 * Match Day selection eligibility — a U18 picker must never offer a senior.
 *
 * Reported as "senior players appear when the manager uses the Search button".
 * Search was innocent: mcRenderPickerList filters the pool it is given. The
 * POOL was wrong. mcComputeAvailable() built it from canonicalVisiblePlayers()
 * — the whole club — while the match sheet beside it (`matchdayPlayers`) used
 * operationalPlayers(), the operating group, and carries the comment "A U18
 * coach can never pick a Seniors player from here". Two competing definitions
 * of who may be selected; the picker had the wider one. Search merely made it
 * visible, because typing a senior's name is a faster way to notice than
 * scrolling a long list.
 *
 * The invariant these tests hold: the picker pool IS operationalPlayers(),
 * and search only ever narrows it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') d++;
    else if (src[b] === '}') { d--; if (!d) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

const SENIORS = 'grp_seniors', U18 = 'grp_u18', U16 = 'grp_u16';

/**
 * The real mcComputeAvailable + operationalPlayers over a multi-group club.
 * `search` mirrors the exact filter mcRenderPickerList applies to the pool,
 * so "what the manager sees when they type" is what is asserted.
 */
function club({ group = U18, adminLoaded = true, members = null, placed = [], entitled = true } = {}) {
  const roster = [
    { id: 'p1', userId: 'u1', name: 'Sam Senior',   position: 'Prop' },
    { id: 'p2', userId: 'u2', name: 'Sid Senior',   position: 'Lock' },
    { id: 'p3', userId: 'u3', name: 'Yuri Youth',   position: 'Hooker' },
    { id: 'p4', userId: 'u4', name: 'Tom Teen',     position: 'Prop' },
    { id: 'p5', userId: 'u5', name: 'Ann Archived', position: 'Wing', lifecycleStatus: 'archived' },
    { id: 'p6', userId: 'u6', name: 'Cara Coach',   position: 'Coach' },       // staff
    { id: 'p7', userId: 'u7', name: 'Mia Minor',    position: 'Centre' },      // U16
  ];
  const defaultMembers = [
    { userId: 'u1', status: 'active', playerGroupId: SENIORS },
    { userId: 'u2', status: 'active', playerGroupId: SENIORS },
    { userId: 'u3', status: 'active', playerGroupId: U18 },
    { userId: 'u4', status: 'active', playerGroupId: U18 },
    { userId: 'u5', status: 'active', playerGroupId: U18 },
    { userId: 'u6', status: 'active', playerGroupId: U18 },
    { userId: 'u7', status: 'active', playerGroupId: U16 },
  ];
  return new Function('roster', 'membersIn', 'groupIn', 'loadedIn', 'placedIn', 'entitledIn', `
    "use strict";
    const state = { operationalGroupId: groupIn, players: roster, users: [] };
    const _adminData = { loaded: loadedIn, members: membersIn };
    let ensureCalls = 0;
    function canI() { return entitledIn; }
    function ensureAdminData() { ensureCalls++; }
    function canonicalVisiblePlayers() { return state.players; }
    // The product's real staff rule.
    function isRosterPlayerRecord(player = {}) {
      const position = String(player.position || '').trim().toLowerCase();
      return Boolean(player.id && player.name) && !['coach','admin','medical staff'].includes(position);
    }
    function mcPersonKey(n) { return String(n || '').trim().toLowerCase(); }
    // Already-placed players come from the DOM in the real app.
    const document = { querySelectorAll: () => placedIn.map(v => ({ value: v })) };
    ${fn('clubUsesPlayerGroups')}
    ${fn('playerGroupIdOf')}
    ${fn('operationalPlayers')}
    ${fn('mcComputeAvailable')}
    // Exactly the filter mcRenderPickerList applies to the pool.
    function search(q) {
      q = String(q || '').trim().toLowerCase();
      return mcComputeAvailable().filter(p => !q ||
        String(p.name).toLowerCase().indexOf(q) !== -1 ||
        String(p.position || '').toLowerCase().indexOf(q) !== -1);
    }
    return {
      pool: () => mcComputeAvailable().map(p => p.name),
      search: q => search(q).map(p => p.name),
      scoped: () => operationalPlayers().map(p => p.name),
      ensureCalls: () => ensureCalls,
    };
  `)(roster, members || defaultMembers, group, adminLoaded, placed, entitled);
}

// ─── 1 + 2: the reported bug ────────────────────────────────────────────────

test('MD-1: a U18 search can never return a senior player', () => {
  const c = club({ group: U18 });
  // The exact action reported: manager opens the picker and searches a senior.
  assert.deepEqual(c.search('Sam'), [], 'searching a senior name returns nothing');
  assert.deepEqual(c.search('Senior'), [], 'nor their surname');
  assert.deepEqual(c.search('Sid'), [], 'nor the other senior');
  // And no senior is reachable by browsing either — the pool itself is clean.
  assert.ok(!c.pool().includes('Sam Senior'));
  assert.ok(!c.pool().includes('Sid Senior'));
  // Nor another age group's players.
  assert.deepEqual(c.search('Mia'), [], 'U16 player is not U18-eligible either');
});

test('MD-2: valid U18 players remain searchable and selectable', () => {
  const c = club({ group: U18 });
  assert.deepEqual(c.pool().sort(), ['Tom Teen', 'Yuri Youth'], 'exactly the eligible U18 players');
  assert.deepEqual(c.search('Yuri'), ['Yuri Youth']);
  assert.deepEqual(c.search('Tom'), ['Tom Teen']);
  assert.deepEqual(c.search('prop'), ['Tom Teen'], 'position search still works');
  // Existing exclusions are preserved by the fix, not lost.
  assert.ok(!c.pool().includes('Ann Archived'), 'archived members stay out');
  assert.ok(!c.pool().includes('Cara Coach'), 'staff are never selectable as players');
});

// ─── 3: one boundary, not two ───────────────────────────────────────────────

test('MD-3: browsing and searching share one eligibility boundary', () => {
  const c = club({ group: U18 });
  // An empty query is what the picker renders on open — it must equal the pool.
  assert.deepEqual(c.search('').sort(), c.pool().sort(), 'open-picker list IS the pool');
  // Every search result must be a subset of the pool: search narrows, never broadens.
  const pool = new Set(c.pool());
  for (const q of ['', 'a', 'e', 's', 'o', 'prop', 'lock', 'senior', 'z']) {
    for (const name of c.search(q)) {
      assert.ok(pool.has(name), `search("${q}") returned ${name}, which is not in the eligible pool`);
    }
  }
});

test('MD-3b: the picker uses the SAME rule as the match sheet beside it', () => {
  const compute = fn('mcComputeAvailable');
  assert.match(compute, /operationalPlayers\(\)/,
    'the picker pool must come from the operating group');
  // Assert against CODE, not prose — the comment above the fix names
  // canonicalVisiblePlayers() to explain what was wrong with it.
  const code = compute.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/canonicalVisiblePlayers\(\)/.test(code),
    'the whole-club pool is a second, wider definition of eligibility and must not be used here');
  // The match sheet's own pool — the authoritative rule this now matches.
  assert.match(src, /const matchdayPlayers\s+= operationalPlayers\(\)\.filter/,
    'the match sheet still scopes its pool to the operating group');
});

// ─── 4 + 5: other teams, and no leakage between them ────────────────────────

test('MD-4: senior selection still returns the senior squad', () => {
  const c = club({ group: SENIORS });
  assert.deepEqual(c.pool().sort(), ['Sam Senior', 'Sid Senior']);
  assert.deepEqual(c.search('Sam'), ['Sam Senior'], 'seniors are selectable for a senior fixture');
  assert.deepEqual(c.search('Yuri'), [], 'but a U18 player is not');
});

test('MD-5: switching team switches the pool, with nothing left over', () => {
  const seniors = club({ group: SENIORS }).pool().sort();
  const u18     = club({ group: U18 }).pool().sort();
  const u16     = club({ group: U16 }).pool().sort();
  assert.deepEqual(seniors, ['Sam Senior', 'Sid Senior']);
  assert.deepEqual(u18, ['Tom Teen', 'Yuri Youth']);
  assert.deepEqual(u16, ['Mia Minor']);
  // No player is offered under two different teams.
  const all = [...seniors, ...u18, ...u16];
  assert.equal(new Set(all).size, all.length, 'no player appears in two groups\' pools');
});

// ─── 6: eligibility cannot be bypassed ──────────────────────────────────────

test('MD-6: no query can surface an ineligible player', () => {
  const c = club({ group: U18 });
  // Exhaustive sweep: every substring of every ineligible name, plus their
  // positions. If any query surfaces one, eligibility is bypassable.
  const forbidden = ['Sam Senior', 'Sid Senior', 'Mia Minor', 'Cara Coach', 'Ann Archived'];
  const queries = new Set(['', ' ', '%', '*', 'a', 'e', 'i', 'o', 'u', 's', 'n', 'coach', 'wing', 'centre', 'lock']);
  forbidden.forEach(name => {
    for (let i = 0; i < name.length; i++) {
      for (let j = i + 1; j <= name.length; j++) queries.add(name.slice(i, j));
    }
  });
  for (const q of queries) {
    const results = c.search(q);
    for (const name of forbidden) {
      assert.ok(!results.includes(name), `search(${JSON.stringify(q)}) surfaced ineligible player ${name}`);
    }
  }
});

// ─── 7: empty and no-match behaviour ────────────────────────────────────────

test('MD-7: no-match and empty searches behave sensibly', () => {
  const c = club({ group: U18 });
  assert.deepEqual(c.search('zzzzz'), [], 'no match returns an empty list, not the whole pool');
  assert.deepEqual(c.search('   ').sort(), c.pool().sort(), 'whitespace is treated as no query');
  // A group with nobody in it shows nothing rather than falling back to the club.
  const empty = club({ group: 'grp_nobody' });
  assert.deepEqual(empty.pool(), []);
  assert.deepEqual(empty.search('Sam'), [], 'and still cannot reach a senior');
});

// ─── 8 + 9: nothing else changed ────────────────────────────────────────────

test('MD-8: single-group and pre-structure clubs are unaffected', () => {
  // No group in force — the whole roster stays selectable (today's behaviour).
  const noGroup = club({ group: null });
  assert.deepEqual(noGroup.pool().sort(), ['Mia Minor', 'Sam Senior', 'Sid Senior', 'Tom Teen', 'Yuri Youth']);
  // Memberships with no player groups at all — legacy club, full roster.
  const legacy = club({ group: U18, members: [
    { userId: 'u1', status: 'active' }, { userId: 'u3', status: 'active' } ] });
  assert.ok(legacy.pool().includes('Sam Senior'), 'a pre-structure club is not newly restricted');
});

test('MD-9: the pool fails CLOSED while the membership list is loading', () => {
  // Mid-load, an empty members array is indistinguishable from a legacy club.
  // Showing the whole club for that moment is exactly the reported bug, so an
  // entitled user gets nothing until the data lands.
  const loading = club({ group: U18, adminLoaded: false, entitled: true });
  assert.deepEqual(loading.pool(), [], 'no players offered while eligibility is unknown');
  assert.deepEqual(loading.search('Sam'), [], 'and a senior certainly is not');
  assert.ok(loading.ensureCalls() > 0, 'the load is kicked off so the picker fills in');
});

test('MD-10: already-placed players are still excluded, by person', () => {
  const c = club({ group: U18, placed: ['Yuri Youth'] });
  assert.deepEqual(c.pool(), ['Tom Teen'], 'a placed player is not offered twice');
  assert.deepEqual(c.search('Yuri'), [], 'including via search');
});

test('MD-11: unrelated Match Day behaviour is untouched', () => {
  // Sheet→roster reconciliation must keep using the CLUB-wide pool: it checks
  // whether a name exists anywhere before creating a record, and a group-scoped
  // check there would mint duplicates for players in other groups.
  assert.match(fn('mcReconcileSheetToRoster'), /canonicalVisiblePlayers\(\)/,
    'reconciliation still checks the whole club for existing records');
  // Search is still a pure filter over the pool — it must never fetch or widen.
  const render = fn('mcRenderPickerList');
  assert.match(render, /mcComputeAvailable\(\)\s*\n?\s*\.filter/, 'search filters the eligible pool');
  assert.ok(!/canonicalVisiblePlayers|state\.players/.test(render),
    'the renderer must not reach past the pool for players');
});
