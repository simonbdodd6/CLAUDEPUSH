/**
 * Maps player goals and context into structured training objectives.
 * Objectives drive prompt construction, exercise selection, and output validation.
 */

// ── Goal → objective mapping ─────────────────────────────────────────────────

export const GOAL_OBJECTIVES = {
  'strength': {
    category:      'neuromuscular',
    subcategory:   'maximal-strength',
    priority:      'primary',
    repRange:      '3–6',
    sets:          '4–6',
    restMinutes:   3,
    primaryMovements: ['squat', 'deadlift', 'bench press', 'row', 'overhead press'],
    adaptation:    'neural efficiency and cross-sectional muscle area',
    weeklyFreq:    2,
    volumeLandmark: 'lower volume, higher intensity (80–95% 1RM)',
  },
  'mass': {
    category:      'neuromuscular',
    subcategory:   'hypertrophy',
    priority:      'primary',
    repRange:      '8–15',
    sets:          '3–5',
    restMinutes:   2,
    primaryMovements: ['compound lifts', 'isolation exercises', 'machine work'],
    adaptation:    'muscle cross-sectional area and fibre recruitment',
    weeklyFreq:    3,
    volumeLandmark: 'higher volume, moderate intensity (65–80% 1RM)',
  },
  'power': {
    category:      'neuromuscular',
    subcategory:   'rate-of-force-development',
    priority:      'primary',
    repRange:      '3–5',
    sets:          '4–6',
    restMinutes:   3,
    primaryMovements: ['hang clean', 'trap bar jump', 'medicine ball throws', 'plyometrics', 'contrast training'],
    adaptation:    'rate of force development and neural drive',
    weeklyFreq:    2,
    volumeLandmark: 'low volume, maximal intent (40–70% 1RM, explosive)',
  },
  'speed': {
    category:      'biomotor',
    subcategory:   'maximal-velocity',
    priority:      'primary',
    repRange:      '3–6 × 20–60m',
    sets:          '6–10',
    restMinutes:   4,
    primaryMovements: ['sprint mechanics', 'flying 20s', 'resisted sprint', 'wicket drills'],
    adaptation:    'stride frequency, stride length, maximal velocity mechanics',
    weeklyFreq:    2,
    volumeLandmark: 'sprint work when fully recovered — quality over quantity',
  },
  'agility': {
    category:      'biomotor',
    subcategory:   'reactive-agility',
    priority:      'secondary',
    repRange:      '5–10 repetitions',
    sets:          '3–4',
    restMinutes:   2,
    primaryMovements: ['ladder drills', 'cone drills', 'reactive drills with visual cues', 'small-sided games'],
    adaptation:    'change-of-direction speed and reactive decision speed',
    weeklyFreq:    2,
    volumeLandmark: 'integrated with skill work where possible',
  },
  'fitness': {
    category:      'energy-system',
    subcategory:   'aerobic-base',
    priority:      'primary',
    repRange:      'continuous or interval',
    sets:          'varies',
    restMinutes:   1,
    primaryMovements: ['tempo runs', 'interval running', 'aerobic circuits', 'small-sided games'],
    adaptation:    'aerobic capacity and repeat-sprint ability',
    weeklyFreq:    3,
    volumeLandmark: 'zone 2 base work + high-intensity intervals',
  },
  'endurance': {
    category:      'energy-system',
    subcategory:   'aerobic-base',
    priority:      'primary',
    repRange:      'continuous',
    sets:          '1–3',
    restMinutes:   1,
    primaryMovements: ['tempo runs', 'aerobic circuits', 'long slow distance work'],
    adaptation:    'aerobic capacity and lactate threshold',
    weeklyFreq:    3,
    volumeLandmark: 'zone 2 base work (60–70% HRmax)',
  },
  'scrummaging power': {
    category:      'position-specific',
    subcategory:   'scrum-strength',
    priority:      'primary',
    repRange:      'varies — isometric and dynamic',
    sets:          '3–5',
    restMinutes:   3,
    primaryMovements: ['belt squat or box squat', 'sled push (horizontal)', 'isometric scrum holds against wall', 'hip extension loading', 'glute-ham raises'],
    adaptation:    'horizontal force production, binding strength, hip extension power',
    weeklyFreq:    2,
    volumeLandmark: 'integrate with scrum technical work on the field',
  },
  'breakdown': {
    category:      'position-specific',
    subcategory:   'breakdown-conditioning',
    priority:      'secondary',
    repRange:      'circuit-based',
    sets:          '3–4',
    restMinutes:   1.5,
    primaryMovements: ['low body position holds', 'body-weight isometric jackalling holds', 'ruck pad sequences', 'acceleration from ground'],
    adaptation:    'breakdown body position strength and explosive reloading',
    weeklyFreq:    2,
    volumeLandmark: 'integrated with skill sessions',
  },
  'tackling': {
    category:      'position-specific',
    subcategory:   'contact-conditioning',
    priority:      'primary',
    repRange:      'drill-based',
    sets:          '4–6',
    restMinutes:   2,
    primaryMovements: ['hip drive and leg drive from tackle pad', 'chop tackle technique', 'body position drills', 'contact conditioning'],
    adaptation:    'tackle technique, body position under fatigue, contact aggression',
    weeklyFreq:    2,
    volumeLandmark: 'contact work to be managed within overall contact load',
  },
  'recovery': {
    category:      'regeneration',
    subcategory:   'active-recovery',
    priority:      'primary',
    repRange:      'low intensity',
    sets:          '1–2',
    restMinutes:   0,
    primaryMovements: ['yoga', 'swimming', 'light cycling', 'mobility circuits', 'foam rolling'],
    adaptation:    'systemic recovery, parasympathetic nervous system activation',
    weeklyFreq:    2,
    volumeLandmark: 'keep heart rate below 130bpm',
  },
  'mobility': {
    category:      'structural',
    subcategory:   'range-of-motion',
    priority:      'secondary',
    repRange:      '30–90s holds, 5–10 reps dynamic',
    sets:          '2–3',
    restMinutes:   0,
    primaryMovements: ['hip flexor stretch', 'thoracic rotation', 'ankle mobility', 'shoulder external rotation', 'hip 90/90'],
    adaptation:    'joint range, tissue quality, injury prevention',
    weeklyFreq:    3,
    volumeLandmark: 'daily 10-minute routine preferred over once-weekly session',
  },
};

