import test from 'node:test';
import assert from 'node:assert/strict';

import { dmConvId } from '../src/chat-state.js';
import {
  canonicalAccountOptions,
  canonicalIdentityAudit,
  canonicalIdentityDisplayName,
  canonicalIdentityNameKey,
  dedupeRosterPlayers,
  ensurePlayerUserForRosterPlayer,
  ensurePlayerUsersForRoster,
  resolveMessagingParticipantId,
  resolvePlayerPortalMessagingId,
  playerCoachConversationIdForPlayer,
} from '../src/player-identity.js';

// Beta Option A — messaging identity is normalized to the authenticated userId.
// Legacy inv-… / player-… ids no longer produce a messaging identity (intentional
// reset). A roster entry with a real userId resolves to that userId.
test('messaging identity resolves to the linked authenticated userId', () => {
  const users = [
    { id: 'coach-demo', role: 'coach', name: 'Simon Dodd' },
    { id: 'user_nick_123', role: 'player', name: 'Nick Player', playerId: 'user_nick_123' },
  ];
  const registeredPlayer = { id: 'user_nick_123', userId: 'user_nick_123', name: 'Nick Player', position: 'Wing' };

  assert.equal(resolveMessagingParticipantId(registeredPlayer, { users }), 'user_nick_123');
  assert.equal(playerCoachConversationIdForPlayer(registeredPlayer, 'coach-demo', dmConvId), 'dm:coach-demo:user_nick_123');
});

test('legacy seeded inv-/name identities NO LONGER resolve to a legacy messaging id (reset)', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
  ];
  const simonPlayer = { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' }; // no userId link

  // No linked userId → blocked (''), not the old hardcoded inv-YxnjxnQa.
  assert.equal(resolveMessagingParticipantId(simonPlayer, { users }), '');
  // A user's own messaging id is ALWAYS their account id — no name-based alias.
  assert.equal(resolvePlayerPortalMessagingId(users[0], { players: [simonPlayer], users }), 'player-simon-test');
});

test('newly created roster players get a matching player user identity', () => {
  const users = [
    { id: 'coach-demo', role: 'coach', name: 'Simon Dodd' },
  ];
  const dodsyPlayer = {
    id: 'p-dodsy-001',
    name: 'DodsyPlayer',
    position: 'SUB',
    email: 'dodsyplayer@player.test',
  };

  const linkedUsers = ensurePlayerUserForRosterPlayer(users, dodsyPlayer);
  const dodsyUser = linkedUsers.find(user => user.name === 'DodsyPlayer');

  assert.equal(dodsyUser.role, 'player');
  assert.equal(dodsyUser.playerId, dodsyPlayer.id);
  assert.equal(dodsyUser.email, 'dodsyplayer@player.test');
});

test('a registered account resolves to its userId; a manual roster entry with no userId is blocked (no email/name merge)', () => {
  const manualDodsyPlayer = {
    id: 'p-dodsy-001', name: 'DodsyPlayer', position: 'TBC', email: 'dodsyplayer@test.com', // NO userId
  };
  const approvedDodsyPlayer = {
    id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', position: 'TBC', email: 'dodsyplayer@test.com',
  };
  const approvedDodsyUser = {
    id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved',
  };
  const context = { users: [approvedDodsyUser], players: [manualDodsyPlayer, approvedDodsyPlayer] };

  // Beta Option A: no email/name inference. The manual entry has no userId → blocked.
  assert.equal(resolveMessagingParticipantId(manualDodsyPlayer, context), '');
  assert.equal(resolveMessagingParticipantId(approvedDodsyPlayer, context), 'user_dodsy_approved');
  assert.equal(resolvePlayerPortalMessagingId(approvedDodsyUser, context), 'user_dodsy_approved');
});

test('a player without a linked userId returns NO messaging id (blocked, not a legacy roster id)', () => {
  const legacyPlayer = { id: 'p-legacy-001', name: 'Legacy Player', position: 'Prop' }; // no userId

  assert.equal(resolveMessagingParticipantId(legacyPlayer, { users: [] }), '');
  assert.equal(playerCoachConversationIdForPlayer(legacyPlayer, 'coach-demo', dmConvId), '');
});

test('coach and newly created player resolve the same direct-message conversation id', () => {
  const dodsyPlayer = { id: 'p-dodsy-001', name: 'DodsyPlayer', position: 'SUB' };
  const linkedUsers = ensurePlayerUserForRosterPlayer([], dodsyPlayer);
  const dodsyUser = linkedUsers.find(user => user.name === 'DodsyPlayer');

  const coachConvId = dmConvId('coach-demo', dodsyPlayer.id);
  const playerPortalConvId = dmConvId('coach-demo', dodsyUser.playerId);

  assert.equal(coachConvId, 'dm:coach-demo:p-dodsy-001');
  assert.equal(playerPortalConvId, coachConvId);
});

