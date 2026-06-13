/**
 * AI Brain — M28 Season Intelligence Engine Tests
 *
 * Coverage:
 *  1. Types / version / complete 20-output shape
 *  2. Season state derivation (points, record, form, PD)
 *  3. Projections — expected points/position + championship/playoff/relegation
 *     respond correctly to a winning vs a rebuilding season
 *  4. Trajectory (improving / declining)
 *  5. Fatigue curves + workload graphs
 *  6. Development curves + targets + player improvement
 *  7. Rotation health (over-used core)
 *  8. Coach impact
 *  9. Goals / target achievement
 * 10. Milestones + risks + priority recommendations (with WHY/evidence/conf/fallback)
 * 11. Five scenarios: early / mid / end / winning / rebuilding
 * 12. Determinism
 * 13. Graceful degradation (pre-season) + manual overrides
 * 14. AI wiring (flag / tiers)
 * 15. Structural contract (Brain-only)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSeasonProfile, SEASON_VERSION } from '../ai-brain/season/index.js'
import { AI } from '../ai-brain/index.js'

// ── fixture builders ──────────────────────────────────────────────────────────

let _fx = 0
const result = (pf, pa, bonus = 0) => ({ pointsFor: pf, pointsAgainst: pa, outcome: pf > pa ? 'W' : pf < pa ? 'L' : 'D', bonusPoints: bonus })
const played = (round, opp, res, venue = 'home') => ({ fixtureId: `f${_fx++}`, round, opponentId: opp, venue, result: res })
const upcoming = (round, opp, venue = 'home', importance = 'normal') => ({ fixtureId: `f${_fx++}`, round, opponentId: opp, venue, importance })

/** A season with `wins` wins, `losses` losses out of `playedN`, rest upcoming to `total`. */
function season({ wins = 0, draws = 0, losses = 0, total = 22, bonusEach = 1 }) {
  const fixtures = []
  let r = 1
  for (let i = 0; i < wins; i++) fixtures.push(played(r++, `opp${r}`, result(28, 12, bonusEach)))
  for (let i = 0; i < draws; i++) fixtures.push(played(r++, `opp${r}`, result(17, 17)))
  for (let i = 0; i < losses; i++) fixtures.push(played(r++, `opp${r}`, result(10, 26)))
  const playedN = wins + draws + losses
  for (let i = playedN; i < total; i++) fixtures.push(upcoming(r++, `opp${r}`))
  return { fixtures, league: { teams: 12, pointsForWin: 4, pointsForDraw: 2, playoffSpots: 4, relegationSpots: 2 } }
}

const OUTPUTS = [
  'currentSeasonScore', 'seasonTrajectory', 'leagueTrend', 'playerDevelopmentCurves', 'workloadGraphs',
  'fatigueCurves', 'injuryForecast', 'championshipProbability', 'playoffProbability', 'relegationProbability',
  'targetAchievement', 'developmentTargets', 'playerImprovement', 'coachImpact', 'squadRotationHealth',
  'seasonRisks', 'priorityRecommendations', 'milestoneAlerts', 'expectedEndPosition', 'expectedPointsTotal',
]

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — shape
// ─────────────────────────────────────────────────────────────────────────────

