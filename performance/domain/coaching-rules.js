// CoachEasier Performance — deterministic coaching rules (SC5).
//
// Frequency, dose categories, match-week placement, session archetypes and
// movement-pattern coverage. Every function is a pure function of its
// inputs: same input → same output, byte for byte. Every table is
// PROVISIONAL_REQUIRES_SNC_REVIEW (types/coaching.js) until qualified
// review is recorded. Nothing here calculates loads, week-to-week
// increases or recovery-week reductions — that is SC6+ territory.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import { reason } from '../types/coaching.js';

// ── Weekly frequency (Part 8) ───────────────────────────────────────────────

// Base target by phase × training age. PROVISIONAL.
const FREQ_BASE = {
  off_season:  { new: 2, beginner: 2, intermediate: 3, advanced: 4 },
  pre_season:  { new: 2, beginner: 2, intermediate: 3, advanced: 3 },
  in_season:   { new: 1, beginner: 2, intermediate: 2, advanced: 2 },
  peak:        { new: 1, beginner: 1, intermediate: 2, advanced: 2 },
  taper:       { new: 1, beginner: 1, intermediate: 1, advanced: 2 },
  return_to_general_training: { new: 2, beginner: 2, intermediate: 2, advanced: 2 },
};
const YOUTH_FREQ_CAP = { youth_u16: { default: 3, in_season: 2 }, youth_u18: { default: 4, in_season: 3 }, unknown: { default: 2, in_season: 2 } };

/**
 * Decide S&C frequency for one week.
 * @param {{availableDays:string[], rugbyDays:Array, matchDay:string|null,
 *          matchCount?:number, phase:string, experience:string, context:string,
 *          maxSessionMinutes?:number|null, goal?:string}} input
 * @returns {{frequency:number, reasons:Array, flags:string[]}}
 */
export function decideFrequency(input) {
  const {
    availableDays = [], rugbyDays = [], matchDay = null, matchCount = matchDay ? 1 : 0,
    phase = 'in_season', experience = 'beginner', context = 'unknown',
  } = input;
  const reasons = [];
  const flags = [];
  const available = availableDays.length;

  if (available === 0) {
    flags.push('insufficient_training_days');
    return { frequency: 0, reasons: [reason('freq_available_days', { frequency: 0, available: 0 })], flags };
  }

  let frequency = (FREQ_BASE[phase] || FREQ_BASE.in_season)[experience] ?? 2;
  reasons.push(reason('freq_phase_cap', { frequency, phase }));

  // Youth caps (development safeguards outrank experience).
  const youthCap = YOUTH_FREQ_CAP[context];
  if (youthCap) {
    const cap = phase === 'in_season' ? youthCap.in_season : youthCap.default;
    if (frequency > cap) {
      frequency = cap;
      reasons.push(reason('freq_youth_cap', { frequency, context }));
    }
  }

  // Never force beyond availability.
  if (frequency > available) {
    frequency = available;
    reasons.push(reason('freq_available_days', { frequency, available }));
  }

  // Rugby congestion: rugby sessions + matches consume recovery. Cap S&C so
  // total structured days stay ≤ 5 for adults, ≤ 4 for youth/unknown.
  const rugbyLoad = (rugbyDays?.length || 0) + matchCount;
  const totalCap = context === 'adult' ? 5 : 4;
  if (rugbyLoad + frequency > totalCap) {
    frequency = Math.max(1, totalCap - rugbyLoad);
    reasons.push(reason('freq_congestion', { frequency, rugbyLoad }));
  }
  if (matchCount >= 2 && frequency > 1) {
    frequency = 1;
    reasons.push(reason('freq_two_matches', { frequency }));
  }
  if (frequency > available) frequency = available;

  // Availability colliding with rugby days is workable but worth surfacing.
  const collisions = availableDays.filter((d) => (rugbyDays || []).some((r) => (r.day || r) === d) || d === matchDay);
  if (collisions.length && collisions.length === available) flags.push('conflicting_schedule');

  return { frequency, reasons, flags };
}

