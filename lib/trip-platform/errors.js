export class TripPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TripPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TripPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(tripId) {
  return new TripPlatformError('TRIP_NOT_FOUND', `Trip not found: ${tripId}`, { tripId });
}

export function permissionError(message = 'Permission denied', details = {}) {
  return new TripPlatformError('PERMISSION_DENIED', message, details);
}

export function transitionError(message, details = {}) {
  return new TripPlatformError('INVALID_TRIP_STATUS_TRANSITION', message, details);
}

