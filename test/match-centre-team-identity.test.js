/**
 * MATCH CENTRE — WHICH TEAM AM I PICKING?
 *
 * Three faults, one theme: the Match Centre knew which side was selected but
 * did not make it explicit, default it sensibly, or bind the sheet to it.
 *
 *   A. DEFAULT ORDER. Sides were listed in raw structure order and the default
 *      was sides[0]. Boitsfort stores Seniors as ["Premier development",
 *      "Premier"] — team_initial was the club's original auto-created team,
 *      later renamed — so the DEFAULT TEAM WAS PREMIER DEVELOPMENT. Insertion
 *      order decided which side a coach picked for.
 *
 *   B. IDENTITY. The <h1> is the fixture, identical for both sides. The team
 *      name appeared only in 12.5px buttons and an 11px pill on the pitch.
 *
 *   C. BINDING. `_mcSheetFixtureId` bound the sheet to its fixture and the save
 *      refused anything else. There was no side equivalent: saveCoachDraft
 *      stamped `sideId: matchCentreSideId()` evaluated AT SAVE TIME, so a sheet
 *      built under one side could be filed under another if the effective side
 *      changed underneath it — which it can, because matchCentreSideId() falls
 *      back to sides[0] and the sides list arrives asynchronously.
 *
 * These pin all three. The ordering rule is deliberately narrow: a development
 * side ranks after its senior counterpart, everything else keeps stored order.
 * It is presentation only — eligibility, permissions and group scoping are
 * untouched, and the server still decides what a side may do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const m = src.match(new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`));
  assert.ok(m, `${name} exists`);
  const start = src.indexOf(m[0]);
  let d = 0, pe = start;
  for (let b = src.indexOf('(', start); b < src.length; b++) {
    if (src[b] === '(') d++; else if (src[b] === ')') { d--; if (!d) { pe = b; break; } } }
  let e = src.indexOf('{', pe); d = 0;
  for (let b = e; b < src.length; b++) {
    if (src[b] === '{') d++; else if (src[b] === '}') { d--; if (!d) { e = b; break; } } }
  return src.slice(start, e + 1);
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// The EXACT production shape: Seniors stored development-first.
const SEN = 'grp_initial', U18G = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b', U16G = 'grp_402a580b';
const TEAMS = [
  { id: 'team_initial',  name: 'Premier development',          groupId: SEN,  status: 'active' },
  { id: 'team_f9113560', name: 'Premier',                      groupId: SEN,  status: 'active' },
  { id: 'team_158989ae', name: 'U18 Premier',                  groupId: U18G, status: 'active' },
  { id: 'team_85cea88e', name: 'U18 Premier Development',      groupId: U18G, status: 'active' },
  { id: 'team_8ec72f63', name: "Women's Premier",              groupId: WOM,  status: 'active' },
  { id: 'team_2bfdba0b', name: "Women's Premier Development",  groupId: WOM,  status: 'active' },
  { id: 'team_ef1af39d', name: 'Premier',                      groupId: U16G, status: 'active' },
  { id: 'team_4287973d', name: 'development',                  groupId: U16G, status: 'active' },
  { id: 'team_gone',     name: 'Old Boys',                     groupId: SEN,  status: 'archived' },
];
const GROUPS = [
  { id: SEN, name: 'Seniors', status: 'active' }, { id: U18G, name: 'U18', status: 'active' },
  { id: WOM, name: "Women's", status: 'active' }, { id: U16G, name: 'U16', status: 'active' },
];
const STRUCTURE = { groups: GROUPS, teams: TEAMS };
const MC_TEAMS = { groups: GROUPS.map(g => ({ id: g.id, name: g.name })),
                   teams: TEAMS.filter(t => t.status === 'active')
                               .map(t => ({ id: t.id, name: t.name, groupId: t.groupId })) };

function sideScope({ mcTeams = MC_TEAMS, structure = STRUCTURE, storedSideId = '', gid = SEN } = {}) {
  const state = { operationalGroupId: gid, matchCentre: { sideId: storedSideId } };
  return new Function('state', '_mcTeams', '_adminData', `
    ${fn('mcSideRank')}
    ${fn('matchCentreSides')}
    ${fn('matchCentreSidesActive')}
    ${fn('matchCentreSideId')}
    ${fn('matchCentreSelectedSide')}
    return { mcSideRank, matchCentreSides, matchCentreSidesActive,
             matchCentreSideId, matchCentreSelectedSide };
  `)(state, mcTeams, structure ? { structure } : {});
}

// ════ A — DEFAULT TEAM ORDER ═══════════════════════════════════════════════

test('A1: Seniors lists Premier FIRST and Premier Development second', () => {
  const s = sideScope();
  assert.deepEqual(s.matchCentreSidesActive().map(t => t.name),
    ['Premier', 'Premier development'],
    'the segmented buttons and the sides[0] default both read this order');
});

test('A2: the DEFAULT selected side is Premier', () => {
  const s = sideScope();
  assert.equal(s.matchCentreSideId(), 'team_f9113560');
  assert.equal(s.matchCentreSelectedSide().name, 'Premier',
    'a coach who picks without choosing a side is picking Premier');
});

test('A3: the order does not depend on insertion order or ids', () => {
  // Same teams, reversed in storage: the answer must not move.
  const reversed = { ...MC_TEAMS, teams: [...MC_TEAMS.teams].reverse() };
  const s = sideScope({ mcTeams: reversed });
  assert.deepEqual(s.matchCentreSidesActive().map(t => t.name), ['Premier', 'Premier development']);
  assert.equal(s.matchCentreSelectedSide().name, 'Premier');
});

test('A4: a remembered VALID side is still honoured over the default', () => {
  const s = sideScope({ storedSideId: 'team_initial' });
  assert.equal(s.matchCentreSelectedSide().name, 'Premier development',
    'an explicit human choice always wins');
  const gone = sideScope({ storedSideId: 'team_that_never_existed' });
  assert.equal(gone.matchCentreSelectedSide().name, 'Premier',
    'an unusable stored id falls back to the DEFAULT, which is now Premier');
});

test('A5: other groups keep a correct order — nothing else is reordered wrongly', () => {
  assert.deepEqual(sideScope({ gid: U18G }).matchCentreSidesActive().map(t => t.name),
    ['U18 Premier', 'U18 Premier Development']);
  assert.deepEqual(sideScope({ gid: WOM }).matchCentreSidesActive().map(t => t.name),
    ["Women's Premier", "Women's Premier Development"]);
  assert.deepEqual(sideScope({ gid: U16G }).matchCentreSidesActive().map(t => t.name),
    ['Premier', 'development'], 'a bare "development" also ranks second');
});

test('A6: the rank rule is narrow, stable and never matches a lookalike word', () => {
  const { mcSideRank } = sideScope();
  assert.equal(mcSideRank({ name: 'Premier' }), 0);
  assert.equal(mcSideRank({ name: 'Premier development' }), 1);
  assert.equal(mcSideRank({ name: 'DEVELOPMENT XV' }), 1, 'case-insensitive');
  assert.equal(mcSideRank({ name: 'Dev' }), 1, 'the common short form');
  assert.equal(mcSideRank({ name: 'Devon Exiles' }), 0, '"Dev" inside a word is NOT a development side');
  assert.equal(mcSideRank({ name: 'Development' }), 1);
  assert.equal(mcSideRank({ name: '' }), 0, 'an unnamed team is never demoted');
  assert.equal(mcSideRank({}), 0);
  // Equal ranks keep stored order (stable sort).
  const two = { ...MC_TEAMS, teams: [
    { id: 'a', name: 'Alpha', groupId: SEN }, { id: 'b', name: 'Bravo', groupId: SEN }] };
  assert.deepEqual(sideScope({ mcTeams: two }).matchCentreSidesActive().map(t => t.name),
    ['Alpha', 'Bravo'], 'ties are NOT alphabetised — stored order is preserved');
});

test('A7: archived teams and the single-team case are unchanged', () => {
  assert.equal(sideScope().matchCentreSidesActive().some(t => t.name === 'Old Boys'), false,
    'archived teams never appear');
  const one = { ...MC_TEAMS, teams: [{ id: 'solo', name: 'First XV', groupId: SEN }] };
  assert.deepEqual(sideScope({ mcTeams: one }).matchCentreSidesActive(), [],
    'a single-team group stays on the sideless path');
  assert.equal(sideScope({ mcTeams: one }).matchCentreSideId(), '');
});

// ════ B — THE TEAM HEADING ═════════════════════════════════════════════════

test('B1: a prominent team heading is rendered from the SELECTED side', () => {
  const body = strip(fn('renderMatchday'));
  assert.match(body, /<h2 class="mc-team-heading\$\{/, 'the heading element exists');
  assert.match(body, /mcSide \? esc\(mcSide\.name\) : 'Select a team'/,
    'it renders the selected side\'s real name, with a neutral state when none is resolved');
  assert.doesNotMatch(body.slice(body.indexOf('mc-team-heading'), body.indexOf('mc-team-heading') + 400),
    /'Premier'/, 'the heading is never hard-coded to a team name');
});

test('B2: the heading uses the SAME source of truth as the rest of Match Centre', () => {
  const body = strip(fn('renderMatchday'));
  assert.match(body, /const mcSide = matchCentreSelectedSide\(\);/,
    'one resolution per render, shared by heading, buttons and pitch tag');
  // Because there is exactly one mcSide per render, the heading cannot
  // disagree with the segmented control or the pitch tag.
  assert.equal((body.match(/matchCentreSelectedSide\(\)/g) || []).length, 1);
});

test('B3: switching side re-renders, so no stale heading can survive', () => {
  const sw = strip(fn('setMatchCentreSide'));
  assert.match(sw, /render\(\);/, 'a side switch always re-renders');
  const flushAt = sw.indexOf('mcFlushDraftNow()');
  const mutateAt = sw.indexOf('state.matchCentre =');
  assert.ok(flushAt > 0 && flushAt < mutateAt, 'and flushes the outgoing sheet BEFORE mutating');
});

test('B4: the heading is styled to be prominent, not a caption', () => {
  const css = src.slice(src.indexOf('.mc-team-heading'), src.indexOf('.mc-team-heading') + 600);
  assert.match(css, /text-transform:\s*uppercase/, 'uppercase, as specified');
  const size = css.match(/font-size:\s*([\d.]+)px/);
  assert.ok(size && Number(size[1]) >= 16, `heading font-size ${size?.[1]}px must be >= 16px`);
  assert.match(css, /font-weight:\s*(800|900)/, 'heavy weight');
});

// ════ C — THE SHEET IS BOUND TO ITS SIDE ═══════════════════════════════════

/** Drive the REAL saveCoachDraft with both bindings under our control. */
function saveScope({ sheetFixtureId, sheetSideId, currentFixtureId, currentSideId }) {
  const sent = [];
  const state = { matchCentre: { fixtureId: currentFixtureId, sideId: currentSideId },
                  formationNames: { 1: 'Someone' }, benchPlayers: [] };
  const build = new Function('state', '_mcSheetFixtureId', '_mcSheetSideId', 'sent', `
    let _coachDraftSaveTimer = null;
    function isCoach() { return true; }
    function matchCentreFixtureId() { return String(state.matchCentre.fixtureId || ''); }
    function matchCentreSideId() { return String(state.matchCentre.sideId || ''); }
    const fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true }; };
    ${fn('saveCoachDraft')}
    return saveCoachDraft;
  `);
  return { save: build(state, sheetFixtureId, sheetSideId, sent), sent };
}

