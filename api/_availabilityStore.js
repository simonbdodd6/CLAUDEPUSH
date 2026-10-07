import { kvGet, kvSet, kvScanKeys } from './_kv.js';
import { withStoreLock } from './_lock.js';
import { APP_PREFIX, LEGACY_PREFIX, key, availabilityKey, legacyAvailabilityKey, teamAvailabilityKey, groupAvailabilityKey } from './_keys.js';
import { DEFAULT_TEAM } from './_identityStore.js';
import { INITIAL_GROUP_ID } from './_structureStore.js';

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
// RC4.7 Phase B — GROUP-SCOPED AVAILABILITY
//
// Availability is a GROUP resource: one shared pool answers once per session,
// and every team in the group selects from those answers. Records live at
// app:availability:<clubId>:group:<groupId>:<sessionId>.
//
// Fallback chain, INITIAL MIGRATED GROUP ONLY: pre-RC4.7 records live on the
// club-scoped key (RC4.7A format), and for the original default club on the
// flat keys below that. Any other group reads exclusively its own keyspace —
// a U18 group can never see Senior data through a fallback. Writes always
// land on the group-scoped key.
// ───────────────────────────────────────────────────────────────────────────

function canReadClubLegacy(groupId) {
  return String(groupId || '') === INITIAL_GROUP_ID;
}

export async function loadGroupAvailability(clubId, groupId, sessionId) {
  const scoped = await kvGet(groupAvailabilityKey(normalizeTeamId(clubId), String(groupId || ''), sessionId));
  if (scoped && typeof scoped === 'object') return scoped;
  if (!canReadClubLegacy(groupId)) return {};
  // The initial group IS the club's pre-structure data — reuse the full
  // RC4.7A chain (club-scoped key, then flat legacy for the default club).
  return loadAvailability(clubId, sessionId);
}

export async function saveGroupAvailability(clubId, groupId, sessionId, value) {
  await kvSet(groupAvailabilityKey(normalizeTeamId(clubId), String(groupId || ''), sessionId), value);
}

// ───────────────────────────────────────────────────────────────────────────
// WRITE MUTEX — one writer per (club, group, session) record at a time.
//
// A session's answers are ONE record: an answer is written by loading the
// record, replacing the writer's own entry and saving the whole record back.
// Two players answering within the same read→write window (typical right
// after a squad-wide request) each read the record without the other's entry
// and the second save silently dropped the first answer — the player's own
// device still showed it, the coach board never did. The lock serialises
// writers to the same session: the second reads what the first saved.
//
// Built on the primitives the store already has (SET NX EX + DEL): the record
// format, its keys and every reader are untouched, so existing data needs no
// migration. Bounded wait, then FAIL CLOSED with 503 — the client keeps the
// answer pending and retries; nothing is ever written unserialised. The TTL
// frees a lock whose holder died mid-write. The lock key lives OUTSIDE the
// availability:* namespace so no scan ever mistakes it for a session record.
// ───────────────────────────────────────────────────────────────────────────
const WRITE_LOCK_TTL_SECONDS = 5;
const WRITE_LOCK_WAIT_MS     = 4000;

export function availabilityWriteLockKey(clubId, groupId, sessionId) {
  return key(`availability_lock:${normalizeTeamId(clubId)}:${String(groupId || '')}:${String(sessionId || '')}`);
}

export async function withAvailabilityWriteLock(clubId, groupId, sessionId, fn) {
  // The shared write-lock primitive (Build 135, api/_lock.js) — the same
  // SET NX EX + token-checked release this function always used, with its key,
  // timings and busy answer unchanged.
  const lockKey = availabilityWriteLockKey(clubId, groupId, sessionId);
  return withStoreLock(`availability:${lockKey}`, fn, {
    lockKey, ttlSeconds: WRITE_LOCK_TTL_SECONDS, waitMs: WRITE_LOCK_WAIT_MS,
    busyMessage: 'Availability is busy — please try again in a moment',
  });
}

