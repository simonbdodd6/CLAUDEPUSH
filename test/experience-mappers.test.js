/**
 * M41 — Experience Adapter mapper unit tests (infrastructure hardening)
 *
 * Deterministic, pure-function tests for the seven Experience Adapter mappers.
 * They import ONLY the mapper modules (whose sole dependency is shape-guards) —
 * no AI engine, no Core, no browser component, no live runtime, no network.
 *
 * Each mapper is a PURE GUARDED RESHAPE: Brain output → a VisualModel slice.
 * These tests lock that contract:
 *   • valid input  → fields are SELECTED/RENAMED (never derived, scored, ranked
 *     or recalculated); order and counts are preserved (no generation/ranking).
 *   • malformed input (null/array/number/string) → safe fallback, never throws.
 *   • empty input  → falls back to placeholder content (state stays presentable).
 *   • output slice SHAPE is stable.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mapMatchReadiness } from '../experience/adapter/mappers/match-readiness.js'
import { mapCoachDna } from '../experience/adapter/mappers/coach-dna.js'
import { mapSeason } from '../experience/adapter/mappers/season.js'
import { mapOpponent } from '../experience/adapter/mappers/opponent.js'
import { mapExecutiveRecommendations } from '../experience/adapter/mappers/executive-recommendations.js'
import { mapMemory } from '../experience/adapter/mappers/memory.js'
import { mapTraining } from '../experience/adapter/mappers/training.js'

// Sentinel fallbacks — distinct values so we can prove fallback content is used verbatim.
const FB = {
  matchReadiness: { state: 'placeholder', confidence: 0.5, verdict: 'FB_VERDICT', gauges: { overall: 11, availability: 12, fitness: 13, cohesion: 14 }, risks: [{ label: 'FB_RISK', severity: 'low' }], evidence: [{ label: 'FB_EV' }] },
  coachDna: { state: 'placeholder', maturity: 0.5, summary: 'FB_SUMMARY', traits: [{ key: 'fb', label: 'FB', score: 1, confidence: 0.1, descriptor: 'd' }] },
  season: { state: 'placeholder', trajectory: [{ round: 1, value: 9 }], projection: { points: 99, position: 9 }, probabilities: { title: 1, playoff: 2, relegation: 3 } },
  opponent: { state: 'placeholder', name: 'FB_NAME', summary: 'FB_SUM', maturity: 0.5, strengths: [{ key: 'fs', label: 'FS', score: 5, confidence: 0.5 }], weaknesses: [{ key: 'fw', label: 'FW', score: 6, confidence: 0.5 }], threats: [{ label: 'FT' }], opportunities: [{ label: 'FO' }] },
  executiveRecommendations: { state: 'placeholder', items: [{ id: 'fb', title: 'FB_ITEM', detail: '', category: '', confidence: 0 }] },
  memory: { state: 'placeholder', nodes: [{ id: 'fb', label: 'FB', cluster: 'core', activated: false }], edges: [], recentlyActivated: ['fb'] },
  training: { state: 'placeholder', theme: 'FB_THEME', durationMin: 1, workloadStatus: 'FB_WS', objectives: [{ label: 'FO', outcome: 'oo' }], phases: [{ label: 'FP', durationMin: 1 }] },
}

const MALFORMED = [null, undefined, 42, 'string', true]

// ═══════════════════════════════════════════════════════════════════════════
// match-readiness
// ═══════════════════════════════════════════════════════════════════════════

test('match-readiness — reshape: gauges/confidence/verdict are SELECTED, not computed', () => {
  const out = mapMatchReadiness({
    overallScore: 84, availabilityScore: 90, fitnessScore: 76, cohesionScore: 30,
    confidence: 0.72, verdict: 'ready_with_risks',
    keyConcerns: [{ severity: 'high', summary: 'A' }, { severity: 'medium', summary: 'B' }],
    evidenceIds: ['e1', 'e2'],
  }, FB.matchReadiness)
  assert.equal(out.state, 'live')
  assert.deepEqual(out.gauges, { overall: 84, availability: 90, fitness: 76, cohesion: 30 })   // verbatim, no derivation
  assert.equal(out.confidence, 0.72)
  assert.equal(out.verdict, 'Ready — with risks to manage')                                    // label lookup only
  assert.deepEqual(out.risks, [{ label: 'A', severity: 'high' }, { label: 'B', severity: 'medium' }])  // order preserved, no ranking
  assert.deepEqual(out.evidence, [{ label: 'e1' }, { label: 'e2' }])
  assert.deepEqual(Object.keys(out).sort(), ['confidence', 'evidence', 'gauges', 'risks', 'state', 'verdict'])
})

test('match-readiness — malformed input → fallback, never throws', () => {
  for (const bad of MALFORMED) assert.deepEqual(mapMatchReadiness(bad, FB.matchReadiness), FB.matchReadiness)
})

test('match-readiness — empty input → fallback risks/evidence, state live', () => {
  const out = mapMatchReadiness({}, FB.matchReadiness)
  assert.equal(out.state, 'live')
  assert.deepEqual(out.risks, FB.matchReadiness.risks)        // no invented risks
  assert.deepEqual(out.gauges, { overall: 11, availability: 12, fitness: 13, cohesion: 14 })  // fallback gauges
})

// ═══════════════════════════════════════════════════════════════════════════
// coach-dna
// ═══════════════════════════════════════════════════════════════════════════

test('coach-dna — reshape: characteristics → traits, order + scores preserved (no ranking)', () => {
  const out = mapCoachDna({
    maturity: 0.42, style: { summary: 'Attack-minded' },
    characteristics: { a: { key: 'a', label: 'A', score: 30, confidence: 0.6, descriptor: 'da' }, b: { key: 'b', label: 'B', score: 90, confidence: 0.7, descriptor: 'db' } },
  }, FB.coachDna)
  assert.equal(out.state, 'live')
  assert.equal(out.maturity, 0.42)
  assert.equal(out.summary, 'Attack-minded')
  assert.equal(out.traits.length, 2)
  assert.deepEqual(out.traits.map(t => t.key), ['a', 'b'])   // insertion order, NOT sorted by score
  assert.deepEqual(out.traits.map(t => t.score), [30, 90])   // verbatim scores
  assert.deepEqual(Object.keys(out).sort(), ['maturity', 'state', 'summary', 'traits'])
})

test('coach-dna — malformed → fallback; empty → fallback traits', () => {
  for (const bad of MALFORMED) assert.deepEqual(mapCoachDna(bad, FB.coachDna), FB.coachDna)
  assert.deepEqual(mapCoachDna({}, FB.coachDna).traits, FB.coachDna.traits)
})

// ═══════════════════════════════════════════════════════════════════════════
// season
// ═══════════════════════════════════════════════════════════════════════════

test('season — reshape: values SELECTED from nested objects (no projection/calc)', () => {
  const out = mapSeason({
    seasonTrajectory: { series: [{ round: 1, points: 4 }, { round: 2, points: 0 }] },
    expectedPointsTotal: { value: 60 }, expectedEndPosition: { value: 3 },
    championshipProbability: { value: 14 }, playoffProbability: { value: 46 }, relegationProbability: { value: 12 },
  }, FB.season)
  assert.equal(out.state, 'live')
  assert.deepEqual(out.trajectory, [{ round: 1, value: 4 }, { round: 2, value: 0 }])   // points→value rename, order kept
  assert.deepEqual(out.projection, { points: 60, position: 3 })                        // .value selected, not recomputed
  assert.deepEqual(out.probabilities, { title: 14, playoff: 46, relegation: 12 })
  assert.deepEqual(Object.keys(out).sort(), ['probabilities', 'projection', 'state', 'trajectory'])
})

test('season — malformed → fallback; empty → fallback trajectory/projection', () => {
  for (const bad of MALFORMED) assert.deepEqual(mapSeason(bad, FB.season), FB.season)
  const out = mapSeason({}, FB.season)
  assert.deepEqual(out.trajectory, FB.season.trajectory)
  assert.deepEqual(out.projection, { points: 99, position: 9 })
})

// ═══════════════════════════════════════════════════════════════════════════
// opponent
// ═══════════════════════════════════════════════════════════════════════════

test('opponent — reshape: strengths/threats SELECTED, order preserved (no ranking)', () => {
  const out = mapOpponent({
    opponentName: 'Naas RFC', summary: 'Strong set-piece', maturity: 0.5,
    strengths: [{ key: 'sp', label: 'Set-piece', score: 78, confidence: 0.6 }, { key: 'kg', label: 'Kicking', score: 40, confidence: 0.5 }],
    weaknesses: [{ key: 'hb', label: 'High ball', score: 38, confidence: 0.5 }],
    threats: [{ label: 'Contestable kicks', severity: 'high' }],
    opportunities: [{ label: 'Attack the high ball' }],
  }, FB.opponent)
  assert.equal(out.state, 'live')
  assert.equal(out.name, 'Naas RFC')
  assert.deepEqual(out.strengths.map(s => s.score), [78, 40])    // order kept, not sorted
  assert.equal(out.weaknesses.length, 1)
  assert.deepEqual(out.threats, [{ label: 'Contestable kicks', severity: 'high' }])
  assert.deepEqual(out.opportunities, [{ label: 'Attack the high ball' }])
  assert.deepEqual(Object.keys(out).sort(), ['maturity', 'name', 'opportunities', 'state', 'strengths', 'summary', 'threats', 'weaknesses'])
})

test('opponent — malformed → fallback; empty → fallback collections', () => {
  for (const bad of MALFORMED) assert.deepEqual(mapOpponent(bad, FB.opponent), FB.opponent)
  const out = mapOpponent({}, FB.opponent)
  assert.deepEqual(out.strengths, FB.opponent.strengths)
  assert.deepEqual(out.threats, FB.opponent.threats)
})

// ═══════════════════════════════════════════════════════════════════════════
// executive-recommendations
// ═══════════════════════════════════════════════════════════════════════════

test('executive-recommendations — presents recs verbatim: order/count preserved, none invented', () => {
  const out = mapExecutiveRecommendations([
    { id: 'b', title: 'B', category: 'Selection', priority: 'high', confidence: 88 },
    { id: 'a', type: 'Training', action: 'A-action', why: 'because', priority: 'medium', confidence: 72 },
  ], FB.executiveRecommendations)
  assert.equal(out.state, 'live')
  assert.equal(out.items.length, 2)                            // count preserved — none generated
  assert.deepEqual(out.items.map(i => i.id), ['b', 'a'])       // order preserved — no ranking
  assert.equal(out.items[1].title, 'A-action')                 // title ← action fallback (selection, not generation)
  assert.equal(out.items[1].category, 'Training')              // category ← type
  assert.equal(out.items[1].detail, 'because')                 // detail ← why
  assert.deepEqual(Object.keys(out).sort(), ['items', 'state'])
})

test('executive-recommendations — malformed → fallback; empty list → fallback items (none invented)', () => {
  for (const bad of [null, undefined, 42, 'x']) assert.deepEqual(mapExecutiveRecommendations(bad, FB.executiveRecommendations), FB.executiveRecommendations)
  assert.deepEqual(mapExecutiveRecommendations([], FB.executiveRecommendations).items, FB.executiveRecommendations.items)
  // also accepts { recommendations: [...] } / { items: [...] } wrappers
  assert.equal(mapExecutiveRecommendations({ recommendations: [{ id: 'x', title: 'X' }] }, FB.executiveRecommendations).items.length, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// memory
// ═══════════════════════════════════════════════════════════════════════════

test('memory — reshape: nodes/edges SELECTED; dangling edges dropped (safety, not logic)', () => {
  const out = mapMemory({
    nodes: [{ id: 'n1', type: 'player', label: 'Player A' }, { id: 'n2', type: 'team', label: 'Team B', activated: true }],
    edges: [{ from: 'n1', to: 'n2', weight: 1 }, { from: 'n1', to: 'ghost', weight: 1 }],
    recentlyActivated: ['n2'],
  }, FB.memory)
  assert.equal(out.state, 'live')
  assert.deepEqual(out.nodes.map(n => n.id), ['n1', 'n2'])      // order preserved
  assert.equal(out.nodes[0].cluster, 'player')                 // cluster ← type
  assert.equal(out.nodes[1].activated, true)
  assert.equal(out.edges.length, 1)                            // edge to non-existent 'ghost' dropped
  assert.deepEqual(out.edges[0], { from: 'n1', to: 'n2', weight: 1 })
  assert.deepEqual(out.recentlyActivated, ['n2'])
  assert.deepEqual(Object.keys(out).sort(), ['edges', 'nodes', 'recentlyActivated', 'state'])
})

test('memory — malformed → fallback; empty graph → fallback content, state live', () => {
  for (const bad of MALFORMED) assert.deepEqual(mapMemory(bad, FB.memory), FB.memory)
  const out = mapMemory({ nodes: [], edges: [] }, FB.memory)
  assert.equal(out.state, 'live')
  assert.deepEqual(out.nodes, FB.memory.nodes)                 // keeps placeholder nodes when empty
})

// ═══════════════════════════════════════════════════════════════════════════
// training
// ═══════════════════════════════════════════════════════════════════════════

test('training — reshape: theme/duration SELECTED; phases object → ordered list (no scheduling)', () => {
  const out = mapTraining({
    theme: 'Defensive line speed', durationMin: 60, workloadStatus: 'within cap',
    objectives: [{ id: 'o1', label: 'Line speed', outcome: 'Sub-2s connect', priority: 1 }],
    phases: { warmup: { label: 'Warm-up', durationMin: 10, activities: [] }, skill: { label: 'Skill', durationMin: 30, activities: [] } },
  }, FB.training)
  assert.equal(out.state, 'live')
  assert.equal(out.theme, 'Defensive line speed')
  assert.equal(out.durationMin, 60)
  assert.equal(out.workloadStatus, 'within cap')
  assert.deepEqual(out.objectives, [{ label: 'Line speed', outcome: 'Sub-2s connect' }])   // only label/outcome selected
  assert.deepEqual(out.phases, [{ label: 'Warm-up', durationMin: 10 }, { label: 'Skill', durationMin: 30 }])  // durations verbatim
  assert.deepEqual(Object.keys(out).sort(), ['durationMin', 'objectives', 'phases', 'state', 'theme', 'workloadStatus'])
})

test('training — malformed → fallback; empty → fallback objectives/phases', () => {
  for (const bad of MALFORMED) assert.deepEqual(mapTraining(bad, FB.training), FB.training)
  const out = mapTraining({}, FB.training)
  assert.deepEqual(out.objectives, FB.training.objectives)
  assert.deepEqual(out.phases, FB.training.phases)
})

// ═══════════════════════════════════════════════════════════════════════════
// cross-cutting guarantees
// ═══════════════════════════════════════════════════════════════════════════

test('all mappers — never throw on any malformed input and always return an object', () => {
  const mappers = [mapMatchReadiness, mapCoachDna, mapSeason, mapOpponent, mapExecutiveRecommendations, mapMemory, mapTraining]
  for (const map of mappers) {
    for (const bad of [null, undefined, 42, 'x', true, [], {}, NaN, () => {}]) {
      const out = map(bad, {})
      assert.equal(typeof out, 'object')
      assert.ok(out !== null)
    }
  }
})

test('all mappers — are pure: same input → deeply-equal output, input not mutated', () => {
  const cases = [
    [mapMatchReadiness, { overallScore: 50, verdict: 'ready' }],
    [mapCoachDna, { maturity: 0.3, characteristics: { a: { key: 'a', score: 10 } } }],
    [mapSeason, { seasonTrajectory: { series: [{ round: 1, points: 3 }] } }],
    [mapOpponent, { opponentName: 'X', strengths: [{ key: 's', score: 9 }] }],
    [mapExecutiveRecommendations, [{ id: 'r', title: 'R' }]],
    [mapMemory, { nodes: [{ id: 'n', type: 't' }], edges: [] }],
    [mapTraining, { theme: 'T', phases: { a: { label: 'A', durationMin: 5 } } }],
  ]
  for (const [map, input] of cases) {
    const frozen = JSON.parse(JSON.stringify(input))
    const a = map(input, {})
    const b = map(input, {})
    assert.deepEqual(a, b)                       // deterministic
    assert.deepEqual(input, frozen)              // input not mutated
  }
})
