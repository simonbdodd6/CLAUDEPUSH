export class TravelIntelligenceContextError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelIntelligenceContextError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelIntelligenceContextError('VALIDATION_FAILED', message, details);
}

export function configurationError(message, details = {}) {
  return new TravelIntelligenceContextError('CONFIGURATION_ERROR', message, details);
}
