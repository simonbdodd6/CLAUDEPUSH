/**
 * Coach profile schema, validation, and built-in philosophy presets.
 * A coach profile colours the AI output with style, tone, and methodological preferences.
 */

export const COACHING_PHILOSOPHIES = {
  'development-first': {
    label:       'Development-first',
    emphasis:    'long-term player development over short-term results',
    cues:        ['process over outcome', 'celebrate effort', 'mistake = learning opportunity'],
    suitedFor:   ['youth', 'beginner', 'U8', 'U10', 'U12'],
  },
  'performance': {
    label:       'Performance',
    emphasis:    'optimising physical output and tactical execution',
    cues:        ['standards-based', 'data-informed', 'competitive mindset'],
    suitedFor:   ['elite', 'professional', 'senior', 'U18'],
  },
  'player-centred': {
    label:       'Player-centred',
    emphasis:    'autonomy, ownership, and intrinsic motivation',
    cues:        ['question-based coaching', 'athlete ownership', 'collaborative decisions'],
    suitedFor:   ['U14', 'U16', 'U18', 'senior'],
  },
  'technical-mastery': {
    label:       'Technical mastery',
    emphasis:    'precise skill execution and repeatability',
    cues:        ['slow is smooth, smooth is fast', 'correct before fast', 'repetition with purpose'],
    suitedFor:   ['all'],
  },
  'game-sense': {
    label:       'Game-sense / TGfU',
    emphasis:    'understanding principles through modified games',
    cues:        ['modified games', 'principles not patterns', 'decision-making first'],
    suitedFor:   ['youth', 'U8', 'U10', 'U12', 'U14', 'U16'],
  },
};

const REQUIRED_FIELDS = ['name'];

export function validateCoachProfile(data = {}) {
  const errors = [];
  for (const f of REQUIRED_FIELDS) {
    if (!data[f]) errors.push(`coach profile missing required field: "${f}"`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  return true;
}

/**
 * Normalise raw coach data into a consistent profile object.
 * All fields are optional except name — defaults are sensible for a community rugby coach.
 */
export function buildCoachProfile(raw = {}) {
  validateCoachProfile(raw);

  const philosophyKey = raw.philosophy || 'player-centred';
  const philosophy    = COACHING_PHILOSOPHIES[philosophyKey] ?? COACHING_PHILOSOPHIES['player-centred'];

  return {
    name:           raw.name,
    club:           raw.club           || null,
    ageGroupsFocus: raw.ageGroupsFocus || ['senior'],
    level:          raw.level          || 'community',
    yearsCoaching:  raw.yearsCoaching  || null,
    qualifications: raw.qualifications || [],
    philosophy:     philosophyKey,
    philosophyLabel: philosophy.label,
    philosophyEmphasis: philosophy.emphasis,
    coachingCues:   raw.coachingCues   || philosophy.cues,
    preferredStyle: raw.preferredStyle || 'player-centred',
    systemOfPlay:   raw.systemOfPlay   || null,
    strengthsBias:  raw.strengthsBias  || null,
    notes:          raw.notes          || null,
  };
}

export function defaultCoachProfile() {
  return buildCoachProfile({ name: 'Head Coach' });
}