// ── Season phase profiles ───────────────────────────────────────────────────

export const SEASON_PHASES = {
  'preseason': {
    label:           'Pre-season',
    primaryFocus:    'foundational fitness, volume, structural balance',
    trainingBias:    'high volume, progressive intensity',
    matchFrequency:  'low or nil',
    recommendedWeeks: 8,
    strengthPhase:   'hypertrophy → strength',
    conditioningPhase: 'aerobic base → threshold',
    contactLoad:     'graduated — introduce in weeks 3–4',
    keyNote:         'Build the engine before trying to tune it. Focus on work capacity and structural robustness.',
  },
  'early-season': {
    label:           'Early season',
    primaryFocus:    'converting fitness to rugby fitness, skill integration',
    trainingBias:    'moderate volume, increasing specificity',
    matchFrequency:  '1 per week',
    recommendedWeeks: 4,
    strengthPhase:   'strength → power',
    conditioningPhase: 'threshold → repeat-sprint',
    contactLoad:     'full — match intensity now included',
    keyNote:         'Bridge from preseason to competition. Start sharpening speed and power.',
  },
  'mid-season': {
    label:           'Mid-season (competition)',
    primaryFocus:    'maintaining condition, weekly performance',
    trainingBias:    'reduced volume, high intensity',
    matchFrequency:  '1 per week',
    recommendedWeeks: 12,
    strengthPhase:   'strength maintenance',
    conditioningPhase: 'repeat-sprint maintenance, quality over quantity',
    contactLoad:     'managed — monitor cumulative contact load',
    keyNote:         'Protect and perform. Every training decision is about Sunday or Saturday.',
  },
  'late-season': {
    label:           'Late season / playoffs',
    primaryFocus:    'peak performance, fatigue management',
    trainingBias:    'low volume, high quality, high intensity',
    matchFrequency:  '1 per week (or more in cup)',
    recommendedWeeks: 4,
    strengthPhase:   'power maintenance',
    conditioningPhase: 'speed and sharpness — taper into key matches',
    contactLoad:     'reduced — protect players for match day',
    keyNote:         'Less is more. Freshness beats fitness at this point. Trust the work done.',
  },
  'off-season': {
    label:           'Off-season',
    primaryFocus:    'recovery, structural balance, address injury risk areas',
    trainingBias:    'low overall load, targeted rehabilitation and development',
    matchFrequency:  'nil',
    recommendedWeeks: 6,
    strengthPhase:   'GPP and structural balance',
    conditioningPhase: 'aerobic base, low-intensity movement',
    contactLoad:     'nil — full rest from contact',
    keyNote:         'Repair and rebuild. Address asymmetries and weaknesses found during season.',
  },
};

