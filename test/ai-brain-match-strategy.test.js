/**
 * AI Brain — M26 Autonomous Match Strategy Engine Tests
 *
 * Coverage:
 *  1. Types / version / complete plan shape (all 15 outputs)
 *  2. Posture model (favourite / even / underdog) from relative strength
 *  3. Evidence + WHY on every recommendation
 *  4. Opponent-driven strategy (weak defence → attack wide; strong scrum → low count; etc.)
 *  5. Weather adjustments (wet / windy)
 *  6. Referee adjustments
 *  7. Favourite vs underdog game plans
 *  8. Format (sevens) + grade (youth) adaptation
 *  9. Determinism
 * 10. Manual coach overrides
 * 11. Graceful degradation + fallback template
 * 12. AI namespace wiring (flag / tiers / fallback)
 * 13. Structural contract (Brain-only)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildMatchPlan, STRATEGY_VERSION, PLAN_FIELD, POSTURE,
} from '../ai-brain/match-strategy/index.js'
import { AI } from '../ai-brain/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const dim = (score, evidence = []) => ({ score, evidence })

/** An opponent that is weak in defence/discipline/kicking and fades late. */
function weakOpponent() {
  return {
    opponentId: 'Riverside',
    dimensions: {
      attackTendencies: dim(45), defensiveTendencies: dim(30, ['e-def-1', 'e-def-2']),
      scrumProfile: dim(50), lineoutProfile: dim(35, ['e-lo-1']),
      kickProfile: dim(30, ['e-kick-1']), restartProfile: dim(40),
      disciplineProfile: dim(35, ['e-disc-1']), substitutionBehaviour: dim(40),
      fitnessTrends: dim(25, ['e-fit-1']), lateGameBehaviour: dim(30, ['e-late-1']),
      breakdownSpeed: dim(40), counterattackFrequency: dim(35),
    },
  }
}

/** A strong opponent: dominant scrum, dangerous attack & counter, finishes strong. */
function strongOpponent() {
  return {
    opponentId: 'Kingsmen',
    dimensions: {
      attackTendencies: dim(82, ['s-atk-1']), defensiveTendencies: dim(78),
      scrumProfile: dim(85, ['s-scr-1']), lineoutProfile: dim(80),
      kickProfile: dim(75), restartProfile: dim(80),
      disciplineProfile: dim(80), substitutionBehaviour: dim(75),
      fitnessTrends: dim(82, ['s-fit-1']), lateGameBehaviour: dim(80),
      breakdownSpeed: dim(80, ['s-bd-1']), counterattackFrequency: dim(78, ['s-cnt-1']),
    },
  }
}

function strongUs() { return { matchReadiness: { overallScore: 82, availabilityScore: 88, fitnessScore: 80 } } }
function weakUs() { return { matchReadiness: { overallScore: 45, availabilityScore: 50, fitnessScore: 42 } } }

const allRecs = (plan) => Object.values(PLAN_FIELD).flatMap(k => plan[k]?.recommendations ?? [])

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — shape
// ─────────────────────────────────────────────────────────────────────────────

test('Complete match plan — version + all 15 plan fields present', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), grade: 'senior', format: 'fifteens' })
  assert.equal(plan.strategyVersion, STRATEGY_VERSION)
  for (const f of Object.values(PLAN_FIELD)) {
    assert.ok(plan[f], `missing ${f}`)
    assert.ok(Array.isArray(plan[f].recommendations) && plan[f].recommendations.length > 0, `${f} has no recs`)
  }
  assert.ok(plan.gamePlan && plan.explanation && typeof plan.confidence === 'number')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — posture
// ─────────────────────────────────────────────────────────────────────────────

test('Posture — favourite when we are markedly stronger', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs() })
  assert.equal(plan.posture, POSTURE.FAVOURITE)
  assert.ok(plan.strengthIndex > 0)
})

test('Posture — underdog when opponent is markedly stronger', () => {
  const plan = buildMatchPlan({ opponent: strongOpponent(), ...weakUs() })
  assert.equal(plan.posture, POSTURE.UNDERDOG)
  assert.ok(plan.strengthIndex < 0)
})

test('Posture — override forces posture', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), overrides: { posture: 'underdog' } })
  assert.equal(plan.posture, POSTURE.UNDERDOG)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — evidence + why
