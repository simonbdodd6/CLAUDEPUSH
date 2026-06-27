/**
 * web/brain-coach-dna-snapshots.js — Coach DNA HTML Snapshot Suite (M234, DORMANT)
 *
 * Canonical, byte-for-byte-deterministic HTML snapshots of the Coach DNA panel across representative
 * coachView scenarios — the Coach Memory analogue of the readiness M223 snapshot suite. It REUSES the
 * M232 renderer and the M222 escape helper only; it adds no rendering logic and changes no engine, the
 * M230 contract, M232/M233, index.html, runtime, or API.
 *
 * The scenarios are fixed, hand-authored M230-shaped coachViews (the same approach M223 uses) so each
 * snapshot is byte-stable. Every value is escaped, no raw internal fields are exposed, nothing is
 * recommended, and the result is deeply frozen. Pure and deterministic: no DOM, network, storage, AI,
 * clock, or randomness. Importing it changes nothing in production.
 */

import { renderCoachDnaCoachView } from './brain-coach-dna-view.js'   // M232 panel renderer (reused)
import { escapeHtml as esc } from './brain-readiness-theme.js'        // M222 shared HTML helper (reused)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** One snapshot = the M232 panel wrapped in a stable, inspectable container (data attrs from the view). */
export function renderCoachDnaSnapshot(coachView) {
  if (!isObj(coachView)) throw new TypeError('renderCoachDnaSnapshot requires a coachView object')
  const confidence = isObj(coachView.confidence) ? coachView.confidence : {}
  const identity = isObj(coachView.identity) ? coachView.identity : {}
  const level = typeof confidence.level === 'string' ? confidence.level : 'UNKNOWN'
  const strongest = typeof identity.strongestCategory === 'string' ? identity.strongestCategory : ''
  return `<div class="brain-coach-dna-snapshot" data-confidence="${esc(level)}" data-strongest="${esc(strongest)}">`
    + renderCoachDnaCoachView(coachView)
    + '</div>'
}

// ── canonical coachView fixtures (fixed values → byte-stable snapshots), shaped to the M230 contract ──

const dim = (category, label, count, conf, weight) => ({ type: category, label, count, averageConfidence: conf, averageWeight: weight })
const sig = (category, label, occurrences, strength, conf, weight, supportingCount) =>
  ({ category, label, occurrences, strength, averageConfidence: conf, averageWeight: weight, supportingCount })

const cv = (over = {}) => ({
  profileVersion: '1.0',
  confidence: { value: 0.88, level: 'HIGH', label: 'High' },
  headline: 'Selection focus — 8 memories across 6 themes, high confidence',
  identity: {
    strongestCategory: 'selection-preference', strongestLabel: 'Selection',
    weakestCategory: 'tactical-preference', weakestLabel: 'Tactics',
    diversityScore: 0.75, diversityLabel: 'Broad',
  },
  dominantSignals: [
    sig('selection-preference', 'Selection', 3, 1.0, 0.85, 0.85, 3),
    sig('philosophy', 'Philosophy', 1, 0.9, 0.85, 0.8, 1),
    sig('training-preference', 'Training', 1, 0.87, 0.8, 0.75, 1),
  ],
  themes: [
    dim('selection-preference', 'Selection', 3, 0.85, 0.85),
    dim('philosophy', 'Philosophy', 1, 0.85, 0.8),
    dim('training-preference', 'Training', 1, 0.8, 0.75),
    dim('tactical-preference', 'Tactics', 1, 0.7, 0.7),
    dim('player-management', 'Player management', 1, 0.75, 0.8),
    dim('risk-warning', 'Risk warnings', 1, 0.7, 0.75),
  ],
  knowledge: { totalMemories: 8, uniqueTypes: 6, averageConfidence: 0.79, averageWeight: 0.79, totalEvidence: 3, totalOntologyLinks: 3 },
  summary: 'Coach has 8 recorded coaching memories across 6 coaching themes.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
  ...over,
})

