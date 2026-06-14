export class TravellerDigitalTwinPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravellerDigitalTwinPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravellerDigitalTwinPlatformError('VALIDATION_FAILED', message, details);
}

export function configurationError(message, details = {}) {
  return new TravellerDigitalTwinPlatformError('CONFIGURATION_ERROR', message, details);
}
