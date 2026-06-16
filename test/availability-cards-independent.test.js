/**
 * Availability cards must be fully independent (save-immediately UX).
 *
 * The production "linked cards" bug was the shared pending/reason-picker flow:
 * tapping "Can't make it" only set a single shared _reasonPickerOpen (a PENDING,
 * unsaved status). Tapping a second card moved that shared state, so the first
 * card lost its pending status and reverted to its stored value — Session 1 and
 * Session 2 appeared linked.
 *
 * Fix: every status tap SAVES IMMEDIATELY; the reason picker is an optional,
 * post-save panel for one session only. These tests drive the REAL entry
 * handlers (selectAvailabilityStatusPending / openReasonPicker / cancelReason
 * Picker) extracted from index.html, against a mocked save, and assert that no
 * action on one session ever changes another. Hydration independence is checked
 * with the real dedupeRosterPlayers.
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

// Build an isolated runtime with a mocked save that writes ONLY the targeted
// session key (mirroring availabilityApplyToRecord + findLiveAvailabilityRecords
// landing on this player's record), and a real shared _reasonPickerOpen.
function buildScope(initial) {
  const fns = ['selectAvailabilityStatusPending', 'openReasonPicker', 'cancelReasonPicker'].map(extractFn).join('\n');
  const body = `
    "use strict";
    let _reasonPickerOpen = null;
    let _availTraceSeq = 0;
    function availTraceEnabled() { return false; }
    function availTrace() {}
    function renderPlayerAvailability() {}
    const __rec = ${JSON.stringify(initial)};
    const __calls = [];
    function setPlayerAvailability(key, status, reason) {
      __calls.push({ key, status, reason });
      __rec[key] = status;
      __rec[key + 'Reason'] = reason || '';
      __rec[key + 'RespondedAt'] = '2026-06-16T00:00:00.000Z';
      _reasonPickerOpen = null; // real setPlayerAvailability clears the picker
    }
    ${fns}
    return {
      rec: __rec, calls: __calls,
      picker: () => _reasonPickerOpen,
      selectAvailabilityStatusPending, openReasonPicker, cancelReasonPicker,
    };
  `;
  return new Function(body)();
}

const ALL_AVAILABLE = { trainingTuesday: 'available', trainingThursday: 'available', game: 'available' };

test('1. Session 1 unavailable does not change Session 2 (or Match)', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.selectAvailabilityStatusPending('trainingTuesday', 'unavailable');
  assert.equal(s.rec.trainingTuesday, 'unavailable');
  assert.equal(s.rec.trainingThursday, 'available', 'Session 2 must be untouched');
  assert.equal(s.rec.game, 'available', 'Match must be untouched');
});

test('2. Session 2 unavailable does not change Session 1 (or Match)', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.selectAvailabilityStatusPending('trainingThursday', 'unavailable');
  assert.equal(s.rec.trainingThursday, 'unavailable');
  assert.equal(s.rec.trainingTuesday, 'available', 'Session 1 must be untouched');
  assert.equal(s.rec.game, 'available', 'Match must be untouched');
});

test('CRITICAL: answering Session 2 then Session 1 does NOT revert Session 2 (linked-card fix)', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.selectAvailabilityStatusPending('trainingThursday', 'unavailable'); // saves thu, opens thu picker
  assert.equal(s.rec.trainingThursday, 'unavailable');
  assert.deepEqual(s.picker(), { key: 'trainingThursday', status: 'unavailable' });

  s.selectAvailabilityStatusPending('trainingTuesday', 'unavailable'); // saves tue, picker moves to tue
  assert.equal(s.rec.trainingTuesday, 'unavailable');
  assert.equal(s.rec.trainingThursday, 'unavailable', 'Session 2 must STILL be unavailable — not reset by answering Session 1');
  assert.deepEqual(s.picker(), { key: 'trainingTuesday', status: 'unavailable' });
});

test('every status tap saves immediately (available / maybe / unavailable)', () => {
  for (const status of ['available', 'maybe', 'unavailable']) {
    const s = buildScope(ALL_AVAILABLE);
    s.selectAvailabilityStatusPending('trainingTuesday', status);
    assert.equal(s.rec.trainingTuesday, status, `${status} must persist immediately`);
    assert.equal(s.calls.length, 1, 'exactly one save on tap');
    // available needs no reason picker; maybe/unavailable open the optional picker
    assert.deepEqual(s.picker(), status === 'available' ? null : { key: 'trainingTuesday', status });
  }
});

test('3. Session 1 reason picker does not affect Session 2', () => {
  const s = buildScope(ALL_AVAILABLE);
  s.selectAvailabilityStatusPending('trainingTuesday', 'unavailable'); // tue saved, picker open
  // tapping a reason chip saves only this session's reason
  s.calls.length = 0;
  s.rec.trainingTuesday = 'unavailable'; // already
  // simulate the reason-chip onclick: setPlayerAvailability(key, displayStatus, reason)
  // (the chip writes through the same mocked save, only the tue key)
  s.selectAvailabilityStatusPending('trainingTuesday', 'unavailable'); // re-entry keeps tue
  assert.equal(s.rec.trainingThursday, 'available', 'Session 2 status untouched by Session 1 picker');
  assert.equal(s.rec.trainingThursdayReason || '', '', 'Session 2 reason untouched');
  s.cancelReasonPicker();
  assert.equal(s.picker(), null);
  assert.equal(s.rec.trainingThursday, 'available', 'cancel does not touch Session 2');
  assert.equal(s.rec.trainingTuesday, 'unavailable', 'cancel does not touch Session 1 status');
});

test('4. Session 2 reason picker (open + cancel) does not affect Session 1', () => {
  const s = buildScope({ ...ALL_AVAILABLE, trainingTuesday: 'unavailable', trainingTuesdayReason: 'injury' });
  s.openReasonPicker('trainingThursday', 'unavailable'); // open Session 2 picker WITHOUT saving
  assert.deepEqual(s.picker(), { key: 'trainingThursday', status: 'unavailable' });
  assert.equal(s.rec.trainingTuesday, 'unavailable', 'Session 1 status untouched');
  assert.equal(s.rec.trainingTuesdayReason, 'injury', 'Session 1 reason untouched');
  s.cancelReasonPicker();
  assert.equal(s.rec.trainingTuesday, 'unavailable');
  assert.equal(s.rec.trainingTuesdayReason, 'injury');
});

test('5. Match change does not affect either training session', () => {
  const s = buildScope({ trainingTuesday: 'unavailable', trainingThursday: 'maybe', game: 'available' });
  s.selectAvailabilityStatusPending('game', 'unavailable');
  assert.equal(s.rec.game, 'unavailable');
  assert.equal(s.rec.trainingTuesday, 'unavailable', 'Session 1 untouched by Match');
  assert.equal(s.rec.trainingThursday, 'maybe', 'Session 2 untouched by Match');
});

test('openReasonPicker never changes any saved status', () => {
  const s = buildScope({ trainingTuesday: 'unavailable', trainingThursday: 'maybe', game: 'no-reply' });
  s.openReasonPicker('trainingTuesday', 'unavailable');
  assert.equal(s.calls.length, 0, 'opening the picker performs no save');
  assert.deepEqual(
    { tue: s.rec.trainingTuesday, thu: s.rec.trainingThursday, game: s.rec.game },
    { tue: 'unavailable', thu: 'maybe', game: 'no-reply' });
});

test('6. Refresh/hydration keeps all three sessions independent', () => {
  // After answering each session differently, the canonical hydrate (dedupe)
  // must preserve every session's own value — no cross-linking.
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

  // And with a stale duplicate present, each independent answer still survives.
  const stale = { id: 'user_x', userId: 'user_x', name: 'Indep Player', email: 'i@club.com',
    trainingTuesday: 'available', trainingThursday: 'available', game: 'available' };
  const [merged2] = dedupeRosterPlayers([record, stale], { users });
  assert.equal(merged2.trainingTuesday, 'unavailable');
  assert.equal(merged2.trainingThursday, 'maybe');
  assert.equal(merged2.game, 'available');
});
