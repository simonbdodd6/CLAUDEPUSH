/**
 * ACTIVE GROUP RESOLUTION — Option B reconciliation.
 *
 * A multi-group operator's server default group is null ("the switcher asks").
 * If the coach saved while in that null state, or a transient view/capacity
 * change ran before identity loaded, operationalGroupId could be null while a
 * group's training/working state (trainingStateGroupId) was already restored —
 * which painted another group's data on group-scoped surfaces.
 *
 * resolveOperationalGroup() now re-adopts the LAST operated group
 * (trainingStateGroupId) when it would otherwise land null — but ONLY when that
 * group is one the CURRENT capacity may operate. A stale, revoked, malformed or
 * missing value is rejected and the group stays null: never a widening past the
 * caller's own `allowed` groups, never a guess.
 *
 * These drive the REAL extracted resolver.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) { if (src[i] === '(') paren++; else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } } }
  let depth = 0, end = 0;
  for (let b = src.indexOf('{', i); b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } } }
  return src.slice(start, end + 1);
}

const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_womens', REVOKED = 'grp_gone';

// Resolve using the REAL resolveOperationalGroup. syncTrainingStateToGroup is
// stubbed to the app's real invariant (aligns trainingStateGroupId to the
// resolved group; its own stash/adopt is covered by training-group-partition).
function resolve({ operationalGroupId = null, trainingStateGroupId = null, activeView = 'coach', myOperational }) {
  const body = `
    "use strict";
    const state = { operationalGroupId: ${JSON.stringify(operationalGroupId)}, trainingStateGroupId: ${JSON.stringify(trainingStateGroupId)}, activeView: ${JSON.stringify(activeView)} };
    let _myOperational = ${JSON.stringify(myOperational)};
    function syncTrainingStateToGroup() { if (!state.operationalGroupId) return; state.trainingStateGroupId = state.operationalGroupId; }
    ${fn('operationalCapacity')}
    ${fn('operationalGroups')}
    ${fn('resolveOperationalGroup')}
    resolveOperationalGroup();
    return { operationalGroupId: state.operationalGroupId, trainingStateGroupId: state.trainingStateGroupId };
  `;
  return new Function(body)();
}

const MULTI  = { staff: { groups: [{ id: SEN }, { id: U18 }], defaultGroupId: null, mustChoose: true } };
const CLUB   = { staff: { groups: [{ id: SEN }, { id: U18 }, { id: WOM }], defaultGroupId: null, mustChoose: true } };
const SINGLE = { staff: { groups: [{ id: U18 }], defaultGroupId: U18, mustChoose: false } };
const DUAL   = { player: { groups: [{ id: SEN }], defaultGroupId: SEN, mustChoose: false },
                 staff:  { groups: [{ id: U18 }, { id: WOM }], defaultGroupId: null, mustChoose: true } };

// ── THE FIX: divergent multi-group state re-adopts the authorised group ──────

test('1. multi-group, operationalGroupId null, trainingStateGroupId=authorised U18 → resolves to U18', () => {
  const r = resolve({ operationalGroupId: null, trainingStateGroupId: U18, myOperational: MULTI });
  assert.equal(r.operationalGroupId, U18);
  assert.equal(r.trainingStateGroupId, U18, 'the two sources are re-aligned');
});

test('2. multi-group, operationalGroupId null, trainingStateGroupId=REVOKED (not operable) → stays null', () => {
  const r = resolve({ operationalGroupId: null, trainingStateGroupId: REVOKED, myOperational: MULTI });
  assert.equal(r.operationalGroupId, null, 'a group no longer operable is never resurrected');
});

test('3. multi-group, trainingStateGroupId malformed / empty / missing → stays null', () => {
  assert.equal(resolve({ trainingStateGroupId: '', myOperational: MULTI }).operationalGroupId, null);
  assert.equal(resolve({ trainingStateGroupId: null, myOperational: MULTI }).operationalGroupId, null);
  assert.equal(resolve({ trainingStateGroupId: 12345, myOperational: MULTI }).operationalGroupId, null);
  assert.equal(resolve({ trainingStateGroupId: 'not-a-real-group', myOperational: MULTI }).operationalGroupId, null);
});

test('4. an already-valid operationalGroupId is left unchanged (Seniors kept, not replaced by U18)', () => {
  const r = resolve({ operationalGroupId: SEN, trainingStateGroupId: U18, myOperational: MULTI });
  assert.equal(r.operationalGroupId, SEN, 'a valid current selection always wins');
});

test('5. single-group operator: existing default behaviour unchanged (lands on its one group)', () => {
  assert.equal(resolve({ operationalGroupId: null, trainingStateGroupId: null, myOperational: SINGLE }).operationalGroupId, U18);
  // and a stale trainingStateGroupId cannot override the single-group default
  assert.equal(resolve({ operationalGroupId: null, trainingStateGroupId: SEN, myOperational: SINGLE }).operationalGroupId, U18);
});

test('6. fresh multi-group login (no persisted training group) still asks — stays null', () => {
  assert.equal(resolve({ operationalGroupId: null, trainingStateGroupId: null, myOperational: MULTI }).operationalGroupId, null);
});

test('7. a REVOKED current operationalGroupId is replaced by the authorised trainingStateGroupId', () => {
  const r = resolve({ operationalGroupId: REVOKED, trainingStateGroupId: U18, myOperational: MULTI });
  assert.equal(r.operationalGroupId, U18);
});

test('8. club-wide operator: divergent null with authorised training group re-adopts it', () => {
  assert.equal(resolve({ operationalGroupId: null, trainingStateGroupId: WOM, myOperational: CLUB }).operationalGroupId, WOM);
});

// ── SECURITY: never widen past the CURRENT capacity's operable groups ─────────

test('SECURITY: an unauthorised trainingStateGroupId can NEVER become operationalGroupId', () => {
  // Every group NOT in `allowed` must be rejected, no matter its shape.
  for (const bad of ['grp_another_club', 'grp_womens_typo', '../../etc', '{}', 'grp_u18 ', 'GRP_U18']) {
    const r = resolve({ operationalGroupId: null, trainingStateGroupId: bad, myOperational: MULTI });
    assert.equal(r.operationalGroupId, null, `rejected: ${JSON.stringify(bad)}`);
  }
});

test('SECURITY: a coach-capacity training group is NOT carried into the player view unless the player operates it', () => {
  // DUAL plays Seniors, coaches U18/Women's. In the PLAYER capacity, a persisted
  // coach group (U18) is not in the player's allowed set → must not be adopted;
  // the player default (Seniors) is used instead.
  const r = resolve({ operationalGroupId: null, trainingStateGroupId: U18, activeView: 'player', myOperational: DUAL });
  assert.equal(r.operationalGroupId, SEN, 'player view uses the playing group, never the coach group');
});

test('SECURITY: in the coach capacity, a player-only group is rejected (stays null / asks)', () => {
  // DUAL coaches U18/Women's (multi → default null). A persisted Seniors (their
  // playing group, not coachable) must NOT be adopted in the coach view.
  const r = resolve({ operationalGroupId: null, trainingStateGroupId: SEN, activeView: 'coach', myOperational: DUAL });
  assert.equal(r.operationalGroupId, null, 'the switcher still asks — Seniors is not coachable here');
});
