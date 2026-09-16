// CoachEasier Performance — SC9.14 training dose projection.
//
// Answers "how much is this athlete actually being asked to do?" from a
// generated programme. It MEASURES; it does not judge. There is no threshold,
// no score and no recommendation anywhere in this module, because every
// question of the form "is that too much?" is a professional S&C judgement
// that this product does not make on a coach's behalf.
//
// THE CENTRAL RULE: dimensions stay separate.
//
// Repetitions, seconds and metres are not interchangeable, and no combined
// "volume score" is produced. Five sets of five, five sets of a twenty-second
// hold and five sets of a thirty-metre carry are all "five sets" and are
// otherwise three different things. Collapsing them would require deciding how
// many reps a metre is worth, which is exactly the kind of invented arithmetic
// this engine refuses to do — the same reason it never invents a kilogram.
//
// Pure: no DOM, no storage, no clock.

/** @typedef {import('../types/programme.js').Programme} Programme */

export const TRAINING_DOSE_VERSION = '2026.08-sc914-beta.1';

/**
 * The measurable dimensions, kept apart on purpose. `sets` is the only one
 * every prescription carries, which is why it is the one used for the
 * by-pattern and by-quality breakdowns — the others are reported alongside it
 * rather than folded into it.
 */
export const DOSE_DIMENSIONS = ['sets', 'reps', 'holdSec', 'distanceM', 'durationSec'];

const PREPARATION_BLOCKS = new Set(['warmup', 'activation', 'mobility', 'cooldown', 'recovery']);

const zero = () => ({ sets: 0, reps: 0, holdSec: 0, distanceM: 0, durationSec: 0 });

const addInto = (target, source) => {
  for (const d of DOSE_DIMENSIONS) target[d] += source[d] || 0;
  return target;
};

const bump = (map, key, source) => {
  if (!key) return;
  if (!map[key]) map[key] = zero();
  addInto(map[key], source);
};

/**
 * Dose for a single prescription.
 *
 * `perSide` doubles the counted work: "3 x 10 per side" is thirty repetitions
 * per limb and sixty in total, and reporting thirty would understate a
 * unilateral session against a bilateral one. Sets are NOT doubled — the
 * athlete still performs three sets, they are simply longer.
 */
export function doseForPrescription(prescription) {
  const out = zero();
  const sets = prescription?.sets || [];
  out.sets = sets.length;
  for (const s of sets) {
    const f = s?.fields || {};
    // A rep range counts at its lower bound: it is the only number the athlete
    // is certain to perform, and inventing the mid-point would overstate dose.
    const reps = typeof f.reps === 'number' ? f.reps
      : (f.reps && typeof f.reps === 'object' && typeof f.reps.min === 'number') ? f.reps.min
        : null;
    const side = f.perSide ? 2 : 1;
    if (Number.isFinite(reps)) out.reps += reps * side;
    if (Number.isFinite(f.holdSec)) out.holdSec += f.holdSec * side;
    if (Number.isFinite(f.distanceM)) out.distanceM += f.distanceM * side;
    if (Number.isFinite(f.durationSec)) out.durationSec += f.durationSec * side;
  }
  return out;
}

/** Effort actually carried by a prescription's sets, and what carries none. */
function effortForPrescription(prescription) {
  const sets = prescription?.sets || [];
  let rpeSets = 0, rpeSum = 0, rpeMax = null, noTarget = 0;
  for (const s of sets) {
    const f = s?.fields || {};
    // RIR is the inverse scale; converting it to RPE here would be a second
    // representation of effort. It is counted separately and left as RIR.
    if (Number.isFinite(f.rpe)) {
      rpeSets += 1; rpeSum += f.rpe;
      rpeMax = rpeMax === null ? f.rpe : Math.max(rpeMax, f.rpe);
    } else if (!Number.isFinite(f.rir)) {
      noTarget += 1;
    }
  }
  return { rpeSets, rpeSum, rpeMax, setsWithoutEffortTarget: noTarget };
}

/**
 * Dose for one session, broken down by the classifications the catalogue
 * already carries. Nothing here is a new taxonomy.
 */
