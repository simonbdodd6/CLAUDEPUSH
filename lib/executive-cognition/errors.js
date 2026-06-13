// Executive Cognitive Engine — error types.

export class CognitiveEngineError extends Error {
  constructor(message, code = 'COGNITIVE_ENGINE_ERROR') {
    super(message);
    this.name = 'CognitiveEngineError';
    this.code = code;
  }
}

export class InvalidObjectiveError extends CognitiveEngineError {
  constructor(message) { super(message, 'INVALID_OBJECTIVE'); this.name = 'InvalidObjectiveError'; }
}