test('C1: a Premier sheet saves as Premier', async () => {
  const { save, sent } = saveScope({ sheetFixtureId: 'fx1', sheetSideId: 'team_f9113560',
                                     currentFixtureId: 'fx1', currentSideId: 'team_f9113560' });
  await save();
  assert.equal(sent.length, 1, 'the save went through');
  assert.equal(sent[0].data.sideId, 'team_f9113560');
  assert.equal(sent[0].data.fixtureId, 'fx1');
});

test('C2: a Development sheet saves as Development', async () => {
  const { save, sent } = saveScope({ sheetFixtureId: 'fx1', sheetSideId: 'team_initial',
                                     currentFixtureId: 'fx1', currentSideId: 'team_initial' });
  await save();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.sideId, 'team_initial');
});

test('C3: THE DEFECT — a side mismatch BLOCKS the save', async () => {
  // The sheet was built under Premier; the effective side has since become
  // Premier Development (async sides load, or any other silent change).
  const { save, sent } = saveScope({ sheetFixtureId: 'fx1', sheetSideId: 'team_f9113560',
                                     currentFixtureId: 'fx1', currentSideId: 'team_initial' });
  await save();
  assert.equal(sent.length, 0,
    'a Premier sheet must never be filed under Premier Development');
});

test('C4: the reverse mismatch is blocked too', async () => {
  const { save, sent } = saveScope({ sheetFixtureId: 'fx1', sheetSideId: 'team_initial',
                                     currentFixtureId: 'fx1', currentSideId: 'team_f9113560' });
  await save();
  assert.equal(sent.length, 0, 'a Development sheet must never be filed under Premier');
});

