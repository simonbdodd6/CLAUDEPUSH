// CoachEasier Performance — coaching-rule-engine vocabularies (SC5).
//
// Controlled vocabularies, reason codes and rule tables for the
// DETERMINISTIC coaching rule engine. No language model participates in
// any decision; every rule here is explicit, versioned data.
//
// PROVISIONAL_REQUIRES_SNC_REVIEW: rule tables carrying this marker encode
// sensible beta defaults that MUST be reviewed by a qualified S&C coach
// (and, where flagged, medical/safeguarding advisers) before production.
// The product must never present them as professionally validated until
// that review is recorded.
//
// Pure module: no DOM, no fetch, no localStorage, no randomness, no clock.

export const ENGINE_VERSION = '2026.08-sc5-beta.1';
export const PROVISIONAL = 'PROVISIONAL_REQUIRES_SNC_REVIEW';

// ── Development context ─────────────────────────────────────────────────────
// Extensible: add categories here without redesigning the engine; every
// category declares its own safeguard set.

export const DEVELOPMENT_CONTEXTS = [
  { id: 'youth_u16', label: 'Youth U16',  youth: true },
  { id: 'youth_u18', label: 'Youth U18',  youth: true },
  { id: 'adult',     label: 'Adult / Senior', youth: false },
  { id: 'unknown',   label: 'Unknown — conservative safeguards', youth: true }, // fail-safe: never silently adult
];

export const TEAM_CATEGORIES = ['u16', 'u18', 'senior', null];

// ── Core integration contract: teamDevelopmentCategory ──────────────────────
// The existing CoachEasier identity/team system does NOT yet carry a
// structured team age category — team NAMES are never parsed as age
// evidence. When Core integration lands, teams must expose a structured
// `teamDevelopmentCategory` field with these canonical values. Until then
// callers pass null and the engine fails conservatively (an athlete with
// no age evidence is NEVER silently treated as adult).
export const TEAM_DEVELOPMENT_CATEGORIES = ['youth_u16', 'youth_u18', 'adult', 'mixed_open', 'unknown'];

/**
 * Normalise a team category input to the canonical contract. Accepts the
 * canonical values plus the legacy structured shorthands ('u16'|'u18'|
 * 'senior'). Anything else — including team name strings — resolves to
 * 'unknown' so it can never act as age evidence.
 */
export function normalizeTeamDevelopmentCategory(raw) {
  if (raw === null || raw === undefined) return 'unknown';
  const map = { u16: 'youth_u16', u18: 'youth_u18', senior: 'adult' };
  const canonical = map[raw] || raw;
  return TEAM_DEVELOPMENT_CATEGORIES.includes(canonical) ? canonical : 'unknown';
}

// ── Rule precedence (Part 4) — highest first. Testable, exported. ───────────

export const RULE_PRECEDENCE = [
  'hard_safety_restrictions',
  'development_safeguards',
  'coach_restrictions',
  'exercise_eligibility',
  'schedule_match_constraints',
  'athlete_experience',
  'equipment_availability',
  'primary_goal',
  'position_requirements',
  'season_phase',
  'secondary_goal',
  'preferences',
];

export function precedenceRank(layer) {
  const i = RULE_PRECEDENCE.indexOf(layer);
  return i === -1 ? RULE_PRECEDENCE.length : i;
}

/** True when layer a outranks (must never be overridden by) layer b. */
export function outranks(a, b) {
  return precedenceRank(a) < precedenceRank(b);
}

// ── Dose categories (SC4-compatible string categories — never numbers) ──────

export const VOLUME_CATEGORIES = ['very_low', 'low', 'moderate', 'high'];
export const INTENSITY_CATEGORIES = ['technique', 'low', 'moderate', 'high'];

// ── Session archetypes ──────────────────────────────────────────────────────

export const SESSION_ARCHETYPES = [
  { id: 'full_body_strength',        label: 'Full Body Strength' },
  { id: 'lower_strength_upper_volume', label: 'Lower Strength + Upper Volume' },
  { id: 'upper_strength_lower_power',  label: 'Upper Strength + Lower Power' },
  { id: 'power_strength',            label: 'Power + Strength' },
  { id: 'speed_lower_strength',      label: 'Speed + Lower Strength' },
  { id: 'recovery_mobility',         label: 'Recovery / Mobility' },
  { id: 'conditioning',              label: 'Conditioning' },
  { id: 'short_maintenance',         label: 'Short Maintenance' },
  { id: 'primer',                    label: 'Primer' },
];

