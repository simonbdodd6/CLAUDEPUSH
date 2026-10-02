// CoachEasier Performance — SC9.19 professional review package.
//
// Reorganises the SC9.18 whole-programme trace into the shape a qualified
// rugby S&C practitioner actually reviews in, and composes the two existing
// intelligence layers the trace does not yet carry: the SC9.7 critique and the
// SC9.14 session-density measurements.
//
// IT ADDS NO REASONING. Every fact here comes from the trace, the critique or
// the dose layer. Nothing is re-ranked, recomputed or re-decided, and no
// verdict is formed — the reviewer's conclusion is left empty for a human,
// because whether a programme is good coaching is exactly the question this
// engine does not answer.
//
// WHY IT IS NOT JUST THE TRACE
//
// The trace is programme-ordered and repeats every selection in every week: a
// 6-week block traces the same Back Squat decision six times. But a selection
// is decided ONCE, per blueprint slot, and then dosed weekly. A reviewer
// auditing selection wants each decision once with its weekly doses attached;
// a reviewer auditing progression wants the weeks. This package provides both
// views over the same underlying trace.
//
// Pure: no DOM, no storage, no clock.

import { EVIDENCE } from './load-attribution.js';
import { traceProgramme } from './decision-trace.js';

export const REVIEW_PACKAGE_VERSION = '2026.08-sc919-beta.1';

/**
 * The critique states why each of its rules is allowed to speak
 * (`RULE_BASIS`). Mapping that onto the evidence vocabulary keeps ONE scale
 * across the product rather than presenting a reviewer with two.
 */
const BASIS_TO_EVIDENCE = {
  product_constraint: EVIDENCE.MEASURED,
  deterministic_rule: EVIDENCE.MEASURED,
  provisional_heuristic: EVIDENCE.PROVISIONAL,
};

const evidenceForFinding = (f) => BASIS_TO_EVIDENCE[f?.basis] ?? EVIDENCE.PROVISIONAL;

/** Walk every traced slot with its location. */
function* eachSlot(trace) {
  for (const w of trace.weeks) {
    for (const d of w.days) {
      for (const s of d.sessions) {
        for (const b of s.blocks) {
          for (const [i, slot] of b.slots.entries()) {
            yield { week: w, day: d, session: s, block: b, slot, index: i };
          }
        }
      }
    }
  }
}

function* eachUnresolved(trace) {
  for (const w of trace.weeks) {
    for (const d of w.days) {
      for (const s of d.sessions) {
        for (const b of s.blocks) {
          for (const u of b.unresolvedSlots) yield { week: w, session: s, block: b, unresolved: u };
        }
      }
    }
  }
}

/**
 * One selection decision, with every week's dose of it.
 *
 * Keyed by where the decision was made — session, block, position in the block
 * — not by exercise, because the same exercise legitimately fills different
 * slots and each is a separate decision.
 */
function selectionDecisions(trace) {
  const byKey = new Map();
  for (const { week, session, block, slot, index } of eachSlot(trace)) {
    const key = `${session.archetype}|${block.blueprintBlockType ?? block.blockType}|${index}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        session: { title: session.title, archetype: session.archetype },
        block: {
          blockType: block.blockType,
          blueprintBlockType: block.blueprintBlockType,
          blockTypeMapped: block.blockTypeMapped,
        },
        positionInBlock: index + 1,
        selected: slot.selected,
        // Verbatim from the trace, which took them from the blueprint.
        reasons: slot.selected.reasons,
        tie: slot.tie,
        prescriptionType: slot.prescription?.prescriptionType ?? null,
        weeklyDose: [],
      });
    }
    const entry = byKey.get(key);
    const p = slot.prescription;
    entry.weeklyDose.push({
      weekNumber: week.weekNumber,
      weekRole: week.weekRole,
      sets: p?.sets ?? null,
      fields: p?.fields ?? null,
      progression: p?.progression ?? null,
    });
  }
  return [...byKey.values()];
}

/** Unresolved slots, one entry per distinct slot rather than once per week. */
function unresolvedDecisions(trace) {
  const byKey = new Map();
  for (const { week, session, block, unresolved } of eachUnresolved(trace)) {
    const key = `${session.archetype}|${block.blueprintBlockType ?? block.blockType}|${unresolved.pattern}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        session: { title: session.title, archetype: session.archetype },
        blockType: block.blockType,
        pattern: unresolved.pattern,
        evidence: unresolved.evidence,
        // What generation recorded, and the finer classification when the
        // eligibility context allowed one to be established.
        recordedReason: unresolved.reason,
        recordedStatement: unresolved.statement,
        diagnosis: unresolved.diagnosis,
        weeksAffected: [],
      });
    }
    byKey.get(key).weeksAffected.push(week.weekNumber);
  }
  return [...byKey.values()];
}

