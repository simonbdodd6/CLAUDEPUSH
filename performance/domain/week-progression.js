// CoachEasier Performance — week-to-week progression wave (SC9.1).
//
// THE PROBLEM THIS SOLVES
// A generated "4-week programme" was one week emitted four times. Every week
// carried identical sets, reps and effort, so an athlete in week 4 trained
// exactly what they trained in week 1. This module supplies the missing
// concept: how week N differs from week N-1.
//
// WHY THIS IS NOT SC6
// SC6 (progression-rules.decideProgression) answers a different question:
// "given what this athlete ACTUALLY DID, have they earned a step up?" It
// requires history, readiness, personal records and exposure counts. At
// authoring time none of that exists — the programme has not been assigned,
// let alone performed — so SC6 called here would return "insufficient
// evidence, maintain" for every week and reproduce the identical-weeks bug it
// was asked to fix.
//
// The two mechanisms are complementary and both are needed:
//
//   THIS MODULE   the PLANNED wave, known at publication, evidence-free.
//                 A coach reviews all of it before the athlete sees any.
//   SC6           the EARNED adjustment, computed after a block has been
//                 performed, from real logged sets. Wiring that into
//                 authoring is a later build, not this one.
//
// What this module does reuse from SC6 is `selectProgressionMethod`, so both
// mechanisms agree about which dimension of a given prescription is the one
// that may legitimately move.
//
// SAFETY
// The wave never touches load. It moves sets, reps, effort and work duration
// only — the dimensions the athlete can act on without anyone inventing a
// kilogram they have never lifted. Effort ceilings come from development
// context and training age, and are ceilings: a wave may approach them and
// never exceed them.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import { selectProgressionMethod } from './progression-rules.js';

export const WEEK_PROGRESSION_VERSION = '2026.08-sc91-beta.1';

/**
 * PROVISIONAL. These wave shapes are constructed from established progression
 * principles (volume-led accumulation, intensity-led peaking, in-season
 * maintenance at low volume and high intensity) and are inspectable by design.
 * They have NOT been reviewed by a qualified S&C coach and must keep the
 * provisional marker wherever they surface.
 */
export const WAVE_STATUS = 'provisional';

/** What a week is FOR. Surfaces on the week node and in its objective. */
export const WEEK_ROLES = ['introduce', 'build', 'peak', 'deload'];

/**
 * A step is a delta applied to the baseline dose, never an absolute
 * prescription — the baseline stays the single source of the starting numbers.
 *
 *   sets    whole sets added or removed
 *   reps    whole reps added or removed (per set)
 *   effort  RPE points added or removed; RIR moves the opposite way
 *   work    proportional change to duration/distance work, as a multiplier
 *
 *   repsIfCapped  what to add to reps INSTEAD of effort when the athlete's
 *                 ceiling blocks the effort step. Without this a youth block
 *                 collapses back into identical weeks: the ceiling clamps
 *                 every effort increase, sets are capped, and nothing moves.
 *                 Progressing quality reps rather than proximity to failure is
 *                 also the correct direction for a young or novice athlete.
 */
/**
 * The longest run of consecutive build weeks the wave will emit before it
 * forces a discharge. Three is both sound programming and the point at which
 * half-point effort steps stop being able to separate one week from the next.
 */
// GATE 2 — max_build_run_conflict. This was declared as 3 and read as an
// enforced cap, but the wave emits runs of 4 at the tail of a 6- or 10-week
// block: an internal deload is suppressed when it would land adjacent to the
// terminal one, which is correct — two consecutive deloads waste a week.
//
// The literature does not establish an optimal accumulation length before a
// discharge, and a mid-programme deload has been shown to impair lower-body
// strength in at least one controlled trial, so there is no evidential basis
// for forcing a deload the structure does not have room for. The contradiction
// is therefore resolved by making the declaration truthful rather than by
// inventing a periodisation rule: this is the run length at which the wave
// PREFERS to discharge, not a ceiling it guarantees. Intensity remains bounded
// by the athlete's effort ceiling regardless of run length.
// See performance/docs/gate-2-professional-decisions.md, Q7.
const PREFERRED_BUILD_RUN = 3;

const step = (role, sets = 0, reps = 0, effort = 0, work = 1, repsIfCapped = 0) =>
  ({ role, sets, reps, effort, work, repsIfCapped });

/**
 * Wave shapes by phase. Each is a function of block length so a 3-week block
 * is not simply a truncated 4-week block with its deload chopped off.
 */
