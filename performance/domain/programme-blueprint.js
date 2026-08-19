// CoachEasier Performance — programme blueprint generation (SC5).
//
// Assembles every deterministic rule into a PROGRAMME BLUEPRINT: the
// structured, explainable, auditable decision set that SC6+ will turn into
// progressive prescriptions. A blueprint contains NO kilograms, NO
// percentages resolved against maxima, NO week-to-week progression and NO
// deloads — volume/intensity are categories only.
//
// Deterministic by construction: no clock, no randomness, no AI. The same
// input object always produces a byte-equivalent blueprint.
//
// Pure module: no DOM, no fetch, no localStorage.

import { ENGINE_VERSION, flagDef, reason } from '../types/coaching.js';
import { resolveDevelopmentContext } from './development-context.js';
import { adjustDemandsForAthlete, getPositionDemands, topQualities } from './position-demands.js';
import {
  ARCHETYPE_PLANS, decideDose, decideFrequency, decideMatchWeekPlacement,
  decideSessionArchetypes, evaluatePatternCoverage, patternRequirements,
} from './coaching-rules.js';
import { CONSERVATIVE_EQUIPMENT, complexityCeiling, partitionEligibility, selectForSlot } from './exercise-selection.js';

// ── Engine input (Part 17: required vs optional) ────────────────────────────
//
// REQUIRED (engine refuses/blocks without them):
//   - availableDays (empty → blocking insufficient_training_days)
// OPTIONAL with conservative fallbacks:
//   - ageBand/dateOfBirth/teamCategory → context 'unknown' + review flag
//   - experience → 'beginner'
//   - equipment → conservative bodyweight assumption + flag
//   - restrictions info → restrictions_unknown flag (never assumed clear)
//   - goals → position/phase priors only
//   - position, phase, techConfidence, supervision → safe defaults
// NEVER REQUIRED: strength numbers, 1RM data (structural decisions only).

/** Build a normalised engine input from an SC2 athlete profile. */
export function engineInputFromProfile(profile, { teamCategory = null, supervisionAvailable = false, matchCount = undefined } = {}) {
  const p = profile || {};
  return {
    ageBand: p.personal?.ageBand ?? null,
    dateOfBirth: p.personal?.dateOfBirth ?? null,
    teamCategory,
    playingLevel: p.rugby?.playingLevel ?? null,
    position: p.rugby?.primaryPosition ?? null,
    phase: p.rugby?.seasonPhase && p.rugby.seasonPhase !== 'unknown' ? p.rugby.seasonPhase : 'in_season',
    experience: p.training?.experience && p.training.experience !== 'unknown' ? p.training.experience : 'beginner',
    techConfidence: p.training?.techConfidence ?? null,
    goals: (p.goals || []).map((g) => ({ type: g.type, importance: g.importance ?? 3 })),
    equipment: (p.equipment?.locations || []).length ? { locations: p.equipment.locations, items: p.equipment.items || [] } : null,
    availableDays: p.schedule?.availableDays || [],
    rugbyDays: p.schedule?.rugbyDays || [],
    matchDay: p.schedule?.matchDay ?? null,
    matchCount,
    maxSessionMinutes: p.schedule?.maxSessionMinutes ?? p.training?.preferredSessionMinutes ?? null,
    restrictionTags: p.health?.movementsToAvoid?.length || p.coachRestrictions?.length ? collectRestrictionTags(p) : [],
    restrictionsKnown: p.pain?.present !== null && p.pain?.present !== undefined,
    hasActiveRestriction: p.pain?.trainingRestricted === true || (p.coachRestrictions || []).length > 0,
    profileComplete: !!(p.rugby?.primaryPosition && p.training?.experience),
    supervisionAvailable,
  };
}

function collectRestrictionTags(p) {
  // Coach restrictions and staff-entered movement guidance surface as SC3
  // contraindication-tag exclusions where they match; free-text restrictions
  // surface as review flags instead of silent interpretation.
  const tags = [];
  if (p.pain?.trainingRestricted === true) tags.push('acute_pain_reported');
  return tags;
}

// ── Blueprint generation ────────────────────────────────────────────────────

/**
 * Generate a programme blueprint for one training week shape.
 * @param {object} input      normalised engine input (see engineInputFromProfile)
 * @param {{catalogue:Array, collections?:Array}} refs
 * @returns {object} blueprint — structured, explainable, auditable
 */
