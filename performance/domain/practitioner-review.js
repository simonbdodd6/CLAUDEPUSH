// CoachEasier Performance — SC9.21 practitioner review handoff.
//
// The engine has reached the point where the remaining substantive training
// questions are not its to answer. This module organises the evidence it has
// already measured into the form a qualified rugby S&C practitioner can act on:
// for each open question, exactly what is being asked, which programmes it
// affects, what was measured in each, and an empty space to record a decision.
//
// WHAT IT DOES NOT DO
//
// It computes nothing. Every value is read from a review package the engine
// already produced. It forms no view, ranks nothing by importance, and leaves
// every decision field empty — a pre-filled decision would be this engine
// answering a question it has spent five builds establishing it cannot answer.
//
// PREVALENCE IS NOT PRIORITY
//
// Questions are ordered by CODE, alphabetically, deliberately. Prevalence is
// reported as a field because a practitioner may want it, but ordering by it
// would imply that the most widespread question is the most important, and the
// engine has no basis for that claim.
//
// Pure: no DOM, no storage, no clock.

import { EVIDENCE } from './load-attribution.js';
import { DECISION_STATE, GATE_2_RECORD, decisionFor } from './gate-2-decisions.js';

// Re-exported because this module's own callers have always read the state
// from here. The record itself now lives in one place; this is a pointer to it.
export { DECISION_STATE };

export const PRACTITIONER_REVIEW_VERSION = '2026.08-sc921-beta.1';

/**
 * Per-question evidence, pulled from the section of the package that actually
 * measured it. Each returns what the engine recorded for THIS programme, or
 * null where the package holds nothing specific — stated rather than padded.
 */
const EVIDENCE_FOR = {
  acceptable_weekly_increase: (pkg) => {
    const both = (pkg.progression?.transitions || []).filter((t) => t.more && t.harder);
    return both.length ? {
      transitionsRaisingVolumeAndEffort: both.length,
      transitions: both.map((t) => ({
        fromWeek: t.fromWeek, toWeek: t.toWeek, fromRole: t.fromRole, toRole: t.toRole,
        rising: t.rising, volumeDriver: t.volumeDriver,
      })),
    } : null;
  },
  volume_substituting_for_effort: (pkg) => {
    const ec = pkg.progression?.effortCeiling;
    return ec && ec.reachedAtWeek !== null ? {
      effortStoppedRisingAtWeek: ec.reachedAtWeek,
      leversCarryingProgressionAfterwards: ec.leversCarryingProgressionAfterwards,
    } : null;
  },
  max_build_run_conflict: (pkg, q) => (q.data?.longestRun ? {
    longestNonDeloadRun: q.data.longestRun,
    weekRoles: q.data.roles,
    preferredRun: 3,  // week-progression's PREFERRED_BUILD_RUN, quoted not judged
  } : null),
  youth_accumulated_volume: (pkg, q) => ({
    developmentContext: q.data?.developmentContext ?? pkg.context?.developmentContext ?? null,
    peakWeeklySets: q.data?.peakWeeklySets ?? null,
    weeklySets: (pkg.dose?.weekly || []).map((w) => ({
      weekNumber: w.weekNumber, weekRole: w.weekRole, sets: w.total.sets,
    })),
    effortCeilingApplied: (pkg.dose?.weekly || []).reduce((m, w) => (w.effort.maxRpe ?? 0) > m ? w.effort.maxRpe : m, 0),
  }),
  tie_interchangeability: (pkg) => {
    const ties = pkg.tieBreaks || [];
    return ties.length ? {
      decisions: ties.length,
      ties: ties.map((t) => ({
        blockType: t.blockType, session: t.session?.title ?? t.session?.archetype ?? null,
        selected: t.selected, score: t.score,
        candidates: t.candidates.map((c) => c.name), brokenBy: t.brokenBy,
      })),
    } : null;
  },
  positional_programming: (pkg, q) => ({
    position: q.data?.position ?? pkg.context?.position ?? null,
    // The engine records position as a ranking input; whether it changed any
    // outcome is not something the package asserts.
    note: 'Position is a ranking input. The package does not record whether it altered any selection.',
  }),
  main_strength_intent: (pkg) => {
    const ms = (pkg.selectionDecisions || []).filter((d) => d.block?.blueprintBlockType === 'main_strength');
    return ms.length ? {
      mainStrengthDecisions: ms.length,
      selections: ms.map((d) => ({
        exercise: d.selected.name,
        category: d.selected.category,
        primaryQuality: d.selected.primaryQuality,
        pattern: d.selected.pattern,
      })),
    } : null;
  },
};