// ── Match-day offsets ───────────────────────────────────────────────────────

export const MD_OFFSETS = ['MD-5', 'MD-4', 'MD-3', 'MD-2', 'MD-1', 'MD', 'MD+1'];

// Work classes used by match-week placement rules (consumed by SC6 scheduling).
export const WORK_CLASSES = [
  'heavy_lower', 'heavy_upper', 'power', 'high_speed_running',
  'high_volume_accessory', 'conditioning_high', 'conditioning_low',
  'mobility', 'primer', 'neck_contact_prep',
];

// ── Review flags (Part 16) ──────────────────────────────────────────────────
// severity: info → allow with note; warning → allow, surface prominently;
// requires_review → coach must review before use; blocking → engine refuses.

export const REVIEW_FLAGS = [
  { id: 'beta_rules_provisional',        severity: 'info',            label: 'Beta coaching rules — awaiting qualified S&C review' },
  { id: 'youth_safeguards_active',       severity: 'info',            label: 'Youth safeguards active' },
  { id: 'youth_high_skill_review',       severity: 'requires_review', label: 'High-skill work for a youth athlete needs coach review' },
  { id: 'youth_high_load_review',        severity: 'requires_review', label: 'High-load work for a youth athlete needs coach review' },
  { id: 'medical_restriction_review',    severity: 'requires_review', label: 'Recorded restriction affects this plan — staff review needed' },
  { id: 'restrictions_unknown',          severity: 'warning',         label: 'No restriction information recorded — confirm before loading' },
  { id: 'missing_development_context',   severity: 'requires_review', label: 'Development context unknown — conservative safeguards applied' },
  { id: 'development_context_conflict',  severity: 'warning',         label: 'Team category and athlete age disagree' },
  { id: 'conflicting_schedule',          severity: 'warning',         label: 'Gym days collide with rugby commitments' },
  { id: 'insufficient_equipment',        severity: 'warning',         label: 'Limited equipment narrowed exercise selection' },
  { id: 'equipment_unknown',             severity: 'warning',         label: 'Equipment unknown — conservative bodyweight assumptions used' },
  { id: 'insufficient_training_days',    severity: 'blocking',        label: 'No available training days — cannot plan sessions' },
  { id: 'profile_incomplete',            severity: 'warning',         label: 'Profile incomplete — structural decisions only' },
  { id: 'supervision_required',          severity: 'requires_review', label: 'Selected work requires confirmed supervision' },
  { id: 'goal_conflict',                 severity: 'info',            label: 'Goals pull in different directions — priorities balanced' },
  { id: 'return_to_general_training_review', severity: 'requires_review', label: 'Return to general training — coach review before starting' },
  { id: 'pattern_coverage_gap',          severity: 'warning',         label: 'A movement pattern could not be covered this week' },
];

export const FLAG_SEVERITIES = ['info', 'warning', 'requires_review', 'blocking'];

export function flagDef(id) {
  return REVIEW_FLAGS.find((f) => f.id === id) || null;
}

// ── Reason codes & deterministic text templates (Part 15) ───────────────────
// Templates are plain functions of their params — same input, same text.

