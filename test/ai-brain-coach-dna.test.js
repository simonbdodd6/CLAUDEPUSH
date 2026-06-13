/**
 * AI Brain — M23 Coach DNA Engine Tests
 *
 * Coverage:
 *  1. Types / shape
 *  2. Empty stream → neutral, zero-confidence DNA
 *  3. Discovery of each kind of tendency (attack/defence, welfare, youth, rotation…)
 *  4. Confidence grows with evidence; falls with conflict; decays without reinforcement
 *  5. Maturation over a season
 *  6. Manual overrides always win (advisory inferred score retained)
 *  7. Determinism
 *  8. Coaching style synthesis
 *  9. Season comparison / multiple seasons / evolution
 * 10. Season learning (what was discovered this season)
 * 11. Manual reset (+ asOf), export, versioning
 * 12. AI namespace wiring: feature flag, subscription tiers, graceful fallback
 * 13. Structural contract (Brain-only, no Core)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDNA, getCoachDNA, getCoachStyle, compareCoachEvolution, getSeasonLearning,
  resetCoachDNA, clearReset, exportCoachDNA, _clear, signalsFor,
  CHARACTERISTIC as C, CHARACTERISTIC_KEYS, DNA_VERSION,
} from '../ai-brain/coach-dna/index.js'
import { AI } from '../ai-brain/index.js'
import { replayAndSave, _clear as clearLearning } from '../ai-brain/learning/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function dt(base, n) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Build an ordered observation stream from [type, data] specs. */
function stream(specs, base = '2025-09-01', prefix = 'a') {
  return specs.map(([type, data], i) => ({
    observationId: `${prefix}${i}`, eventType: type, eventData: { ...data },
    recordedAt: dt(base, i), confidence: 1,
  }))
}
const rep = (n, spec) => Array.from({ length: n }, () => spec)
const ACC = 'recommendation_accepted'
const REJ = 'recommendation_rejected'
const SEL = 'player_selected'
const MATCH = 'match_outcome_recorded'
const PREF = 'coach_preference_set'
const ch = (dna, key) => dna.characteristics[key]

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Types
// ─────────────────────────────────────────────────────────────────────────────

