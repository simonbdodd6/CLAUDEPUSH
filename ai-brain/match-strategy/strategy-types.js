/**
 * AI Brain — Autonomous Match Strategy Engine Types (M26)
 *
 * Pure constants for the Match Strategy Engine. No Brain imports, no Core
 * imports. The engine synthesises upstream products (Coach DNA, Opponent
 * Intelligence, Selection Assistant, Match Readiness, Training Designer, Weekly
 * Brief, Availability) into a complete, deterministic, evidence-backed match plan.
 *
 * No randomness anywhere.
 */

export const STRATEGY_VERSION = '1.0'
export const STRATEGY_FLAG    = 'ai.matchStrategy'
export const STRATEGY_TIERS   = Object.freeze(new Set(['performance', 'professional', 'club', 'enterprise']))

// ── tiny shared helpers ──────────────────────────────────────────────────────
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
export const round = (n) => Math.round(n)
export const round2 = (n) => Math.round(n * 100) / 100
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

// ── grades / formats ─────────────────────────────────────────────────────────

export const GRADE = Object.freeze({ YOUTH: 'youth', SENIOR: 'senior', PROFESSIONAL: 'professional' })
export const GRADE_META = Object.freeze({
  youth:        { complexityCap: 2, allowAggressiveRisk: false, benchSize: 5,  half: 30 },
  senior:       { complexityCap: 4, allowAggressiveRisk: true,  benchSize: 8,  half: 40 },
  professional: { complexityCap: 5, allowAggressiveRisk: true,  benchSize: 8,  half: 40 },
})

export const FORMAT = Object.freeze({ FIFTEENS: 'fifteens', SEVENS: 'sevens' })
export const FORMAT_META = Object.freeze({
  fifteens: { players: 15, scrumPlayers: 8, lineoutPlayers: 7, half: 40, benchSize: 8, setPieceWeight: 1.0 },
  sevens:   { players: 7,  scrumPlayers: 3, lineoutPlayers: 2, half: 7,  benchSize: 5, setPieceWeight: 0.4 },
})

// ── game model ───────────────────────────────────────────────────────────────

/** Strategic posture derived from relative strength (us vs opponent). */
export const POSTURE = Object.freeze({
  FAVOURITE: 'favourite',   // we are stronger — control and convert
  EVEN:      'even',         // tight game — win the margins
  UNDERDOG:  'underdog',     // they are stronger — disrupt and stay in the fight
})

/** Game phases for momentum / pressure planning. */
export const GAME_PHASE = Object.freeze({
  OPENING:    'opening',      // 0–20'
  FIRST_END:  'first_end',    // 20–40'
  SECOND_OPEN:'second_open',  // 40–60'
  CLOSING:    'closing',      // 60–80'
})

export const INTENT = Object.freeze({
  BALL_IN_HAND: 'ball_in_hand',
  TERRITORIAL:  'territorial',
  CONTROL:      'control',
  HIGH_TEMPO:   'high_tempo',
  STRUCTURED:   'structured',
})

export const RISK_LEVEL = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' })
export const SEVERITY   = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' })

// ── weather / referee ────────────────────────────────────────────────────────

export const WEATHER = Object.freeze({ DRY: 'dry', WET: 'wet', WINDY: 'windy', COLD: 'cold', HOT: 'hot' })
export const REFEREE_TENDENCY = Object.freeze({
  STRICT_BREAKDOWN: 'strict_breakdown',
  STRICT_SCRUM:     'strict_scrum',
  LETS_PLAY:        'lets_play',
  STRICT_OFFSIDE:   'strict_offside',
})

// ── plan field keys (for defensive iteration) ────────────────────────────────

export const PLAN_FIELD = Object.freeze({
  ATTACK: 'attackStrategy',
  DEFENCE: 'defensiveStrategy',
  KICK: 'kickStrategy',
  TERRITORY: 'territoryPlan',
  KICKOFF: 'kickoffPlan',
  RESTART: 'restartPlan',
  SCRUM: 'scrumStrategy',
  LINEOUT: 'lineoutStrategy',
  BENCH: 'benchPlan',
  REPLACEMENTS: 'replacementTiming',
  PRESSURE_ZONES: 'pressureZones',
  MOMENTUM: 'momentumTriggers',
  RISKS: 'riskWarnings',
  WEATHER: 'weatherAdjustments',
  REFEREE: 'refereeAdjustments',
})

// ── tunable thresholds ───────────────────────────────────────────────────────

export const POSTURE_MARGIN = 8        // strength-index gap to be favourite/underdog
export const STRONG_DIM      = 65       // opponent dimension score considered "strong"
export const WEAK_DIM        = 40       // opponent dimension score considered "weak"
export const MAX_EVIDENCE    = 8
