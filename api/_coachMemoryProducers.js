// api/_coachMemoryProducers.js — Automatic Coach Memory producers (Core Memory M6 training, M7 selection)
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
//
// KILL-SWITCH: every automatic producer is gated by ONE environment flag, read here and nowhere
// else (see coachMemoryProducersEnabled). It is fail-safe: producers are OFF unless the flag is
// explicitly 'true', so a deployment that never heard of coach memory writes nothing. The switch
// covers automatic producers only — the deliberate POST /api/coach-memory capture route (M5) does
// not consult it.

import { captureCoachMemory } from './_coachMemoryCapture.js';

const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;

// ── Producer kill-switch ────────────────────────────────────────────────────
export const COACH_MEMORY_PRODUCERS_FLAG = 'COACH_MEMORY_PRODUCERS_ENABLED';

/**
 * Are automatic Coach Memory producers enabled? Same convention as the rest of api/ (DEV_LOGIN):
 * the flag is read at call time and only the exact string 'true' enables. Unset, '', 'false', '1',
 * 'yes', 'TRUE' … all mean DISABLED — the safe default. Every producer (M6, M7, …) calls this
 * first; nothing else should parse the variable.
 *
 * @param {Record<string, string | undefined>} [env] defaults to process.env (injectable for tests).
 */
export function coachMemoryProducersEnabled(env = process.env) {
  return env[COACH_MEMORY_PRODUCERS_FLAG] === 'true';
}

// The single result every producer returns when switched off — a neutral skip, never an error, so
// the hosting action (publish, selection, …) is completely unaffected.
export const PRODUCERS_DISABLED = Object.freeze({ ok: true, skipped: true, reason: 'producers-disabled' });

// ── Shared scope links ──────────────────────────────────────────────────────
// Every producer links the same context: Core's tenant as the Brain's `club`, and — when known —
// the playing group the action was taken for as the Brain's `team`. Opaque ids only, never a person.
function scopeOntologyLinks(teamId, groupId) {
  const links = [{ kind: 'club', id: teamId }];
  if (isNonEmptyString(groupId)) links.push({ kind: 'team', id: groupId.trim() });
  return links;
}

// ── Training-publish producer ───────────────────────────────────────────────
// Trigger: a coach successfully publishes their training schedule (POST /api/publish type=sessions).
// Signal: training-preference DNA (feeds the M269–M276 training chain). Source is 'assistant-derived'
// — the honest provenance for a system-produced memory. Confidence is high (the publish definitely
// happened); weight is low (one scheduling action is weak evidence of training philosophy — the
// signal accrues from frequency across many publishes). Statement is COUNT-derived only: no titles,
// dates, player data, names or emails ever enter the memory.
//
// Context: Core publishes a schedule PER PLAYING GROUP (Seniors, U18, …), so the memory links the
// group it was published for. In the Brain's ontology Core's tenant (`teamId`, a club) is the `club`
// and the playing group is the `team`; both ids are opaque identifiers — never a person.
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
 * @param {{ teamId: string, coachId: string, groupId?: string, sessionCount: number }} event
 *   `groupId` is the playing group the schedule was published for (resolved server-side by
 *   publish.js). When absent the memory carries the club link only.
 * @param {{ clock?: () => string, idFactory?: () => string }} [seam] passed through to the M4 seam.
 * @returns {Promise<{ ok: true, memory: object } | { ok: true, skipped: true, reason: string } | { ok: false, error: string }>}
 */
