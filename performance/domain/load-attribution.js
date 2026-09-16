// CoachEasier Performance — SC9.15 training-load attribution.
//
// SC9.14 made the engine able to MEASURE how much training it prescribes.
// This module makes it able to EXPLAIN where that training came from: which
// lever moved, by how much, and which levers moved together.
//
// It answers "more, harder, denser or more often?" — four different questions
// the engine had the data to separate but never actually separated.
//
// WHAT THIS MODULE WILL NOT DO
//
// No score. No threshold. No verdict. It never says a change is too large,
// because "how much is too much" is a professional S&C judgement this product
// does not make on a coach's behalf. Every observation it emits is labelled
// with its evidential status, so a reviewer can tell a measured fact from a
// provisional heuristic from a question that needs a qualified practitioner.
//
// Pure: no DOM, no storage, no clock.

import { DOSE_DIMENSIONS } from './training-dose.js';

export const LOAD_ATTRIBUTION_VERSION = '2026.08-sc915-beta.1';

/**
 * The independent levers a week can move. Volume dimensions stay separate for
 * the same reason SC9.14 keeps them apart — repetitions, seconds and metres are
 * not interchangeable — and effort and frequency are not volume at all.
 */
export const LEVERS = [...DOSE_DIMENSIONS, 'effort', 'frequency'];

/** What kind of claim an observation is. The reviewer needs this distinction. */
export const EVIDENCE = {
  MEASURED: 'measured',                    // counted from the programme itself
  PROVISIONAL: 'provisional',              // a rule the product states but cannot evidence
  JUDGEMENT: 'requires_professional_judgement', // a question for a qualified S&C practitioner
};

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Which levers moved between two measured weeks, and by how much.
 *
 * Proportions are reported only where the previous week had something to grow
 * from; appearing from zero is reported as such rather than as an infinite
 * percentage.
 */
export function attributeWeekChange(previous, current) {
  const levers = {};
  for (const d of DOSE_DIMENSIONS) {
    const from = previous.total[d], to = current.total[d];
    levers[d] = {
      from, to, delta: to - from,
      pct: from === 0 ? (to === 0 ? 0 : 'from_zero') : round1(((to - from) / from) * 100),
    };
  }
  const fromRpe = previous.effort.meanRpe, toRpe = current.effort.meanRpe;
  levers.effort = {
    from: fromRpe, to: toRpe,
    delta: (fromRpe === null || toRpe === null) ? null : round1(toRpe - fromRpe),
    pct: null, // an RPE is a point on a bounded scale; a percentage of it means nothing
  };
  levers.frequency = {
    from: previous.sessionCount, to: current.sessionCount,
    delta: current.sessionCount - previous.sessionCount,
    pct: previous.sessionCount === 0 ? 'from_zero'
      : round1(((current.sessionCount - previous.sessionCount) / previous.sessionCount) * 100),
  };

  const rising = LEVERS.filter((l) => typeof levers[l].delta === 'number' && levers[l].delta > 0);
  const falling = LEVERS.filter((l) => typeof levers[l].delta === 'number' && levers[l].delta < 0);

  // The single largest proportional volume move, so a reviewer can see what
  // actually drove the week rather than reading five numbers.
  let driver = null;
  for (const d of DOSE_DIMENSIONS) {
    const p = levers[d].pct;
    if (typeof p !== 'number' || p <= 0) continue;
    if (!driver || p > driver.pct) driver = { lever: d, pct: p, delta: levers[d].delta };
  }

  // SETS PER MOVEMENT PATTERN — the metric the field actually uses.
  //
  // A programme-wide weekly set total has a denominator made of every exercise
  // in the week, so a wave that adds one set to each of twelve prescriptions
  // reads as "+50%". The resistance-training literature does not count that
  // way: it counts hard sets per muscle group (or per movement) per week, where
  // the same step is squat 2 -> 3. Both numbers are true; only one of them
  // means anything to a coach, and the engine was publishing the other.
  //
  // Computed from `byPattern`, which the dose layer already produces. No new
  // input, no threshold, and no judgement about whether a step is too large —
  // Gate 2 Q4 settled that there is no supportable ceiling, and this changes
  // what is reported, not what is allowed.
  const patterns = [...new Set([
    ...Object.keys(previous.byPattern || {}), ...Object.keys(current.byPattern || {}),
  ])].sort();
  const perPattern = patterns.map((pattern) => {
    const from = previous.byPattern?.[pattern]?.sets ?? 0;
    const to = current.byPattern?.[pattern]?.sets ?? 0;
    return { pattern, from, to, delta: to - from };
  }).filter((x) => x.delta !== 0);
  // The single biggest move any one pattern made, in sets. Ties resolve by
  // pattern name so the result is deterministic.
  const largestPatternSetIncrease = perPattern
    .filter((x) => x.delta > 0)
    .reduce((max, x) => (!max || x.delta > max.delta ? x : max), null);

  return {
    fromWeek: previous.weekNumber, toWeek: current.weekNumber,
    fromRole: previous.weekRole, toRole: current.weekRole,
    levers, rising, falling,
    perPattern, largestPatternSetIncrease,
    // Named plainly, because these are the four different questions:
    more: rising.some((l) => DOSE_DIMENSIONS.includes(l)),   // more work
    harder: levers.effort.delta !== null && levers.effort.delta > 0, // harder work
    moreOften: levers.frequency.delta > 0,                   // more frequent work
    volumeDriver: driver,
    unchanged: rising.length === 0 && falling.length === 0,
  };
}

