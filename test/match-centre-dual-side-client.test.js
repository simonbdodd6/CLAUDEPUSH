/**
 * Match Centre — DUAL SIDES, client behaviour.
 *
 * The working context is fixture + SIDE. Switching side flushes the outgoing
 * sheet to its own key, clears locally, and hydrates the incoming side —
 * stale-guarded on both dimensions. The candidate pool and availability stay
 * side-blind (one Seniors pool, one set of fixture answers), and the
 * duplicate indicator warns without ever mutating the sibling sheet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  const isAsync = src.slice(Math.max(0, start - 6), start) === 'async ';
  return (isAsync ? 'async ' : '') + src.slice(start, end + 1);
}

const MONS = 'fx_aug22', AMSTEL = 'fx_aug29';
const PREM = 'team_premier', DEV = 'team_dev';
const FIXTURES = [
  { id: MONS,   opposition: 'Mons',         date: '2026-08-22' },
  { id: AMSTEL, opposition: 'Amstelveense', date: '2026-08-29' },
];
const STRUCTURE = {
  groups: [{ id: 'grp_seniors', name: 'Seniors', status: 'active' }],
  teams: [
    { id: PREM, groupId: 'grp_seniors', name: 'Premier',             status: 'active' },
    { id: DEV,  groupId: 'grp_seniors', name: 'Premier Development', status: 'active' },
  ],
};

/** In-memory fixture+side server, with optional held responses. */
function makeServer() {
  const drafts = new Map();   // `${fx}|${side}` → draft
  const squads = new Map();
  const log = [];
  const holds = new Map();
  const ok = data => ({ ok: true, json: async () => data });
  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    log.push({ url: u, body: options.body ? JSON.parse(options.body) : null });
    for (const [needle, gate] of holds) { if (u.includes(needle)) await gate; }
    const params = new URLSearchParams(u.split('?')[1] || '');
    const keyOf = (fx, side) => `${fx || ''}|${side || ''}`;
    if ((options.method || 'GET') === 'POST' && u.startsWith('/api/publish')) {
      const b = JSON.parse(options.body);
      const k = keyOf(b.data.fixtureId, b.data.sideId);
      if (b.type === 'draft') drafts.set(k, structuredClone(b.data));
      if (b.type === 'squad') squads.set(k, structuredClone(b.data));
      return ok({ ok: true });
    }
    if (u.startsWith('/api/publish?type=draft')) {
      return ok({ ok: true, draft: drafts.get(keyOf(params.get('fixture'), params.get('side'))) || null });
    }
    if (u.startsWith('/api/publish?type=squad')) {
      return ok({ ok: true, squad: squads.get(keyOf(params.get('fixture'), params.get('side'))) || null });
    }
    return ok({ ok: true });
  };
  return { drafts, squads, log, holds, fetchImpl };
}

function client(server) {
  const state = {
    matchCentre: {}, fixtures: FIXTURES, formationNames: {}, benchPlayers: [],
    fphotoIds: {}, operationalGroupId: 'grp_seniors',
  };
  const calls = { toasts: [], saves: 0, renders: 0 };
  return new Function(`
    const state = arguments[0];
    const calls = arguments[1];
    const fetch = arguments[2];
    const _adminData = { structure: arguments[3] };
    function showToast(m) { calls.toasts.push(m); }
    function saveState() { calls.saves++; }
    function render() { calls.renders++; }
    function esc(v) { return String(v == null ? '' : v); }
    function isCoach() { return true; }
    let _coachDraftSaveTimer = null;
    let _mcOtherSide = null;
    ${fn('matchCentreSides')}
    ${fn('matchCentreSidesActive')}
    ${fn('matchCentreSideId')}
    ${fn('matchCentreSelectedSide')}
    ${fn('mcOtherSideNames')}
    ${fn('mcLoadOtherSideSelections')}
    // Fixture group context (3-group foundation): the real helpers, with no
    // operational context — the unfiltered legacy mode every prior pin assumes.
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    function operationalGroups() { return []; }
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    ${fn('matchCentreFixtureList')}
    ${fn('mcFixtureDateLabel')}
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    ${fn('matchCentreHasSquadWork')}
    ${fn('saveCoachDraft')}
    ${fn('mcFlushDraftNow')}
    ${fn('mcApplyFixtureDisplay')}
    ${fn('mcClearFixtureDisplay')}
    ${fn('mcHydrateSelectedFixture')}
    ${fn('mcRefreshPublishedForFixture')}
    ${fn('setMatchCentreFixture')}
    ${fn('setMatchCentreSide')}
    ${fn('matchCentreFixturePicker')}
    return { state, calls,
             matchCentreSideId, matchCentreSelectedSide, setMatchCentreSide,
             setMatchCentreFixture, matchCentreFixturePicker, matchCentreFixtureId,
             otherNames: () => mcOtherSideNames() };
  `)(state, calls, server.fetchImpl, STRUCTURE);
}

