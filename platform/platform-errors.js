// Platform standard error types.
// Every engine should throw/return these rather than raw Errors.

export const ERROR_CODES = {
  // Engine lifecycle
  ENGINE_NOT_FOUND:         'ENGINE_NOT_FOUND',
  ENGINE_UNAVAILABLE:       'ENGINE_UNAVAILABLE',
  ENGINE_TIMEOUT:           'ENGINE_TIMEOUT',
  ENGINE_DEPENDENCY_FAILED: 'ENGINE_DEPENDENCY_FAILED',
  // Request / contract
  INVALID_REQUEST:          'INVALID_REQUEST',
  INVALID_RESPONSE:         'INVALID_RESPONSE',
  MISSING_FIELD:            'MISSING_FIELD',
  // Data
  ENTITY_NOT_FOUND:         'ENTITY_NOT_FOUND',
  DATA_UNAVAILABLE:         'DATA_UNAVAILABLE',
  PERMISSION_DENIED:        'PERMISSION_DENIED',
  // Orchestration
  PIPELINE_FAILED:          'PIPELINE_FAILED',
  PHASE_FAILED:             'PHASE_FAILED',
  CIRCULAR_DEPENDENCY:      'CIRCULAR_DEPENDENCY',
  // Platform
  PLATFORM_INITIALISING:    'PLATFORM_INITIALISING',
  HEALTH_CHECK_FAILED:      'HEALTH_CHECK_FAILED',
};

export class PlatformError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name      = 'PlatformError';
    this.code      = code;
    this.details   = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details, timestamp: this.timestamp };
  }
}

export class EngineNotFoundError extends PlatformError {
  constructor(engineId) {
    super(ERROR_CODES.ENGINE_NOT_FOUND, `Engine not found: '${engineId}'`, { engineId });
    this.name = 'EngineNotFoundError';
  }
}

export class EngineUnavailableError extends PlatformError {
  constructor(engineId, reason = null) {
    super(ERROR_CODES.ENGINE_UNAVAILABLE, `Engine unavailable: '${engineId}'${reason ? ` — ${reason}` : ''}`, { engineId, reason });
    this.name = 'EngineUnavailableError';
  }
}

export class EngineTimeoutError extends PlatformError {
  constructor(engineId, timeoutMs) {
    super(ERROR_CODES.ENGINE_TIMEOUT, `Engine '${engineId}' timed out after ${timeoutMs}ms`, { engineId, timeoutMs });
    this.name = 'EngineTimeoutError';
  }
}

export class InvalidRequestError extends PlatformError {
  constructor(message, fields = []) {
    super(ERROR_CODES.INVALID_REQUEST, message, { fields });
    this.name = 'InvalidRequestError';
  }
}

export class DependencyFailedError extends PlatformError {
  constructor(engineId, dependencyId, reason = null) {
    super(ERROR_CODES.ENGINE_DEPENDENCY_FAILED, `Engine '${engineId}' dependency '${dependencyId}' failed`, { engineId, dependencyId, reason });
    this.name = 'DependencyFailedError';
  }
}

export class PipelineFailedError extends PlatformError {
  constructor(pipelineId, phase, reason) {
    super(ERROR_CODES.PIPELINE_FAILED, `Pipeline '${pipelineId}' failed at phase '${phase}'`, { pipelineId, phase, reason });
    this.name = 'PipelineFailedError';
  }
}

// Normalise any thrown value to a PlatformError
export function normalise(err, engineId = null) {
  if (err instanceof PlatformError) return err;
  const msg = err?.message ?? String(err);
  const code = engineId ? ERROR_CODES.ENGINE_UNAVAILABLE : ERROR_CODES.INVALID_REQUEST;
  return new PlatformError(code, msg, engineId ? { engineId } : null);
}

// Build a failed PlatformResponse from an error
export function errorResponse(requestId, err) {
  const pe = normalise(err);
  return {
    requestId,
    success: false,
    data:    null,
    error:   pe.toJSON(),
    meta:    { durationMs: 0, isMock: false },
  };
}
