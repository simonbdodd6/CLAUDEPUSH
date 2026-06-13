/**
 * AI Brain — Coach DNA Engine Types (M23)
 *
 * The Coach DNA Engine discovers WHO a coach is from their historical
 * observations and learning records. It never assumes — every characteristic
 * is derived from evidence, matures gradually, and decays without reinforcement.
 *
 * Pure constants only. No Brain imports, no Core imports.
 *
 * Relationship to M19 Coach Learning:
 *   - The Learning Engine owns observations (append-only) and short-horizon
 *     preferences. The DNA Engine is a READ-ONLY consumer of those observations
 *     that builds a long-horizon, season-spanning identity profile.
 *   - DNA never writes the CoachProfile and never edits Core.
 *   - Explicit coach settings (coach_preference_set) always override inferred
 *     DNA — DNA is advisory.
 */

/** Schema version of a CoachDNA object. Bump on breaking shape change. */
export const DNA_VERSION = '1.0'

/** Feature flag (absent = enabled, opt-out pattern). */
export const DNA_FLAG = 'ai.coachDNA'

/** Subscription tiers that unlock Coach DNA (advanced coaching intelligence). */
export const DNA_TIERS = Object.freeze(new Set(['professional', 'club', 'enterprise']))

/** The ten discovered characteristics. */
export const CHARACTERISTIC = Object.freeze({
  TACTICAL_TENDENCIES:   'tacticalTendencies',
  SELECTION_PHILOSOPHY:  'selectionPhilosophy',
  ROTATION_PHILOSOPHY:   'rotationPhilosophy',
  WELFARE_EMPHASIS:      'welfareEmphasis',
  DEVELOPMENT_EMPHASIS:  'developmentEmphasis',
  ATTACK_DEFENCE_BIAS:   'attackVsDefenceBias',
  RISK_APPETITE:         'riskAppetite',
  YOUTH_PROMOTION:       'youthPromotionTendency',
  CONTINUITY_PREFERENCE: 'continuityPreference',
  EXPERIMENTATION_LEVEL: 'experimentationLevel',
})

export const CHARACTERISTIC_KEYS = Object.freeze(Object.values(CHARACTERISTIC))

/**
 * Each characteristic is a 0–100 axis (50 = neutral). `low`/`high` are the
 * human-readable poles used to describe a discovered band.
 */
export const CHARACTERISTIC_META = Object.freeze({
  [CHARACTERISTIC.TACTICAL_TENDENCIES]:   { label: 'Tactical tendencies',   low: 'reactive / instinctive', high: 'structured & proactive' },
  [CHARACTERISTIC.SELECTION_PHILOSOPHY]:  { label: 'Selection philosophy',  low: 'loyalty-based',          high: 'meritocratic' },
  [CHARACTERISTIC.ROTATION_PHILOSOPHY]:   { label: 'Rotation philosophy',   low: 'settled side',           high: 'heavy rotation' },
  [CHARACTERISTIC.WELFARE_EMPHASIS]:      { label: 'Welfare emphasis',      low: 'performance-first',      high: 'welfare-first' },
  [CHARACTERISTIC.DEVELOPMENT_EMPHASIS]:  { label: 'Development emphasis',  low: 'results-first',          high: 'development-first' },
  [CHARACTERISTIC.ATTACK_DEFENCE_BIAS]:   { label: 'Attack vs defence',     low: 'defence-oriented',       high: 'attack-oriented' },
  [CHARACTERISTIC.RISK_APPETITE]:         { label: 'Risk appetite',         low: 'cautious',               high: 'bold' },
  [CHARACTERISTIC.YOUTH_PROMOTION]:       { label: 'Youth promotion',       low: 'experience-first',       high: 'youth-first' },
  [CHARACTERISTIC.CONTINUITY_PREFERENCE]: { label: 'Continuity preference', low: 'change-driven',          high: 'continuity-driven' },
  [CHARACTERISTIC.EXPERIMENTATION_LEVEL]: { label: 'Experimentation level', low: 'conventional',           high: 'experimental' },
})

/**
 * Maps explicit coach_preference_set keys to a DNA characteristic + value scale.
 * Explicit settings always win over inferred DNA (DNA is advisory).
 * A coach_preference_set whose `key` is itself a DNA characteristic key is
 * applied directly (numeric value, or a label resolved via LABEL_SCORES).
 */
export const MANUAL_PREFERENCE_MAP = Object.freeze({
  riskTolerance:    { characteristic: CHARACTERISTIC.RISK_APPETITE,        values: { high: 85, medium: 50, low: 15 } },
  squadRotation:    { characteristic: CHARACTERISTIC.ROTATION_PHILOSOPHY,  values: { high: 85, moderate: 50, low: 15 } },
  trainingEmphasis: { characteristic: CHARACTERISTIC.DEVELOPMENT_EMPHASIS, values: { technical: 75, tactical: 60, physical: 45, mixed: 55 } },
})

/** Generic label → score resolution for explicit settings without a numeric value. */
export const LABEL_SCORES = Object.freeze({
  high: 85, bold: 85, attacking: 85, aggressive: 85,
  medium: 50, moderate: 50, balanced: 50, neutral: 50,
  low: 15, cautious: 15, conservative: 15, defensive: 15,
})

// ── Learning / maturation constants ──────────────────────────────────────────

/** Supporting observations needed to reach ~50% of the confidence ceiling. */
export const SATURATION_K = 10

/** Recency decay scale — confidence fades as observations accrue without
 *  reinforcing a characteristic (deterministic; measured in observation count,
 *  never wall-clock). */
export const RECENCY_SCALE = 25

/** Max supporting evidence ids retained per characteristic (most recent first). */
export const MAX_EVIDENCE = 8

/** A characteristic is considered "discovered" once it has this many supporting
 *  observations and confidence ≥ DISCOVERY_CONFIDENCE. */
export const MIN_OBSERVATIONS_FOR_SIGNAL = 3
export const DISCOVERY_CONFIDENCE        = 0.2

/** Score band thresholds. */
export const BAND_HIGH = 60
export const BAND_LOW  = 40

/** Direction thresholds for season-over-season change. */
export const TREND_DELTA = 5

/** Event types the engine reads (mirrors M19 EVENT_TYPE; duplicated to keep
 *  the DNA module free of learning-module imports). */
export const EVENT = Object.freeze({
  RECOMMENDATION_ACCEPTED: 'recommendation_accepted',
  RECOMMENDATION_REJECTED: 'recommendation_rejected',
  RECOMMENDATION_IGNORED:  'recommendation_ignored',
  PLAYER_SELECTED:         'player_selected',
  PLAYER_DESELECTED:       'player_deselected',
  TRAINING_COMPLETED:      'training_completed',
  MATCH_OUTCOME_RECORDED:  'match_outcome_recorded',
  COACH_PREFERENCE_SET:    'coach_preference_set',
})
