/**
 * AI Brain — Opponent Intelligence Engine Types (M24)
 *
 * Pure constants for the Opponent Intelligence Engine. No Brain imports, no
 * Core imports. The engine consumes historical opponent observations and builds
 * a complete, evidence-backed Opponent Profile.
 *
 * An observation is a record of one match fact:
 *   { observationId, eventType, eventData, recordedAt, matchId? }
 * eventType is one of OPP_EVENT; eventData carries the fields each engine reads.
 */

export const PROFILE_VERSION = '1.0'

/** Feature flag (absent = enabled, opt-out pattern). */
export const OPPONENT_FLAG = 'ai.opponentIntelligence'

/** Subscription tiers that unlock Opponent Intelligence. */
export const OPPONENT_TIERS = Object.freeze(new Set(['performance', 'professional', 'club', 'enterprise']))

/** Event types the engine reads (opponent match facts). */
export const OPP_EVENT = Object.freeze({
  ATTACK_SEQUENCE:    'attack_sequence',     // { phases, channel:'wide'|'narrow'|'forward', result:'try'|'turnover'|'kick'|'penalty', counterAttack, breakdownSpeed:'fast'|'slow'|'medium', territory:'own'|'mid'|'opp' }
  DEFENSIVE_SET:      'defensive_set',        // { lineSpeed:'fast'|'slow', missedTackles, turnoverWon, dominantTackle }
  SCRUM_EVENT:        'scrum_event',          // { outcome:'won'|'lost'|'penalty_won'|'penalty_conceded'|'free_kick', onOwnFeed }
  LINEOUT_EVENT:      'lineout_event',        // { outcome:'won'|'lost'|'stolen'|'maul_try', onOwnThrow }
  RESTART_EVENT:      'restart_event',        // { type:'kickoff'|'dropout', retained, contested }
  KICK_EVENT:         'kick_event',           // { type:'box'|'contestable'|'territorial'|'clearance'|'cross', reclaimed }
  PENALTY_EVENT:      'penalty_event',        // { reason, area:'own22'|'own_half'|'opp_half'|'opp22', half:1|2, minute, card:'yellow'|'red'|null }
  SUBSTITUTION_EVENT: 'substitution_event',   // { minute, unit:'front_row'|'back_row'|'half_back'|'back', impact:'positive'|'neutral'|'negative' }
  MATCH_SEGMENT:      'match_segment',        // { segment:'first20'|'mid'|'last20', pointsFor, pointsAgainst }
  TRY_EVENT:          'try_event',            // { for:boolean, source, phase }
})

/** The fourteen opponent dimensions. */
export const DIMENSION = Object.freeze({
  ATTACK_TENDENCIES:       'attackTendencies',
  DEFENSIVE_TENDENCIES:    'defensiveTendencies',
  SCRUM_PROFILE:           'scrumProfile',
  LINEOUT_PROFILE:         'lineoutProfile',
  KICK_PROFILE:            'kickProfile',
  RESTART_PROFILE:         'restartProfile',
  DISCIPLINE_PROFILE:      'disciplineProfile',
  SUBSTITUTION_BEHAVIOUR:  'substitutionBehaviour',
  FITNESS_TRENDS:          'fitnessTrends',
  LATE_GAME_BEHAVIOUR:     'lateGameBehaviour',
  TERRITORY_PREFERENCE:    'territoryPreference',
  PHASE_COUNT:             'phaseCount',
  BREAKDOWN_SPEED:         'breakdownSpeed',
  COUNTERATTACK_FREQUENCY: 'counterattackFrequency',
})

export const DIMENSION_KEYS = Object.freeze(Object.values(DIMENSION))

/**
 * Per-dimension metadata.
 *   higherIsBetter: true  → a high score means the opponent is stronger / more
 *                           threatening in that area.
 *   descriptive: true     → a style dimension (not a strength or weakness).
 *   counter / exploit     → recommendation text used by recommendation-builder.
 */