/**
 * Build the handoff.
 *
 * @param {Array<{programmeId:string, package:object}>} entries
 *   The review packages to organise, each with the id the package does not
 *   carry. `programmeId` must be supplied by the caller: a review package has
 *   no identifier of its own and this module will not invent one —
 *   traceability is the whole point of the handoff.
 *
 * EXACTLY TWO FIELDS, AND NO THIRD.
 *
 * This used to accept an optional `profile` that overrode the athlete summary
 * derived from the package. It was undocumented, no caller supplied it, and
 * the shape it wanted was NOT the SC2 athlete profile every other entry point
 * takes — so the natural mistake, handing it the profile that generated the
 * programme, produced a review reading "undefined/undefined" and "undefined,
 * undefined, undefined, undefined week(s)" with no error and no warning.
 *
 * The package already carries every field that override supplied, and carries
 * them post-resolution: it knows the DEVELOPMENT CONTEXT, which an SC2 profile
 * does not, and the block length, which it also does not. So the override was
 * strictly worse than the thing it replaced. It is gone, and passing one is now
 * refused rather than ignored — a silently dropped argument is the same class
 * of failure as a silently degraded one.
 */
export function buildPractitionerReview(entries = []) {
  if (!Array.isArray(entries)) throw new Error('practitioner_review_requires_entry_array');
  for (const e of entries) {
    if (!e?.programmeId) throw new Error('practitioner_review_requires_programme_id');
    // A package with no openQuestions array is not an empty review — it is the
    // wrong object. Reporting "0 questions outstanding" for it would be the
    // most misleading output this module could produce.
    if (!Array.isArray(e.package?.openQuestions)) {
      throw new Error(`practitioner_review_requires_review_package: ${e.programmeId}`);
    }
    if ('profile' in e) throw new Error(`practitioner_review_profile_not_accepted: ${e.programmeId}`);
  }

  const byCode = new Map();
  for (const { programmeId, package: pkg } of entries) {
    for (const q of pkg.openQuestions) {
      if (!byCode.has(q.code)) {
        byCode.set(q.code, {
          code: q.code,
          evidence: q.evidence,           // requires_professional_judgement
          statements: new Set(),
          affected: [],
        });
      }
      const item = byCode.get(q.code);
      item.statements.add(q.statement);
      const extractor = EVIDENCE_FOR[q.code];
      item.affected.push({
        programmeId,
        // Read from the package, which is the only authority here.
        profile: {
          developmentContext: pkg.context?.developmentContext ?? null,
          experience: pkg.context?.experience ?? null,
          position: pkg.context?.position ?? null,
          phase: pkg.context?.phase ?? null,
          weeks: pkg.summary?.weeks ?? null,
        },
        // The engine's own wording for this programme, verbatim.
        statement: q.statement,
        questionData: q.data ?? {},
        evidence: extractor ? extractor(pkg, q) : null,
      });
    }
  }

  const total = entries.length;
  const items = [...byCode.values()]
    // Alphabetical by code. See the module header: ordering by prevalence would
    // imply an importance the engine cannot establish.
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((item) => {
      const profiles = [...new Set(item.affected
        .map((a) => `${a.profile.developmentContext}/${a.profile.experience}`))].sort();
      const withEvidence = item.affected.filter((a) => a.evidence !== null).length;
      return {
        code: item.code,
        evidence: item.evidence,
        // Kept as a list: the wording varies per programme because it quotes
        // that programme's measurements.
        statements: [...item.statements].sort(),
        prevalence: {
          evidence: EVIDENCE.MEASURED,
          programmes: item.affected.length,
          of: total,
          profiles,
          note: 'A count, not a priority. How much each question matters is the reviewer\'s judgement.',
        },
        evidenceAvailability: {
          evidence: EVIDENCE.MEASURED,
          programmesWithSpecificEvidence: withEvidence,
          programmesWithoutSpecificEvidence: item.affected.length - withEvidence,
          note: withEvidence === item.affected.length
            ? 'Every affected programme carries measured evidence for this question.'
            : 'Some affected programmes carry no evidence specific to this question beyond the fact that it applies.',
        },
        affectedProgrammes: item.affected.map((a) => a.programmeId),
        affected: item.affected,
        decision: decisionFor(item.code),
      };
    });

  return {
    version: PRACTITIONER_REVIEW_VERSION,
    programmesReviewed: total,
    ordering: {
      evidence: EVIDENCE.MEASURED,
      by: 'question_code_alphabetical',
      note: 'Deliberately not ordered by prevalence or by any notion of severity.',
    },
    boundary: {
      evidence: EVIDENCE.JUDGEMENT,
      statement: 'Everything above a decision field is measured engine evidence. Everything in a decision '
        + 'field is a practitioner\'s. Where one was recorded, the decision record is '
        + `${GATE_2_RECORD}; where none was recorded the field is left empty. `
        + 'The engine forms no view of its own on any of these questions, and an unresolved item must not be '
        + 'converted into an engine rule without a recorded decision.',
    },
    items,
    completion: {
      evidence: EVIDENCE.MEASURED,
      total: items.length,
      resolved: items.filter((i) => i.decision.state !== DECISION_STATE.UNRESOLVED).length,
      unresolved: items.filter((i) => i.decision.state === DECISION_STATE.UNRESOLVED).length,
    },
  };
}

