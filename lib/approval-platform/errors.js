export class ApprovalPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ApprovalPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new ApprovalPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(requestId) {
  return new ApprovalPlatformError('REQUEST_NOT_FOUND', `Approval request not found: ${requestId}`, { requestId });
}

export function duplicateError(requestId) {
  return new ApprovalPlatformError('DUPLICATE_REQUEST', `Approval request already exists: ${requestId}`, { requestId });
}

export function permissionError(message = 'Actor is required', details = {}) {
  return new ApprovalPlatformError('PERMISSION_DENIED', message, details);
}

export function transitionError(message, details = {}) {
  return new ApprovalPlatformError('INVALID_TRANSITION', message, details);
}

export function policyError(code, message, details = {}) {
  return new ApprovalPlatformError(code, message, details);
}
