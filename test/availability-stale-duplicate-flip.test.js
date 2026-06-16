/**
 * Production availability flip — deterministic reproduction.
 *
 * Built from the captured production trace:
 *   merged/rendered player: id=inv-E3CdnDE5, userId=user_1781605236629_8119k5,
 *   legacyPlayerId=inv-E3CdnDE5, name="test player new".
 *   The write path updates the selected record correctly (no DIVERGENCE at
 *   write time). The flip happens AFTER the write.
 *
 * Root cause (proven here): the player is held as TWO records — the written
 * invite record (inv-…, the just-answered value) and a stale duplicate keyed by
 * the permanent user id (user_…, still carrying the ORIGINAL all-available
 * values). The canonical render merge (dedupeRosterPlayers → preferResponseValue)
 * scores the permanent record highest and therefore returns ITS stale
 * 'available', overriding the freshly-written 'unavailable'. The merge has no
 * recency signal, so it cannot tell which of the two answered values is current.
 *
 * This test asserts the canonical view reflects the JUST-WRITTEN value. It FAILS
 * on current code (the stale duplicate wins) and passes once the merge prefers
 * the more recently stamped (RespondedAt) per-session value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRosterPlayers } from '../src/player-identity.js';

const INV = 'inv-E3CdnDE5';
const UID = 'user_1781605236629_8119k5';
const NM  = 'test player new';
const users = [{ id: UID, role: 'player', name: NM, email: 'tpn@club.com', playerId: UID }];

// The invite record holds the player's JUST-WRITTEN answers (stamped with a
// RespondedAt, as a UI write does). The permanent duplicate still holds the
// ORIGINAL all-available values with no/older RespondedAt.
function tracePlayers() {
  return [
    { id: INV, userId: UID, legacyPlayerId: INV, name: NM, email: 'tpn@club.com',
      trainingTuesday: 'unavailable', trainingTuesdayRespondedAt: '2026-06-16T12:05:00.000Z',
      trainingThursday: 'unavailable', trainingThursdayRespondedAt: '2026-06-16T12:00:00.000Z',
      game: 'unavailable', gameRespondedAt: '2026-06-16T12:10:00.000Z' },
    { id: UID, userId: UID, name: NM, email: 'tpn@club.com',
      trainingTuesday: 'available', trainingThursday: 'available', game: 'available' }, // stale, no RespondedAt
  ];
}

test('canonical merge reflects the just-written answers, not the stale duplicate (Session 2)', () => {
  const [merged] = dedupeRosterPlayers(tracePlayers(), { users });
  assert.equal(merged.trainingThursday, 'unavailable',
    'Session 2 must show the just-written "unavailable", not the stale permanent record\'s "available"');
});

test('all three answered sessions survive the stale duplicate', () => {
  const [merged] = dedupeRosterPlayers(tracePlayers(), { users });
  assert.equal(merged.trainingTuesday, 'unavailable');
  assert.equal(merged.trainingThursday, 'unavailable');
  assert.equal(merged.game, 'unavailable');
});

test('order-independent: stale duplicate first still loses to the stamped answer', () => {
  const [a] = dedupeRosterPlayers(tracePlayers(), { users });
  const [b] = dedupeRosterPlayers(tracePlayers().reverse(), { users });
  assert.equal(a.trainingThursday, 'unavailable');
  assert.equal(b.trainingThursday, 'unavailable');
});

test('a genuinely newer stale-record answer still wins (recency, not invite-vs-permanent)', () => {
  // If the permanent record carries a NEWER RespondedAt, its value is correct.
  const players = tracePlayers();
  players[1].trainingThursday = 'maybe';
  players[1].trainingThursdayRespondedAt = '2026-06-16T18:00:00.000Z'; // newer than the invite record's 12:00
  const [merged] = dedupeRosterPlayers(players, { users });
  assert.equal(merged.trainingThursday, 'maybe', 'the more recently stamped answer wins regardless of which record');
});
