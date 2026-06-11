import { randomUUID } from 'crypto';
import {
  AUDIT_ACTIONS,
  DEFAULT_PRIVACY_SETTINGS,
  IDENTITY_ROLES,
  IDENTITY_STATUS,
  IDENTITY_TYPES,
  PROFILE_VISIBILITY,
  REPUTATION_PLACEHOLDER,
  TRUST_PLACEHOLDER,
  VERIFICATION_STATUS,
} from './constants.js';
import { InMemoryIdentityRepository } from './repository.js';
import { notFoundError, permissionError, validationError } from './errors.js';

const VALID_ROLES = new Set(Object.values(IDENTITY_ROLES));
const VALID_TYPES = new Set(Object.values(IDENTITY_TYPES));
const VALID_VERIFICATION = new Set(Object.values(VERIFICATION_STATUS));

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function requireActor(actor, action) {
  if (!actor?.id) {
    throw permissionError(`Actor is required for ${action}`, { action });
  }
}

function normalizeRoles(roles = []) {
  const normalized = unique(roles);
  const invalid = normalized.filter(role => !VALID_ROLES.has(role));
  if (invalid.length) throw validationError('Unsupported identity role', { invalid });
  return normalized.length ? normalized : [IDENTITY_ROLES.TRAVELLER];
}

function validateIdentityType(type) {
  if (!VALID_TYPES.has(type)) throw validationError('Unsupported identity type', { type });
}

function normalizeLanguages(languages = []) {
  return unique(languages.map(lang => String(lang).trim().toLowerCase()).filter(Boolean));
}

function normalizePublicProfile(input = {}) {
  return {
    displayName: input.displayName?.trim() ?? '',
    avatarUrl: input.avatarUrl ?? null,
    bio: input.bio ?? '',
    country: input.country ?? null,
    languages: normalizeLanguages(input.languages ?? []),
    timezone: input.timezone ?? null,
  };
}

function normalizeInternalProfile(input = {}) {
  return {
    legalName: input.legalName ?? null,
    email: input.email ? String(input.email).trim().toLowerCase() : null,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
    emergencyContact: input.emergencyContact ?? null,
    enterpriseAccountRef: input.enterpriseAccountRef ?? null,
    ssoSubjectRef: input.ssoSubjectRef ?? null,
    federationRef: input.federationRef ?? null,
  };
}

function normalizePrivacySettings(input = {}) {
  const merged = { ...DEFAULT_PRIVACY_SETTINGS, ...input };
  if (!Object.values(PROFILE_VISIBILITY).includes(merged.profileVisibility)) {
    throw validationError('Unsupported profile visibility', { profileVisibility: merged.profileVisibility });
  }
  return merged;
}

function createVerification(input = {}) {
  const status = input.status ?? VERIFICATION_STATUS.UNVERIFIED;
  if (!VALID_VERIFICATION.has(status)) throw validationError('Unsupported verification status', { status });
  return {
    status,
    method: input.method ?? null,
    verifiedAt: status === VERIFICATION_STATUS.VERIFIED ? (input.verifiedAt ?? now()) : null,
    reviewedAt: input.reviewedAt ?? null,
    reviewedBy: input.reviewedBy ?? null,
    evidenceRef: input.evidenceRef ?? null,
    reason: input.reason ?? null,
  };
}

