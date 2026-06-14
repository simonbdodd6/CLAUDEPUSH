export class TravelMemoryPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelMemoryPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new TravelMemoryPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(memoryId) {
  return new TravelMemoryPlatformError('MEMORY_NOT_FOUND', `Travel memory not found: ${memoryId}`, { memoryId });
}

export function versionNotFoundError(version) {
  return new TravelMemoryPlatformError('VERSION_NOT_FOUND', `Travel memory version not found: ${version}`, { version });
}

export function forbiddenError(message, details = {}) {
  return new TravelMemoryPlatformError('FORBIDDEN', message, details);
}
