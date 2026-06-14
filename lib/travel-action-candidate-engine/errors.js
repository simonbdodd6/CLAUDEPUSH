export class TravelActionCandidateEngineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelActionCandidateEngineError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelActionCandidateEngineError('VALIDATION_FAILED', message, details);
}

export function configurationError(message, details = {}) {
  return new TravelActionCandidateEngineError('CONFIGURATION_ERROR', message, details);
}

export function notFoundError(actionCandidateId) {
  return new TravelActionCandidateEngineError('CANDIDATE_NOT_FOUND', `Action candidate not found: ${actionCandidateId}`, { actionCandidateId });
}