export const REASON_TEMPLATES = {
  freq_available_days: (p) => `${p.frequency} session${p.frequency === 1 ? '' : 's'} selected because the athlete has ${p.available} available gym day${p.available === 1 ? '' : 's'}.`,
  freq_phase_cap: (p) => `Held at ${p.frequency} sessions for the ${p.phase.replace(/_/g, ' ')} phase.`,
  freq_congestion: (p) => `Reduced to ${p.frequency} because the rugby week already carries ${p.rugbyLoad} rugby commitment${p.rugbyLoad === 1 ? '' : 's'}.`,
  freq_training_age: (p) => `Capped at ${p.frequency} while training experience is ${p.experience.replace(/_/g, ' ')}.`,
  freq_youth_cap: (p) => `Capped at ${p.frequency} under ${p.context.replace(/_/g, ' ').toUpperCase()} safeguards.`,
  freq_two_matches: (p) => `Reduced to ${p.frequency} because there are two matches this week.`,
  dose_phase: (p) => `${cap(p.kind)} set to ${label(p.value)} for the ${p.phase.replace(/_/g, ' ')} phase.`,
  dose_youth_cap: (p) => `${cap(p.kind)} capped at ${label(p.value)} under youth safeguards.`,
  dose_experience: (p) => `${cap(p.kind)} adjusted to ${label(p.value)} for ${p.experience.replace(/_/g, ' ')} training experience.`,
  dose_congestion: (p) => `${cap(p.kind)} reduced to ${label(p.value)} because the rugby week carries ${p.rugbyLoad} commitments.`,
  slot_unfilled: (p) => `No eligible exercise satisfies the ${p.pattern.replace(/_/g, ' ')} slot under the current constraints — left for coach review rather than relaxing safety rules.`,
  archetype_selected: (p) => `${p.archetype.replace(/_/g, ' ')} chosen for slot ${p.slot} to serve ${p.driver.replace(/_/g, ' ')}.`,
  md_rule: (p) => `${p.md}: ${p.text}`,
  excl_not_engine_eligible: (p) => `${p.name} excluded — not approved CoachEasier-validated content.`,
  excl_youth_suitability: (p) => `${p.name} excluded — youth suitability is "${p.youth.replace(/_/g, ' ')}" under ${p.context.replace(/_/g, ' ').toUpperCase()} safeguards.`,
  excl_supervision: (p) => `${p.name} excluded because it requires supervised delivery and supervision is unavailable.`,
  excl_difficulty: (p) => `${p.name} excluded — ${p.difficulty} difficulty exceeds the athlete's current level (${p.level}).`,
  excl_equipment: (p) => `${p.name} excluded — requires ${p.missing.join(', ')} which the athlete cannot access.`,
  excl_restriction: (p) => `${p.name} excluded — an active restriction (${p.tag.replace(/_/g, ' ')}) applies to it.`,
  excl_high_load_youth: (p) => `${p.name} excluded — high-load lifting is reviewed case-by-case under ${p.context.replace(/_/g, ' ').toUpperCase()} safeguards.`,
  rank_pattern: (p) => `${p.name} satisfies the ${p.pattern.replace(/_/g, ' ')} requirement.`,
  rank_goal: (p) => `${p.name} serves the ${p.goal.replace(/_/g, ' ')} goal.`,
  rank_position: (p) => `${p.name} is ${p.level} relevance for ${p.position.replace(/_/g, ' ')}.`,
  rank_phase: (p) => `${p.name} suits the ${p.phase.replace(/_/g, ' ')} phase.`,
  rank_level_fit: (p) => `${p.name} matches the athlete's ${p.level.replace(/_/g, ' ')} level.`,
  ctx_from_ageband: (p) => `Development context ${p.context.replace(/_/g, ' ')} resolved from the athlete's age band.`,
  ctx_from_team: (p) => `Development context taken from the team category because athlete age is not recorded.`,
  ctx_conflict_youth_in_senior: () => 'Athlete is youth-age in a senior team — youth safeguards remain active.',
  ctx_conflict_adult_in_youth: () => 'Adult athlete registered with a youth team — classified from age, not team name.',
  ctx_unknown: () => 'No reliable age or team information — conservative safeguards applied and review requested.',
  pattern_required: (p) => `${p.pattern.replace(/_/g, ' ')} coverage required this week (${p.driver.replace(/_/g, ' ')}).`,
  optional_work: (p) => p.enabled ? 'Optional extras included — schedule has spare capacity.' : 'No optional work — the week is already full.',
};

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function label(s) { return String(s).replace(/_/g, ' '); }

/** Build a deterministic reason object. Unknown codes throw — no free text. */
export function reason(code, params = {}) {
  const tpl = REASON_TEMPLATES[code];
  if (!tpl) throw new Error(`unknown_reason_code:${code}`);
  return { code, text: tpl(params) };
}
