// CoachEasier Performance — progression evidence & exposure model (SC6).
//
// Classifies sessions, tracks consecutive/recent exposures, analyses
// readiness trends and records personal records AS EVIDENCE ONLY.
// Progression is earned from repeated evidence — never from one good day,
// and never dismantled by one bad one.
//
// Pure module: no DOM, no fetch, no clock (callers pass `asOf`), no
// randomness. Nothing here makes any medical judgement.

import { BREAK_RULES, EXPOSURE_OUTCOMES, READINESS_RULES, SET_RESULTS } from '../types/progression.js';

// ── Session classification (Part 8/10) ──────────────────────────────────────

/**
 * Classify one recorded exposure of a prescription.
 * @param {{date:string, missed?:boolean, sets?:Array<{result:string, achievedRpe?:number, achievedRir?:number, repsDone?:number, repsTarget?:number}>}} session
 * @returns {{date:string, outcome:string, failedSets:number, technicalFailures:number,
 *            painStop:boolean, topOfRange:boolean, effortBelowTarget:boolean, effortAboveTarget:boolean}}
 */
export function classifyExposure(session, { rpeTarget = null, rirTarget = null, repRangeTop = null } = {}) {
  if (!session || session.missed) {
    return { date: session?.date || null, outcome: 'missed', failedSets: 0, technicalFailures: 0, painStop: false, topOfRange: false, effortBelowTarget: false, effortAboveTarget: false };
  }
  const sets = session.sets || [];
  const painStop = sets.some((s) => s.result === 'pain_stop');
  if (painStop) {
    return { date: session.date, outcome: 'pain_stop', failedSets: 0, technicalFailures: 0, painStop: true, topOfRange: false, effortBelowTarget: false, effortAboveTarget: false };
  }
  const bad = sets.filter((s) => !SET_RESULTS.includes(s.result) || s.result !== 'completed');
  const technicalFailures = sets.filter((s) => s.result === 'technical_failure').length;
  const failedSets = sets.filter((s) => ['technical_failure', 'effort_failure', 'missed_target', 'partial', 'aborted'].includes(s.result)).length;

  const outcome = failedSets === 0 && sets.length > 0 ? 'successful'
    : failedSets < sets.length ? 'partial'
    : sets.length === 0 ? 'missed' : 'failed';

  const topOfRange = repRangeTop !== null && sets.length > 0 &&
    sets.every((s) => s.result === 'completed' && (s.repsDone ?? 0) >= repRangeTop);
  const rpes = sets.map((s) => s.achievedRpe).filter((v) => Number.isFinite(v));
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const rirs = sets.map((s) => s.achievedRir).filter((v) => Number.isFinite(v));
  const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;

  let effortBelowTarget = false;
  let effortAboveTarget = false;
  if (rpeTarget !== null && avgRpe !== null) {
    effortBelowTarget = avgRpe <= rpeTarget - 1;
    effortAboveTarget = avgRpe >= rpeTarget + 1;
  } else if (rirTarget !== null && avgRir !== null) {
    effortBelowTarget = avgRir >= rirTarget + 1; // more reps in reserve than asked = easier
    effortAboveTarget = avgRir <= rirTarget - 1;
  }
  void bad;
  return { date: session.date, outcome, failedSets, technicalFailures, painStop: false, topOfRange, effortBelowTarget, effortAboveTarget };
}

// ── Exposure history analysis (Part 9/16) ───────────────────────────────────

const dayDiff = (a, b) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

/**
 * Analyse an ordered exposure history (oldest → newest, classified via
 * classifyExposure). `asOf` is the decision date — no clock is read.
 */
