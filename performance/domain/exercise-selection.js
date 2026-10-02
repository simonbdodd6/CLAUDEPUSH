// CoachEasier Performance — deterministic exercise eligibility & ranking (SC5).
//
// SAFETY FILTERING HAPPENS BEFORE RANKING and ranking can never resurrect
// an excluded exercise: rankExercises only ever receives the eligible list.
// Only SC3 engine-eligible content (approved, CoachEasier-validated) enters
// consideration — draft, club, private and archived records are rejected at
// the very first gate. Every exclusion and every ranking carries reason
// codes. Pure module: no DOM, no fetch, no clock, no randomness.

import { equipmentGap } from './exercise.js';
import { EQUIPMENT_LOCATIONS } from '../types/athlete-profile.js';
import { PREPARATION_CATEGORIES } from '../types/exercise.js';
import { isPreparationBlock } from '../types/programme.js';
import { isEngineEligible } from './exercise-visibility.js';
import { reason } from '../types/coaching.js';

const LEVEL_RANK = { new: 0, beginner: 0, intermediate: 1, advanced: 2 };
const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
const RELEVANCE_SCORE = { core: 3, high: 2, medium: 1, low: 0 };

// Conservative bodyweight assumption when equipment is unknown (Part 17).
export const CONSERVATIVE_EQUIPMENT = { locations: ['bodyweight_only'], items: [] };

/** The athlete-profile vocabulary, read from where it is defined. */
const VALID_EQUIPMENT_LOCATIONS = EQUIPMENT_LOCATIONS.map((l) => l.id || l);

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
  // An unrecognised equipment location silently narrowed the eligible library.
  // It is returned so callers can report it instead of absorbing it.
  const invalidEquipmentLocations = [...new Set(
    (effectiveEquipment.locations || []).filter((l) => !VALID_EQUIPMENT_LOCATIONS.includes(l)))];
  return { eligible, excluded, invalidEquipmentLocations };
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
    if (quality) {
      // A slot that names a quality is naming the PURPOSE of the movement, not
      // a benefit it happens to confer. A hip thrust lists power among its
      // SECONDARY qualities and is a max-strength lift; admitting it to a power
      // slot put strength work in a power block, where it was then dosed and
      // progressed as strength (4 x 7 inside a power block).
      //
      // Requiring the quality to be PRIMARY is what keeps a slot's intent and
      // its dosing in agreement — `repsAreQualityDose` decides dosing from the
      // same classification, so the two can no longer disagree. Ranking cannot
      // express this: no score is large enough to be a guarantee, and raising
      // the weight would only move the failure to the next close pair.
      if (c.primaryQuality !== quality) continue;
      score += RANKING_WEIGHTS.quality;
      reasons.push(reason('rank_quality', { name, quality }));
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

/**
 * May this exercise be prescribed as WORKING work in this block?
 *
 * A slot's block type is part of what makes an exercise appropriate, and it
 * used to be absent from the slot entirely — so the same eligible pool served
 * a warm-up and a main-strength block alike, and ranking on pattern and
 * quality alone put a bodyweight hip-hinge DRILL in as somebody's main lift.
 *
 * The rule is a category rule, not an exercise rule: every preparation-category
 * exercise is admitted only to preparation blocks. Special-casing the one
 * exercise the corpus caught would have left the same defect for the next one —
 * and there were two others, a mobility drill prescribed as trunk work and the
 * same hip hinge appearing in power blocks.
 *
 * With no `blockType` on the slot the rule does not apply, so existing callers
 * that do not express one keep their current behaviour.
 */
export function isCategoryAllowedInBlock(exercise, blockType) {
  if (!blockType) return true;
  const category = exercise?.classification?.category;

  // GATE 2 — main_strength_intent. A main-strength slot exists to develop
  // maximal force, which requires an exercise that can accept progressive
  // external load through the strength range. Ballistic work is prescribed at
  // roughly 30-60% 1RM and becomes a grinding movement above that, so it is
  // not a vehicle for maximal strength; a bodyweight eccentric classified
  // `robustness` is not either. Both were reaching main-strength slots because
  // the slot asserted a movement pattern and nothing about intent.
  //
  // The catalogue already carries the distinction, so this reads it rather
  // than adding a taxonomy: every main-strength pattern retains 2-6 eligible
  // strength-category options, so no slot is stranded by this rule.
  // See performance/docs/gate-2-professional-decisions.md, Q1.
  if (blockType === 'main_strength') return category === 'strength';

  if (!PREPARATION_CATEGORIES.includes(category)) return true;
  return isPreparationBlock(blockType);
}

/**
 * The selection decision, in full: what was admissible, what was ranked, what
 * won, and whether anything tied with it.
 *
 * `selectForSlot` is a thin wrapper over this, so an explanation of a selection
 * cannot drift from the selection itself — there is one code path, and the
 * winner the trace reports IS the winner generation used.
 *
 * The block-type filter is reported rather than merely applied. It removes
 * candidates silently otherwise, and "a warm-up drill was not eligible for a
 * main-strength slot" is exactly the kind of thing a coach asks about.
 */
export function explainSelection(eligible, slot) {
  const all = eligible || [];
  const blockType = slot?.blockType || null;
  // Filtered BEFORE ranking: a preparation exercise must not merely score
  // lower for a working slot, it must not be a candidate for one.
  const admissible = blockType ? all.filter((ex) => isCategoryAllowedInBlock(ex, blockType)) : all;
  const blockedByBlockType = blockType ? all.filter((ex) => !isCategoryAllowedInBlock(ex, blockType)) : [];
  const ranked = rankExercises(admissible, slot);
  const selected = ranked.length ? ranked[0] : null;
  // A tie is only a tie if it could have changed the outcome: same score as the
  // winner. Ranking already sorts by slug within a score, so the winner is
  // deterministic — this records that the choice RESTED on that rule.
  const tiedWithWinner = selected ? ranked.filter((r) => r.score === selected.score) : [];
  return {
    selected,
    ranked,
    candidatesConsidered: admissible.length,
    blockedByBlockType,
    tiedWithWinner,
    // The final deterministic tie-break, stated rather than implied.
    tieBreak: tiedWithWinner.length > 1 ? 'slug_alphabetical' : null,
  };
}

/** Top pick for a slot, or null with a coverage gap for the caller to flag. */
export function selectForSlot(eligible, slot) {
  return explainSelection(eligible, slot).selected;
}