const WAVES = {
  // Volume-led. Add work, then discharge it.
  accumulation: (n) => {
    if (n === 1) return [step('introduce')];
    if (n === 2) return [step('introduce'), step('build', 0, 0, 1, 1.1, 1)];
    if (n === 3) return [step('introduce'), step('build', 0, 0, 1, 1.1, 1), step('deload', -1, -1, -1, 0.8)];
    // 4+: discharge on the last week, and every fourth week in a long block.
    // A six-week-plus block with no internal deload is not a wave, it is a
    // grind — and it also forces build runs long enough that the half-point
    // effort steps run out of room and weeks start repeating.
    const out = [];
    let run = 0;                       // build ordinal, reset by each deload
    for (let i = 1; i <= n; i++) {
      // Discharge on the last week, and whenever three consecutive build weeks
      // have accumulated. Capping the run is what keeps the half-point effort
      // steps distinguishable: a fourth consecutive build has nowhere to go.
      if (i === n || (run >= PREFERRED_BUILD_RUN && n - i >= 2)) {
        out.push(step('deload', -1, -1, -1, 0.8)); run = 0; continue;
      }
      if (i === 1) { out.push(step('introduce')); continue; }
      run += 1;
      // Volume-led: sets step up once past the midpoint of the whole block.
      const addSet = i >= Math.ceil(n / 2) + 1 ? 1 : 0;
      out.push(step('build', addSet, 0, 0.5 * run, 1 + 0.15 * run, run));
    }
    return out;
  },

  // Intensity-led. Work gets harder and shorter.
  intensification: (n) => {
    if (n === 1) return [step('introduce', 0, 0, 1)];
    if (n === 2) return [step('build', 0, 0, 1, 1.05), step('peak', 0, -1, 2, 0.9, 1)];
    if (n === 3) return [step('build', 0, 0, 1, 1.05), step('peak', 0, -1, 2, 0.9, 1), step('deload', -1, -1, -1, 0.8)];
    // 4+: as with accumulation, a long block gets an internal discharge and the
    // effort ordinal restarts after it, so peak weeks stay distinguishable.
    const out = [];
    let run = 0;
    for (let i = 1; i <= n; i++) {
      const scheduled = n >= 6 && i % 4 === 0 && i < n - 1;
      if (i === n || scheduled) { out.push(step('deload', -1, -1, -1, 0.8)); run = 0; continue; }
      if (i === 1) { out.push(step('build', 0, 0, 1, 1.05)); continue; }
      run += 1;
      out.push(step('peak', i >= n - 1 ? 1 : 0, -1, 1 + 0.5 * run, Math.max(0.7, 1 - 0.05 * run), run));
    }
    return out;
  },

  // In-season. Low volume, high intensity, frequent discharge — the sport is
  // already supplying the volume.
  maintain: (n) => {
    if (n === 1) return [step('introduce')];
    if (n === 2) return [step('introduce'), step('build', 0, 0, 1, 1.05, 1)];
    const out = [];
    let built = 0;
    for (let i = 1; i <= n; i++) {
      // Always discharge on the last week, and every third week — but never
      // two deloads back to back, which is a rest block, not a wave.
      const scheduled = i % 3 === 0 && i < n - 1;
      if (i === n || scheduled) { out.push(step('deload', -1, 0, -1, 0.85)); built = 0; continue; }
      if (i === 1) { out.push(step('introduce')); continue; }
      // Volume stays low in-season — the sport supplies it — so intensity is
      // the dimension that creeps, in half points. The ordinal restarts after
      // each discharge, which also bounds the rep fallback for capped athletes.
      built += 1;
      out.push(step('build', 0, 0, Math.min(1.5, 0.5 * built), 1 + 0.15 * built, built));
    }
    return out;
  },

  // Shed volume, hold sharpness.
  //
  // A taper is short by nature: three weeks of shedding is already the outer
  // edge, and beyond that there is nothing left to remove without the weeks
  // becoming identical one-set stubs. So a long taper PHASE is read for what it
  // actually is — maintenance work, then a taper at the end of it.
  taper: (n) => {
    const taperStart = n - Math.min(3, Math.max(0, n - 1)) + 1;
    const lead = taperStart - 1;
    // Weeks before the taper proper are maintenance, so they are generated by
    // the maintenance wave rather than by a second, weaker copy of it — that
    // keeps their discharge weeks and ordinal resets consistent.
    const out = lead > 0 ? WAVES.maintain(lead) : [];
    for (let i = taperStart; i <= n; i++) {
      // Volume sheds first, then reps, so consecutive weeks stay distinct even
      // once sets have bottomed out at one. Effort is deliberately held.
      const t = i - taperStart + 1;
      out.push(step('deload', -Math.min(t, 2), t >= 2 ? -(t - 1) : 0, 0, Math.max(0.4, 1 - 0.2 * t)));
    }
    return out;
  },

  // Rebuilding general capacity. Effort creeps; volume does not.
  reintroduce: (n) => {
    const out = [];
    let built = 0;
    for (let i = 1; i <= n; i++) {
      if ((i === n && n >= 3) || (built >= PREFERRED_BUILD_RUN && n - i >= 2)) {
        out.push(step('deload', 0, 0, -1, 0.85)); built = 0; continue;
      }
      if (i === 1) { out.push(step('introduce')); continue; }
      built += 1;
      out.push(step('build', 0, 0, 0.5 * built, 1 + 0.15 * built, built));
    }
    return out;
  },
};

