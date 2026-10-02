// CoachEasier Performance — deterministic programme critique (SC9.7).
//
// WHAT THIS ANSWERS
// "Does this programme appear internally coherent and professionally
// structured?" — and nothing more. It is a reviewer, not an author: it never
// changes a programme, never re-runs generation, and never overrides SC6,
// SC9.1 or SC9.6.
//
// WHAT IT MUST NEVER CLAIM
// Medically safe. Injury-proof. Optimal. Evidence-perfect. It reports what can
// be READ from the programme and its context, and says plainly which of its
// rules are engineering facts and which are programming opinion.
//
// EVERY RULE DECLARES ITS BASIS
// Three kinds, and the difference is load-bearing:
//
//   product_constraint     A rule the product itself guarantees — a youth
//                          ceiling, an unfilled slot. Violations are defects.
//   deterministic_rule     A fact read straight off the programme — this
//                          pattern appears four times; this week has no
//                          recovery week. Not an opinion, just arithmetic.
//   provisional_heuristic  Our programming judgement about what is usually
//                          sensible. SC9.5 established that no periodisation
//                          model is proven superior to another, so these are
//                          offered as opinion and marked `provisional: true`.
//
// A finding never presents the third kind as the first.
//
// IT CONSUMES, IT DOES NOT RECOMPUTE
//   SC5   pattern coverage, flags and unresolved slots via `provenance`
//   SC9.1 week roles and per-prescription progression reports off the tree
//   SC9.6 the fixture assessment, passed in — no fixture maths happens here
//
// Pure module: no DOM, no fetch, no storage, no clock, no randomness.

import { demandsForSession } from './fixture-context.js';
import { PREPARATION_BLOCK_TYPES } from '../types/programme.js';

export const CRITIQUE_VERSION = '2026.08-sc97-beta.1';

/**
 * Severities are SC6's existing vocabulary (PROGRESSION_FLAGS), deliberately.
 * One severity scale across the product, not two.
 */
export const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  REQUIRES_REVIEW: 'requires_review',
  BLOCKING: 'blocking',
};

/** Why a rule is allowed to say what it says. */
export const RULE_BASIS = {
  CONSTRAINT: 'product_constraint',
  DETERMINISTIC: 'deterministic_rule',
  HEURISTIC: 'provisional_heuristic',
};

/** A finding's role in the review, for grouping in the UI. */
export const FINDING_KIND = {
  STRENGTH: 'strength',
  OPPORTUNITY: 'opportunity',
  WARNING: 'warning',
  CONFLICT: 'conflict',
};

// ── Thresholds ──────────────────────────────────────────────────────────────
//
// Named, inspectable, and honest about being ours. None is a medical
// threshold; each is the point at which a coach would probably want to look.

/** One pattern appearing this often in a week reads as concentration. */
export const PATTERN_CONCENTRATION = 4;
/** High-demand sessions on this many consecutive days invites a look. */
export const CONSECUTIVE_HARD_DAYS = 3;

const PREP_BLOCKS = new Set(PREPARATION_BLOCK_TYPES);
const HARD_DEMANDS = new Set(['heavy_lower', 'heavy_upper', 'power', 'conditioning_high', 'high_volume_accessory']);
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const isObj = (v) => !!v && typeof v === 'object';

/** Build one finding. `basis` decides whether it may be stated as fact. */
function finding({ code, kind, severity, message, basis, evidence = null }) {
  return {
    code, kind, severity, message, basis,
    evidence,
    provisional: basis === RULE_BASIS.HEURISTIC,
  };
}

// ── Reading the programme ───────────────────────────────────────────────────