/** Attribution across a whole block, plus what accumulated. */
export function attributeBlock(programmeDose) {
  const weeks = programmeDose?.weekly || [];
  const transitions = [];
  for (let i = 1; i < weeks.length; i++) transitions.push(attributeWeekChange(weeks[i - 1], weeks[i]));

  const cumulative = {};
  for (const d of DOSE_DIMENSIONS) {
    const first = weeks[0]?.total[d] ?? 0;
    const peak = weeks.reduce((m, w) => Math.max(m, w.total[d]), 0);
    cumulative[d] = {
      first, peak, last: weeks[weeks.length - 1]?.total[d] ?? 0,
      firstToPeakPct: first === 0 ? (peak === 0 ? 0 : 'from_zero') : round1(((peak - first) / first) * 100),
    };
  }

  // Where effort stopped being available, and what carried the progression
  // afterwards. This is the mechanism behind "reps keep climbing once RPE is
  // capped" — reported, never judged.
  const ceilingWeeks = weeks
    .filter((w) => (w.sessions || []).some((s) => s.effort.maxRpe !== null))
    .map((w) => ({ weekNumber: w.weekNumber, maxRpe: w.effort.maxRpe }));
  let ceilingReachedAt = null;
  for (let i = 1; i < ceilingWeeks.length; i++) {
    if (ceilingWeeks[i].maxRpe !== null && ceilingWeeks[i].maxRpe === ceilingWeeks[i - 1].maxRpe) {
      ceilingReachedAt = ceilingWeeks[i].weekNumber; break;
    }
  }
  // `ceilingReachedAt` is the week effort STOPPED rising, so the transition
  // INTO it is the first one effort could not carry — keyed on toWeek, not
  // fromWeek. Deloads are excluded: shedding work is not progression.
  const afterCeiling = ceilingReachedAt === null ? [] : transitions
    .filter((t) => t.toWeek >= ceilingReachedAt && t.toRole !== 'deload')
    .flatMap((t) => t.rising.filter((l) => DOSE_DIMENSIONS.includes(l)));

  return {
    version: LOAD_ATTRIBUTION_VERSION,
    weeks: weeks.length,
    transitions,
    cumulative,
    // Counted, not judged: how often each pairing of levers rose together.
    simultaneous: {
      volumeAndEffort: transitions.filter((t) => t.more && t.harder).length,
      volumeOnly: transitions.filter((t) => t.more && !t.harder).length,
      effortOnly: transitions.filter((t) => !t.more && t.harder).length,
      frequencyChanged: transitions.filter((t) => t.levers.frequency.delta !== 0).length,
      neither: transitions.filter((t) => !t.more && !t.harder).length,
    },
    effortCeiling: {
      reachedAtWeek: ceilingReachedAt,
      leversCarryingProgressionAfterwards: [...new Set(afterCeiling)],
    },
    largestIncrease: transitions.reduce((max, t) => {
      const d = t.volumeDriver;
      return d && (!max || d.pct > max.volumeDriver.pct) ? t : max;
    }, null),
  };
}

/**
 * Classified observations. Each carries what it is: something counted, a rule
 * the product admits it cannot evidence, or a question for a practitioner.
 *
 * Deliberately not a list of problems — several of these describe behaviour
 * that may be entirely correct. The classification is the point.
 */
