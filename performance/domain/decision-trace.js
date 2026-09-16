// CoachEasier Performance — SC9.17 decision trace.
//
// Explains a programming decision using the decisions the engine actually
// made. Every statement here is derived from an engine artefact: an
// eligibility exclusion, a ranking reason, a stored progression record, a
// declared slot. Nothing is reconstructed from plausibility.
//
// THE BOUNDARY THIS MODULE DEFENDS
//
// An explanation may say "this exercise passed the equipment filter and
// matched the requested movement pattern" — that is an engine fact.
//
// It may NOT say "this is the best exercise for rugby", or "this dose is
// appropriate", because the engine has no rule establishing either. Where the
// honest answer is "a qualified practitioner decides that", the trace says so
// and stops, using the same evidence vocabulary SC9.15 introduced.
//
// The trace also refuses to overclaim about absence. "No eligible exercise
// satisfied the constraints" is a fact about this athlete. "No suitable
// exercise exists" is a fact about the catalogue, and is only ever stated when
// the catalogue genuinely contains none.
//
// Pure: no DOM, no storage, no clock.

import { explainSelection, isCategoryAllowedInBlock } from './exercise-selection.js';
import { EVIDENCE, attributeBlock, loadObservations } from './load-attribution.js';
import { doseForProgramme } from './training-dose.js';
import { decisionFor } from './gate-2-decisions.js';

export const DECISION_TRACE_VERSION = '2026.08-sc917-beta.1';

export { EVIDENCE };

/**
 * Why a slot holds no exercise. Ordered most specific first; the first that
 * applies is the reason, because they are not independent — an exercise
 * excluded on equipment is never also reported as blocked by block type.
 */
export const UNRESOLVED_REASON = {
  NO_CATALOGUE_CANDIDATE: 'no_catalogue_candidate',
  ALL_CANDIDATES_EXCLUDED: 'all_candidates_excluded',
  BLOCKED_BY_BLOCK_TYPE: 'blocked_by_block_type',
  QUALITY_REQUIREMENT_UNMET: 'quality_requirement_unmet',
  TAKEN_BY_ANOTHER_SLOT: 'taken_by_another_slot',
  UNDIAGNOSED: 'undiagnosed',
};

const hasPattern = (ex, pattern) => !pattern
  || ex?.classification?.pattern === pattern
  || (ex?.classification?.secondaryPatterns || []).includes(pattern);

const tally = (rows, key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});

/**
 * Diagnose an empty slot from the same inputs selection had.
 *
 * `excluded` is partitionEligibility's exclusion list, whose reasons the
 * blueprint currently reduces to a count. Reading it here is what turns
 * "unresolved" into "unresolved because this athlete has no barbell".
 */