export const DIMENSION_META = Object.freeze({
  [DIMENSION.ATTACK_TENDENCIES]:      { label: 'Attack tendencies',     higherIsBetter: true,  descriptive: false, counter: 'Compress the wide channels and slow their ruck ball', exploit: 'Their attack is blunt — hold shape and force them to play through hands' },
  [DIMENSION.DEFENSIVE_TENDENCIES]:   { label: 'Defensive tendencies',  higherIsBetter: true,  descriptive: false, counter: 'Attack the edges with width and tempo before their line sets', exploit: 'Their defence leaks — target mismatches and second-phase wide' },
  [DIMENSION.SCRUM_PROFILE]:          { label: 'Scrum profile',         higherIsBetter: true,  descriptive: false, counter: 'Keep scrum count low; use quick taps and avoid scrum resets', exploit: 'Pressure their scrum — pick scrums in their 22 and seek penalties' },
  [DIMENSION.LINEOUT_PROFILE]:        { label: 'Lineout profile',       higherIsBetter: true,  descriptive: false, counter: 'Avoid kickable touch; compete only on safe lineouts', exploit: 'Contest their throw — they are vulnerable, set up maul defence early' },
  [DIMENSION.KICK_PROFILE]:           { label: 'Kicking game',          higherIsBetter: true,  descriptive: false, counter: 'Drop a winger early and set a back-field triangle for box kicks', exploit: 'Their kicking is ineffective — counter-attack from deep' },
  [DIMENSION.RESTART_PROFILE]:        { label: 'Restart profile',       higherIsBetter: true,  descriptive: false, counter: 'Vary restart length; they retain well — go long and chase hard', exploit: 'Contest restarts aggressively — they lose their own ball' },
  [DIMENSION.DISCIPLINE_PROFILE]:     { label: 'Discipline',            higherIsBetter: true,  descriptive: false, counter: 'Hold discipline; they rarely give cheap penalties', exploit: 'Play in their half — penalty-prone, kick the points and build scoreboard pressure' },
  [DIMENSION.SUBSTITUTION_BEHAVIOUR]: { label: 'Substitution behaviour', higherIsBetter: true, descriptive: false, counter: 'Match their bench impact; do not let the game open up late', exploit: 'Their bench adds little — push the tempo when their starters tire' },
  [DIMENSION.FITNESS_TRENDS]:         { label: 'Fitness trends',        higherIsBetter: true,  descriptive: false, counter: 'They finish strong — keep the game tight into the last 20', exploit: 'They fade late — raise tempo after 60 minutes and chase the game' },
  [DIMENSION.LATE_GAME_BEHAVIOUR]:    { label: 'Late-game behaviour',   higherIsBetter: true,  descriptive: false, counter: 'They close games out — protect leads, avoid late risks', exploit: 'They concede late — back yourselves in a tight finish' },
  [DIMENSION.TERRITORY_PREFERENCE]:   { label: 'Territory preference',  higherIsBetter: true,  descriptive: true,  counter: 'Match their territorial game; win the aerial battle', exploit: '' },
  [DIMENSION.PHASE_COUNT]:            { label: 'Phase count',           higherIsBetter: true,  descriptive: true,  counter: 'Stay patient in defence; they build through many phases', exploit: '' },
  [DIMENSION.BREAKDOWN_SPEED]:        { label: 'Breakdown speed',       higherIsBetter: true,  descriptive: false, counter: 'Commit to the jackal early to slow their ruck ball', exploit: 'Their ruck is slow — fan the defence and jackal aggressively' },
  [DIMENSION.COUNTERATTACK_FREQUENCY]:{ label: 'Counter-attack threat', higherIsBetter: true,  descriptive: false, counter: 'Kick with a chase and contest; avoid loose, unchased kicks', exploit: 'They rarely counter — territorial kicking is low risk' },
})

// ── Scoring / confidence constants ───────────────────────────────────────────

export const SATURATION_K  = 6     // events-per-dimension to reach ~50% confidence
export const RECENCY_SCALE  = 30    // confidence decay scale (in observation count)
export const MAX_EVIDENCE   = 8

export const STRONG_THRESHOLD = 65  // score ≥ → a strength
export const WEAK_THRESHOLD    = 40  // score ≤ → a weakness
export const MIN_CONFIDENCE     = 0.2 // below this a dimension is "emerging", not actioned
export const TREND_THRESHOLD    = 0.1 // rate-of-change for rising/falling

export const SEVERITY = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' })
