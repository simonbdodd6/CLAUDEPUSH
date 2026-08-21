// CoachEasier Performance — load representation & baselines (SC6).
//
// Typed loads (a bare 60 never silently means kg), deterministic estimated
// 1RM, initial-load resolution without ever requiring a tested max, and
// real-world equipment increments. The engine NEVER fabricates a kilogram
// number: when evidence is insufficient it prescribes effort-based targets
// or requests manual selection.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import {
  DEFAULT_E1RM_FORMULA, E1RM_FORMULAS, EQUIPMENT_INCREMENTS,
  LOAD_CONFIDENCE, LOAD_EVIDENCE_SOURCES, LOAD_TYPES, progressionReason,
} from '../types/progression.js';

// ── Typed loads ─────────────────────────────────────────────────────────────

/**
 * Build a typed load. `value` semantics depend on `type`.
 *
 * IMPLEMENT CONVENTION (hand-held loads): `value` is PER IMPLEMENT — the
 * number written on the dumbbell/kettlebell, how athletes naturally log
 * it. `implements` records how many are used (pair = 2) and `per` makes
 * the convention explicit on the data. totalExternalLoad() derives the
 * combined figure; progression bounds and equipment increments apply to
 * the per-implement value the athlete actually changes. "Two 20 kg
 * dumbbells" is therefore {value: 20, implements: 2}, never an ambiguous
 * 40 stored somewhere else.
 */
export function makeLoad(type, value = null, { of = null, per = 'implement', implements: implementCount = 1 } = {}) {
  if (!LOAD_TYPES.includes(type)) throw new Error(`bad_load_type:${type}`);
  if (per !== 'implement' && per !== 'total') throw new Error(`bad_load_per:${per}`);
  return {
    type,
    value: value === null ? null : Number(value),
    of, // reference for percentage loads (e.g. 'e1rm:epley_v1') — never resolved silently
    per,
    implements: Number.isInteger(implementCount) && implementCount >= 1 ? implementCount : 1,
  };
}

/**
 * Human display for a typed load (SC7 Part 10). Never an ambiguous bare
 * number: implements, bodyweight, stacks, bands and percentage references
 * are always explicit.
 */
export function formatLoad(load) {
  if (!load || load.type === 'unknown' || (load.value === null && load.type !== 'bodyweight')) return 'Choose load';
  switch (load.type) {
    case 'kg':
    case 'lb': {
      const unit = load.type;
      return (load.implements || 1) > 1 ? `${load.value} ${unit} each` : `${load.value} ${unit}`;
    }
    case 'bodyweight': return 'Bodyweight';
    case 'bodyweight_plus_kg': return `Bodyweight + ${load.value} kg`;
    case 'assistance_kg': return `Assisted −${load.value} kg`;
    case 'machine_stack': return `Stack ${load.value}`;
    case 'band_level': return `Band level ${load.value}`;
    case 'percentage': return `${load.value}% of ${load.of ? String(load.of).replace('e1rm:', 'estimated 1RM (') + (String(load.of).startsWith('e1rm:') ? ')' : '') : 'reference'}`;
    default: return 'Choose load';
  }
}

/** Combined external load across implements — derived, never authoritative. */
export function totalExternalLoad(load) {
  if (!load || !Number.isFinite(load.value)) return null;
  if (load.type !== 'kg' && load.type !== 'lb' && load.type !== 'bodyweight_plus_kg') return null;
  if (load.per === 'total') return load.value;
  return load.value * (load.implements || 1);
}

export function validateLoad(load) {
  const errors = [];
  if (!load || typeof load !== 'object') return { ok: false, errors: ['not_a_load'] };
  if (!LOAD_TYPES.includes(load.type)) errors.push('bad_load_type');
  if (load.type !== 'bodyweight' && load.type !== 'unknown') {
    if (load.value !== null && (!Number.isFinite(load.value) || load.value < 0)) errors.push('bad_load_value');
  }
  if (load.type === 'percentage' && (load.value > 100 || !load.of)) errors.push('bad_percentage');
  if (load.implements !== undefined && (!Number.isInteger(load.implements) || load.implements < 1)) errors.push('bad_implements');
  if (load.per !== undefined && load.per !== 'implement' && load.per !== 'total') errors.push('bad_per');
  return { ok: errors.length === 0, errors };
}

export function loadUnit(load) {
  return { kg: 'kg', lb: 'lb', percentage: '%', bodyweight: 'bw', bodyweight_plus_kg: 'kg', assistance_kg: 'kg', machine_stack: 'stack', band_level: 'level', unknown: '' }[load?.type] || '';
}

// ── Estimated 1RM — PROVISIONAL_REQUIRES_SNC_REVIEW ─────────────────────────