export function doseForSession(session, { catalogue = [] } = {}) {
  const byId = catalogue instanceof Map ? catalogue : new Map(catalogue.map((e) => [e.id, e]));
  const total = zero();
  const working = zero();
  const preparation = zero();
  const byBlockType = {}, byPattern = {}, byQuality = {}, byCategory = {}, byExercise = {};
  let prescriptions = 0, rpeSets = 0, rpeSum = 0, rpeMax = null, setsWithoutEffortTarget = 0;
  const unknownExercises = new Set();

  for (const block of session?.blocks || []) {
    const prep = PREPARATION_BLOCKS.has(block.blockType);
    for (const p of block.prescriptions || []) {
      prescriptions += 1;
      const d = doseForPrescription(p);
      addInto(total, d);
      addInto(prep ? preparation : working, d);
      bump(byBlockType, block.blockType, d);
      bump(byExercise, p.exerciseId, d);

      // Effort is carried by the SET, not by the exercise, so it is accounted
      // before the catalogue lookup. Doing it after meant an exercise missing
      // from the catalogue lost its effort silently while its sets still
      // counted — totals that reconciled while the mean quietly drifted.
      const e = effortForPrescription(p);
      rpeSets += e.rpeSets; rpeSum += e.rpeSum;
      setsWithoutEffortTarget += e.setsWithoutEffortTarget;
      if (e.rpeMax !== null) rpeMax = rpeMax === null ? e.rpeMax : Math.max(rpeMax, e.rpeMax);

      const ex = byId.get(p.exerciseId);
      if (!ex) { unknownExercises.add(p.exerciseId); continue; }
      bump(byPattern, ex.classification?.pattern, d);
      bump(byQuality, ex.classification?.primaryQuality, d);
      bump(byCategory, ex.classification?.category, d);
    }
  }
  return {
    title: session?.title ?? null,
    day: session?.day ?? null,
    estimatedMinutes: session?.estimatedMinutes ?? null,
    prescriptions,
    total, working, preparation,
    byBlockType, byPattern, byQuality, byCategory, byExercise,
    effort: {
      // Set-weighted, because a set is the unit effort is prescribed against.
      // Reported with its denominator so a mean over two sets is not mistaken
      // for a mean over twenty.
      meanRpe: rpeSets ? Math.round((rpeSum / rpeSets) * 100) / 100 : null,
      maxRpe: rpeMax,
      setsWithRpe: rpeSets,
      setsWithoutEffortTarget,
    },
    unknownExercises: [...unknownExercises],
  };
}

/** Dose for one week, plus its sessions. */
export function doseForWeek(week, { catalogue = [] } = {}) {
  const sessions = [];
  for (const day of week?.days || []) {
    for (const s of day.sessions || []) {
      sessions.push({ ...doseForSession(s, { catalogue }), day: day.day ?? s.day ?? null });
    }
  }
  const total = zero(), working = zero(), preparation = zero();
  const byBlockType = {}, byPattern = {}, byQuality = {}, byCategory = {};
  let prescriptions = 0, rpeSets = 0, rpeSum = 0, rpeMax = null, setsWithoutEffortTarget = 0;
  for (const s of sessions) {
    addInto(total, s.total); addInto(working, s.working); addInto(preparation, s.preparation);
    for (const [k, v] of Object.entries(s.byBlockType)) bump(byBlockType, k, v);
    for (const [k, v] of Object.entries(s.byPattern)) bump(byPattern, k, v);
    for (const [k, v] of Object.entries(s.byQuality)) bump(byQuality, k, v);
    for (const [k, v] of Object.entries(s.byCategory)) bump(byCategory, k, v);
    prescriptions += s.prescriptions;
    rpeSets += s.effort.setsWithRpe;
    rpeSum += (s.effort.meanRpe ?? 0) * s.effort.setsWithRpe;
    setsWithoutEffortTarget += s.effort.setsWithoutEffortTarget;
    if (s.effort.maxRpe !== null) rpeMax = rpeMax === null ? s.effort.maxRpe : Math.max(rpeMax, s.effort.maxRpe);
  }
  return {
    weekNumber: week?.weekNumber ?? null,
    weekRole: week?.weekRole ?? null,
    sessionCount: sessions.length,
    prescriptions,
    total, working, preparation,
    byBlockType, byPattern, byQuality, byCategory,
    effort: {
      meanRpe: rpeSets ? Math.round((rpeSum / rpeSets) * 100) / 100 : null,
      maxRpe: rpeMax, setsWithRpe: rpeSets, setsWithoutEffortTarget,
    },
    sessions,
  };
}

/**
 * Week-to-week change, per dimension, as both absolute and proportional.
 *
 * A proportion is reported only where the previous week had something to grow
 * from; 0 → 40m is an appearance, not a percentage increase, and is reported
 * as `from_zero` rather than as infinity.
 */