const settle = () => new Promise(r => setTimeout(r, 25));

// ── SELECTOR + DEFAULT ─────────────────────────────────────────────────────
test('the side selector renders both teams in the always-visible picker', () => {
  const c = client(makeServer());
  const html = c.matchCentreFixturePicker();
  assert.match(html, /mc-side-btn on[^>]*aria-pressed="true"[^>]*>Premier</, 'Premier default-selected');
  assert.match(html, /Premier Development</, 'both sides offered');
  // And structurally: the picker renders inside the mc10 header, never a
  // beta-hidden grid (pinned once for the fixture picker; the side control
  // lives inside the same picker markup).
  assert.match(src, /matchCentreFixturePicker\(\)\}\s*<\/div>/, 'picker in the header block');
});

test('the default side is deterministic and a foreign remembered side is ignored', () => {
  const c = client(makeServer());
  assert.equal(c.matchCentreSideId(), PREM, 'first active group team as explicit UI default');
  c.state.matchCentre.sideId = 'team_of_another_group';
  assert.equal(c.matchCentreSideId(), PREM, 'unknown stored side never resolves');
  c.state.matchCentre.sideId = DEV;
  assert.equal(c.matchCentreSideId(), DEV, 'a valid remembered side is honoured');
});

test('with one active team (or no structure) the side dimension is OFF', () => {
  const single = { groups: STRUCTURE.groups, teams: [STRUCTURE.teams[0]] };
  const c = new Function(`
    const state = { matchCentre: {}, operationalGroupId: 'grp_seniors' };
    const _adminData = { structure: arguments[0] };
    ${fn('matchCentreSides')}
    ${fn('matchCentreSidesActive')}
    ${fn('matchCentreSideId')}
    return { sides: matchCentreSidesActive(), id: matchCentreSideId() };
  `)(single);
  assert.deepEqual(c.sides, [], 'single-team clubs stay sideless');
  assert.equal(c.id, '', 'and no side id is ever invented');
});

// ── SWITCH ISOLATION — Premier A/X ↔ Dev B/Y ─────────────────────────────
test('Premier and Development sheets never contaminate each other', async () => {
  const server = makeServer();
  const c = client(server);
  c.setMatchCentreFixture(MONS); await settle();

  c.state.formationNames = { 1: 'Premier A' };
  c.state.benchPlayers   = ['Premier X'];
  c.setMatchCentreSide(DEV);
  assert.deepEqual(c.state.formationNames, {}, 'Premier sheet did NOT travel — not even before hydrate');
  await settle();
  c.state.formationNames = { 1: 'Dev B' };
  c.state.benchPlayers   = ['Dev Y'];

  c.setMatchCentreSide(PREM); await settle();
  assert.deepEqual(c.state.formationNames, { 1: 'Premier A' }, 'Premier restored exactly');
  assert.deepEqual(c.state.benchPlayers, ['Premier X']);

  c.setMatchCentreSide(DEV); await settle();
  assert.deepEqual(c.state.formationNames, { 1: 'Dev B' });
  assert.deepEqual(c.state.benchPlayers, ['Dev Y']);

  assert.equal(server.drafts.get(`${MONS}|${PREM}`).formationNames[1], 'Premier A');
  assert.equal(server.drafts.get(`${MONS}|${DEV}`).formationNames[1], 'Dev B');
});

