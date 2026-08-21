// CoachEasier Performance — deterministic exercise eligibility & ranking (SC5).
//
// SAFETY FILTERING HAPPENS BEFORE RANKING and ranking can never resurrect
// an excluded exercise: rankExercises only ever receives the eligible list.
// Only SC3 engine-eligible content (approved, CoachEasier-validated) enters
// consideration — draft, club, private and archived records are rejected at
// the very first gate. Every exclusion and every ranking carries reason
// codes. Pure module: no DOM, no fetch, no clock, no randomness.

import { equipmentGap } from './exercise.js';
import { isEngineEligible } from './exercise-visibility.js';
import { reason } from '../types/coaching.js';

const LEVEL_RANK = { new: 0, beginner: 0, intermediate: 1, advanced: 2 };
const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
const RELEVANCE_SCORE = { core: 3, high: 2, medium: 1, low: 0 };

// Conservative bodyweight assumption when equipment is unknown (Part 17).
export const CONSERVATIVE_EQUIPMENT = { locations: ['bodyweight_only'], items: [] };

/**
 * Effective complexity ceiling for an athlete: development context caps
 * first (safeguards outrank experience), then training experience.
 * A youth ceiling never rises above intermediate; U16 defaults to
 * beginner-complexity unless experience is intermediate+ (technique-first).
 */
export function complexityCeiling({ context, experience }) {
  const exp = LEVEL_RANK[experience] ?? 0;
  if (context === 'youth_u16' || context === 'unknown') return Math.min(exp, 1) === 1 ? 'intermediate' : 'beginner';
  if (context === 'youth_u18') return exp >= 1 ? 'intermediate' : 'beginner';
  return exp === 2 ? 'advanced' : exp === 1 ? 'intermediate' : 'beginner';
}

/**
 * Partition a catalogue into eligible + excluded (with reasons) for one
 * athlete context. Exclusion order follows RULE_PRECEDENCE: hard safety
 * (restrictions), development safeguards (youth suitability, supervision,
 * high-load), eligibility (SC3 approval), then schedule-independent gates
 * (difficulty, equipment).
 *
 * @param {Array} catalogue
 * @param {{context:string, experience:string, techConfidence?:string,
 *          equipment?:{locations:string[],items:string[]}|null,
 *          supervisionAvailable?:boolean, restrictionTags?:string[]}} ctx
 */
export function partitionEligibility(catalogue, ctx) {
  const eligible = [];
  const excluded = [];
  const {
    context = 'unknown', experience = 'beginner', equipment = null,
    supervisionAvailable = false, restrictionTags = [],
  } = ctx;
  const youth = context !== 'adult';
  const ceiling = DIFFICULTY_RANK[complexityCeiling({ context, experience })];
  const effectiveEquipment = equipment || CONSERVATIVE_EQUIPMENT;

  for (const ex of catalogue || []) {
    const name = ex.name;

    // 1. Hard safety: never engine-select unapproved/unvalidated content.
    if (!isEngineEligible(ex)) {
      excluded.push({ exercise: ex, code: 'excl_not_engine_eligible', reason: reason('excl_not_engine_eligible', { name }) });
      continue;
    }
    // 1b. Hard safety: active restriction tags exclude matching exercises.
    const tag = (restrictionTags || []).find((t) => (ex.safety?.contraindicationTags || []).includes(t));
    if (tag) {
      excluded.push({ exercise: ex, code: 'excl_restriction', reason: reason('excl_restriction', { name, tag }) });
      continue;
    }
    // 2. Development safeguards.
    if (youth) {
      const suitability = ex.safety?.youth || 'needs_review';
      if (suitability === 'not_recommended' || suitability === 'needs_review') {
        excluded.push({ exercise: ex, code: 'excl_youth_suitability', reason: reason('excl_youth_suitability', { name, youth: suitability, context }) });
        continue;
      }
      const needsSupervision = ex.safety?.highSkill ||
        (ex.safety?.precautionTags || []).some((t) => t === 'requires_supervision' || t === 'requires_spotter' || t === 'youth_technique_first');
      if (needsSupervision && !supervisionAvailable) {
        excluded.push({ exercise: ex, code: 'excl_supervision', reason: reason('excl_supervision', { name }) });
        continue;
      }
      if (context === 'youth_u16' && ex.safety?.highLoad && !supervisionAvailable) {
        excluded.push({ exercise: ex, code: 'excl_high_load_youth', reason: reason('excl_high_load_youth', { name, context }) });
        continue;
      }
    } else if (ex.safety?.highSkill && LEVEL_RANK[experience] < 2 && !supervisionAvailable) {
      // Adults: high-skill lifts need either advanced experience or supervision.
      excluded.push({ exercise: ex, code: 'excl_supervision', reason: reason('excl_supervision', { name }) });
      continue;
    }
    // 6. Athlete experience → complexity ceiling.
    if (DIFFICULTY_RANK[ex.classification.difficulty] > ceiling) {
      excluded.push({ exercise: ex, code: 'excl_difficulty', reason: reason('excl_difficulty', { name, difficulty: ex.classification.difficulty, level: complexityCeiling({ context, experience }) }) });
      continue;
    }
    // 7. Equipment availability.
    const gap = equipmentGap(ex, effectiveEquipment);
    // Partner/wall requirements (unmapped) block only when the athlete has
    // strictly bodyweight context without a partner — treated as available
    // in team settings; conservative solo context excludes partner drills.
    const missing = [...gap.missing];
    if (effectiveEquipment === CONSERVATIVE_EQUIPMENT && gap.unmapped.includes('partner')) missing.push('partner');
    if (missing.length) {
      excluded.push({ exercise: ex, code: 'excl_equipment', reason: reason('excl_equipment', { name, missing }) });
      continue;
    }

    eligible.push(ex);
  }
  return { eligible, excluded };
}

