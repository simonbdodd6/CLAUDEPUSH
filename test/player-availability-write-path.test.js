/**
 * Urgent hotfix — player availability write path.
 *
 * Production repro (incognito Safari):
 *   1. All sessions start Available.
 *   2. Set Training Session 2 -> Can't make it.
 *   3. Set Training Session 1 -> Can't make it.
 *   4. Training Session 2 flips back to Available.   (and the reverse, and Match
 *      changes resetting training items)
 *
 * Root cause: fetchMyAvailabilityFromServer OVERWROTE any locally-answered
 * session whose value differed from the server. That GET is async, so it
 * resolved AFTER the player tapped and re-applied the server's stale 'available',
 * flipping just-answered sibling sessions back to Available.
 *
 * Fix: server availability is now MERGED, never overwritten — only sessions the
 * player has NOT answered locally adopt the server value (mergeServerAvailability
 * IntoRecord). The button write path itself (availabilityApplyToRecord +
 * findLiveAvailabilityRecords) only ever touches the selected session key.
 *
 * These tests extract the real functions from index.html and drive the EXACT
 * manual flow, plus the dedupe/hydrate path and the fetch-merge fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { dedupeRosterPlayers } from '../src/player-identity.js';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1; // start brace-count at the body '{'
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

function buildScope() {
  // findLiveAvailabilityRecords groups by the canonical rosterIdentityKeys, so the
  // identity-grouping graph must be in scope too.
  const fns = [
    'identityNameKey', 'identityCompactKey', 'canonicalIdentityNameKey', 'identityEmailKey',
    'isPermanentPlayerUserId', 'findPermanentRosterUser', 'resolveRosterMessagingId', 'rosterIdentityKeys',
    'sessionKey', 'availabilityApplyToRecord', 'findLiveAvailabilityRecords', 'mergeServerAvailabilityIntoRecord',
  ].map(extractFn).join('\n');
  const body = `"use strict";\n${fns}\nreturn { sessionKey, availabilityApplyToRecord, findLiveAvailabilityRecords, mergeServerAvailabilityIntoRecord };`;
  return new Function(body)();
}

const { sessionKey, availabilityApplyToRecord, findLiveAvailabilityRecords, mergeServerAvailabilityIntoRecord } = buildScope();

// ── Harness mirroring the real player availability write path ────────────────
// getPlayer() reads the canonical/deduped roster; setPlayerAvailability writes
// the selected session key to EVERY matching raw record. Display reads back the
// re-merged canonical value (the hydrate/render path).
function makeWorld(players, users = []) {
  const canonical = () => dedupeRosterPlayers(players, { users });
  const getPlayer = () => canonical()[0];
  const tap = (sessionId, status, reason = '') => {
    const key = sessionKey(sessionId);
    const player = getPlayer();
    findLiveAvailabilityRecords(players, player).forEach(rec => availabilityApplyToRecord(rec, key, status, reason));
  };
  const shown = sessionId => getPlayer()[sessionKey(sessionId)];
  return { tap, shown, getPlayer, canonical, players, users };
}

function startAllAvailable(extra = {}) {
  return {
    id: 'inv-sam', name: 'Sam Rivers', email: 'sam@club.com',
    trainingTuesday: 'available', trainingThursday: 'available', game: 'available',
    ...extra,
  };
}

test('exact manual flow: answering one session never flips a sibling (single record)', () => {
  const w = makeWorld([startAllAvailable()]);
  assert.equal(w.shown('tue'), 'available');
  assert.equal(w.shown('thu'), 'available');

  // 2. Session 2 (thu) -> unavailable
  w.tap('thu', 'unavailable', 'work');
  assert.equal(w.shown('thu'), 'unavailable');

  // 3. Session 1 (tue) -> unavailable
  w.tap('tue', 'unavailable', 'injury');
  // 4. Session 2 must STAY unavailable
  assert.equal(w.shown('thu'), 'unavailable', 'Session 2 must not flip back to Available');
  assert.equal(w.shown('tue'), 'unavailable');

  // 5. Session 1 -> available; Session 2 must stay unavailable
  w.tap('tue', 'available', '');
  assert.equal(w.shown('tue'), 'available');
  assert.equal(w.shown('thu'), 'unavailable', 'changing Session 1 must not touch Session 2');

  // 6. Match -> unavailable; both training sessions unchanged
  w.tap('game', 'unavailable', '');
  assert.equal(w.shown('game'), 'unavailable');
  assert.equal(w.shown('tue'), 'available');
  assert.equal(w.shown('thu'), 'unavailable', 'Match change must not reset training items');
});

test('exact manual flow holds across an invite + permanent duplicate (two records)', () => {
  const users = [{ id: 'user_sam', role: 'player', name: 'Sam Rivers', playerId: 'user_sam', email: 'sam@club.com' }];
  const players = [
    startAllAvailable(),
    { id: 'user_sam', userId: 'user_sam', name: 'Sam Rivers', email: 'sam@club.com',
      trainingTuesday: 'available', trainingThursday: 'available', game: 'available' },
  ];
  const w = makeWorld(players, users);

  w.tap('thu', 'unavailable', '');
  w.tap('tue', 'unavailable', '');
  assert.equal(w.shown('thu'), 'unavailable');
  assert.equal(w.shown('tue'), 'unavailable');

  w.tap('game', 'unavailable', '');
  assert.equal(w.shown('thu'), 'unavailable');
  assert.equal(w.shown('tue'), 'unavailable');
});

test('reason + respondedAt of a selected session do not disturb siblings', () => {
  const w = makeWorld([startAllAvailable({ trainingTuesdayRespondedAt: '2026-06-10T09:00:00.000Z' })]);
  w.tap('thu', 'unavailable', 'holiday');
  const p = w.getPlayer();
  assert.equal(p.trainingThursday, 'unavailable');
  assert.equal(p.trainingThursdayReason, 'holiday');
  // Sibling status, reason and respondedAt untouched
  assert.equal(p.trainingTuesday, 'available');
  assert.equal(p.trainingTuesdayRespondedAt, '2026-06-10T09:00:00.000Z');
});

// ── The fix: server fetch must MERGE, never overwrite a local answer ──────────

test('FIX: stale server response can no longer overwrite a locally-answered session', () => {
  // Player answered locally; server still holds the pre-change all-available state.
  const record = { trainingTuesday: 'unavailable', trainingThursday: 'unavailable', game: 'available' };
  const staleServer = { tue: { response: 'available' }, thu: { response: 'available' }, game: { response: 'available' } };

  const changed = mergeServerAvailabilityIntoRecord(record, staleServer);
  assert.equal(changed, false, 'no locally-answered session should be touched');
  assert.equal(record.trainingTuesday, 'unavailable');
  assert.equal(record.trainingThursday, 'unavailable', 'stale server must NOT flip Session 2 back to Available');
  assert.equal(record.game, 'available');
});

test('server merge still hydrates sessions the player has NOT answered', () => {
  const record = { trainingTuesday: 'no-reply', trainingThursday: 'unavailable' };
  const server = { tue: { response: 'available', reason: '' }, thu: { response: 'available' } };

  const changed = mergeServerAvailabilityIntoRecord(record, server);
  assert.equal(changed, true);
  assert.equal(record.trainingTuesday, 'available', 'unanswered session adopts the server value');
  assert.equal(record.trainingThursday, 'unavailable', 'answered session is preserved');
});

test('server merge fills custom (avail_*) unanswered sessions and keeps answered ones', () => {
  const record = { avail_friday: 'no-reply', avail_sunday: 'maybe' };
  const server = { friday: { response: 'available' }, sunday: { response: 'unavailable' } };
  mergeServerAvailabilityIntoRecord(record, server);
  assert.equal(record.avail_friday, 'available');
  assert.equal(record.avail_sunday, 'maybe'); // answered locally — untouched
});

// ── normalize / hydrate / render path preserves all values ───────────────────

test('dedupe/hydrate preserves every per-session value after the flow', () => {
  const users = [{ id: 'user_sam', role: 'player', name: 'Sam Rivers', playerId: 'user_sam', email: 'sam@club.com' }];
  const players = [
    { id: 'inv-sam', name: 'Sam Rivers', email: 'sam@club.com',
      trainingTuesday: 'unavailable', trainingTuesdayReason: 'injury',
      avail_friday: 'maybe', game: 'available' },
    { id: 'user_sam', userId: 'user_sam', name: 'Sam Rivers', email: 'sam@club.com',
      trainingThursday: 'unavailable', trainingThursdayRespondedAt: '2026-06-12T11:00:00.000Z' },
  ];
  const [merged] = dedupeRosterPlayers(players, { users });
  assert.equal(merged.trainingTuesday, 'unavailable');
  assert.equal(merged.trainingTuesdayReason, 'injury');
  assert.equal(merged.trainingThursday, 'unavailable');
  assert.equal(merged.trainingThursdayRespondedAt, '2026-06-12T11:00:00.000Z');
  assert.equal(merged.avail_friday, 'maybe');
  assert.equal(merged.game, 'available');
});