test('C5: a TRANSITIONAL side (null) blocks the save, mirroring the fixture rule', async () => {
  const { save, sent } = saveScope({ sheetFixtureId: 'fx1', sheetSideId: null,
                                     currentFixtureId: 'fx1', currentSideId: 'team_f9113560' });
  await save();
  assert.equal(sent.length, 0,
    'a sheet whose side has not hydrated yet must not overwrite that side\'s stored draft');
});

test('C6: the fixture guard still works, unchanged', async () => {
  const wrong = saveScope({ sheetFixtureId: 'fx-other', sheetSideId: 'team_f9113560',
                            currentFixtureId: 'fx1', currentSideId: 'team_f9113560' });
  await wrong.save();
  assert.equal(wrong.sent.length, 0, 'a sheet bound to another fixture never saves');
  const trans = saveScope({ sheetFixtureId: null, sheetSideId: 'team_f9113560',
                            currentFixtureId: 'fx1', currentSideId: 'team_f9113560' });
  await trans.save();
  assert.equal(trans.sent.length, 0, 'a transitional fixture never saves');
});

test('C7: the sideless club (single team) still saves normally', async () => {
  const { save, sent } = saveScope({ sheetFixtureId: 'fx1', sheetSideId: '',
                                     currentFixtureId: 'fx1', currentSideId: '' });
  await save();
  assert.equal(sent.length, 1, 'no sides in play — unchanged behaviour');
  assert.equal(sent[0].data.sideId, '');
});

