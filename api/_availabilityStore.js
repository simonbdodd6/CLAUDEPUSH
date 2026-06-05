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

/** Labels with an availability reply during the chase-up lookback period. */
export async function recentResponders(withinDays = 7) {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const patterns = [...new Set([`${APP_PREFIX}:availability:*`, `${LEGACY_PREFIX}:availability:*`])];
  const redisKeys = (await Promise.all(patterns.map(pattern => kvScanKeys(pattern))))
    .flat();
  const sessions = await Promise.all([...new Set(redisKeys)].map(redisKey => kvGet(redisKey)));
  const labels = new Set();

  sessions.filter(Boolean).forEach(session => {
    Object.entries(session).forEach(([label, value]) => {
      // Older responses without a timestamp cannot prove they happened within
      // seven days, so they must not suppress a current chase-up reminder.
      if (value?.respondedAt && new Date(value.respondedAt).getTime() >= cutoff) {
        labels.add(label);
        if (value.label) labels.add(value.label);
        if (value.userId) labels.add(value.userId);
        if (value.playerId) labels.add(value.playerId);
      }
    });
  });
  return labels;
}