test('a coach DM to a REGISTERED player uses the userId key and persists across login', () => {
  const approvedUser = {
    id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player',
    email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved',
  };
  // Beta Option A: DMs address the registered account (has a userId). A manual
  // no-userId roster entry is not messageable, so the coach messages the account.
  const roster = [
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: approvedUser.email, position: 'TBC' },
  ];
  const context = { users: [approvedUser], players: roster };
  const coachConvId = dmConvId('coach-demo', resolveMessagingParticipantId(roster[0], context));
  const playerConvIdAfterLogin = dmConvId('coach-demo', resolvePlayerPortalMessagingId(approvedUser, context));

  assert.equal(coachConvId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(playerConvIdAfterLogin, coachConvId, 'same userId key on both sides, across login');
});

test('availability player records are preserved while identity users are added', () => {
  const players = [
    { id: 'p-dodsy-001', name: 'DodsyPlayer', position: 'SUB', trainingTuesday: 'available', game: 'maybe' },
  ];
  const before = JSON.stringify(players);
  const linkedUsers = ensurePlayerUsersForRoster(players, []);

  assert.equal(JSON.stringify(players), before);
  assert.equal(linkedUsers[0].playerId, 'p-dodsy-001');
  assert.equal(players[0].trainingTuesday, 'available');
  assert.equal(players[0].game, 'maybe');
});

test('existing direct conversations remain intact when user identity is repaired', () => {
  const existingConvId = 'dm:coach-demo:inv-YxnjxnQa';
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', position: 'SUB' },
  ];

  const linkedUsers = ensurePlayerUsersForRoster(players, users);
  const simonUser = linkedUsers.find(user => user.name === 'Simon Test Player');
  const dodsyUser = linkedUsers.find(user => user.name === 'DodsyPlayer');

  assert.equal(dmConvId('coach-demo', simonUser.playerId), existingConvId);
  assert.equal(dmConvId('coach-demo', dodsyUser.playerId), 'dm:coach-demo:p-dodsy-001');
});

test('canonical member list removes duplicate Simon Test Player compatibility rows', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', email: 'simon.test.player@player.test', playerId: 'inv-YxnjxnQa' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC', trainingTuesday: 'available' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player', email: 'simon.test.player@player.test', position: 'TBC' },
  ];

  const deduped = dedupeRosterPlayers(players, { users });

  // Beta Option A: dedup keeps the row carrying a real userId; messaging id = that userId.
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].userId || deduped[0].id, 'player-simon-test');
  assert.equal(resolveMessagingParticipantId(deduped[0], { users }), 'player-simon-test');
  assert.equal(dmConvId('coach-demo', resolveMessagingParticipantId(deduped[0], { users })), 'dm:coach-demo:player-simon-test');
  assert.equal(deduped[0].trainingTuesday, 'available');
});

test('canonical member list prefers approved Dodsy permanent user over manual roster duplicate', () => {
  const users = [
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com', position: 'SUB', game: 'available' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com', position: 'TBC' },
  ];

  const deduped = dedupeRosterPlayers(players, { users });

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'user_dodsy_approved');
  assert.equal(deduped[0].userId, 'user_dodsy_approved');
  assert.equal(deduped[0].game, 'available');
  assert.equal(resolveMessagingParticipantId(deduped[0], { users }), 'user_dodsy_approved');
  assert.equal(
    dmConvId('coach-demo', resolveMessagingParticipantId(deduped[0], { users })),
    dmConvId('coach-demo', resolvePlayerPortalMessagingId(users[0], { players: deduped, users }))
  );
});

test('canonical member list has no duplicate user ids emails or names', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', email: 'simon.test.player@player.test', playerId: 'inv-YxnjxnQa' },
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', email: '', position: 'TBC' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player', email: 'simon.test.player@player.test', position: 'TBC' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com', position: 'SUB' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com', position: 'TBC' },
    { id: 'inv-nick1234', name: 'Nick Player', email: 'nick.player@player.test', position: 'Wing' },
  ];

  const deduped = dedupeRosterPlayers(players, { users });
  const userIds = deduped.map(player => player.userId || player.id).filter(Boolean);
  const emails = deduped.map(player => String(player.email || '').toLowerCase()).filter(Boolean);
  const names = deduped.map(player => String(player.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);

  assert.equal(deduped.length, 3);
  assert.equal(new Set(userIds).size, userIds.length);
  assert.equal(new Set(emails).size, emails.length);
  assert.equal(new Set(names).size, names.length);
});

test('DodsyPlayer and Doddsy player aliases merge into one canonical Dodsy Player', () => {
  const users = [
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com', position: 'SUB', trainingTuesday: 'available' },
    { id: 'p-doddsy-002', name: 'Doddsy player', email: '', position: 'Wing', game: 'maybe' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com', position: 'TBC' },
  ];

  const deduped = dedupeRosterPlayers(players, { users });

  assert.equal(canonicalIdentityNameKey('Doddsy player'), 'dodsyplayer');
  assert.equal(canonicalIdentityDisplayName('DodsyPlayer'), 'Dodsy Player');
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'user_dodsy_approved');
  assert.equal(deduped[0].name, 'Dodsy Player');
  assert.equal(deduped[0].trainingTuesday, 'available');
  assert.equal(deduped[0].game, 'maybe');
  assert.equal(resolveMessagingParticipantId(deduped[0], { users }), 'user_dodsy_approved');
});

