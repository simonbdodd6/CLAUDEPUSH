/**
 * BUILD Y — Overview resolves the CANONICAL identities, for both bugs the
 * user reported while operating U18:
 *
 *  · FIXTURES: a U18-group fixture stamped with stale cross-group team text
 *    ("Seniors" — another group's identity, written by the pre-Build-P
 *    importer) must not be labelled Seniors on the U18 Overview. The fixture's
 *    own group context resolves the label: text matching an in-group team
 *    canonicalizes; provably cross-group stale text resolves to the group's
 *    DEFAULT side — the exact side the Match Centre already opens this
 *    side-less fixture on. Free text that contradicts nothing ("U18 2")
 *    stands. Reading labels never mutates the fixture.
 *
 *  · TRAINING: the Availability board's current-week event for a slot is
 *    slot.sessionId (legacy) or the DATED occurrence id. The Overview counted
 *    the bare schedule id instead — production U18 held 48 available under
 *    slot_msvh0skf_1-20260903 while bare `thu` held 1, and Overview said 1.
 *    The count now flows through the board's own identity rule.
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
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const fn = n => extractFn(html, n);

// ── FIXTURE LABELS ─────────────────────────────────────────────────────────
const SEN = 'grp_initial', U18 = 'grp_u18';
const STRUCTURE = {
  groups: [{ id: SEN, name: 'Seniors', status: 'active' }, { id: U18, name: 'U18', status: 'active' }],
  teams: [
    { id: 'team_sen_1', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18_dev', groupId: U18, name: 'U18 Premier Development', status: 'active' },
    { id: 'team_u18_1', groupId: U18, name: 'U18 Premier', status: 'active' },
  ],
};
function labeler({ structure = STRUCTURE, sides = [] } = {}) {
  return new Function('cfg', `
    "use strict";
    const _adminData = { structure: cfg.structure };
    const _mcTeams = null;
    function matchCentreSides() { return cfg.sides; }
    ${fn('mcSideRank')}
    ${fn('fixtureTeamLabel')}
    return fixtureTeamLabel;
  `)({ structure, sides });
}

test('THE BUG: a U18 fixture with stale "Seniors" text resolves to the group\'s default side', () => {
  const label = labeler();
  const fx = { id: 'fx_ande', groupId: U18, sideId: '', team: 'Seniors', opposition: 'ANDE' };
  assert.equal(label(fx), 'U18 Premier',
    'the side the Match Centre already opens this fixture on — never another group\'s name');
});

test('the default side is the FIRST-ranked team, not whichever is stored first', () => {
  // STRUCTURE deliberately lists Development before Premier; mcSideRank must decide.
  const label = labeler();
  assert.equal(label({ groupId: U18, sideId: '', team: 'Seniors' }), 'U18 Premier');
});

test('free text that contradicts nothing stands — "U18 2" stays "U18 2"', () => {
  const label = labeler();
  assert.equal(label({ groupId: U18, sideId: '', team: 'U18 2' }), 'U18 2');
});

test('a Seniors-group fixture keeps its "Seniors" text — its own group\'s name is not cross-group', () => {
  const label = labeler();
  assert.equal(label({ groupId: SEN, sideId: '', team: 'Seniors' }), 'Seniors');
});

test('text matching an IN-GROUP team canonicalizes its casing', () => {
  const label = labeler();
  assert.equal(label({ groupId: U18, sideId: '', team: 'u18 premier' }), 'U18 Premier');
});

test('another group\'s TEAM name is also cross-group stale text', () => {
  const label = labeler();
  assert.equal(label({ groupId: U18, sideId: '', team: 'Premier' }), 'U18 Premier',
    'the Seniors side name cannot label a U18 fixture');
});

test('sideId still wins over everything', () => {
  const label = labeler({ sides: [{ id: 'team_u18_dev', name: 'U18 Premier Development' }] });
  assert.equal(label({ groupId: U18, sideId: 'team_u18_dev', team: 'Seniors' }), 'U18 Premier Development');
});

test('no structure loaded → raw text (legacy clubs unchanged); no group → raw text', () => {
  const label = labeler({ structure: null });
  assert.equal(label({ groupId: U18, sideId: '', team: 'Seniors' }), 'Seniors');
  const l2 = labeler();
  assert.equal(l2({ sideId: '', team: 'Seniors' }), 'Seniors', 'a legacy no-group fixture is untouched');
});

test('READ-ONLY: labelling never mutates the fixture', () => {
  const label = labeler();
  const fx = { id: 'fx_ande', groupId: U18, sideId: '', team: 'Seniors' };
  const frozen = JSON.stringify(fx);
  label(fx);
  assert.equal(JSON.stringify(fx), frozen, 'display resolution writes nothing');
});

// ── TRAINING OCCURRENCE IDENTITY ───────────────────────────────────────────
function trainingWorld({ slots, players = [], resolved = {}, todayIso }) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: 'grp_u18', players: cfg.players, schedule: [{ id: 'thu', title: 'Training session 2' }] };
    function operationalPlayers() { return state.players; }
    let _resolvedAvailability = cfg.resolved;
    let _resolvedAvailabilityGroup = 'grp_u18';
    let _availLastSync = 'x';
    let _trainingSchedule = cfg.slots ? { slots: cfg.slots } : null;
    let _trainingScheduleGroupId = 'grp_u18';
    function ensureTrainingSchedule() {}
    function playerIsArchived() { return false; }
    function availToday() { return cfg.todayIso; }
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('tonightAvailabilityEventId')}
    ${fn('sessionKey')}
    ${fn('sessionReasonKey')}
    ${fn('normalizeSessionId')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('resolvedAnswerFor')}
    ${fn('sessionRows')}
    ${fn('overviewRoster') ? '' : ''}
    function overviewRoster() { return state.players; }
    ${fn('overviewAnswerMap')}
    ${fn('overviewAvailableCount')}
    return { mapId: id => tonightAvailabilityEventId(id), count: id => overviewAvailableCount(id) };
  `)({ slots, players, resolved, todayIso });
}
// today = Thursday 2026-09-03; week starts Monday 2026-08-31
const TODAY = '2026-09-03';
const U18_SLOT = { id: 'slot_msvh0skf_1', sessionId: '', day: 'Thu', active: true };
const SEN_SLOT = { id: 'slot_thu', sessionId: 'thu', day: 'Thu', active: true };
const P = (id, extra = {}) => ({ id, name: 'P' + id, userId: id, ...extra });

test('THE BUG: a slot without a legacy sessionId maps tonight to the DATED occurrence id', () => {
  const w = trainingWorld({ slots: [U18_SLOT], todayIso: TODAY });
  assert.equal(w.mapId('thu'), 'slot_msvh0skf_1-20260903',
    'the board\'s own current-week identity — where the 48 answers actually live');
});

test('the count follows: answers under the dated id are what Overview reports', () => {
  const resolved = {
    a: { 'slot_msvh0skf_1-20260903': { response: 'available', respondedAt: '2026-09-02T10:00:00Z' } },
    b: { 'slot_msvh0skf_1-20260903': { response: 'available', respondedAt: '2026-09-02T10:01:00Z' } },
    c: { thu: { response: 'available', respondedAt: '2026-08-01T10:00:00Z' } },   // the stale bare-id answer
  };
  const w = trainingWorld({ slots: [U18_SLOT], players: [P('a'), P('b'), P('c'), P('d')], resolved, todayIso: TODAY });
  assert.equal(w.count('thu'), 2, 'counts the dated occurrence, not the bare id\'s 1');
});

test('a LEGACY slot (sessionId set) keeps the bare id — Seniors behaviour unchanged', () => {
  const resolved = { a: { thu: { response: 'available', respondedAt: '2026-09-02T10:00:00Z' } } };
  const w = trainingWorld({ slots: [SEN_SLOT], players: [P('a')], resolved, todayIso: TODAY });
  assert.equal(w.mapId('thu'), 'thu');
  assert.equal(w.count('thu'), 1);
});

test('no schedule loaded → bare id fallback (legacy clubs unchanged)', () => {
  const w = trainingWorld({ slots: null, todayIso: TODAY });
  assert.equal(w.mapId('thu'), 'thu');
});

test('a slot NOT falling today cannot hijack tonight; game passes through', () => {
  const tueSlot = { id: 'slot_x', sessionId: '', day: 'Tue', active: true };
  const w = trainingWorld({ slots: [tueSlot], todayIso: TODAY });
  assert.equal(w.mapId('thu'), 'thu', 'Tuesday\'s slot is not tonight');
  assert.equal(w.mapId('game'), 'game');
});

test('a DIFFERENT week\'s occurrence is never used — the id is built from THIS week', () => {
  const w = trainingWorld({ slots: [U18_SLOT], todayIso: TODAY });
  assert.ok(w.mapId('thu').endsWith('-20260903'), 'today\'s date, not any other week\'s');
});

test('the availability CARD (overviewAvailabilityContext) counts the dated occurrence too', () => {
  // M08's gap: the card has its own call into overviewAnswerMap — it must map
  // tonight through the same canonical event id as the count helper.
  const scope = new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: 'grp_u18', players: cfg.players,
      schedule: [{ id: 'thu', title: 'Training session 2' }] };
    function operationalPlayers() { return state.players; }
    let _resolvedAvailability = cfg.resolved;
    let _resolvedAvailabilityGroup = 'grp_u18';
    let _availLastSync = 'x';
    let _trainingSchedule = { slots: cfg.slots };
    let _trainingScheduleGroupId = 'grp_u18';
    function ensureTrainingSchedule() {}
    function getTonightSessionId() { return 'thu'; }
    function overviewRoster() { return state.players; }
    function availToday() { return cfg.todayIso; }
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('tonightAvailabilityEventId')}
    ${fn('sessionKey')}
    ${fn('sessionReasonKey')}
    ${fn('normalizeSessionId')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('resolvedAnswerFor')}
    ${fn('sessionRows')}
    ${fn('overviewAnswerMap')}
    ${fn('overviewAnswerCounts')}
    ${fn('overviewAvailabilityContext')}
    return overviewAvailabilityContext();
  `)({
    players: [P('a'), P('b'), P('c')],
    slots: [U18_SLOT],
    todayIso: TODAY,
    resolved: {
      a: { 'slot_msvh0skf_1-20260903': { response: 'available', respondedAt: 'x' } },
      b: { 'slot_msvh0skf_1-20260903': { response: 'available', respondedAt: 'y' } },
      c: { thu: { response: 'available', respondedAt: 'old' } },   // the stale bare-id answer
    },
  });
  assert.equal(scope.kind, 'session');
  assert.equal(scope.label, 'Training session 2', 'label stays the session\'s own');
  assert.equal(scope.available, 2, 'the CARD counts the dated occurrence, not the bare id');
});

test('Build X no-reply semantics survive the mapping: silent players are excluded from available', () => {
  const resolved = { a: { 'slot_msvh0skf_1-20260903': { response: 'available', respondedAt: 'x' } } };
  const w = trainingWorld({ slots: [U18_SLOT], players: [P('a'), P('silent')], resolved, todayIso: TODAY });
  assert.equal(w.count('thu'), 1, 'the silent player is no-reply, not available');
});