test('Complete season profile — version + all 20 outputs', () => {
  const intel = buildSeasonProfile({ ...season({ wins: 6, losses: 3 }), grade: 'senior', format: 'fifteens' })
  assert.equal(intel.seasonVersion, SEASON_VERSION)
  for (const f of OUTPUTS) assert.ok(f in intel, `missing output ${f}`)
  assert.ok(intel.explanation && typeof intel.confidence === 'number')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — state
// ─────────────────────────────────────────────────────────────────────────────

test('Season state — points, record, points difference', () => {
  const intel = buildSeasonProfile(season({ wins: 5, draws: 1, losses: 2 }))
  const s = intel.currentSeasonScore
  // 5 wins × (4+1 bonus) + 1 draw × 2 + 2 losses × 0 = 27
  assert.equal(s.points, 27)
  assert.deepEqual(s.record, { wins: 5, draws: 1, losses: 2 })
  assert.ok(s.pointsDifference > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — projections
// ─────────────────────────────────────────────────────────────────────────────

test('Projections — winning season has high title/playoff, low relegation', () => {
  const intel = buildSeasonProfile(season({ wins: 16, losses: 2, total: 22 }))
  assert.ok(intel.championshipProbability.value >= 40)
  assert.ok(intel.playoffProbability.value >= 70)
  assert.ok(intel.relegationProbability.value <= 15)
  assert.ok(intel.expectedEndPosition.value <= 3)
  assert.ok(intel.expectedPointsTotal.value > intel.currentSeasonScore.points)
})

test('Projections — rebuilding season has high relegation, low title', () => {
  const intel = buildSeasonProfile(season({ wins: 2, losses: 16, total: 22 }))
  assert.ok(intel.relegationProbability.value >= 50)
  assert.ok(intel.championshipProbability.value <= 10)
  assert.ok(intel.expectedEndPosition.value >= 9)
})

test('Expected points = current + projected remaining', () => {
  const intel = buildSeasonProfile(season({ wins: 8, losses: 3, total: 22 }))
  const ep = intel.expectedPointsTotal
  assert.equal(ep.value, ep.current + ep.projectedRemaining)
  assert.equal(ep.current, intel.currentSeasonScore.points)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — trajectory
// ─────────────────────────────────────────────────────────────────────────────

test('Trajectory — improving when recent results beat early ones', () => {
  // early losses, recent wins
  const fixtures = []
  let r = 1
  for (let i = 0; i < 4; i++) fixtures.push(played(r++, `o${r}`, result(10, 24)))
  for (let i = 0; i < 4; i++) fixtures.push(played(r++, `o${r}`, result(30, 12, 1)))
  for (let i = 8; i < 22; i++) fixtures.push(upcoming(r++, `o${r}`))
  const intel = buildSeasonProfile({ fixtures })
  assert.equal(intel.seasonTrajectory.trajectory, 'improving')
})

test('Trajectory — declining when recent results worse than early', () => {
  const fixtures = []
  let r = 1
  for (let i = 0; i < 4; i++) fixtures.push(played(r++, `o${r}`, result(30, 12, 1)))
  for (let i = 0; i < 4; i++) fixtures.push(played(r++, `o${r}`, result(10, 24)))
  for (let i = 8; i < 22; i++) fixtures.push(upcoming(r++, `o${r}`))
  const intel = buildSeasonProfile({ fixtures })
  assert.equal(intel.seasonTrajectory.trajectory, 'declining')
  assert.ok(intel.seasonRisks.risks.some(r => r.id === 'risk-form'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — fatigue / workload
// ─────────────────────────────────────────────────────────────────────────────

test('Fatigue curves + workload graphs from training history', () => {
  const trainingHistory = Array.from({ length: 8 }, (_, i) => ({ week: i + 1, loadUnits: 90 + i * 8, attendancePct: 90 }))
  const intel = buildSeasonProfile({ ...season({ wins: 5, losses: 3 }), trainingHistory })
  assert.equal(intel.workloadGraphs.workload.length, 8)
  assert.equal(intel.fatigueCurves.curves.length, 8)
  assert.ok(intel.fatigueCurves.curves.every(c => c.fatigueIndex >= 0 && c.fatigueIndex <= 100))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — development
// ─────────────────────────────────────────────────────────────────────────────

test('Development curves + targets + improvement', () => {
  const playerDevelopment = [
    { playerId: 'p1', name: 'Aki', series: [{ round: 1, rating: 60 }, { round: 5, rating: 68 }], target: 70, evidence: ['dev-p1'] },
    { playerId: 'p2', name: 'Boe', series: [{ round: 1, rating: 70 }, { round: 5, rating: 64 }] },
  ]
  const intel = buildSeasonProfile({ ...season({ wins: 5, losses: 3 }), playerDevelopment })
  assert.equal(intel.playerDevelopmentCurves.curves.length, 2)
  assert.ok(intel.playerImprovement.improvement.some(p => p.playerId === 'p1'))
  const tgt = intel.developmentTargets.targets.find(t => t.id === 'devtgt-p1')
  assert.ok(tgt && tgt.evidence.includes('dev-p1'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — rotation
// ─────────────────────────────────────────────────────────────────────────────

test('Rotation health — over-used core flagged', () => {
  const core = Array.from({ length: 11 }, (_, i) => `c${i}`)
  const selectionHistory = Array.from({ length: 8 }, () => ({ players: [...core] }))   // same 11 every game
  const intel = buildSeasonProfile({ ...season({ wins: 5, losses: 3 }), selectionHistory })
  assert.ok(['strained', 'at_risk'].includes(intel.squadRotationHealth.status))
  assert.ok(intel.squadRotationHealth.recommendations.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — coach impact
// ─────────────────────────────────────────────────────────────────────────────

test('Coach impact — high when results + development improve', () => {
  const fixtures = []
  let r = 1
  for (let i = 0; i < 4; i++) fixtures.push(played(r++, `o${r}`, result(12, 22)))
  for (let i = 0; i < 4; i++) fixtures.push(played(r++, `o${r}`, result(30, 10, 1)))
  for (let i = 8; i < 22; i++) fixtures.push(upcoming(r++, `o${r}`))
  const playerDevelopment = [{ playerId: 'p1', series: [{ round: 1, rating: 60 }, { round: 8, rating: 72 }] }]
  const trainingHistory = Array.from({ length: 8 }, (_, i) => ({ week: i + 1, loadUnits: 100, attendancePct: 92 }))
  const intel = buildSeasonProfile({ fixtures, playerDevelopment, trainingHistory })
  assert.ok(intel.coachImpact.score >= 60)
  assert.equal(intel.coachImpact.band, 'high')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — goals
// ─────────────────────────────────────────────────────────────────────────────

test('Target achievement — points goal tracked', () => {
  const intel = buildSeasonProfile({ ...season({ wins: 10, losses: 2, total: 22 }), goals: [{ id: 'g1', type: 'points', target: 70, label: 'Reach 70 points' }] })
  const t = intel.targetAchievement.targets.find(t => t.id === 'g1')
  assert.ok(t)
  assert.ok(['on_track', 'at_risk', 'behind'].includes(t.status))
  assert.equal(t.current, intel.currentSeasonScore.points)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — recommendations contract
// ─────────────────────────────────────────────────────────────────────────────

test('Every priority recommendation has WHY + evidence + confidence + fallback', () => {
  const intel = buildSeasonProfile(season({ wins: 2, losses: 14, total: 22 }))
  assert.ok(intel.priorityRecommendations.recommendations.length > 0)
  for (const r of intel.priorityRecommendations.recommendations) {
    assert.ok(r.recommendation && r.why)
    assert.ok(Array.isArray(r.evidence))
    assert.ok('fallback' in r)
    assert.ok(r.confidence != null || r.fallback)
  }
  assert.ok(intel.seasonRisks.risks.some(r => r.id === 'risk-relegation'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — five scenarios
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario — early season (few games, uncertain projections)', () => {
  const intel = buildSeasonProfile(season({ wins: 2, losses: 1, total: 22 }))
  assert.ok(intel.currentSeasonScore.points > 0)
  assert.ok(intel.confidence < 0.7)
  // probabilities near neutral baseline early
  assert.ok(intel.championshipProbability.value < 40)
})

test('Scenario — mid season (halfway milestone)', () => {
  const intel = buildSeasonProfile(season({ wins: 7, draws: 0, losses: 4, total: 22 }))
  assert.equal(intel.currentSeasonScore.record.wins + intel.currentSeasonScore.record.losses, 11)
  assert.ok(intel.milestoneAlerts.alerts.some(a => a.id === 'ms-halfway'))
})

test('Scenario — end season (most games played, high certainty)', () => {
  const intel = buildSeasonProfile(season({ wins: 14, losses: 6, total: 22 }))
  assert.ok(intel.confidence >= 0.6)
  assert.ok(intel.currentSeasonScore.points > 0)
  assert.ok(intel.expectedPointsTotal.projectedRemaining <= 12)   // few games left
})

test('Scenario — winning season (title race + safe)', () => {
  const intel = buildSeasonProfile(season({ wins: 18, losses: 2, total: 22 }))
  assert.ok(intel.championshipProbability.value >= 50)
  assert.ok(intel.milestoneAlerts.alerts.some(a => a.id === 'ms-title-race' || a.id === 'ms-playoff-likely'))
  assert.ok(intel.priorityRecommendations.recommendations.some(r => r.id === 'rec-title' || r.id === 'rec-playoff'))
})

test('Scenario — rebuilding season (relegation danger)', () => {
  const intel = buildSeasonProfile(season({ wins: 3, losses: 15, total: 22 }))
  assert.ok(intel.relegationProbability.value >= 50)
  assert.ok(intel.milestoneAlerts.alerts.some(a => a.id === 'ms-releg-danger'))
  assert.ok(intel.seasonRisks.risks.some(r => r.id === 'risk-relegation'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Deterministic — same context → identical profile', () => {
  const ctx = { ...season({ wins: 9, draws: 1, losses: 4 }), goals: [{ id: 'g', type: 'position', target: 4 }] }
  assert.deepEqual(buildSeasonProfile(ctx), buildSeasonProfile(ctx))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 13 — graceful degradation + overrides
// ─────────────────────────────────────────────────────────────────────────────

test('Pre-season (no results) → graceful fallback', () => {
  const intel = buildSeasonProfile(season({ wins: 0, losses: 0, total: 22 }))
  assert.equal(intel.ok, true)
  assert.equal(intel.isFallback, true)
  assert.equal(intel.currentSeasonScore.points, 0)
  for (const f of OUTPUTS) assert.ok(f in intel)
})

test('Manual override — expected position + suppress', () => {
  const intel = buildSeasonProfile({ ...season({ wins: 6, losses: 4 }), overrides: { expectedPosition: 1, suppress: ['milestoneAlerts'] } })
  assert.equal(intel.expectedEndPosition.value, 1)
  assert.equal(intel.expectedEndPosition.overridden, true)
  assert.equal(intel.milestoneAlerts.suppressed, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 14 — AI wiring
// ─────────────────────────────────────────────────────────────────────────────

test('AI.getSeasonIntelligence — wired + tier allowed', async () => {
  const r = await AI.getSeasonIntelligence(season({ wins: 7, losses: 3 }), { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.ok(r.expectedPointsTotal)
})

test('AI.getSeasonIntelligence — feature flag disabled', async () => {
  const r = await AI.getSeasonIntelligence({}, { tier: 'professional', flags: { 'ai.seasonIntelligence': false } })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('AI.getSeasonIntelligence — subscription gating (starter blocked)', async () => {
  const r = await AI.getSeasonIntelligence({}, { tier: 'starter' })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'insufficient_tier')
})

for (const tier of ['performance', 'professional', 'club', 'enterprise']) {
  test(`AI.getSeasonIntelligence — ${tier} tier allowed`, async () => {
    const r = await AI.getSeasonIntelligence(season({ wins: 4, losses: 4 }), { tier })
    assert.equal(r.available, true)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 15 — structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('season modules are Brain-only — no Core / no cross-Brain imports', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../ai-brain/season/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.js'))
  assert.ok(files.length >= 18)
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/integration', 'ai-brain/learning', 'ai-brain/coach-dna', 'ai-brain/opponent',
    'ai-brain/training-designer', 'ai-brain/match-strategy', 'ai-brain/live-match', 'coach-products',
    'index.html', '/core/', 'auth', 'match-centre', 'messaging',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    for (const path of forbidden) assert.ok(!src.includes(path), `${f} must not reference ${path}`)
    for (const imp of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(imp.startsWith('./'), `${f} import must be self-relative: ${imp}`)
    }
  }
})
