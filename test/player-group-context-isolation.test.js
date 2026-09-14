/**
 * PLAYER GROUP-CONTEXT ISOLATION (PLAYER-GROUP-CONTEXT-ISOLATION-FIX-1).
 *
 * A Seniors player (Julian Paquay, Alexander Anderson — canonically
 * playerGroupId=grp_initial) could see U18 fixtures and a stale U18
 * published-squad card. Root cause was a CLIENT fail-open:
 *
 *   contextFixtures(): `if (!gid || !operationalGroups().length) return
 *   state.fixtures` returned the WHOLE club's fixtures. operationalGroups()
 *   reads _myOperational — a NON-persisted module var, null on every reload
 *   until /api/identity lands — while state.operationalGroupId IS persisted.
 *   So even with the correct persisted group, the boot window failed open.
 *
 *   The published-sheet card rendered state.playerPublishedSheets (persisted)
 *   with no group check, so a stale U18 sheet showed to a Seniors player.
 *
 * The fix distinguishes PENDING (`_myOperational === null` → fail closed)
 * from a genuinely group-less RESOLVED context (legacy → show all), and
 * group-gates the published sheets. All server identity/group resolution is
 * unchanged and authoritative. Tests drive the REAL extracted functions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

// Production-shaped fixtures (read-only KV, 2026-09-14):
const FIXTURES = [
  { id: 'fx_tv8kog3', date: '2026-09-19', opposition: 'MECH U18 1', groupId: 'grp_2b0aa7f9', team: 'U18 2' },
  { id: 'fx_k9ululd', date: '2026-09-20', opposition: 'Kituro', groupId: '', team: 'Seniors' },
  { id: 'fx_frame',   date: '2026-09-13', opposition: 'Frameries', groupId: 'grp_initial', team: 'Seniors' },
];
const U18_SHEET = { fixtureId: 'fx_tv8kog3', sideId: 'team_158989ae', teamName: 'U18 Premier',
  squad: { published: true, opposition: 'MECH U18 1', kickoffDate: '2026-09-19', formationNames: { 1: 'X' }, benchPlayers: [] } };
const SEN_SHEET = { fixtureId: 'fx_frame', sideId: 'team_f9113560', teamName: 'Premier',
  squad: { published: true, opposition: 'Frameries', kickoffDate: '2026-09-13', formationNames: { 1: 'Y' }, benchPlayers: [] } };

const PLAYER = view => ({ player: view, staff: { groups: [], defaultGroupId: null, mustChoose: false } });
const SENIORS = PLAYER({ groups: [{ id: 'grp_initial', name: 'Seniors' }], defaultGroupId: 'grp_initial', mustChoose: false });
const U18     = PLAYER({ groups: [{ id: 'grp_2b0aa7f9', name: 'U18' }], defaultGroupId: 'grp_2b0aa7f9', mustChoose: false });
const GROUPLESS = PLAYER({ groups: [], defaultGroupId: null, mustChoose: false });

// One sandbox with the REAL context helpers. `operational` = _myOperational
// (null = PENDING). `opGid` = the (persisted) state.operationalGroupId.
function makeEnv({ operational = null, opGid = null, sheets = [], matchCentre = {}, activeView = 'player' } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const state = { activeView: CFG.activeView, operationalGroupId: CFG.opGid,
      fixtures: ${JSON.stringify(FIXTURES)}, playerPublishedSheets: CFG.sheets,
      matchCentre: CFG.matchCentre, trainingStateGroupId: null };
    let _myOperational = CFG.operational;
    function syncTrainingStateToGroup(){}
    ${fn('operationalCapacity')}
    ${fn('operationalGroups')}
    ${fn('resolveOperationalGroup')}
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextResolved')}
    ${fn('contextFixtures')}
    ${fn('contextMatchCentre')}
    ${fn('playerVisiblePublishedSheets')}
    return { state, set _op(v){ _myOperational = v; }, get _op(){ return _myOperational; },
      resolve: resolveOperationalGroup,
      resolved: contextResolved, fixtures: contextFixtures, mc: contextMatchCentre,
      sheets: playerVisiblePublishedSheets, groups: operationalGroups };
  `;
  return new Function(body)({ operational, opGid, sheets, matchCentre, activeView });
}
const ids = env => env.fixtures().map(f => f.id).sort();

// ── 1-2. Resolved players see only their own group ─────────────────────────

test('1. Senior player (resolved) sees ONLY Seniors fixtures — no U18', () => {
  const env = makeEnv({ operational: SENIORS });
  env.resolve();
  assert.equal(env.state.operationalGroupId, 'grp_initial');
  assert.deepEqual(ids(env), ['fx_frame', 'fx_k9ululd'], 'Frameries + Kituro (groupless=initial); NO MECH U18');
});

test('2. U18 player (resolved) sees ONLY U18 fixtures — no Seniors', () => {
  const env = makeEnv({ operational: U18 });
  env.resolve();
  assert.equal(env.state.operationalGroupId, 'grp_2b0aa7f9');
  assert.deepEqual(ids(env), ['fx_tv8kog3'], 'MECH U18 only');
});

// ── 3-5. PENDING fails closed ──────────────────────────────────────────────

test('3. Senior player during _myOperational===null: NO fixtures leak (fail closed)', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial' });   // persisted group present
  assert.equal(env.resolved(), false, 'context is pending');
  assert.deepEqual(env.fixtures(), [], 'the boot window shows nothing — never the whole club');
});

test('4. persisted Senior operationalGroupId + empty _myOperational fails closed', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial' });
  assert.equal(env.groups().length, 0, 'operationalGroups empty while pending');
  assert.deepEqual(ids(env), [], 'the !operationalGroups().length path no longer fails open');
});

test('5. a U18 fixture cannot pass the pending gate', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial' });
  assert.equal(env.fixtures().some(f => f.groupId === 'grp_2b0aa7f9'), false);
});

// ── 6-7. Resolution reveals the correct group's fixtures ───────────────────

test('6. once identity resolves, Senior fixtures appear', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial' });
  assert.deepEqual(env.fixtures(), [], 'pending: empty');
  env._op = SENIORS; env.resolve();
  assert.deepEqual(ids(env), ['fx_frame', 'fx_k9ululd'], 'resolved: Seniors only');
});

test('7. once identity resolves, U18 fixtures appear for a U18 player', () => {
  const env = makeEnv({ operational: null });
  assert.deepEqual(env.fixtures(), [], 'pending: empty');
  env._op = U18; env.resolve();
  assert.deepEqual(ids(env), ['fx_tv8kog3']);
});

// ── 8. Genuine resolved group-less legacy client keeps show-all ────────────

test('8. RESOLVED group-less (legacy/anonymous) client keeps the whole-club list', () => {
  const env = makeEnv({ operational: GROUPLESS });
  env.resolve();
  assert.equal(env.state.operationalGroupId, null, 'no group resolved');
  assert.equal(env.resolved(), true, 'but context HAS resolved');
  assert.deepEqual(ids(env), ['fx_frame', 'fx_k9ululd', 'fx_tv8kog3'], 'legacy show-all preserved');
});

test('8b. a multi-group coach still choosing (opGid null, groups present) keeps show-all', () => {
  const COACH = { player: { groups: [] }, staff: { groups: [{ id: 'grp_initial' }, { id: 'grp_2b0aa7f9' }], defaultGroupId: null, mustChoose: true } };
  const env = makeEnv({ operational: COACH, opGid: null, activeView: 'coach' });
  assert.equal(env.groups().length, 2);
  assert.deepEqual(ids(env), ['fx_frame', 'fx_k9ululd', 'fx_tv8kog3'], 'mustChoose coach sees all — unchanged');
});

test('8c. resolveOperationalGroup NEVER silently picks the first group when the choice is ambiguous', () => {
  // Multiple accessible groups, no server default (mustChoose): the group in
  // force must stay NULL — the switcher asks. A silent first-group pick here is
  // exactly the "arbitrary first group" fallback the fix forbids (a Seniors
  // player-coach of two groups must not be auto-dropped into whichever group
  // the structure happens to list first).
  const COACH = { player: { groups: [] }, staff: { groups: [{ id: 'grp_2b0aa7f9' }, { id: 'grp_initial' }], defaultGroupId: null, mustChoose: true } };
  const env = makeEnv({ operational: COACH, opGid: null, activeView: 'coach' });
  env.resolve();
  assert.equal(env.state.operationalGroupId, null, 'ambiguous → null, never the first listed group');
});

// ── 9-12. Published-sheet group gating ─────────────────────────────────────

test('9. stale U18 playerPublishedSheets does NOT render for a Senior player', () => {
  const env = makeEnv({ operational: SENIORS, sheets: [U18_SHEET] });
  env.resolve();
  assert.deepEqual(env.sheets(), [], 'the U18 sheet is filtered out by the Seniors group');
});

test('10. a Senior published sheet DOES render for a Senior player', () => {
  const env = makeEnv({ operational: SENIORS, sheets: [SEN_SHEET] });
  env.resolve();
  assert.equal(env.sheets().length, 1);
  assert.equal(env.sheets()[0].fixtureId, 'fx_frame');
});

test('11. a U18 published sheet DOES render for a U18 player', () => {
  const env = makeEnv({ operational: U18, sheets: [U18_SHEET] });
  env.resolve();
  assert.equal(env.sheets().length, 1);
  assert.equal(env.sheets()[0].teamName, 'U18 Premier');
});

test('12. a sheet whose fixture is unknown/unresolvable is never displayed', () => {
  const env = makeEnv({ operational: SENIORS, sheets: [{ ...SEN_SHEET, fixtureId: 'fx_ghost' }] });
  env.resolve();
  assert.deepEqual(env.sheets(), [], 'no fixture to prove the group → do not display');
});

test('PENDING — published sheets never render during the boot window', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial', sheets: [U18_SHEET, SEN_SHEET] });
  assert.deepEqual(env.sheets(), [], 'nothing shown until context resolves');
});

// ── 13-15. No self-selection of another group ──────────────────────────────

test('13+14. a persisted/forged operationalGroupId outside the player capacity does NOT widen visibility', () => {
  // The device has a stale/forged opGid = U18, but the player only PLAYS Seniors.
  const env = makeEnv({ operational: SENIORS, opGid: 'grp_2b0aa7f9' });
  env.resolve();   // resolveOperationalGroup rejects the disallowed group
  assert.equal(env.state.operationalGroupId, 'grp_initial', 'reconciled to the allowed Seniors group');
  assert.deepEqual(ids(env), ['fx_frame', 'fx_k9ululd'], 'U18 never becomes visible via a forged opGid');
});

test('15. multi-membership resolves deterministically to the server default', () => {
  // Server sends the player capacity with ONE group (players never hold two
  // playing groups) — resolution is deterministic regardless of a stale opGid.
  const env = makeEnv({ operational: SENIORS, opGid: 'grp_2b0aa7f9' });
  env.resolve();
  assert.equal(env.state.operationalGroupId, 'grp_initial');
});

// ── 16. Boot race ──────────────────────────────────────────────────────────

test('16. boot race: pending(empty) → resolve → correct filtered fixtures, and the repaint is triggered', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial' });
  assert.deepEqual(env.fixtures(), []);
  env._op = SENIORS; env.resolve();
  assert.deepEqual(ids(env), ['fx_frame', 'fx_k9ululd']);
  // Source pin: adoptIdentityPayload repaints on the pending→resolved edge even
  // when opGid is unchanged (persisted-correct), so the empty view can't stick.
  const adopt = fn('adoptIdentityPayload');
  assert.match(adopt, /const _wasPending = !contextResolved\(\)/);
  assert.match(adopt, /state\.operationalGroupId !== _beforeGid \|\| _wasPending/);
});

// ── 17-18. Availability ↔ published card agree on context ──────────────────

test('17+18. during pending BOTH availability fixtures and the published card show nothing; after resolve both agree on Seniors', () => {
  const env = makeEnv({ operational: null, opGid: 'grp_initial', sheets: [U18_SHEET] });
  assert.deepEqual(env.fixtures(), [], 'availability: nothing pending');
  assert.deepEqual(env.sheets(), [], 'card: nothing pending');
  env._op = SENIORS; env.resolve();
  assert.equal(env.fixtures().every(f => fBelongs(f, 'grp_initial')), true);
  assert.deepEqual(env.sheets(), [], 'the U18 card stays hidden for the Seniors player');
});
function fBelongs(fx, gid) { return (String(fx.groupId || '') || 'grp_initial') === gid; }

// ── contextMatchCentre parity ──────────────────────────────────────────────

test('MC — pending fails closed; resolved cross-group match is dropped; resolved own-group match shows', () => {
  const u18mc = { published: true, fixtureId: 'fx_tv8kog3', opposition: 'MECH U18 1' };
  const pend = makeEnv({ operational: null, opGid: 'grp_initial', matchCentre: u18mc });
  assert.deepEqual(pend.mc(), {}, 'pending: no match leaks');
  const sen = makeEnv({ operational: SENIORS, matchCentre: u18mc }); sen.resolve();
  assert.deepEqual(sen.mc(), {}, 'resolved Seniors: the U18 match is dropped');
  const own = makeEnv({ operational: SENIORS, matchCentre: { published: true, fixtureId: 'fx_frame', opposition: 'Frameries' } }); own.resolve();
  assert.equal(own.mc().published, true, 'resolved: own-group match shows');
});

// ── Server-side invariants (must remain untouched) ─────────────────────────

test('SERVER UNTOUCHED — availability write resolves group from canonical identity; squad read is group-scoped', () => {
  const avail = readFileSync(new URL('../api/availability.js', import.meta.url), 'utf8');
  assert.match(avail, /const writeGroup = await playerGroupForIdentity\(writeTeamId, identity\)/);
  assert.match(avail, /resolvePlayerGroup\(member \|\| \{\}, structure\)/);
  const pub = readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(pub, /groupId = await trainingViewGroup\(session, req\.query\?\.group\)/);
  assert.match(pub, /\(await fixturePointerGroup\(session\.teamId, live\)\) === groupId/);
});

// ── Julian / Alexander production-shaped regression ────────────────────────

for (const name of ['Julian Paquay', 'Alexander Anderson']) {
  test(`REGRESSION — ${name} (grp_initial) stays Seniors even with pending context, U18 fixtures and a stale U18 sheet`, () => {
    // Boot: identity pending, persisted Seniors group, a stale U18 sheet in localStorage.
    const env = makeEnv({ operational: null, opGid: 'grp_initial', sheets: [U18_SHEET] });
    assert.deepEqual(env.fixtures(), [], `${name}: no U18 fixture during the boot window`);
    assert.deepEqual(env.sheets(), [], `${name}: no U18 selection card during the boot window`);
    // Identity resolves to the canonical Seniors group.
    env._op = SENIORS; env.resolve();
    assert.equal(env.state.operationalGroupId, 'grp_initial');
    assert.equal(env.fixtures().some(f => f.groupId === 'grp_2b0aa7f9'), false, `${name}: Seniors only`);
    assert.deepEqual(env.sheets(), [], `${name}: no U18 selection card after resolve`);
  });
}
