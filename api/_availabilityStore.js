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

// ───────────────────────────────────────────────────────────────────────────
// SHARED AVAILABILITY RESOLUTION LAYER
//
// Availability records exist once (the Redis availability:* keys). Resolution
// exists once here. BOTH the player self-read (myResponse) and the coach board
// consume this layer, so neither side interprets the records differently.
//
// loadAllAvailability()             — read every availability record ONCE.
// resolveAvailabilityForIdentity()  — pure: one identity's answers by sessionId.
// loadAvailabilityForIdentity()     — convenience (player self-read): load + resolve.
// resolveAvailabilityForIdentities()— resolve many identities from one read (coach).
//
// Reads are NOT constrained to a published session-id list — that constraint is
// what made answers saved under a stale/custom/republished sessionId disappear.
// Matching is by userId / playerId / legacyPlayerId only (identical on both sides).
// ───────────────────────────────────────────────────────────────────────────

/** Read every availability record once, keyed by sessionId (app prefix wins). */
export async function loadAllAvailability() {
  const bySession = {};
  const prefixes = [...new Set([APP_PREFIX, LEGACY_PREFIX])];
  for (const prefix of prefixes) {
    const marker = `${prefix}:availability:`;
    const keys = await kvScanKeys(`${marker}*`);
    const stores = await Promise.all(keys.map(k => kvGet(k)));
    keys.forEach((k, i) => {
      const store = stores[i];
      if (!store || typeof store !== 'object') return;
      const sessionId = k.slice(marker.length);
      if (!sessionId || bySession[sessionId]) return; // app prefix wins over legacy
      bySession[sessionId] = store;
    });
  }
  return bySession;
}

/** Pure: one identity's answers keyed by sessionId, from an already-read map. */
export function resolveAvailabilityForIdentity(bySession = {}, identity = {}) {
  const out = {};
  if (!identity || !bySession) return out;
  const wantUser   = String(identity.userId || '');
  const wantPlayer = String(identity.playerId || '');
  const wantLegacy = String(identity.legacyPlayerId || '');
  if (!wantUser && !wantPlayer && !wantLegacy) return out;
  const matches = v => Boolean(
    (wantUser   && v.userId         === wantUser) ||
    (wantPlayer && v.playerId       === wantPlayer) ||
    (wantLegacy && v.legacyPlayerId === wantLegacy)
  );
  for (const [sessionId, store] of Object.entries(bySession)) {
    if (!store || typeof store !== 'object') continue;
    const entry = Object.values(store).find(matches);
    if (entry) out[sessionId] = { response: entry.response, reason: entry.reason || '', respondedAt: entry.respondedAt || null };
  }
  return out;
}

/** Player self-read: one identity's answers across every stored session. */
export async function loadAvailabilityForIdentity(identity = {}) {
  return resolveAvailabilityForIdentity(await loadAllAvailability(), identity);
}

/** Coach read: resolve many identities from a SINGLE read of the records. */
export async function resolveAvailabilityForIdentities(identities = []) {
  const bySession = await loadAllAvailability();
  return (Array.isArray(identities) ? identities : []).map(identity => ({
    identity,
    answers: resolveAvailabilityForIdentity(bySession, identity),
  }));
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
