/**
 * Phase 30 / C2 — Coach availability read-path stabilisation.
 *
 * The coach availability board (sessionRows) and the availability report
 * (generateAvailabilityReport) previously read RAW state.players. Because
 * state.players is only canonicalised at normalizeState/load time (not on every
 * save), a player held as two raw records — an invite record (inv-XXX) plus a
 * permanent-account record (user_YYY) — would show the coach DUPLICATE rows, or
 * a stale duplicate's per-session answer, bypassing the merge that preserves
 * each session's status / reason / respondedAt.
 *
 * The fix routes both surfaces through canonicalVisiblePlayers(), which dedupes
 * via dedupeRosterPlayers() (src/player-identity.js) — the function exercised
 * here. These tests prove the canonical roster the coach now reads:
 *   1. collapses duplicate invite/permanent records to ONE row
 *   2. preserves custom (avail_*) session answers
 *   3. preserves *Reason fields
 *   4. preserves *RespondedAt timestamps
 *   5. does not regress the default Tuesday / Thursday / Game sessions
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { dedupeRosterPlayers } from '../src/player-identity.js';

// Mirrors index.html sessionRows() field projection over one canonical record,
// so the assertions reflect exactly what a coach board row exposes.
function sessionKey(id) {
  if (id === 'tue') return 'trainingTuesday';
  if (id === 'thu') return 'trainingThursday';
  if (id === 'game') return 'game';
  return 'avail_' + id;
}
function sessionRowFor(player, id) {
  const key = sessionKey(id);
  return {
    status:      player[key],
    reason:      player[key + 'Reason'] || '',
    respondedAt: player[key + 'RespondedAt'] || null,
  };
}

// A player held as two raw records. The invite record carries the player's real
// answers (Tuesday, the custom Friday session, and the Match). The higher-scored
// permanent record carries defaults for those (no-reply / empty) plus its own
// real answer for Thursday. The merge must keep every real answer + metadata and
// never let the permanent record's defaults clobber the invite record's answers.
function caseyDuplicateRecords() {
  const inviteRecord = {
    id: 'inv-cc', name: 'Casey Ford', email: 'casey@club.com', position: 'TBC',
    trainingTuesday: 'unavailable',
    trainingTuesdayReason: 'injury',
    trainingTuesdayRespondedAt: '2026-06-10T09:00:00.000Z',
    avail_friday: 'maybe',
    avail_fridayReason: 'work',
    avail_fridayRespondedAt: '2026-06-11T10:00:00.000Z',
    game: 'available',
    gameRespondedAt: '2026-06-09T08:00:00.000Z',
  };
  const permanentRecord = {
    id: 'user_cc', userId: 'user_cc', name: 'Casey Ford', email: 'casey@club.com', position: 'TBC',
    trainingTuesday: 'no-reply',            // default on preferred — must NOT win
    trainingTuesdayReason: '',              // empty — must NOT clobber 'injury'
    trainingTuesdayRespondedAt: '',         // empty present on preferred — must NOT clobber the timestamp
    avail_friday: 'no-reply',               // default on preferred — must NOT win
    avail_fridayReason: '',                 // empty — must NOT clobber 'work'
    avail_fridayRespondedAt: '',            // empty — must NOT clobber the timestamp
    game: 'no-reply',                       // default on preferred — must NOT win
    gameRespondedAt: '',                    // empty present on preferred — must NOT clobber the timestamp
    trainingThursday: 'maybe',
    trainingThursdayReason: 'holiday',
    trainingThursdayRespondedAt: '2026-06-12T11:00:00.000Z',
  };
  const users = [{ id: 'user_cc', role: 'player', name: 'Casey Ford', playerId: 'user_cc', email: 'casey@club.com' }];
  return { inviteRecord, permanentRecord, users };
}

test('C2.1: duplicate invite/permanent records collapse to a single coach board row', () => {
  const { inviteRecord, permanentRecord, users } = caseyDuplicateRecords();
  const roster = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });
  assert.equal(roster.length, 1, 'coach board must show one row per real person, not duplicates');
});

test('C2.2: custom (avail_*) session availability survives the canonical merge', () => {
  const { inviteRecord, permanentRecord, users } = caseyDuplicateRecords();
  const [row] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });
  const friday = sessionRowFor(row, 'friday'); // custom session id -> avail_friday
  assert.equal(friday.status, 'maybe', 'custom session answer must not be reset by the preferred no-reply');
});

test('C2.3: *Reason fields survive across all session types', () => {
  const { inviteRecord, permanentRecord, users } = caseyDuplicateRecords();
  const [row] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });
  assert.equal(sessionRowFor(row, 'tue').reason, 'injury');     // from invite record
  assert.equal(sessionRowFor(row, 'thu').reason, 'holiday');    // from permanent record
  assert.equal(sessionRowFor(row, 'friday').reason, 'work');    // custom; empty on preferred must not win
});

test('C2.4: *RespondedAt timestamps survive across all session types', () => {
  const { inviteRecord, permanentRecord, users } = caseyDuplicateRecords();
  const [row] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });
  assert.equal(sessionRowFor(row, 'tue').respondedAt, '2026-06-10T09:00:00.000Z');
  assert.equal(sessionRowFor(row, 'thu').respondedAt, '2026-06-12T11:00:00.000Z');
  assert.equal(sessionRowFor(row, 'game').respondedAt, '2026-06-09T08:00:00.000Z');
  assert.equal(sessionRowFor(row, 'friday').respondedAt, '2026-06-11T10:00:00.000Z'); // empty on preferred must not clobber
});

test('C2.5: default Tuesday / Thursday / Game sessions do not regress', () => {
  const { inviteRecord, permanentRecord, users } = caseyDuplicateRecords();
  const [row] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });
  assert.equal(sessionRowFor(row, 'tue').status, 'unavailable'); // real answer beats preferred no-reply
  assert.equal(sessionRowFor(row, 'thu').status, 'maybe');       // from permanent record
  assert.equal(sessionRowFor(row, 'game').status, 'available');  // from invite record
});

test('C2: result is order-independent (which raw record is seen first must not matter)', () => {
  const { inviteRecord, permanentRecord, users } = caseyDuplicateRecords();
  const [a] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });
  const [b] = dedupeRosterPlayers([permanentRecord, inviteRecord], { users });
  for (const id of ['tue', 'thu', 'game', 'friday']) {
    assert.deepEqual(sessionRowFor(a, id), sessionRowFor(b, id), `session ${id} must merge identically regardless of order`);
  }
});
