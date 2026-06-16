/**
 * DIAGNOSIS repro — player availability sessions flip back to Available.
 *
 * This reproduces the live bug deterministically and pinpoints the mechanism.
 * It currently FAILS on purpose (it asserts the correct behaviour) and becomes
 * the regression guard once the write path is fixed.
 *
 * Root cause (confirmed here):
 *   getPlayer() returns the MERGED canonical record (dedupeRosterPlayers). Its
 *   `id` is resolved to a permanent user_ id via the users table (by email), and
 *   merged.legacyPlayerId captures only ONE of the duplicate raw records' ids.
 *   setPlayerAvailability writes via findLiveAvailabilityRecords(), which matches
 *   raw records ONLY by literal id/userId/legacyPlayerId/playerId equality. Any
 *   duplicate raw record whose literal id is not in the merged id-set is MISSED.
 *   When the missed record is the one the merge PREFERS (highest score), the
 *   player's answer lands on a non-preferred record and the merge keeps showing
 *   the preferred record's stale 'available' — the session appears to flip back.
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
// findLiveAvailabilityRecords now groups by the canonical rosterIdentityKeys, so
// extract that whole identity-grouping graph too.
const NEEDED = [
  'identityNameKey', 'identityCompactKey', 'canonicalIdentityNameKey', 'identityEmailKey',
  'isPermanentPlayerUserId', 'findPermanentRosterUser', 'resolveRosterMessagingId', 'rosterIdentityKeys',
  'sessionKey', 'availabilityApplyToRecord', 'findLiveAvailabilityRecords',
];
const scope = new Function(
  `"use strict";\n${NEEDED.map(extractFn).join('\n')}\n` +
  `return { sessionKey, availabilityApplyToRecord, findLiveAvailabilityRecords };`
)();
const { sessionKey, availabilityApplyToRecord, findLiveAvailabilityRecords } = scope;

// Faithful model of the player write/display path.
function makeWorld(players, users) {
  const getPlayer = () => dedupeRosterPlayers(players, { users })[0];
  const tap = (sessionId, status) => {
    const player = getPlayer();
    const targets = findLiveAvailabilityRecords(players, player);
    targets.forEach(rec => availabilityApplyToRecord(rec, sessionKey(sessionId), status, ''));
    return targets.map(r => r.id);
  };
  const shown = sessionId => getPlayer()[sessionKey(sessionId)];
  return { tap, shown, getPlayer };
}

test('REPRO: duplicate records resolved to a permanent account by email — answers must stick', () => {
  // A permanent account exists in users; two raw player records both resolve to
  // it by email, but neither literally carries the user_ id. This is the shape a
  // real player session takes after invite + identity sync.
  const users = [{ id: 'user_S', role: 'player', name: 'Sam Rivers', email: 'sam@club.com', playerId: 'user_S' }];
  const players = [
    { id: 'inv-sam', name: 'Sam Rivers', email: 'sam@club.com', trainingTuesday: 'available', trainingThursday: 'available', game: 'available' },
    { id: 'p-sam',   name: 'Sam Rivers', email: 'sam@club.com', trainingTuesday: 'available', trainingThursday: 'available', game: 'available' },
  ];
  const w = makeWorld(players, users);

  // Diagnostic: where does the write land vs what does the merge prefer?
  const wroteTo = w.tap('thu', 'unavailable');
  // EXPECTED: Session 2 shows unavailable. (Currently fails — flips to available.)
  assert.equal(w.shown('thu'), 'unavailable',
    `Session 2 flipped back to Available. Write landed on ${JSON.stringify(wroteTo)} but the ` +
    `merge displays a different (preferred) raw record. merged.id=${w.getPlayer().id}`);

  w.tap('tue', 'unavailable');
  assert.equal(w.shown('tue'), 'unavailable');
  assert.equal(w.shown('thu'), 'unavailable', 'Session 2 must stay unavailable after answering Session 1');
});