/** Distinct tie-break decisions. */
function tieDecisions(decisions) {
  return decisions.filter((d) => d.tie).map((d) => ({
    key: d.key,
    session: d.session,
    blockType: d.block.blockType,
    selected: { exerciseId: d.selected.exerciseId, name: d.selected.name },
    score: d.tie.score,
    candidates: d.tie.candidates,
    brokenBy: d.tie.brokenBy,
    evidence: d.tie.evidence,
    statement: d.tie.statement,
    openQuestion: d.tie.openQuestion,
  }));
}

/**
 * Build the review package.
 *
 * @param {object} opts.programme   the generated programme
 * @param {object} opts.blueprint   the blueprint it came from
 * @param {object} [opts.critique]  a SC9.7 critique of the same programme
 * @param {object} [opts.analysis]  eligibility context, for diagnoses and ties
 */
export function buildReviewPackage({
  programme, blueprint, catalogue = [], analysis = null, critique = null, trace = null,
}) {
  // Consume the existing trace; build one only if the caller did not.
  const t = trace || traceProgramme(programme, blueprint, { catalogue, analysis });

  const decisions = selectionDecisions(t);
  const unresolved = unresolvedDecisions(t);
  const ties = tieDecisions(decisions);

  // Density is taken from the dose layer verbatim — it was measured there.
  const density = t.dose.density || [];

  // Critique findings, carried across with their own vocabulary preserved and
  // an evidence class attached from the basis the critique already declares.
  const critiqueFindings = (critique?.findings || []).map((f) => ({
    code: f.code,
    kind: f.kind,
    severity: f.severity,
    basis: f.basis,
    evidence: evidenceForFinding(f),
    message: f.message,
    provisional: f.provisional ?? null,
  }));

  const evidenceRollup = {};
  const count = (e) => { evidenceRollup[e] = (evidenceRollup[e] || 0) + 1; };
  for (const o of t.observations) count(o.evidence);
  for (const f of critiqueFindings) count(f.evidence);
  for (const q of t.openQuestions) count(q.evidence);

  return {
    version: REVIEW_PACKAGE_VERSION,
    traceVersion: t.version,

    // 1 — what a reviewer sees first: sizes, not judgements.
    summary: {
      evidence: EVIDENCE.MEASURED,
      weeks: t.counts.weeks,
      sessionsPerWeek: t.context.frequency,
      blocks: t.counts.blocks,
      prescriptions: t.counts.prescriptions,
      selectionDecisions: decisions.length,
      unresolvedSlots: unresolved.length,
      unresolvedPrescriptionSlots: t.counts.unresolvedSlots,
      tieBreakDecisions: ties.length,
      progressionTransitions: t.attribution.transitions.length,
      openQuestions: t.openQuestions.length,
      // Counted separately: a question the engine raises for this athlete is
      // not the same thing as a policy question still awaiting a decision.
      questionsWithRecordedDecision:
        t.openQuestions.filter((q) => q.decision?.state === 'recorded').length,
      critiqueFindings: critiqueFindings.length,
      // The critique's own status, quoted rather than recomputed. It is that
      // layer's word, not a verdict formed here.
      critiqueStatus: critique?.status ?? null,
    },

    context: t.context,                 // 2
    structure: {                        // 3
      evidence: EVIDENCE.MEASURED,
      weeks: t.weeks.map((w) => ({
        weekNumber: w.weekNumber, weekRole: w.weekRole, objective: w.objective,
        plannedVolume: w.plannedVolume, plannedIntensity: w.plannedIntensity,
        sessions: w.days.flatMap((d) => d.sessions.map((s) => ({
          day: d.day, title: s.title, archetype: s.archetype,
          blocks: s.blocks.map((b) => ({
            blockType: b.blockType, blueprintBlockType: b.blueprintBlockType,
            prescribed: b.slots.length, unresolved: b.unresolvedSlots.length,
          })),
        }))),
      })),
    },

    selectionDecisions: decisions,      // 4 + 5
    unresolvedSlots: unresolved,        // 6
    tieBreaks: ties,                    // 7

    progression: {                      // 8
      evidence: EVIDENCE.MEASURED,
      weeks: t.weeks.map((w) => ({ weekNumber: w.weekNumber, weekRole: w.weekRole, reasons: w.progression.reasons })),
      transitions: t.attribution.transitions,
      effortCeiling: t.attribution.effortCeiling,
      simultaneous: t.attribution.simultaneous,
    },

    dose: t.dose,                       // 9
    density: { evidence: EVIDENCE.MEASURED, weeks: density },   // 10
    critique: critique ? {              // 10 (fixture/quality/pattern findings)
      status: critique.status,
      provisional: critique.provisional ?? true,
      findings: critiqueFindings,
    } : null,

    observations: t.observations,       // 12 (already carry evidence)
    openQuestions: t.openQuestions,     // 11
    evidenceRollup,                     // 12

    // 13 — deliberately empty. The engine does not fill this in.
    reviewerConclusion: {
      evidence: EVIDENCE.JUDGEMENT,
      // Worded to avoid the vocabulary the forbidden-claim guard scans for.
      // The guard is deliberately blunt substring matching — it cannot tell a
      // claim from a disclaimer that denies making one — and a guard that
      // stays strong is worth more than this sentence's phrasing.
      statement: 'For the reviewing practitioner to complete. This engine forms no view on whether this '
        + 'programme suits this athlete.',
      outcome: null,
      notes: null,
      decisions: t.openQuestions.map((q) => ({ question: q.code, statement: q.statement, decision: null })),
    },
  };
}

