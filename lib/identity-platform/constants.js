export const IDENTITY_ROLES = Object.freeze({
  TRAVELLER: 'TRAVELLER',
  BUSINESS: 'BUSINESS',
  HOST: 'HOST',
  LOCAL_GUIDE: 'LOCAL_GUIDE',
  MODERATOR: 'MODERATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
  AI_AGENT: 'AI_AGENT',
  ORGANIZATION: 'ORGANIZATION',
});

export const IDENTITY_TYPES = Object.freeze({
  PERSON: 'PERSON',
  BUSINESS: 'BUSINESS',
  AI_AGENT: 'AI_AGENT',
  ORGANIZATION: 'ORGANIZATION',
});

export const IDENTITY_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  SOFT_DELETED: 'SOFT_DELETED',
});

export const VERIFICATION_STATUS = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED',
});

export const PROFILE_VISIBILITY = Object.freeze({
  PUBLIC: 'PUBLIC',
  AUTHENTICATED: 'AUTHENTICATED',
  PRIVATE: 'PRIVATE',
});

export const AUDIT_ACTIONS = Object.freeze({
  IDENTITY_CREATED: 'IDENTITY_CREATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  VERIFICATION_STATUS_CHANGED: 'VERIFICATION_STATUS_CHANGED',
  IDENTITY_SUSPENDED: 'IDENTITY_SUSPENDED',
  IDENTITY_SOFT_DELETED: 'IDENTITY_SOFT_DELETED',
  INTERNAL_PROFILE_READ: 'INTERNAL_PROFILE_READ',
});

export const DEFAULT_PRIVACY_SETTINGS = Object.freeze({
  profileVisibility: PROFILE_VISIBILITY.AUTHENTICATED,
  showCountry: true,
  showLanguages: true,
  showTimezone: false,
  allowDiscovery: true,
  allowBusinessContact: false,
});

export const TRUST_PLACEHOLDER = Object.freeze({
  score: null,
  level: 'UNASSESSED',
  lastCalculatedAt: null,
});

export const REPUTATION_PLACEHOLDER = Object.freeze({
  summary: 'No reputation events yet',
  eventsCount: 0,
  lastEventAt: null,
});