export function generateBlueprint(input, { catalogue = [] } = {}) {
  const reasons = [];
  const flagSet = new Set(['beta_rules_provisional']);

  // 1. Development context (conservative, deterministic).
  const dev = resolveDevelopmentContext({
    ageBand: input.ageBand, dateOfBirth: input.dateOfBirth, teamCategory: input.teamCategory,
  });
  dev.flags.forEach((f) => flagSet.add(f));
  reasons.push(...dev.reasons);

  // 2. Fail-safe input handling.
  if (!input.equipment) flagSet.add('equipment_unknown');
  if (!input.restrictionsKnown) flagSet.add('restrictions_unknown');
  if (!input.profileComplete) flagSet.add('profile_incomplete');
  if (input.hasActiveRestriction) flagSet.add('medical_restriction_review');

  // 3. Frequency.
  const goalsOrdered = [...(input.goals || [])].sort((a, b) => (b.importance || 0) - (a.importance || 0));
  const primaryGoal = goalsOrdered[0]?.type || null;
  const goalTypes = goalsOrdered.map((g) => g.type);
  if (goalTypes.length > 1 && conflictingGoals(goalTypes)) flagSet.add('goal_conflict');

  const freq = decideFrequency({
    availableDays: input.availableDays, rugbyDays: input.rugbyDays, matchDay: input.matchDay,
    matchCount: input.matchCount, phase: input.phase, experience: input.experience, context: dev.context,
  });
  freq.flags.forEach((f) => flagSet.add(f));
  reasons.push(...freq.reasons);

  if (freq.frequency === 0) {
    return finalize({
      developmentContext: dev, frequency: 0, sessions: [], matchWeek: { placements: [] },
      qualityPriorities: [], patternPlan: { required: [], recommended: [] },
      coverage: { covered: [], missing: [] }, dose: { volume: null, intensity: null },
      optionalWork: false, reasons, flagSet, input,
    });
  }

  // 4. Quality priorities: position prior + athlete goals.
  const baseDemands = getPositionDemands(input.position);
  const { demands, boosted } = adjustDemandsForAthlete(baseDemands, input.goals || []);
  const qualityPriorities = topQualities(demands, 6);

  // 5. Dose categories — phase baseline constrained by training age,
  // development context and schedule congestion (see decideDose pipeline).
  const rugbyLoad = (input.rugbyDays?.length || 0) + (input.matchCount ?? (input.matchDay ? 1 : 0));
  const dose = decideDose({ phase: input.phase, experience: input.experience, context: dev.context, goal: primaryGoal, rugbyLoad });
  dose.flags.forEach((f) => flagSet.add(f));
  reasons.push(...dose.reasons);

  // 6. Session archetypes.
  const arch = decideSessionArchetypes({ frequency: freq.frequency, phase: input.phase, goal: primaryGoal, context: dev.context });
  reasons.push(...arch.reasons);

  // 7. Pattern requirements for the week.
  const patternPlan = patternRequirements({
    frequency: freq.frequency, goals: goalTypes, position: input.position,
    context: dev.context, supervisionAvailable: input.supervisionAvailable,
  });
  reasons.push(...patternPlan.reasons);

  // 8. Eligibility (safety first), then per-slot ranking and selection.
  const { eligible, excluded } = partitionEligibility(catalogue, {
    context: dev.context, experience: input.experience, equipment: input.equipment,
    supervisionAvailable: input.supervisionAvailable, restrictionTags: input.restrictionTags,
  });
  if (!input.equipment && eligible.length) flagSet.add('equipment_unknown');
  if (input.equipment && eligible.length < 10) flagSet.add('insufficient_equipment');

  const level = complexityCeiling({ context: dev.context, experience: input.experience });
  const sessions = [];
  const selectedAll = [];
  arch.archetypes.forEach((archetype, i) => {
    const plan = ARCHETYPE_PLANS[archetype] || [];
    const blocks = plan.map((blockPlan) => {
      const picks = [];
      const unresolved = [];
      for (const slot of blockPlan.slots || []) {
        const pick = selectForSlot(eligible, {
          pattern: slot.pattern, quality: slot.quality || null, goals: goalTypes,
          position: input.position, phase: input.phase, level,
        });
        if (pick) {
          picks.push({ exerciseId: pick.exercise.id, name: pick.exercise.name, score: pick.score, reasons: pick.reasons });
          selectedAll.push(pick.exercise);
        } else {
          // Correct fallback: leave the slot unresolved with a reason —
          // never invent an exercise or relax a safety constraint.
          unresolved.push({ pattern: slot.pattern, reason: reason('slot_unfilled', { pattern: slot.pattern }) });
        }
      }
      return {
        blockType: blockPlan.type,
        collectionRef: blockPlan.collection || null,
        exercises: picks,
        unresolvedSlots: unresolved,
      };
    }).filter((b) => b.exercises.length || b.collectionRef || b.unresolvedSlots.length);
    sessions.push({ slot: i + 1, archetype, blocks });
  });

  // 9. Weekly coverage check.
  const coverage = evaluatePatternCoverage(patternPlan, selectedAll);
  if (coverage.missing.length) flagSet.add('pattern_coverage_gap');

  // 10. Match-week placement constraints.
  const matchWeek = decideMatchWeekPlacement({ matchDay: input.matchDay });
  reasons.push(...matchWeek.reasons);

  // 11. Optional work: only when spare days exist beyond the plan + rugby.
  const busy = freq.frequency + (input.rugbyDays?.length || 0) + (input.matchDay ? 1 : 0);
  const optionalWork = busy < 6 && input.phase !== 'taper' && input.phase !== 'peak';
  reasons.push(reason('optional_work', { enabled: optionalWork }));

  // Youth high-skill surfacing: supervised high-skill picks need review.
  if (dev.youth && selectedAll.some((ex) => ex.safety?.highSkill)) flagSet.add('youth_high_skill_review');
  if (dev.youth && selectedAll.some((ex) => ex.safety?.highLoad)) flagSet.add('youth_high_load_review');

  return finalize({
    developmentContext: dev, frequency: freq.frequency, sessions, matchWeek,
    qualityPriorities, boostedQualities: boosted, patternPlan, coverage, dose,
    optionalWork, reasons, flagSet, input, excludedCount: excluded.length,
  });
}