/**
 * Deterministic estimated 1RM. Never a tested max: the result is labelled
 * 'estimated', preserves its formula version and inputs, and exposes
 * confidence. Rep counts outside the formula's range are rejected.
 * @returns {{ok:true, value:number, formula:string, source:'estimated',
 *            confidence:string, inputs:{loadKg:number,reps:number}, reason:object}
 *          |{ok:false, error:string}}
 */
export function estimateOneRepMax({ loadKg, reps, formula = DEFAULT_E1RM_FORMULA }) {
  const def = E1RM_FORMULAS[formula];
  if (!def) return { ok: false, error: `unknown_formula:${formula}` };
  if (!Number.isFinite(loadKg) || loadKg <= 0) return { ok: false, error: 'bad_load' };
  if (!Number.isInteger(reps) || reps < def.minReps || reps > def.maxReps) {
    return { ok: false, error: `reps_out_of_range:${reps}` };
  }
  const value = Math.round(loadKg * (1 + reps / 30) * 10) / 10;
  const confidence = reps <= 5 ? 'medium' : 'low'; // estimates are never 'high'
  return {
    ok: true, value, formula, source: 'estimated', confidence,
    inputs: { loadKg, reps },
    reason: progressionReason('e1rm_used', { formula, reps }),
  };
}

// ── Initial-load resolution (Part 5) — no 1RM ever required ─────────────────

const SOURCE_CONFIDENCE = {
  recent_completed_set: 'high',
  coach_entered_working_load: 'high',
  athlete_reported_recent_load: 'medium',
  historical_session: 'medium',
  estimated_1rm: 'medium',
  submaximal_rep_test: 'medium',
  training_history: 'low',
  unknown: 'none',
};

/**
 * Resolve a starting prescription from whatever evidence exists.
 * Evidence: [{source, load?: typed load, e1rm?: estimateOneRepMax result}]
 * Strongest usable source wins deterministically (list order above breaks
 * ties). Insufficient confidence → effort-based targets or manual
 * selection, with flags. Never invents a number.
 * @returns {{strategy:'known_load'|'e1rm_percentage'|'effort_based'|'manual_required',
 *            load:object|null, confidence:string, reasons:Array, flags:string[]}}
 */
export function resolveInitialLoad(evidence = []) {
  const ranked = [...evidence]
    .filter((e) => LOAD_EVIDENCE_SOURCES.includes(e.source))
    .sort((a, b) => LOAD_EVIDENCE_SOURCES.indexOf(a.source) - LOAD_EVIDENCE_SOURCES.indexOf(b.source));

  for (const e of ranked) {
    const conf = SOURCE_CONFIDENCE[e.source];
    if (conf === 'high' || conf === 'medium') {
      if (e.load && validateLoad(e.load).ok && e.load.value !== null) {
        return { strategy: 'known_load', load: e.load, confidence: conf, reasons: [], flags: conf === 'medium' ? ['load_confidence_low'] : [] };
      }
      if (e.source === 'estimated_1rm' && e.e1rm?.ok) {
        return {
          strategy: 'e1rm_percentage',
          load: makeLoad('percentage', null, { of: `e1rm:${e.e1rm.formula}` }),
          confidence: e.e1rm.confidence,
          reasons: [e.e1rm.reason],
          flags: ['load_confidence_low'],
        };
      }
    }
  }
  // Low/none confidence: effort-based first; manual when literally nothing.
  const anyLow = ranked.some((e) => SOURCE_CONFIDENCE[e.source] === 'low');
  if (anyLow) {
    return {
      strategy: 'effort_based', load: null, confidence: 'low',
      reasons: [progressionReason('effort_based_start', {})],
      flags: ['load_confidence_low'],
    };
  }
  return {
    strategy: 'manual_required', load: null, confidence: 'none',
    reasons: [progressionReason('manual_load', {})],
    flags: ['manual_load_selection_required', 'load_confidence_low'],
  };
}

// ── Equipment increments (Part 12) ──────────────────────────────────────────

/** Smallest realistic increment for an equipment context; null = ordinal/none. */
export function equipmentIncrement(equipmentKind) {
  return EQUIPMENT_INCREMENTS[equipmentKind] ?? null;
}

/** Round a kg value DOWN onto the equipment's achievable grid. */
export function roundToIncrement(valueKg, equipmentKind) {
  const inc = equipmentIncrement(equipmentKind);
  if (!inc) return valueKg;
  return Math.floor((valueKg + 1e-9) / inc) * inc;
}

/**
 * The smallest achievable load increase for this equipment, or null when
 * load-based progression is not how this context progresses (bands,
 * bodyweight → reps/tempo/leverage instead).
 */
export function smallestAchievableIncrease(equipmentKind) {
  return equipmentIncrement(equipmentKind);
}