/** SC4 phase type → wave shape. */
const PHASE_WAVE = {
  off_season: 'accumulation',
  pre_season: 'accumulation',
  in_season: 'maintain',
  peak: 'intensification',
  taper: 'taper',
  return_to_general_training: 'reintroduce',
};

/**
 * Ceilings, not targets.
 *
 * Training age is the PRIMARY discriminator — a senior who has never lifted
 * gets a novice's ceiling, not an adult's. Development context then applies a
 * second ceiling on top, so a youth athlete can never be lifted above the
 * youth limit by having a high training age. Whichever is lower wins.
 */
const EXPERIENCE_CEILING = {
  new:          { effort: 6.5, sets: 3, minReps: 5 },
  beginner:     { effort: 7.5, sets: 4, minReps: 4 },
  intermediate: { effort: 8.5, sets: 5, minReps: 3 },
  advanced:     { effort: 9,   sets: 5, minReps: 2 },
};

const CONTEXT_CEILING = {
  // GATE 2 — youth_accumulated_volume. The rep FLOOR for youth is the bottom
  // of the NSCA's 6-15 band, so a deload cannot strip youth resistance work
  // below the range its own position stand recommends. Quality-dosed power
  // work is unaffected: its reps never move, so this floor never reaches it.
  // See performance/docs/gate-2-professional-decisions.md, Q6.
  youth_u16: { effort: 6.5, sets: 3, minReps: 6 },
  youth_u18: { effort: 8,   sets: 4, minReps: 6 },
  unknown:   { effort: 7.5, sets: 4, minReps: 4 },   // conservative when unresolved
  adult:     { effort: 9,   sets: 5, minReps: 2 },
};

/** The binding ceiling is the tighter of training age and development context. */
export function ceilingFor({ experience = 'beginner', context = 'unknown' } = {}) {
  const e = EXPERIENCE_CEILING[experience] || EXPERIENCE_CEILING.beginner;
  const c = CONTEXT_CEILING[context] || CONTEXT_CEILING.unknown;
  return {
    effort: Math.min(e.effort, c.effort),
    sets: Math.min(e.sets, c.sets),
    minReps: Math.max(e.minReps, c.minReps),
    boundBy: e.effort <= c.effort ? 'training_age' : 'development_context',
  };
}

/**
 * The wave for one block, as an array of steps — one per week, in order.
 * Exposed so a coach-facing screen can show the whole shape before publishing.
 */
export function waveForBlock({ phase = 'in_season', totalWeeks = 4 } = {}) {
  const n = Math.trunc(totalWeeks);
  if (!Number.isFinite(n) || n < 1) throw new Error('bad_total_weeks');
  if (n > 24) throw new Error('block_too_long');
  const shape = PHASE_WAVE[phase] || 'maintain';
  return WAVES[shape](n);
}

/**
 * The progression for ONE week.
 *
 * @param {object} input
 * @param {string} input.phase         SC4 phase type
 * @param {number} input.weekIndex     1-based
 * @param {number} input.totalWeeks    block length
 * @param {object} [input.athlete]     { experience, context } — training age first
 * @returns {{weekIndex, weekRole, phase, waveShape, step, ceiling, reasons, provisional}}
 */
