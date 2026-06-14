export class TravelRelationshipGraphError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelRelationshipGraphError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelRelationshipGraphError('VALIDATION_FAILED', message, details);
}

export function notFoundError(relationshipId) {
  return new TravelRelationshipGraphError(
    'RELATIONSHIP_NOT_FOUND',
    `Relationship not found: ${relationshipId}`,
    { relationshipId },
  );
}

export function duplicateError(details = {}) {
  return new TravelRelationshipGraphError(
    'DUPLICATE_RELATIONSHIP',
    'An equivalent relationship already exists',
    details,
  );
}
