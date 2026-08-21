// CoachEasier Performance — workout completion & history (SC7).
//
// Validates completion, freezes the finished workout (immutable history),
// builds the summary and detects PRs — which remain achievements, never
// commands to progress. Pure module: no DOM, no fetch, no clock,
// no randomness.

import { deepFreeze } from './programme-versioning.js';
import { appendWorkoutAudit, sessionProgress } from './workout-session.js';

// ── Completion validation (Part 19) ─────────────────────────────────────────

/**
 * Can this session complete now?
 * @returns {{canComplete:boolean, needsConfirmation:boolean, unresolved:Array, painStops:number, skipped:number}}
 */
export function validateCompletion(session) {
  const unresolved = [];
  let painStops = 0;
  let skipped = 0;
  for (const log of session.exerciseLogs) {
    if (log.painStop) painStops++;
    if (log.status === 'skipped') skipped++;
    const pending = log.sets.filter((s) => s.status === 'pending').length;
    if (pending > 0) unresolved.push({ logId: log.logId, name: log.exerciseSnapshot.name, pendingSets: pending });
  }
  const totalSets = session.exerciseLogs.reduce((n, l) => n + l.sets.length, 0);
  const pendingSets = unresolved.reduce((n, u) => n + u.pendingSets, 0);
  // Significant prescribed work remaining (>25%) needs explicit confirmation.
  const needsConfirmation = pendingSets > 0 && pendingSets / totalSets > 0.25;
  return { canComplete: true, needsConfirmation, unresolved, painStops, skipped };
}

// ── PR detection (Part 20) — achievements, never commands ───────────────────

/**
 * Detect load PRs against previous bests keyed `${exerciseId}|x${implements}`
 * (see workout-store.previousBestsFromHistory). COMPARABILITY RULES: a PR
 * only exists where the comparison is meaningful — kg-typed loads only,
 * matching implement counts, same exercise, not substituted-in, no
 * pain-stop. lb/machine/band/percentage/assisted work never produces a
 * cross-type PR. PRs remain achievements, never progression commands.
 */
export function detectPersonalRecords(session, previousBests = {}) {
  const prs = [];
  for (const log of session.exerciseLogs) {
    if (log.painStop || log.substitution) continue;
    let best = null;
    let bestImplements = 1;
    for (const set of log.sets) {
      if (set.status !== 'completed') continue;
      const load = set.actual.load;
      if (!load || load.type !== 'kg' || !Number.isFinite(load.value)) continue;
      if (best === null || load.value > best) { best = load.value; bestImplements = load.implements || 1; }
    }
    if (best === null) continue;
    const prior = previousBests[`${log.exerciseId}|x${bestImplements}`];
    if (Number.isFinite(prior) && best > prior) {
      prs.push({
        kind: 'personal_record', exerciseId: log.exerciseId, name: log.exerciseSnapshot.name,
        prKind: 'load', value: best, previous: prior, unit: 'kg',
        implements: bestImplements,
        triggersProgression: false, // explicit: evidence, never a command
      });
    }
  }
  return prs;
}

// ── Completion (Part 19/20) ─────────────────────────────────────────────────

/**
 * Complete a session: freeze history, build the summary. The caller clears
 * active-session recovery state ONLY after the returned record is safely
 * persisted (workout-store.js enforces the ordering).
 */
export function completeWorkout(session, { now, previousBests = {} }) {
  const s = structuredClone(session);
  // Unfinished work is recorded honestly as skipped — never as failed
  // effort, and never silently completed.
  for (const log of s.exerciseLogs) {
    for (const set of log.sets) {
      if (set.status === 'pending') { set.status = 'skipped'; set.completedAt = now; }
    }
    if (log.status === 'pending') log.status = 'skipped';
    else if (log.status === 'in_progress') {
      log.status = log.sets.some((x) => x.status === 'completed') ? 'partial' : 'skipped';
    }
    log.finishedAt = log.finishedAt || now;
  }
  s.status = s.reviewFlags.includes('pain_stop_review') ? 'stopped_for_review' : 'completed';
  s.completedAt = now;
  s.audit = appendWorkoutAudit(s.audit, { action: 'session_completed', at: now });

  const progress = sessionProgress(s);
  // Duration is display context only — never evidence of training quality.
  // Corrupted timestamps (negative) and absurd recovered spans (>12 h,
  // PROVISIONAL bound) report as unknown rather than fabricating a number.
  let durationMin = null;
  if (s.startedAt) {
    const ms = new Date(now) - new Date(s.startedAt);
    if (Number.isFinite(ms) && ms > 0 && ms <= 12 * 3600000) durationMin = Math.max(1, Math.round(ms / 60000));
  }
  const prs = detectPersonalRecords(s, previousBests);
  const rpes = s.exerciseLogs.flatMap((l) => l.sets.map((x) => x.actual.rpe)).filter((v) => Number.isFinite(v));

  const summary = {
    durationMin,
    exercisesCompleted: s.exerciseLogs.filter((l) => l.status === 'completed').length,
    exercisesTotal: s.exerciseLogs.length,
    setsCompleted: s.exerciseLogs.flatMap((l) => l.sets).filter((x) => x.status === 'completed').length,
    setsPrescribed: progress.setsTotal,
    skippedExercises: s.exerciseLogs.filter((l) => l.status === 'skipped').map((l) => l.exerciseSnapshot.name),
    painStops: s.exerciseLogs.filter((l) => l.painStop).map((l) => l.exerciseSnapshot.name),
    substitutions: s.exerciseLogs.filter((l) => l.substitution).length,
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    personalRecords: prs,
    reviewFlags: [...s.reviewFlags],
  };
  s.summary = summary;
  return deepFreeze(s);
}