// ── Equipment profiles ──────────────────────────────────────────────────────

export const EQUIPMENT_PROFILES = {
  'bodyweight': {
    label:       'Bodyweight / no equipment',
    available:   ['bodyweight squats', 'lunges', 'push-ups', 'dips', 'pull-ups', 'planks', 'sprints'],
    constraints: ['no external loading', 'limited hypertrophy stimulus', 'must use bands/suspension if available'],
    adaptations:  ['volume must increase to drive adaptation', 'use tempo and pauses'],
  },
  'gym (basic)': {
    label:       'Basic gym (barbells and dumbbells)',
    available:   ['barbell', 'dumbbells', 'pull-up bar', 'bench', 'squat rack'],
    constraints: ['no sled', 'no specialty bars', 'limited machines'],
    adaptations:  [],
  },
  'full gym': {
    label:       'Full gym',
    available:   ['all barbells', 'dumbbells', 'cables', 'machines', 'sled', 'safety bar', 'trap bar', 'medicine balls', 'plyometric boxes'],
    constraints: [],
    adaptations:  [],
  },
  'field only': {
    label:       'Field only (no weights)',
    available:   ['cones', 'tackle bags', 'balls', 'contact pads', 'resistance bands'],
    constraints: ['no gym access', 'conditioning and skill work only'],
    adaptations:  ['focus on speed, agility, aerobic work, and skill-based conditioning'],
  },
  'home gym': {
    label:       'Home gym',
    available:   ['dumbbells', 'resistance bands', 'pull-up bar', 'bodyweight'],
    constraints: ['no barbell typically', 'limited load range'],
    adaptations:  ['higher volume to compensate for lower loads', 'bands to add resistance on key movements'],
  },
};

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Given a list of player goals and context, resolve structured training objectives.
 * Merges position-specific objectives with player-stated goals.
 */
export function resolveObjectives(goals = [], positionProfile = {}, seasonPhase = 'preseason') {
  const phase = SEASON_PHASES[seasonPhase] ?? SEASON_PHASES['preseason'];
  const resolved = [];

  for (const goal of goals) {
    const key = goal.toLowerCase().trim();
    const obj  = GOAL_OBJECTIVES[key];
    if (obj) {
      resolved.push({ goal: key, ...obj });
    } else {
      resolved.push({ goal: key, category: 'other', priority: 'secondary', notes: `Custom goal: "${goal}"` });
    }
  }

  // Inject position-specific objective if scrummaging goals set and position is front-row
  if (positionProfile.group === 'front-row' && !goals.some(g => g.toLowerCase().includes('scrum'))) {
    resolved.push({ goal: 'scrum-specific', ...GOAL_OBJECTIVES['scrummaging power'], priority: 'secondary', injected: true });
  }

  return { objectives: resolved, seasonPhase: phase };
}

export function getEquipmentProfile(equipment = []) {
  const eq = equipment.map(e => e.toLowerCase().trim());
  if (eq.some(e => e.includes('full'))) return EQUIPMENT_PROFILES['full gym'];
  if (eq.some(e => e.includes('basic') || e.includes('barbell'))) return EQUIPMENT_PROFILES['gym (basic)'];
  if (eq.some(e => e.includes('home'))) return EQUIPMENT_PROFILES['home gym'];
  if (eq.some(e => e.includes('field') || e.includes('pitch'))) return EQUIPMENT_PROFILES['field only'];
  return EQUIPMENT_PROFILES['bodyweight'];
}