// ── Dose categories (Part 14 categories — never numbers) ────────────────────

const VOLUME_BY_PHASE = { off_season: 'high', pre_season: 'moderate', in_season: 'low', peak: 'low', taper: 'very_low', return_to_general_training: 'low' };
const INTENSITY_BY_PHASE = { off_season: 'moderate', pre_season: 'moderate', in_season: 'moderate', peak: 'high', taper: 'moderate', return_to_general_training: 'low' };
const VOL_ORDER = ['very_low', 'low', 'moderate', 'high'];
const INT_ORDER = ['technique', 'low', 'moderate', 'high'];
const capAt = (order, value, cap) => order[Math.min(order.indexOf(value), order.indexOf(cap))];
const stepDown = (order, value) => order[Math.max(order.indexOf(value) - 1, 0)];

// Training-age category ceilings — a phase expresses desired emphasis but
// never independently forces a beginner into the highest categories.
// PROVISIONAL_REQUIRES_SNC_REVIEW.
const EXPERIENCE_DOSE_CAPS = {
  new:          { volume: 'low',      intensity: 'technique' },
  beginner:     { volume: 'moderate', intensity: 'moderate' },
  intermediate: { volume: 'high',     intensity: 'high' },
  advanced:     { volume: 'high',     intensity: 'high' },
};

/**
 * Approximate volume/intensity CATEGORIES for the blueprint. Categories
 * only — SC6 converts them into progressive prescriptions.
 *
 * Explicit dose-resolution pipeline:
 *   phase baseline (+goal emphasis)
 *   → constrained by training age (EXPERIENCE_DOSE_CAPS)
 *   → constrained by development context (youth ceilings — final, binding)
 *   → reduced by schedule congestion (rugbyLoad)
 * Caps only ever LOWER a category, so no later step can out-rank an
 * earlier safety ceiling; youth ceilings are applied last and are
 * therefore always binding.
 */
export function decideDose({ phase = 'in_season', experience = 'beginner', context = 'unknown', goal = null, rugbyLoad = 0 }) {
  const reasons = [];
  const flags = [];
  // 1. Phase baseline (+ goal emphasis, still subject to every later cap).
  let volume = VOLUME_BY_PHASE[phase] || 'low';
  let intensity = INTENSITY_BY_PHASE[phase] || 'moderate';
  reasons.push(reason('dose_phase', { kind: 'volume', value: volume, phase }));
  reasons.push(reason('dose_phase', { kind: 'intensity', value: intensity, phase }));
  if (goal === 'body_mass_gain' && (phase === 'off_season' || phase === 'pre_season')) volume = 'high';

  // 2. Training-age ceilings.
  const expCap = EXPERIENCE_DOSE_CAPS[experience] || EXPERIENCE_DOSE_CAPS.beginner;
  const vAfterExp = capAt(VOL_ORDER, volume, expCap.volume);
  if (vAfterExp !== volume) { volume = vAfterExp; reasons.push(reason('dose_experience', { kind: 'volume', value: volume, experience })); }
  const iAfterExp = capAt(INT_ORDER, intensity, expCap.intensity);
  if (iAfterExp !== intensity) { intensity = iAfterExp; reasons.push(reason('dose_experience', { kind: 'intensity', value: intensity, experience })); }

  // 3. Development-context ceilings (applied last among caps — training age
  // can never raise a category beyond a youth safety ceiling).
  if (context === 'youth_u16' || context === 'unknown') {
    const cappedV = capAt(VOL_ORDER, volume, 'moderate');
    const cappedI = capAt(INT_ORDER, intensity, 'moderate');
    if (cappedV !== volume) { volume = cappedV; reasons.push(reason('dose_youth_cap', { kind: 'volume', value: volume })); }
    if (cappedI !== intensity) { intensity = cappedI; reasons.push(reason('dose_youth_cap', { kind: 'intensity', value: intensity })); }
    if (experience === 'new' || experience === 'beginner') intensity = 'technique';
  }
  if (context === 'youth_u18' && intensity === 'high') {
    flags.push('youth_high_load_review');
  }

  // 4. Schedule congestion reduces the volume category one step.
  if (rugbyLoad >= 3 && volume !== 'very_low') {
    volume = stepDown(VOL_ORDER, volume);
    reasons.push(reason('dose_congestion', { kind: 'volume', value: volume, rugbyLoad }));
  }

  if (phase === 'return_to_general_training') flags.push('return_to_general_training_review');

  return { volume, intensity, reasons, flags };
}

