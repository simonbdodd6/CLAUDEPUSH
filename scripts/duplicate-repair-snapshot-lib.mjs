/**
 * DUPLICATE-PLAYER REPAIR — SNAPSHOT LIBRARY (Build 136E tooling). READ-ONLY.
 *
 * Builds the `coacheasier-duplicate-repair-snapshot/1` document that
 * scripts/duplicate-repair-preflight.mjs consumes, from a Redis command
 * function the caller injects. The library itself never opens a connection:
 * the CLI passes the real Upstash REST client, the tests pass an in-memory
 * fake. Whatever is injected is wrapped by guardReadOnly(), so nothing in here
 * can ask for any command other than GET / SCAN / LRANGE — the same allowlist
 * the production audit (scripts/audit-duplicate-players.mjs) enforces with its
 * fetch tripwire.
 *
 * Data minimisation: every record is reduced to the whitelisted fields the
 * preflight reads (never password hashes, session tokens, phone numbers, dates
 * of birth or notes); medical records are reduced to the ids they reference;
 * direct-message keys are kept as names only; only the target club's users
 * and records are included, plus those users' other-club memberships and
 * sessions, which the preflight needs in order to refuse a cross-club merge.
 */

import { s, referencedIds, knownIdsOf, reducePublishRecord } from './duplicate-repair-shared.mjs';
export { referencedIds, knownIdsOf, reducePublishRecord };

export const READ_ONLY_COMMANDS = Object.freeze(['GET', 'SCAN', 'LRANGE']);
export const SNAPSHOT_SCHEMA = 'coacheasier-duplicate-repair-snapshot/1';
export const SNAPSHOT_SOURCE = 'scripts/duplicate-repair-snapshot.mjs — GET/SCAN only, read-only guard armed';
export const SCAN_COUNT = '500';
export const DEFAULT_MAX_SCAN_PAGES = 10_000;

export class TripwireError extends Error { constructor(cmd) { super(`TRIPWIRE — refused non-read Redis command: ${cmd || '(unparsable)'}`); this.name = 'TripwireError'; this.command = cmd; } }
export class StoreFormatError extends Error { constructor(key, why) { super(`store ${key}: ${why}`); this.name = 'StoreFormatError'; this.key = key; } }

/** Wrap any command function so that only read commands can ever be issued. */
export function guardReadOnly(redis) {
  return async (...command) => {
    const cmd = s(command[0]).toUpperCase();
    if (!READ_ONLY_COMMANDS.includes(cmd)) throw new TripwireError(cmd);
    return redis(...command);
  };
}