// Ranking weights — PROVISIONAL_REQUIRES_SNC_REVIEW (see types/coaching.js).
export const RANKING_WEIGHTS = {
  pattern: 40,       // satisfying the requested movement pattern dominates
  quality: 15,       // requested physical quality
  goal: 12,          // athlete goal relevance
  position: 8,       // per relevance level (core=3 → 24)
  phase: 6,
  levelFit: 5,       // exact difficulty match to the athlete's level
};

/**
 * Deterministically rank ELIGIBLE exercises for a slot. Never call with an
 * unfiltered catalogue — safety filtering is partitionEligibility's job and
 * ranking cannot resurrect an excluded exercise.
 *
 * @param {Array} eligible  output of partitionEligibility().eligible
 * @param {{pattern?:string, quality?:string, goals?:string[], position?:string,
 *          phase?:string, level?:string}} slot
 * @returns {Array<{exercise, score, reasons}>} sorted best-first, ties by slug
 */
export function rankExercises(eligible, slot = {}) {
  const { pattern = null, quality = null, goals = [], position = null, phase = null, level = 'beginner' } = slot;
  const ranked = [];
  for (const ex of eligible || []) {
    let score = 0;
    const reasons = [];
    const c = ex.classification;
    const name = ex.name;

    if (pattern) {
      const hit = c.pattern === pattern || (c.secondaryPatterns || []).includes(pattern);
      if (!hit) continue; // slot demands this pattern — others aren't candidates
      score += RANKING_WEIGHTS.pattern + (c.pattern === pattern ? 5 : 0);
      reasons.push(reason('rank_pattern', { name, pattern }));
    }
    if (quality && (c.primaryQuality === quality || (c.secondaryQualities || []).includes(quality))) {
      score += RANKING_WEIGHTS.quality;
    }
    for (const g of goals) {
      if ((ex.relevance?.goals || []).includes(g)) {
        score += RANKING_WEIGHTS.goal;
        reasons.push(reason('rank_goal', { name, goal: g }));
        break; // one goal credit — keeps scores comparable
      }
    }
    if (position) {
      const lvl = ex.relevance?.positions?.[position] || 'low';
      score += RANKING_WEIGHTS.position * RELEVANCE_SCORE[lvl];
      if (RELEVANCE_SCORE[lvl] >= 2) reasons.push(reason('rank_position', { name, level: lvl, position }));
    }
    if (phase && (ex.relevance?.phases || []).includes(phase)) {
      score += RANKING_WEIGHTS.phase;
      reasons.push(reason('rank_phase', { name, phase }));
    }
    if (c.difficulty === level) {
      score += RANKING_WEIGHTS.levelFit;
      reasons.push(reason('rank_level_fit', { name, level }));
    }
    ranked.push({ exercise: ex, score, reasons });
  }
  return ranked.sort((a, b) => (b.score - a.score) || a.exercise.slug.localeCompare(b.exercise.slug));
}

/** Top pick for a slot, or null with a coverage gap for the caller to flag. */
export function selectForSlot(eligible, slot) {
  const ranked = rankExercises(eligible, slot);
  return ranked.length ? ranked[0] : null;
}