// ── Match-week placement rules (Part 9) — consumed by SC6 scheduling ────────
// PROVISIONAL. Each offset lists work classes to avoid / prefer plus a
// short deterministic rationale. Not a scheduling engine.

export const MATCH_WEEK_RULES = {
  'MD-5': { avoid: [], prefer: ['heavy_lower', 'power', 'high_volume_accessory', 'conditioning_high'], text: 'Furthest from the match — the week\'s hardest development work belongs here.' },
  'MD-4': { avoid: [], prefer: ['heavy_lower', 'heavy_upper', 'conditioning_high'], text: 'Still far enough out for heavy and high-volume work.' },
  'MD-3': { avoid: ['conditioning_high'], prefer: ['heavy_lower', 'heavy_upper', 'power'], text: 'Last heavy strength day — big conditioning doses start to cost the weekend.' },
  'MD-2': { avoid: ['heavy_lower', 'conditioning_high', 'high_volume_accessory'], prefer: ['heavy_upper', 'power', 'high_speed_running'], text: 'Lower-body fatigue must clear — upper strength, sharp power and short speed only.' },
  'MD-1': { avoid: ['heavy_lower', 'heavy_upper', 'high_speed_running', 'conditioning_high', 'high_volume_accessory'], prefer: ['primer', 'mobility'], text: 'Nothing that leaves fatigue — primer and movement quality only.' },
  'MD':   { avoid: ['heavy_lower', 'heavy_upper', 'power', 'high_speed_running', 'conditioning_high', 'conditioning_low', 'high_volume_accessory'], prefer: ['primer'], text: 'Match day — an optional short primer at most.' },
  'MD+1': { avoid: ['heavy_lower', 'high_speed_running', 'conditioning_high', 'power'], prefer: ['mobility', 'conditioning_low'], text: 'Day after — movement, easy circulation, nothing heavy or fast.' },
};

/**
 * Placement constraints for a week containing a match.
 * @param {{matchDay:string|null}} input  day name, e.g. 'Sat'
 * @returns {{placements:Array<{day:string, md:string, avoid:string[], prefer:string[], reason:object}>, reasons:Array}}
 */
export function decideMatchWeekPlacement({ matchDay = null, days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } = {}) {
  if (!matchDay || !days.includes(matchDay)) return { placements: [], reasons: [] };
  const mdIndex = days.indexOf(matchDay);
  const placements = [];
  const reasons = [];
  for (let i = 0; i < days.length; i++) {
    const offset = i - mdIndex;
    const md = offset === 0 ? 'MD' : offset > 0 ? `MD+${offset}` : `MD${offset}`;
    const rule = MATCH_WEEK_RULES[md];
    if (!rule) continue;
    const r = reason('md_rule', { md, text: rule.text });
    placements.push({ day: days[i], md, avoid: [...rule.avoid], prefer: [...rule.prefer], reason: r });
    reasons.push(r);
  }
  return { placements, reasons };
}

// ── Session archetypes (Part 10) ────────────────────────────────────────────
// Deterministic archetype sequence by frequency, adjusted by goal/phase/
// context. PROVISIONAL.