/** Flatten a version (or pinned snapshot tree) into inspectable weeks. */
export function readProgramme(versionOrTree) {
  const phases = Array.isArray(versionOrTree) ? versionOrTree
    : (versionOrTree?.phases || versionOrTree?.prescriptionTree || []);
  const weeks = [];
  for (const phase of phases) {
    for (const week of phase?.weeks || []) {
      const sessions = [];
      for (const day of week.days || []) {
        for (const session of day.sessions || []) {
          const prescriptions = [];
          for (const block of session.blocks || []) {
            for (const p of block.prescriptions || []) {
              prescriptions.push({
                exerciseId: p.exerciseId,
                blockType: block.blockType,
                prep: PREP_BLOCKS.has(block.blockType),
                setCount: (p.sets || []).length,
                fields: { ...(p.sets?.[0]?.fields || {}) },
                progression: p.progression || null,
              });
            }
          }
          sessions.push({
            sessionId: session.id, title: session.title, day: day.day,
            rugbyRelation: day.rugbyRelation || 'none',
            demands: demandsForSession(session),
            prescriptions,
          });
        }
      }
      weeks.push({
        weekNumber: week.weekNumber,
        weekRole: week.weekRole || null,
        plannedVolume: week.plannedVolume || null,
        plannedIntensity: week.plannedIntensity || null,
        progressionReasons: week.progressionReasons || [],
        sessions,
      });
    }
  }
  return weeks;
}

// ── 1. Weekly distribution and quality coverage ─────────────────────────────

function checkQualityDistribution(weeks, catalogue, out) {
  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  const qualities = new Map();
  let working = 0;
  for (const w of weeks) {
    for (const s of w.sessions) {
      for (const p of s.prescriptions) {
        if (p.prep) continue;
        working += 1;
        const cls = byId.get(p.exerciseId)?.classification;
        for (const q of [cls?.primaryQuality, ...(cls?.secondaryQualities || [])]) {
          if (q) qualities.set(q, (qualities.get(q) || 0) + 1);
        }
      }
    }
  }
  if (!working) {
    out.push(finding({
      code: 'no_working_prescriptions', kind: FINDING_KIND.CONFLICT,
      severity: SEVERITY.BLOCKING, basis: RULE_BASIS.CONSTRAINT,
      message: 'This programme prescribes no trainable work outside preparation blocks.',
    }));
    return { qualities, working };
  }
  // Reported as observation. What a phase *should* emphasise is a coaching
  // judgement, so absence is an opportunity to consider — never a failure.
  const top = [...qualities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([q]) => q);
  if (top.length) {
    out.push(finding({
      code: 'quality_emphasis', kind: FINDING_KIND.STRENGTH,
      severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
      message: `Main emphasis across the block: ${top.join(', ')}.`,
      evidence: { qualities: Object.fromEntries(qualities) },
    }));
  }
  return { qualities, working };
}

// ── 2. Movement-pattern coverage ────────────────────────────────────────────

function checkPatternCoverage(weeks, catalogue, provenance, out) {
  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  const counts = new Map();
  for (const w of weeks) {
    for (const s of w.sessions) {
      for (const p of s.prescriptions) {
        if (p.prep) continue;
        const pattern = byId.get(p.exerciseId)?.classification?.pattern;
        if (pattern) counts.set(pattern, (counts.get(pattern) || 0) + 1);
      }
    }
  }

  // SC5 already decided what this athlete's week REQUIRES and whether it was
  // covered. Recomputing that here would be a second opinion on a settled
  // question, so its answer is surfaced rather than re-derived.
  const missing = provenance?.patternCoverage?.missing || [];
  if (missing.length) {
    out.push(finding({
      code: 'pattern_not_covered', kind: FINDING_KIND.OPPORTUNITY,
      severity: SEVERITY.WARNING, basis: RULE_BASIS.CONSTRAINT,
      message: `Movement pattern(s) the engine expected are not covered: ${missing.join(', ')}.`,
      evidence: { missing },
    }));
  }

  const weekCount = Math.max(1, weeks.length);
  for (const [pattern, n] of counts) {
    const perWeek = n / weekCount;
    if (perWeek >= PATTERN_CONCENTRATION) {
      out.push(finding({
        code: 'pattern_concentration', kind: FINDING_KIND.OPPORTUNITY,
        severity: SEVERITY.INFO, basis: RULE_BASIS.HEURISTIC,
        message: `${pattern} appears about ${perWeek.toFixed(1)} times a week — consider whether that concentration is intended.`,
        evidence: { pattern, perWeek: Math.round(perWeek * 10) / 10, total: n },
      }));
    }
  }
  return counts;
}

