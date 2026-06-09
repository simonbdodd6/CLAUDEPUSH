/**
 * Player profile schema, validation, position normalization, and position profiles.
 * Every engine request involving a specific player passes through here first.
 */

// ── Position normalisation ──────────────────────────────────────────────────

const POSITION_MAP = {
  // Props
  'prop': 'prop', 'props': 'prop',
  'loosehead': 'loosehead-prop', 'loosehead prop': 'loosehead-prop',
  'tighthead': 'tighthead-prop', 'tighthead prop': 'tighthead-prop',
  '1': 'loosehead-prop', '3': 'tighthead-prop',
  // Hooker
  'hooker': 'hooker', '2': 'hooker',
  // Locks / second row
  'lock': 'lock', 'locks': 'lock',
  'second row': 'lock', '4': 'lock', '5': 'lock',
  // Flankers
  'flanker': 'flanker', 'flankers': 'flanker',
  'blindside': 'blindside-flanker', 'blindside flanker': 'blindside-flanker',
  'openside': 'openside-flanker',  'openside flanker': 'openside-flanker',
  'jackal': 'openside-flanker',
  '6': 'blindside-flanker', '7': 'openside-flanker',
  // Number 8
  'number eight': 'number-eight', 'number 8': 'number-eight',
  'no8': 'number-eight', 'no. 8': 'number-eight', '8': 'number-eight',
  // Scrum-half
  'scrum half': 'scrum-half', 'scrum-half': 'scrum-half',
  'halfback': 'scrum-half', '9': 'scrum-half',
  // Fly-half
  'fly half': 'fly-half', 'fly-half': 'fly-half',
  'out half': 'fly-half', 'outhalf': 'fly-half', 'flyhalf': 'fly-half',
  '10': 'fly-half',
  // Centres
  'centre': 'centre', 'center': 'centre',
  'inside centre': 'inside-centre', 'outside centre': 'outside-centre',
  '12': 'inside-centre', '13': 'outside-centre',
  // Wings
  'wing': 'wing', 'winger': 'wing', 'wings': 'wing',
  '11': 'wing', '14': 'wing',
  // Fullback
  'fullback': 'fullback', 'full back': 'fullback', '15': 'fullback',
};

export function normalizePosition(raw = '') {
  const key = String(raw).toLowerCase().trim();
  return POSITION_MAP[key] ?? key;
}

// ── Position profiles ───────────────────────────────────────────────────────