export function diagnoseUnresolvedSlot({
  slot, catalogue = [], eligible = [], excluded = [], takenInBlock = [],
}) {
  const pattern = slot?.pattern || null;
  const quality = slot?.quality || null;
  const blockType = slot?.blockType || null;
  const taken = new Set(takenInBlock);

  const inCatalogue = catalogue.filter((ex) => hasPattern(ex, pattern));
  if (!inCatalogue.length) {
    return {
      reason: UNRESOLVED_REASON.NO_CATALOGUE_CANDIDATE,
      evidence: EVIDENCE.MEASURED,
      statement: `The exercise library contains no ${pattern} exercise.`,
      data: { pattern, catalogueMatches: 0 },
    };
  }

  const eligibleMatches = eligible.filter((ex) => hasPattern(ex, pattern));
  if (!eligibleMatches.length) {
    const relevant = excluded.filter((x) => hasPattern(x.exercise, pattern));
    const byCode = tally(relevant, 'code');
    return {
      reason: UNRESOLVED_REASON.ALL_CANDIDATES_EXCLUDED,
      evidence: EVIDENCE.MEASURED,
      // Deliberately about THIS athlete, not about the library.
      statement: `All ${inCatalogue.length} ${pattern} exercise(s) in the library were ruled out for this athlete `
        + `(${Object.entries(byCode).map(([c, n]) => `${c}: ${n}`).join(', ') || 'no reason recorded'}).`,
      data: { pattern, catalogueMatches: inCatalogue.length, exclusionsByCode: byCode },
    };
  }

  const admissible = blockType
    ? eligibleMatches.filter((ex) => isCategoryAllowedInBlock(ex, blockType))
    : eligibleMatches;
  if (!admissible.length) {
    return {
      reason: UNRESOLVED_REASON.BLOCKED_BY_BLOCK_TYPE,
      evidence: EVIDENCE.MEASURED,
      statement: `Every eligible ${pattern} exercise is a preparation-category movement, which a `
        + `${blockType} block does not take.`,
      data: { pattern, blockType, categories: [...new Set(eligibleMatches.map((e) => e.classification?.category))] },
    };
  }

  if (quality) {
    const qualified = admissible.filter((ex) => ex.classification?.primaryQuality === quality);
    if (!qualified.length) {
      return {
        reason: UNRESOLVED_REASON.QUALITY_REQUIREMENT_UNMET,
        evidence: EVIDENCE.MEASURED,
        statement: `No eligible ${pattern} exercise has ${quality} as its primary quality, which this slot requires.`,
        data: {
          pattern, quality,
          availableQualities: [...new Set(admissible.map((e) => e.classification?.primaryQuality))],
        },
      };
    }
    const free = qualified.filter((ex) => !taken.has(ex.id));
    if (!free.length) {
      return {
        reason: UNRESOLVED_REASON.TAKEN_BY_ANOTHER_SLOT,
        evidence: EVIDENCE.MEASURED,
        statement: `The only eligible ${quality} ${pattern} exercise is already prescribed elsewhere in this block.`,
        data: { pattern, quality, taken: qualified.filter((ex) => taken.has(ex.id)).map((ex) => ex.id) },
      };
    }
  } else {
    const free = admissible.filter((ex) => !taken.has(ex.id));
    if (!free.length) {
      return {
        reason: UNRESOLVED_REASON.TAKEN_BY_ANOTHER_SLOT,
        evidence: EVIDENCE.MEASURED,
        statement: `Every eligible ${pattern} exercise is already prescribed elsewhere in this block.`,
        data: { pattern, taken: admissible.filter((ex) => taken.has(ex.id)).map((ex) => ex.id) },
      };
    }
  }

  // Reaching here means a candidate existed and selection still returned
  // nothing. Saying so plainly is better than inventing a reason.
  return {
    reason: UNRESOLVED_REASON.UNDIAGNOSED,
    evidence: EVIDENCE.MEASURED,
    statement: 'A candidate was available but no exercise was selected; the trace cannot account for this.',
    data: { pattern, quality, blockType },
  };
}

/**
 * Trace one slot: what was asked, what was considered, what won and why —
 * or, when nothing won, why not.
 */
export function traceSlot({
  slot, catalogue = [], eligible = [], excluded = [], takenInBlock = [], context = {},
}) {
  const taken = new Set(takenInBlock);
  const available = taken.size ? eligible.filter((ex) => !taken.has(ex.id)) : eligible;
  const decision = explainSelection(available, slot);

  const request = {
    pattern: slot?.pattern ?? null,
    quality: slot?.quality ?? null,
    blockType: slot?.blockType ?? null,
    developmentContext: context.developmentContext ?? null,
    experience: context.experience ?? null,
    phase: context.phase ?? null,
    position: context.position ?? null,
  };

  if (!decision.selected) {
    return {
      request,
      selected: null,
      unresolved: diagnoseUnresolvedSlot({ slot, catalogue, eligible, excluded, takenInBlock }),
      candidatesConsidered: decision.candidatesConsidered,
    };
  }

  const ex = decision.selected.exercise;
  const tied = decision.tiedWithWinner;
  return {
    request,
    selected: {
      exerciseId: ex.id,
      name: ex.name,
      category: ex.classification?.category ?? null,
      primaryQuality: ex.classification?.primaryQuality ?? null,
      pattern: ex.classification?.pattern ?? null,
      score: decision.selected.score,
      // The engine's own ranking reasons, verbatim — not a retelling.
      reasons: decision.selected.reasons || [],
    },
    candidatesConsidered: decision.candidatesConsidered,
    // Only present when the outcome actually rested on the tie-break.
    tie: tied.length > 1 ? {
      evidence: EVIDENCE.MEASURED,
      score: decision.selected.score,
      candidates: tied.map((r) => ({
        exerciseId: r.exercise.id, name: r.exercise.name,
        category: r.exercise.classification?.category ?? null,
        primaryQuality: r.exercise.classification?.primaryQuality ?? null,
      })),
      brokenBy: decision.tieBreak,
      statement: `${tied.length} candidates scored ${decision.selected.score}; the winner was decided by `
        + 'alphabetical slug order, which carries no coaching meaning.',
      // Stated, not resolved: whether these are interchangeable is not an
      // engine fact.
      openQuestion: {
        evidence: EVIDENCE.JUDGEMENT,
        statement: 'Whether these candidates are interchangeable for this slot requires a qualified practitioner.',
      },
    } : null,
    // Reported so a coach can see what the block type removed from contention.
    excludedByBlockType: decision.blockedByBlockType
      .filter((e) => hasPattern(e, slot?.pattern))
      .map((e) => ({ exerciseId: e.id, name: e.name, category: e.classification?.category ?? null })),
  };
}

