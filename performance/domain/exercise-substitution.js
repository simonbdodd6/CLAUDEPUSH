// CoachEasier Performance — exercise substitution rules (SC3).
//
// Pure rules for finding safe, structurally compatible alternatives.
// Substitution is EQUIPMENT/SKILL/TIME/IMPACT logic — it is never medical.
// A pain report routes to stop-and-review (SC2 shouldRequestClearanceReview);
// this module refuses to pick "therapeutic" swaps for pain.

import { canViewExercise } from './exercise-visibility.js';

export const SUBSTITUTION_REASONS = [
  'regression', 'progression', 'equipment', 'pattern',
  'lower_skill', 'lower_impact', 'time_saving', 'bodyweight', 'coach_custom',
];

const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
const IMPACT_RANK = { low: 0, moderate: 1, high: 2 };

// ── Declared relationships ──────────────────────────────────────────────────

/** Resolve an exercise's declared relationships of one kind. */
export function relatedExercises(ex, catalogue, kind) {
  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  return (ex?.relationships || [])
    .filter((r) => r.kind === kind)
    .map((r) => byId.get(r.target))
    .filter(Boolean);
}

// ── Structural compatibility ────────────────────────────────────────────────

/**
 * Is `candidate` a structurally compatible substitute for `original`?
 * Checks (all structural, none medical):
 *  - same primary pattern, or a declared alternative relationship
 *  - shares the primary physical quality (or lists it as secondary)
 *  - at least one common prescription type
 * @returns {{compatible:boolean, reasons:string[]}}
 */
export function substitutionCompatibility(original, candidate) {
  const reasons = [];
  if (!original || !candidate || original.id === candidate.id) {
    return { compatible: false, reasons: ['invalid_pair'] };
  }
  const samePattern = candidate.classification.pattern === original.classification.pattern ||
    (candidate.classification.secondaryPatterns || []).includes(original.classification.pattern);
  const declared = (original.relationships || []).some((r) => r.target === candidate.id);
  if (!samePattern && !declared) reasons.push('different_pattern');

  const oq = original.classification.primaryQuality;
  const qualityMatch = candidate.classification.primaryQuality === oq ||
    (candidate.classification.secondaryQualities || []).includes(oq);
  if (!qualityMatch && !declared) reasons.push('different_quality');

  const shared = (candidate.prescription || []).some((p) => (original.prescription || []).includes(p));
  if (!shared) reasons.push('incompatible_prescription');

  return { compatible: reasons.length === 0, reasons };
}

// ── Candidate search ────────────────────────────────────────────────────────

/**
 * Rank substitution candidates for an exercise under structured constraints.
 *
 * @param {object} original
 * @param {Array}  catalogue
 * @param {object} constraints
 * @param {object} [constraints.athleteEquipment]  SC2 equipment access {locations, items}
 * @param {string} [constraints.techLevel]         'beginner'|'intermediate'|'advanced'
 * @param {string} [constraints.impactTolerance]   max impact: 'low'|'moderate'|'high'
 * @param {string} [constraints.sessionIntent]     required category (e.g. keep it a power slot)
 * @param {string[]} [constraints.restrictionTags] active restriction/contraindication tags
 * @param {boolean} [constraints.bodyweightOnly]
 * @param {object} [constraints.viewer]            visibility context
 * @param {function} [constraints.equipmentGapFn]  injected from domain/exercise.js to avoid cycles
 * @returns {Array<{exercise:object, reason:string, declared:boolean}>}
 */
export function substitutionCandidates(original, catalogue, constraints = {}) {
  if (!original) return [];
  const {
    athleteEquipment = null, techLevel = null, impactTolerance = null,
    sessionIntent = null, restrictionTags = [], bodyweightOnly = false,
    viewer = null, equipmentGapFn = null,
  } = constraints;

  const out = [];
  for (const cand of catalogue || []) {
    if (cand.id === original.id) continue;
    if (cand.status !== 'approved') continue;                       // never substitute into unreviewed content
    if (viewer && !canViewExercise(cand, viewer)) continue;         // no hidden-content leakage

    const compat = substitutionCompatibility(original, cand);
    if (!compat.compatible) continue;

    // Structured constraints
    if (sessionIntent && cand.classification.category !== sessionIntent &&
        original.classification.category !== cand.classification.category) continue;
    if (techLevel && DIFFICULTY_RANK[cand.classification.difficulty] > DIFFICULTY_RANK[techLevel]) continue;
    if (impactTolerance && IMPACT_RANK[cand.classification.impact] > IMPACT_RANK[impactTolerance]) continue;
    if (bodyweightOnly && !cand.equipment.bodyweightOnly) continue;
    if (athleteEquipment && equipmentGapFn) {
      const gap = equipmentGapFn(cand, athleteEquipment);
      if (gap.missing.length) continue;
    }
    // Restriction tags: a candidate carrying an ACTIVE restriction tag is
    // excluded — but exclusion is as far as this module ever goes.
    if ((restrictionTags || []).some((t) => (cand.safety?.contraindicationTags || []).includes(t))) continue;

    const declared = (original.relationships || []).find((r) => r.target === cand.id);
    out.push({
      exercise: cand,
      declared: !!declared,
      reason: declared ? declaredKindToReason(declared.kind) : inferredReason(original, cand),
    });
  }
  // Declared relationships first, then easier options, then name.
  return out.sort((a, b) =>
    (b.declared - a.declared) ||
    (DIFFICULTY_RANK[a.exercise.classification.difficulty] - DIFFICULTY_RANK[b.exercise.classification.difficulty]) ||
    a.exercise.name.localeCompare(b.exercise.name));
}

function declaredKindToReason(kind) {
  return {
    regression: 'regression', progression: 'progression',
    equipment_alternative: 'equipment', pattern_alternative: 'pattern',
    lower_impact_alternative: 'lower_impact', time_saving_alternative: 'time_saving',
    prerequisite: 'regression',
  }[kind] || 'pattern';
}

function inferredReason(original, cand) {
  if (cand.equipment.bodyweightOnly && !original.equipment.bodyweightOnly) return 'bodyweight';
  if (IMPACT_RANK[cand.classification.impact] < IMPACT_RANK[original.classification.impact]) return 'lower_impact';
  if (DIFFICULTY_RANK[cand.classification.difficulty] < DIFFICULTY_RANK[original.classification.difficulty]) return 'lower_skill';
  return 'equipment';
}

// ── Pain routing (NOT substitution) ─────────────────────────────────────────

/**
 * When an athlete reports pain on an exercise, the product must stop and
 * route to review — never silently pick a "therapeutic" alternative.
 * @returns {{action:'stop_and_review', substitute:null, message:string}}
 */
export function painReportRouting() {
  return {
    action: 'stop_and_review',
    substitute: null,
    message: 'Stop the exercise. This is not something to train through — ask an appropriate member of staff to review before continuing.',
  };
}
