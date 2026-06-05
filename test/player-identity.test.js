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

test('existing player identities keep their message conversation ids', () => {
  const users = [
    { id: 'coach-demo', role: 'coach', name: 'Simon Dodd' },
    { id: 'player-nick', role: 'player', name: 'Nick Player', playerId: 'inv-nick1234' },
  ];
  const player = { id: 'inv-nick1234', name: 'Nick Player', position: 'Wing' };

  const linkedUsers = ensurePlayerUserForRosterPlayer(users, player);
  const nickUser = linkedUsers.find(user => user.name === 'Nick Player');

  assert.equal(nickUser.playerId, 'inv-nick1234');
  assert.equal(playerCoachConversationIdForPlayer(player, 'coach-demo', dmConvId), 'dm:coach-demo:inv-nick1234');
  assert.equal(dmConvId('coach-demo', nickUser.playerId), 'dm:coach-demo:inv-nick1234');
});

test('existing seeded legacy users keep Simon and Nick Redis conversation ids', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
    { id: 'player-nick', role: 'player', name: 'Nick Player', playerId: 'inv-nick1234' },
  ];
  const simonPlayer = { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' };
  const nickPlayer = { id: 'inv-nick1234', name: 'Nick Player', position: 'Wing' };

  assert.equal(resolveMessagingParticipantId(simonPlayer, { users }), 'inv-YxnjxnQa');
  assert.equal(resolvePlayerPortalMessagingId(users[0], { players: [simonPlayer, nickPlayer], users }), 'inv-YxnjxnQa');
  assert.equal(dmConvId('coach-demo', resolveMessagingParticipantId(simonPlayer, { users })), 'dm:coach-demo:inv-YxnjxnQa');

  assert.equal(resolveMessagingParticipantId(nickPlayer, { users }), 'inv-nick1234');
  assert.equal(resolvePlayerPortalMessagingId(users[1], { players: [simonPlayer, nickPlayer], users }), 'inv-nick1234');
  assert.equal(dmConvId('coach-demo', resolveMessagingParticipantId(nickPlayer, { users })), 'dm:coach-demo:inv-nick1234');
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

test('approved permanent users are preferred over manual roster ids for coach DMs', () => {
  const manualDodsyPlayer = {
    id: 'p-dodsy-001',
    name: 'DodsyPlayer',
    position: 'TBC',
    email: 'dodsyplayer@test.com',
  };
  const approvedDodsyPlayer = {
    id: 'user_dodsy_approved',
    userId: 'user_dodsy_approved',
    name: 'Dodsy Player',
    position: 'TBC',
    email: 'dodsyplayer@test.com',
  };
  const approvedDodsyUser = {
    id: 'user_dodsy_approved',
    role: 'player',
    name: 'Dodsy Player',
    email: 'dodsyplayer@test.com',
    playerId: 'user_dodsy_approved',
  };
  const context = { users: [approvedDodsyUser], players: [manualDodsyPlayer, approvedDodsyPlayer] };

  assert.equal(resolveMessagingParticipantId(manualDodsyPlayer, context), 'user_dodsy_approved');
  assert.equal(resolveMessagingParticipantId(approvedDodsyPlayer, context), 'user_dodsy_approved');
  assert.equal(resolvePlayerPortalMessagingId(approvedDodsyUser, context), 'user_dodsy_approved');
  assert.equal(
    dmConvId('coach-demo', resolveMessagingParticipantId(manualDodsyPlayer, context)),
    dmConvId('coach-demo', resolvePlayerPortalMessagingId(approvedDodsyUser, context))
  );
});

test('legacy players without permanent userId still fall back to roster player id', () => {
  const legacyPlayer = { id: 'p-legacy-001', name: 'Legacy Player', position: 'Prop' };

  assert.equal(resolveMessagingParticipantId(legacyPlayer, { users: [] }), 'p-legacy-001');
  assert.equal(playerCoachConversationIdForPlayer(legacyPlayer, 'coach-demo', dmConvId), 'dm:coach-demo:p-legacy-001');
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

test('refresh logout login keeps approved player on the same direct-message Redis key', () => {
  const approvedUser = {
    id: 'user_dodsy_approved',
    role: 'player',
    name: 'Dodsy Player',
    email: 'dodsyplayer@test.com',
    playerId: 'user_dodsy_approved',
  };
  const rosterBeforeRefresh = [
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com', position: 'TBC' },
  ];
  const rosterAfterLogin = [
    ...rosterBeforeRefresh,
    { id: approvedUser.id, userId: approvedUser.id, name: 'Dodsy Player', email: approvedUser.email, position: 'TBC' },
  ];
  const contextBefore = { users: [approvedUser], players: rosterBeforeRefresh };
  const contextAfter = { users: [approvedUser], players: rosterAfterLogin };
  const coachConvId = dmConvId('coach-demo', resolveMessagingParticipantId(rosterBeforeRefresh[0], contextBefore));
  const storedMessages = {
    [coachConvId]: [
      { id: 'm1', convId: coachConvId, senderId: 'coach-demo', text: 'hello Dodsy', ts: 1 },
    ],
  };
  const playerConvIdAfterLogin = dmConvId('coach-demo', resolvePlayerPortalMessagingId(approvedUser, contextAfter));

  assert.equal(coachConvId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(playerConvIdAfterLogin, coachConvId);
  assert.equal(storedMessages[playerConvIdAfterLogin][0].text, 'hello Dodsy');
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

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'inv-YxnjxnQa');
  assert.equal(resolveMessagingParticipantId(deduped[0], { users }), 'inv-YxnjxnQa');
  assert.equal(dmConvId('coach-demo', resolveMessagingParticipantId(deduped[0], { users })), 'dm:coach-demo:inv-YxnjxnQa');
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
  assert.equal(audit.canonicalPlayers.some(player => player.id === 'inv-YxnjxnQa'), true);
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
    ['Simon Test Player', 'inv-YxnjxnQa'],
    ['Dodsy Player', 'user_dodsy_approved'],
  ]);
  assert.equal(accounts.some(account => account.id === 'player-dodsy-compat'), false);
  assert.equal(accounts.some(account => account.id === 'user_dodsy_approved'), true);
});
