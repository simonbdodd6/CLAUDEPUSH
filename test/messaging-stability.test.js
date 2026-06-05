/**
 * Regression tests for messaging stability issues:
 * - Render loop prevention: verifies the state-module helpers that back the guard
 * - Poll cursor initialization: conversation ID consistency so first-tick doesn't re-fetch
 * - Duplicate conversations: deduplication under mixed identity scenarios
 * - Player switching: stable DM IDs across account switches
 * - Message delivery: coach ↔ player conversation ID alignment
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCoachDmConversationRequest,
  createCoachDmConversationRequestForPlayerId,
  dedupeDirectConversations,
  dmConvId,
  filterCoachDmPlayers,
  mergeMessages,
} from '../src/chat-state.js';

import {
  dedupeRosterPlayers,
  resolveMessagingParticipantId,
  resolvePlayerPortalMessagingId,
  canonicalIdentityAudit,
} from '../src/player-identity.js';

// ─── Render-loop prevention ────────────────────────────────────────────────
// The DOM guard (_chatShellRendered / feedExists) lives in index.html and cannot
// be unit-tested here. These tests verify that the state helpers it depends on
// produce stable, deterministic output so repeated calls from render() cannot
// accumulate side effects.

test('dedupeRosterPlayers is idempotent — calling it twice returns the same result', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'p-dodsy-001',  name: 'DodsyPlayer', email: 'dodsyplayer@test.com', position: 'SUB' },
    { id: 'p-doddsy-002', name: 'Doddsy player', position: 'Centre' },
  ];
  const users = [
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];

  const first  = dedupeRosterPlayers(players, { users });
  const second = dedupeRosterPlayers(first, { users });

  assert.deepEqual(first.map(p => p.id), second.map(p => p.id),
    'double dedup must not change the set of IDs');
  assert.equal(players[0].id, 'inv-YxnjxnQa', 'source array must not be mutated');
});

test('dedupeRosterPlayers called multiple times in quick succession does not grow the list', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'player-simon-test', name: 'Simon Test Player', legacyPlayerId: 'inv-YxnjxnQa' },
    { id: 'inv-nick1234',  name: 'Nick Player', position: 'Wing' },
  ];
  const context = { users: [] };

  const result = dedupeRosterPlayers(dedupeRosterPlayers(players, context), context);

  // Should be 2 canonical players, not 3 (Simon duplicates merge)
  assert.equal(result.length, 2, `expected 2 players, got ${result.length}`);
});

// ─── Poll cursor / conversation ID stability ───────────────────────────────
// The poll cursor _chatLastPoll[convId] is seeded with Date.now() at startup
// so the first 2500ms tick only fetches NEW messages. These tests verify that
// the conversation IDs are stable (same coach ID and same portal ID) so the
// cursor is always read from the right key.

test('dmConvId is commutative and stable across multiple calls', () => {
  const coachId = 'coach-demo';
  const playerId = 'inv-YxnjxnQa';

  const id1 = dmConvId(coachId, playerId);
  const id2 = dmConvId(playerId, coachId);
  const id3 = dmConvId(coachId, playerId);

  assert.equal(id1, id2, 'commutative');
  assert.equal(id1, id3, 'stable across calls');
});

test('coach-side and player-side conversation IDs match for legacy invite player', () => {
  const coachId = 'coach-demo';
  const player = { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' };
  const user   = { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' };
  const context = { users: [user], players: [player] };

  // What the coach creates when starting a DM
  const coachConvId = dmConvId(coachId, resolveMessagingParticipantId(player, context));

  // What the player portal resolves for their inbox
  const portalId = resolvePlayerPortalMessagingId(user, context);
  const portalConvId = dmConvId(coachId, portalId);

  assert.equal(coachConvId, portalConvId,
    `coach creates ${coachConvId} but player reads ${portalConvId} — messages would be invisible`);
});

test('coach-side and player-side conversation IDs match for approved permanent user', () => {
  const coachId = 'coach-demo';
  const player = { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com' };
  const user   = { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' };
  const context = { users: [user], players: [player] };

  const coachConvId  = dmConvId(coachId, resolveMessagingParticipantId(player, context));
  const portalId     = resolvePlayerPortalMessagingId(user, context);
  const portalConvId = dmConvId(coachId, portalId);

  assert.equal(coachConvId, portalConvId);
  assert.equal(coachConvId, 'dm:coach-demo:user_dodsy_approved');
});

// ─── Duplicate conversations ──────────────────────────────────────────────
// When render() is called many times, chatBuildContacts is called each time.
// If the roster has duplicate entries, multiple DM contacts are generated for
// the same player. dedupeDirectConversations must collapse them.

test('duplicate roster entries do not create visible duplicate DM conversations', () => {
  const users = [
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'p-dodsy-001',  name: 'DodsyPlayer', email: 'dodsyplayer@test.com' },
    { id: 'p-doddsy-002', name: 'Doddsy player' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com' },
  ];

  // Simulate what chatBuildContacts generates for each roster entry
  const coachId = 'coach-demo';
  const canonical = dedupeRosterPlayers(players, { users });
  const rawContacts = canonical.map(p => ({
    id: dmConvId(coachId, resolveMessagingParticipantId(p, { users })),
    name: p.name, type: 'DIRECT',
    participants: [coachId, resolveMessagingParticipantId(p, { users })],
  }));

  const deduped = dedupeDirectConversations(rawContacts, coachId, { users, players });

  // After dedup there should be exactly ONE Dodsy conversation
  const dodsyConvs = deduped.filter(c => c.name?.toLowerCase().includes('dods'));
  assert.equal(dodsyConvs.length, 1, `expected 1 Dodsy DM, got ${dodsyConvs.length}: ${dodsyConvs.map(c => c.id).join(', ')}`);
});

test('three duplicate Simon entries collapse to one conversation in sidebar', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'test-simon-extra', name: 'Simon Test Player' },
  ];
  const coachId = 'coach-demo';

  const canonical = dedupeRosterPlayers(players, { users });
  const rawContacts = canonical.map(p => ({
    id: dmConvId(coachId, resolveMessagingParticipantId(p, { users })),
    name: p.name, type: 'DIRECT',
    participants: [coachId, resolveMessagingParticipantId(p, { users })],
  }));
  const deduped = dedupeDirectConversations(rawContacts, coachId, { users, players });
  const simonConvs = deduped.filter(c => c.name?.toLowerCase().includes('simon'));

  assert.equal(simonConvs.length, 1, `expected 1 Simon DM, got ${simonConvs.length}`);
});

test('group channels are never deduplicated against direct messages', () => {
  const users = [
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player' },
  ];
  const conversations = [
    { id: 'squad', name: 'Squad', type: 'GROUP' },
    { id: 'announce', name: 'Announcements', type: 'ANNOUNCEMENT' },
    { id: 'coaching', name: 'Coaching Team', type: 'GROUP' },
    { id: 'dm:coach-demo:user_dodsy_approved', name: 'Dodsy Player', type: 'DIRECT', participants: ['coach-demo', 'user_dodsy_approved'] },
    { id: 'dm:coach-demo:user_dodsy_approved', name: 'Dodsy Player duplicate', type: 'DIRECT', participants: ['coach-demo', 'user_dodsy_approved'] },
  ];

  const deduped = dedupeDirectConversations(conversations, 'coach-demo', { users, players });

  assert.equal(deduped.filter(c => c.id === 'squad').length, 1,    'squad preserved once');
  assert.equal(deduped.filter(c => c.id === 'announce').length, 1, 'announce preserved once');
  assert.equal(deduped.filter(c => c.id === 'coaching').length, 1, 'coaching preserved once');
  assert.equal(deduped.filter(c => c.type === 'DIRECT').length, 1, 'one DM after dedup');
});

// ─── Player switching ──────────────────────────────────────────────────────
// When the coach or player switches accounts, the conversation ID must not
// change mid-session (it comes from the resolved participant ID, not the UI state).

test('player switching to a different account does not corrupt existing DM key', () => {
  const coachId  = 'coach-demo';
  const simonPlayer = { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' };
  const nickPlayer  = { id: 'inv-nick1234',  name: 'Nick Player', position: 'Wing' };
  const players = [simonPlayer, nickPlayer];

  // Simulate coach switching between Simon and Nick
  const simonRequest = createCoachDmConversationRequestForPlayerId(players, 'inv-YxnjxnQa', coachId);
  const nickRequest  = createCoachDmConversationRequestForPlayerId(players, 'inv-nick1234', coachId);

  assert.equal(simonRequest.id, 'dm:coach-demo:inv-YxnjxnQa');
  assert.equal(nickRequest.id,  'dm:coach-demo:inv-nick1234');
  assert.notEqual(simonRequest.id, nickRequest.id, 'switching players must give different conv IDs');

  // Switching back to Simon must return the original key
  const simonAgain = createCoachDmConversationRequestForPlayerId(players, 'inv-YxnjxnQa', coachId);
  assert.equal(simonAgain.id, simonRequest.id, 'switching back must restore original conv ID');
});

test('player portal DM ID is stable when player logs in then switches back', () => {
  const coachId = 'coach-demo';
  const user = { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' };
  const player = { id: 'inv-YxnjxnQa', name: 'Simon Test Player' };
  const context = { users: [user], players: [player] };

  // First session
  const id1 = resolvePlayerPortalMessagingId(user, context);
  // "refresh" — same call must return the same ID
  const id2 = resolvePlayerPortalMessagingId(user, context);

  assert.equal(id1, id2, 'portal ID must not change between calls');
  assert.equal(dmConvId(coachId, id1), 'dm:coach-demo:inv-YxnjxnQa');
});

// ─── Message delivery ──────────────────────────────────────────────────────
// Core message merge must handle all the delivery scenarios that happen in
// the live polling loop without corrupting history.

test('poll returning only new messages does not collapse existing history', () => {
  const convId = 'dm:coach-demo:inv-YxnjxnQa';
  const existing = [
    { id: 'm1', convId, senderId: 'coach-demo', text: 'Hello', ts: 1000 },
    { id: 'm2', convId, senderId: 'inv-YxnjxnQa', text: 'Hi coach', ts: 2000 },
    { id: 'm3', convId, senderId: 'coach-demo', text: 'How are you?', ts: 3000 },
  ];
  // Poll returns only the newest message (as happens with since=timestamp)
  const polled = [
    { id: 'm4', convId, senderId: 'inv-YxnjxnQa', text: 'Great!', ts: 4000 },
  ];

  const merged = mergeMessages(existing, polled);

  assert.equal(merged.length, 4, 'all 4 messages visible after poll');
  assert.deepEqual(merged.map(m => m.id), ['m1', 'm2', 'm3', 'm4']);
});

test('optimistic message is replaced by server confirmation without duplicates', () => {
  const convId = 'dm:coach-demo:inv-YxnjxnQa';
  const senderId = 'coach-demo';
  const ts = 5000;

  let messages = [];
  // Optimistic send
  messages = mergeMessages(messages, [
    { id: 'opt_abc', convId, senderId, text: 'Test message', ts, _optimistic: true },
  ]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]._optimistic, true);

  // Server confirmation
  messages = mergeMessages(messages, [
    { id: 'msg_server_123', convId, senderId, text: 'Test message', ts: ts + 30 },
  ]);

  assert.equal(messages.length, 1, 'no duplicate after confirmation');
  assert.equal(messages[0].id, 'msg_server_123');
  assert.equal(messages[0]._optimistic, undefined);
});

test('coach message is visible from player perspective with correct convId', () => {
  const coachId = 'coach-demo';
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'inv-nick1234',  name: 'Nick Player' },
  ];
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
  ];
  const context = { users, players };

  // Coach targets Simon
  const request = createCoachDmConversationRequest(players[0], coachId, context);
  const coachConvId = request.id;

  // Simon's portal must read from the same key
  const simonPortalId = resolvePlayerPortalMessagingId(users[0], context);
  const playerConvId = dmConvId(coachId, simonPortalId);

  assert.equal(coachConvId, playerConvId,
    `Coach writes to ${coachConvId} but Simon reads ${playerConvId}`);

  // Nick should NOT see Simon's conversation
  const nickUsers = [{ id: 'player-nick', role: 'player', name: 'Nick Player', playerId: 'inv-nick1234' }];
  const nickPortalId = resolvePlayerPortalMessagingId(nickUsers[0], { users: nickUsers, players });
  const nickConvId = dmConvId(coachId, nickPortalId);

  assert.notEqual(nickConvId, coachConvId, 'Nick must not share Simon\'s DM');
});

// ─── Identity audit ────────────────────────────────────────────────────────
// Verifies that the audit system correctly identifies real duplicate records
// so the cleanup plan can be executed safely.

test('identity audit detects legacy test accounts as duplicates of real player records', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player' },
  ];
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
  ];

  const { duplicates } = canonicalIdentityAudit({ users, players });

  const simonDuplicates = duplicates.filter(g =>
    g.records.some(r => r.name?.toLowerCase().includes('simon test'))
  );
  assert.ok(simonDuplicates.length > 0, 'Simon Test Player duplicate group must be detected');
  const simonGroup = simonDuplicates[0];
  assert.ok(simonGroup.records.length >= 2, `expected ≥2 Simon records, found ${simonGroup.records.length}`);
});