export function weekOverWeekDose(weeks) {
  const out = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1], cur = weeks[i];
    const change = {};
    for (const d of DOSE_DIMENSIONS) {
      const a = prev.total[d], b = cur.total[d];
      change[d] = {
        from: a, to: b, delta: b - a,
        pct: a === 0 ? (b === 0 ? 0 : 'from_zero') : Math.round(((b - a) / a) * 1000) / 10,
      };
    }
    const effortDelta = (cur.effort.meanRpe !== null && prev.effort.meanRpe !== null)
      ? Math.round((cur.effort.meanRpe - prev.effort.meanRpe) * 100) / 100 : null;
    out.push({
      fromWeek: prev.weekNumber, toWeek: cur.weekNumber,
      fromRole: prev.weekRole, toRole: cur.weekRole,
      change, effortDelta,
      // Which dimensions moved together. Stated as a count, not as a verdict:
      // whether simultaneous movement is a problem is a coaching judgement.
      dimensionsIncreased: DOSE_DIMENSIONS.filter((d) => change[d].delta > 0),
      dimensionsDecreased: DOSE_DIMENSIONS.filter((d) => change[d].delta < 0),
      identicalTotals: DOSE_DIMENSIONS.every((d) => change[d].delta === 0),
    });
  }
  return out;
}

/**
 * Structural density facts about a week. Reports arrangement only — whether an
 * arrangement is acceptable depends on the athlete and the fixture calendar,
 * which SC9.6 already models and this module does not duplicate.
 */
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function sessionDensity(weekDose) {
  const placed = weekDose.sessions.filter((s) => DAY_ORDER.includes(s.day));
  const idx = placed.map((s) => DAY_ORDER.indexOf(s.day)).sort((a, b) => a - b);
  let longestRun = idx.length ? 1 : 0, run = 1;
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] === idx[i - 1] + 1) { run += 1; longestRun = Math.max(longestRun, run); } else run = 1;
  }
  const lower = new Set(['squat', 'hinge', 'lunge', 'jump', 'step']);
  const hasLower = (s) => Object.keys(s.byPattern).some((p) => lower.has(p));
  const hasPower = (s) => (s.byBlockType.power?.sets || 0) > 0;
  const consecutivePairs = [];
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1], b = placed[i];
    if (DAY_ORDER.indexOf(b.day) !== DAY_ORDER.indexOf(a.day) + 1) continue;
    consecutivePairs.push({
      days: [a.day, b.day],
      bothLowerBody: hasLower(a) && hasLower(b),
      bothPower: hasPower(a) && hasPower(b),
    });
  }
  return {
    sessionCount: weekDose.sessionCount,
    daysUsed: placed.map((s) => s.day),
    sessionsPlacedOnWeekdays: placed.length,
    longestConsecutiveDayRun: longestRun,
    consecutivePairs,
    consecutiveLowerBodyPairs: consecutivePairs.filter((p) => p.bothLowerBody).length,
    consecutivePowerPairs: consecutivePairs.filter((p) => p.bothPower).length,
  };
}

/** Dose across a whole programme version (one phase's weeks). */
export function doseForProgramme(weeks, { catalogue = [] } = {}) {
  const weekDoses = (weeks || []).map((w) => doseForWeek(w, { catalogue }));
  const block = zero();
  const byPattern = {}, byQuality = {}, byCategory = {}, byBlockType = {};
  for (const w of weekDoses) {
    addInto(block, w.total);
    for (const [k, v] of Object.entries(w.byPattern)) bump(byPattern, k, v);
    for (const [k, v] of Object.entries(w.byQuality)) bump(byQuality, k, v);
    for (const [k, v] of Object.entries(w.byCategory)) bump(byCategory, k, v);
    for (const [k, v] of Object.entries(w.byBlockType)) bump(byBlockType, k, v);
  }
  const first = weekDoses[0], last = weekDoses[weekDoses.length - 1];
  const peak = weekDoses.reduce((m, w) => (w.total.sets > (m?.total.sets ?? -1) ? w : m), null);
  return {
    version: TRAINING_DOSE_VERSION,
    weeks: weekDoses.length,
    block, byPattern, byQuality, byCategory, byBlockType,
    weekly: weekDoses,
    weekOverWeek: weekOverWeekDose(weekDoses),
    density: weekDoses.map((w) => ({ weekNumber: w.weekNumber, ...sessionDensity(w) })),
    // Reported so a reviewer can see the shape of the block without inferring
    // it from a chart: where the peak sat, and how the last week compares.
    peakWeek: peak ? { weekNumber: peak.weekNumber, weekRole: peak.weekRole, sets: peak.total.sets } : null,
    firstToLast: first && last ? Object.fromEntries(DOSE_DIMENSIONS.map((d) => [d, {
      from: first.total[d], to: last.total[d], delta: last.total[d] - first.total[d],
    }])) : null,
  };
}
