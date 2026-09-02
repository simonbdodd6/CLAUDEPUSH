/**
 * Build P — multi-team fixtures on the Overview.
 *
 * One group can field several teams (U18 First / U18 Second), so several
 * fixtures can be genuinely upcoming at once. These tests pin the contract:
 *
 *  · every group-relevant upcoming fixture is shown, chronologically, each
 *    labelled with its CANONICAL team name and opening ITS OWN Match Centre;
 *  · nothing is invented — competition comes from the canonical field with an
 *    honest "Competition not set" fallback (never a fabricated "Friendly"),
 *    and an absent venue says "Venue not set" rather than being omitted;
 *  · group isolation holds in both directions;
 *  · the "Match details missing" attention item defers to the linked
 *    CANONICAL fixture, so a fixture that has a venue is never nagged about;
 *  · the importer never stamps the club-wide legacy team name onto a group's
 *    rows.
 *
 * The harness runs the REAL extracted code (same pattern as
 * club-command-dashboard.test.js); only network/module-state reads are stubbed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildImportRows } from '../src/fixture-import.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
}

function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (closer) {
    let depth = 0;
    while (i < source.length) {
      if (source[i] === opener) depth++;
      else if (source[i] === closer) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// ── Dashboard scope ──────────────────────────────────────────────────────────
// Identical extraction set to club-command-dashboard.test.js, plus the
// side-name resolvers the fixture rows use. Real code decides every number
// and label; stubs only stand where module state or the network would be.

function buildScope({
  players = [], schedule = [], fixtures = [], messages = [], matchCentre = {},
  masterFeed = [], trainingBlocks = {}, squadSelections = [],
  fixtureAvailability = {}, groups = [], operationalGroupId = null,
  adminData = { members: [], profiles: [], loaded: true, loading: false, attempted: true },
} = {}) {
  const stateObj = {
    players, schedule, fixtures, messages, matchCentre, masterFeed,
    trainingBlocks, squadSelections, fixtureAvailability, operationalGroupId,
  };
  const body =
    '"use strict";\n' +
    'const state = ' + JSON.stringify(stateObj) + ';\n' +
    'const _groups = ' + JSON.stringify(groups) + ';\n' +
    'function getTonightSessionId() { return null; }\n' +
    'function chatUnreadTotal() { return 0; }\n' +
    'function getTodayReceipts() { return []; }\n' +
    'function setSection() {}\n' +
    'function isCoach() { return true; }\n' +
    'function ensureAdminData() {}\n' +
    'function refreshLiveAvailability() { return Promise.resolve(); }\n' +
    'function operationalGroupName() { return "U18"; }\n' +
    'const _adminData = ' + JSON.stringify(adminData) + ';\n' +
    'let _availLastSync = "2026-08-30T12:00:00.000Z";\n' +
    'let _resolvedAvailabilityGroup = ' + JSON.stringify(operationalGroupId || '') + ';\n' +
    'let _activityFetchedFor = null;\n' +
    'function operationalGroups() { return _groups; }\n' +
    'function operationalPlayers() { return state.players || []; }\n' +
    'let _resolvedAvailability = {};\n' +
    'function canI() { return true; }\n' +
    'function esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n' +
    extractConst(html, 'CE_INITIAL_GROUP_ID') + '\n' +
    extractFn(html, 'fixtureBelongsToGroup') + '\n' +
    extractFn(html, 'contextFixtures') + '\n' +
    extractFn(html, 'sessionKey') + '\n' +
    extractFn(html, 'sessionReasonKey') + '\n' +
    extractFn(html, 'normalizeSessionId') + '\n' +
    extractFn(html, 'liveAvailabilityPlayerKeys') + '\n' +
    extractFn(html, 'resolvedAnswerFor') + '\n' +
    extractFn(html, 'sessionRows') + '\n' +
    extractConst(html, 'PLAYER_LIFECYCLE_LABELS') + '\n' +
    extractFn(html, 'playerIsArchived') + '\n' +
    extractFn(html, 'activeRosterPlayers') + '\n' +
    extractConst(html, 'rugbySlots') + '\n' +
    extractFn(html, 'positionSlotNumber') + '\n' +
    extractFn(html, 'fixturePositionWarnings') + '\n' +
    extractFn(html, 'fixtureAvailabilitySummary') + '\n' +
    extractConst(html, 'HOME_AWAY_LABEL') + '\n' +
    extractFn(html, 'mcSideRank') + '\n' +
    extractFn(html, 'matchCentreSides') + '\n' +
    extractFn(html, 'fixtureTeamLabel') + '\n' +
    extractFn(html, 'normalizeFixture') + '\n' +
    extractFn(html, 'fixtureSortByDate') + '\n' +
    extractFn(html, 'fixtureCountdown') + '\n' +
    extractFn(html, 'fixtureHasBeenPlayed') + '\n' +
    extractFn(html, 'fixtureDisplayStatus') + '\n' +
    extractFn(html, 'fixtureTypeStyle') + '\n' +
    extractFn(html, 'selectionFindForFixture') + '\n' +
    extractFn(html, 'selectionStarterCount') + '\n' +
    extractFn(html, 'selectionBenchCount') + '\n' +
    extractFn(html, 'playerMatchKey') + '\n' +
    extractFn(html, 'availabilityWeekSessions') + '\n' +
    extractFn(html, 'currentResolvedAvailability') + '\n' +
    extractFn(html, 'timeAgo') + '\n' +
    extractConst(html, 'ACTIVITY_LIMIT') + '\n' +
    extractConst(html, 'ACT_MARK') + '\n' +
    extractConst(html, 'ACT_WHAT') + '\n' +
    extractFn(html, 'recentActivity') + '\n' +
    extractFn(html, 'ensureRecentActivity') + '\n' +
    extractFn(html, 'overviewRoster') + '\n' +
    extractFn(html, 'overviewAvailableCount') + '\n' +
    extractFn(html, 'overviewAnswerMap') + '\n' +
    extractFn(html, 'overviewAnswerCounts') + '\n' +
    extractFn(html, 'overviewAvailabilityContext') + '\n' +
    extractFn(html, 'overviewDonutSvg') + '\n' +
    extractFn(html, 'overviewLegendRow') + '\n' +
    extractFn(html, 'renderClubCommandDashboard') + '\n' +
    'return { renderClubCommandDashboard };\n';
  return new Function(body)();
}

const iso = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// A club whose structure has TWO U18 teams, operating the U18 group. Fixtures
// are server-shaped: no `type` field exists on the server model at all.
const U18 = 'grp_u18';
const STRUCTURE = {
  groups: [
    { id: 'grp_initial', name: 'Seniors', status: 'active' },
    { id: U18, name: 'U18', status: 'active' },
  ],
  teams: [
    { id: 'team_sen_1',   name: 'Premier XV',  groupId: 'grp_initial', status: 'active', order: 1 },
    { id: 'team_u18_1st', name: 'U18 First',   groupId: U18, status: 'active', order: 1 },
    { id: 'team_u18_2nd', name: 'U18 Second',  groupId: U18, status: 'active', order: 2 },
  ],
};
function u18Club(fixtures, extra = {}) {
  return buildScope({
    fixtures,
    operationalGroupId: U18,
    groups: STRUCTURE.groups,
    adminData: { members: [], profiles: [], loaded: true, loading: false, attempted: true, structure: STRUCTURE },
    ...extra,
  });
}
const fxFirst = {
  id: 'fx_first', opposition: 'Kituro', date: iso(4), kickoffTime: '14:00',
  venue: 'Home Ground', homeAway: 'home', competition: 'U18 League A',
  groupId: U18, sideId: 'team_u18_1st', team: 'U18 First',
};
const fxSecond = {
  id: 'fx_second', opposition: 'La Hulpe', date: iso(4), kickoffTime: '15:30',
  venue: 'La Hulpe RFC', homeAway: 'away', competition: 'U18 League B',
  groupId: U18, sideId: 'team_u18_2nd', team: 'U18 Second',
};
const fxSeniors = {
  id: 'fx_sen', opposition: 'Soignies', date: iso(4), kickoffTime: '15:00',
  venue: 'Stade Communal', homeAway: 'home', competition: 'Division 1',
  groupId: 'grp_initial', sideId: 'team_sen_1', team: 'Premier XV',
};

// ── 1–3. Several relevant fixtures, chronological, canonically labelled ──────

test('two same-day fixtures for one group BOTH render — and one availability pool remains', () => {
  const out = u18Club([fxFirst, fxSecond]).renderClubCommandDashboard();
  assert.ok(out.includes('vs Kituro'),   'First-team fixture missing');
  assert.ok(out.includes('vs La Hulpe'), 'Second-team fixture missing');
  assert.equal((out.match(/class="ovw-fixrow"/g) || []).length, 2, 'expected two fixture rows');
  // Requirement H: fixtures multiplied, the availability card did NOT — one
  // group pool, one card.
  assert.equal((out.match(/>Availability</g) || []).length, 1, 'exactly one availability card');
});

test('fixture rows are chronological — earliest kick-off first', () => {
  const out = u18Club([fxSecond, fxFirst]).renderClubCommandDashboard(); // stored out of order
  assert.ok(out.indexOf('vs Kituro') < out.indexOf('vs La Hulpe'),
    '14:00 fixture must render before the 15:30 fixture');
});

test('each row carries its CANONICAL team name, resolved from the club structure', () => {
  const renamed = { ...fxSecond, team: 'stale free text' }; // sideId wins over stale text
  const out = u18Club([fxFirst, renamed]).renderClubCommandDashboard();
  assert.ok(out.includes('U18 First'),  'First side name missing');
  assert.ok(out.includes('U18 Second'), 'canonical side name must beat stale free text');
  assert.ok(!out.includes('stale free text'), 'stale free text must not be shown when the side resolves');
});

// ── 4–6. Competition honesty ─────────────────────────────────────────────────

test('a server fixture with no competition NEVER wears a fabricated "Friendly"', () => {
  const bare = { id: 'fx_b', opposition: 'BBRFC', date: iso(3), groupId: U18, sideId: 'team_u18_1st' };
  const out = u18Club([bare]).renderClubCommandDashboard();
  assert.ok(!out.includes('Friendly'), 'no fixture in this club ever said Friendly');
  assert.ok(out.includes('Competition not set'), 'the unknown must be stated honestly');
});

test('the canonical competition renders on every row', () => {
  const out = u18Club([fxFirst, fxSecond]).renderClubCommandDashboard();
  assert.ok(out.includes('U18 League A'), 'First-team competition missing');
  assert.ok(out.includes('U18 League B'), 'Second-team competition missing');
});

test('an explicitly entered device type still stands in when competition is empty', () => {
  const typed = { id: 'fx_t', opposition: 'Waterloo', date: iso(3), type: 'Cup',
    groupId: U18, sideId: 'team_u18_1st' };
  const out = u18Club([typed]).renderClubCommandDashboard();
  assert.ok(out.includes('Cup'), 'an explicit type is real data and must survive');
  assert.ok(!out.includes('Competition not set'), 'fallback must not fire over real data');
  // And the priority is fixed: when BOTH exist, the canonical competition
  // wins — a stale device type must never outrank the imported truth.
  const both = { id: 'fx_p', opposition: 'Waterloo', date: iso(3), type: 'Friendly',
    competition: 'Cup Final', groupId: U18, sideId: 'team_u18_1st' };
  const out2 = u18Club([both]).renderClubCommandDashboard();
  assert.ok(out2.includes('Cup Final'), 'canonical competition must win');
  assert.ok(!out2.includes('Friendly'), 'the outranked type must not render');
});

// ── 7–9. Venue and home/away honesty ─────────────────────────────────────────

test('the canonical venue renders — a fixture with a venue is never "missing" one', () => {
  const out = u18Club([fxFirst, fxSecond]).renderClubCommandDashboard();
  assert.ok(out.includes('Home Ground'),  'First venue missing');
  assert.ok(out.includes('La Hulpe RFC'), 'Second venue missing');
  assert.ok(!out.includes('Venue not set'), 'both venues are known');
});

test('a genuinely absent venue says so honestly', () => {
  const noVenue = { ...fxFirst, venue: '' };
  const out = u18Club([noVenue, fxSecond]).renderClubCommandDashboard();
  assert.ok(out.includes('Venue not set'), 'the absence must be stated, not omitted');
});

test('home/away comes from the canonical fixture on each row', () => {
  const out = u18Club([fxFirst, fxSecond]).renderClubCommandDashboard();
  assert.ok(out.includes('>Home<'), 'home label missing');
  assert.ok(out.includes('>Away<'), 'away label missing');
});

// ── 10–12. Navigation, cap, single-fixture card ──────────────────────────────

test('each row opens ITS OWN fixture in the Match Centre through the canonical selection path', () => {
  const out = u18Club([fxFirst, fxSecond]).renderClubCommandDashboard();
  assert.ok(out.includes(`setMatchCentreFixture('fx_first');setSection('coach','matchday')`),
    'First row must open its own Match Centre');
  assert.ok(out.includes(`setMatchCentreFixture('fx_second');setSection('coach','matchday')`),
    'Second row must open its own Match Centre');
  // The row click must not ALSO fire the card action (which opens Fixtures).
  assert.ok(out.includes('event.stopPropagation()'), 'row click must not bubble to the card');
});

test('a long fixture list is capped at three rows with an honest overflow note', () => {
  const many = [0, 1, 2, 3, 4].map(i => ({
    id: 'fx_m' + i, opposition: 'Opp' + i, date: iso(3 + i),
    groupId: U18, sideId: 'team_u18_1st',
  }));
  const out = u18Club(many).renderClubCommandDashboard();
  assert.equal((out.match(/class="ovw-fixrow"/g) || []).length, 3, 'rows are capped at three');
  assert.ok(out.includes('2 more in Fixtures'), 'the overflow must be stated');
});

test('exactly one upcoming fixture keeps the rich single-fixture card', () => {
  const out = u18Club([fxFirst]).renderClubCommandDashboard();
  assert.ok(!out.includes('ovw-fixrow'), 'no compact rows for a single fixture');
  assert.ok(out.includes('vs Kituro') && out.includes('KO 14:00'), 'rich card content missing');
  assert.ok(out.includes('U18 League A'), 'the pill states the canonical competition');
  assert.ok(out.includes('U18 First'), 'the rich card names its team too');
});

// ── 13–14. Group isolation, both directions ──────────────────────────────────

test('operating U18: Seniors fixtures never appear on the U18 Overview', () => {
  const out = u18Club([fxFirst, fxSecond, fxSeniors]).renderClubCommandDashboard();
  assert.ok(!out.includes('Soignies'),   'Seniors opposition leaked into U18');
  assert.ok(!out.includes('Division 1'), 'Seniors competition leaked into U18');
  assert.equal((out.match(/class="ovw-fixrow"/g) || []).length, 2, 'only the two U18 fixtures render');
});

test('operating Seniors: U18 fixtures never appear on the Seniors Overview', () => {
  const scope = buildScope({
    fixtures: [fxFirst, fxSecond, fxSeniors],
    operationalGroupId: 'grp_initial',
    groups: STRUCTURE.groups,
    adminData: { members: [], profiles: [], loaded: true, loading: false, attempted: true, structure: STRUCTURE },
  });
  const out = scope.renderClubCommandDashboard();
  assert.ok(out.includes('vs Soignies'), 'the Seniors fixture must render for Seniors');
  assert.ok(!out.includes('Kituro') && !out.includes('La Hulpe'), 'U18 fixtures leaked into Seniors');
});

// ── 15. normalizeFixture contract ────────────────────────────────────────────

test('normalizeFixture no longer fabricates a type — absence is absence', () => {
  const scope = u18Club([]);
  const norm = new Function(
    extractFn(html, 'normalizeFixture') + '\nreturn normalizeFixture;')();
  assert.equal(norm({ id: 'x', opposition: 'A' }).type, '', 'no invented Friendly');
  assert.equal(norm({ id: 'y', opposition: 'B', type: 'Cup' }).type, 'Cup', 'explicit type preserved');
  assert.ok(scope, 'scope builds');
});

// ── 16–17. "Match details missing" defers to the canonical fixture ───────────

function attentionScope({ matchCentre = {}, fixtures = [] } = {}) {
  const body =
    '"use strict";\n' +
    'const state = ' + JSON.stringify({
      matchCentre, fixtures, schedule: [], players: [], messages: [],
      trainingBlocks: {}, formationNames: {}, availabilityRequests: [],
    }) + ';\n' +
    'function getTonightSessionId() { return null; }\n' +
    'function overviewAvailableCount() { return 0; }\n' +
    'function availabilityNonResponders() { return []; }\n' +
    'function overviewRoster() { return []; }\n' +
    'function getInjuredNoReturnDate() { return []; }\n' +
    'function chatUnreadTotal() { return 0; }\n' +
    'let _chatNavUnread = 0;\n' +
    'let _identityPendingRequests = [];\n' +
    extractFn(html, 'matchCentrePhase') + '\n' +
    extractFn(html, 'getNeedsAttentionItems') + '\n' +
    'return getNeedsAttentionItems;\n';
  return new Function(body)();
}

test('a stale Match Centre copy is not nagged about a venue the CANONICAL fixture has', () => {
  const items = attentionScope({
    matchCentre: { kickoffDate: iso(10), opposition: 'Kituro', venue: '', fixtureId: 'fx_first' },
    fixtures: [{ id: 'fx_first', opposition: 'Kituro', venue: 'Home Ground' }],
  })();
  assert.ok(!items.some(i => i.text === 'Match details missing'),
    'the linked fixture HAS a venue — no missing-details nag');
});

test('genuinely missing details are still reported — the honesty is two-way', () => {
  const items = attentionScope({
    matchCentre: { kickoffDate: iso(10), opposition: 'Kituro', venue: '', fixtureId: 'fx_first' },
    fixtures: [{ id: 'fx_first', opposition: 'Kituro', venue: '' }],
  })();
  const item = items.find(i => i.text === 'Match details missing');
  assert.ok(item, 'nothing anywhere records a venue — the item must appear');
  assert.equal(item.detail, 'venue', 'and it names exactly what is missing');
});

// ── 18. The importer never stamps the legacy club-wide team name ─────────────

test('an import row with no Team cell stays team-less in a group context', () => {
  // Rows are array-of-arrays with a header row; the mapping is index → field.
  const rows = [['date', 'opponent'], ['2026-09-12', 'Kituro']];
  const mapping = { 0: 'date', 1: 'opponent' };
  const grouped = buildImportRows(rows, mapping, { dayFirst: false, defaultTeam: '' });
  assert.equal(grouped[0].fixture.team, '', 'no Team cell + group context = honestly team-less');
  const legacy = buildImportRows(rows, mapping, { dayFirst: false, defaultTeam: '1st XV' });
  assert.equal(legacy[0].fixture.team, '1st XV', 'a structureless legacy club keeps its old default');
  // And the wiring: the app passes the group-aware default, not state.teamName
  // unconditionally (behavioural halves above prove what each value does).
  assert.ok(html.includes("defaultTeam: (state.operationalGroupId && operationalGroups().length) ? '' : (state.teamName || '')"),
    'the app must choose the default by group context');
});
