export class TravellerPreferencesPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravellerPreferencesPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravellerPreferencesPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(travellerIdentityId) {
  return new TravellerPreferencesPlatformError(
    'TRAVELLER_PREFERENCES_NOT_FOUND',
    `Traveller preferences not found: ${travellerIdentityId}`,
    { travellerIdentityId },
  );
}

export function conflictError(message, details = {}) {
  return new TravellerPreferencesPlatformError('TRAVELLER_PREFERENCES_CONFLICT', message, details);
}

export function permissionError(message = 'Permission denied', details = {}) {
  return new TravellerPreferencesPlatformError('PERMISSION_DENIED', message, details);
}
