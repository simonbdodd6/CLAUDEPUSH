/**
 * AI Brain — Autonomous Training Designer Types + Drill Library (M25)
 *
 * Pure constants and the deterministic drill catalogue. No Brain imports, no
 * Core imports. The designer consumes upstream engine outputs (Coach DNA,
 * Weekly Brief, Match Readiness, Opponent Intelligence, squad/welfare/load)
 * passed in as a context, and outputs complete rugby training sessions.
 *
 * No randomness anywhere — drill selection is a deterministic scoring + tie-break.
 */

export const DESIGNER_VERSION = '1.0'
export const DESIGNER_FLAG    = 'ai.trainingDesigner'
export const DESIGNER_TIERS   = Object.freeze(new Set(['performance', 'professional', 'club', 'enterprise']))

// ── tiny shared helpers ──────────────────────────────────────────────────────
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
export const round = (n) => Math.round(n)
export const round2 = (n) => Math.round(n * 100) / 100
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

// ── age grades / formats ─────────────────────────────────────────────────────

export const GRADE_ORDER = Object.freeze(['u8', 'u10', 'u12', 'u14', 'u16', 'u18', 'academy', 'senior', 'professional'])

/** Contact level, complexity cap, intensity cap, default + max duration per grade. */
export const GRADE_META = Object.freeze({
  u8:           { contact: 'none',  complexityCap: 2, intensityCap: 3, defaultDuration: 50, durationCap: 60 },
  u10:          { contact: 'none',  complexityCap: 2, intensityCap: 3, defaultDuration: 60, durationCap: 60 },
  u12:          { contact: 'none',  complexityCap: 3, intensityCap: 3, defaultDuration: 60, durationCap: 75 },
  u14:          { contact: 'light', complexityCap: 3, intensityCap: 4, defaultDuration: 70, durationCap: 80 },
  u16:          { contact: 'full',  complexityCap: 4, intensityCap: 4, defaultDuration: 80, durationCap: 90 },
  u18:          { contact: 'full',  complexityCap: 4, intensityCap: 5, defaultDuration: 85, durationCap: 90 },
  academy:      { contact: 'full',  complexityCap: 5, intensityCap: 5, defaultDuration: 90, durationCap: 100 },
  senior:       { contact: 'full',  complexityCap: 5, intensityCap: 5, defaultDuration: 90, durationCap: 110 },
  professional: { contact: 'full',  complexityCap: 5, intensityCap: 5, defaultDuration: 100, durationCap: 120 },
})

export const CONTACT_RANK = Object.freeze({ none: 0, light: 1, full: 2 })

export const FORMAT = Object.freeze({ FIFTEENS: 'fifteens', TENS: 'tens', SEVENS: 'sevens' })
export const FORMAT_META = Object.freeze({
  fifteens: { setPieceMul: 1.0, conditioningMul: 1.0, minPlayersForLiveSetPiece: 16 },
  tens:     { setPieceMul: 0.8, conditioningMul: 1.1, minPlayersForLiveSetPiece: 12 },
  sevens:   { setPieceMul: 0.5, conditioningMul: 1.3, minPlayersForLiveSetPiece: 10 },
})

export const SEASON_PHASE = Object.freeze({ PRESEASON: 'preseason', EARLY: 'early', MID: 'mid', LATE: 'late', PLAYOFFS: 'playoffs' })
export const MATCH_IMPORTANCE = Object.freeze({ LOW: 'low', NORMAL: 'normal', HIGH: 'high', CUP_FINAL: 'cup_final' })

export const SPACE_RANK = Object.freeze({ small: 0, medium: 1, large: 2, full: 3 })
export const BAD_WEATHER = Object.freeze(new Set(['windy', 'storm']))

export const WELFARE_IMPACT = Object.freeze({ LOW: 'low', MODERATE: 'moderate', HIGH: 'high' })

// ── session phases ───────────────────────────────────────────────────────────

export const PHASE = Object.freeze({
  WARM_UP:      'warmUp',
  SKILL:        'skillBlocks',
  DECISION:     'decisionGames',
  CONTACT:      'contact',
  SET_PIECE:    'setPiece',
  CONDITIONED:  'conditionedGames',
  CONDITIONING: 'conditioning',
  REVIEW:       'review',
})

