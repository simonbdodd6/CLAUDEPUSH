import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function buildScope() {
  const fns = [
    '_searchMatch',
    'searchPlayers',
    'searchTeams',
    'searchFixtures',
    'searchTraining',
    'searchMedical',
    'searchReports',
    'searchCalendar',
    'searchEverything',
    'searchQuickLinks',
    'searchGroupByCategory',
  ].map(extractFn).join('\n');

  const body = `
    "use strict";
    ${fns}
    return {
      _searchMatch, searchPlayers, searchTeams, searchFixtures, searchTraining,
      searchMedical, searchReports, searchCalendar, searchEverything,
      searchQuickLinks, searchGroupByCategory,
    };
  `;
  return new Function(body)();
}

function makeState(overrides) {
  return Object.assign({
    players: [],
    clubTeams: [],
    fixtures: [],
    schedule: [],
    medicalRecords: {},
    matchEvents: {},
    matchStatus: {},
  }, overrides || {});
}

// ── _searchMatch ──────────────────────────────────────────────────────────────

test('_searchMatch: returns true for exact match', () => {
  const { _searchMatch } = buildScope();
  assert.ok(_searchMatch('John Smith', 'John'));
});

test('_searchMatch: case insensitive', () => {
  const { _searchMatch } = buildScope();
  assert.ok(_searchMatch('Harlequins RFC', 'harlequins'));
  assert.ok(_searchMatch('harlequins', 'HARLEQUINS'));
});

test('_searchMatch: returns false for no match', () => {
  const { _searchMatch } = buildScope();
  assert.ok(!_searchMatch('John Smith', 'xyz'));
});

test('_searchMatch: returns false for empty needle', () => {
  const { _searchMatch } = buildScope();
  assert.ok(!_searchMatch('John Smith', ''));
});

test('_searchMatch: handles null/undefined haystack gracefully', () => {
  const { _searchMatch } = buildScope();
  assert.ok(!_searchMatch(null, 'test'));
  assert.ok(!_searchMatch(undefined, 'test'));
});

test('_searchMatch: partial match in middle of string', () => {
  const { _searchMatch } = buildScope();
  assert.ok(_searchMatch('Fly-half', 'half'));
});

// ── searchPlayers ─────────────────────────────────────────────────────────────

test('searchPlayers: empty query returns no results', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [{ id: '1', name: 'Alice' }] });
  assert.equal(searchPlayers(s, '').length, 0);
  assert.equal(searchPlayers(s, '   ').length, 0);
  assert.equal(searchPlayers(s, null).length, 0);
});

test('searchPlayers: matches by name', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [
    { id: '1', name: 'Alice Archer' },
    { id: '2', name: 'Bob Builder' },
  ]});
  const res = searchPlayers(s, 'alice');
  assert.equal(res.length, 1);
  assert.equal(res[0].title, 'Alice Archer');
});

test('searchPlayers: case insensitive name match', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [{ id: '1', name: 'Charlie Chase' }] });
  assert.equal(searchPlayers(s, 'CHARLIE').length, 1);
  assert.equal(searchPlayers(s, 'chase').length, 1);
});

test('searchPlayers: matches by position', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [
    { id: '1', name: 'Alice', position: 'Fly-half' },
    { id: '2', name: 'Bob',   position: 'Prop' },
  ]});
  assert.equal(searchPlayers(s, 'fly').length, 1);
});

test('searchPlayers: matches by jersey number', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [
    { id: '1', name: 'Alice', jerseyNumber: '10' },
    { id: '2', name: 'Bob',   jerseyNumber: '1'  },
  ]});
  assert.equal(searchPlayers(s, '10').length, 1);
});

test('searchPlayers: result has correct category and dest', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [{ id: '1', name: 'Alice' }] });
  const res = searchPlayers(s, 'alice');
  assert.equal(res[0].category, 'Players');
  assert.equal(res[0].dest, 'players');
  assert.equal(res[0].icon, '👤');
});

test('searchPlayers: no results when no match', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [{ id: '1', name: 'Alice' }] });
  assert.equal(searchPlayers(s, 'zzz').length, 0);
});

test('searchPlayers: empty players array returns empty', () => {
  const { searchPlayers } = buildScope();
  assert.equal(searchPlayers(makeState(), 'alice').length, 0);
});

test('searchPlayers: does not mutate state', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [{ id: '1', name: 'Alice', position: 'Fly-half' }] });
  const before = JSON.stringify(s);
  searchPlayers(s, 'alice');
  assert.equal(JSON.stringify(s), before);
});

