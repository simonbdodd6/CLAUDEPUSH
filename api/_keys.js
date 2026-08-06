// Central Redis key naming. APP_KEY_PREFIX allows a future club tenant to use
// its own namespace without changing route code.
const rawPrefix = String(process.env.APP_KEY_PREFIX || 'app').replace(/:+$/, '');

export const APP_PREFIX = rawPrefix || 'app';
export const LEGACY_PREFIX = 'ce';

export function key(name) {
  return `${APP_PREFIX}:${name}`;
}

export function legacyKey(name) {
  return `${LEGACY_PREFIX}:${name}`;
}

export function availabilityKey(sessionId) {
  return key(`availability:${sessionId}`);
}

// RC4.7A — tenant-scoped availability. Session IDs can never contain ':'
// (validSessionId allows [a-z0-9_-] only), so a colon in the suffix always
// means "team-scoped key" and the flat legacy format stays unambiguous.
export function teamAvailabilityKey(teamId, sessionId) {
  return key(`availability:${teamId}:${sessionId}`);
}

export function legacyAvailabilityKey(sessionId) {
  return legacyKey(`availability:${sessionId}`);
}

// ─── RC4.7 Phase B — club → group → team scoped keys ────────────────────────
// The literal 'group'/'team' marker segments make these formats impossible to
// confuse with the two legacy shapes above (flat `availability:<session>` and
// tenant `availability:<clubId>:<session>`): position 2 is a reserved word,
// and generated ids can never collide with it.

export function groupAvailabilityKey(clubId, groupId, sessionId) {
  return key(`availability:${clubId}:group:${groupId}:${sessionId}`);
}

/** Group-scoped publication block: training, training_schedule, sessions… */
export function groupPublishKey(clubId, groupId, block) {
  return key(`publish:${clubId}:group:${groupId}:${block}`);
}

/** Team-scoped publication block: squad, matchday sheets… */
export function teamPublishKey(clubId, teamId, block) {
  return key(`publish:${clubId}:team:${teamId}:${block}`);
}