/**
 * Trace how a stored prescription was dosed and progressed.
 *
 * Everything here is read from the programme, not recomputed: the engine
 * already records which dimensions its wave moved and why.
 */
export function tracePrescription(prescription, { exercise = null, week = null } = {}) {
  const first = prescription?.sets?.[0]?.fields || {};
  const declared = exercise?.prescription || [];
  const present = ['reps', 'holdSec', 'distanceM', 'durationSec'].filter((f) => Number.isFinite(first[f]));
  const prog = prescription?.progression || null;

  return {
    exerciseId: prescription?.exerciseId ?? null,
    sets: prescription?.sets?.length ?? 0,
    fields: first,
    prescriptionType: {
      evidence: EVIDENCE.MEASURED,
      declaredByExercise: declared,
      declaredPrimary: declared[0] ?? null,
      dosedAs: present,
      statement: declared[0]
        ? `The exercise declares ${declared[0]} first, and is dosed in ${present.join(', ') || 'sets alone'}.`
        : 'The exercise declares no prescription types.',
    },
    progression: prog ? {
      evidence: EVIDENCE.MEASURED,
      progressed: prog.progressed,
      dimensionsChanged: prog.changed || [],
      method: prog.method ?? null,
      // The engine records week 1 as `progressed: true` with nothing changed,
      // because the wave ran and moved no dimension. "Changed: nothing" reads
      // as a contradiction, so an empty change list is stated as what it is.
      statement: !prog.progressed ? 'Held at the starting dose.'
        : (prog.changed || []).length ? `Changed against the starting dose: ${prog.changed.join(', ')}.`
          : 'Unchanged from the starting dose.',
    } : null,
    weekContext: week ? {
      evidence: EVIDENCE.MEASURED,
      weekNumber: week.weekNumber ?? null,
      weekRole: week.weekRole ?? null,
      // The wave's own recorded reasons, verbatim.
      reasons: week.progressionReasons || [],
    } : null,
  };
}

// ── Whole-programme trace (SC9.18) ─────────────────────────────────────────
//
// Composes the per-decision explanations above into one reviewable account of
// a generated programme.
//
// IT CONSUMES; IT DOES NOT REGENERATE. Every selection it reports is read from
// the blueprint the engine actually produced — the exercise, its score and its
// ranking reasons are all recorded there. Nothing is re-ranked, so the trace
// cannot disagree with the programme by construction.
//
// The one thing the blueprint does NOT record is which candidates a pick beat.
// Tie context is therefore opt-in: supply `tieContext` and the trace consults
// the engine's own `explainSelection` for the competing candidates, keeping the
// blueprint authoritative for the winner and REPORTING any disagreement rather
// than silently preferring one. Without it the trace says tie context was
// unavailable rather than implying no ties occurred.

/**
 * Join key between the two representations.
 *
 * `blueprint-to-programme` assigns `order: bi + 1` from the blueprint block
 * index BEFORE dropping blocks that produced nothing, so order survives the
 * filter and identifies the source block exactly. Matching by blockType would
 * be wrong: `trunk` is mapped onto `accessory`, so a session can hold two
 * blocks with the same name.
 */
const blueprintIndexOf = (programmeBlock) => (programmeBlock?.order ?? 0) - 1;

