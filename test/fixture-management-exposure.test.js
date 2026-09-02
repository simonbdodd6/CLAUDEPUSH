/**
 * BUILD T — multi-team fixture creation and import are actually usable.
 *
 * The user's report: operating U18 there was no visible way to add or import
 * a fixture for the second U18 team. The Build N data model (groupId+sideId)
 * and the group-aware importer existed, but the canonical server-backed add
 * modal and the importer were reachable only from Overview quick actions;
 * Club Admin offered a legacy device-local row with no Team field, and the
 * Fixtures screen's own add button opened a device-local form that never
 * reached the server and never stamped the group.
 *
 * Pinned here, behaviourally: the modal's Team field is a REAL selector of
 * the operating group's active teams; the save posts the operating group and
 * the chosen team to the canonical API; the Fixtures screen and Club Admin
 * both route creation/import through the canonical paths.
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
const fn = n => extractFn(html, n);

const U18_SIDES = [
  { id: 'team_u18_1', name: 'U18 First' },
  { id: 'team_u18_2', name: 'U18 Second' },
];

// ── The add modal, rendered for real ───────────────────────────────────────
function openModal({ sides = U18_SIDES, canManage = true } = {}) {
  const scope = new Function('cfg', `
    "use strict";
    function canI() { return cfg.canManage; }
    function showToast(t) { throw new Error('TOAST:' + t); }
    function ensureMatchCentreTeams() {}
    function matchCentreSides() { return cfg.sides; }
    function esc(s) { return String(s == null ? '' : s); }
    let captured = null;
    const document = {
      getElementById: () => null,
      createElement: () => ({ style: {}, set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } }),
      body: { appendChild() {} },
    };
    function setTimeout() {}
    ${fn('fixtureAddOpen')}
    fixtureAddOpen();
    return captured;
  `)({ sides, canManage });
  return scope;
}

test('the Team field is a VISIBLE selector carrying the operating group\'s real teams', () => {
  const out = openModal();
  assert.ok(/<select id="fx-team"/.test(out), 'a real select, not a hidden datalist');
  assert.ok(out.includes('U18 First'), 'first team offered');
  assert.ok(out.includes('U18 Second'), 'second team offered — the one the user could not choose');
  assert.ok(out.includes('— No team —'), 'a fixture may still belong to no side');
});

test('a structureless club keeps the free-text Team input', () => {
  const out = openModal({ sides: [] });
  assert.ok(/<input id="fx-team"/.test(out), 'free text remains for clubs without teams');
  assert.ok(!/<select id="fx-team"/.test(out));
});

test('teams are dynamic — whatever the group\'s active sides are, they appear', () => {
  const out = openModal({ sides: [{ id: 't1', name: 'Cadettes A' }, { id: 't2', name: 'Cadettes B' }] });
  assert.ok(out.includes('Cadettes A') && out.includes('Cadettes B'), 'nothing is hardcoded');
});

test('without manage_fixtures the modal refuses to open', () => {
  assert.throws(() => openModal({ canManage: false }), /TOAST:.*permission/i);
});

// ── The save posts the OPERATING group and the CHOSEN team, canonically ────
async function runSave({ gid = 'grp_u18', team = 'U18 Second', status = 200, body = { ok: true, fixture: { id: 'fx1' } } } = {}) {
  const scope = await new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: cfg.gid, fixtures: [] };
    let _fixtureAddBusy = false;
    const vals = { 'fx-opp': 'Kituro', 'fx-date': '2026-10-03', 'fx-time': '11:00',
                   'fx-ha': 'home', 'fx-team': cfg.team, 'fx-venue': 'Home', 'fx-comp': 'U18 League B',
                   'fx-arrive': '', 'fx-ref': '', 'fx-meet': '', 'fx-transport': '', 'fx-notes': '', 'fx-ext': '' };
    const document = { getElementById: id => id in vals ? { value: vals[id] } : { value: '', textContent: '', disabled: false, remove() {} } };
    let posted = null;
    function fetch(url, init) { posted = { url, body: JSON.parse(init.body) };
      return Promise.resolve({ ok: cfg.status === 200, status: cfg.status, json: async () => cfg.body }); }
    function showToast() {}
    function ceConfirm() { return Promise.resolve(false); }
    function loadFixturesFromServer() { return Promise.resolve(); }
    function saveState() {}
    function render() {}
    function renderCoachFixtures() {}
    ${fn('fixtureAddSave')}
    return fixtureAddSave().then(() => posted);
  `)({ gid, team, status, body });
  return scope;
}

test('operating U18 + choosing the second team → the canonical API gets groupId=U18 and team="U18 Second"', async () => {
  const posted = await runSave();
  assert.ok(posted.url.includes('resource=fixtures'), 'the canonical fixtures API');
  assert.equal(posted.body.action, 'create');
  assert.equal(posted.body.groupId, 'grp_u18', 'the operating group is stamped automatically');
  assert.equal(posted.body.fixture.team, 'U18 Second', 'the chosen side travels with the write');
});

test('operating U18 + choosing the first team → same group, first side', async () => {
  const posted = await runSave({ team: 'U18 First' });
  assert.equal(posted.body.groupId, 'grp_u18');
  assert.equal(posted.body.fixture.team, 'U18 First');
});

test('operating Seniors → the Seniors group is stamped', async () => {
  const posted = await runSave({ gid: 'grp_initial', team: '' });
  assert.equal(posted.body.groupId, 'grp_initial');
  assert.equal(posted.body.fixture.team, '', 'no team chosen stays honestly team-less');
});

test('a legacy single-group club (no operating group) omits groupId — the server single-defaults', async () => {
  const posted = await runSave({ gid: '' });
  assert.ok(!('groupId' in posted.body), 'nothing invented client-side');
});

// ── Both screens route creation through the canonical path ─────────────────

test('the Fixtures screen\'s add buttons open the SERVER-BACKED modal, not the device-local form', () => {
  const screen = fn('renderCoachFixtures');
  assert.ok(screen.includes('onclick="fixtureAddOpen()"'), 'header add is canonical');
  assert.ok(!screen.includes('onclick="fixtureCreateNew()"'),
    'the device-local creation entry (no server write, no groupId) is no longer offered');
});

test('the Fixtures screen offers import, gated on manage_fixtures', () => {
  const screen = fn('renderCoachFixtures');
  assert.ok(screen.includes("fixtureImportOpen('csv')"), 'CSV import');
  assert.ok(screen.includes("fixtureImportOpen('xlsx')"), 'Excel import');
  const gate = screen.indexOf("canI('manage_fixtures')");
  assert.ok(gate > -1 && gate < screen.indexOf("fixtureImportOpen('csv')"), 'behind the permission');
});

// ── The EDIT form, rendered for real: it must remember the fixture's team ──
function renderEditForm({ team = 'U18 Second', sideId = 'team_u18_2' } = {}) {
  const FIXTURE = { id: 'fx_e', opposition: 'Kituro', date: '2026-10-03', groupId: 'grp_u18',
                    sideId, team, competition: 'U18 League B' };
  const body =
    '"use strict";\n' +
    'const state = { operationalGroupId: "grp_u18", fixtures: [' + JSON.stringify(FIXTURE) + '],\n' +
    '  players: [], squadSelections: [], fixtureAvailability: {} };\n' +
    'const _adminData = { structure: { groups: [{ id: "grp_u18", name: "U18", status: "active" }],\n' +
    '  teams: ' + JSON.stringify(U18_SIDES.map(t => ({ ...t, groupId: 'grp_u18', status: 'active' }))) + ' } };\n' +
    'function operationalGroups() { return [{ id: "grp_u18", name: "U18" }]; }\n' +
    'let _fixtureFilter = "all", _fixtureCompFilter = "", _fixtureEditId = "fx_e", _fixtureDraft = {}, _fxAvailBoardId = null;\n' +
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
    fn('fixtureBelongsToGroup') + '\n' + fn('contextFixtures') + '\n' +
    fn('normalizeFixture') + '\n' + fn('fixtureSortByDate') + '\n' +
    fn('fixtureHasBeenPlayed') + '\n' + fn('fixtureDisplayStatus') + '\n' +
    fn('fixtureCountdown') + '\n' + fn('fixtureTypeStyle') + '\n' +
    fn('mcSideRank') + '\n' + fn('matchCentreSides') + '\n' + fn('fixtureTeamLabel') + '\n' +
    fn('playerIsArchived') + '\n' + fn('activeRosterPlayers') + '\n' +
    fn('positionSlotNumber') + '\n' + fn('fixturePositionWarnings') + '\n' +
    fn('fixtureAvailabilitySummary') + '\n' +
    fn('normalizeFixture').replace('function normalizeFixture', 'function _nf2') + '\n' +
    '_fixtureDraft = { ...normalizeFixture(state.fixtures[0]) };\n' +
    fn('renderCoachFixtures') + '\n' +
    'renderCoachFixtures();\n' +
    'return el.innerHTML;\n';
  return new Function(body)();
}
function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (closer) { let d = 0; while (i < source.length) { if (source[i] === opener) d++;
    else if (source[i] === closer) { d--; if (!d) { i++; break; } } i++; } }
  else { while (i < source.length && source[i] !== ';') i++; i++; }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

test('EDIT: the form remembers which team the fixture already has — U18 Second stays selected', () => {
  const out = renderEditForm();
  const m = out.match(/<option value="U18 Second"[^>]*>/);
  assert.ok(m, 'the second team is offered');
  assert.match(m[0], / selected/, "the fixture's own team is pre-selected");
  const first = out.match(/<option value="U18 First"[^>]*>/);
  assert.doesNotMatch(first[0], / selected/, 'and only that team');
});

test('EDIT: free text that matches no side keeps the text input with its value', () => {
  const out = renderEditForm({ team: 'Barbarians Select', sideId: '' });
  assert.ok(/<input id="fx-team"[^>]*value="Barbarians Select"/.test(out), 'free text preserved, not lost to a select');
});

test('the edit form still keeps a canonical sideId only while the name matches (Build N rule intact)', () => {
  const save = fn('fixtureSaveForm');
  assert.ok(save.includes('sameName ? keep : '), 'stale side ids are still dropped on rename');
});

test('the import empty-Team default remains group-aware (Build P rule intact)', () => {
  assert.ok(html.includes("defaultTeam: (state.operationalGroupId && operationalGroups().length) ? '' : (state.teamName || '')"),
    'a U18 import row without a Team cell never inherits the club-wide Seniors name');
});
