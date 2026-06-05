import test from 'node:test';
import assert from 'node:assert/strict';

import { dmConvId } from '../src/chat-state.js';
import {
  applyReadTimestamp,
  clearConversationUnread,
  hasUnreadBadge,
  readTimestamp,
  unreadBadgeText,
  unreadCountForUser,
  unreadForConversation,
  unreadNotificationState,
  unreadTotal,
} from '../src/chat-notifications.js';

function message(id, convId, senderId, text, ts) {
  return {
    id,
    convId,
    senderId,
    senderName: senderId === 'coach-demo' ? 'Simon Dodd' : senderId,
    text,
    ts,
    isDeleted: false,
  };
}

test('coach send creates unread count for Simon Test Player but not the sender', () => {
  const convId = dmConvId('coach-demo', 'inv-YxnjxnQa');
  const messages = [
    message('m1', convId, 'coach-demo', 'Training reminder', 1000),
  ];

  assert.equal(unreadCountForUser(messages, 'inv-YxnjxnQa', 0), 1);
  assert.equal(unreadCountForUser(messages, 'coach-demo', 0), 0);
});

test('mark as read clears unread count for Nick Player conversation', () => {
  const convId = dmConvId('coach-demo', 'inv-nick1234');
  const messages = [
    message('m1', convId, 'coach-demo', 'Can you play Saturday?', 1000),
    message('m2', convId, 'coach-demo', 'Need answer today', 2000),
  ];
  const readState = applyReadTimestamp({}, convId, 'inv-nick1234', 2500);

  assert.equal(unreadCountForUser(messages, 'inv-nick1234', readTimestamp(readState, convId, 'inv-nick1234')), 0);
});

test('unread badge state clears one conversation without clearing others', () => {
  const conversations = [
    { id: dmConvId('coach-demo', 'inv-YxnjxnQa'), name: 'Simon Test Player', unread: 2 },
    { id: dmConvId('coach-demo', 'inv-nick1234'), name: 'Nick Player', unread: 1 },
  ];
  const cleared = clearConversationUnread(conversations, dmConvId('coach-demo', 'inv-YxnjxnQa'));

  assert.equal(unreadTotal(conversations), 3);
  assert.equal(unreadTotal(cleared), 1);
  assert.equal(cleared.find(c => c.name === 'Nick Player').unread, 1);
});

test('conversation list shows unread badge/count before the player opens it', () => {
  const simonConvId = dmConvId('coach-demo', 'inv-YxnjxnQa');
  const conversations = [
    { id: simonConvId, name: 'Coach', unread: 3 },
    { id: 'squad', name: 'Squad', unread: 0 },
  ];

  assert.equal(unreadForConversation(conversations, simonConvId), 3);
  assert.equal(hasUnreadBadge(conversations, simonConvId), true);
  assert.equal(unreadBadgeText(unreadForConversation(conversations, simonConvId)), '3');
});

test('player portal notification badge displays total unread count', () => {
  const conversations = [
    { id: dmConvId('coach-demo', 'inv-YxnjxnQa'), name: 'Coach', unread: 2 },
    { id: 'squad', name: 'Squad', unread: 1 },
    { id: 'announce', name: 'Announcements', unread: 0 },
  ];

  assert.deepEqual(unreadNotificationState(conversations), {
    total: 3,
    hasBadge: true,
    badgeText: '3',
  });
});

test('player portal notification badge caps large unread counts', () => {
  const conversations = [
    { id: dmConvId('coach-demo', 'user-dodsy-player'), name: 'Coach', unread: 7 },
    { id: 'squad', name: 'Squad', unread: 5 },
  ];

  assert.deepEqual(unreadNotificationState(conversations), {
    total: 12,
    hasBadge: true,
    badgeText: '9+',
  });
});

test('opening a conversation clears its unread badge and nav total', () => {
  const simonConvId = dmConvId('coach-demo', 'inv-YxnjxnQa');
  const conversations = [
    { id: simonConvId, name: 'Coach', unread: 2 },
    { id: 'squad', name: 'Squad', unread: 1 },
  ];

  const cleared = clearConversationUnread(conversations, simonConvId);

  assert.equal(unreadForConversation(cleared, simonConvId), 0);
  assert.equal(hasUnreadBadge(cleared, simonConvId), false);
  assert.deepEqual(unreadNotificationState(cleared), {
    total: 1,
    hasBadge: true,
    badgeText: '1',
  });
});