// ── searchTeams ───────────────────────────────────────────────────────────────

test('searchTeams: empty query returns no results', () => {
  const { searchTeams } = buildScope();
  const s = makeState({ clubTeams: [{ id: 't1', name: 'Seniors' }] });
  assert.equal(searchTeams(s, '').length, 0);
});

test('searchTeams: matches by team name', () => {
  const { searchTeams } = buildScope();
  const s = makeState({ clubTeams: [
    { id: 't1', name: 'Seniors'  },
    { id: 't2', name: 'Under 18' },
  ]});
  assert.equal(searchTeams(s, 'senior').length, 1);
  assert.equal(searchTeams(s, 'senior')[0].title, 'Seniors');
});

test('searchTeams: matches by ageGroup', () => {
  const { searchTeams } = buildScope();
  const s = makeState({ clubTeams: [{ id: 't1', name: 'U16s', ageGroup: 'Under 16' }] });
  assert.equal(searchTeams(s, 'under 16').length, 1);
});

test('searchTeams: result has correct category and dest', () => {
  const { searchTeams } = buildScope();
  const s = makeState({ clubTeams: [{ id: 't1', name: 'Seniors' }] });
  const res = searchTeams(s, 'seniors');
  assert.equal(res[0].category, 'Teams');
  assert.equal(res[0].dest, 'admin');
});

test('searchTeams: empty clubTeams returns empty', () => {
  const { searchTeams } = buildScope();
  assert.equal(searchTeams(makeState(), 'senior').length, 0);
});

test('searchTeams: does not mutate state', () => {
  const { searchTeams } = buildScope();
  const s = makeState({ clubTeams: [{ id: 't1', name: 'Seniors', ageGroup: 'Senior' }] });
  const before = JSON.stringify(s);
  searchTeams(s, 'senior');
  assert.equal(JSON.stringify(s), before);
});

// ── searchFixtures ────────────────────────────────────────────────────────────

test('searchFixtures: empty query returns no results', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [{ id: 'f1', opposition: 'Saracens' }] });
  assert.equal(searchFixtures(s, '').length, 0);
});

test('searchFixtures: matches by opposition', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [
    { id: 'f1', opposition: 'Saracens'     },
    { id: 'f2', opposition: 'Wasps'        },
  ]});
  const res = searchFixtures(s, 'sarac');
  assert.equal(res.length, 1);
  assert.ok(res[0].title.includes('Saracens'));
});

test('searchFixtures: matches by date', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-15' }] });
  assert.equal(searchFixtures(s, '2026-09').length, 1);
});

test('searchFixtures: matches by competition', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [{ id: 'f1', opposition: 'Bath', competition: 'Premiership' }] });
  assert.equal(searchFixtures(s, 'premiership').length, 1);
});

test('searchFixtures: result has correct category and dest', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [{ id: 'f1', opposition: 'Bath' }] });
  const res = searchFixtures(s, 'bath');
  assert.equal(res[0].category, 'Fixtures');
  assert.equal(res[0].dest, 'fixtures');
  assert.equal(res[0].icon, '🏆');
});

test('searchFixtures: does not mutate state', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [{ id: 'f1', opposition: 'Bath', competition: 'Cup' }] });
  const before = JSON.stringify(s);
  searchFixtures(s, 'bath');
  assert.equal(JSON.stringify(s), before);
});

// ── searchTraining ────────────────────────────────────────────────────────────

test('searchTraining: empty query returns no results', () => {
  const { searchTraining } = buildScope();
  const s = makeState({ schedule: [{ id: 'tue', title: 'Session 1', date: '' }] });
  assert.equal(searchTraining(s, '').length, 0);
});

test('searchTraining: matches by title', () => {
  const { searchTraining } = buildScope();
  const s = makeState({ schedule: [
    { id: 'tue', title: 'Tuesday Strength', date: '' },
    { id: 'thu', title: 'Thursday Skills',  date: '' },
  ]});
  assert.equal(searchTraining(s, 'strength').length, 1);
  assert.equal(searchTraining(s, 'strength')[0].title, 'Tuesday Strength');
});

test('searchTraining: matches by focus', () => {
  const { searchTraining } = buildScope();
  const s = makeState({ schedule: [{ id: 'tue', title: 'Session 1', focus: 'Lineout', date: '' }] });
  assert.equal(searchTraining(s, 'lineout').length, 1);
});