test('the outgoing flush files the sheet under the OUTGOING side', async () => {
  const server = makeServer();
  const c = client(server);
  c.setMatchCentreFixture(MONS); await settle();
  c.state.formationNames = { 1: 'Premier A' };
  c.setMatchCentreSide(DEV); await settle();
  const flush = server.log.find(l => l.body?.type === 'draft' && l.body.data.formationNames?.[1] === 'Premier A');
  assert.ok(flush, 'the Premier sheet was saved');
  assert.equal(flush.body.data.sideId, PREM, 'under the Premier key — never the incoming side');
  assert.equal(flush.body.data.fixtureId, MONS);
});

test('four-way isolation across fixture × side', async () => {
  const server = makeServer();
  const c = client(server);
  const combos = [
    [MONS, PREM, 'MP'], [MONS, DEV, 'MD'], [AMSTEL, PREM, 'AP'], [AMSTEL, DEV, 'AD'],
  ];
  for (const [fx, side, name] of combos) {
    c.setMatchCentreFixture(fx); await settle();
    c.setMatchCentreSide(side); await settle();
    c.state.formationNames = { 1: name };
  }
  for (const [fx, side, name] of combos.reverse()) {
    c.setMatchCentreFixture(fx); await settle();
    c.setMatchCentreSide(side); await settle();
    assert.deepEqual(c.state.formationNames, { 1: name }, `${fx}+${side} restored exactly`);
  }
});

test('a slow response for the OLD side cannot hydrate the new one', async () => {
  const server = makeServer();
  server.drafts.set(`${MONS}|${PREM}`, { fixtureId: MONS, sideId: PREM, formationNames: { 1: 'Premier A' }, benchPlayers: [] });
  server.drafts.set(`${MONS}|${DEV}`,  { fixtureId: MONS, sideId: DEV,  formationNames: { 1: 'Dev B' },     benchPlayers: [] });
  const c = client(server);
  let release; server.holds.set(`side=${PREM}`, new Promise(r => { release = r; }));

  c.setMatchCentreFixture(MONS);         // hydrates Premier — held
  c.setMatchCentreSide(DEV); await settle();
  assert.deepEqual(c.state.formationNames, { 1: 'Dev B' }, 'Development loaded');
  release(); await settle();
  assert.deepEqual(c.state.formationNames, { 1: 'Dev B' },
    'the stale Premier reply was discarded — rapid switching is safe');
  assert.equal(c.matchCentreSideId(), DEV);
});

// ── SHARED POOL + SHARED AVAILABILITY (side-blind by construction) ────────
test('the candidate pool and availability are computed WITHOUT the side', () => {
  const body = fn('renderMatchday');
  const poolDecl = body.slice(body.indexOf('const matchdayPlayers'), body.indexOf('const selected'));
  assert.doesNotMatch(poolDecl, /side/i, 'the Seniors pool is never side-filtered');
  const availDecl = body.slice(body.indexOf('const gameRows'), body.indexOf('const availCount'));
  assert.doesNotMatch(availDecl, /side/i, 'availability rows come from the FIXTURE only');
  assert.match(body, /mcFx \? sessionRows\(String\(mcFx\.id\)\)/, 'unchanged fixture-scoped source');
});

test('switching side writes no availability and no appearance history', () => {
  const body = fn('setMatchCentreSide');
  assert.doesNotMatch(body, /avail|squadSelections|appearance/i, 'view + draft plumbing only');
});