/** Read every availability record for ONE group, keyed by sessionId. */
export async function loadAllGroupAvailability(clubId, groupId) {
  const club = normalizeTeamId(clubId);
  const group = String(groupId || '');
  const bySession = {};

  const marker = `${APP_PREFIX}:availability:${club}:group:${group}:`;
  const keys = await kvScanKeys(`${marker}*`);
  const stores = await Promise.all(keys.map(k => kvGet(k)));
  keys.forEach((k, i) => {
    const store = stores[i];
    if (!store || typeof store !== 'object') return;
    const sessionId = k.slice(marker.length);
    if (sessionId) bySession[sessionId] = store;
  });

  if (!canReadClubLegacy(group)) return bySession;

  // Initial group: fill gaps from the club-scoped (and, transitively for the
  // default club, flat legacy) records. Group-scoped answers always win.
  const legacy = await loadAllAvailability(club);
  for (const [sessionId, store] of Object.entries(legacy)) {
    // Skip our own group-scoped suffixes surfacing through the club scan.
    if (sessionId.startsWith('group:')) continue;
    if (!bySession[sessionId]) bySession[sessionId] = store;
  }
  return bySession;
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
    // Session IDs cannot contain ':' — a colon here means an RC4.7
    // group-scoped key (availability:<club>:group:<groupId>:<session>)
    // surfacing through the club-level scan. Those belong to the group
    // reader, never to this club-level view.
    if (!sessionId || sessionId.includes(':')) return;
    bySession[sessionId] = store;
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
    // ONE person can be held as SEVERAL records in one session store — an
    // invite-era entry (keyed inv-…) and the authenticated write (keyed
    // user_…) both match the same identity. `.find()` returned whichever was
    // INSERTED first, so a stale contradictory record (often the older
    // invite entry) beat the player's newest answer: the player's own device
    // showed their fresh reply while every coach read resolved the stale one.
    // The documented contract (the client merge fixed the same defect in
    // dedupeRosterPlayers) is RECENCY: the newest-stamped answer wins; a
    // stamped answer always beats an unstamped one; with no stamps at all,
    // the first match stands as before.
    let entry = null;
    for (const candidate of Object.values(store)) {
      if (!candidate || !matches(candidate)) continue;
      if (!entry) { entry = candidate; continue; }
      const a = String(candidate.respondedAt || '');
      const b = String(entry.respondedAt || '');
      if (a && (!b || a > b)) entry = candidate;
    }
    if (entry) out[sessionId] = { response: entry.response, reason: entry.reason || '', respondedAt: entry.respondedAt || null };
  }
  return out;
}

/** Player self-read: one identity's answers across their team's sessions. */
export async function loadAvailabilityForIdentity(teamId, identity = {}) {
  return resolveAvailabilityForIdentity(await loadAllAvailability(teamId), identity);
}

/** Player self-read, GROUP-scoped: the same resolver over one group's records
 *  (with the initial group's documented legacy fallback inside the loader). */
export async function loadGroupAvailabilityForIdentity(clubId, groupId, identity = {}) {
  return resolveAvailabilityForIdentity(await loadAllGroupAvailability(clubId, groupId), identity);
}

/** Coach read, GROUP-scoped: many identities from a single group read. */
export async function resolveGroupAvailabilityForIdentities(clubId, groupId, identities = []) {
  const bySession = await loadAllGroupAvailability(clubId, groupId);
  return (Array.isArray(identities) ? identities : []).map(identity => ({
    identity,
    answers: resolveAvailabilityForIdentity(bySession, identity),
  }));
}

/** Coach read: resolve many identities from a SINGLE read of the team's records. */
export async function resolveAvailabilityForIdentities(teamId, identities = []) {
  const bySession = await loadAllAvailability(teamId);
  return (Array.isArray(identities) ? identities : []).map(identity => ({
    identity,
    answers: resolveAvailabilityForIdentity(bySession, identity),
  }));
}

const ANSWERS = new Set(['available', 'unavailable', 'maybe']);

/**
 * WHO HAS ANSWERED — for a coach's no-reply chase (Build 104).
 *
 * Asked of ONE club's own records, in the named group(s), and answered with
 * DURABLE ids only (userId / playerId / legacyPlayerId, lowercased). Never a
 * display name, and never another club's or another group's record: the
 * reads go through the same group-scoped loaders every availability write
 * and board read use, so the tenant boundary is theirs.
 *
 *   sessionIds given  → anyone holding an answer to ANY of those occurrences.
 *                       Answering any of the week's occurrences is answering
 *                       — the rule the Overview and the board count by.
 *   none given        → anyone in these groups with an answer stamped inside
 *                       the lookback window (the request shape of a client
 *                       from before this build, which names no occurrence).
 *
 * This replaced recentResponders(), a seven-day union over every club that
 * matched display names: a same-named player answering elsewhere silenced
 * this club's reminder. The coach chase stopped calling it in Build 104 and
 * the scheduled reminders in Build 105; with no caller left it was removed.
 */
export async function respondersByIdentity(clubId, groupIds = [], { sessionIds = [], withinDays = 7, now = Date.now() } = {}) {
  const ids = new Set();
  const add = value => {
    if (!value || typeof value !== 'object' || !ANSWERS.has(value.response)) return;
    for (const id of [value.userId, value.playerId, value.legacyPlayerId]) if (id) ids.add(String(id).toLowerCase());
  };
  const groups = [...new Set((Array.isArray(groupIds) ? groupIds : []).map(g => String(g || '')).filter(Boolean))];
  const wanted = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).map(s => String(s || '')).filter(Boolean))];
  const cutoff = now - withinDays * 24 * 60 * 60 * 1000;
  for (const groupId of groups) {
    if (wanted.length) {
      const stores = await Promise.all(wanted.map(sessionId => loadGroupAvailability(clubId, groupId, sessionId)));
      stores.forEach(store => Object.values(store || {}).forEach(add));
      continue;
    }
    const bySession = await loadAllGroupAvailability(clubId, groupId);
    Object.values(bySession).forEach(store => Object.values(store || {}).forEach(value => {
      // An answer with no timestamp cannot prove it is recent, so it excuses nobody.
      if (value?.respondedAt && new Date(value.respondedAt).getTime() >= cutoff) add(value);
    }));
  }
  return ids;
}