/** Programme-level context, entirely from what generation recorded. */
function programmeContext(blueprint, analysis) {
  const input = blueprint?.input || {};
  return {
    evidence: EVIDENCE.MEASURED,
    developmentContext: blueprint?.developmentContext?.context ?? null,
    experience: input.experience ?? null,
    position: input.position ?? null,
    phase: input.phase ?? null,
    // The blueprint stores a minimised input and deliberately omits equipment,
    // so the trace reports it only when the caller supplies the eligibility
    // context it came from — never as "none".
    equipment: input.equipment ?? analysis?.equipment ?? null,
    equipmentRecordedInBlueprint: input.equipment !== undefined,
    // Read from the blueprint, not re-derived. The blueprint's `input` is a
    // minimised copy without `rugbyDays`, so recomputing here counted only the
    // match day: an athlete generated against three commitments — two team
    // sessions and a match, which is what reduced the dose to very_low — was
    // explained as carrying one. `null` where a blueprint predates the field,
    // which the renderer reports as unrecorded rather than as a number.
    rugbyLoad: blueprint?.rugbyLoad ?? null,
    frequency: blueprint?.frequency ?? null,
    volumeCategory: blueprint?.volumeCategory ?? null,
    intensityCategory: blueprint?.intensityCategory ?? null,
    engineVersion: blueprint?.engineVersion ?? null,
    provisional: blueprint?.provisional ?? null,
    flags: blueprint?.flags || [],
    // The engine's own stated reasons for the dose it chose.
    reasons: blueprint?.reasons || [],
  };
}

/**
 * Slot declarations for a block, read from the archetype plan.
 *
 * This is a static declaration of what the block asks for — not a re-run of
 * selection. It supplies the `quality` an unresolved slot needs for an accurate
 * diagnosis, which the blueprint records only as a pattern.
 */
function slotsForBlock(analysis, archetype, blockType) {
  const plan = analysis?.plans?.[archetype] || [];
  const block = plan.find((b) => b.type === blockType);
  return block?.slots || [];
}

/** Tie context for one recorded pick, or null when not requested/available. */
function tieFor(pick, bpBlock, archetype, analysis) {
  if (!analysis?.eligible) return null;
  const slots = slotsForBlock(analysis, archetype, bpBlock.blockType);
  if (!slots.length) return null;
  // Consult the engine's own selection function for the candidates the
  // blueprint did not keep. The winner still comes from the blueprint.
  for (const slot of slots) {
    const d = explainSelection(analysis.eligible, { ...analysis.slotDefaults, ...slot, blockType: bpBlock.blockType });
    if (d.selected?.exercise?.id !== pick.exerciseId) continue;
    if (d.tiedWithWinner.length <= 1) return null;
    return {
      evidence: EVIDENCE.MEASURED,
      score: d.selected.score,
      candidates: d.tiedWithWinner.map((r) => ({
        exerciseId: r.exercise.id, name: r.exercise.name,
        category: r.exercise.classification?.category ?? null,
        primaryQuality: r.exercise.classification?.primaryQuality ?? null,
      })),
      brokenBy: d.tieBreak,
      statement: `${d.tiedWithWinner.length} candidates scored ${d.selected.score}; the winner was decided by `
        + 'alphabetical slug order, which carries no coaching meaning.',
      openQuestion: {
        evidence: EVIDENCE.JUDGEMENT,
        statement: 'Whether these candidates are interchangeable for this slot requires a qualified practitioner.',
      },
    };
  }
  return null;
}

/**
 * The professional questions this programme actually raises.
 *
 * Derived from measured facts about THIS athlete's block, not recited as a
 * standing list — a 3-week adult block should not be asked about youth volume
 * ceilings. Each is surfaced, never answered: they are the questions SC9.11
 * onwards has been unable to settle without a qualified practitioner.
 */