export function getWeekProgression({ phase = 'in_season', weekIndex, totalWeeks = 4, athlete = {} } = {}) {
  const n = Math.trunc(totalWeeks);
  const i = Math.trunc(weekIndex);
  if (!Number.isFinite(i) || i < 1) throw new Error('bad_week_index');
  if (!Number.isFinite(n) || n < 1) throw new Error('bad_total_weeks');
  if (i > n) throw new Error('week_index_out_of_block');

  const wave = waveForBlock({ phase, totalWeeks: n });
  const s = wave[i - 1];
  const ceiling = ceilingFor(athlete);
  const shape = PHASE_WAVE[phase] || 'maintain';

  const reasons = [
    { code: 'wave_shape', detail: `${shape} wave over ${n} week${n === 1 ? '' : 's'}` },
    { code: 'week_role', detail: s.role },
  ];
  if (s.effort > 0) reasons.push({ code: 'effort_step', detail: `+${s.effort} RPE against the starting dose` });
  if (s.sets !== 0) reasons.push({ code: 'volume_step', detail: `${s.sets > 0 ? '+' : ''}${s.sets} set against the starting dose` });
  if (s.role === 'deload') reasons.push({ code: 'planned_deload', detail: 'scheduled discharge week' });
  reasons.push({ code: 'ceiling', detail: `effort capped at RPE ${ceiling.effort} by ${ceiling.boundBy}` });

  return {
    weekIndex: i,
    weekRole: s.role,
    phase,
    waveShape: shape,
    step: { ...s },
    ceiling,
    reasons,
    provisional: true,
    engineVersion: WEEK_PROGRESSION_VERSION,
  };
}

// ── Applying a week's step to a prescription ────────────────────────────────

const round = (v) => Math.round(v * 2) / 2;   // effort moves in half points

/**
 * Apply one week's step to a baseline set-field object.
 *
 * Only fields ALREADY PRESENT are touched — the baseline decided which fields
 * this exercise may carry (from its own declared prescription types), and the
 * wave never adds a dimension the exercise does not support. `load` and
 * `percentage` are never written: this module cannot invent a weight.
 *
 * @param {object} fields    baseline set fields
 * @param {object} progression  result of getWeekProgression
 * @param {object} [opts]    { setCount, method }
 * @returns {{fields, setCount, changed:string[]}}
 */
