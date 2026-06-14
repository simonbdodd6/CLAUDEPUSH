export class EventPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'EventPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new EventPlatformError('VALIDATION_FAILED', message, details);
}

export function duplicateError(eventId) {
  return new EventPlatformError('DUPLICATE_EVENT', `Event already exists: ${eventId}`, { eventId });
}

export function notFoundError(eventId) {
  return new EventPlatformError('EVENT_NOT_FOUND', `Event not found: ${eventId}`, { eventId });
}
