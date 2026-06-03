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