/** Markdown rendering. Presentation only — every line restates a package field. */
export function renderReviewPackage(pkg, { maxDecisions = Infinity } = {}) {
  const L = [];
  const c = pkg.context;
  const s = pkg.summary;

  L.push('# PERFORMANCE INTELLIGENCE REVIEW');
  L.push('');
  L.push('## Programme');
  L.push(`- Athlete: ${c.developmentContext ?? 'unknown'} ${c.position ?? ''}, ${c.experience ?? 'unknown'} training age`.trim());
  L.push(`- Season phase: ${c.phase ?? 'unknown'}`);
  L.push(`- Rugby load: ${c.rugbyLoad} team session(s)/match per week`);
  L.push(`- Equipment: ${(c.equipment?.locations || []).join(', ') || 'not carried in the blueprint'}`);
  L.push(`- Dose categories: ${c.volumeCategory} volume, ${c.intensityCategory} intensity`);
  L.push('');
  L.push('## Executive evidence');
  L.push(`- ${s.weeks} week(s) × ${s.sessionsPerWeek} session(s), ${s.prescriptions} prescription(s)`);
  L.push(`- ${s.selectionDecisions} distinct selection decision(s)`);
  L.push(`- ${s.unresolvedSlots} slot(s) left unprescribed`);
  L.push(`- ${s.tieBreakDecisions} decision(s) rested on the alphabetical tie-break`);
  L.push(`- ${s.openQuestions} question(s) require a qualified practitioner`
    + (s.questionsWithRecordedDecision != null
      ? ` — ${s.questionsWithRecordedDecision} with a decision already recorded`
      : ''));
  if (s.critiqueStatus) L.push(`- Critique layer status: ${s.critiqueStatus} (that layer's own word, advisory)`);
  L.push('');

  L.push('## Selection decisions');
  for (const d of pkg.selectionDecisions.slice(0, maxDecisions)) {
    const first = d.weeklyDose[0];
    const dose = first?.fields
      ? (Number.isFinite(first.fields.holdSec) ? `${first.sets} × ${first.fields.holdSec}s hold`
        : Number.isFinite(first.fields.distanceM) ? `${first.sets} × ${first.fields.distanceM}m`
          : Number.isFinite(first.fields.reps) ? `${first.sets} × ${first.fields.reps}` : `${first.sets} sets`)
      : '—';
    const rpe = Number.isFinite(first?.fields?.rpe) ? ` @ RPE ${first.fields.rpe}` : '';
    const label = d.block.blockTypeMapped
      ? `${d.block.blockType} (from ${d.block.blueprintBlockType})` : d.block.blockType;
    L.push('');
    L.push(`### ${d.session.title ?? d.session.archetype} — ${label} #${d.positionInBlock}`);
    L.push(`**${d.selected.name}** — ${dose}${rpe} (week 1)`);
    L.push(`- Category: ${d.selected.category ?? '?'} · primary quality: ${d.selected.primaryQuality ?? '?'} · pattern: ${d.selected.pattern ?? '?'}`);
    if (d.reasons.length) {
      L.push('- Selection:');
      for (const r of d.reasons) L.push(`  - ${r.text}`);
    }
    if (d.prescriptionType) L.push(`- Prescription: ${d.prescriptionType.statement}`);
    if (d.tie) {
      L.push(`- Decision: tie at score ${d.tie.score} — ${d.tie.candidates.map((x) => x.name).join(' / ')}`);
      L.push(`  - Broken by: ${d.tie.brokenBy}. ${d.tie.statement}`);
      L.push(`  - Professional judgement: ${d.tie.openQuestion.statement}`);
    } else {
      L.push('- Decision: outright on ranking');
    }
    const changed = d.weeklyDose.filter((w) => w.progression?.dimensionsChanged?.length);
    if (changed.length) {
      L.push(`- Across the block: ${changed.map((w) => `wk${w.weekNumber} ${w.progression.dimensionsChanged.join('/')}`).join('; ')}`);
    }
  }
  L.push('');

  L.push('## Unresolved slots');
  if (!pkg.unresolvedSlots.length) L.push('- None.');
  for (const u of pkg.unresolvedSlots) {
    L.push(`- **${u.pattern}** in ${u.blockType} (${u.session.title ?? u.session.archetype}), weeks ${u.weeksAffected.join(', ')}`);
    L.push(`  - ${u.diagnosis?.statement ?? u.recordedStatement}`);
    if (u.diagnosis) L.push(`  - Classification: ${u.diagnosis.reason}`);
  }
  L.push('');

  L.push('## Progression');
  for (const t of pkg.progression.transitions) {
    const levers = [t.more && 'more work', t.harder && 'harder', t.moreOften && 'more often'].filter(Boolean).join(', ') || 'no increase';
    L.push(`- Week ${t.fromWeek} → ${t.toWeek} (${t.fromRole} → ${t.toRole}): ${levers}`
      + (t.volumeDriver ? ` — led by ${t.volumeDriver.lever} +${t.volumeDriver.pct}%` : ''));
  }
  const ec = pkg.progression.effortCeiling;
  if (ec.reachedAtWeek !== null) {
    L.push(`- Effort stopped rising at week ${ec.reachedAtWeek}`
      + (ec.leversCarryingProgressionAfterwards.length
        ? `; progression continued through ${ec.leversCarryingProgressionAfterwards.join(', ')}` : ''));
  }
  L.push('');

  L.push('## Dose / load');
  L.push(`- Block total: ${Object.entries(pkg.dose.block).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const w of pkg.dose.weekly) {
    L.push(`- Week ${w.weekNumber} (${w.weekRole}): ${w.total.sets} sets, ${w.total.reps} reps`
      + (w.total.holdSec ? `, ${w.total.holdSec}s hold` : '')
      + (w.total.distanceM ? `, ${w.total.distanceM}m` : '')
      + (w.effort.meanRpe !== null ? `, mean RPE ${w.effort.meanRpe}` : ''));
  }
  L.push('');

  if (pkg.critique) {
    L.push('## Critique layer (advisory, provisional)');
    for (const f of pkg.critique.findings) L.push(`- [${f.evidence}] ${f.kind}/${f.severity}: ${f.message}`);
    L.push('');
  }

  L.push('## Observations');
  for (const o of pkg.observations) L.push(`- [${o.evidence}] ${o.statement}`);
  L.push('');

  L.push('## Professional judgement required');
  L.push('The engine raises these and answers none of them itself. Where a practitioner has');
  L.push('recorded a decision, it is quoted with the record it came from.');
  for (const q of pkg.openQuestions) {
    L.push(`- **${q.code}** — ${q.statement}`);
    if (q.decision?.state === 'recorded') {
      L.push(`  - Decided at ${q.decision.recordedAt}: ${q.decision.outcome}`);
      L.push(`  - Scope: ${q.decision.scope}`);
      L.push(`  - Carried by: ${q.decision.implementation}`);
      L.push(`  - Record: \`${q.decision.record}\``);
    } else {
      L.push('  - No decision recorded.');
    }
  }
  L.push('');

  L.push('## Reviewer conclusion');
  L.push(pkg.reviewerConclusion.statement);
  L.push('');
  L.push('| Question | Reviewer decision |');
  L.push('| --- | --- |');
  for (const d of pkg.reviewerConclusion.decisions) L.push(`| ${d.question} | |`);
  return L.join('\n');
}