export function decideSessionArchetypes({ frequency, phase = 'in_season', goal = null, context = 'unknown' }) {
  const reasons = [];
  let slots = [];

  if (frequency <= 0) return { archetypes: [], reasons };
  if (phase === 'return_to_general_training') {
    slots = ['full_body_strength', 'recovery_mobility', 'conditioning'].slice(0, frequency);
  } else if (frequency === 1) {
    slots = [goal === 'conditioning' ? 'conditioning' : 'full_body_strength'];
  } else if (frequency === 2) {
    if (goal === 'max_speed' || goal === 'acceleration') slots = ['speed_lower_strength', 'full_body_strength'];
    else if (goal === 'conditioning') slots = ['full_body_strength', 'conditioning'];
    else if (phase === 'in_season' || phase === 'peak' || phase === 'taper') slots = ['full_body_strength', 'upper_strength_lower_power'];
    else slots = ['lower_strength_upper_volume', 'upper_strength_lower_power'];
  } else if (frequency === 3) {
    const third = goal === 'conditioning' || goal === 'body_fat_reduction' ? 'conditioning'
      : goal === 'max_speed' || goal === 'acceleration' ? 'speed_lower_strength'
      : 'power_strength';
    slots = ['lower_strength_upper_volume', 'upper_strength_lower_power', third];
  } else {
    slots = ['lower_strength_upper_volume', 'upper_strength_lower_power', 'power_strength', goal === 'body_fat_reduction' ? 'conditioning' : 'speed_lower_strength'];
    slots = slots.slice(0, frequency);
  }

  // U16: technique-first — high-complexity power slots become full-body work.
  if (context === 'youth_u16' || context === 'unknown') {
    slots = slots.map((s) => (s === 'power_strength' ? 'full_body_strength' : s));
  }

  slots.forEach((archetype, i) => reasons.push(reason('archetype_selected', {
    archetype, slot: i + 1, driver: goal || phase,
  })));
  return { archetypes: slots, reasons };
}

// Block plans per archetype: block types + pattern slots. PROVISIONAL.
export const ARCHETYPE_PLANS = {
  full_body_strength: [
    { type: 'warmup', collection: 'col-rugby-gym-warmup' },
    { type: 'main_strength', slots: [{ pattern: 'squat' }, { pattern: 'horizontal_push' }, { pattern: 'hinge' }] },
    { type: 'accessory', slots: [{ pattern: 'horizontal_pull' }, { pattern: 'lunge' }] },
    { type: 'trunk', slots: [{ pattern: 'anti_extension' }, { pattern: 'carry' }] },
  ],
  lower_strength_upper_volume: [
    { type: 'warmup', collection: 'col-rugby-gym-warmup' },
    { type: 'main_strength', slots: [{ pattern: 'squat' }, { pattern: 'hinge' }] },
    { type: 'accessory', slots: [{ pattern: 'lunge' }, { pattern: 'horizontal_push' }, { pattern: 'horizontal_pull' }] },
    { type: 'trunk', slots: [{ pattern: 'anti_lateral_flexion' }] },
  ],
  upper_strength_lower_power: [
    { type: 'warmup', collection: 'col-rugby-gym-warmup' },
    { type: 'power', slots: [{ pattern: 'jump' }] },
    { type: 'main_strength', slots: [{ pattern: 'horizontal_push' }, { pattern: 'vertical_pull' }] },
    { type: 'accessory', slots: [{ pattern: 'vertical_push' }, { pattern: 'horizontal_pull' }] },
    { type: 'trunk', slots: [{ pattern: 'anti_rotation' }] },
  ],
  power_strength: [
    { type: 'warmup', collection: 'col-lower-body-activation' },
    { type: 'power', slots: [{ pattern: 'jump' }, { pattern: 'hinge', quality: 'power' }] },
    { type: 'main_strength', slots: [{ pattern: 'squat' }, { pattern: 'horizontal_pull' }] },
    { type: 'trunk', slots: [{ pattern: 'rotation' }] },
  ],
  speed_lower_strength: [
    { type: 'warmup', collection: 'col-sprint-prep' },
    { type: 'power', slots: [{ pattern: 'acceleration' }, { pattern: 'jump' }] },
    { type: 'main_strength', slots: [{ pattern: 'hinge' }, { pattern: 'lunge' }] },
    { type: 'trunk', slots: [{ pattern: 'anti_extension' }] },
  ],
  recovery_mobility: [
    { type: 'mobility', collection: 'col-mobility-reset', slots: [{ pattern: 'rotation', quality: 'mobility' }] },
    { type: 'cooldown', slots: [{ pattern: 'locomotion', quality: 'aerobic' }] },
  ],
  conditioning: [
    { type: 'warmup', collection: 'col-rugby-gym-warmup' },
    { type: 'conditioning', slots: [{ pattern: 'locomotion', quality: 'aerobic' }, { pattern: 'locomotion', quality: 'anaerobic' }] },
    { type: 'cooldown', collection: 'col-mobility-reset' },
  ],
  short_maintenance: [
    { type: 'warmup', collection: 'col-lower-body-activation' },
    { type: 'main_strength', slots: [{ pattern: 'squat' }, { pattern: 'horizontal_push' }] },
    { type: 'trunk', slots: [{ pattern: 'anti_extension' }] },
  ],
  primer: [
    { type: 'activation', collection: 'col-lower-body-activation', slots: [{ pattern: 'jump', quality: 'rfd' }] },
  ],
};