// ── DUPLICATE INDICATOR — visible, never mutating ─────────────────────────
test('the other side\'s names surface only for the exact fixture+side context', () => {
  const api = new Function(`
    const state = { matchCentre: { fixtureId: '${MONS}', sideId: '${DEV}' }, fixtures: ${JSON.stringify(FIXTURES)},
                    operationalGroupId: 'grp_seniors' };
    const _adminData = { structure: ${JSON.stringify(STRUCTURE)} };
    let _mcOtherSide = arguments[0];
    ${fn('matchCentreSides')}
    ${fn('matchCentreSidesActive')}
    ${fn('matchCentreSideId')}
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    ${fn('mcOtherSideNames')}
    return mcOtherSideNames();
  `);
  assert.deepEqual([...api({ fixtureId: MONS, sideId: DEV, teamName: 'Premier', names: ['Player X'] })],
    ['Player X'], 'matching context: names surface');
  assert.deepEqual([...api({ fixtureId: AMSTEL, sideId: DEV, teamName: 'Premier', names: ['Player X'] })],
    [], 'another fixture\'s data never leaks in');
  assert.deepEqual([...api({ fixtureId: MONS, sideId: PREM, teamName: 'Dev', names: ['Player X'] })],
    [], 'data fetched for another side context is ignored');
  assert.deepEqual([...api(null)], [], 'no data, no warning');
});