export async function produceTrainingPublishMemory({ teamId, coachId, groupId, sessionCount } = {}, seam = {}) {
  try {
    // Kill-switch first: when producers are off, nothing below runs and nothing is written.
    if (!coachMemoryProducersEnabled()) return PRODUCERS_DISABLED;
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
        ontologyLinks: scopeOntologyLinks(teamId, groupId), // club (+ playing group) — never a person
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

// ── Squad-publish producer (Core Memory M7) ─────────────────────────────────
// Trigger: a coach successfully publishes a team sheet to players (POST /api/publish type=squad with
// published:true). Withdrawals and staff-only "Publish to coaches" sheets are not selections made
// public and produce nothing. Signal: selection-preference DNA (feeds the Brain's selection chain).
// Source is 'selection-decision' — the memory records that a selection was decided and published,
// the same type/source pairing the Brain's own Coach DNA samples use. Confidence/weight mirror M6:
// the publish definitely happened (high confidence), but one sheet is weak evidence of selection
// philosophy (low weight) — the signal accrues from frequency across many publishes.
//
// PRIVACY: the producer only ever receives COUNTS. squadSelectionCounts() reduces a sheet to two
// numbers before anything reaches the memory path, so no player name, id, position label, medical
// note or any other sheet content can enter a memory — not the statement, tags, links or evidence.
const SQUAD_PUBLISH = Object.freeze({
  type: 'selection-preference',
  confidence: 0.9,
  weight: 0.3,
  tags: Object.freeze(['selection', 'squad', 'published']),
  evidenceRefs: Object.freeze(['publish:squad']),
  source: 'selection-decision',
});

const isFilled = v => typeof v === 'string' && v.trim().length > 0;

/**
 * Reduce a (sanitised) team sheet to its aggregate selection shape. Pure; never throws.
 * Starters are the filled formation slots; replacements are the filled bench places (a bench array
 * carries empty strings for unfilled places, which do not count).
 *
 * @param {{ formationNames?: Record<string, string>, benchPlayers?: string[] }} squad
 * @returns {{ starterCount: number, replacementCount: number }}
 */
export function squadSelectionCounts(squad) {
  const formation = squad && typeof squad.formationNames === 'object' && !Array.isArray(squad.formationNames)
    ? Object.values(squad.formationNames) : [];
  const bench = squad && Array.isArray(squad.benchPlayers) ? squad.benchPlayers : [];
  return { starterCount: formation.filter(isFilled).length, replacementCount: bench.filter(isFilled).length };
}

const isCount = n => Number.isInteger(n) && n >= 0;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Produce a squad-publish coach memory. Best-effort: never throws.
 *
 * @param {{ teamId: string, coachId: string, groupId?: string, starterCount: number, replacementCount: number }} event
 *   `groupId` is the playing group the sheet was published for (resolved server-side by
 *   publish.js from the fixture). When absent the memory carries the club link only.
 * @param {{ clock?: () => string, idFactory?: () => string }} [seam] passed through to the M4 seam.
 * @returns {Promise<{ ok: true, memory: object } | { ok: true, skipped: true, reason: string } | { ok: false, error: string }>}
 */
export async function produceSquadPublishMemory({ teamId, coachId, groupId, starterCount, replacementCount } = {}, seam = {}) {
  try {
    // Kill-switch first: when producers are off, nothing below runs and nothing is written.
    if (!coachMemoryProducersEnabled()) return PRODUCERS_DISABLED;
    if (!isCount(starterCount) || !isCount(replacementCount)) return { ok: false, error: 'invalid selection' };
    // A sheet with nobody on it is a genuine no-op — nothing was selected.
    if (starterCount + replacementCount === 0) return { ok: true, skipped: true, reason: 'empty-selection' };
    if (!isNonEmptyString(teamId) || !isNonEmptyString(coachId)) return { ok: false, error: 'invalid scope' };

    const memory = await captureCoachMemory(
      { teamId, coachId },
      {
        type: SQUAD_PUBLISH.type,
        statement: `Published a squad with ${plural(starterCount, 'starter', 'starters')} and ${plural(replacementCount, 'replacement', 'replacements')}.`,
        confidence: SQUAD_PUBLISH.confidence,
        weight: SQUAD_PUBLISH.weight,
        tags: [...SQUAD_PUBLISH.tags],
        ontologyLinks: scopeOntologyLinks(teamId, groupId), // club (+ playing group) — never a person
        evidenceRefs: [...SQUAD_PUBLISH.evidenceRefs],
        source: SQUAD_PUBLISH.source,
      },
      seam,
    );
    return { ok: true, memory };
  } catch (error) {
    // The contract: a producer never throws into its caller. Any failure is reported, not raised.
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}
