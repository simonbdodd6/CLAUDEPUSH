import { kvGet, kvSet, kvScanKeys } from './_kv.js';
import { APP_PREFIX, LEGACY_PREFIX, availabilityKey, legacyAvailabilityKey, teamAvailabilityKey } from './_keys.js';
import { DEFAULT_TEAM } from './_identityStore.js';

// ───────────────────────────────────────────────────────────────────────────
// RC4.7A — TENANT-SCOPED AVAILABILITY
//
// Records live at  app:availability:<teamId>:<sessionId>.  The flat pre-scoping
// keys (app:availability:<sessionId> and ce:availability:<sessionId>) hold the
// existing beta data, ALL of which belongs to the default club — so the legacy
// fallback is readable ONLY for DEFAULT_TEAM. Any other club reads and writes
// exclusively inside its own keyspace; the old global bucket is unreachable
// from their context, which is what closes the cross-club leak.
//
// Writes always land on the team-scoped key. Because reads merge legacy data
// in (default team only) and writes persist the merged store, legacy records
// migrate lazily on first write with no migration job.
// ───────────────────────────────────────────────────────────────────────────

function normalizeTeamId(teamId) {
  const id = String(teamId || '').trim();
  return id || DEFAULT_TEAM.id;
}

function canReadLegacy(teamId) {
  return normalizeTeamId(teamId) === DEFAULT_TEAM.id;
}

export async function loadAvailability(teamId, sessionId) {
  const scopedTeam = normalizeTeamId(teamId);
  const scoped = await kvGet(teamAvailabilityKey(scopedTeam, sessionId));
  if (scoped && typeof scoped === 'object') return scoped;
  if (!canReadLegacy(scopedTeam)) return {};
  const flat = await kvGet(availabilityKey(sessionId));
  if (flat && typeof flat === 'object') return flat;
  const legacy = await kvGet(legacyAvailabilityKey(sessionId));
  return legacy && typeof legacy === 'object' ? legacy : {};
}

export async function saveAvailability(teamId, sessionId, value) {
  await kvSet(teamAvailabilityKey(normalizeTeamId(teamId), sessionId), value);
}

// ───────────────────────────────────────────────────────────────────────────
// SHARED AVAILABILITY RESOLUTION LAYER
//
// Availability records exist once (the Redis availability:* keys). Resolution
// exists once here. BOTH the player self-read (myResponse) and the coach board
// consume this layer, so neither side interprets the records differently.
//
// loadAllAvailability(teamId)        — read the team's records ONCE.
// resolveAvailabilityForIdentity()   — pure: one identity's answers by sessionId.
// loadAvailabilityForIdentity()      — convenience (player self-read): load + resolve.
// resolveAvailabilityForIdentities() — resolve many identities from one read (coach).
//
// Reads are NOT constrained to a published session-id list — that constraint is
// what made answers saved under a stale/custom/republished sessionId disappear.
// Matching is by userId / playerId / legacyPlayerId only (identical on both sides).
// ───────────────────────────────────────────────────────────────────────────

/** Read every availability record for ONE team, keyed by sessionId.
 *  Team-scoped keys win; flat legacy keys fill gaps for the default team only. */
export async function loadAllAvailability(teamId) {
  const scopedTeam = normalizeTeamId(teamId);
  const bySession = {};

  const scopedMarker = `${APP_PREFIX}:availability:${scopedTeam}:`;
  const scopedKeys = await kvScanKeys(`${scopedMarker}*`);
  const scopedStores = await Promise.all(scopedKeys.map(k => kvGet(k)));
  scopedKeys.forEach((k, i) => {
    const store = scopedStores[i];
    if (!store || typeof store !== 'object') return;
    const sessionId = k.slice(scopedMarker.length);
    if (sessionId) bySession[sessionId] = store;
  });

  if (!canReadLegacy(scopedTeam)) return bySession;

  const prefixes = [...new Set([APP_PREFIX, LEGACY_PREFIX])];
  for (const prefix of prefixes) {
    const marker = `${prefix}:availability:`;
    const keys = await kvScanKeys(`${marker}*`);
    const stores = await Promise.all(keys.map(k => kvGet(k)));
    keys.forEach((k, i) => {
      const store = stores[i];
      if (!store || typeof store !== 'object') return;
      const sessionId = k.slice(marker.length);
      // A ':' in the suffix means this is some team's SCOPED key (session IDs
      // cannot contain ':'), never flat legacy data — skip it here.
      if (!sessionId || sessionId.includes(':')) return;
      if (bySession[sessionId]) return; // scoped (then app-prefix) wins
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

/** Player self-read: one identity's answers across their team's sessions. */
export async function loadAvailabilityForIdentity(teamId, identity = {}) {
  return resolveAvailabilityForIdentity(await loadAllAvailability(teamId), identity);
}

/** Coach read: resolve many identities from a SINGLE read of the team's records. */
export async function resolveAvailabilityForIdentities(teamId, identities = []) {
  const bySession = await loadAllAvailability(teamId);
  return (Array.isArray(identities) ? identities : []).map(identity => ({
    identity,
    answers: resolveAvailabilityForIdentity(bySession, identity),
  }));
}

/** Labels with an availability reply during the chase-up lookback period.
 *  Deliberately a global union (all clubs + legacy): its consumers (weekly
 *  reminder cron, no-reply push audiences) already scope their RECIPIENTS by
 *  club membership; this set only suppresses double-chasing responders. The
 *  `app:availability:*` pattern matches team-scoped keys too. */
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
