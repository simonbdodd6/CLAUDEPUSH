import { kvGet, kvSet, kvScanKeys } from './_kv.js';
import { APP_PREFIX, LEGACY_PREFIX, availabilityKey, legacyAvailabilityKey } from './_keys.js';

export async function loadAvailability(sessionId) {
  const current = await kvGet(availabilityKey(sessionId));
  if (current && typeof current === 'object') return current;
  const legacy = await kvGet(legacyAvailabilityKey(sessionId));
  return legacy && typeof legacy === 'object' ? legacy : {};
}

export async function saveAvailability(sessionId, value) {
  await kvSet(availabilityKey(sessionId), value);
}

/**
 * Returns the set of userIds that have submitted an availability response
 * within the lookback window. Keyed by userId only — never by display name —
 * to prevent false matches when two players share a first name.
 */
export async function recentResponders(withinDays = 7) {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const patterns = [...new Set([`${APP_PREFIX}:availability:*`, `${LEGACY_PREFIX}:availability:*`])];
  const redisKeys = (await Promise.all(patterns.map(pattern => kvScanKeys(pattern))))
    .flat();
  const sessions = await Promise.all([...new Set(redisKeys)].map(redisKey => kvGet(redisKey)));
  const userIds = new Set();

  sessions.filter(Boolean).forEach(session => {
    Object.entries(session).forEach(([key, value]) => {
      if (value?.respondedAt && new Date(value.respondedAt).getTime() >= cutoff) {
        // key is always the userId (set by availabilityIdentityFromSession)
        userIds.add(key);
        if (value.userId) userIds.add(value.userId);
        // playerId intentionally omitted — it equals userId for all new accounts
      }
    });
  });
  return userIds;
}