export function applyWeekProgression(fields, progression, {
  setCount = 3, method = null, repsAreQuality = false,
} = {}) {
  const out = { ...(fields || {}) };
  const { step: s, ceiling } = progression;
  const changed = [];

  // SC6 owns the question of which dimension of a prescription may move. If it
  // says this one may not move at all, the wave holds it — the planned wave and
  // the earned adjustment must not disagree about that.
  if (method === 'maintain_only') {
    return { fields: out, setCount, changed: ['maintain_only'], method };
  }

  // Volume, bounded both ways.
  let sets = Math.max(1, Math.min(ceiling.sets, setCount + s.sets));
  if (sets !== setCount) changed.push('sets');

  // Effort. RPE rises toward the ceiling; RIR is its inverse and falls.
  // `effortBlocked` records that the athlete's ceiling refused the step, so
  // the week can progress a dimension that IS available instead.
  let effortBlocked = false;
  if (out.rpe != null) {
    const wanted = round(out.rpe + s.effort);
    const next = Math.max(5, Math.min(ceiling.effort, wanted));
    if (s.effort > 0 && next < wanted) effortBlocked = true;
    if (next !== out.rpe) { out.rpe = next; changed.push('rpe'); }
  }
  if (out.rir != null) {
    // RIR is the inverse scale, so the athlete's effort ceiling has to be
    // translated into it: an RPE ceiling of 6.5 means never closer than 3.5
    // reps in reserve. Without this an RIR-only prescription escaped the
    // ceiling entirely and a novice could be driven to near-failure.
    const minRir = Math.max(0, round(10 - ceiling.effort));
    const wanted = round(out.rir - s.effort);
    const next = Math.max(minRir, Math.min(5, wanted));
    if (s.effort > 0 && next > wanted) effortBlocked = true;
    if (next !== out.rir) { out.rir = next; changed.push('rir'); }
  }
  // An exercise with no effort target at all is a DIFFERENT case from an
  // athlete who has hit their ceiling: there is nothing to raise, rather than
  // something being refused. Both progress reps instead, but conflating them
  // makes the review screen tell a coach their adult athlete is capped.
  const noEffortTarget = out.rpe == null && out.rir == null && s.effort > 0;

  // Reps, floored by the ceiling's minimum so a deload cannot strip an
  // exercise below a trainable rep count. When effort was blocked, the week's
  // rep fallback applies instead — this is what keeps a youth or novice block
  // from collapsing into identical weeks.
  // When the ceiling refuses the effort step, the rep fallback REPLACES the
  // wave's rep delta rather than adding to it. An intensification week cuts
  // reps to buy intensity; if the intensity cannot be bought, cutting the reps
  // buys nothing and the week collapses onto its predecessor.
  // POWER AND PLYOMETRIC WORK: reps are a quality dose, not a volume dial.
  //
  // Three crisp countermovement jumps IS the prescription. A jump carries no
  // RPE by nature, so the rep fallback below — written for strength work whose
  // effort ceiling blocks the step — would otherwise climb 3 → 4 → 5 → 6 → 7
  // and quietly turn a power exposure into conditioning. It reduced nothing on
  // a deload either: fewer sloppy jumps is not a deload, fewer SETS of crisp
  // ones is. So reps are held in both directions and the volume moves through
  // sets, which the wave already varies.
  const repsDelta = repsAreQuality ? 0
    : (effortBlocked || noEffortTarget) ? (s.repsIfCapped || 0) : s.reps;
  let atFloor = false;
  if (out.reps != null && typeof out.reps === 'number' && repsDelta !== 0) {
    // The floor bounds REDUCTIONS only. Clamping an increase up to the floor
    // would silently rewrite a baseline the coach chose, and would collapse two
    // different weeks onto the same number when the baseline sits below it.
    const raw = out.reps + repsDelta;
    const next = repsDelta < 0 ? Math.max(ceiling.minReps, raw) : raw;
    if (repsDelta < 0 && next > raw) atFloor = true;
    if (next !== out.reps) { out.reps = next; changed.push('reps'); }
  }
  if (effortBlocked) changed.push('effort_capped');
  if (noEffortTarget && !repsAreQuality) changed.push('no_effort_target');
  // Said explicitly, so a week that legitimately repeats is explained rather
  // than looking like a progression failure.
  if (repsAreQuality) changed.push('reps_are_quality_dose');

  // The floor is real, and reporting it is the honest alternative to inventing
  // a difference. An athlete already prescribed the minimum trainable dose has
  // nothing left to shed: a taper week can end up matching the week before it,
  // and the caller is told why rather than shown a manufactured change.
  if (atFloor || (sets === 1 && s.sets < 0)) changed.push('at_minimum_dose');

  // Time- and distance-based work scales proportionally.
  if (s.work !== 1) {
    // Work is prescribed in round units, and on a short effort that rounding
    // can swallow the whole step — 20s at +10% rounds straight back to 20s.
    // When the wave genuinely asked for a change, move one unit in the
    // direction it asked for rather than silently dropping the week's step.
    const scaleWork = (value, unit, floor) => {
      if (s.work === 1) return value;
      const rounded = Math.max(floor, Math.round((value * s.work) / unit) * unit);
      if (rounded !== value) return rounded;
      return s.work > 1 ? value + unit : Math.max(floor, value - unit);
    };
    if (out.durationSec != null) {
      const next = scaleWork(out.durationSec, 5, 10);
      if (next !== out.durationSec) { out.durationSec = next; changed.push('durationSec'); }
      else if (s.work < 1) atFloor = true;
    }
    if (out.distanceM != null) {
      const next = scaleWork(out.distanceM, 10, 10);
      if (next !== out.distanceM) { out.distanceM = next; changed.push('distanceM'); }
      else if (s.work < 1) atFloor = true;
    }
    if (out.holdSec != null) {
      const next = scaleWork(out.holdSec, 5, 5);
      if (next !== out.holdSec) { out.holdSec = next; changed.push('holdSec'); }
      else if (s.work < 1) atFloor = true;
    }
  }

  // Guard: the wave must never author a load. If a baseline carried one, it is
  // the coach's number and passes through untouched — but the wave may not
  // introduce or move it.
  if (fields && fields.load !== undefined) out.load = fields.load;
  if (fields && fields.percentage !== undefined) out.percentage = fields.percentage;

  return { fields: out, setCount: sets, changed, method: method || null };
}

/**
 * Which dimension SC6 considers progressable for this exercise/prescription.
 * Re-exported through this module so authoring and the later evidence-based
 * path agree, rather than each deciding for itself.
 */
export function progressionMethodFor(exercise, fields) {
  return selectProgressionMethod(exercise, {
    rpeTarget: fields?.rpe ?? null,
    rirTarget: fields?.rir ?? null,
    repRange: fields?.reps ?? null,
    reps: typeof fields?.reps === 'number' ? fields.reps : null,
    densityMin: fields?.densityMin ?? null,
    distanceM: fields?.distanceM ?? null,
    durationSec: fields?.durationSec ?? null,
    holdSec: fields?.holdSec ?? null,
    load: fields?.load != null ? { type: 'kg', value: fields.load } : null,
  });
}

/** Human-readable week objective, e.g. "Week 2 of 4 · build". */
export function weekObjective(progression, totalWeeks) {
  const label = { introduce: 'establish the starting dose', build: 'build',
                  peak: 'peak', deload: 'planned deload' }[progression.weekRole] || progression.weekRole;
  return `Week ${progression.weekIndex} of ${totalWeeks} · ${label}`;
}