test('the duplicate warning renders without touching either sheet', () => {
  const body = fn('renderMatchday');
  assert.match(body, /mc-dup-warn/, 'a visible warning strip exists');
  assert.match(body, /Also selected for/, 'and says which team');
  assert.match(body, /nothing has been changed on either sheet/i, 'explicitly non-mutating');
  assert.match(body, /mc7-alsotag/, 'candidate rows carry the indicator too');
  // The WHOLE warning template — from the interpolation opening to the board
  // markup — must be write-free, so a mutation cannot hide a sheet write
  // before the class-name literal.
  const warnBlock = body.slice(body.indexOf('_placedDupes.length ?'), body.indexOf('mcx2-board'));
  assert.doesNotMatch(warnBlock, /state\.formationNames\s*\[?[^=]*=[^=]|state\.benchPlayers\s*\[?[^=]*=[^=]/,
    'the warning never writes the sheet');
});

// ── PANELS, CONFIRMATION, EXPORT — all name the side ──────────────────────
test('the drafts panel filters by fixture AND side', () => {
  const body = fn('mcComparePanelHTML');
  assert.match(body, /String\(d\.sideId \|\| ''\) === selectedSide/, 'side filter present');
  assert.match(fn('mcViewCoachDraft'), /sideId \|\| ''\) === selectedSide/, 'View resolves the same record');
});

test('publish confirmation names the team, never a generic squad', () => {
  const body = fn('publishSquad');
  assert.match(body, /the \$\{side\.name\} squad/, 'e.g. "Publish the Premier squad for Mons?"');
  assert.match(body, /Publish \$\{side\.name\}/, 'and the button names it too');
});

test('the export filename and pitch tag identify the side', () => {
  assert.match(fn('exportFormation'), /_sideSlug/, 'boitsfort-premier-vs-mons-…');
  assert.match(fn('renderMatchday'), /mc-pitch-sidetag/, 'the exported pitch carries a side label');
});

test('draft and squad payloads always carry the side', () => {
  assert.match(fn('saveCoachDraft'), /sideId: matchCentreSideId\(\)/);
  assert.match(fn('syncSquadToServer'), /sideId: matchCentreSideId\(\)/);
});

// ── PLAYER MULTI-SHEET UI ─────────────────────────────────────────────────
test('the player view renders one labelled card per published sheet', () => {
  assert.match(src, /state\.playerPublishedSheets \|\| \[\]\)\.length/, 'multi-sheet branch exists');
  assert.match(src, /renderPublishedTeamSheetCard\(player, sh\)/, 'one card per sheet');
  const card = fn('renderPublishedTeamSheetCard');
  assert.match(card, /teamName \? .*Published/, 'each card is badged with its team name');
  assert.match(card, /sheet \? \(sheet\.squad/, 'and reads only its own sheet\'s data');
});

// ── PLAYER HOME — the summary understands EVERY published sheet ───────────
test('the home summary consumes publishedSheets, before any legacy source', () => {
  const body = fn('renderPlayerHome');
  const sheetBranch = body.indexOf('pubSheets.length');
  const legacyBranch = body.indexOf('pubSels.length === 0');
  assert.ok(sheetBranch > 0, 'multi-sheet branch exists');
  assert.ok(sheetBranch < legacyBranch, 'and is checked FIRST — two sheets can never blank the card');
  assert.match(body, /pubSheets\.map\(sh =>/, 'every sheet is evaluated');
  assert.match(body, /getPlayerSquadStatus\(player,\s*\n?\s*sh\.squad/, 'status computed per sheet');
});

test('the home summary never picks an arbitrary first sheet', () => {
  const body = fn('renderPlayerHome');
  const block = body.slice(body.indexOf('pubSheets.length'), body.indexOf('} else if (pubSels'));
  assert.doesNotMatch(block, /pubSheets\[0\]|sheets\[0\]|rows\[0\]/,
    'no first-array-entry semantics anywhere in the sheet card');
  assert.match(block, /selectedIn/, 'the sheets the player is IN drive the card');
  assert.match(block, /Not selected/, 'not-selected stays honest');
  assert.match(block, /publishedNames/, 'and still names what IS published');
});

test('selected in both sides renders BOTH rows, each with its team label', () => {
  const body = fn('renderPlayerHome');
  const block = body.slice(body.indexOf('pubSheets.length'), body.indexOf('} else if (pubSels'));
  assert.match(block, /selectedIn\.map\(line\)/, 'one row per side the player is selected in');
  assert.match(block, /r\.sh\.teamName/, 'each row is labelled with its own team');
});

// ── SIDE SELECTOR — no roster-management dependency ───────────────────────
test('the side selector data path does not require the admin structure read', () => {
  const sides = fn('matchCentreSides');
  assert.match(sides, /_mcTeams/, 'the minimal scoped read is preferred');
  const loader = fn('ensureMatchCentreTeams');
  assert.match(loader, /resource=matchday-teams/, 'served by the Match-Centre-gated endpoint');
  assert.doesNotMatch(loader, /manage_players|ensureAdminData/, 'no roster-admin dependency');
  assert.match(fn('renderMatchday'), /ensureMatchCentreTeams\(\)/, 'loaded for every coach');
});

test('scoped team metadata still respects the operational group client-side', () => {
  const api = new Function(`
    const state = { operationalGroupId: arguments[1] };
    let _mcTeams = arguments[0];
    ${fn('matchCentreSides')}
    return matchCentreSides();
  `);
  const teams = { groups: [{ id: 'g1', name: 'Seniors' }, { id: 'g2', name: 'U18' }],
    teams: [
      { id: 't1', name: 'Premier', groupId: 'g1' }, { id: 't2', name: 'Dev', groupId: 'g1' },
      { id: 't3', name: 'U18 XV', groupId: 'g2' },
    ] };
  assert.deepEqual(api(teams, 'g1').map(t => t.id), ['t1', 't2'], 'Seniors context: Seniors teams');
  assert.deepEqual(api(teams, 'g2').map(t => t.id), ['t3'], 'U18 context: U18 team only');
  assert.deepEqual(api(teams, ''), [], 'several groups, no context: never guessed');
  assert.deepEqual(api({ groups: [{ id: 'g1', name: 'Seniors' }], teams: teams.teams.filter(t => t.groupId === 'g1') }, '')
    .map(t => t.id), ['t1', 't2'], 'one group is unambiguous');
});

test('reminders stay fixture-level — side switching adds no reminder state', () => {
  assert.doesNotMatch(fn('remindFixtureNonResponders'), /side/i,
    'the reminder path is side-blind: same fixture, same non-responders');
  assert.doesNotMatch(fn('setMatchCentreSide'), /remind/i);
});
