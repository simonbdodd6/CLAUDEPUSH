export class DestinationPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DestinationPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new DestinationPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(destinationId) {
  return new DestinationPlatformError('DESTINATION_NOT_FOUND', `Destination not found: ${destinationId}`, { destinationId });
}

export function permissionError(message = 'Permission denied', details = {}) {
  return new DestinationPlatformError('PERMISSION_DENIED', message, details);
}

export function transitionError(message, details = {}) {
  return new DestinationPlatformError('INVALID_DESTINATION_STATUS_TRANSITION', message, details);
}

