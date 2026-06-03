// Pure messaging state helpers. Keep this module free of DOM, fetch, and
// localStorage so the production chat rules can be tested independently.

const REDIS_STATIC_CONVERSATIONS = new Set(['squad', 'announce', 'coaching']);

export function dmConvId(id1, id2) {
  const sorted = [String(id1 || 'a'), String(id2 || 'b')].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

export function isRedisBackedConversation(convId) {
  const id = String(convId || '');
  return id.startsWith('dm:') || REDIS_STATIC_CONVERSATIONS.has(id);
}

export function shouldUseLocalFallback(convId, { productionMode = true } = {}) {
  if (!productionMode) return true;
  return !isRedisBackedConversation(convId);
}

export function createCoachDmConversationRequest(player, coachId = 'coach-demo') {
  const playerId = String(player?.id || '').trim();
  const coach = String(coachId || 'coach-demo').trim() || 'coach-demo';
  if (!playerId) return null;
  return {
    action: 'create_conv',
    id: dmConvId(coach, playerId),
    name: String(player?.name || 'Direct message'),
    type: 'DIRECT',
    participants: [coach, playerId],
  };
}

export function createCoachDmConversationRequestForPlayerId(players = [], playerId = '', coachId = 'coach-demo') {
  const targetId = String(playerId || '').trim();
  const player = (Array.isArray(players) ? players : []).find(item => String(item?.id || '') === targetId);
  return createCoachDmConversationRequest(player, coachId);
}

export function filterCoachDmPlayers(players = [], query = '', coachId = 'coach-demo') {
  const q = String(query || '').trim().toLowerCase();
  const coach = String(coachId || '');
  return (Array.isArray(players) ? players : []).filter(player => {
    if (!player?.id || String(player.id) === coach) return false;
    if (!q) return true;
    return [player.name, player.position, player.email]
      .some(value => String(value || '').toLowerCase().includes(q));
  });
}

export function directConversationParticipantId(conversation = {}, currentUserId = 'coach-demo') {
  if (!conversation || String(conversation.type || '').toUpperCase() !== 'DIRECT') return '';
  if (conversation.playerId) return String(conversation.playerId);
  const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
  const other = participants.find(id => String(id) !== String(currentUserId));
  if (other) return String(other);
  const id = String(conversation.id || '');
  if (!id.startsWith('dm:')) return '';
  return id.split(':').slice(1).find(part => part !== String(currentUserId)) || '';
}

export function dedupeDirectConversations(conversations = [], currentUserId = 'coach-demo') {
  const seenDirectParticipants = new Set();
  const result = [];

  (Array.isArray(conversations) ? conversations : []).forEach(conversation => {
    if (!conversation) return;
    const isDirect = String(conversation.type || '').toUpperCase() === 'DIRECT' ||
      String(conversation.id || '').startsWith('dm:');
    if (!isDirect) {
      result.push(conversation);
      return;
    }

    const participantId = directConversationParticipantId(conversation, currentUserId) ||
      String(conversation.id || '');
    if (!participantId || seenDirectParticipants.has(participantId)) return;
    seenDirectParticipants.add(participantId);
    result.push(conversation);
  });

  return result;
}

function messageKey(message) {
  return message && message.id ? String(message.id) : '';
}

function sameOptimisticSend(optimistic, confirmed, windowMs = 120000) {
  if (!optimistic?._optimistic || confirmed?._optimistic) return false;
  if (String(optimistic.convId || '') !== String(confirmed.convId || '')) return false;
  if (String(optimistic.senderId || '') !== String(confirmed.senderId || '')) return false;
  if (String(optimistic.text || '') !== String(confirmed.text || '')) return false;
  const optimisticTs = Number(optimistic.ts || 0);
  const confirmedTs = Number(confirmed.ts || 0);
  if (!optimisticTs || !confirmedTs) return true;
  return Math.abs(optimisticTs - confirmedTs) <= windowMs;
}

export function mergeMessages(existing = [], incoming = []) {
  const merged = Array.isArray(existing) ? existing.slice() : [];
  const byId = new Map();

  merged.forEach((message, index) => {
    const key = messageKey(message);
    if (key) byId.set(key, index);
  });

  (Array.isArray(incoming) ? incoming : []).forEach(message => {
    if (!message) return;
    const key = messageKey(message);
    if (key && byId.has(key)) {
      merged[byId.get(key)] = { ...merged[byId.get(key)], ...message };
      return;
    }

    const optimisticIndex = merged.findIndex(item => sameOptimisticSend(item, message));
    if (optimisticIndex >= 0) {
      merged[optimisticIndex] = message;
      if (key) byId.set(key, optimisticIndex);
      return;
    }

    merged.push(message);
    if (key) byId.set(key, merged.length - 1);
  });

  return merged.sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
}

export function resolveMessagesForRender(convId, cachedMessages = [], fallbackMessages = [], options = {}) {
  const cached = Array.isArray(cachedMessages) ? cachedMessages : [];
  if (cached.length) return cached;
  if (!shouldUseLocalFallback(convId, options)) return [];
  return Array.isArray(fallbackMessages) ? fallbackMessages : [];
}
