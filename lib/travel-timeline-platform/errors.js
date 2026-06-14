export class TravelTimelinePlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelTimelinePlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelTimelinePlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(timelineEventId) {
  return new TravelTimelinePlatformError(
    'TIMELINE_EVENT_NOT_FOUND',
    `Timeline event not found: ${timelineEventId}`,
    { timelineEventId },
  );
}

export function duplicateError(idempotencyKey, existingEventId) {
  return new TravelTimelinePlatformError(
    'DUPLICATE_TIMELINE_EVENT',
    `Timeline event already exists for idempotencyKey: ${idempotencyKey}`,
    { idempotencyKey, existingEventId },
  );
}

export function immutableError(message, details = {}) {
  return new TravelTimelinePlatformError('IMMUTABLE_EVENT', message, details);
}