const SCENARIOS = Object.freeze({
  // A selection-led coach with broad coverage and high confidence (the M231-style archetype).
  selectionLed: cv(),

  // A philosophy-led coach with balanced coverage and medium confidence.
  philosophyLed: cv({
    confidence: { value: 0.55, level: 'MEDIUM', label: 'Medium' },
    headline: 'Philosophy focus — 5 memories across 4 themes, medium confidence',
    identity: {
      strongestCategory: 'philosophy', strongestLabel: 'Philosophy',
      weakestCategory: 'communication-style', weakestLabel: 'Communication',
      diversityScore: 0.5, diversityLabel: 'Balanced',
    },
    dominantSignals: [
      sig('philosophy', 'Philosophy', 2, 1.0, 0.7, 0.7, 2),
      sig('tactical-preference', 'Tactics', 1, 0.6, 0.6, 0.65, 1),
      sig('training-preference', 'Training', 1, 0.55, 0.6, 0.6, 0),
    ],
    themes: [
      dim('philosophy', 'Philosophy', 2, 0.7, 0.7),
      dim('tactical-preference', 'Tactics', 1, 0.6, 0.65),
      dim('training-preference', 'Training', 1, 0.6, 0.6),
      dim('player-management', 'Player management', 1, 0.65, 0.7),
    ],
    knowledge: { totalMemories: 5, uniqueTypes: 4, averageConfidence: 0.64, averageWeight: 0.66, totalEvidence: 1, totalOntologyLinks: 2 },
    summary: 'Coach has 5 recorded coaching memories across 4 coaching themes.',
  }),

  // A new/developing profile: few memories, narrow spread, low confidence.
  developing: cv({
    confidence: { value: 0.22, level: 'LOW', label: 'Low' },
    headline: 'Selection focus — 2 memories across 1 theme, low confidence',
    identity: {
      strongestCategory: 'selection-preference', strongestLabel: 'Selection',
      weakestCategory: 'selection-preference', weakestLabel: 'Selection',
      diversityScore: 0.12, diversityLabel: 'Narrow',
    },
    dominantSignals: [sig('selection-preference', 'Selection', 2, 1.0, 0.5, 0.5, 0)],
    themes: [dim('selection-preference', 'Selection', 2, 0.5, 0.5)],
    knowledge: { totalMemories: 2, uniqueTypes: 1, averageConfidence: 0.5, averageWeight: 0.5, totalEvidence: 0, totalOntologyLinks: 0 },
    summary: 'Coach has 2 recorded coaching memories across 1 coaching theme.',
  }),

  // A seasoned coach: many memories, full coverage, deep evidence, high confidence.
  broadVeteran: cv({
    confidence: { value: 0.95, level: 'HIGH', label: 'High' },
    headline: 'Tactics focus — 24 memories across 8 themes, high confidence',
    identity: {
      strongestCategory: 'tactical-preference', strongestLabel: 'Tactics',
      weakestCategory: 'communication-style', weakestLabel: 'Communication',
      diversityScore: 1.0, diversityLabel: 'Broad',
    },
    dominantSignals: [
      sig('tactical-preference', 'Tactics', 6, 1.0, 0.9, 0.9, 8),
      sig('selection-preference', 'Selection', 5, 0.83, 0.88, 0.86, 6),
      sig('player-management', 'Player management', 4, 0.66, 0.85, 0.82, 4),
    ],
    themes: [
      dim('tactical-preference', 'Tactics', 6, 0.9, 0.9),
      dim('selection-preference', 'Selection', 5, 0.88, 0.86),
      dim('player-management', 'Player management', 4, 0.85, 0.82),
      dim('training-preference', 'Training', 3, 0.86, 0.84),
      dim('philosophy', 'Philosophy', 2, 0.9, 0.88),
      dim('risk-warning', 'Risk warnings', 2, 0.82, 0.8),
      dim('learned-pattern', 'Learned patterns', 1, 0.8, 0.78),
      dim('communication-style', 'Communication', 1, 0.78, 0.76),
    ],
    knowledge: { totalMemories: 24, uniqueTypes: 8, averageConfidence: 0.88, averageWeight: 0.86, totalEvidence: 18, totalOntologyLinks: 11 },
    summary: 'Coach has 24 recorded coaching memories across 8 coaching themes.',
  }),

  // No profile yet: the empty/degraded state (mirrors the M230 no-profile fallback).
  empty: cv({
    profileVersion: null,
    confidence: { value: 0, level: 'LOW', label: 'Low' },
    headline: 'No coaching profile yet — add memories to build Coach DNA',
    identity: {
      strongestCategory: null, strongestLabel: null,
      weakestCategory: null, weakestLabel: null,
      diversityScore: 0, diversityLabel: 'Narrow',
    },
    dominantSignals: [],
    themes: [],
    knowledge: { totalMemories: 0, uniqueTypes: 0, averageConfidence: 0, averageWeight: 0, totalEvidence: 0, totalOntologyLinks: 0 },
    summary: null,
  }),
})

/** The named coachView scenarios (frozen) used to build the snapshots — for reference/inspection/reuse. */
export const COACH_DNA_SNAPSHOT_SCENARIOS = deepFreeze(SCENARIOS)

/**
 * Build the canonical HTML snapshot for every scenario.
 * @returns {Readonly<Record<string,string>>}  scenario name → HTML
 */
export function buildCoachDnaSnapshots() {
  const out = {}
  for (const name of Object.keys(SCENARIOS)) out[name] = renderCoachDnaSnapshot(SCENARIOS[name])
  return deepFreeze(out)
}