// ─────────────────────────────────────────────────────────────────────────────

test('Every recommendation explains WHY', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs() })
  for (const r of allRecs(plan)) {
    assert.ok(typeof r.recommendation === 'string' && r.recommendation.length > 0)
    assert.ok(typeof r.why === 'string' && r.why.length > 0, `rec ${r.id} missing why`)
    assert.ok(Array.isArray(r.evidence))
  }
})

test('Opponent-derived recommendations carry the opponent evidence chain', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs() })
  // attack-wide rec should cite the defensive evidence
  const wide = plan[PLAN_FIELD.ATTACK].recommendations.find(r => r.id === 'atk-wide')
  assert.ok(wide)
  assert.deepEqual(wide.evidence, ['e-def-1', 'e-def-2'])
  // plan-level evidence aggregates across engines
  assert.ok(plan.evidence.includes('e-def-1') && plan.evidence.includes('e-disc-1') && plan.evidence.includes('e-kick-1'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — opponent-driven strategy
// ─────────────────────────────────────────────────────────────────────────────

test('Weak opponent defence → attack wide; penalty-prone → camp in their half', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs() })
  assert.ok(plan[PLAN_FIELD.ATTACK].recommendations.some(r => r.id === 'atk-wide'))
  assert.ok(plan[PLAN_FIELD.TERRITORY].recommendations.some(r => r.id === 'terr-half'))
  assert.ok(plan[PLAN_FIELD.KICK].recommendations.some(r => r.id === 'kick-counter'))
  // fades late → bench finishers + momentum trigger
  assert.ok(plan[PLAN_FIELD.BENCH].recommendations.some(r => r.id === 'bench-finish'))
  assert.ok(plan[PLAN_FIELD.MOMENTUM].recommendations.some(r => r.id === 'mom-fade'))
})

test('Strong opponent scrum → keep count low; dangerous attack → line speed', () => {
  const plan = buildMatchPlan({ opponent: strongOpponent(), ...weakUs() })
  assert.ok(plan[PLAN_FIELD.SCRUM].recommendations.some(r => r.id === 'scr-quick'))
  assert.ok(plan[PLAN_FIELD.DEFENCE].recommendations.some(r => r.id === 'def-linespeed'))
  assert.ok(plan[PLAN_FIELD.RISKS].recommendations.some(r => r.id === 'risk-counter'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — weather
// ─────────────────────────────────────────────────────────────────────────────

test('Wet weather → reduce ball-in-hand, kick for territory', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), weather: 'wet' })
  assert.ok(plan[PLAN_FIELD.WEATHER].recommendations.some(r => r.id === 'wx-wet-handling'))
  assert.ok(plan[PLAN_FIELD.KICK].recommendations.some(r => r.id === 'kick-territory-wet'))
})

