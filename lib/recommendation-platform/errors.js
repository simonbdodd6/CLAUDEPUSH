export class RecommendationPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RecommendationPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new RecommendationPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(recommendationId) {
  return new RecommendationPlatformError(
    'RECOMMENDATION_NOT_FOUND',
    `Recommendation not found: ${recommendationId}`,
    { recommendationId },
  );
}