// ── Movement-pattern coverage (Part 11) ─────────────────────────────────────
// Weekly coverage evaluated across the programme, not per session.

const BASE_WEEKLY_PATTERNS = ['squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull'];
const FULL_WEEKLY_PATTERNS = [...BASE_WEEKLY_PATTERNS, 'vertical_push', 'vertical_pull', 'anti_extension', 'anti_rotation', 'carry', 'jump'];

export function patternRequirements({ frequency, goals = [], position = null, context = 'unknown', supervisionAvailable = false }) {
  const required = new Set(frequency >= 3 ? FULL_WEEKLY_PATTERNS : BASE_WEEKLY_PATTERNS);
  const recommended = new Set(['jump', 'carry', 'anti_rotation']);
  const reasons = [];

  if (goals.includes('acceleration') || goals.includes('max_speed')) {
    required.add('acceleration');
    reasons.push(reason('pattern_required', { pattern: 'acceleration', driver: 'speed goal' }));
  }
  if (goals.includes('conditioning') || goals.includes('body_fat_reduction')) required.add('locomotion');

  // Neck/contact preparation: forwards-relevant, youth only with supervision
  // (and always behind the SC3 review gates on the exercises themselves).
  const forwardPositions = ['loosehead_prop', 'hooker', 'tighthead_prop', 'lock', 'blindside_flanker', 'openside_flanker', 'number_8', 'utility_forward'];
  if (position && forwardPositions.includes(position)) {
    if (context === 'adult' || supervisionAvailable) {
      recommended.add('neck_flexion');
      recommended.add('isometric_contact');
      reasons.push(reason('pattern_required', { pattern: 'neck_flexion', driver: 'forward position' }));
    }
  }
  for (const p of required) if (recommended.has(p)) recommended.delete(p);
  return {
    required: [...required].sort(),
    recommended: [...recommended].sort(),
    reasons,
  };
}

/** Coverage check across selected exercises for the week. */
export function evaluatePatternCoverage(requirements, selectedExercises) {
  const covered = new Set();
  for (const ex of selectedExercises || []) {
    covered.add(ex.classification.pattern);
    for (const p of ex.classification.secondaryPatterns || []) covered.add(p);
  }
  const missing = requirements.required.filter((p) => !covered.has(p));
  return { covered: [...covered].sort(), missing };
}
