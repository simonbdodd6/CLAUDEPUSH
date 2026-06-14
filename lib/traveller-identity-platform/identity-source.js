import { configurationError } from './errors.js';

/**
 * IdentitySourceAdapter — the port through which the Traveller Identity Platform
 * consumes universal identity snapshots.
 *
 * This is the ONLY seam to identity data. Travel-facing code depends on this
 * port, never on `lib/identity-platform/` directly, which keeps M10 fully
 * decoupled. Implementations must return an immutable, privacy-applied identity
 * snapshot (the identity-platform PUBLIC view shape) or `null` when the identity
 * cannot be resolved (missing or soft-deleted).
 *
 * Expected snapshot shape (privacy-safe public view):
 *   { id, type, roles, status, verified, verificationStatus,
 *     publicProfile: { displayName, avatarUrl, bio, country, languages, timezone },
 *     trust, reputation, createdAt, updatedAt }
 */
export class IdentitySourceAdapter {
  // eslint-disable-next-line no-unused-vars
  async getIdentitySnapshot(travellerIdentityId) {
    throw configurationError('IdentitySourceAdapter.getIdentitySnapshot() must be implemented');
  }
}

/**
 * Default adapter that wraps an injected identity-platform instance.
 *
 * The identity platform is INJECTED, not imported — so neither this file nor the
 * service couples to `lib/identity-platform/` at module-load time. It reads only
 * the PUBLIC view, so internal/PII fields never reach M10.
 */
export class IdentityPlatformSourceAdapter extends IdentitySourceAdapter {
  constructor({ identityPlatform } = {}) {
    super();
    if (!identityPlatform || typeof identityPlatform.readIdentity !== 'function') {
      throw configurationError('IdentityPlatformSourceAdapter requires an identity platform exposing readIdentity()');
    }
    this.identityPlatform = identityPlatform;
  }

  async getIdentitySnapshot(travellerIdentityId) {
    try {
      // Public, privacy-applied view only. Returns null for soft-deleted.
      const snapshot = await this.identityPlatform.readIdentity(travellerIdentityId, { view: 'public' });
      return snapshot ?? null;
    } catch (error) {
      // A missing identity is "unresolvable", not an exceptional condition here.
      if (error && error.code === 'IDENTITY_NOT_FOUND') return null;
      throw error;
    }
  }
}
