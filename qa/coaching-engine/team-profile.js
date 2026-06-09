/**
 * Team profile schema and validation.
 * Used for session and season-plan generation.
 */

export const TEAM_LEVELS = {
  'grassroots':    { label: 'Grassroots / Mini',     trainingSessions: 1, matchesPerWeek: 1, playerWelfare: 'highest priority — development over result' },
  'community':     { label: 'Community amateur',      trainingSessions: 2, matchesPerWeek: 1, playerWelfare: 'high — volunteer coaches, mixed commitment' },
  'club':          { label: 'Club competitive',       trainingSessions: 2, matchesPerWeek: 1, playerWelfare: 'balanced with performance' },
  'semi-pro':      { label: 'Semi-professional',      trainingSessions: 4, matchesPerWeek: 1, playerWelfare: 'performance-informed' },
  'professional':  { label: 'Professional',           trainingSessions: 5, matchesPerWeek: 1, playerWelfare: 'managed by performance science' },
};

export const VALID_AGE_GROUPS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Senior', 'Masters'];

const SESSION_DURATIONS = {
  U8: 45, U10: 60, U12: 75, U14: 90, U16: 90, U18: 90, U20: 90, Senior: 90, Masters: 75,
};

const CONTACT_GUIDELINES = {
  U8:     'non-contact — tag or touch rugby only',
  U10:    'no contested scrums or lineouts — tag/touch contact rules',
  U12:    'modified contact — no contested scrummaging, supervised tackling technique',
  U14:    'graduated contact — full tackling, no contested scrums',
  U16:    'full contact — contested scrums and lineouts introduced',
  U18:    'full contact — near-adult laws',
  U20:    'full contact',
  Senior: 'full contact',
  Masters: 'full contact — modified laws in some competitions (no-contest scrums, etc.)',
};

export function validateTeamProfile(data = {}) {
  const errors = [];
  if (!data.ageGroup) errors.push('team profile missing: "ageGroup"');
  if (data.ageGroup && !VALID_AGE_GROUPS.includes(data.ageGroup)) {
    errors.push(`ageGroup must be one of: ${VALID_AGE_GROUPS.join(', ')}`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  return true;
}

export function buildTeamProfile(raw = {}) {
  validateTeamProfile(raw);

  const levelKey    = raw.level || 'community';
  const levelData   = TEAM_LEVELS[levelKey] ?? TEAM_LEVELS['community'];
  const ageGroup    = raw.ageGroup;

  return {
    ageGroup,
    level:           levelKey,
    levelLabel:      levelData.label,
    squadSize:       raw.squadSize || 25,
    trainingsPerWeek: raw.trainingsPerWeek || levelData.trainingSessions,
    sessionDuration:  SESSION_DURATIONS[ageGroup] ?? 90,
    contactGuideline: CONTACT_GUIDELINES[ageGroup] ?? 'full contact',
    systemOfPlay:    raw.systemOfPlay    || null,
    facilities:      raw.facilities      || ['grass pitch', 'gym (basic)'],
    equipment:       raw.equipment       || ['tackle bags', 'cones', 'balls'],
    seasonPhase:     raw.seasonPhase     || 'preseason',
    currentRecord:   raw.currentRecord   || null,
    nextOpponent:    raw.nextOpponent    || null,
    keyFocusAreas:   Array.isArray(raw.keyFocusAreas) ? raw.keyFocusAreas : [],
    notes:           raw.notes           || null,
  };
}