test('searchTraining: result has correct category', () => {
  const { searchTraining } = buildScope();
  const s = makeState({ schedule: [{ id: 'tue', title: 'Session 1', date: '' }] });
  const res = searchTraining(s, 'session');
  assert.equal(res[0].category, 'Training');
  assert.equal(res[0].dest, 'training');
});

test('searchTraining: does not mutate state', () => {
  const { searchTraining } = buildScope();
  const s = makeState({ schedule: [{ id: 'tue', title: 'Session 1', focus: 'Set piece', date: '' }] });
  const before = JSON.stringify(s);
  searchTraining(s, 'set');
  assert.equal(JSON.stringify(s), before);
});

// ── searchMedical ─────────────────────────────────────────────────────────────

test('searchMedical: empty query returns no results', () => {
  const { searchMedical } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice' }],
    medicalRecords: { p1: { currentInjury: 'Hamstring strain' } },
  });
  assert.equal(searchMedical(s, '').length, 0);
});

test('searchMedical: matches by injury name', () => {
  const { searchMedical } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
    medicalRecords: {
      p1: { currentInjury: 'Hamstring strain' },
      p2: { currentInjury: 'Ankle sprain' },
    },
  });
  const res = searchMedical(s, 'hamstring');
  assert.equal(res.length, 1);
  assert.equal(res[0].title, 'Alice');
});

test('searchMedical: matches by severity', () => {
  const { searchMedical } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice' }],
    medicalRecords: { p1: { currentInjury: 'Knee', severity: 'severe' } },
  });
  assert.equal(searchMedical(s, 'severe').length, 1);
});

test('searchMedical: player with no medical record is not returned', () => {
  const { searchMedical } = buildScope();
  const s = makeState({ players: [{ id: 'p1', name: 'Alice' }], medicalRecords: {} });
  assert.equal(searchMedical(s, 'alice').length, 0);
});

test('searchMedical: result has correct category and dest', () => {
  const { searchMedical } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice' }],
    medicalRecords: { p1: { currentInjury: 'Knee' } },
  });
  const res = searchMedical(s, 'knee');
  assert.equal(res[0].category, 'Medical');
  assert.equal(res[0].dest, 'medical');
});

test('searchMedical: does not expose other players data in return value', () => {
  const { searchMedical } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
    medicalRecords: {
      p1: { currentInjury: 'Hamstring' },
      p2: { currentInjury: 'Knee' },
    },
  });
  const res = searchMedical(s, 'hamstring');
  assert.equal(res.length, 1);
  assert.ok(!res.some(r => r.title === 'Bob'));
});

test('searchMedical: does not mutate state', () => {
  const { searchMedical } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice' }],
    medicalRecords: { p1: { currentInjury: 'Knee', severity: 'moderate' } },
  });
  const before = JSON.stringify(s);
  searchMedical(s, 'knee');
  assert.equal(JSON.stringify(s), before);
});

// ── searchReports ─────────────────────────────────────────────────────────────

test('searchReports: empty query returns no results', () => {
  const { searchReports } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    matchEvents: { f1: [{ type: 'try' }] },
    matchStatus: { f1: 'ft' },
  });
  assert.equal(searchReports(s, '').length, 0);
});

test('searchReports: only returns fixtures with match events or ft status', () => {
  const { searchReports } = buildScope();
  const s = makeState({
    fixtures: [
      { id: 'f1', opposition: 'Bath',  date: '2026-09-01' },
      { id: 'f2', opposition: 'Wasps', date: '2026-09-08' },
    ],
    matchEvents: { f1: [{ type: 'try' }] },
    matchStatus: { f1: 'ft' },
  });
  const res = searchReports(s, 'bath');
  assert.equal(res.length, 1);
  assert.ok(res[0].title.includes('Bath'));
});

test('searchReports: matches by opposition', () => {
  const { searchReports } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Saracens', date: '2026-09-01' }],
    matchEvents: { f1: [{ type: 'try' }] },
    matchStatus: { f1: 'ft' },
  });
  assert.equal(searchReports(s, 'saracens').length, 1);
});

test('searchReports: result has correct category and dest', () => {
  const { searchReports } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    matchEvents: { f1: [{ type: 'try' }] },
    matchStatus: { f1: 'ft' },
  });
  const res = searchReports(s, 'bath');
  assert.equal(res[0].category, 'Reports');
  assert.equal(res[0].dest, 'reports');
});

test('searchReports: does not mutate state', () => {
  const { searchReports } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    matchEvents: { f1: [{ type: 'try' }] },
    matchStatus: { f1: 'ft' },
  });
  const before = JSON.stringify(s);
  searchReports(s, 'bath');
  assert.equal(JSON.stringify(s), before);
});

