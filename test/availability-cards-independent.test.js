/**
 * AvailabilityV2 — fully independent per-session cards.
 *
 * Replaces the fragile shared pending/reason-picker flow. The old code used a
 * single shared _reasonPickerOpen + deferred saves, so tapping one card moved
 * that shared state and the other card reverted (Training session 1 and 2 were
 * linked). AvailabilityV2 saves every status immediately and keeps reason-picker
 * visibility in a PER-KEY map (_availReasonOpenByKey), so no card can ever touch
 * another.
 *
 * These tests drive the REAL V2 entry handlers extracted from index.html
 * (availabilityV2SetStatus / OpenReason / SetReason / CloseReason) against a
 * mocked surgical save, plus the real dedupeRosterPlayers for hydration/merge.
 * The CRITICAL flow fails on the old shared-pending flow and passes on V2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dedupeRosterPlayers } from '../src/player-identity.js';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}

const V2 = ['availabilityV2SetStatus', 'availabilityV2OpenReason', 'availabilityV2SetReason', 'availabilityV2CloseReason'];

function buildScope(initial) {
  const body = `
    "use strict";
    let _availReasonOpenByKey = {};
    let _availTraceSeq = 0;
    function availTraceEnabled() { return false; }
    function availTrace() {}
    function renderPlayerAvailabilityV2() {}
    const __rec = ${JSON.stringify(initial)};
    const __calls = [];
    function setPlayerAvailability(key, status, reason) {
      // Surgical save: writes ONLY this key (mirrors the real availabilityApplyToRecord path).
      __calls.push({ key, status, reason });
      __rec[key] = status;
      __rec[key + 'Reason'] = reason || '';
      __rec[key + 'RespondedAt'] = '2026-06-16T00:00:00.000Z';
    }
    ${V2.map(extractFn).join('\n')}
    return {
      rec: __rec, calls: __calls,
      reasonOpen: () => ({ ..._availReasonOpenByKey }),
      ${V2.join(', ')},
    };
  `;
  return new Function(body)();
}

const ALL_AVAILABLE = { trainingTuesday: 'available', trainingThursday: 'available', game: 'available' };
const snap = s => ({ tue: s.rec.trainingTuesday, thu: s.rec.trainingThursday, game: s.rec.game });

test('1. Session 1 unavailable does not change Session 2 or Match', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable');
  assert.deepEqual(snap(s), { tue: 'unavailable', thu: 'available', game: 'available' });
});

test('2. Session 2 unavailable does not change Session 1 or Match', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingThursday', 'unavailable');
  assert.deepEqual(snap(s), { tue: 'available', thu: 'unavailable', game: 'available' });
});

test('3. Match unavailable does not change Session 1 or Session 2', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('game', 'unavailable');
  assert.deepEqual(snap(s), { tue: 'available', thu: 'available', game: 'unavailable' });
});

test('4. Session 1 maybe does not change Session 2', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingTuesday', 'maybe');
  assert.equal(s.rec.trainingTuesday, 'maybe');
  assert.equal(s.rec.trainingThursday, 'available');
});

test('5. Session 2 maybe does not change Session 1', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingThursday', 'maybe');
  assert.equal(s.rec.trainingThursday, 'maybe');
  assert.equal(s.rec.trainingTuesday, 'available');
});

test('6. Session 1 reason picker opens only for Session 1', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable');
  assert.deepEqual(s.reasonOpen(), { trainingTuesday: true });
});

test('7. Session 2 reason picker opens only for Session 2', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingThursday', 'unavailable');
  assert.deepEqual(s.reasonOpen(), { trainingThursday: true });
});

test('available does not open a reason picker', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingTuesday', 'available');
  assert.deepEqual(s.reasonOpen(), {});
});

test('8. Cancelling Session 1 reason picker does not affect Session 2', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable'); // tue saved, tue picker open
  s.availabilityV2SetStatus('trainingThursday', 'maybe');      // thu saved, thu picker open
  s.availabilityV2CloseReason('trainingTuesday');              // close ONLY tue's picker
  assert.deepEqual(s.reasonOpen(), { trainingThursday: true }, 'only Session 2 picker remains open');
  assert.equal(s.rec.trainingThursday, 'maybe', 'Session 2 status unchanged by closing Session 1 picker');
  assert.equal(s.rec.trainingTuesday, 'unavailable', 'Session 1 status still saved');
});

test('9. Cancelling Session 2 reason picker does not affect Session 1', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingThursday', 'unavailable');
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable');
  s.availabilityV2CloseReason('trainingThursday');
  assert.deepEqual(s.reasonOpen(), { trainingTuesday: true });
  assert.equal(s.rec.trainingTuesday, 'unavailable');
  assert.equal(s.rec.trainingThursday, 'unavailable');
});

test('10. Choosing a reason for Session 1 updates only Session 1 Reason', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable');
  s.availabilityV2SetReason('trainingTuesday', 'unavailable', 'injury');
  assert.equal(s.rec.trainingTuesdayReason, 'injury');
  assert.equal(s.rec.trainingThursday, 'available', 'Session 2 status untouched');
  assert.equal(s.rec.trainingThursdayReason || '', '', 'Session 2 reason untouched');
  assert.deepEqual(s.reasonOpen(), {}, 'Session 1 picker closes after choosing a reason');
});

test('11. Choosing a reason for Session 2 updates only Session 2 Reason', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingThursday', 'unavailable');
  s.availabilityV2SetReason('trainingThursday', 'unavailable', 'work');
  assert.equal(s.rec.trainingThursdayReason, 'work');
  assert.equal(s.rec.trainingTuesday, 'available');
  assert.equal(s.rec.trainingTuesdayReason || '', '');
});

test('CRITICAL (linked-card): answering Session 2 then Session 1 keeps Session 2 unavailable', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.availabilityV2SetStatus('trainingThursday', 'unavailable');
  assert.equal(s.rec.trainingThursday, 'unavailable');
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable');
  assert.equal(s.rec.trainingThursday, 'unavailable', 'Session 2 must NOT revert when Session 1 is answered');
  assert.equal(s.rec.trainingTuesday, 'unavailable');
});

test('14. Exact critical manual flow (all-available → can\'t-make-it cascade)', () => {
  const s = buildScope(ALL_AVAILABLE);
  // Session 2 = Can't make it + reason
  s.availabilityV2SetStatus('trainingThursday', 'unavailable');
  s.availabilityV2SetReason('trainingThursday', 'unavailable', 'work');
  // Session 1 = Can't make it + skip reason
  s.availabilityV2SetStatus('trainingTuesday', 'unavailable');
  s.availabilityV2SetReason('trainingTuesday', 'unavailable', '');
  assert.equal(s.rec.trainingThursday, 'unavailable', 'Session 2 remains Can\'t make it');
  // Match = Can't make it
  s.availabilityV2SetStatus('game', 'unavailable');
  s.availabilityV2SetReason('game', 'unavailable', 'injury');
  assert.equal(s.rec.trainingTuesday, 'unavailable', 'Session 1 unchanged by Match');
  assert.equal(s.rec.trainingThursday, 'unavailable', 'Session 2 unchanged by Match');
  assert.equal(s.rec.game, 'unavailable');
  assert.equal(s.rec.trainingThursdayReason, 'work');
  assert.equal(s.rec.gameReason, 'injury');
});

// ── Hydration / merge independence (real dedupeRosterPlayers) ─────────────────

test('12. Refresh/hydration keeps all three sessions independent', () => {
  const users = [{ id: 'user_x', role: 'player', name: 'Indep Player', email: 'i@club.com', playerId: 'user_x' }];
  const record = {
    id: 'inv-x', userId: 'user_x', legacyPlayerId: 'inv-x', name: 'Indep Player', email: 'i@club.com',
    trainingTuesday: 'unavailable', trainingTuesdayRespondedAt: '2026-06-16T10:00:00.000Z',
    trainingThursday: 'maybe',      trainingThursdayRespondedAt: '2026-06-16T10:05:00.000Z',
    game: 'available',              gameRespondedAt: '2026-06-16T10:10:00.000Z',
  };
  const [merged] = dedupeRosterPlayers([record], { users });
  assert.equal(merged.trainingTuesday, 'unavailable');
  assert.equal(merged.trainingThursday, 'maybe');
  assert.equal(merged.game, 'available');
});

test('13. Duplicate invite/permanent records still merge correctly (stale duplicate loses)', () => {
  const users = [{ id: 'user_x', role: 'player', name: 'Indep Player', email: 'i@club.com', playerId: 'user_x' }];
  const written = {
    id: 'inv-x', userId: 'user_x', legacyPlayerId: 'inv-x', name: 'Indep Player', email: 'i@club.com',
    trainingTuesday: 'unavailable', trainingTuesdayRespondedAt: '2026-06-16T10:00:00.000Z',
    trainingThursday: 'maybe',      trainingThursdayRespondedAt: '2026-06-16T10:05:00.000Z',
    game: 'available',              gameRespondedAt: '2026-06-16T10:10:00.000Z',
  };
  const stale = { id: 'user_x', userId: 'user_x', name: 'Indep Player', email: 'i@club.com',
    trainingTuesday: 'available', trainingThursday: 'available', game: 'available' };
  const [merged] = dedupeRosterPlayers([written, stale], { users });
  assert.equal(merged.trainingTuesday, 'unavailable');
  assert.equal(merged.trainingThursday, 'maybe');
  assert.equal(merged.game, 'available');
});
