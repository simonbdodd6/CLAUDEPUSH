export class TripIntelligencePlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TripIntelligencePlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TripIntelligencePlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(tripPlanId) {
  return new TripIntelligencePlatformError('TRIP_PLAN_NOT_FOUND', `Trip plan not found: ${tripPlanId}`, { tripPlanId });
}
