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

export function legacyAvailabilityKey(sessionId) {
  return legacyKey(`availability:${sessionId}`);
}