/** Full SCAN with cursor pagination; refuses to loop forever. */
export async function scanAll(redis, pattern, { maxPages = DEFAULT_MAX_SCAN_PAGES } = {}) {
  const out = new Set();
  let cursor = '0', pages = 0;
  do {
    const reply = await redis('SCAN', cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
    if (!Array.isArray(reply) || reply.length !== 2 || !Array.isArray(reply[1])) throw new StoreFormatError(pattern, 'SCAN reply is not [cursor, keys]');
    for (const k of reply[1]) out.add(String(k));
    cursor = String(reply[0]);
    if (++pages > maxPages) throw new StoreFormatError(pattern, `SCAN did not terminate within ${maxPages} pages`);
  } while (cursor !== '0');
  return [...out].sort();
}

async function getJson(redis, key, { required = false } = {}) {
  const raw = await redis('GET', key);
  if (raw == null) { if (required) throw new StoreFormatError(key, 'missing'); return null; }
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { throw new StoreFormatError(key, 'value is not JSON'); }
}
const asArray = (key, v) => { if (v == null) return []; if (!Array.isArray(v)) throw new StoreFormatError(key, 'expected an array'); return v; };

// ── sanitisers: whitelists, never blacklists ──
const pick = (obj, fields) => { const out = {}; for (const f of fields) if (obj && obj[f] !== undefined && obj[f] !== null && obj[f] !== '') out[f] = obj[f]; return out; };
export const sanitizeUser = u => pick(u, ['id', 'email', 'displayName', 'createdAt', 'lastLoginAt', 'emailVerified']);
export const sanitizeMember = m => pick(m, ['id', 'teamId', 'userId', 'role', 'staffLevel', 'status', 'playerGroupId', 'mergedInto', 'joinedAt', 'createdAt', 'approvedBy', 'accessChangedBy', 'accessChangedAt', 'removedAt', 'removedBy']);
export const sanitizeProfile = p => pick(p, ['id', 'teamId', 'userId', 'displayName', 'legacyPlayerId', 'playerGroupId', 'position']);
export const sanitizeSession = x => pick(x, ['id', 'userId', 'teamId', 'createdAt', 'lastSeenAt', 'expiresAt']);
export const sanitizeSubscription = x => ({ ...pick(x, ['userId', 'playerId', 'legacyPlayerId', 'createdAt']), subscription: { endpoint: s(x?.subscription?.endpoint) } });
export function sanitizeRosterRow(r) {
  const out = pick(r, ['id', 'userId', 'legacyPlayerId', 'name', 'position', 'playerGroupId', 'number', 'status']);
  for (const [k, v] of Object.entries(r || {})) if (k.startsWith('avail_') && v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}
export function sanitizeAvailabilityEntries(entries) {
  const out = {};
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return out;
  for (const [entryKey, v] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    out[entryKey] = typeof v === 'string' ? v : pick(v, ['userId', 'playerId', 'legacyPlayerId', 'response', 'respondedAt']);
  }
  return out;
}
const byId = (a, b) => s(a.id || a.userId).localeCompare(s(b.id || b.userId)) || JSON.stringify(a).localeCompare(JSON.stringify(b));

/**
 * Take the snapshot. `redis(...command)` is the only I/O; it is wrapped by
 * guardReadOnly so only GET / SCAN / LRANGE can ever reach it.
 */
export async function takeSnapshot({ redis, prefix = 'app', club, now = Date.now(), maxScanPages = DEFAULT_MAX_SCAN_PAGES }) {
  if (!s(club)) throw new Error('club is required');
  if (typeof redis !== 'function') throw new Error('a redis command function is required');
  const r = guardReadOnly(redis);
  const p = s(prefix).replace(/:+$/, '') || 'app';
  const k = name => `${p}:${name}`;
  const clubId = s(club);
  const notes = [];

  const usersRaw = asArray(k('identity:users'), await getJson(r, k('identity:users'), { required: true }));
  const membersRaw = asArray(k('identity:team_members'), await getJson(r, k('identity:team_members'), { required: true }));
  const profilesRaw = asArray(k('identity:player_profiles'), await getJson(r, k('identity:player_profiles')));
  const sessionsRaw = asArray(k('identity:sessions'), await getJson(r, k('identity:sessions')));
  const subsRaw = asArray(k('subscriptions'), await getJson(r, k('subscriptions')));
  const rosterRaw = await getJson(r, k(`roster:${clubId}`));
  if (rosterRaw != null && (typeof rosterRaw !== 'object' || Array.isArray(rosterRaw) || (rosterRaw.players != null && !Array.isArray(rosterRaw.players)))) throw new StoreFormatError(k(`roster:${clubId}`), 'expected { players: [] }');
  const rosterRows = (rosterRaw?.players || []).filter(x => x && typeof x === 'object');

  // ── scope: the club's people ──
  const members = membersRaw.filter(m => { if (!m || !s(m.userId) || !s(m.teamId)) { notes.push('dropped a membership without userId/teamId'); return false; } return true; });
  const clubUsers = new Set(members.filter(m => s(m.teamId) === clubId).map(m => s(m.userId)));
  for (const row of rosterRows) if (s(row.userId)) clubUsers.add(s(row.userId));
  const profiles = profilesRaw.filter(x => x && s(x.teamId) === clubId && s(x.userId));
  // The SAME formula the preflight applies to the finished snapshot (shared module), so both sides scan for identical ids.
  const ids = knownIdsOf({ club: clubId, team_members: members, player_profiles: profiles, roster: { players: rosterRows } });

  const users = usersRaw.filter(u => { if (!u || !s(u.id)) { notes.push('dropped a user record without id'); return false; } return clubUsers.has(s(u.id)); });
  const team_members = members.filter(m => clubUsers.has(s(m.userId)));                       // any club: the preflight refuses cross-club merges
  const sessions = sessionsRaw.filter(x => x && clubUsers.has(s(x.userId)));                    // any club, same reason
  const subscriptions = subsRaw.filter(x => x && [x.userId, x.playerId, x.legacyPlayerId].map(s).some(id => id && ids.has(id)));

  // ── per-club records ──
  const availability = {};
  for (const key of await scanAll(r, `${k('availability:')}${clubId}:*`, { maxPages: maxScanPages })) {
    const v = await getJson(r, key);
    if (v == null) continue;
    if (typeof v !== 'object' || Array.isArray(v)) throw new StoreFormatError(key, 'availability record is not an object of entries');
    availability[key] = sanitizeAvailabilityEntries(v);
  }
  const publish = {};
  const publishKeys = new Set(await scanAll(r, `${k('publish:')}${clubId}:*`, { maxPages: maxScanPages }));
  publishKeys.add(k(`publish:${clubId}`));
  // Reduced to what the repair reasons about: sheet positions and the known ids named elsewhere. Notes, attendance detail, logos never leave the store.
  for (const key of [...publishKeys].sort()) { const v = await getJson(r, key); if (v != null) publish[key] = reducePublishRecord(v, ids); }
  const medical = {};
  const medicalRaw = await getJson(r, k(`medical:${clubId}`));
  if (medicalRaw != null) medical[k(`medical:${clubId}`)] = { redacted: true, referencedIds: referencedIds(medicalRaw, ids) };
  const messages = (await scanAll(r, `${k('chat:conv:dm:')}*:msgs`, { maxPages: maxScanPages })).filter(key => [...ids].some(id => key.includes(id)));

  return {
    schema: SNAPSHOT_SCHEMA, takenAt: new Date(now).toISOString(), source: SNAPSHOT_SOURCE, keyPrefix: p, club: clubId,
    users: users.map(sanitizeUser).sort(byId),
    team_members: team_members.map(sanitizeMember).sort(byId),
    player_profiles: profiles.map(sanitizeProfile).sort(byId),
    sessions: sessions.map(sanitizeSession).sort(byId),
    roster: { players: rosterRows.map(sanitizeRosterRow) },        // order kept: the roster is positional on screen
    subscriptions: subscriptions.map(sanitizeSubscription).sort((a, b) => a.subscription.endpoint.localeCompare(b.subscription.endpoint)),
    availability, publish, medical, messages,
    notes,
  };
}

/** Counts for a summary that prints no personal data. */
export function summarize(snapshot) {
  return { club: snapshot.club, takenAt: snapshot.takenAt, users: snapshot.users.length, team_members: snapshot.team_members.length, player_profiles: snapshot.player_profiles.length,
    sessions: snapshot.sessions.length, rosterRows: snapshot.roster.players.length, subscriptions: snapshot.subscriptions.length, availabilityRecords: Object.keys(snapshot.availability).length,
    publishRecords: Object.keys(snapshot.publish).length, medicalRecords: Object.keys(snapshot.medical).length, messageThreads: snapshot.messages.length, notes: snapshot.notes.length };
}
