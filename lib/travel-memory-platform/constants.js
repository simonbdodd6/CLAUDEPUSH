export const MEMORY_ORIGIN = Object.freeze({
  EXPLICIT: 'explicit', // entered by the traveller
  LEARNED: 'learned', // derived deterministically from behaviour snapshots
});

export const MEMORY_ORIGINS = Object.freeze(Object.values(MEMORY_ORIGIN));

export const MEMORY_POLARITY = Object.freeze({
  POSITIVE: 'positive', // a positive preference (likes / wants)
  NEGATIVE: 'negative', // a negative preference (dislikes / avoids)
});

export const MEMORY_POLARITIES = Object.freeze(Object.values(MEMORY_POLARITY));

export const MEMORY_AUDIT_ACTIONS = Object.freeze({
  MEMORY_CREATED: 'MEMORY_CREATED',
  EXPLICIT_RECORDED: 'EXPLICIT_RECORDED',
  OBSERVATION_REINFORCED: 'OBSERVATION_REINFORCED',
  OBSERVATION_CONTRADICTED: 'OBSERVATION_CONTRADICTED',
  POLARITY_FLIPPED: 'POLARITY_FLIPPED',
  OBSERVATION_IGNORED_LOCKED: 'OBSERVATION_IGNORED_LOCKED',
  MEMORY_CORRECTED: 'MEMORY_CORRECTED',
  MEMORY_LOCKED: 'MEMORY_LOCKED',
  MEMORY_UNLOCKED: 'MEMORY_UNLOCKED',
  DECAY_APPLIED: 'DECAY_APPLIED',
});

// Deterministic confidence model. No probabilities are learned; confidence is a
// pure function of origin and observation count.
export const MEMORY_DEFAULTS = Object.freeze({
  EXPLICIT_BASE_CONFIDENCE: 0.9,
  LEARNED_BASE_CONFIDENCE: 0.4,
  LEARNED_STEP: 0.1,
  CONFIDENCE_MAX: 0.95,
  CONFIDENCE_MIN: 0,
  // When a contradicting observation drags confidence at/below this, the
  // memory's polarity flips and confidence resets to the learned base.
  FLIP_THRESHOLD: 0.2,
  // Linear freshness window: decayScore reaches 0 this many days after the
  // memory was last confirmed.
  DECAY_WINDOW_DAYS: 180,
});
