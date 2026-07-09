// api/_coachMemoryProducers.js — Automatic Coach Memory producers (Core Memory M6, DORMANT wiring)
//
// The first REAL event producers: they turn an authentic coaching action into a persisted coach
// memory through the M4 capture seam. A producer is NOT reasoning — it emits a fixed, documented,
// PII-free record describing that an action happened, with constant confidence/weight. The Brain's
// existing chains later aggregate frequency/consistency of such records into DNA; a single producer
// call asserts a fact, not an inference.
//
// CONTRACT for every producer: it MUST NEVER throw into its caller. A producer runs as a best-effort
// side effect of a core coaching action (e.g. publishing a training schedule); if the memory write
// fails for any reason, the core action must be completely unaffected. Producers therefore always
// resolve to a result object: { ok:true, memory } | { ok:true, skipped:true, reason } | { ok:false, error }.

import { captureCoachMemory } from './_coachMemoryCapture.js';

const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;

// ── Training-publish producer ───────────────────────────────────────────────
// Trigger: a coach successfully publishes their training schedule (POST /api/publish type=sessions).
// Signal: training-preference DNA (feeds the M269–M276 training chain). Source is 'assistant-derived'
// — the honest provenance for a system-produced memory. Confidence is high (the publish definitely
// happened); weight is low (one scheduling action is weak evidence of training philosophy — the
// signal accrues from frequency across many publishes). Statement is COUNT-derived only: no titles,
// dates, player data, names or emails ever enter the memory.
const TRAINING_PUBLISH = Object.freeze({
  type: 'training-preference',
  confidence: 0.9,
  weight: 0.3,
  tags: Object.freeze(['training', 'schedule', 'published']),
  evidenceRefs: Object.freeze(['publish:sessions']),
  source: 'assistant-derived',
});

/**
 * Produce a training-publish coach memory. Best-effort: never throws.
 *
 * @param {{ teamId: string, coachId: string, sessionCount: number }} event
 * @param {{ clock?: () => string, idFactory?: () => string }} [seam] passed through to the M4 seam.
 * @returns {Promise<{ ok: true, memory: object } | { ok: true, skipped: true, reason: string } | { ok: false, error: string }>}
 */
export async function produceTrainingPublishMemory({ teamId, coachId, sessionCount } = {}, seam = {}) {
  try {
    const count = Number.isFinite(sessionCount) ? sessionCount : Number.parseInt(sessionCount, 10);
    // An empty (or absent) schedule is a genuine no-op — nothing meaningful was published.
    if (!(count > 0)) return { ok: true, skipped: true, reason: 'empty-schedule' };
    if (!isNonEmptyString(teamId) || !isNonEmptyString(coachId)) return { ok: false, error: 'invalid scope' };

    const memory = await captureCoachMemory(
      { teamId, coachId },
      {
        type: TRAINING_PUBLISH.type,
        statement: `Published a training schedule of ${count} session${count === 1 ? '' : 's'}.`,
        confidence: TRAINING_PUBLISH.confidence,
        weight: TRAINING_PUBLISH.weight,
        tags: [...TRAINING_PUBLISH.tags],
        ontologyLinks: [{ kind: 'team', id: teamId }],   // tenant scope only — never a person
        evidenceRefs: [...TRAINING_PUBLISH.evidenceRefs],
        source: TRAINING_PUBLISH.source,
      },
      seam,
    );
    return { ok: true, memory };
  } catch (error) {
    // The contract: a producer never throws into its caller. Any failure is reported, not raised.
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}