function openQuestions({ context, dose, attribution, counts }) {
  const out = [];
  // The STATEMENT says what this athlete's block shows and what the engine does
  // not settle from it. The DECISION says whether the policy question behind it
  // was answered at Gate 2, read from the one module that holds that record.
  // Keeping them apart is what stops the two halves contradicting each other: a
  // statement can no longer claim a question is undecided while the decision
  // beside it quotes the answer, because the statement no longer makes that
  // claim at all.
  const ask = (code, statement, data = {}) =>
    out.push({ code, evidence: EVIDENCE.JUDGEMENT, statement, data, decision: decisionFor(code) });

  const roles = (dose?.weekly || []).map((w) => w.weekRole);
  let run = 0, longestRun = 0;
  for (const r of roles) { if (r === 'deload') run = 0; else { run += 1; longestRun = Math.max(longestRun, run); } }
  if (longestRun > 3) {
    ask('max_build_run_conflict',
      `This block runs ${longestRun} consecutive non-deload weeks, against a preferred run of 3. `
      + 'The run is preferred rather than enforced; whether this block length suits this athlete '
      + 'is a coaching call the engine does not make.',
      { longestRun, roles });
  }
  if (attribution?.simultaneous?.volumeAndEffort > 0) {
    ask('acceptable_weekly_increase',
      `${attribution.simultaneous.volumeAndEffort} week transition(s) raised volume and effort together. `
      + 'The engine applies no ceiling to a single-week increase; whether these increases suit this '
      + 'athlete is a coaching call the engine does not make.',
      { transitions: attribution.simultaneous.volumeAndEffort });
  }
  const ceiling = attribution?.effortCeiling;
  if (ceiling?.reachedAtWeek !== null && ceiling?.leversCarryingProgressionAfterwards?.length) {
    ask('volume_substituting_for_effort',
      `Effort stopped rising at week ${ceiling.reachedAtWeek} and progression continued through `
      + `${ceiling.leversCarryingProgressionAfterwards.join(', ')}. Main-strength repetitions are bounded; `
      + 'accessory volume is deliberately not, and whether it suits this athlete is a coaching call.',
      ceiling);
  }
  if (context?.developmentContext && context.developmentContext !== 'adult') {
    const peak = (dose?.weekly || []).reduce((m, w) => Math.max(m, w.total.sets), 0);
    ask('youth_accumulated_volume',
      `This is a ${context.developmentContext} athlete peaking at ${peak} prescribed sets in a week. The engine `
      + 'caps youth effort and session frequency and holds resistance repetitions inside the NSCA band; '
      + 'it applies no accumulated-volume ceiling, which remains genuinely open.',
      { developmentContext: context.developmentContext, peakWeeklySets: peak });
  }
  if (counts?.ties > 0) {
    const distinct = counts.distinctTies ?? counts.ties;
    ask('tie_interchangeability',
      `${distinct} selection decision(s) rested on the alphabetical tie-break, which carries no coaching `
      + 'meaning. Which of the tied candidates suits this athlete is a coaching call the engine does not make.',
      { decisions: distinct, occurrences: counts.ties });
  }
  if (context?.position) {
    ask('positional_programming',
      `Position (${context.position}) was an input to ranking and did not gate any slot. The engine does not `
      + 'record whether it altered a selection in this programme.',
      { position: context.position });
  }
  ask('main_strength_intent',
    'Main-strength slots admit strength-category exercises only. Whether the exercises admitted suit this '
    + 'athlete is a coaching call the engine does not make.');
  return out;
}

/**
 * Trace a whole generated programme.
 *
 * @param {object} programme   the programme the engine produced
 * @param {object} blueprint   the blueprint it was built from
 * @param {{catalogue?:Array, versionIndex?:number, phaseIndex?:number, tieContext?:object}} opts
 */
