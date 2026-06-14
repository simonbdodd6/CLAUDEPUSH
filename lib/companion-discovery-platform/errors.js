export class CompanionDiscoveryPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CompanionDiscoveryPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new CompanionDiscoveryPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(profileId) {
  return new CompanionDiscoveryPlatformError('PROFILE_NOT_FOUND', `Discovery profile not found: ${profileId}`, { profileId });
}

export function forbiddenError(message, details = {}) {
  return new CompanionDiscoveryPlatformError('FORBIDDEN', message, details);
}