test('identity audit reports duplicate source mappings without rewriting history keys', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com' },
    { id: 'p-doddsy-002', name: 'Doddsy player' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com' },
  ];
  const audit = canonicalIdentityAudit({
    users,
    players,
    teamMembers: [
      { id: 'tm_simon', userId: 'player-simon-test', teamId: 'boitsfort-rfc' },
      { id: 'tm_dodsy', userId: 'user_dodsy_approved', teamId: 'boitsfort-rfc' },
    ],
    playerProfiles: [
      { id: 'profile_simon', userId: 'player-simon-test', displayName: 'Simon Test Player', legacyPlayerId: 'inv-YxnjxnQa' },
      { id: 'profile_dodsy', userId: 'user_dodsy_approved', displayName: 'DodsyPlayer', legacyPlayerId: 'p-dodsy-001' },
    ],
  });

  assert.equal(audit.canonicalPlayers.length, 2);
  assert.equal(audit.canonicalPlayers.some(player => player.id === 'player-simon-test'), true);
  assert.equal(audit.canonicalPlayers.some(player => player.id === 'user_dodsy_approved'), true);
  assert.equal(audit.duplicates.some(group => group.canonicalKey === 'simontestplayer'), true);
  assert.equal(audit.duplicates.some(group => group.canonicalKey === 'dodsyplayer'), true);
});

test('canonical account switcher shows valid accounts only and selects correct player ids', () => {
  const users = [
    { id: 'coach-demo', role: 'coach', name: 'Simon Dodd', email: 'simonbdodd@gmail.com' },
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
    { id: 'player-dodsy-compat', role: 'player', name: 'DodsyPlayer', email: 'dodsyplayer@test.com', playerId: 'p-dodsy-001' },
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com' },
    { id: 'p-doddsy-002', name: 'Doddsy player' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com' },
  ];

  const accounts = canonicalAccountOptions({ users, players });
  const playerAccounts = accounts.filter(account => account.role === 'player');

  assert.deepEqual(playerAccounts.map(account => [account.name, account.playerId]), [
    ['Simon Test Player', 'player-simon-test'],
    ['Dodsy Player', 'user_dodsy_approved'],
  ]);
  assert.equal(accounts.some(account => account.id === 'player-dodsy-compat'), false);
  assert.equal(accounts.some(account => account.id === 'user_dodsy_approved'), true);
});

// ── Group-invite collision: two different people who share a legacyPlayerId (the
//    same group invite link) must NOT be merged into one roster row. Production bug:
//    "Nick Test" and "Simon Dodd" both joined via inv-85OWG7OJ, so Nick was absorbed
//    into Simon's row and only 3 of 4 players showed in Members. ───────────────────
test('two people sharing a group-invite legacyPlayerId stay as distinct roster rows', () => {
  const users = [
    { id: 'user_simon', role: 'player', name: 'Simon Dodd', playerId: 'user_simon' },
    { id: 'user_nick',  role: 'player', name: 'Nick Test',  playerId: 'user_nick' },
  ];
  const players = [
    { id: 'user_simon', userId: 'user_simon', legacyPlayerId: 'inv-85OWG7OJ', name: 'Simon Dodd', email: 'simon@x.com' },
    { id: 'user_nick',  userId: 'user_nick',  legacyPlayerId: 'inv-85OWG7OJ', name: 'Nick Test',  email: 'nick@x.com' },
  ];
  const deduped = dedupeRosterPlayers(players, { users });
  const names = deduped.map(p => p.name).sort();
  assert.deepEqual(names, ['Nick Test', 'Simon Dodd'], 'both distinct people survive the shared invite id');
});

test('a corrupted row whose id equals another person userId does not absorb them', () => {
  // Simon's row.id collides with Nick's userId (real production corruption shape).
  const users = [
    { id: 'user_simon', role: 'player', name: 'Simon Dodd', playerId: 'user_simon' },
    { id: 'user_nick',  role: 'player', name: 'Nick Test',  playerId: 'user_nick' },
  ];
  const players = [
    { id: 'user_nick', userId: 'user_simon', legacyPlayerId: 'inv-85OWG7OJ', name: 'Simon Dodd' }, // id == Nick's userId
    { id: 'user_nick', userId: 'user_nick',  legacyPlayerId: 'inv-85OWG7OJ', name: 'Nick Test'  },
  ];
  const deduped = dedupeRosterPlayers(players, { users });
  assert.equal(deduped.length, 2, 'two distinct permanent identities are not conflated');
});
