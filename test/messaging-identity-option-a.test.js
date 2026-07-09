/**
 * Beta messaging identity normalization — Option A ("clean reset for Beta").
 *
 * The invariant this file locks in:
 *
 *     ONE authenticated userId = ONE messaging identity = ONE DM thread = ONE unread count.
 *
 * These tests prove the identity RULES directly (not the UI), guarding against a
 * regression back to the name/legacy/email heuristics that produced the
 * "Simon Coach / Simon2Coach / Simon Dodd" confusion, the phantom 9+ unread, and
 * the self-DM contact:
 *
 *   1. Chat identity is the authenticated user.id only — no name-based aliases,
 *      no legacyPlayerId, no `inv-` invention.
 *   2. A roster player is messageable ONLY when linked to a userId (its own
 *      userId, or a user whose playerId points at it) — otherwise blocked.
 *   3. The API read gate grants access by the authenticated userId only — a
 *      session's email / legacyPlayerId no longer expand its DM access.
 *   4. Coach ↔ coach and coach ↔ (linked) player DMs converge on one userId thread.
 *   5. A self-DM resolves to no counterpart id, so the contact list drops it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMessagingParticipantId,
  resolvePlayerPortalMessagingId,
} from '../src/player-identity.js';
import {
  dmConvId,
  createCoachDmConversationRequestForPlayerId,
  directConversationParticipantId,
} from '../src/chat-state.js';
import { sessionCanReadConversation } from '../api/chat.js';

const COACH = 'coach-demo';

// ── Rule 1: portal messaging id is the authenticated user.id, full stop ───────

test('portal messaging id is the authenticated user.id — no name/legacy alias', () => {
  // Historically "Simon Test Player" was hard-mapped to inv-YxnjxnQa and other
  // users fell back to playerId/legacyPlayerId. Option A: always the account id.
  const simon = { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' };
  assert.equal(resolvePlayerPortalMessagingId(simon, { players: [], users: [simon] }), 'player-simon-test');

  const coach = { id: 'coach-demo', role: 'coach', name: 'Simon Coach' };
  assert.equal(resolvePlayerPortalMessagingId(coach, { players: [], users: [coach] }), 'coach-demo');

  // Even with a legacy id sitting on the account, the messaging id ignores it.
  const withLegacy = { id: 'user_abc', role: 'player', name: 'Whoever', playerId: 'inv-legacy', legacyPlayerId: 'inv-legacy' };
  assert.equal(resolvePlayerPortalMessagingId(withLegacy, { players: [], users: [withLegacy] }), 'user_abc');
});

// ── Rule 2: a roster player is messageable only when linked to a userId ───────

test('resolveMessagingParticipantId prefers the player\'s own userId', () => {
  const player = { id: 'p-1', userId: 'user_1', name: 'Linked Player' };
  assert.equal(resolveMessagingParticipantId(player, { users: [] }), 'user_1');
});

test('resolveMessagingParticipantId links via a user whose playerId points at the record', () => {
  const player = { id: 'p-2', name: 'Roster Only' }; // no userId on the record…
  const users = [{ id: 'user_2', role: 'player', name: 'Roster Only', playerId: 'p-2' }]; // …but a user links to it
  assert.equal(resolveMessagingParticipantId(player, { users }), 'user_2');
});

test('resolveMessagingParticipantId BLOCKS (empty) an unlinked roster player — no legacy id invented', () => {
  const invitePlayer = { id: 'inv-aa', name: 'Unregistered Invitee', email: 'x@club.com' }; // no userId, no linking user
  assert.equal(resolveMessagingParticipantId(invitePlayer, { users: [] }), '');
  // A user that merely shares the email but does NOT link by playerId must not rescue it.
  const emailOnlyUser = [{ id: 'user_x', role: 'player', name: 'Someone Else', playerId: 'user_x', email: 'x@club.com' }];
  assert.equal(resolveMessagingParticipantId(invitePlayer, { users: emailOnlyUser }), '', 'no email-based expansion');
});

// ── Rule 3: API read gate grants access by authenticated userId only ──────────

test('read gate: player can read their OWN userId DM', () => {
  const session = {
    user: { id: 'user_1', role: 'player' },
    playerProfile: { userId: 'user_1', legacyPlayerId: 'inv-old' },
  };
  const conv = { id: dmConvId(COACH, 'user_1'), type: 'DIRECT', participants: [COACH, 'user_1'] };
  // Live handler always passes the userId-only actorIds; mirror that here.
  const actorIds = ['user_1'];
  assert.equal(sessionCanReadConversation(session, conv, actorIds), true);
});

test('read gate: a legacyPlayerId on the session does NOT grant access to a legacy-keyed DM', () => {
  // The session carries legacyPlayerId inv-old (as real sessions do), but access
  // is keyed on the authenticated userId only — so a DM addressed to the legacy id
  // is NOT readable. This is the cross-account bleed fix.
  const session = {
    user: { id: 'user_1', role: 'player' },
    playerProfile: { userId: 'user_1', legacyPlayerId: 'inv-old' },
  };
  const legacyConv = { id: dmConvId(COACH, 'inv-old'), type: 'DIRECT', participants: [COACH, 'inv-old'] };
  const actorIds = ['user_1']; // what actorIdsForSession now returns
  assert.equal(sessionCanReadConversation(session, legacyConv, actorIds), false);
});

test('read gate: a different account sharing nothing but email cannot read the DM', () => {
  const other = { user: { id: 'user_2', role: 'player' }, playerProfile: { userId: 'user_2' } };
  const conv = { id: dmConvId(COACH, 'user_1'), type: 'DIRECT', participants: [COACH, 'user_1'] };
  assert.equal(sessionCanReadConversation(other, conv, ['user_2']), false);
});

// ── Rule 4: DM threads converge on one userId ─────────────────────────────────

test('coach ↔ coach DM resolves to a single userId thread', () => {
  const a = 'coach-demo';
  const b = 'user_assistant_coach';
  const conv = dmConvId(a, b);
  assert.equal(conv, dmConvId(b, a), 'order-independent');
  assert.equal(conv, 'dm:coach-demo:user_assistant_coach');
});

test('coach → player DM works only when the player is linked to a userId', () => {
  const linkedRoster = [{ id: 'user_p', userId: 'user_p', name: 'Linked', email: 'p@club.com' }];
  const linkedUsers = [{ id: 'user_p', role: 'player', name: 'Linked', playerId: 'user_p', email: 'p@club.com' }];
  const okReq = createCoachDmConversationRequestForPlayerId(
    linkedRoster, 'user_p', COACH, { users: linkedUsers, players: linkedRoster });
  assert.ok(okReq, 'linked player DM is created');
  assert.deepEqual([...okReq.participants].sort(), ['coach-demo', 'user_p'].sort());
  assert.equal(okReq.id, 'dm:coach-demo:user_p');

  // Unlinked roster record (no userId, no linking user) → blocked.
  const unlinkedRoster = [{ id: 'p-unlinked', name: 'Unregistered', email: 'u@club.com' }];
  const blockedReq = createCoachDmConversationRequestForPlayerId(
    unlinkedRoster, 'p-unlinked', COACH, { users: [], players: unlinkedRoster });
  assert.equal(blockedReq, null, 'unlinked player DM is blocked, not invented');
});

// ── Rule 5: a self-DM has no counterpart id, so the UI drops it ───────────────

test('self-DM resolves to no counterpart id (contact list drops it)', () => {
  const me = 'user_self';
  // Both participants are me — e.g. the historical self-contact.
  const selfConv = { id: `dm:${me}:${me}`, type: 'DIRECT', participants: [me, me] };
  assert.equal(directConversationParticipantId(selfConv, me), '', 'no other participant → dropped');

  // A normal DM still resolves to the counterpart.
  const realConv = { id: dmConvId(me, 'user_other'), type: 'DIRECT', participants: [me, 'user_other'] };
  assert.equal(directConversationParticipantId(realConv, me), 'user_other');
});
