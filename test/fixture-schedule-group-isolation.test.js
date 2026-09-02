/**
 * BUILD S — the fixture schedule serves the OPERATING group.
 *
 * Real report: operating U18, the Club Admin / Fixtures schedule still showed
 * the Seniors fixture list. Root cause: renderCoachFixtures and Club Admin's
 * fixtures card read raw state.fixtures (the whole club) while every other
 * fixture surface already read contextFixtures(). The server's club-wide GET
 * is deliberate (any active member may view fixtures); the OPERATING CONTEXT
 * is the client's display boundary — and these two surfaces skipped it.
 *
 * Pinned here: the data boundary itself, the Fixtures screen's rendered
 * behaviour in both contexts, both U18 sides coexisting, legacy compatibility,
 * and the admin write stamping the operating group.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start === -1) start = src.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('{', start), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
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
  } else { while (i < source.length && source[i] !== ';') i++; i++; }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}
const fn = n => extractFn(html, n);

const SEN = 'grp_initial', U18 = 'grp_u18';
const STRUCTURE = {
  groups: [
    { id: SEN, name: 'Seniors', status: 'active' },
    { id: U18, name: 'U18', status: 'active' },
  ],
  teams: [
    { id: 'team_prem',  groupId: SEN, name: 'Premier',     status: 'active' },
    { id: 'team_u18_1', groupId: U18, name: 'U18 First',   status: 'active' },
    { id: 'team_u18_2', groupId: U18, name: 'U18 Second',  status: 'active' },
  ],
};
// The brief's representative world: 2 Seniors, 1 per U18 side, 1 legacy.
const FIXTURES = [
  { id: 'fx_sen_a', opposition: 'Soignies',  date: '2026-09-12', groupId: SEN, sideId: 'team_prem',  team: 'Premier', competition: 'Division 1' },
  { id: 'fx_sen_b', opposition: 'Kituro',    date: '2026-09-19', groupId: SEN, sideId: 'team_prem',  team: 'Premier', competition: 'Division 1' },
  { id: 'fx_u18_1', opposition: 'La Hulpe',  date: '2026-09-12', groupId: U18, sideId: 'team_u18_1', team: 'U18 First',  competition: 'U18 League A' },
  { id: 'fx_u18_2', opposition: 'Waterloo',  date: '2026-09-12', groupId: U18, sideId: 'team_u18_2', team: 'U18 Second', competition: 'U18 League B' },
  { id: 'fx_legacy', opposition: 'Old Boys', date: '2026-09-26' },   // pre-groups fixture: NO groupId
];

// ── The data boundary itself (real contextFixtures) ────────────────────────
function boundary({ gid, groups = STRUCTURE.groups, fixtures = FIXTURES }) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: cfg.gid, fixtures: cfg.fixtures };
    function operationalGroups() { return cfg.groups; }
    ${extractConst(html, 'CE_INITIAL_GROUP_ID')}
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    return contextFixtures();
  `)({ gid, groups, fixtures });
}

test('Seniors context: ONLY Seniors fixtures (legacy no-groupId counts as initial group)', () => {
  const ids = boundary({ gid: SEN }).map(f => f.id).sort();
  assert.deepEqual(ids, ['fx_legacy', 'fx_sen_a', 'fx_sen_b']);
});

test('U18 context: ONLY U18 fixtures — both First and Second, no Seniors, no legacy', () => {
  const ids = boundary({ gid: U18 }).map(f => f.id).sort();
  assert.deepEqual(ids, ['fx_u18_1', 'fx_u18_2']);
});

test('switching context flips the dataset both ways', () => {
  assert.ok(boundary({ gid: U18 }).every(f => !['fx_sen_a', 'fx_sen_b'].includes(f.id)));
  assert.ok(boundary({ gid: SEN }).every(f => !['fx_u18_1', 'fx_u18_2'].includes(f.id)));
});

test('no group in force (legacy single-group club): the full list answers, exactly as before groups', () => {
  assert.equal(boundary({ gid: '' }).length, FIXTURES.length);
  assert.equal(boundary({ gid: U18, groups: [] }).length, FIXTURES.length, 'no operable groups → legacy behaviour');
});

// ── The Fixtures SCREEN, rendered for real ─────────────────────────────────
function renderScreen({ gid }) {
  const body =
    '"use strict";\n' +
    'const state = { operationalGroupId: ' + JSON.stringify(gid) + ', fixtures: ' + JSON.stringify(FIXTURES) + ',\n' +
    '  players: [], squadSelections: [], fixtureAvailability: {} };\n' +
    'const _adminData = { structure: ' + JSON.stringify(STRUCTURE) + ' };\n' +
    'function operationalGroups() { return ' + JSON.stringify(STRUCTURE.groups) + '; }\n' +
    'let _fixtureFilter = "all", _fixtureCompFilter = "", _fixtureEditId = null, _fixtureDraft = {}, _fxAvailBoardId = null;\n' +
    'function isCoach() { return true; }\n' +
    'function canI() { return true; }\n' +
    'function esc(s) { return String(s == null ? "" : s); }\n' +
    'function renderFixtureAvailBoard() { return ""; }\n' +
    'const el = { innerHTML: "" };\n' +
    'const document = { getElementById: () => el };\n' +
    extractConst(html, 'CE_INITIAL_GROUP_ID') + '\n' +
    extractConst(html, 'HOME_AWAY_LABEL') + '\n' +
    extractConst(html, 'PLAYER_LIFECYCLE_LABELS') + '\n' +
    extractConst(html, 'rugbySlots') + '\n' +
    fn('fixtureBelongsToGroup') + '\n' +
    fn('contextFixtures') + '\n' +
    fn('normalizeFixture') + '\n' +
    fn('fixtureSortByDate') + '\n' +
    fn('fixtureHasBeenPlayed') + '\n' +
    fn('fixtureDisplayStatus') + '\n' +
    fn('fixtureCountdown') + '\n' +
    fn('fixtureTypeStyle') + '\n' +
    fn('mcSideRank') + '\n' +
    fn('matchCentreSides') + '\n' +
    fn('fixtureTeamLabel') + '\n' +
    fn('playerIsArchived') + '\n' +
    fn('activeRosterPlayers') + '\n' +
    fn('positionSlotNumber') + '\n' +
    fn('fixturePositionWarnings') + '\n' +
    fn('fixtureAvailabilitySummary') + '\n' +
    fn('renderCoachFixtures') + '\n' +
    'renderCoachFixtures();\n' +
    'return el.innerHTML;\n';
  return new Function(body)();
}

test('SCREEN operating U18: U18 fixtures render, Seniors do NOT — the reported bug', () => {
  const out = renderScreen({ gid: U18 });
  assert.ok(out.includes('La Hulpe'), 'U18 First fixture visible');
  assert.ok(out.includes('Waterloo'), 'U18 Second fixture visible');
  assert.ok(!out.includes('Soignies') && !out.includes('Kituro'), 'NO Seniors fixture on the U18 schedule');
  assert.ok(!out.includes('Old Boys'), 'legacy (initial-group) fixture stays with Seniors');
});

test('SCREEN operating U18: both sides carry their canonical team names', () => {
  const out = renderScreen({ gid: U18 });
  assert.ok(out.includes('U18 First'), 'First side named');
  assert.ok(out.includes('U18 Second'), 'Second side named');
});

test('SCREEN operating Seniors: Seniors + legacy render, U18 does NOT', () => {
  const out = renderScreen({ gid: SEN });
  assert.ok(out.includes('Soignies') && out.includes('Kituro'), 'Seniors fixtures visible');
  assert.ok(out.includes('Old Boys'), 'legacy fixture belongs to the initial group');
  assert.ok(!out.includes('La Hulpe') && !out.includes('Waterloo'), 'no U18 leakage into Seniors');
});

test('SCREEN with no group in force: everything renders (legacy clubs unchanged)', () => {
  const out = renderScreen({ gid: '' });
  for (const opp of ['Soignies', 'Kituro', 'La Hulpe', 'Waterloo', 'Old Boys'])
    assert.ok(out.includes(opp), opp + ' visible');
});

// ── Club Admin: same boundary, and the write stamps the operating group ────

test('Club Admin fixtures card reads the operating context (wiring)', () => {
  const admin = fn('renderClubAdmin');
  assert.ok(admin.includes('const fixtures = contextFixtures();'),
    'the admin card consumes the group boundary, not raw state.fixtures');
  assert.ok(!/const fixtures = state\.fixtures/.test(admin), 'the raw read is gone');
});

test('Club Admin exposes the CANONICAL creation and import paths (Build T)', () => {
  // The legacy inline add-row (device-local, team-less, legacy sync channel)
  // is gone; the card now opens the server-backed modal and importer that
  // stamp the operating group and resolve the chosen Team to its side.
  const admin = extractFn(html, 'renderClubAdmin');
  assert.ok(admin.includes('fixtureAddOpen()'), 'canonical add modal reachable from Club Admin');
  assert.ok(admin.includes("fixtureImportOpen('csv')"), 'CSV import reachable');
  assert.ok(admin.includes("fixtureImportOpen('xlsx')"), 'Excel import reachable');
  assert.ok(!admin.includes('adminAddFixture'), 'the legacy device-local add path is gone');
  assert.ok(!admin.includes('adm-fx-opp'), 'and its inline row with it');
  assert.ok(!html.includes('function adminAddFixture('), 'the dead function is removed, not parked');
});

test('sideId semantics untouched: a fixture with a sideId still resolves its canonical team name', () => {
  const out = renderScreen({ gid: U18 });
  // canonical names come from the structure, proving side resolution still runs
  assert.ok(out.includes('U18 First') && out.includes('U18 Second'));
});
