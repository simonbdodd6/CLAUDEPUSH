/**
 * @coach-intelligence — Coach DNA Coach View Smoke Fixture (M231, DORMANT)
 *
 * A deterministic, representative sample of the M230 Coach DNA `coachView` — so we (and a future UI)
 * can inspect exactly what the Coach DNA panel would render. It is NOT hand-fabricated: it runs the
 * real Coach Memory chain (M112 synthesize + M113 signals → M114 profile) over a fixed set of memory
 * entries and feeds the result through M230 `buildCoachDnaCoachView`, so it always conforms to the
 * live contract and never drifts from it.
 *
 * Per the M138 architecture, `coach-intelligence` never imports `coach-memory`: the three engines are
 * **injected** as `services` (the same services bundle the M118 pipeline takes). The fixture defines
 * only plain memory data and the in-package M230 presenter import — no engine import edge.
 *
 * It recommends nothing, ranks nobody, builds no team, calls no AI, invents no philosophy, and touches
 * no database/network/filesystem/timestamp/clock/randomness. Pure, deterministic; output deeply frozen.
 */

import { buildCoachDnaCoachView } from './coach-dna-coach-view.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// A representative coach "DNA" — a selection-led coach with a clear set-piece philosophy, spanning six
// of the eight coaching dimensions. selection-preference is deliberately the dominant theme (three
// memories) so the sample shows a clear strongest signal; the other dimensions each appear once.
const SAMPLE_MEMORIES = Object.freeze([
  { id: 'm-phil-1', coachId: 'coach-1', clubId: 'club-1', type: 'philosophy',
    statement: 'Matches are won up front: dominate the set piece and the rest follows.',
    source: 'manual', confidence: 0.85, weight: 0.8, tags: ['set-piece'],
    ontologyLinks: [{ kind: 'value', id: 'set-piece-dominance' }], evidenceRefs: [], createdAt: '2025-09-01T00:00:00.000Z' },

  { id: 'm-sel-1', coachId: 'coach-1', clubId: 'club-1', type: 'selection-preference',
    statement: 'Select on current form and training output, never on reputation.',
    source: 'selection-decision', confidence: 0.9, weight: 0.9, tags: ['form'],
    ontologyLinks: [], evidenceRefs: ['selection-2025-09-06'], createdAt: '2025-09-05T00:00:00.000Z' },

  { id: 'm-sel-2', coachId: 'coach-1', clubId: 'club-1', type: 'selection-preference',
    statement: 'Reward consistent training attendance with a starting shirt.',
    source: 'selection-decision', confidence: 0.85, weight: 0.85, tags: ['attendance'],
    ontologyLinks: [], evidenceRefs: ['selection-2025-09-13'], createdAt: '2025-09-12T00:00:00.000Z' },

  { id: 'm-sel-3', coachId: 'coach-1', clubId: 'club-1', type: 'selection-preference',
    statement: 'Prefer a genuine specialist openside flanker at 7.',
    source: 'match-note', confidence: 0.8, weight: 0.8, tags: ['back-row'],
    ontologyLinks: [{ kind: 'player', id: 'player-openside' }], evidenceRefs: ['match-2025-09-14'], createdAt: '2025-09-19T00:00:00.000Z' },

  { id: 'm-train-1', coachId: 'coach-1', clubId: 'club-1', type: 'training-preference',
    statement: 'Drill the set piece before contact in every session.',
    source: 'session-note', confidence: 0.8, weight: 0.75, tags: ['set-piece'],
    ontologyLinks: [], evidenceRefs: [], createdAt: '2025-09-22T00:00:00.000Z' },

  { id: 'm-tac-1', coachId: 'coach-1', clubId: 'club-1', type: 'tactical-preference',
    statement: 'Kick for territory in the opening twenty minutes.',
    source: 'match-note', confidence: 0.7, weight: 0.7, tags: ['territory'],
    ontologyLinks: [], evidenceRefs: [], createdAt: '2025-09-26T00:00:00.000Z' },

  { id: 'm-mgmt-1', coachId: 'coach-1', clubId: 'club-1', type: 'player-management',
    statement: 'Cap minutes for players returning from injury.',
    source: 'manual', confidence: 0.75, weight: 0.8, tags: ['injury'],
    ontologyLinks: [{ kind: 'player', id: 'player-12' }], evidenceRefs: [], createdAt: '2025-10-01T00:00:00.000Z' },

  { id: 'm-risk-1', coachId: 'coach-1', clubId: 'club-1', type: 'risk-warning',
    statement: 'Do not overplay key forwards during congested fixture blocks.',
    source: 'assistant-derived', confidence: 0.7, weight: 0.75, tags: ['load'],
    ontologyLinks: [], evidenceRefs: [], createdAt: '2025-10-05T00:00:00.000Z' },
])

/**
 * Build the representative Coach DNA coach-view smoke fixture by running the real Coach Memory chain
 * (matches what an M138-wired runtime would produce for a coach's memories).
 *
 * @param {{ synthesizeCoachMemories:Function, extractCoachDnaSignals:Function, buildCoachDnaProfile:Function }} services
 *   the real M112 + M113 + M114 engines (e.g. the M138 services bundle), injected — never imported.
 * @returns {Readonly<object>}  an M230 coachView
 */
export function buildCoachDnaCoachViewSample(services) {
  if (!isObj(services)
    || typeof services.synthesizeCoachMemories !== 'function'
    || typeof services.extractCoachDnaSignals !== 'function'
    || typeof services.buildCoachDnaProfile !== 'function') {
    throw new TypeError('buildCoachDnaCoachViewSample requires services { synthesizeCoachMemories, extractCoachDnaSignals, buildCoachDnaProfile }')
  }

  const signals = services.extractCoachDnaSignals(SAMPLE_MEMORIES)   // M113
  const profile = services.buildCoachDnaProfile(signals)             // M114
  const synthesis = services.synthesizeCoachMemories(SAMPLE_MEMORIES) // M112

  return buildCoachDnaCoachView({ profile, synthesis })             // M230 (deeply frozen)
}