function publicView(identity) {
  if (!identity || identity.status === IDENTITY_STATUS.SOFT_DELETED) return null;
  const privacy = identity.privacySettings ?? DEFAULT_PRIVACY_SETTINGS;
  return {
    id: identity.id,
    type: identity.type,
    roles: identity.roles,
    status: identity.status,
    verified: identity.verified,
    verificationStatus: identity.verification.status,
    publicProfile: {
      displayName: identity.publicProfile.displayName,
      avatarUrl: identity.publicProfile.avatarUrl,
      bio: identity.publicProfile.bio,
      country: privacy.showCountry ? identity.publicProfile.country : null,
      languages: privacy.showLanguages ? identity.publicProfile.languages : [],
      timezone: privacy.showTimezone ? identity.publicProfile.timezone : null,
    },
    trust: identity.trust,
    reputation: identity.reputation,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}

function internalView(identity) {
  return clone(identity);
}

function anonymizeIdentity(identity, actor) {
  const timestamp = now();
  return {
    ...identity,
    status: IDENTITY_STATUS.SOFT_DELETED,
    deletedAt: timestamp,
    deletedBy: actor.id,
    publicProfile: {
      displayName: 'Deleted identity',
      avatarUrl: null,
      bio: '',
      country: null,
      languages: [],
      timezone: null,
    },
    internalProfile: {
      legalName: null,
      email: null,
      phone: null,
      notes: null,
      emergencyContact: null,
      enterpriseAccountRef: null,
      ssoSubjectRef: null,
      federationRef: null,
    },
    privacySettings: {
      ...DEFAULT_PRIVACY_SETTINGS,
      profileVisibility: PROFILE_VISIBILITY.PRIVATE,
      allowDiscovery: false,
      allowBusinessContact: false,
    },
    updatedAt: timestamp,
  };
}

export function createIdentityPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryIdentityRepository();

  async function audit(action, identityId, actor, details = {}) {
    return repository.appendAudit({
      action,
      identityId,
      actorId: actor?.id ?? 'system',
      actorType: actor?.type ?? 'SYSTEM',
      details,
    });
  }

  async function createIdentity(input = {}, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'createIdentity');
    const type = input.type ?? IDENTITY_TYPES.PERSON;
    validateIdentityType(type);

    const roles = normalizeRoles(input.roles);
    const timestamp = now();
    const verification = createVerification(input.verification);
    const identity = {
      id: input.id ?? `idn_${randomUUID()}`,
      type,
      roles,
      status: IDENTITY_STATUS.ACTIVE,
      verified: verification.status === VERIFICATION_STATUS.VERIFIED,
      verification,
      publicProfile: normalizePublicProfile(input.publicProfile),
      internalProfile: normalizeInternalProfile(input.internalProfile),
      privacySettings: normalizePrivacySettings(input.privacySettings),
      trust: clone(input.trust ?? TRUST_PLACEHOLDER),
      reputation: clone(input.reputation ?? REPUTATION_PLACEHOLDER),
      country: input.country ?? input.publicProfile?.country ?? null,
      languages: normalizeLanguages(input.languages ?? input.publicProfile?.languages ?? []),
      timezone: input.timezone ?? input.publicProfile?.timezone ?? null,
      emergencyContact: input.emergencyContact ?? input.internalProfile?.emergencyContact ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      suspendedAt: null,
      deletedAt: null,
      metadata: {
        federationReady: true,
        ssoReady: true,
        enterpriseReady: true,
        ...input.metadata,
      },
    };

    await repository.create(identity);
    await audit(AUDIT_ACTIONS.IDENTITY_CREATED, identity.id, actor, { roles, type });
    return internalView(identity);
  }

  async function readIdentity(identityId, options = {}) {
    const identity = await repository.get(identityId);
    if (!identity) throw notFoundError(identityId);
    const view = options.view ?? 'public';
    if (view === 'internal') {
      requireActor(options.actor, 'readIdentity:internal');
      await audit(AUDIT_ACTIONS.INTERNAL_PROFILE_READ, identity.id, options.actor, { reason: options.reason ?? null });
      return internalView(identity);
    }
    return publicView(identity);
  }

  async function updateProfile(identityId, patch = {}, actor) {
    requireActor(actor, 'updateProfile');
    const updated = await repository.update(identityId, identity => {
      if (identity.status === IDENTITY_STATUS.SOFT_DELETED) throw validationError('Cannot update a soft-deleted identity', { identityId });
      const publicPatch = patch.publicProfile ? normalizePublicProfile({ ...identity.publicProfile, ...patch.publicProfile }) : identity.publicProfile;
      const internalPatch = patch.internalProfile ? normalizeInternalProfile({ ...identity.internalProfile, ...patch.internalProfile }) : identity.internalProfile;
      const privacyPatch = patch.privacySettings ? normalizePrivacySettings({ ...identity.privacySettings, ...patch.privacySettings }) : identity.privacySettings;
      return {
        ...identity,
        publicProfile: publicPatch,
        internalProfile: internalPatch,
        privacySettings: privacyPatch,
        country: patch.country ?? publicPatch.country ?? identity.country,
        languages: patch.languages
          ? normalizeLanguages(patch.languages)
          : patch.publicProfile?.languages
            ? publicPatch.languages
            : identity.languages,
        timezone: patch.timezone ?? publicPatch.timezone ?? identity.timezone,
        emergencyContact: patch.emergencyContact ?? internalPatch.emergencyContact ?? identity.emergencyContact,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(identityId);
    await audit(AUDIT_ACTIONS.PROFILE_UPDATED, identityId, actor, { fields: Object.keys(patch) });
    return internalView(updated);
  }

  async function changeRole(identityId, roles, actor) {
    requireActor(actor, 'changeRole');
    const normalizedRoles = normalizeRoles(roles);
    const updated = await repository.update(identityId, identity => ({
      ...identity,
      roles: normalizedRoles,
      updatedAt: now(),
    }));
    if (!updated) throw notFoundError(identityId);
    await audit(AUDIT_ACTIONS.ROLE_CHANGED, identityId, actor, { roles: normalizedRoles });
    return internalView(updated);
  }

  async function setVerificationStatus(identityId, verificationPatch = {}, actor) {
    requireActor(actor, 'setVerificationStatus');
    const updated = await repository.update(identityId, identity => {
      const verification = createVerification({
        ...identity.verification,
        ...verificationPatch,
        reviewedAt: verificationPatch.reviewedAt ?? now(),
        reviewedBy: verificationPatch.reviewedBy ?? actor.id,
      });
      return {
        ...identity,
        verified: verification.status === VERIFICATION_STATUS.VERIFIED,
        verification,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(identityId);
    await audit(AUDIT_ACTIONS.VERIFICATION_STATUS_CHANGED, identityId, actor, { status: updated.verification.status });
    return internalView(updated);
  }

  async function suspendIdentity(identityId, reason, actor) {
    requireActor(actor, 'suspendIdentity');
    if (!reason) throw validationError('Suspension reason is required');
    const updated = await repository.update(identityId, identity => ({
      ...identity,
      status: IDENTITY_STATUS.SUSPENDED,
      suspensionReason: reason,
      suspendedAt: now(),
      suspendedBy: actor.id,
      updatedAt: now(),
    }));
    if (!updated) throw notFoundError(identityId);
    await audit(AUDIT_ACTIONS.IDENTITY_SUSPENDED, identityId, actor, { reason });
    return internalView(updated);
  }

  async function softDeleteIdentity(identityId, actor, options = {}) {
    requireActor(actor, 'softDeleteIdentity');
    const updated = await repository.update(identityId, identity => anonymizeIdentity(identity, actor));
    if (!updated) throw notFoundError(identityId);
    await audit(AUDIT_ACTIONS.IDENTITY_SOFT_DELETED, identityId, actor, { reason: options.reason ?? null, gdpr: options.gdpr ?? false });
    return internalView(updated);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createIdentity,
    readIdentity,
    updateProfile,
    changeRole,
    setVerificationStatus,
    suspendIdentity,
    softDeleteIdentity,
    getAuditEvents,
  };
}
