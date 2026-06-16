/**
 * Beta stabilisation — availability + messaging regression tests.
 *
 * These reproduce the exact manual beta-test flows:
 *
 *  Bug 1 — Availability must NOT cross-contaminate between sessions.
 *          Answering Training Session 2 must never reset Training Session 1.
 *  Bug 2 — The coach availability board (canonical read/display dedup path)
 *          must reflect the latest saved per-session player responses after a
 *          refresh/hydration pass, including custom sessions and reasons.
 *  Bug 3 — Coach and player must resolve the SAME canonical DM conversation id
 *          for a newly invited player (pre-registration) and for a registered
 *          player whose roster record and approved account both exist.
 *
 * The shared root cause for 1 & 2 was that the canonical read/display dedup
 * path (canonicalVisiblePlayers -> dedupeRosterPlayers -> mergeRosterPlayer)
 * merged only a hardcoded 4-key availability subset and dropped every custom
 * avail_* session and every *Reason field — so a no-reply on the higher-scored
 * (permanent) duplicate clobbered a real answer on the other duplicate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeRosterPlayers,
  resolveMessagingParticipantId,
  resolvePlayerPortalMessagingId,
} from '../src/player-identity.js';
import {
  createCoachDmConversationRequest,
  dmConvId,
} from '../src/chat-state.js';

const COACH = 'coach-demo';

// ── Bug 1: per-session independence through the canonical dedup path ──────────

test('Bug 1: answering one session does not reset another across a roster merge', () => {
  // Same player held as two raw records: an invite record (lower score, carries
  // the player's real answers) and a freshly-synced permanent-account record
  // (higher score / preferred) that holds DEFAULT no-reply/empty values for the
  // custom session + reasons. Under the old spread-only merge the preferred
  // record's defaults clobbered the invite record's real answers — answering one
  // session reset another. The merge must keep the answered value either way.
  const inviteRecord = {
    id: 'inv-77', name: 'Pat Jones', email: 'pat@club.com', position: 'TBC',
    avail_session1: 'unavailable', avail_session1Reason: 'injury',
    avail_session2: 'maybe',
    gameReason: 'work',
  };
  const permanentRecord = {
    id: 'user_77', userId: 'user_77', name: 'Pat Jones', email: 'pat@club.com', position: 'TBC',
    avail_session1: 'no-reply',     // default present on the preferred record…
    avail_session1Reason: '',       // …and an empty reason that must NOT win
    game: 'available',
    gameReason: '',                 // empty reason must not clobber the real one
  };
  const users = [{ id: 'user_77', role: 'player', name: 'Pat Jones', playerId: 'user_77', email: 'pat@club.com' }];

  const [merged] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });

  // Custom Session 1 keeps its real answer — NOT reset by the preferred no-reply.
  assert.equal(merged.avail_session1, 'unavailable');
  assert.equal(merged.avail_session1Reason, 'injury');
  // Custom Session 2 answer preserved.
  assert.equal(merged.avail_session2, 'maybe');
  // Default-session reason: the real reason survives an empty reason on preferred.
  assert.equal(merged.gameReason, 'work');
});

test('Bug 1: a real answer is never overwritten regardless of which record wins', () => {
  // Mirror image: the high-score record holds the answer, the other is no-reply.
  const permanentRecord = {
    id: 'user_88', userId: 'user_88', name: 'Sam Lee', email: 'sam@club.com',
    trainingTuesday: 'available',
  };
  const inviteRecord = {
    id: 'inv-88', name: 'Sam Lee', email: 'sam@club.com',
    trainingTuesday: 'no-reply',
  };
  const users = [{ id: 'user_88', role: 'player', name: 'Sam Lee', playerId: 'user_88', email: 'sam@club.com' }];

  const [a] = dedupeRosterPlayers([permanentRecord, inviteRecord], { users });
  const [b] = dedupeRosterPlayers([inviteRecord, permanentRecord], { users });

  assert.equal(a.trainingTuesday, 'available');
  assert.equal(b.trainingTuesday, 'available'); // order-independent
});

// ── Bug 2: coach board canonical view reflects refreshed responses ────────────

test('Bug 2: coach board canonical dedup surfaces latest per-session responses after hydration', () => {
  // Simulate a fresh hydration where state.players contains both duplicates.
  // The coach board reads canonicalVisiblePlayers() == dedupeRosterPlayers(...).
  // The invite record holds the player's real answers for a custom session +
  // reason; the higher-scored permanent record (preferred) holds defaults. The
  // coach board must still surface the real answers after the merge.
  const rawPlayers = [
    { id: 'inv-99', name: 'Alex Kerr', email: 'alex@club.com',
      avail_friday: 'available',
      avail_sunday: 'unavailable', avail_sundayReason: 'holiday' },
    { id: 'user_99', userId: 'user_99', name: 'Alex Kerr', email: 'alex@club.com',
      avail_friday: 'no-reply',                 // default on preferred record
      avail_sunday: 'no-reply', avail_sundayReason: '',
      trainingThursday: 'maybe' },
  ];
  const users = [{ id: 'user_99', role: 'player', name: 'Alex Kerr', playerId: 'user_99', email: 'alex@club.com' }];

  const board = dedupeRosterPlayers(rawPlayers, { users });
  assert.equal(board.length, 1);
  const row = board[0];

  // Every session the player answered — across BOTH duplicates — is visible,
  // not reset by the preferred record's defaults.
  assert.equal(row.avail_friday, 'available');
  assert.equal(row.avail_sunday, 'unavailable');
  assert.equal(row.avail_sundayReason, 'holiday');
  assert.equal(row.trainingThursday, 'maybe');
});

// ── Bug 3: coach and player resolve the same canonical DM conversation ────────

test('Bug 3: newly invited player (pre-registration) — coach and portal DM ids match', () => {
  // Coach roster has the invite record; player logs into the portal with a
  // not-yet-permanent account linked by playerId. Both sides must agree.
  const invitePlayer = { id: 'inv-aa', name: 'Jo Reid', email: 'jo@club.com', position: 'TBC' };
  const portalUser   = { id: 'player-jo', role: 'player', name: 'Jo Reid', playerId: 'inv-aa', email: 'jo@club.com' };
  const users = [portalUser];

  const coachTargetId = resolveMessagingParticipantId(invitePlayer, { users });
  const portalId      = resolvePlayerPortalMessagingId(portalUser, { players: [invitePlayer], users });

  assert.equal(coachTargetId, 'inv-aa');
  assert.equal(portalId, 'inv-aa');
  assert.equal(dmConvId(COACH, coachTargetId), dmConvId(COACH, portalId));
});

test('Bug 3: registered player with both records present — coach DM target equals portal id', () => {
  // After the player registers, both the manual roster record and the approved
  // account record exist in state.players. The canonical merge must resolve to
  // the permanent id so the coach DM lands in the conversation the player reads.
  const manualPlayer   = { id: 'p-bee', name: 'Kim Vale', email: 'kim@club.com', position: 'TBC' };
  const approvedPlayer = { id: 'user_bee', userId: 'user_bee', name: 'Kim Vale', email: 'kim@club.com', position: 'TBC' };
  const approvedUser   = { id: 'user_bee', role: 'player', name: 'Kim Vale', playerId: 'user_bee', email: 'kim@club.com' };
  const users = [approvedUser];

  const roster = dedupeRosterPlayers([manualPlayer, approvedPlayer], { users });
  assert.equal(roster.length, 1);

  const request = createCoachDmConversationRequest(roster[0], COACH, { users, players: roster });
  const coachConversationId = request.id;
  const portalConversationId = dmConvId(COACH, resolvePlayerPortalMessagingId(approvedUser, { players: roster, users }));

  assert.equal(coachConversationId, 'dm:coach-demo:user_bee');
  assert.equal(coachConversationId, portalConversationId); // converge — player receives
});

// ── Simon Test Player identity must remain stable ─────────────────────────────

test('Simon Test Player canonical DM identity is unchanged by the merge fix', () => {
  const simonPlayer = { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' };
  const simonUser   = { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' };

  const portalId = resolvePlayerPortalMessagingId(simonUser, { players: [simonPlayer], users: [simonUser] });
  assert.equal(portalId, 'inv-YxnjxnQa');
});