export const PHASE_ORDER = Object.freeze([
  PHASE.WARM_UP, PHASE.SKILL, PHASE.DECISION, PHASE.CONTACT,
  PHASE.SET_PIECE, PHASE.CONDITIONED, PHASE.CONDITIONING, PHASE.REVIEW,
])

export const PHASE_META = Object.freeze({
  [PHASE.WARM_UP]:      { label: 'Warm-up',         categories: ['warmup'],      basePct: 0.12, minDrills: 1, maxDrills: 2 },
  [PHASE.SKILL]:        { label: 'Skill blocks',    categories: ['skill'],       basePct: 0.20, minDrills: 2, maxDrills: 3 },
  [PHASE.DECISION]:     { label: 'Decision games',  categories: ['decision'],    basePct: 0.12, minDrills: 1, maxDrills: 2 },
  [PHASE.CONTACT]:      { label: 'Contact block',   categories: ['contact'],     basePct: 0.12, minDrills: 1, maxDrills: 2 },
  [PHASE.SET_PIECE]:    { label: 'Set piece',       categories: ['setpiece'],    basePct: 0.14, minDrills: 1, maxDrills: 2 },
  [PHASE.CONDITIONED]:  { label: 'Conditioned games', categories: ['conditioned'], basePct: 0.16, minDrills: 1, maxDrills: 2 },
  [PHASE.CONDITIONING]: { label: 'Conditioning',    categories: ['conditioning'], basePct: 0.08, minDrills: 1, maxDrills: 1 },
  [PHASE.REVIEW]:       { label: 'Review',          categories: [],              basePct: 0.06, minDrills: 0, maxDrills: 0 },
})

// ── skill tags ───────────────────────────────────────────────────────────────

export const TAG = Object.freeze({
  HANDLING: 'handling', KICKING: 'kicking', BREAKDOWN: 'breakdown', DEFENCE: 'defence',
  ATTACK_SHAPE: 'attackShape', LINEOUT: 'lineout', SCRUM: 'scrum', RESTART: 'restart',
  DECISION: 'decision', FITNESS: 'fitness', CONTACT_SKILL: 'contactSkill',
  COUNTER_ATTACK: 'counterAttack', DISCIPLINE: 'discipline',
})

// ── drill library (deterministic catalogue) ──────────────────────────────────

const drill = (id, name, category, tags, o = {}) => ({
  id, name, category, tags,
  baseDuration: o.d ?? 10,
  intensity: o.i ?? 3,
  contact: o.c ?? 'none',
  minPlayers: o.min ?? 6,
  maxPlayers: o.max ?? 60,
  space: o.sp ?? 'medium',
  equipment: o.eq ?? ['balls', 'cones'],
  decisionComplexity: o.dc ?? 2,
  weatherSensitive: o.w ?? false,
  minGrade: o.g ?? 'u8',
  purpose: o.p ?? '',
  coachingFocus: o.cf ?? '',
  learningObjective: o.lo ?? '',
})