export const POSITION_PROFILES = {
  'prop': {
    group: 'front-row',
    physicalPriority:   ['strength', 'mass', 'power'],
    technicalSkills:    ['scrum binding and drive', 'lineout support', 'ball carry in tight', 'jackalling body position', 'maul technique'],
    strengthFocus:      ['squat', 'hip hinge (deadlift variants)', 'horizontal push/pull', 'isometric holds', 'sled push'],
    conditioningMethod: 'short intense efforts — heavy carries, sled work, repeated scrummaging sequences',
    injuryRisks:        ['shoulder (impingement, AC)', 'neck (hyperextension)', 'lower back', 'knee'],
    bodyMassNote:       'Mass is a competitive advantage — hypertrophy is a legitimate primary goal for props',
    scrumInvolvement:   'direct — binding mechanics, drive angle, footwork under load',
    lineoutRole:        'lifter or support (not jumper)',
  },
  'loosehead-prop': {
    group: 'front-row',
    physicalPriority:   ['strength', 'mass', 'power'],
    technicalSkills:    ['loosehead binding on hooker', 'left shoulder drive', 'set-piece stability under left-shoulder pressure', 'carrying on the blindside'],
    strengthFocus:      ['squat', 'hip hinge', 'horizontal push/pull', 'rotational anti-movement'],
    conditioningMethod: 'heavy carries, repeated scrummaging, sled push',
    injuryRisks:        ['left shoulder', 'neck', 'lower back'],
    bodyMassNote:       'Mass is a competitive advantage',
    scrumInvolvement:   'direct — loosehead binding and drive',
    lineoutRole:        'lifter',
  },
  'tighthead-prop': {
    group: 'front-row',
    physicalPriority:   ['strength', 'mass', 'power'],
    technicalSkills:    ['tighthead binding mechanics', 'right shoulder anchoring', 'handling opposition loosehead bind attempts', 'carrying on the tight side'],
    strengthFocus:      ['squat', 'hip hinge', 'horizontal push/pull', 'grip strength'],
    conditioningMethod: 'heavy carries, sled push, repeated scrummaging sequences',
    injuryRisks:        ['right shoulder', 'neck', 'lower back'],
    bodyMassNote:       'Tighthead is the cornerstone of the scrum — mass and stability are primary',
    scrumInvolvement:   'most contested position in the scrum',
    lineoutRole:        'lifter',
  },
  'hooker': {
    group: 'front-row',
    physicalPriority:   ['strength', 'power', 'aerobic-base'],
    technicalSkills:    ['lineout throwing accuracy', 'scrum hooking timing', 'open-field carrying', 'ruck work'],
    strengthFocus:      ['squat', 'hip hinge', 'overhead stability', 'throwing mechanics'],
    conditioningMethod: 'moderate volume, aerobic base + power, wide coverage of field',
    injuryRisks:        ['shoulder (throwing)', 'neck', 'knee'],
    bodyMassNote:       'Moderate mass — hookers need mobility for lineout throwing',
    scrumInvolvement:   'direct — strike timing and bind stability',
    lineoutRole:        'thrower — accuracy and distance variation',
  },
  'lock': {
    group: 'second-row',
    physicalPriority:   ['strength', 'power', 'height/reach'],
    technicalSkills:    ['lineout jumping and binding', 'scrum body position (binding on props)', 'carry in the tight', 'aerial contests'],
    strengthFocus:      ['squat (front squat for lineout posture)', 'hip hinge', 'pull (vertical and horizontal)', 'core anti-extension'],
    conditioningMethod: 'aerobic base, repeated high-intensity efforts, minimal sprint',
    injuryRisks:        ['shoulder (lifting/binding)', 'knee', 'lower back'],
    bodyMassNote:       'Lean mass preferred — height and reach are structural advantages',
    scrumInvolvement:   'second row — binding and driving force into props',
    lineoutRole:        'primary jumper (4 or 5 position)',
  },
  'flanker': {
    group: 'back-row',
    physicalPriority:   ['power', 'aerobic-base', 'strength'],
    technicalSkills:    ['breakdown technique (jackal, clean-out)', 'tackle technique', 'lineout support', 'defensive line speed'],
    strengthFocus:      ['hip hinge', 'squat', 'horizontal push/pull', 'carries'],
    conditioningMethod: 'high volume aerobic base, sprint conditioning, repeated high-intensity efforts',
    injuryRisks:        ['shoulder (breakdown contact)', 'knee', 'lower back'],
    bodyMassNote:       'Functional mass — lean and powerful preferred over bulk',
    scrumInvolvement:   'binding on the side of the scrum',
    lineoutRole:        'support and binding',
  },
  'blindside-flanker': {
    group: 'back-row',
    physicalPriority:   ['power', 'strength', 'aerobic-base'],
    technicalSkills:    ['dominant carrying', 'defensive anchor on blindside', 'ruck support', 'lineout support'],
    strengthFocus:      ['hip hinge', 'squat', 'carry variations', 'horizontal push'],
    conditioningMethod: 'repeat-sprint conditioning, short-power efforts, aerobic base',
    injuryRisks:        ['shoulder', 'knee', 'lower back'],
    bodyMassNote:       'Typically the bigger flanker — more carry-focused',
    scrumInvolvement:   'blindside bind, defensive role on the scrum',
    lineoutRole:        'support or lifting',
  },
  'openside-flanker': {
    group: 'back-row',
    physicalPriority:   ['aerobic-base', 'power', 'body-composition'],
    technicalSkills:    ['jackalling body position and technique', 'tackle clear-out', 'defender-side breakdown reads', 'wide defensive line'],
    strengthFocus:      ['hip hinge', 'anti-rotation core', 'horizontal pull', 'reactive speed'],
    conditioningMethod: 'high aerobic volume, repeat-sprint capacity, agility work',
    injuryRisks:        ['shoulder (jackal)', 'knee', 'lower back'],
    bodyMassNote:       'Leaner than blindside — the 7 needs mobility to compete at the breakdown',
    scrumInvolvement:   'openside bind, first to the breakdown',
    lineoutRole:        'typically first to break from the lineout',
  },
  'number-eight': {
    group: 'back-row',
    physicalPriority:   ['power', 'strength', 'aerobic-base'],
    technicalSkills:    ['picking from scrum base', 'controlling ball at back of scrum', 'carrying in open field', 'defensive cover'],
    strengthFocus:      ['squat', 'hip hinge', 'carries', 'sprint mechanics'],
    conditioningMethod: 'repeat sprint, power-endurance, aerobic base',
    injuryRisks:        ['shoulder', 'knee', 'hamstring'],
    bodyMassNote:       'The biggest back-row — mass and power combined with reach',
    scrumInvolvement:   'controls ball at scrum base, coordinates pick-and-go timing',
    lineoutRole:        'jumper (8 position) or support',
  },
  'scrum-half': {
    group: 'half-backs',
    physicalPriority:   ['agility', 'speed', 'aerobic-base'],
    technicalSkills:    ['pass (off both sides, box kick, long pass)', 'ruck clearance speed', 'defensive organisation', 'service under pressure'],
    strengthFocus:      ['rotational core', 'hip hinge', 'lower body power', 'shoulder stability'],
    conditioningMethod: 'sprint conditioning, repeated sprint, change of direction',
    injuryRisks:        ['shoulder (clearing rucks)', 'knee', 'hamstring'],
    bodyMassNote:       'Agility and power-to-weight ratio matter more than raw mass',
    scrumInvolvement:   'service from scrum base, controls timing',
    lineoutRole:        'service at lineout, runs decoy lines',
  },
  'fly-half': {
    group: 'half-backs',
    physicalPriority:   ['agility', 'aerobic-base', 'strength'],
    technicalSkills:    ['kicking (all types)', 'flat/long passing', 'defensive organisation', 'reading the defensive line', 'game management'],
    strengthFocus:      ['core stability', 'lower body power', 'shoulder stability', 'rotational strength'],
    conditioningMethod: 'aerobic base, sprint conditioning, decision-making under fatigue',
    injuryRisks:        ['hamstring', 'shoulder (tackling)', 'knee (change of direction)'],
    bodyMassNote:       'Lean, athletic build — needs to make first-up tackles',
    scrumInvolvement:   'first receiver — calls and executes play',
    lineoutRole:        'calls lineout plays, moves from lineout',
  },
  'inside-centre': {
    group: 'midfield',
    physicalPriority:   ['power', 'strength', 'aerobic-base'],
    technicalSkills:    ['dominant carry', 'strong defensive tackle technique', 'short passing game', 'crash ball'],
    strengthFocus:      ['squat', 'hip hinge', 'horizontal push/pull', 'carry strength'],
    conditioningMethod: 'power-endurance, repeat sprint, collision conditioning',
    injuryRisks:        ['shoulder (tackling)', 'knee', 'lower back'],
    bodyMassNote:       'Physical mass is an asset at 12 — absorbs contact, carries hard',
    scrumInvolvement:   'receiving attacks from fly-half, crash ball or pass',
    lineoutRole:        'receiving pod at the lineout, calls moves',
  },
  'outside-centre': {
    group: 'midfield',
    physicalPriority:   ['speed', 'agility', 'power'],
    technicalSkills:    ['wide passing game', 'defensive line reading', 'creating overlap', 'kick-chase'],
    strengthFocus:      ['lower body power', 'sprint mechanics', 'change of direction', 'core'],
    conditioningMethod: 'sprint conditioning, aerobic base, agility',
    injuryRisks:        ['hamstring', 'ankle', 'shoulder'],
    bodyMassNote:       'Balanced — pace and footwork are the primary assets at 13',
    scrumInvolvement:   'receives ball wide from 12',
    lineoutRole:        'wide pod or receiving end move',
  },
  'wing': {
    group: 'back-three',
    physicalPriority:   ['speed', 'agility', 'power'],
    technicalSkills:    ['finishing in tight and open space', 'high ball under pressure', 'kick-chase', 'counterattack from deep'],
    strengthFocus:      ['sprint mechanics', 'lower body power (single leg)', 'hip flexor strength'],
    conditioningMethod: 'sprint conditioning, acceleration, change of direction',
    injuryRisks:        ['hamstring', 'groin', 'ankle'],
    bodyMassNote:       'Lean and fast — pure acceleration is the wing\'s weapon',
    scrumInvolvement:   'receives ball wide — finishing',
    lineoutRole:        'wide ball receiver on moves',
  },
  'fullback': {
    group: 'back-three',
    physicalPriority:   ['speed', 'agility', 'aerobic-base'],
    technicalSkills:    ['catching high balls', 'counterattack decisions', 'kicking (all types)', 'last line of defence'],
    strengthFocus:      ['lower body power', 'core stability (aerial contests)', 'sprint mechanics'],
    conditioningMethod: 'aerobic base, repeated sprint, agility — covers the most ground of any back',
    injuryRisks:        ['hamstring', 'concussion (aerial contests)', 'shoulder'],
    bodyMassNote:       'Balanced — fullbacks need pace but also physicality to survive aerial contests',
    scrumInvolvement:   'typically used in attack — counterattack or support runner',
    lineoutRole:        'often used as a wide receiver on end moves',
  },
};