export function traceProgramme(programme, blueprint, {
  catalogue = [], versionIndex = 0, phaseIndex = 0, analysis = null,
} = {}) {
  const byId = catalogue instanceof Map ? catalogue : new Map(catalogue.map((e) => [e.id, e]));
  const version = programme?.versions?.[versionIndex];
  const phase = version?.phases?.[phaseIndex];
  const weeks = phase?.weeks || [];
  const bpSessions = blueprint?.sessions || [];

  const disagreements = [];
  const unresolvedAll = [];
  const tiesAll = [];
  let blocksTraced = 0, slotsTraced = 0, prescriptionsTraced = 0;

  const tracedWeeks = weeks.map((week) => {
    const days = (week.days || []).map((day, di) => {
      const bpSession = bpSessions[di] || null;
      const sessions = (day.sessions || []).map((session) => {
        const blocks = (session.blocks || []).map((block) => {
          const bi = blueprintIndexOf(block);
          const bpBlock = bpSession?.blocks?.[bi] || null;
          blocksTraced += 1;

          // Resolved slots: the blueprint's recorded picks, paired with the
          // prescription generation built from each, in the same order.
          const picks = bpBlock?.exercises || [];
          const prescriptions = block.prescriptions || [];
          const slots = picks.map((pick, pi) => {
            const prescription = prescriptions[pi] || null;
            slotsTraced += 1;
            if (prescription) prescriptionsTraced += 1;
            if (prescription && prescription.exerciseId !== pick.exerciseId) {
              disagreements.push({
                weekNumber: week.weekNumber, blockType: block.blockType, index: pi,
                blueprint: pick.exerciseId, programme: prescription.exerciseId,
              });
            }
            const ex = byId.get(pick.exerciseId) || null;
            const tie = bpBlock ? tieFor(pick, bpBlock, bpSession?.archetype, analysis) : null;
            // Keyed by WHERE the decision was made, so the same decision
            // repeated in every week counts once. A reviewer asked to audit
            // "12 ties" that are really 3 decisions seen four times has been
            // given a misleading number.
            if (tie) {
              tiesAll.push({
                key: `${bpSession?.archetype}|${bpBlock?.blockType}|${pi}`,
                weekNumber: week.weekNumber, blockType: block.blockType, ...tie,
              });
            }
            return {
              selected: {
                evidence: EVIDENCE.MEASURED,
                exerciseId: pick.exerciseId,
                name: pick.name ?? ex?.name ?? null,
                category: ex?.classification?.category ?? null,
                primaryQuality: ex?.classification?.primaryQuality ?? null,
                pattern: ex?.classification?.pattern ?? null,
                score: pick.score ?? null,
                // Verbatim from the blueprint — the engine's own words.
                reasons: pick.reasons || [],
              },
              prescription: prescription ? tracePrescription(prescription, { exercise: ex, week }) : null,
              tie,
            };
          });

          // Unresolved slots keep the diagnosis generation recorded.
          const unresolved = (bpBlock?.unresolvedSlots || []).map((u) => {
            // The blueprint records only that a slot went unfilled. When
            // eligibility context is supplied the trace classifies WHY, using
            // the same diagnosis SC9.17 defined — a classification of the
            // eligibility data, not a re-run of selection.
            let diagnosis = null;
            if (analysis?.eligible) {
              const declared = slotsForBlock(analysis, bpSession?.archetype, bpBlock.blockType)
                .find((sl) => sl.pattern === u.pattern) || { pattern: u.pattern };
              diagnosis = diagnoseUnresolvedSlot({
                slot: { ...declared, blockType: bpBlock.blockType },
                catalogue: analysis.catalogue || catalogue,
                eligible: analysis.eligible,
                excluded: analysis.excluded || [],
                takenInBlock: picks.map((pk) => pk.exerciseId),
              });
            }
            const entry = {
              evidence: EVIDENCE.MEASURED,
              pattern: u.pattern ?? null,
              // What generation recorded, always.
              reason: u.reason?.code ?? null,
              statement: u.reason?.text ?? null,
              // The finer classification, only when it could be established.
              diagnosis,
              prescribed: false,
            };
            unresolvedAll.push({ weekNumber: week.weekNumber, blockType: block.blockType, ...entry });
            return entry;
          });

          return {
            blockType: block.blockType,
            blueprintBlockType: bpBlock?.blockType ?? null,
            // Recorded because trunk is mapped onto accessory downstream and a
            // reviewer reading "accessory" twice deserves to know why.
            blockTypeMapped: !!bpBlock && bpBlock.blockType !== block.blockType,
            collectionRefs: block.collectionRefs || [],
            slots,
            unresolvedSlots: unresolved,
          };
        });
        return {
          title: session.title ?? null,
          archetype: bpSession?.archetype ?? null,
          purpose: session.purpose ?? null,
          estimatedMinutes: session.estimatedMinutes ?? null,
          blocks,
        };
      });
      return { day: day.day ?? null, rugbyRelation: day.rugbyRelation ?? null, sessions };
    });

    return {
      weekNumber: week.weekNumber ?? null,
      weekRole: week.weekRole ?? null,
      objective: week.objective ?? null,
      plannedVolume: week.plannedVolume ?? null,
      plannedIntensity: week.plannedIntensity ?? null,
      progression: {
        evidence: EVIDENCE.MEASURED,
        // Verbatim: the wave's own recorded reasons for this week.
        reasons: week.progressionReasons || [],
      },
      days,
    };
  });

  const observations = [];
  if (unresolvedAll.length) {
    const byReason = {};
    for (const u of unresolvedAll) {
      const key = u.diagnosis?.reason || u.reason;
      byReason[key] = (byReason[key] || 0) + 1;
    }
    observations.push({
      code: 'unresolved_slots', evidence: EVIDENCE.MEASURED,
      statement: `${unresolvedAll.length} slot(s) across the block were left unprescribed for the coach to complete.`,
      data: { total: unresolvedAll.length, byReason },
    });
  }
  if (tiesAll.length) {
    const distinct = new Set(tiesAll.map((t) => t.key)).size;
    observations.push({
      code: 'deterministic_ties', evidence: EVIDENCE.MEASURED,
      statement: `${distinct} selection decision(s) rested on the alphabetical tie-break `
        + `(${tiesAll.length} prescription(s) across the block).`,
      data: { decisions: distinct, occurrences: tiesAll.length },
    });
  }
  if (!analysis) {
    observations.push({
      code: 'analysis_context_unavailable', evidence: EVIDENCE.MEASURED,
      statement: 'Eligibility context was not supplied. The blueprint does not record beaten candidates or '
        + 'why a slot went unfilled, so this trace makes no claim about ties and reports only the '
        + 'generic unfilled reason generation stored.',
      data: {},
    });
  }
  if (disagreements.length) {
    observations.push({
      code: 'trace_disagreement', evidence: EVIDENCE.MEASURED,
      statement: `${disagreements.length} prescription(s) do not match the blueprint pick they were built from.`,
      data: { disagreements },
    });
  }

  // Compose the existing measurement layers rather than recomputing anything.
  const dose = doseForProgramme(weeks, { catalogue });
  const attribution = attributeBlock(dose);
  for (const o of loadObservations(dose, attribution)) observations.push(o);

  const counts = {
    weeks: tracedWeeks.length,
    blocks: blocksTraced,
    slots: slotsTraced,
    prescriptions: prescriptionsTraced,
    unresolvedSlots: unresolvedAll.length,
    // Per-week occurrences, and the distinct decisions behind them.
    ties: tiesAll.length,
    distinctTies: new Set(tiesAll.map((t) => t.key)).size,
    disagreements: disagreements.length,
  };

  const context = programmeContext(blueprint, analysis);
  return {
    version: DECISION_TRACE_VERSION,
    context,
    weeks: tracedWeeks,
    // What the engine MEASURED about the load it prescribed.
    dose: {
      evidence: EVIDENCE.MEASURED,
      block: dose.block,
      weekly: dose.weekly.map((w) => ({
        weekNumber: w.weekNumber, weekRole: w.weekRole, sessionCount: w.sessionCount,
        total: w.total, effort: w.effort,
      })),
      // Already computed by the dose layer; exposed so nothing downstream has
      // to recompute session arrangement from the programme again.
      density: dose.density,
      byPattern: dose.byPattern,
      byQuality: dose.byQuality,
    },
    // Which lever moved, week to week.
    attribution: {
      evidence: EVIDENCE.MEASURED,
      simultaneous: attribution.simultaneous,
      effortCeiling: attribution.effortCeiling,
      transitions: attribution.transitions.map((t) => ({
        fromWeek: t.fromWeek, toWeek: t.toWeek, fromRole: t.fromRole, toRole: t.toRole,
        more: t.more, harder: t.harder, moreOften: t.moreOften,
        rising: t.rising, falling: t.falling, volumeDriver: t.volumeDriver,
      })),
    },
    observations,
    // Surfaced, never answered.
    openQuestions: openQuestions({ context, dose, attribution, counts }),
    counts,
  };
}