const T = TAG
export const DRILL_LIBRARY = Object.freeze([
  // Warm-up
  drill('dynamic-warmup', 'Dynamic movement prep', 'warmup', [T.FITNESS], { d: 8, i: 2, sp: 'medium', eq: ['cones'], dc: 1, p: 'Raise temperature and prepare joints/muscles', cf: 'Movement quality, gradual intensity', lo: 'Prepare body safely for training' }),
  drill('ball-handling-grid', 'Ball-handling grid', 'warmup', [T.HANDLING], { d: 8, i: 2, sp: 'medium', dc: 2, p: 'Warm hands and groove catch-pass', cf: 'Early ball, hands up', lo: 'Reinforce core handling' }),
  drill('rugby-netball', 'Rugby-netball decision warm-up', 'warmup', [T.HANDLING, T.DECISION], { d: 9, i: 3, sp: 'medium', dc: 3, p: 'Warm up with heads-up decisions', cf: 'Scan, support lines', lo: 'Decision-making under light fatigue' }),

  // Skill
  drill('passing-channels', 'Passing channels', 'skill', [T.HANDLING], { d: 10, i: 2, sp: 'medium', dc: 2, p: 'Groove accurate catch-pass at pace', cf: 'Pass in front, follow through', lo: 'Catch-pass accuracy under tempo' }),
  drill('2v1-draw-pass', '2v1 draw-and-pass', 'skill', [T.HANDLING, T.DECISION, T.ATTACK_SHAPE], { d: 12, i: 3, sp: 'medium', dc: 3, p: 'Beat a defender and finish the overlap', cf: 'Fix the defender, late pass', lo: 'Draw-and-pass decision' }),
  drill('catch-pass-pressure', 'Catch-pass under pressure', 'skill', [T.HANDLING], { d: 10, i: 3, sp: 'medium', dc: 3, p: 'Execute handling with a chasing defender', cf: 'Soft hands, early catch', lo: 'Skill execution under pressure' }),
  drill('kicking-tees', 'Kicking accuracy stations', 'skill', [T.KICKING], { d: 12, i: 2, sp: 'large', eq: ['balls', 'kicking tees', 'cones'], dc: 3, w: true, g: 'u12', p: 'Develop territorial and goal kicking', cf: 'Plant, contact point, follow-through', lo: 'Kicking accuracy' }),
  drill('high-ball-contest', 'High-ball reclaim', 'skill', [T.KICKING, T.COUNTER_ATTACK], { d: 10, i: 3, sp: 'large', dc: 3, w: true, g: 'u14', p: 'Win the aerial battle', cf: 'Timing, call, safe catch', lo: 'Aerial skills and chase' }),
  drill('offload-game', 'Offload skill game', 'skill', [T.HANDLING, T.CONTACT_SKILL], { d: 10, i: 3, c: 'light', sp: 'medium', dc: 3, g: 'u14', p: 'Keep the ball alive through contact', cf: 'Strong leg drive, late offload', lo: 'Offloading in contact' }),
  drill('tackle-technique', 'Tackle technique ladder', 'skill', [T.DEFENCE, T.CONTACT_SKILL], { d: 12, i: 3, c: 'light', sp: 'small', eq: ['tackle bags', 'shields'], dc: 2, g: 'u14', p: 'Safe, dominant tackle technique', cf: 'Cheek-to-cheek, leg drive', lo: 'Tackle technique and safety' }),
  drill('breakdown-technique', 'Breakdown technique', 'skill', [T.BREAKDOWN, T.CONTACT_SKILL], { d: 10, i: 3, c: 'light', sp: 'small', eq: ['ruck pads', 'shields'], dc: 3, g: 'u16', p: 'Win the race to the ball', cf: 'Low body height, leg drive', lo: 'Ruck arrival and clearout' }),

  // Decision games
  drill('3v2-continuous', '3v2 continuous', 'decision', [T.DECISION, T.ATTACK_SHAPE, T.HANDLING], { d: 10, i: 4, sp: 'medium', dc: 4, g: 'u12', p: 'Read and exploit numerical advantage', cf: 'Scan early, attack space', lo: 'Decision-making with overlap' }),
  drill('touch-with-rules', 'Conditioned touch', 'decision', [T.DECISION, T.ATTACK_SHAPE, T.FITNESS], { d: 12, i: 4, sp: 'large', dc: 4, p: 'Heads-up attack within rules', cf: 'Width, support, tempo', lo: 'Attacking decisions under fatigue' }),
  drill('heads-up-2v2', '2v2 evasion', 'decision', [T.DECISION, T.COUNTER_ATTACK], { d: 9, i: 4, sp: 'small', dc: 3, g: 'u8', p: 'Beat defenders in small spaces', cf: 'Footwork, support depth', lo: 'Evasion and support decisions' }),

  // Contact
  drill('tackle-progression', 'Live tackle progression', 'contact', [T.DEFENCE, T.CONTACT_SKILL], { d: 12, i: 4, c: 'full', sp: 'small', eq: ['shields'], dc: 3, g: 'u16', p: 'Dominant, safe tackle in live reps', cf: 'Footwork pre-contact, drive', lo: 'Live tackle execution' }),
  drill('breakdown-clearout', 'Breakdown clearout', 'contact', [T.BREAKDOWN, T.CONTACT_SKILL], { d: 12, i: 4, c: 'full', sp: 'small', eq: ['ruck pads'], dc: 3, g: 'u16', p: 'Secure and speed up ruck ball', cf: 'Low, square, leg drive', lo: 'Clearout under contact' }),
  drill('maul-build', 'Maul build & defend', 'contact', [T.LINEOUT, T.CONTACT_SKILL], { d: 12, i: 4, c: 'full', sp: 'small', min: 12, eq: ['lineout pads'], dc: 3, g: 'u18', p: 'Build and stop the driving maul', cf: 'Bind, transfer, drive', lo: 'Maul attack and defence' }),

  // Set piece
  drill('lineout-throwing', 'Lineout throwing & timing', 'setpiece', [T.LINEOUT], { d: 12, i: 2, sp: 'medium', min: 6, eq: ['balls', 'lineout pads'], dc: 3, w: true, g: 'u16', p: 'Accurate throw and jump timing', cf: 'Straight throw, call timing', lo: 'Lineout execution' }),
  drill('lineout-pods', 'Lineout lifting pods', 'setpiece', [T.LINEOUT], { d: 10, i: 3, c: 'light', sp: 'small', min: 7, eq: ['lineout pads'], dc: 3, g: 'u16', p: 'Secure lifting and pod timing', cf: 'Dip-drive lift, safe receipt', lo: 'Lineout lifting' }),
  drill('scrum-machine', 'Scrum machine technique', 'setpiece', [T.SCRUM], { d: 12, i: 4, c: 'full', sp: 'small', min: 8, eq: ['scrum machine'], dc: 2, g: 'u18', p: 'Stable, square scrum technique', cf: 'Body height, bind, timing', lo: 'Scrum technique' }),
  drill('scrum-live', 'Live scrum', 'setpiece', [T.SCRUM], { d: 12, i: 5, c: 'full', sp: 'small', min: 16, eq: ['balls'], dc: 3, g: 'academy', p: 'Contest live scrum', cf: 'Hit, bind, drive on call', lo: 'Live scrum contest' }),
  drill('restart-receipt', 'Restart receipt & contest', 'setpiece', [T.RESTART], { d: 10, i: 3, sp: 'large', dc: 3, w: true, g: 'u14', p: 'Secure and contest restarts', cf: 'Pod call, chase line', lo: 'Restart execution' }),

  // Conditioned games
  drill('conditioned-wide', 'Wide-attack conditioned game', 'conditioned', [T.ATTACK_SHAPE, T.HANDLING, T.DECISION], { d: 14, i: 4, sp: 'large', dc: 3, g: 'u10', p: 'Attack and finish in the wide channels', cf: 'Width, tempo, finish', lo: 'Wide-attack application' }),
  drill('conditioned-kick-chase', 'Kick-chase game', 'conditioned', [T.KICKING, T.COUNTER_ATTACK, T.DECISION], { d: 14, i: 4, sp: 'full', dc: 4, w: true, g: 'u14', p: 'Win territory and the kick-chase', cf: 'Kick selection, chase shape', lo: 'Kicking game application' }),
  drill('defensive-system-game', 'Defensive system game', 'conditioned', [T.DEFENCE, T.DECISION], { d: 14, i: 4, c: 'light', sp: 'full', dc: 4, g: 'u14', p: 'Hold line speed and shape under pressure', cf: 'Connection, line speed, talk', lo: 'Defensive system application' }),
  drill('opposed-phase-play', 'Opposed phase play', 'conditioned', [T.ATTACK_SHAPE, T.BREAKDOWN, T.DECISION], { d: 15, i: 5, c: 'full', sp: 'full', min: 16, dc: 5, g: 'academy', p: 'Apply attack/defence in match context', cf: 'Accuracy at speed, ruck speed', lo: 'Game-context application' }),

  // Conditioning
  drill('repeat-sprints', 'Repeat sprint conditioning', 'conditioning', [T.FITNESS], { d: 8, i: 5, sp: 'large', eq: ['cones', 'GPS'], dc: 1, g: 'u14', p: 'Develop repeat speed and recovery', cf: 'Max effort, full recovery', lo: 'Repeat-sprint capacity' }),
  drill('game-based-fitness', 'Game-based fitness', 'conditioning', [T.FITNESS, T.DECISION], { d: 10, i: 4, sp: 'full', dc: 3, p: 'Build fitness with ball in hand', cf: 'Work-rate, tempo', lo: 'Game-specific conditioning' }),
  drill('bronco', 'Bronco fitness test', 'conditioning', [T.FITNESS], { d: 8, i: 5, sp: 'large', eq: ['cones', 'GPS'], dc: 1, g: 'u16', p: 'Benchmark and build aerobic capacity', cf: 'Pacing, honesty', lo: 'Aerobic conditioning' }),
])

export const DRILL_BY_ID = Object.freeze(Object.fromEntries(DRILL_LIBRARY.map(d => [d.id, d])))