// Map multi-position keys to a canonical profile
const PROFILE_ALIAS = {
  'prop': 'prop',
  'loosehead-prop': 'loosehead-prop',
  'tighthead-prop': 'tighthead-prop',
  'hooker': 'hooker',
  'lock': 'lock',
  'flanker': 'flanker',
  'blindside-flanker': 'blindside-flanker',
  'openside-flanker': 'openside-flanker',
  'number-eight': 'number-eight',
  'scrum-half': 'scrum-half',
  'fly-half': 'fly-half',
  'centre': 'inside-centre',
  'inside-centre': 'inside-centre',
  'outside-centre': 'outside-centre',
  'wing': 'wing',
  'fullback': 'fullback',
};

export function getPositionProfile(normalizedPosition) {
  const key = PROFILE_ALIAS[normalizedPosition] ?? normalizedPosition;
  return POSITION_PROFILES[key] ?? POSITION_PROFILES['flanker']; // flanker = most balanced fallback
}

// ── Validation ──────────────────────────────────────────────────────────────

const REQUIRED = ['age', 'position'];
const VALID_EXPERIENCE = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];

export function validatePlayerProfile(data = {}) {
  const errors = [];
  for (const f of REQUIRED) {
    if (data[f] == null) errors.push(`player profile missing: "${f}"`);
  }
  if (data.age && (data.age < 6 || data.age > 50)) {
    errors.push('age must be between 6 and 50');
  }
  if (data.trainingDays && (data.trainingDays < 1 || data.trainingDays > 7)) {
    errors.push('trainingDays must be 1–7');
  }
  if (errors.length) throw new Error(errors.join('; '));
  return true;
}

