export class IdentityPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IdentityPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new IdentityPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(identityId) {
  return new IdentityPlatformError('IDENTITY_NOT_FOUND', `Identity not found: ${identityId}`, { identityId });
}

export function permissionError(message = 'Permission denied', details = {}) {
  return new IdentityPlatformError('PERMISSION_DENIED', message, details);
}

export function conflictError(message, details = {}) {
  return new IdentityPlatformError('IDENTITY_CONFLICT', message, details);
}

