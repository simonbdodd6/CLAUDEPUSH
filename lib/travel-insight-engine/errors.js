export class TravelInsightEngineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelInsightEngineError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelInsightEngineError('VALIDATION_FAILED', message, details);
}

export function configurationError(message, details = {}) {
  return new TravelInsightEngineError('CONFIGURATION_ERROR', message, details);
}

export function notFoundError(insightId) {
  return new TravelInsightEngineError('INSIGHT_NOT_FOUND', `Insight not found: ${insightId}`, { insightId });
}
