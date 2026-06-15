// Travel App — session management (M23.0 bridge).
//
// Issues, verifies, and revokes opaque session tokens for the single-traveller
// MVP. Sessions map a token -> travellerIdentityId, with an expiry. Tokens are
// random and opaque (no JWT/secret-signing needed for MVP); state is durable via
// the file store so a signed-in traveller stays signed in across restarts and
// offline. Deterministic where it matters: an injectable `clock` and `tokenId`
// generator make it fully testable.

import { randomUUID } from 'crypto';
import { clone } from '../../lib/platform-kernel/index.js';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export class SessionPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SessionPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function createSessionManager(options = {}) {
  const store = options.store ?? null;
  const collection = options.collection ?? 'sessions';
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  // Injectable for tests; default to wall-clock + uuid.
  const clock = options.clock ?? (() => Date.now());
  const newToken = options.tokenFactory ?? (() => `sess_${randomUUID()}`);

  // Sessions live in the file store when provided, else in-memory (tests).
  const memory = [];
  function readAll() {
    return store ? store.read(collection) : memory.map(clone);
  }
  function writeAll(sessions) {
    if (store) { store.write(collection, sessions); return; }
    memory.length = 0;
    for (const s of sessions) memory.push(clone(s));
  }

  function assertNonEmptyString(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new SessionPlatformError('VALIDATION_FAILED', `${field} is required`, { field });
    }
    return value.trim();
  }

  function createSession(travellerIdentityId, sessionOptions = {}) {
    const id = assertNonEmptyString(travellerIdentityId, 'travellerIdentityId');
    const issuedAt = clock();
    const token = newToken();
    const session = {
      token,
      travellerIdentityId: id,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + (sessionOptions.ttlMs ?? ttlMs)).toISOString(),
      revoked: false,
    };
    const sessions = readAll();
    sessions.push(session);
    writeAll(sessions);
    return clone(session);
  }

  // Returns the active session for a token, or null if missing/expired/revoked.
  function resolveSession(token) {
    if (typeof token !== 'string' || !token) return null;
    const session = readAll().find(s => s.token === token);
    if (!session || session.revoked) return null;
    if (clock() >= new Date(session.expiresAt).getTime()) return null;
    return clone(session);
  }

  // Throws if the token is not a valid active session; returns travellerIdentityId.
  function requireTraveller(token) {
    const session = resolveSession(token);
    if (!session) throw new SessionPlatformError('UNAUTHENTICATED', 'No active session for token');
    return session.travellerIdentityId;
  }

  function revokeSession(token) {
    const sessions = readAll();
    const session = sessions.find(s => s.token === token);
    if (!session) return false;
    session.revoked = true;
    writeAll(sessions);
    return true;
  }

  return { createSession, resolveSession, requireTraveller, revokeSession };
}