/**
 * Render a programme trace as text.
 *
 * Presentation only: every line is a field from the structured trace, so the
 * renderer cannot introduce a claim the trace does not hold. The structure is
 * the product; this is one view of it.
 */
export function renderProgrammeTrace(trace, { maxWeeks = Infinity } = {}) {
  const L = [];
  const c = trace.context;
  L.push('PROGRAMME EXPLANATION');
  L.push('');
  L.push('ATHLETE CONTEXT');
  L.push(`- Development context: ${c.developmentContext ?? 'unknown'}`);
  L.push(`- Training age: ${c.experience ?? 'unknown'}`);
  L.push(`- Position: ${c.position ?? 'not recorded'}`);
  L.push(`- Season phase: ${c.phase ?? 'unknown'}`);
  L.push(`- Rugby load: ${c.rugbyLoad === null ? 'not recorded'
    : `${c.rugbyLoad} team session(s)/match per week`}`);
  L.push(`- Equipment: ${(c.equipment?.locations || []).join(', ')
    || (c.equipmentRecordedInBlueprint ? 'none recorded' : 'not carried in the blueprint')}`);
  L.push('');
  L.push('PROGRAMME STRUCTURE');
  L.push(`- ${trace.counts.weeks} week(s), ${c.frequency ?? '?'} session(s) per week`);
  L.push(`- Dose categories: ${c.volumeCategory} volume, ${c.intensityCategory} intensity`);
  L.push(`- ${trace.counts.blocks} block(s), ${trace.counts.prescriptions} prescription(s), `
    + `${trace.counts.unresolvedSlots} unfilled slot(s)`);
  L.push('');

  for (const w of trace.weeks.slice(0, maxWeeks)) {
    L.push(`WEEK ${w.weekNumber} — ${w.weekRole ?? 'week'}`);
    for (const r of w.progression.reasons) L.push(`  · ${r.detail ?? r.code}`);
    for (const d of w.days) {
      for (const s of d.sessions) {
        L.push(`  ${d.day ?? 'unscheduled'} — ${s.title ?? s.archetype}`);
        for (const b of s.blocks) {
          const label = b.blockTypeMapped ? `${b.blockType} (from ${b.blueprintBlockType})` : b.blockType;
          for (const slot of b.slots) {
            const p = slot.prescription;
            const dose = p ? `${p.sets} × ${p.fields.reps ?? p.fields.holdSec ? (p.fields.holdSec ? p.fields.holdSec + 's hold' : p.fields.reps) : (p.fields.distanceM ? p.fields.distanceM + 'm' : 'sets')}` : '—';
            L.push(`    [${label}] ${slot.selected.name} — ${dose}`
              + (p?.fields?.rpe != null ? ` @ RPE ${p.fields.rpe}` : ''));
            const why = slot.selected.reasons.map((r) => r.text).join(' ');
            if (why) L.push(`        why: ${why}`);
            if (slot.tie) {
              L.push(`        tie: ${slot.tie.candidates.map((x) => x.name).join(' / ')} — ${slot.tie.statement}`);
              L.push(`        open: ${slot.tie.openQuestion.statement}`);
            }
            if (p?.progression?.progressed) L.push(`        progression: ${p.progression.statement}`);
          }
          for (const u of b.unresolvedSlots) {
            L.push(`    [${label}] ${u.pattern}: NOT PRESCRIBED`);
            L.push(`        ${u.diagnosis?.statement ?? u.statement}`);
          }
        }
      }
    }
    L.push('');
  }

  L.push('PROGRESSION');
  for (const t of trace.attribution.transitions) {
    const levers = [t.more && 'more work', t.harder && 'harder', t.moreOften && 'more often']
      .filter(Boolean).join(', ') || 'no increase';
    L.push(`- Week ${t.fromWeek} → ${t.toWeek} (${t.fromRole} → ${t.toRole}): ${levers}`
      + (t.volumeDriver ? ` — led by ${t.volumeDriver.lever} +${t.volumeDriver.pct}%` : ''));
  }
  const ec = trace.attribution.effortCeiling;
  if (ec.reachedAtWeek !== null) {
    L.push(`- Effort stopped rising at week ${ec.reachedAtWeek}`
      + (ec.leversCarryingProgressionAfterwards.length
        ? `; progression continued through ${ec.leversCarryingProgressionAfterwards.join(', ')}`
        : ''));
  }
  L.push('');
  L.push('OBSERVATIONS');
  for (const o of trace.observations) L.push(`- [${o.evidence}] ${o.statement}`);
  L.push('');
  L.push('PROFESSIONAL QUESTIONS — the engine raises these and does not answer them');
  for (const q of trace.openQuestions) {
    L.push(`- ${q.statement}`);
    // A recorded decision is a practitioner's, quoted with the record it came
    // from. Printing it here is what keeps this section from telling a reader a
    // question is open while the same trace holds the answer.
    if (q.decision?.state === 'recorded') {
      L.push(`    decided at ${q.decision.recordedAt}: ${q.decision.outcome}`);
      L.push(`    scope: ${q.decision.scope} — see ${q.decision.record}`);
    } else {
      L.push('    no decision recorded.');
    }
  }
  return L.join('\n');
}