test('opening the final unread conversation clears the player portal notification badge', () => {
  const convId = dmConvId('coach-demo', 'user-dodsy-player');
  const conversations = [
    { id: convId, name: 'Coach', unread: 1 },
  ];

  const cleared = clearConversationUnread(conversations, convId);

  assert.deepEqual(unreadNotificationState(cleared), {
    total: 0,
    hasBadge: false,
    badgeText: '',
  });
});

test('page refresh preserves unread count from persisted read timestamp', () => {
  const convId = dmConvId('coach-demo', 'user-dodsy-player');
  const messages = [
    message('m1', convId, 'coach-demo', 'Welcome Dodsy', 1000),
    message('m2', convId, 'coach-demo', 'Check messages', 2000),
  ];
  const persistedReadState = applyReadTimestamp({}, convId, 'user-dodsy-player', 1500);

  const afterRefreshReadAt = readTimestamp(persistedReadState, convId, 'user-dodsy-player');

  assert.equal(unreadCountForUser(messages, 'user-dodsy-player', afterRefreshReadAt), 1);
});

test('page refresh preserves cleared read state after conversation is opened', () => {
  const convId = dmConvId('coach-demo', 'inv-YxnjxnQa');
  const messages = [
    message('m1', convId, 'coach-demo', 'Before open', 1000),
    message('m2', convId, 'coach-demo', 'Also before open', 2000),
  ];
  const persistedReadState = applyReadTimestamp({}, convId, 'inv-YxnjxnQa', 2500);

  const afterRefreshReadAt = readTimestamp(persistedReadState, convId, 'inv-YxnjxnQa');

  assert.equal(unreadCountForUser(messages, 'inv-YxnjxnQa', afterRefreshReadAt), 0);
});

test('logout and login persistence follows stable user id, not display name', () => {
  const convId = dmConvId('coach-demo', 'user-dodsy-player');
  const messages = [
    message('m1', convId, 'coach-demo', 'Before logout', 1000),
    message('m2', convId, 'coach-demo', 'After logout', 3000),
  ];
  const readState = applyReadTimestamp({}, convId, 'user-dodsy-player', 2000);

  assert.equal(unreadCountForUser(messages, 'user-dodsy-player', readTimestamp(readState, convId, 'user-dodsy-player')), 1);
  assert.equal(unreadCountForUser(messages, 'Dodsy Player', readTimestamp(readState, convId, 'Dodsy Player')), 2);
});

test('notification unread logic supports existing and newly approved player ids', () => {
  const players = ['inv-YxnjxnQa', 'inv-nick1234', 'user-dodsy-player'];

  players.forEach((playerId, index) => {
    const convId = dmConvId('coach-demo', playerId);
    const messages = [message(`m${index}`, convId, 'coach-demo', `hello ${playerId}`, 1000 + index)];
    assert.equal(unreadCountForUser(messages, playerId, 0), 1);
  });
});

test('legacy Simon and Nick unread state remains tied to existing conversation ids', () => {
  const cases = [
    ['inv-YxnjxnQa', 'dm:coach-demo:inv-YxnjxnQa'],
    ['inv-nick1234', 'dm:coach-demo:inv-nick1234'],
  ];

  cases.forEach(([playerId, expectedConvId], index) => {
    const convId = dmConvId('coach-demo', playerId);
    const messages = [message(`legacy-${index}`, convId, 'coach-demo', 'Legacy ping', 1000)];

    assert.equal(convId, expectedConvId);
    assert.equal(unreadCountForUser(messages, playerId, 0), 1);
    assert.equal(unreadCountForUser(messages, 'coach-demo', 0), 0);
  });
});

test('newly approved Dodsy-style permanent user receives unread count on permanent userId conversation', () => {
  const playerId = 'user_dodsy_approved';
  const convId = dmConvId('coach-demo', playerId);
  const messages = [
    message('dodsy-1', convId, 'coach-demo', 'Welcome to the squad', 1000),
    message('dodsy-2', convId, 'coach-demo', 'Check selection later', 2000),
  ];
  const conversations = [{ id: convId, name: 'Coach', unread: unreadCountForUser(messages, playerId, 0) }];

  assert.equal(convId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(unreadForConversation(conversations, convId), 2);
  assert.equal(unreadNotificationState(conversations).badgeText, '2');
});