test('Ten characteristics, version present', () => {
  assert.equal(CHARACTERISTIC_KEYS.length, 10)
  const dna = buildCoachDNA('c1', [])
  assert.equal(dna.dnaVersion, DNA_VERSION)
  for (const k of CHARACTERISTIC_KEYS) {
    const e = ch(dna, k)
    assert.ok('score' in e && 'confidence' in e && 'evidence' in e && 'lastUpdated' in e && 'observationCount' in e)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Empty / neutral
// ─────────────────────────────────────────────────────────────────────────────

test('Empty stream — neutral scores, zero confidence, zero maturity', () => {
  const dna = buildCoachDNA('c1', [])
  assert.equal(dna.maturity, 0)
  assert.deepEqual(dna.discovered, [])
  for (const k of CHARACTERISTIC_KEYS) {
    assert.equal(ch(dna, k).score, 50)
    assert.equal(ch(dna, k).confidence, 0)
    assert.equal(ch(dna, k).band, 'unknown')
  }
  assert.ok(dna.style.summary.includes('emerging'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Discovery of tendencies
// ─────────────────────────────────────────────────────────────────────────────

test('Attacking coach — attack bias discovered high', () => {
  const obs = stream(rep(8, [MATCH, { approach: 'expansive' }]))
  const dna = buildCoachDNA('c1', obs)
  assert.ok(ch(dna, C.ATTACK_DEFENCE_BIAS).score >= 80)
  assert.equal(ch(dna, C.ATTACK_DEFENCE_BIAS).band, 'high')
  assert.ok(ch(dna, C.ATTACK_DEFENCE_BIAS).confidence > 0)
  assert.ok(dna.discovered.includes(C.ATTACK_DEFENCE_BIAS))
})

test('Defensive coach — attack bias discovered low', () => {
  const obs = stream(rep(8, [MATCH, { approach: 'conservative' }]))
  const dna = buildCoachDNA('c1', obs)
  assert.ok(ch(dna, C.ATTACK_DEFENCE_BIAS).score <= 25)
  assert.equal(ch(dna, C.ATTACK_DEFENCE_BIAS).band, 'low')
})

test('Welfare-first coach — welfare emphasis high; rejecting welfare → low', () => {
  const high = buildCoachDNA('c1', stream(rep(6, [ACC, { category: 'welfare' }])))
  assert.equal(ch(high, C.WELFARE_EMPHASIS).band, 'high')
  const low = buildCoachDNA('c1', stream(rep(6, [REJ, { category: 'welfare' }])))
  assert.equal(ch(low, C.WELFARE_EMPHASIS).band, 'low')
})

test('Youth-promoting coach — youth tendency high', () => {
  const obs = stream(rep(6, [SEL, { isYouth: true }]))
  const dna = buildCoachDNA('c1', obs)
  assert.equal(ch(dna, C.YOUTH_PROMOTION).band, 'high')
  assert.ok(dna.discovered.includes(C.YOUTH_PROMOTION))
})

test('Heavy rotation — rotation high, continuity low', () => {
  const obs = stream(rep(6, [MATCH, { changes: 6 }]))
  const dna = buildCoachDNA('c1', obs)
  assert.equal(ch(dna, C.ROTATION_PHILOSOPHY).band, 'high')
  assert.equal(ch(dna, C.CONTINUITY_PREFERENCE).band, 'low')
})

test('Settled side — continuity high, rotation low', () => {
  const obs = stream([...rep(6, [MATCH, { changes: 0 }]), ...rep(4, [SEL, { retained: true }])])
  const dna = buildCoachDNA('c1', obs)
  assert.equal(ch(dna, C.CONTINUITY_PREFERENCE).band, 'high')
  assert.equal(ch(dna, C.ROTATION_PHILOSOPHY).band, 'low')
})

test('signalsFor — pure mapping sanity', () => {
  assert.ok(signalsFor({ eventType: MATCH, eventData: { approach: 'expansive' } }).some(s => s.characteristic === C.ATTACK_DEFENCE_BIAS && s.delta > 0))
  assert.deepEqual(signalsFor({ eventType: 'unknown_event', eventData: {} }), [])
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Confidence dynamics
// ─────────────────────────────────────────────────────────────────────────────

test('Confidence grows with more supporting evidence', () => {
  const few  = buildCoachDNA('c1', stream(rep(3, [MATCH, { approach: 'expansive' }])))
  const many = buildCoachDNA('c1', stream(rep(20, [MATCH, { approach: 'expansive' }])))
  assert.ok(ch(many, C.ATTACK_DEFENCE_BIAS).confidence > ch(few, C.ATTACK_DEFENCE_BIAS).confidence)
})

test('Conflicting evidence lowers confidence (vs consistent)', () => {
  const consistent = buildCoachDNA('c1', stream(rep(10, [MATCH, { approach: 'expansive' }])))
  const conflicted = buildCoachDNA('c1', stream([...rep(5, [MATCH, { approach: 'expansive' }]), ...rep(5, [MATCH, { approach: 'conservative' }])]))
  assert.ok(ch(conflicted, C.ATTACK_DEFENCE_BIAS).confidence < ch(consistent, C.ATTACK_DEFENCE_BIAS).confidence)
})

test('Confidence decays without recent reinforcement', () => {
  const stale  = buildCoachDNA('c1', stream([...rep(5, [MATCH, { approach: 'expansive' }]), ...rep(40, [ACC, { category: 'welfare' }])]))
  const recent = buildCoachDNA('c1', stream([...rep(40, [ACC, { category: 'welfare' }]), ...rep(5, [MATCH, { approach: 'expansive' }])]))
  assert.ok(ch(recent, C.ATTACK_DEFENCE_BIAS).confidence > ch(stale, C.ATTACK_DEFENCE_BIAS).confidence)
})

test('Every supporting observation tracks an evidence id and count', () => {
  const dna = buildCoachDNA('c1', stream(rep(4, [ACC, { category: 'welfare' }])))
  const e = ch(dna, C.WELFARE_EMPHASIS)
  assert.equal(e.observationCount, 4)
  assert.ok(e.evidence.length > 0 && e.evidence.length <= 8)
  assert.ok(e.lastUpdated)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — Maturation over a season
// ─────────────────────────────────────────────────────────────────────────────

test('Maturity increases as a season accumulates', () => {
  const early = buildCoachDNA('c1', stream([[MATCH, { approach: 'expansive' }], [ACC, { category: 'welfare' }]]))
  const specs = []
  for (let i = 0; i < 25; i++) { specs.push([MATCH, { approach: 'expansive', changes: 5 }]); specs.push([ACC, { category: 'welfare' }]) }
  const full = buildCoachDNA('c1', stream(specs))
  assert.ok(full.maturity > early.maturity)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Manual overrides (explicit always wins)
// ─────────────────────────────────────────────────────────────────────────────

test('Explicit coach setting overrides inferred DNA (advisory inferred retained)', () => {
  // Observations infer LOW risk (rejecting urgent recs), but coach sets risk HIGH.
  const obs = stream([
    ...rep(5, [REJ, { category: 'selection', urgency: 'high' }]),  // infers cautious
    [PREF, { key: 'riskTolerance', value: 'high' }],
  ])
  const dna = buildCoachDNA('c1', obs)
  const e = ch(dna, C.RISK_APPETITE)
  assert.equal(e.manual, true)
  assert.equal(e.score, 85)
  assert.equal(e.confidence, 1)
  assert.ok(e.inferredScore < 50, 'inferred (cautious) score retained for transparency')
  assert.ok(dna.manualOverrides.includes(C.RISK_APPETITE))
})

test('Explicit numeric DNA-key override', () => {
  const dna = buildCoachDNA('c1', stream([[PREF, { key: 'attackVsDefenceBias', value: 90 }]]))
  const e = ch(dna, C.ATTACK_DEFENCE_BIAS)
  assert.equal(e.manual, true)
  assert.equal(e.score, 90)
})

test('Latest explicit setting wins', () => {
  const dna = buildCoachDNA('c1', stream([
    [PREF, { key: 'squadRotation', value: 'low' }],
    [PREF, { key: 'squadRotation', value: 'high' }],
  ]))
  assert.equal(ch(dna, C.ROTATION_PHILOSOPHY).score, 85)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — Determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Deterministic — identical stream → identical DNA', () => {
  const obs = stream([...rep(6, [MATCH, { approach: 'expansive' }]), ...rep(4, [SEL, { isYouth: true }])])
  assert.deepEqual(buildCoachDNA('c1', obs), buildCoachDNA('c1', obs))
})

test('Order-independent within equal timestamps via stable id sort', () => {
  const a = buildCoachDNA('c1', stream(rep(5, [MATCH, { approach: 'expansive' }])))
  const shuffled = [...stream(rep(5, [MATCH, { approach: 'expansive' }]))].reverse()
  const b = buildCoachDNA('c1', shuffled)
  assert.equal(ch(a, C.ATTACK_DEFENCE_BIAS).score, ch(b, C.ATTACK_DEFENCE_BIAS).score)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — Style
// ─────────────────────────────────────────────────────────────────────────────

test('Coaching style summarises strongest traits', () => {
  const obs = stream([...rep(8, [MATCH, { approach: 'expansive' }]), ...rep(6, [ACC, { category: 'welfare' }])])
  const style = getCoachStyle('c1', obs)
  assert.equal(style.dnaVersion, DNA_VERSION)
  assert.ok(style.summary.includes('attack-oriented'))
  assert.ok(style.traits.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — Evolution / seasons
// ─────────────────────────────────────────────────────────────────────────────

test('Evolution across two seasons — transition + trend', () => {
  const s1 = stream(rep(8, [MATCH, { approach: 'conservative' }]), '2024-09-01', 's1')   // 2024/2025 defensive
  const s2 = stream(rep(8, [MATCH, { approach: 'expansive' }]), '2025-09-01', 's2')       // 2025/2026 attacking
  const evo = compareCoachEvolution('c1', [...s1, ...s2])
  assert.equal(evo.seasons.length, 2)
  assert.equal(evo.transitions.length, 1)
  const attackChange = evo.transitions[0].changes.find(x => x.key === C.ATTACK_DEFENCE_BIAS)
  assert.equal(attackChange.direction, 'rising')
  assert.ok(attackChange.delta > 0)
  assert.ok(evo.trend.mostChanged.some(m => m.key === C.ATTACK_DEFENCE_BIAS))
})

test('Multiple seasons supported', () => {
  const s1 = stream(rep(5, [MATCH, { approach: 'conservative' }]), '2023-09-01', 'a')
  const s2 = stream(rep(5, [MATCH, { approach: 'pragmatic' }]),    '2024-09-01', 'b')
  const s3 = stream(rep(5, [MATCH, { approach: 'expansive' }]),    '2025-09-01', 'c')
  const evo = compareCoachEvolution('c1', [...s1, ...s2, ...s3])
  assert.equal(evo.seasons.length, 3)
  assert.equal(evo.perSeason.length, 3)
})

test('Season learning — newly discovered characteristics reported with delta', () => {
  const s1 = stream(rep(6, [MATCH, { approach: 'conservative' }]), '2024-09-01', 'a')   // attack known low
  const s2 = stream(rep(6, [SEL, { isYouth: true }]), '2025-09-01', 'b')                 // youth newly discovered
  const learning = getSeasonLearning('c1', [...s1, ...s2], { season: '2025/2026' })
  assert.equal(learning.season, '2025/2026')
  assert.equal(learning.previousSeason, '2024/2025')
  assert.ok(learning.discovered.some(d => d.key === C.YOUTH_PROMOTION))
  assert.ok(typeof learning.characteristics[C.YOUTH_PROMOTION].deltaVsPrevSeason === 'number')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — Reset / export / store
// ─────────────────────────────────────────────────────────────────────────────

test('Manual full reset clears learned DNA (observations untouched)', () => {
  _clear()
  const obs = stream(rep(8, [MATCH, { approach: 'expansive' }]))
  const before = getCoachDNA('coach-r', obs)
  assert.equal(ch(before, C.ATTACK_DEFENCE_BIAS).band, 'high')
  resetCoachDNA('coach-r')                                   // full reset
  const after = getCoachDNA('coach-r', obs)
  assert.equal(ch(after, C.ATTACK_DEFENCE_BIAS).score, 50)   // neutral again
  assert.equal(after.observationCount, 0)
  clearReset('coach-r')
  const restored = getCoachDNA('coach-r', obs)
  assert.equal(ch(restored, C.ATTACK_DEFENCE_BIAS).band, 'high')
  _clear()
})

test('Reset with asOf excludes only earlier observations', () => {
  _clear()
  const obs = stream(rep(10, [MATCH, { approach: 'expansive' }]), '2025-09-01')
  resetCoachDNA('coach-r2', { asOf: dt('2025-09-01', 5) })   // keep from day 5 on
  const dna = getCoachDNA('coach-r2', obs)
  assert.ok(dna.observationCount < 10 && dna.observationCount > 0)
  _clear()
})

test('Export carries version + dna payload', () => {
  _clear()
  const obs = stream(rep(5, [MATCH, { approach: 'expansive' }]))
  const out = exportCoachDNA('coach-e', obs)
  assert.equal(out.exportVersion, DNA_VERSION)
  assert.equal(out.coachId, 'coach-e')
  assert.ok(out.dna && out.dna.characteristics)
  _clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — AI namespace wiring
// ─────────────────────────────────────────────────────────────────────────────

async function seed(coachId, observations) {
  await replayAndSave(coachId, observations)
}

test('AI.getCoachDNA — wired, reads learning observations', async () => {
  clearLearning()
  await seed('ai-c1', stream(rep(6, [MATCH, { approach: 'expansive' }])))
  const r = await AI.getCoachDNA('ai-c1', { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(ch(r, C.ATTACK_DEFENCE_BIAS).band, 'high')
  clearLearning()
})

test('AI.getCoachDNA — feature flag disabled', async () => {
  const r = await AI.getCoachDNA('ai-c1', { tier: 'professional', flags: { 'ai.coachDNA': false } })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('AI.getCoachDNA — subscription gating (starter blocked)', async () => {
  const r = await AI.getCoachDNA('ai-c1', { tier: 'starter' })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'insufficient_tier')
})

for (const tier of ['professional', 'club', 'enterprise']) {
  test(`AI.getCoachDNA — ${tier} tier allowed`, async () => {
    clearLearning()
    const r = await AI.getCoachDNA('ai-c2', { tier })
    assert.equal(r.available, true)
    clearLearning()
  })
}

test('AI.getCoachDNA — graceful fallback for unknown coach (empty but valid)', async () => {
  clearLearning()
  const r = await AI.getCoachDNA('nobody', { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.observationCount, 0)
  assert.equal(r.maturity, 0)
  clearLearning()
})

test('AI.getCoachStyle / compareCoachEvolution / getSeasonLearning — wired', async () => {
  clearLearning()
  const s1 = stream(rep(6, [MATCH, { approach: 'conservative' }]), '2024-09-01', 'a')
  const s2 = stream(rep(6, [MATCH, { approach: 'expansive' }]), '2025-09-01', 'b')
  await seed('ai-c3', [...s1, ...s2])
  const style = await AI.getCoachStyle('ai-c3', { tier: 'enterprise' })
  assert.equal(style.available, true)
  assert.ok(style.summary.length > 0)
  const evo = await AI.compareCoachEvolution('ai-c3', { tier: 'enterprise' })
  assert.equal(evo.seasons.length, 2)
  const learning = await AI.getSeasonLearning('ai-c3', { tier: 'enterprise' })
  assert.equal(learning.available, true)
  clearLearning()
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — Structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('coach-dna modules are Brain-only — no Core / no cross-Brain imports', async () => {
  const { readFileSync } = await import('node:fs')
  const files = ['coach-dna-types.js', 'characteristics.js', 'season.js', 'dna-engine.js', 'index.js']
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/integration', 'ai-brain/learning', 'coach-products',
    'index.html', '/core/', 'auth', 'match-centre', 'messaging',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(`../ai-brain/coach-dna/${f}`, import.meta.url), 'utf8')
    // only self-relative imports
    for (const path of forbidden) assert.ok(!src.includes(path), `${f} must not reference ${path}`)
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])
    for (const imp of imports) assert.ok(imp.startsWith('./'), `${f} import must be self-relative: ${imp}`)
  }
})