test('C8: the binding is set wherever the fixture binding is set', () => {
  for (const [name, expect] of [
    ['mcHydrateSelectedFixture', /_mcSheetSideId\s*= side;/],
    ['mcDetachFixture',          /_mcSheetSideId\s*= '';/],
    ['setMatchCentreSide',       /_mcSheetSideId\s*=/],
    ['setMatchCentreFixture',    /_mcSheetSideId\s*=/],
    ['loadCoachDraft',           /_mcSheetSideId\s*=/],
  ]) {
    assert.match(strip(fn(name)), expect, `${name} maintains the side binding`);
  }
  assert.match(src, /let _mcSheetSideId =/, 'the binding is declared');
});

test('C10: switching side leaves the sheet TRANSITIONAL until the new side hydrates', () => {
  // The cleared sheet must not be saveable in the window between switching and
  // hydrating, or it would overwrite the incoming side's stored draft with
  // emptiness — the exact failure the fixture binding was created to stop.
  const calls = [];
  const state = { matchCentre: { fixtureId: 'fx1', sideId: 'team_f9113560' },
                  formationNames: { 1: 'Someone' }, benchPlayers: [], fphotoIds: {} };
  const build = new Function('state', 'calls', `
    let _mcSheetSideId = 'team_f9113560';
    let _coachDraftSaveTimer = null;
    function matchCentreSidesActive() {
      return [{ id: 'team_f9113560', name: 'Premier' }, { id: 'team_initial', name: 'Premier development' }];
    }
    function matchCentreSideId() { return String(state.matchCentre.sideId || ''); }
    function matchCentreFixtureId() { return String(state.matchCentre.fixtureId || ''); }
    function mcFlushDraftNow() { calls.push('flush:' + matchCentreSideId()); }
    function saveState() {} function render() {} function showToast() {}
    function mcHydrateSelectedFixture() { calls.push('hydrate'); }
    ${fn('setMatchCentreSide')}
    return { setMatchCentreSide, binding: () => _mcSheetSideId };
  `);
  const app = build(state, calls);

  app.setMatchCentreSide('team_initial');
  assert.equal(calls[0], 'flush:team_f9113560',
    'the OUTGOING side is flushed first, under its own id');
  assert.equal(state.matchCentre.sideId, 'team_initial', 'and the side then changes');
  assert.equal(app.binding(), null,
    'the sheet is TRANSITIONAL — unsaveable until the incoming side hydrates');
  assert.ok(calls.includes('hydrate'), 'and hydration is kicked off');
  assert.deepEqual(state.formationNames, {}, 'the outgoing XV is cleared, not carried over');
});

