export class ActivityPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ActivityPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new ActivityPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(activityId) {
  return new ActivityPlatformError('ACTIVITY_NOT_FOUND', `Activity not found: ${activityId}`, { activityId });
}

export function permissionError(message = 'Permission denied', details = {}) {
  return new ActivityPlatformError('PERMISSION_DENIED', message, details);
}

export function transitionError(message, details = {}) {
  return new ActivityPlatformError('INVALID_ACTIVITY_STATUS_TRANSITION', message, details);
}
