export class TravelIntelligenceOrchestratorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelIntelligenceOrchestratorError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelIntelligenceOrchestratorError('VALIDATION_FAILED', message, details);
}

export function configurationError(message, details = {}) {
  return new TravelIntelligenceOrchestratorError('CONFIGURATION_ERROR', message, details);
}