/**
 * Normalise raw player data into a consistent profile object.
 * Input shape matches the specified engine interface.
 */
export function buildPlayerProfile(raw = {}) {
  validatePlayerProfile(raw);

  const normalizedPos = normalizePosition(raw.position);
  const positionProfile = getPositionProfile(normalizedPos);

  return {
    age:           raw.age,
    ageGroup:      deriveAgeGroup(raw.age),
    position:      normalizedPos,
    positionLabel: raw.position,
    positionGroup: positionProfile.group,
    experience:    normalizeExperience(raw.experience),
    goals:         Array.isArray(raw.goals)    ? raw.goals    : [raw.goals].filter(Boolean),
    injuries:      Array.isArray(raw.injuries) ? raw.injuries : [raw.injuries].filter(Boolean),
    trainingDays:  raw.trainingDays  || 3,
    equipment:     Array.isArray(raw.equipment) ? raw.equipment : (raw.equipment ? [raw.equipment] : ['bodyweight']),
    seasonPhase:   normalizeSeasonPhase(raw.seasonPhase),
    weight:        raw.weight || null,
    height:        raw.height || null,
    notes:         raw.notes  || null,
  };
}

function deriveAgeGroup(age) {
  if (age <= 7)  return 'U8';
  if (age <= 9)  return 'U10';
  if (age <= 11) return 'U12';
  if (age <= 13) return 'U14';
  if (age <= 15) return 'U16';
  if (age <= 17) return 'U18';
  if (age <= 19) return 'U20';
  if (age >= 35) return 'Masters';
  return 'Senior';
}

function normalizeExperience(raw = '') {
  const lower = String(raw).toLowerCase().trim();
  return VALID_EXPERIENCE.find(e => lower.includes(e)) ?? 'intermediate';
}

function normalizeSeasonPhase(raw = '') {
  const lower = String(raw).toLowerCase().trim();
  if (lower.includes('pre'))   return 'preseason';
  if (lower.includes('early')) return 'early-season';
  if (lower.includes('mid'))   return 'mid-season';
  if (lower.includes('late'))  return 'late-season';
  if (lower.includes('off'))   return 'off-season';
  return 'preseason';
}