// ── searchCalendar ────────────────────────────────────────────────────────────

test('searchCalendar: empty query returns no results', () => {
  const { searchCalendar } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    schedule: [{ id: 'tue', title: 'Session 1', date: '2026-09-02' }],
  });
  assert.equal(searchCalendar(s, '').length, 0);
});

test('searchCalendar: matches fixture by opposition', () => {
  const { searchCalendar } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    schedule: [],
  });
  assert.equal(searchCalendar(s, 'bath').length, 1);
});

test('searchCalendar: matches training session by title', () => {
  const { searchCalendar } = buildScope();
  const s = makeState({
    fixtures: [],
    schedule: [{ id: 'tue', title: 'Speed Training', date: '2026-09-02' }],
  });
  assert.equal(searchCalendar(s, 'speed').length, 1);
});

test('searchCalendar: all results have Calendar category', () => {
  const { searchCalendar } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    schedule: [{ id: 'tue', title: 'Bath workout', date: '2026-09-02' }],
  });
  const res = searchCalendar(s, 'bath');
  assert.ok(res.every(r => r.category === 'Calendar'));
  assert.ok(res.every(r => r.dest === 'calendar'));
});

test('searchCalendar: does not mutate state', () => {
  const { searchCalendar } = buildScope();
  const s = makeState({
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
    schedule: [{ id: 'tue', title: 'Speed', date: '' }],
  });
  const before = JSON.stringify(s);
  searchCalendar(s, 'bath');
  assert.equal(JSON.stringify(s), before);
});

// ── searchEverything ──────────────────────────────────────────────────────────

test('searchEverything: empty query returns empty', () => {
  const { searchEverything } = buildScope();
  const s = makeState({ players: [{ id: 'p1', name: 'Alice' }] });
  assert.equal(searchEverything(s, '').length, 0);
  assert.equal(searchEverything(s, '  ').length, 0);
});

test('searchEverything: returns results from multiple categories', () => {
  const { searchEverything } = buildScope();
  const s = makeState({
    players:  [{ id: 'p1', name: 'Exeter Fan' }],
    fixtures: [{ id: 'f1', opposition: 'Exeter Chiefs', date: '2026-09-01' }],
    schedule: [],
  });
  const res = searchEverything(s, 'exeter');
  const cats = new Set(res.map(r => r.category));
  assert.ok(cats.has('Players'));
  assert.ok(cats.has('Fixtures'));
});

test('searchEverything: deduplicates by category+id+title', () => {
  const { searchEverything } = buildScope();
  const s = makeState({
    players:  [],
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01', competition: 'Cup' }],
    schedule: [],
  });
  const res = searchEverything(s, 'bath');
  const fixtureResults = res.filter(r => r.category === 'Fixtures');
  assert.equal(fixtureResults.length, 1, 'fixture should not appear more than once');
});

test('searchEverything: empty state returns empty', () => {
  const { searchEverything } = buildScope();
  assert.equal(searchEverything(makeState(), 'anything').length, 0);
});

test('searchEverything: does not mutate state', () => {
  const { searchEverything } = buildScope();
  const s = makeState({
    players: [{ id: 'p1', name: 'Alice', position: 'Fly-half' }],
    fixtures: [{ id: 'f1', opposition: 'Bath', date: '2026-09-01' }],
  });
  const before = JSON.stringify(s);
  searchEverything(s, 'alice');
  assert.equal(JSON.stringify(s), before);
});

test('searchEverything: returns array', () => {
  const { searchEverything } = buildScope();
  const res = searchEverything(makeState(), 'test');
  assert.ok(Array.isArray(res));
});

// ── searchQuickLinks ──────────────────────────────────────────────────────────

test('searchQuickLinks: returns non-empty array', () => {
  const { searchQuickLinks } = buildScope();
  const links = searchQuickLinks();
  assert.ok(Array.isArray(links));
  assert.ok(links.length >= 8);
});

test('searchQuickLinks: each entry has icon, label, dest', () => {
  const { searchQuickLinks } = buildScope();
  searchQuickLinks().forEach(lk => {
    assert.ok(typeof lk.icon  === 'string' && lk.icon.length  > 0, 'icon required');
    assert.ok(typeof lk.label === 'string' && lk.label.length > 0, 'label required');
    assert.ok(typeof lk.dest  === 'string' && lk.dest.length  > 0, 'dest required');
  });
});

