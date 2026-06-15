// Platform Kernel — error primitives.
//
// The kernel defines its OWN minimal error so it is usable standalone, but its
// throwing helpers accept an injected `errorFactory` so each consuming module
// keeps throwing ITS OWN error type/message — centralising the logic without
// changing any module's error identity.

export class PlatformKernelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlatformKernelError';
    this.code = code;
    this.details = details;
  }
}

// Default error factory used when a caller does not inject its own.
export function kernelValidationError(message, details = {}) {
  return new PlatformKernelError('VALIDATION_FAILED', message, details);
}