function conflictingGoals(goalTypes) {
  const pairs = [['body_mass_gain', 'body_fat_reduction'], ['max_strength', 'conditioning']];
  return pairs.some(([a, b]) => goalTypes.includes(a) && goalTypes.includes(b));
}

function finalize({ developmentContext, frequency, sessions, matchWeek, qualityPriorities, boostedQualities = [], patternPlan, coverage, dose, optionalWork, reasons, flagSet, input, excludedCount = 0 }) {
  const flags = [...flagSet].map((id) => {
    const def = flagDef(id);
    return { id, severity: def?.severity || 'warning', label: def?.label || id };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const requiresReview = flags.some((f) => f.severity === 'requires_review' || f.severity === 'blocking');

  return {
    kind: 'programme_blueprint',
    engineVersion: ENGINE_VERSION,
    provisional: true,
    input: {
      context: developmentContext.context,
      phase: input.phase,
      experience: input.experience,
      position: input.position,
      goals: (input.goals || []).map((g) => g.type),
      availableDays: [...(input.availableDays || [])],
      matchDay: input.matchDay ?? null,
    },
    developmentContext: {
      context: developmentContext.context,
      youth: developmentContext.youth,
      safeguardsActive: developmentContext.safeguardsActive,
      source: developmentContext.source,
      conflicts: developmentContext.conflicts,
    },
    frequency,
    volumeCategory: dose.volume,
    intensityCategory: dose.intensity,
    qualityPriorities,
    boostedQualities,
    patternPlan: { required: patternPlan.required, recommended: patternPlan.recommended },
    patternCoverage: coverage,
    sessions,
    matchWeek: { placements: matchWeek.placements },
    optionalWork,
    excludedCount,
    reasons,
    flags,
    requiresReview,
  };
}

// ── Blueprint validation ────────────────────────────────────────────────────

const FORBIDDEN_BLUEPRINT_KEYS = ['kg', 'loadKg', 'percentage1rm', 'progression', 'deload', 'weekToWeek'];

/** Structural validation + scope guard: a blueprint may not carry loads. */
export function validateBlueprint(bp) {
  const errors = [];
  if (!bp || bp.kind !== 'programme_blueprint') return { ok: false, errors: ['not_a_blueprint'] };
  if (!Number.isInteger(bp.frequency) || bp.frequency < 0) errors.push('bad_frequency');
  if (bp.frequency !== bp.sessions.length) errors.push('session_count_mismatch');
  if (bp.frequency > 0 && !bp.volumeCategory) errors.push('missing_volume_category');
  if (typeof bp.requiresReview !== 'boolean') errors.push('missing_review_state');
  const json = JSON.stringify(bp).toLowerCase();
  for (const key of FORBIDDEN_BLUEPRINT_KEYS) {
    if (json.includes(`"${key.toLowerCase()}"`)) errors.push(`forbidden_key:${key}`);
  }
  for (const s of bp.sessions || []) {
    if (!s.archetype) errors.push('session_missing_archetype');
    for (const b of s.blocks || []) {
      for (const e of b.exercises || []) {
        if (!e.exerciseId || !Array.isArray(e.reasons)) errors.push('exercise_pick_incomplete');
      }
      for (const u of b.unresolvedSlots || []) {
        if (!u.pattern || !u.reason?.code) errors.push('unresolved_slot_without_reason');
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
