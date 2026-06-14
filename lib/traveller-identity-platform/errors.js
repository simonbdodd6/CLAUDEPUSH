export class TravellerIdentityPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravellerIdentityPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravellerIdentityPlatformError('VALIDATION_FAILED', message, details);
}

export function configurationError(message, details = {}) {
  return new TravellerIdentityPlatformError('CONFIGURATION_ERROR', message, details);
}

export function notFoundError(travellerIdentityId) {
  return new TravellerIdentityPlatformError(
    'TRAVELLER_NOT_FOUND',
    `Traveller identity not resolvable: ${travellerIdentityId}`,
    { travellerIdentityId },
  );
}

export function identityInactiveError(travellerIdentityId, status) {
  return new TravellerIdentityPlatformError(
    'IDENTITY_INACTIVE',
    `Identity ${travellerIdentityId} is not ACTIVE (status: ${status})`,
    { travellerIdentityId, status },
  );
}

export function notATravellerError(travellerIdentityId, details = {}) {
  return new TravellerIdentityPlatformError(
    'NOT_A_TRAVELLER',
    `Identity ${travellerIdentityId} is not a valid traveller`,
    { travellerIdentityId, ...details },
  );
}