export function loadObservations(programmeDose, attribution) {
  const out = [];
  const s = attribution.simultaneous;
  if (s.volumeAndEffort > 0) {
    out.push({
      code: 'volume_and_effort_rose_together', evidence: EVIDENCE.MEASURED,
      statement: `${s.volumeAndEffort} of ${attribution.transitions.length} week transitions increased both volume and effort.`,
      data: { transitions: s.volumeAndEffort, of: attribution.transitions.length },
    });
    out.push({
      code: 'simultaneous_progression_acceptable', evidence: EVIDENCE.JUDGEMENT,
      statement: 'Whether volume and effort should rise in the same week is a programming judgement this engine does not make.',
      data: {},
    });
  }

  const big = attribution.largestIncrease;
  if (big?.volumeDriver) {
    out.push({
      code: 'largest_single_week_increase', evidence: EVIDENCE.MEASURED,
      statement: `The largest single-week volume increase is week ${big.fromWeek} → ${big.toWeek}: `
        + `${big.volumeDriver.lever} +${big.volumeDriver.pct}%`
        + (big.harder ? `, with effort +${big.levers.effort.delta} RPE` : '')
        + ` (${big.rising.length} lever${big.rising.length === 1 ? '' : 's'} rising).`,
      data: { fromWeek: big.fromWeek, toWeek: big.toWeek, driver: big.volumeDriver, rising: big.rising },
    });
    // The same step, in the metric the field counts in. A percentage of a
    // programme-wide set total is dominated by how many exercises the week
    // happens to contain; sets per movement pattern is what a coach compares
    // against published guidance. Both are reported, the absolute one second so
    // it is the number a reader finishes on.
    if (big.largestPatternSetIncrease) {
      const lp = big.largestPatternSetIncrease;
      const moved = big.perPattern.filter((x) => x.delta > 0);
      const byOne = moved.filter((x) => x.delta === lp.delta).length;
      out.push({
        code: 'largest_increase_per_pattern', evidence: EVIDENCE.MEASURED,
        statement: `Per movement pattern that week is at most +${lp.delta} `
          + `set${lp.delta === 1 ? '' : 's'} `
          + `(${lp.pattern.replace(/_/g, ' ')} ${lp.from} → ${lp.to}), across `
          + `${moved.length} pattern${moved.length === 1 ? '' : 's'} that moved`
          + (byOne < moved.length ? `; the rest move by less.` : '.'),
        data: { fromWeek: big.fromWeek, toWeek: big.toWeek, largest: lp, perPattern: big.perPattern },
      });
      out.push({
        code: 'weekly_set_total_is_not_the_field_metric', evidence: EVIDENCE.MEASURED,
        statement: 'A programme-wide weekly set total scales with how many exercises the week '
          + 'contains, so its percentage change is not the quantity published guidance is written '
          + 'in. Sets per movement pattern per week is reported alongside it.',
        data: {},
      });
    }
    out.push({
      code: 'acceptable_weekly_increase', evidence: EVIDENCE.JUDGEMENT,
      statement: 'How large a single-week increase may be is not established here; no threshold is applied.',
      data: {},
    });
  }

  const ec = attribution.effortCeiling;
  if (ec.reachedAtWeek !== null && ec.leversCarryingProgressionAfterwards.length) {
    out.push({
      code: 'progression_continued_after_effort_ceiling', evidence: EVIDENCE.MEASURED,
      statement: `Effort stopped rising at week ${ec.reachedAtWeek}; progression afterwards was carried by `
        + `${ec.leversCarryingProgressionAfterwards.join(', ')}.`,
      data: ec,
    });
    out.push({
      code: 'volume_substituting_for_effort', evidence: EVIDENCE.JUDGEMENT,
      statement: 'Whether volume should keep rising once an athlete is at their effort ceiling requires a qualified S&C practitioner.',
      data: {},
    });
  }

  if (s.frequencyChanged === 0 && attribution.transitions.length) {
    out.push({
      code: 'frequency_fixed_within_block', evidence: EVIDENCE.MEASURED,
      statement: 'Session frequency does not change within a block; it is decided once at generation.',
      data: { transitions: attribution.transitions.length },
    });
  }

  for (const d of programmeDose?.density || []) {
    if (d.consecutiveLowerBodyPairs > 0 || d.consecutivePowerPairs > 0) {
      out.push({
        code: 'consecutive_high_demand_days', evidence: EVIDENCE.PROVISIONAL,
        statement: `Week ${d.weekNumber}: ${d.consecutivePairs.length} consecutive-day session pair(s), `
          + `${d.consecutiveLowerBodyPairs} with lower-body work on both days, `
          + `${d.consecutivePowerPairs} with power work on both days.`,
        data: d,
      });
    }
  }

  return out;
}
