// Executive Reasoning — domain-specific error types.

export class ExecutiveReasoningError extends Error {
  constructor(message, code = 'EXECUTIVE_REASONING_ERROR') {
    super(message);
    this.name = 'ExecutiveReasoningError';
    this.code = code;
  }
}

export class InvalidReasoningInputError extends ExecutiveReasoningError {
  constructor(message) {
    super(message, 'INVALID_REASONING_INPUT');
    this.name = 'InvalidReasoningInputError';
  }
}