// ── 3. Session density ──────────────────────────────────────────────────────

function checkSessionDensity(weeks, out) {
  for (const w of weeks) {
    const hard = w.sessions.filter((s) => s.demands.some((d) => HARD_DEMANDS.has(d)));
    if (!w.sessions.length) continue;

    // NO "share of hard sessions" check. In a three-day strength programme all
    // three sessions contain strength work, so such a rule fires on every
    // well-formed programme and cannot separate a genuine defect from an
    // ordinary design choice. Clustering IS a real signal, so that is what is
    // measured instead: consecutive days, and lower-body concentration.

    // Consecutive calendar days carrying high demand.
    const days = hard.map((s) => DAY_ORDER.indexOf(s.day)).filter((i) => i >= 0).sort((a, b) => a - b);
    let run = 1, longest = 1;
    for (let i = 1; i < days.length; i++) {
      run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    if (days.length && longest >= CONSECUTIVE_HARD_DAYS) {
      out.push(finding({
        code: 'consecutive_hard_days', kind: FINDING_KIND.WARNING,
        severity: SEVERITY.WARNING, basis: RULE_BASIS.HEURISTIC,
        message: `Week ${w.weekNumber}: ${longest} high-demand sessions fall on consecutive days.`,
        evidence: { weekNumber: w.weekNumber, consecutive: longest },
      }));
    }

    // Lower-body concentration, read from the demand tags the sessions carry.
    const lower = w.sessions.filter((s) => s.demands.includes('heavy_lower')).length;
    if (lower >= 3) {
      out.push(finding({
        code: 'lower_body_concentration', kind: FINDING_KIND.WARNING,
        severity: SEVERITY.WARNING, basis: RULE_BASIS.HEURISTIC,
        message: `Week ${w.weekNumber}: ${lower} sessions carry heavy lower-body work.`,
        evidence: { weekNumber: w.weekNumber, sessions: lower },
      }));
    }
  }
}

// ── 4. Progression coherence ────────────────────────────────────────────────

function checkProgression(weeks, out) {
  if (weeks.length < 2) {
    out.push(finding({
      code: 'single_week_block', kind: FINDING_KIND.OPPORTUNITY,
      severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
      message: 'This block is a single week, so there is no week-to-week progression to review.',
    }));
    return;
  }

  const roles = weeks.map((w) => w.weekRole).filter(Boolean);
  if (roles.length === weeks.length) {
    out.push(finding({
      code: 'progression_roles_present', kind: FINDING_KIND.STRENGTH,
      severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
      message: `Week roles are defined across the block: ${roles.join(' → ')}.`,
      evidence: { roles },
    }));
  }

  // A week whose prescriptions are byte-identical to the previous week's, with
  // no reported reason, is a coherence problem. Where SC9.1 DID report a
  // reason — a ceiling, or the minimum trainable dose — it is a legitimate
  // decision and must not be reported as a defect.
  const signature = (w) => JSON.stringify(w.sessions.map((s) =>
    s.prescriptions.filter((p) => !p.prep).map((p) => [p.exerciseId, p.setCount, p.fields])));
  for (let i = 1; i < weeks.length; i++) {
    if (signature(weeks[i]) !== signature(weeks[i - 1])) continue;
    const codes = new Set();
    for (const s of weeks[i].sessions) {
      for (const p of s.prescriptions) (p.progression?.changed || []).forEach((c) => codes.add(c));
    }
    const explained = codes.has('at_minimum_dose') || codes.has('maintain_only')
      || codes.has('effort_capped') || codes.has('reps_are_quality_dose');
    out.push(explained
      ? finding({
          code: 'progression_held_with_reason', kind: FINDING_KIND.STRENGTH,
          severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
          message: `Week ${weeks[i].weekNumber} repeats week ${weeks[i - 1].weekNumber}, and the engine reported why (${[...codes].join(', ')}).`,
          evidence: { weekNumber: weeks[i].weekNumber, codes: [...codes] },
        })
      : finding({
          code: 'progression_unexplained_repeat', kind: FINDING_KIND.WARNING,
          severity: SEVERITY.WARNING, basis: RULE_BASIS.DETERMINISTIC,
          message: `Week ${weeks[i].weekNumber} is identical to week ${weeks[i - 1].weekNumber} with no reason recorded.`,
          evidence: { weekNumber: weeks[i].weekNumber },
        }));
  }

  // Large single-step effort jumps, read off the prescriptions themselves.
  for (let i = 1; i < weeks.length; i++) {
    const rpeOf = (w) => {
      const vals = [];
      for (const s of w.sessions) for (const p of s.prescriptions) {
        if (!p.prep && Number.isFinite(p.fields.rpe)) vals.push(p.fields.rpe);
      }
      return vals.length ? Math.max(...vals) : null;
    };
    const a = rpeOf(weeks[i - 1]), b = rpeOf(weeks[i]);
    if (a !== null && b !== null && b - a >= 2) {
      out.push(finding({
        code: 'abrupt_effort_increase', kind: FINDING_KIND.WARNING,
        severity: SEVERITY.REQUIRES_REVIEW, basis: RULE_BASIS.HEURISTIC,
        message: `Peak effort rises from RPE ${a} to RPE ${b} between weeks ${weeks[i - 1].weekNumber} and ${weeks[i].weekNumber}.`,
        evidence: { from: a, to: b },
      }));
    }
  }
}

// ── 5. Deload / recovery ────────────────────────────────────────────────────

function checkRecovery(weeks, out) {
  const deloads = weeks.filter((w) => w.weekRole === 'deload').map((w) => w.weekNumber);
  if (deloads.length) {
    out.push(finding({
      code: 'recovery_week_present', kind: FINDING_KIND.STRENGTH,
      severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
      message: `Reduced-load week(s) scheduled: week ${deloads.join(', ')}.`,
      evidence: { weeks: deloads },
    }));
    return;
  }
  if (weeks.length < 3) return;
  // SC9.5 established that automatic deloading is NOT settled evidence, so
  // this is stated as something to consider, never as an omission.
  out.push(finding({
    code: 'no_recovery_week', kind: FINDING_KIND.OPPORTUNITY,
    severity: SEVERITY.INFO, basis: RULE_BASIS.HEURISTIC,
    message: `No reduced-load week is scheduled across ${weeks.length} weeks. Whether one is needed is a coaching judgement — the evidence does not settle it.`,
    evidence: { weeks: weeks.length },
  }));
}

// ── 6. Fixture coherence — consumed, never recomputed ───────────────────────

function checkFixtures(schedule, out) {
  if (!isObj(schedule)) return;
  if (schedule.fixtureDataAvailable === false) {
    out.push(finding({
      code: 'fixture_data_unavailable', kind: FINDING_KIND.OPPORTUNITY,
      severity: SEVERITY.INFO, basis: RULE_BASIS.CONSTRAINT,
      message: 'No fixtures are recorded for this squad, so session timing could not be checked against matches.',
    }));
    return;
  }
  const conflicts = (schedule.sessions || []).filter((s) => s.status === 'conflict');
  const cautions = (schedule.sessions || []).filter((s) => s.status === 'caution');
  if (conflicts.length) {
    out.push(finding({
      code: 'fixture_conflict', kind: FINDING_KIND.CONFLICT,
      severity: SEVERITY.REQUIRES_REVIEW, basis: RULE_BASIS.HEURISTIC,
      message: `${conflicts.length} session(s) sit close to a match in a way the scheduling rules do not prefer.`,
      evidence: { sessions: conflicts.map((s) => ({ date: s.date, day: s.day, reasons: s.reasons.map((r) => r.code) })) },
    }));
  }
  if ((schedule.congestion || []).length) {
    out.push(finding({
      code: 'fixture_congestion', kind: FINDING_KIND.WARNING,
      severity: SEVERITY.WARNING, basis: RULE_BASIS.CONSTRAINT,
      message: `${schedule.congestion.length} short turnaround(s) between fixtures reduce the development window.`,
      evidence: { congestion: schedule.congestion.length },
    }));
  }
  if (!conflicts.length && !cautions.length) {
    out.push(finding({
      code: 'fixture_spacing_ok', kind: FINDING_KIND.STRENGTH,
      severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
      message: 'No session conflicts with the surrounding fixtures.',
    }));
  }
}

// ── 7/8. Development and positional context ─────────────────────────────────

function checkContext(weeks, catalogue, { context, experience, position }, out) {
  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  const youth = context === 'youth_u16' || context === 'youth_u18';

  if (youth) {
    const unsuitable = [];
    for (const w of weeks) for (const s of w.sessions) for (const p of s.prescriptions) {
      if (p.prep) continue;
      const ex = byId.get(p.exerciseId);
      // SC3 stores this at safety.youth. An absent value is NOT treated as
      // suitable: an unknown suitability is exactly what needs a coach's eye.
      const suitability = ex?.safety?.youth ?? null;
      if (suitability === null || suitability === 'not_recommended' || suitability === 'needs_review') {
        unsuitable.push({ exerciseId: p.exerciseId, suitability: suitability || 'unknown' });
      }
    }
    const techniqueOnly = [];
    for (const w of weeks) for (const s of w.sessions) for (const p of s.prescriptions) {
      if (p.prep) continue;
      if (byId.get(p.exerciseId)?.safety?.youth === 'technique_only') techniqueOnly.push(p.exerciseId);
    }
    out.push(unsuitable.length
      ? finding({
          code: 'youth_suitability_flag', kind: FINDING_KIND.CONFLICT,
          severity: SEVERITY.BLOCKING, basis: RULE_BASIS.CONSTRAINT,
          message: `${unsuitable.length} exercise(s) are not confirmed suitable for an age-grade athlete.`,
          evidence: { unsuitable },
        })
      : finding({
          code: 'youth_suitability_ok', kind: FINDING_KIND.STRENGTH,
          severity: SEVERITY.INFO, basis: RULE_BASIS.CONSTRAINT,
          message: 'Every prescribed exercise carries an age-grade suitability rating.',
        }));
    if (techniqueOnly.length) {
      out.push(finding({
        code: 'youth_technique_only', kind: FINDING_KIND.OPPORTUNITY,
        severity: SEVERITY.WARNING, basis: RULE_BASIS.CONSTRAINT,
        message: `${new Set(techniqueOnly).size} exercise(s) are rated technique-only at this age grade — supervised technical work before load.`,
        evidence: { exercises: [...new Set(techniqueOnly)] },
      }));
    }

    // SC9.5: at U16 the adult positional demand pattern does not hold, so a
    // programme leaning on position there is worth a second look.
    if (context === 'youth_u16' && position) {
      out.push(finding({
        code: 'youth_positional_context', kind: FINDING_KIND.OPPORTUNITY,
        severity: SEVERITY.INFO, basis: RULE_BASIS.HEURISTIC,
        message: 'Positional emphasis is treated as weak context at U16 — the adult demand pattern does not transfer.',
        evidence: { position },
      }));
    }
  }

  // An adult novice must not silently inherit youth restrictions, and an
  // advanced youth athlete must not be judged as an adult.
  if (!youth && (experience === 'new' || experience === 'beginner')) {
    out.push(finding({
      code: 'adult_novice_context', kind: FINDING_KIND.OPPORTUNITY,
      severity: SEVERITY.INFO, basis: RULE_BASIS.DETERMINISTIC,
      message: 'Programmed for an adult with a low training age — complexity and effort are bounded by training age, not by an age-grade ceiling.',
      evidence: { experience },
    }));
  }
}

// ── 9. Exercise and equipment logic ─────────────────────────────────────────

/**
 * Exercise integrity.
 *
 * Deliberately NOT an equipment-availability check. SC5 already filters the
 * library by the athlete's equipment when it selects, so re-testing it here
 * would be a second, weaker opinion on a settled question — and it produced
 * false conflicts for a full-gym athlete because the catalogue's equipment
 * names and the profile's item names are different vocabularies. What IS
 * checked is that every prescribed exercise actually exists: a prescription
 * pointing at nothing is a real defect, not a preference.
 */
function checkExercises(weeks, catalogue, _athlete, out) {
  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  const unknown = [];
  for (const w of weeks) for (const s of w.sessions) for (const p of s.prescriptions) {
    if (!byId.has(p.exerciseId)) unknown.push(p.exerciseId);
  }
  if (unknown.length) {
    out.push(finding({
      code: 'unknown_exercise', kind: FINDING_KIND.CONFLICT,
      severity: SEVERITY.BLOCKING, basis: RULE_BASIS.CONSTRAINT,
      message: `${unknown.length} prescribed exercise(s) are not in the library.`,
      evidence: { unknown: [...new Set(unknown)] },
    }));
  }
}

function checkUnresolvedSlots(provenance, out) {
  const slots = provenance?.unresolvedSlots || [];
  if (!slots.length) return;
  out.push(finding({
    code: 'unresolved_slots', kind: FINDING_KIND.WARNING,
    severity: SEVERITY.WARNING, basis: RULE_BASIS.CONSTRAINT,
    message: `${slots.length} slot(s) could not be filled from the eligible library and need completing.`,
    evidence: { count: slots.length },
  }));
}

// ── The critique ────────────────────────────────────────────────────────────

const SEVERITY_RANK = { info: 0, warning: 1, requires_review: 2, blocking: 3 };

/**
 * Critique a programme. Reads only; returns findings.
 *
 * @param {object} opts
 * @param {object} opts.version      an SC4 version, or a pinned snapshot tree
 * @param {object} [opts.provenance] SC5's generation report
 * @param {Array}  [opts.catalogue]  the exercise library
 * @param {object} [opts.athlete]    { context, experience, position, availableEquipment }
 * @param {object} [opts.schedule]   SC9.6's assessment — consumed, not recomputed
 */
export function critiqueProgramme({
  version, provenance = null, catalogue = [], athlete = {}, schedule = null,
} = {}) {
  const weeks = readProgramme(version);
  const findings = [];

  if (!weeks.length) {
    findings.push(finding({
      code: 'no_programme_structure', kind: FINDING_KIND.CONFLICT,
      severity: SEVERITY.BLOCKING, basis: RULE_BASIS.CONSTRAINT,
      message: 'There is no programme structure to review.',
    }));
  } else {
    checkQualityDistribution(weeks, catalogue, findings);
    checkPatternCoverage(weeks, catalogue, provenance, findings);
    checkSessionDensity(weeks, findings);
    checkProgression(weeks, findings);
    checkRecovery(weeks, findings);
    checkContext(weeks, catalogue, athlete, findings);
    checkExercises(weeks, catalogue, athlete, findings);
  }
  checkFixtures(schedule, findings);
  checkUnresolvedSlots(provenance, findings);

  const worst = findings.reduce((m, f) => Math.max(m, SEVERITY_RANK[f.severity] ?? 0), 0);
  const status = worst >= SEVERITY_RANK.requires_review ? 'review'
    : worst >= SEVERITY_RANK.warning ? 'warning'
    : 'good';

  const by = (kind) => findings.filter((f) => f.kind === kind);
  return {
    status,
    // The whole layer is advisory, and several of its rules are opinion.
    provisional: true,
    weeksReviewed: weeks.length,
    strengths: by(FINDING_KIND.STRENGTH),
    opportunities: by(FINDING_KIND.OPPORTUNITY),
    warnings: by(FINDING_KIND.WARNING),
    conflicts: by(FINDING_KIND.CONFLICT),
    findings,
    reasonCodes: [...new Set(findings.map((f) => f.code))].sort(),
    engineVersion: CRITIQUE_VERSION,
  };
}

/** Ordered coach-facing lines: what is wrong first, what is right last. */
export function critiqueSummary(critique) {
  if (!isObj(critique)) return [];
  const order = { conflict: 0, warning: 1, opportunity: 2, strength: 3 };
  return [...(critique.findings || [])]
    .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
      || (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0))
    .map((f) => ({ kind: f.kind, severity: f.severity, code: f.code, message: f.message, provisional: f.provisional }));
}