test('searchQuickLinks: contains expected core sections', () => {
  const { searchQuickLinks } = buildScope();
  const dests = new Set(searchQuickLinks().map(lk => lk.dest));
  ['players', 'fixtures', 'training', 'calendar', 'medical', 'reports', 'settings'].forEach(d => {
    assert.ok(dests.has(d), 'quick links must include ' + d);
  });
});

test('searchQuickLinks: no duplicate dest values', () => {
  const { searchQuickLinks } = buildScope();
  const dests = searchQuickLinks().map(lk => lk.dest);
  assert.equal(new Set(dests).size, dests.length, 'no duplicate dest values');
});

test('searchQuickLinks: is deterministic — same output on every call', () => {
  const { searchQuickLinks } = buildScope();
  assert.equal(JSON.stringify(searchQuickLinks()), JSON.stringify(searchQuickLinks()));
});

// ── searchGroupByCategory ─────────────────────────────────────────────────────

test('searchGroupByCategory: groups results by category key', () => {
  const { searchGroupByCategory } = buildScope();
  const results = [
    { category: 'Players', title: 'Alice', id: '1' },
    { category: 'Players', title: 'Bob',   id: '2' },
    { category: 'Fixtures', title: 'vs Bath', id: 'f1' },
  ];
  const groups = searchGroupByCategory(results);
  assert.equal(groups['Players'].length, 2);
  assert.equal(groups['Fixtures'].length, 1);
});

test('searchGroupByCategory: empty array returns empty object', () => {
  const { searchGroupByCategory } = buildScope();
  const groups = searchGroupByCategory([]);
  assert.equal(Object.keys(groups).length, 0);
});

test('searchGroupByCategory: does not mutate input', () => {
  const { searchGroupByCategory } = buildScope();
  const results = [{ category: 'Players', title: 'Alice', id: '1' }];
  const before = JSON.stringify(results);
  searchGroupByCategory(results);
  assert.equal(JSON.stringify(results), before);
});

// ── Source-level checks ───────────────────────────────────────────────────────

test('search nav entry exists in coachSections', () => {
  assert.ok(src.includes('"search"') && src.includes('"Search"'),
    'coachSections must include ["search", "Search"]');
});

test('coach-search section div exists in HTML', () => {
  assert.ok(src.includes('id="coach-search"'), 'HTML must have coach-search section');
});

test('safeRender for coach-search exists', () => {
  assert.ok(src.includes("safeRender('coach-search'") && src.includes('renderSearch()'));
});

test('searchQuery default exists in defaultState', () => {
  assert.ok(src.includes("searchQuery: ''") || src.includes('searchQuery:""'),
    'defaultState must include searchQuery');
});

test('no new API files introduced', () => {
  const apiFiles = fs.readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js'));
  apiFiles.forEach(f => {
    const apiSrc = fs.readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
    assert.ok(!apiSrc.includes('searchPlayers'), `API file ${f} must not contain search helpers`);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test('searchPlayers: player with no name returns "(unnamed)"', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [{ id: 'p1', name: '', position: 'Prop' }] });
  const res = searchPlayers(s, 'prop');
  assert.ok(res.length > 0);
  assert.equal(res[0].title, '(unnamed)');
});

test('searchTeams: team with no name returns "(unnamed team)"', () => {
  const { searchTeams } = buildScope();
  const s = makeState({ clubTeams: [{ id: 't1', name: '', ageGroup: 'Under 18' }] });
  const res = searchTeams(s, 'under 18');
  assert.ok(res.length > 0);
  assert.equal(res[0].title, '(unnamed team)');
});

test('searchFixtures: fixture with no opposition shows (TBC)', () => {
  const { searchFixtures } = buildScope();
  const s = makeState({ fixtures: [{ id: 'f1', opposition: '', competition: 'Premiership' }] });
  const res = searchFixtures(s, 'premiership');
  assert.ok(res.length > 0);
  assert.ok(res[0].title.includes('(TBC)'));
});

test('searchEverything: whitespace-only query returns empty', () => {
  const { searchEverything } = buildScope();
  const s = makeState({ players: [{ id: 'p1', name: 'Alice' }] });
  assert.equal(searchEverything(s, '   ').length, 0);
});

test('searchPlayers: matches lifecycleStatus', () => {
  const { searchPlayers } = buildScope();
  const s = makeState({ players: [
    { id: '1', name: 'Alice', lifecycleStatus: 'archived' },
    { id: '2', name: 'Bob',   lifecycleStatus: 'active'   },
  ]});
  assert.equal(searchPlayers(s, 'archived').length, 1);
  assert.equal(searchPlayers(s, 'archived')[0].title, 'Alice');
});