test('Windy weather → wind-based kick selection', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), weather: 'windy' })
  assert.ok(plan[PLAN_FIELD.WEATHER].recommendations.some(r => r.id === 'wx-wind'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — referee
// ─────────────────────────────────────────────────────────────────────────────

test('Referee adjustments — strict breakdown', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), refereeTendencies: ['strict_breakdown'] })
  assert.ok(plan[PLAN_FIELD.REFEREE].recommendations.some(r => r.id === 'ref-breakdown'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — favourite vs underdog game plans
// ─────────────────────────────────────────────────────────────────────────────

test('Favourite vs underdog produce different game plans', () => {
  const fav = buildMatchPlan({ opponent: weakOpponent(), ...strongUs() })
  const dog = buildMatchPlan({ opponent: strongOpponent(), ...weakUs() })
  assert.notEqual(fav.gamePlan, dog.gamePlan)
  assert.ok(dog[PLAN_FIELD.ATTACK].recommendations.some(r => r.id === 'atk-territory'))
  assert.ok(fav[PLAN_FIELD.ATTACK].recommendations.some(r => r.id === 'atk-control'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — format / grade
// ─────────────────────────────────────────────────────────────────────────────

test('Sevens — set-piece weight reduced; replacement windows on a 14-min clock', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), format: 'sevens' })
  assert.equal(plan.format, 'sevens')
  assert.ok(plan[PLAN_FIELD.SCRUM].summary.toLowerCase().includes('minimal'))
  assert.ok(plan[PLAN_FIELD.REPLACEMENTS].summary.includes("14'"))
})

test('Youth grade — supported', () => {
  const plan = buildMatchPlan({ opponent: weakOpponent(), grade: 'youth' })
  assert.equal(plan.grade, 'youth')
  assert.ok(plan.ok)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Deterministic — same context → identical plan', () => {
  const ctx = { opponent: weakOpponent(), ...strongUs(), weather: 'wet', refereeTendencies: ['strict_scrum'] }
  assert.deepEqual(buildMatchPlan(ctx), buildMatchPlan(ctx))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — overrides
// ─────────────────────────────────────────────────────────────────────────────

test('Manual coach override — adds and replaces recommendations + game plan', () => {
  const plan = buildMatchPlan({
    opponent: weakOpponent(), ...strongUs(),
    overrides: {
      gamePlan: 'Captain leads — play what we see',
      plan: { [PLAN_FIELD.ATTACK]: { summary: 'Direct, physical attack', addRecommendations: [{ recommendation: 'Target their 10 channel', why: 'Coach call' }], replace: true } },
    },
  })
  assert.equal(plan.gamePlan, 'Captain leads — play what we see')
  assert.equal(plan[PLAN_FIELD.ATTACK].summary, 'Direct, physical attack')
  assert.equal(plan[PLAN_FIELD.ATTACK].recommendations.length, 1)
  assert.ok(plan[PLAN_FIELD.ATTACK].recommendations[0].recommendation.includes('10 channel'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — graceful degradation / fallback
// ─────────────────────────────────────────────────────────────────────────────

test('Empty context → safe fallback plan (all fields, isFallback true)', () => {
  const plan = buildMatchPlan({})
  assert.equal(plan.ok, true)
  assert.equal(plan.isFallback, true)
  for (const f of Object.values(PLAN_FIELD)) {
    assert.ok(plan[f].recommendations.length > 0, `fallback ${f} empty`)
  }
  assert.equal(plan.posture, POSTURE.EVEN)
})

test('Partial inputs → not fallback, lower confidence', () => {
  const full = buildMatchPlan({ opponent: weakOpponent(), ...strongUs(), coachDNA: { characteristics: { attackVsDefenceBias: { score: 80 } } }, weeklyBrief: {}, selection: { frontRowCoverage: { status: 'secure' } } })
  const partial = buildMatchPlan({ opponent: weakOpponent() })
  assert.equal(partial.isFallback, false)
  assert.ok(full.confidence >= partial.confidence)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — AI wiring
// ─────────────────────────────────────────────────────────────────────────────

test('AI.buildMatchStrategy — wired + tier allowed', async () => {
  const r = await AI.buildMatchStrategy({ opponent: weakOpponent(), ...strongUs() }, { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.ok(r[PLAN_FIELD.ATTACK])
})

test('AI.buildMatchStrategy — feature flag disabled', async () => {
  const r = await AI.buildMatchStrategy({}, { tier: 'professional', flags: { 'ai.matchStrategy': false } })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('AI.buildMatchStrategy — subscription gating (starter blocked)', async () => {
  const r = await AI.buildMatchStrategy({}, { tier: 'starter' })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'insufficient_tier')
})

for (const tier of ['performance', 'professional', 'club', 'enterprise']) {
  test(`AI.buildMatchStrategy — ${tier} tier allowed`, async () => {
    const r = await AI.buildMatchStrategy({ opponent: weakOpponent() }, { tier })
    assert.equal(r.available, true)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 13 — structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('match-strategy modules are Brain-only — no Core / no cross-Brain imports', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../ai-brain/match-strategy/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.js'))
  assert.ok(files.length >= 13)
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/integration', 'ai-brain/learning', 'ai-brain/coach-dna', 'ai-brain/opponent',
    'ai-brain/training-designer', 'coach-products', 'index.html', '/core/', 'auth', 'match-centre', 'messaging',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    for (const path of forbidden) assert.ok(!src.includes(path), `${f} must not reference ${path}`)
    for (const imp of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(imp.startsWith('./'), `${f} import must be self-relative: ${imp}`)
    }
  }
})