export function analyseHistory(exposures = [], { asOf }) {
  const real = exposures.filter((e) => EXPOSURE_OUTCOMES.includes(e.outcome));

  // Exposure continuity: a streak only counts exposures whose calendar gap
  // to the next-counted (more recent) success is within streakGapDays.
  // Older evidence stays in `total` (historical), but progression-ready
  // streaks are RECENT, CONTINUOUS evidence only — a stale streak can
  // never earn progression after a long interruption.
  let streakBrokenByGap = false;
  let streakGapDays = null;
  const countStreak = (pred) => {
    let n = 0;
    let prevDate = null;
    for (let i = real.length - 1; i >= 0; i--) {
      const e = real[i];
      if (e.outcome === 'missed') continue; // a miss pauses the streak…
      if (!pred(e)) break;
      if (prevDate && e.date) {
        const gap = dayDiff(prevDate, e.date);
        if (gap > BREAK_RULES.streakGapDays) { // …but a calendar gap breaks it
          streakBrokenByGap = true;
          streakGapDays = gap;
          break;
        }
      }
      n++;
      prevDate = e.date || prevDate;
    }
    return n;
  };
  const consecutiveSuccesses = countStreak((e) => e.outcome === 'successful');
  const consecutiveTopOfRange = countStreak((e) => e.outcome === 'successful' && e.topOfRange);
  const recent = real.slice(-6);
  const recentFailures = recent.filter((e) => e.outcome === 'failed' || e.outcome === 'partial').length;
  let trailingMisses = 0;
  for (let i = real.length - 1; i >= 0 && real[i].outcome === 'missed'; i--) trailingMisses++;
  const lastPerformed = [...real].reverse().find((e) => e.outcome !== 'missed');
  const daysSinceLast = lastPerformed?.date ? dayDiff(asOf, lastPerformed.date) : null;
  const painStop = real.some((e) => e.outcome === 'pain_stop');
  const technicalFailureRecent = recent.some((e) => e.technicalFailures > 0);
  const effortBelowStreak = countTrailing(real, (e) => e.outcome === 'successful' && e.effortBelowTarget);
  const lastEffortAbove = real.length ? !!real[real.length - 1].effortAboveTarget : false;

  return {
    total: real.length,
    consecutiveSuccesses,
    consecutiveTopOfRange,
    streakBrokenByGap,
    streakGapDays,
    recentFailures,
    trailingMisses,
    daysSinceLast,
    missedWeek: daysSinceLast !== null && daysSinceLast >= BREAK_RULES.missedWeekDays && daysSinceLast < BREAK_RULES.prolongedBreakDays,
    prolongedBreak: daysSinceLast !== null && daysSinceLast >= BREAK_RULES.prolongedBreakDays,
    painStop,
    technicalFailureRecent,
    effortBelowStreak,
    lastEffortAbove,
  };
}

function countTrailing(list, pred) {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].outcome === 'missed') continue;
    if (pred(list[i])) n++;
    else break;
  }
  return n;
}

// ── Readiness trend (Parts 13–14) ───────────────────────────────────────────

/**
 * Anti-overreaction readiness analysis over recent wellness entries
 * (SC2 1–5 scales; higher = better). Missing data is NEVER treated as
 * poor readiness.
 * @param {Array<{date:string, scores:object}>} entries newest last
 * @returns {{status:string, lowCount:number, window:number}}
 */
export function analyseReadiness(entries = []) {
  const window = entries.slice(-READINESS_RULES.windowEntries);
  if (!window.length) return { status: 'no_data', lowCount: 0, window: 0 };
  const lows = window.filter((e) => {
    const vals = Object.values(e.scores || {}).filter((v) => Number.isFinite(v));
    if (!vals.length) return false;
    return vals.reduce((a, b) => a + b, 0) / vals.length <= READINESS_RULES.lowScoreThreshold;
  });
  const latestLow = lows.length && window[window.length - 1] === lows[lows.length - 1];
  if (lows.length >= READINESS_RULES.sustainedCount) return { status: 'sustained_low', lowCount: lows.length, window: window.length };
  if (latestLow) return { status: 'one_low', lowCount: lows.length, window: window.length };
  return { status: 'normal', lowCount: lows.length, window: window.length };
}

// ── Personal records (Part 19) ──────────────────────────────────────────────

/**
 * A PR is a performance EVENT — an achievement record and evidence input.
 * It carries no command: nothing here changes any prescription.
 */
export function recordPersonalRecord({ exerciseId, kind, value, unit, date, source = 'logged_set' }) {
  return {
    kind: 'personal_record',
    exerciseId, prKind: kind, value, unit, date, source,
    // Explicit contract: consumers may count this as confidence evidence
    // only. It never triggers an automatic increase.
    triggersProgression: false,
  };
}