/** Markdown rendering. Presentation only — every line restates a field. */
export function renderPractitionerReview(review, { maxProgrammesListed = Infinity } = {}) {
  const L = [];
  const w = (s = '') => L.push(s);

  w('# Performance Intelligence — practitioner review');
  w();
  w('## 1. Purpose');
  w();
  w('The engine has generated and measured a corpus of rugby S&C programmes. It has');
  w('taken every question it can answer as far as measurement allows. What remains');
  w(`are ${review.items.length} questions that require a qualified rugby S&C practitioner.`);
  w();
  w('This document sets out each question, the programmes it affects, and what the');
  w('engine measured in each — so the decision can be made against evidence rather');
  w('than against an opinion.');
  w();
  w('## 2. How to use this review');
  w();
  w('Work through the questions in any order. For each, the evidence is given per');
  w('programme so a claim can be checked rather than taken on trust; the full');
  w('reasoning for any programme is in `professional-review-intelligence.md` under');
  w('its id. Record the decision in the fields provided.');
  w();
  w('## 3. Boundary');
  w();
  w(`> ${review.boundary.statement}`);
  w();
  w(`Questions are ordered ${review.ordering.by.replace(/_/g, ' ')}. ${review.ordering.note}`);
  w();
  w(`## 4. Questions requiring practitioner judgement (${review.items.length})`);
  w();
  w('| Question | Programmes affected | Athlete profiles | Decision |');
  w('| --- | --- | --- | --- |');
  for (const i of review.items) {
    w(`| \`${i.code}\` | ${i.prevalence.programmes} / ${i.prevalence.of} | ${i.prevalence.profiles.length} | ${i.decision.state} |`);
  }
  w();

  for (const [n, item] of review.items.entries()) {
    w(`### 4.${n + 1} \`${item.code}\``);
    w();
    w('**What is being asked**');
    w();
    w(`> ${item.statements[0]}`);
    if (item.statements.length > 1) {
      w('>');
      w(`> *(The engine states this per programme, so the numbers in the wording vary; `
        + `${item.statements.length} variants across the affected programmes. All are kept in the JSON.)*`);
    }
    w();
    w(`**Affects** ${item.prevalence.programmes} of ${item.prevalence.of} programmes, `
      + `across ${item.prevalence.profiles.length} athlete profile(s): ${item.prevalence.profiles.join(', ')}.`);
    w();
    w(`*${item.prevalence.note}*`);
    w();
    if (item.evidenceAvailability.programmesWithoutSpecificEvidence > 0) {
      w(`*Evidence: ${item.evidenceAvailability.note}*`);
      w();
    }
    w('**Affected programmes and what was measured**');
    w();
    for (const a of item.affected.slice(0, maxProgrammesListed)) {
      const p = a.profile;
      w(`- \`${a.programmeId}\``);
      w(`  - ${p.developmentContext} ${p.position ?? ''}, ${p.experience}, ${p.phase}, ${p.weeks} week(s)`.replace(/\s+,/g, ','));
      if (a.evidence) {
        for (const [k, v] of Object.entries(a.evidence)) {
          if (v === null || v === undefined) continue;
          if (k === 'transitions' && Array.isArray(v)) {
            for (const t of v) {
              w(`  - week ${t.fromWeek} → ${t.toWeek} (${t.fromRole} → ${t.toRole}): rose in `
                + `${t.rising.join(', ')}`
                + (t.volumeDriver ? `, led by ${t.volumeDriver.lever} +${t.volumeDriver.pct}%` : ''));
            }
            continue;
          }
          if (k === 'ties' && Array.isArray(v)) {
            for (const t of v) {
              w(`  - ${t.blockType}: ${t.selected?.name ?? t.selected} chosen over `
                + `${t.candidates.filter((c) => c !== (t.selected?.name ?? t.selected)).join(', ')} `
                + `at equal score ${t.score} (${t.brokenBy})`);
            }
            continue;
          }
          if (k === 'selections' && Array.isArray(v)) {
            w(`  - main-strength selections: ${v.map((x) => `${x.exercise} (${x.category}/${x.primaryQuality})`).join('; ')}`);
            continue;
          }
          if (k === 'weeklySets' && Array.isArray(v)) {
            w(`  - weekly sets: ${v.map((x) => `wk${x.weekNumber} ${x.sets}`).join(', ')}`);
            continue;
          }
          if (k === 'weekRoles' && Array.isArray(v)) { w(`  - week roles: ${v.join(' → ')}`); continue; }
          if (Array.isArray(v)) { w(`  - ${k}: ${v.join(', ')}`); continue; }
          if (typeof v === 'object') continue; // nothing else nests; skip rather than dump JSON
          w(`  - ${k}: ${v}`);
        }
      } else {
        w('  - no evidence specific to this question beyond the fact that it applies');
      }
    }
    if (item.affected.length > maxProgrammesListed) {
      w(`- …and ${item.affected.length - maxProgrammesListed} more`);
    }
    w();
    // A recorded decision is printed. Rendering a blank form beside a summary
    // table that says "recorded" made the Markdown strictly less informative
    // than the JSON next to it, and left a reader unable to tell which of the
    // two the document meant.
    const d = item.decision;
    const recorded = d.state === DECISION_STATE.RECORDED;
    w(recorded ? '**Practitioner decision — recorded**' : '**Practitioner decision**');
    w();
    w('| Field | |');
    w('| --- | --- |');
    w(`| Outcome | ${recorded ? d.outcome : ''} |`);
    w(`| Scope (which athletes/contexts) | ${recorded ? d.scope : ''} |`);
    w(`| Rationale | ${recorded ? d.rationale : ''} |`);
    w(`| Implementation (what the engine should change, if anything) | ${recorded ? d.implementation : ''} |`);
    // Never filled by the engine, recorded decision or not: a note is the
    // reviewer's own voice and this module does not have one.
    w('| Notes | |');
    if (recorded) {
      w();
      w(`Recorded at \`${d.recordedAt}\`. Evidence, evidence strength, limitations and the `
        + `alternatives rejected are in \`${d.record}\`.`);
    }
    w();
    w('---');
    w();
  }

  w('## 5. Review completion');
  w();
  w(`| Total questions | ${review.completion.total} |`);
  w('| --- | --- |');
  w(`| Decisions recorded | ${review.completion.resolved} |`);
  w(`| Outstanding | ${review.completion.unresolved} |`);
  w();
  w('```');
  w('Reviewer name:        ................................................');
  w('Qualification:        ................................................');
  w('Rugby S&C experience: ................................................');
  w('Date:                 ................................................');
  w('```');
  w();
  w('## 6. A note on unresolved items');
  w();
  w('An item left without a recorded decision stays unresolved. It must not be');
  w('converted into an engine rule, a default, or a threshold on the strength of');
  w('this document alone — the engine forms no view of its own on any of these');
  w('questions, and a silent default would be indistinguishable from one.');
  w();
  w('A recorded decision is a practitioner\'s, not the engine\'s. It is quoted here so');
  w('the engine\'s behaviour and its explanation of that behaviour agree; the reasoning');
  w(`behind it lives in \`${GATE_2_RECORD}\`, which is the document to challenge.`);
  w();
  w(`*Practitioner review ${review.version}. ${review.programmesReviewed} programmes.*`);
  return L.join('\n');
}
