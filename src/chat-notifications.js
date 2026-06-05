export function unreadMessagesForUser(messages = [], userId = 'anon', lastRead = 0) {
  const uid = String(userId || 'anon');
  const readAt = Number(lastRead || 0);
  return (Array.isArray(messages) ? messages : []).filter(message => {
    if (!message || message.isDeleted) return false;
    if (String(message.senderId || '') === uid) return false;
    return Number(message.ts || 0) > readAt;
  });
}

export function unreadCountForUser(messages = [], userId = 'anon', lastRead = 0) {
  return unreadMessagesForUser(messages, userId, lastRead).length;
}

export function unreadTotal(conversations = []) {
  return (Array.isArray(conversations) ? conversations : [])
    .reduce((total, conversation) => total + Number(conversation?.unread || 0), 0);
}

export function unreadForConversation(conversations = [], convId = '') {
  const id = String(convId || '');
  const conversation = (Array.isArray(conversations) ? conversations : [])
    .find(item => String(item?.id || '') === id);
  return Number(conversation?.unread || 0);
}

export function hasUnreadBadge(conversations = [], convId = '') {
  return unreadForConversation(conversations, convId) > 0;
}

export function unreadBadgeText(count = 0) {
  const total = Math.max(0, Number(count || 0));
  if (!total) return '';
  return total > 9 ? '9+' : String(total);
}

export function unreadNotificationState(conversations = []) {
  const total = unreadTotal(conversations);
  return {
    total,
    hasBadge: total > 0,
    badgeText: unreadBadgeText(total),
  };
}

export function clearConversationUnread(conversations = [], convId = '') {
  const id = String(convId || '');
  return (Array.isArray(conversations) ? conversations : []).map(conversation =>
    String(conversation?.id || '') === id
      ? { ...conversation, unread: 0 }
      : conversation
  );
}

export function applyReadTimestamp(readState = {}, convId = '', userId = 'anon', ts = Date.now()) {
  return {
    ...(readState || {}),
    [`${convId}:${userId || 'anon'}`]: Number(ts || 0),
  };
}

export function readTimestamp(readState = {}, convId = '', userId = 'anon') {
  return Number((readState || {})[`${convId}:${userId || 'anon'}`] || 0);
}
