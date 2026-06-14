import {
  TRAVELLER_EXPECTED_TYPE,
  TRAVELLER_REQUIRED_ROLE,
  TRAVELLER_REQUIRED_STATUS,
} from './constants.js';
import {
  configurationError,
  identityInactiveError,
  notATravellerError,
  notFoundError,
  validationError,
  TravellerIdentityPlatformError,
} from './errors.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertId(travellerIdentityId) {
  if (typeof travellerIdentityId !== 'string' || !travellerIdentityId.trim()) {
    throw validationError('travellerIdentityId is required', { travellerIdentityId });
  }
  return travellerIdentityId.trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Pure, deterministic projection of an identity public snapshot into the
 * privacy-safe traveller view. Every field originates from the identity
 * platform's PUBLIC view (privacy already applied); no internal/PII field is
 * read or exposed.
 */
function buildTravellerView(snapshot) {
  const publicProfile = snapshot.publicProfile ?? {};
  return {
    travellerId: snapshot.id,
    type: snapshot.type ?? null,
    status: snapshot.status ?? null,
    isTraveller: true,
    verified: snapshot.verified === true,
    verificationStatus: snapshot.verificationStatus ?? null,
    displayName: publicProfile.displayName ?? null,
    avatarUrl: publicProfile.avatarUrl ?? null,
    bio: publicProfile.bio ?? '',
    country: publicProfile.country ?? null,
    languages: asArray(publicProfile.languages),
    timezone: publicProfile.timezone ?? null,
    trust: clone(snapshot.trust ?? null),
    reputation: clone(snapshot.reputation ?? null),
    createdAt: snapshot.createdAt ?? null,
    updatedAt: snapshot.updatedAt ?? null,
  };
}

/**
 * Validate an identity snapshot against the traveller invariants. Throws a
 * typed error for each distinct failure mode. Does not mutate the snapshot.
 */
function validateTravellerSnapshot(travellerIdentityId, snapshot) {
  if (!snapshot) {
    // Covers both genuinely missing and soft-deleted identities (the public
    // view returns null for soft-deleted records).
    throw notFoundError(travellerIdentityId);
  }
  if (snapshot.status && snapshot.status !== TRAVELLER_REQUIRED_STATUS) {
    throw identityInactiveError(travellerIdentityId, snapshot.status);
  }
  if (!asArray(snapshot.roles).includes(TRAVELLER_REQUIRED_ROLE)) {
    throw notATravellerError(travellerIdentityId, { reason: 'missing_traveller_role', roles: asArray(snapshot.roles) });
  }
  // Type is checked only where the snapshot provides it.
  if (snapshot.type != null && snapshot.type !== TRAVELLER_EXPECTED_TYPE) {
    throw notATravellerError(travellerIdentityId, { reason: 'unexpected_type', type: snapshot.type });
  }
  return snapshot;
}

export function createTravellerIdentityPlatform(options = {}) {
  const identitySource = options.identitySource;
  if (!identitySource || typeof identitySource.getIdentitySnapshot !== 'function') {
    throw configurationError('createTravellerIdentityPlatform requires an identitySource implementing getIdentitySnapshot()');
  }

  async function fetchSnapshot(travellerIdentityId) {
    return identitySource.getIdentitySnapshot(travellerIdentityId);
  }

  /**
   * Resolve a travellerIdentityId to a validated, privacy-safe traveller view.
   * Throws a typed error if the identity is missing, inactive, or not a
   * traveller. This is the canonical entry point; the others build on it.
   */
  async function resolveTraveller(travellerIdentityId) {
    const id = assertId(travellerIdentityId);
    const snapshot = await fetchSnapshot(id);
    validateTravellerSnapshot(id, snapshot);
    return buildTravellerView(snapshot);
  }

  /**
   * Guard for travel modules: confirm an id is a valid active traveller and
   * return the canonical id. Throws otherwise. Use this at the boundary of a
   * travel operation instead of trusting a raw string id.
   */
  async function assertActiveTraveller(travellerIdentityId) {
    const view = await resolveTraveller(travellerIdentityId);
    return view.travellerId;
  }

  /**
   * Return the privacy-safe traveller view for a valid traveller. Throws if the
   * identity is not a valid active traveller (there is no view for a non-traveller).
   */
  async function getTravellerView(travellerIdentityId) {
    return resolveTraveller(travellerIdentityId);
  }

  /**
   * Non-throwing predicate: true iff the id resolves to a valid active
   * traveller. Only swallows the platform's own typed validation errors;
   * unexpected errors (e.g. a broken adapter) propagate.
   */
  async function isTraveller(travellerIdentityId) {
    try {
      await resolveTraveller(travellerIdentityId);
      return true;
    } catch (error) {
      if (error instanceof TravellerIdentityPlatformError) return false;
      throw error;
    }
  }

  return {
    identitySource,
    resolveTraveller,
    assertActiveTraveller,
    getTravellerView,
    isTraveller,
  };
}