test('C11: a side outside the group is refused outright', () => {
  const state = { matchCentre: { fixtureId: 'fx1', sideId: 'team_f9113560' } };
  const toasts = [];
  const app = new Function('state', 'toasts', `
    let _mcSheetSideId = 'team_f9113560';
    let _coachDraftSaveTimer = null;
    function matchCentreSidesActive() { return [{ id: 'team_f9113560', name: 'Premier' }]; }
    function matchCentreSideId() { return String(state.matchCentre.sideId || ''); }
    function matchCentreFixtureId() { return String(state.matchCentre.fixtureId || ''); }
    function mcFlushDraftNow() {} function saveState() {} function render() {}
    function showToast(m) { toasts.push(m); }
    function mcHydrateSelectedFixture() {}
    ${fn('setMatchCentreSide')}
    return { setMatchCentreSide, binding: () => _mcSheetSideId };
  `)(state, toasts);
  assert.equal(app.setMatchCentreSide('team_from_another_group'), false);
  assert.match(toasts[0] || '', /not in this group/);
  assert.equal(state.matchCentre.sideId, 'team_f9113560', 'the selection did not move');
  assert.equal(app.binding(), 'team_f9113560', 'and the binding did not move either');
});

test('C9: stale async hydration cannot overwrite a newly selected side', () => {
  const hyd = strip(fn('mcHydrateSelectedFixture'));
  assert.match(hyd, /const side = matchCentreSideId\(\);/, 'the side is captured at request time');
  assert.match(hyd, /matchCentreSideId\(\) !== side\) return;/,
    'a reply for the OLD side is discarded, never applied');
  assert.match(hyd, /draftSide === side/, 'and only that side\'s own stored draft may hydrate');
});

// ════ SCOPE — NOTHING ELSE MOVED ═══════════════════════════════════════════

test('D1: eligibility, permissions and group scoping are untouched by this change', () => {
  // The ordering helper is pure presentation: it reads only a team NAME.
  const rank = strip(fn('mcSideRank'));
  for (const banned of [/playerGroupId/, /isPlayingMember/, /eligib/i, /permission/i,
                        /accessScope/, /medical/i, /fetch\(/, /state\./]) {
    assert.doesNotMatch(rank, banned, `the rank helper must not reference ${banned}`);
  }
  // Sides are still filtered to the OPERATIONAL group only.
  const sides = strip(fn('matchCentreSides'));
  assert.match(sides, /state\.operationalGroupId/, 'still scoped to the operating group');
  assert.match(sides, /groupId/, 'still filtered by group');
  // A side outside the group is still refused.
  assert.match(strip(fn('setMatchCentreSide')), /not in this group/);
});

test('D2: a side from another group can never be selected or ordered in', () => {
  const s = sideScope({ gid: SEN });
  const ids = s.matchCentreSidesActive().map(t => t.id);
  assert.equal(ids.includes('team_158989ae'), false, 'no U18 team appears under Seniors');
  assert.equal(ids.includes('team_ef1af39d'), false, 'no U16 team appears under Seniors');
  assert.deepEqual(ids.sort(), ['team_f9113560', 'team_initial'].sort());
});
