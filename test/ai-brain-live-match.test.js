/**
 * AI Brain — M27 Live Match Intelligence Engine Tests
 *
 * Coverage:
 *  1. Types / version / complete 16-output shape
 *  2. Match state derivation (score, clock, players-on-field, cards)
 *  3. Win probability responds to score + time + numerical advantage
 *  4. Momentum sign + evidence
 *  5. Discipline risk escalation
 *  6. Fatigue rises late and with 14 men
 *  7. Opportunity (extra man) + danger (down a man / under pressure)
 *  8. Critical moments timeline
 *  9. Five scenarios: first half, second half, comeback, defending a lead, 14 men
 * 10. Every recommendation has WHY + evidence + confidence + fallback
 * 11. Determinism
 * 12. Graceful degradation (no events) + manual overrides
 * 13. AI wiring (record/analyse, flag, tiers)
 * 14. Structural contract (Brain-only)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLiveIntelligence, LIVE_VERSION } from '../ai-brain/live-match/index.js'
import { AI } from '../ai-brain/index.js'

// ── event builders ────────────────────────────────────────────────────────────

let _seq = 0
const ev = (minute, type, team = 'us', data = {}, zone = null) => ({ eventId: `e${_seq++}`, minute, type, team, zone, data })
const tryScore = (m, team) => ev(m, 'score', team, { kind: 'try', points: 5 })
const conv = (m, team) => ev(m, 'score', team, { kind: 'conversion', points: 2 })
const pen3 = (m, team) => ev(m, 'score', team, { kind: 'penalty', points: 3 })
const penalty = (m, offender, zone) => ev(m, 'penalty', offender, {}, zone)
const card = (m, team, cardType = 'yellow') => ev(m, 'card', team, { cardType })
const tackle = (m, team, zone) => ev(m, 'tackle', team, {}, zone)
const ruck = (m, team, zone) => ev(m, 'ruck', team, {}, zone)
const terr = (m, team, zone) => ev(m, 'territory', team, {}, zone)
const turnover = (m, team, zone) => ev(m, 'turnover', team, {}, zone)

const OUTPUTS = [
  'matchState', 'momentumScore', 'pressureIndex', 'winProbability', 'expectedNextPhase',
  'dominantCollisionZone', 'fatigueAlerts', 'benchRecommendations', 'replacementTiming',
  'disciplineRisk', 'territoryMap', 'liveTacticalAdvice', 'criticalMoments',
  'opportunityDetection', 'dangerDetection', 'recommendedNextAction',
]

const allRecs = (intel) => [
  ...intel.opportunityDetection.recommendations,
  ...intel.dangerDetection.recommendations,
  ...intel.disciplineRisk.recommendations,
  ...intel.fatigueAlerts.alerts,
  ...intel.benchRecommendations.recommendations,
  ...intel.replacementTiming.recommendations,
  ...intel.liveTacticalAdvice.recommendations,
]

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — shape
// ─────────────────────────────────────────────────────────────────────────────

test('Complete live intelligence — version + all 16 outputs', () => {
  const intel = buildLiveIntelligence([tryScore(10, 'us'), conv(11, 'us')], { grade: 'senior', format: 'fifteens' })
  assert.equal(intel.liveVersion, LIVE_VERSION)
  for (const f of OUTPUTS) assert.ok(f in intel, `missing output ${f}`)
  assert.ok(intel.explanation && typeof intel.confidence === 'number')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — match state
// ─────────────────────────────────────────────────────────────────────────────

test('Match state — score, clock, phase derived from events', () => {
  const intel = buildLiveIntelligence([tryScore(10, 'us'), conv(11, 'us'), pen3(30, 'them')], {})
  const s = intel.matchState
  assert.equal(s.score.us, 7)
  assert.equal(s.score.them, 3)
  assert.equal(s.score.margin, 4)
  assert.equal(s.clock, 30)
  assert.equal(s.playersOnField.us, 15)
})

test('Match state — yellow card removes a player for the sin-bin window', () => {
  const live = buildLiveIntelligence([card(50, 'us', 'yellow'), ruck(52, 'us')], {})
  assert.equal(live.matchState.playersOnField.us, 14)   // 52 < 50+10
  const later = buildLiveIntelligence([card(50, 'us', 'yellow'), ruck(61, 'us')], {})
  assert.equal(later.matchState.playersOnField.us, 15)  // 61 >= 50+10, back to 15
  const red = buildLiveIntelligence([card(50, 'them', 'red'), ruck(70, 'us')], {})
  assert.equal(red.matchState.playersOnField.them, 14)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — win probability
// ─────────────────────────────────────────────────────────────────────────────

test('Win probability — leading late beats trailing late', () => {
  const leadEvents = [tryScore(70, 'us'), conv(71, 'us'), ev(75, 'ruck', 'us')]
  const trailEvents = [tryScore(70, 'them'), conv(71, 'them'), ev(75, 'ruck', 'us')]
  const lead = buildLiveIntelligence(leadEvents, {}).winProbability.value
  const trail = buildLiveIntelligence(trailEvents, {}).winProbability.value
  assert.ok(lead > 50 && trail < 50 && lead > trail)
})

test('Win probability — extra man lifts probability', () => {
  const base = buildLiveIntelligence([ev(40, 'ruck', 'us')], {}).winProbability.value
  const upMan = buildLiveIntelligence([card(38, 'them', 'yellow'), ev(40, 'ruck', 'us')], {}).winProbability.value
  assert.ok(upMan > base)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — momentum
// ─────────────────────────────────────────────────────────────────────────────

test('Momentum — our recent try swings momentum to us with evidence', () => {
  const intel = buildLiveIntelligence([tryScore(55, 'us'), turnover(56, 'us', 'opp_22')], {})
  assert.equal(intel.momentumScore.side, 'us')
  assert.ok(intel.momentumScore.score > 15)
  assert.ok(intel.momentumScore.evidence.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — discipline
// ─────────────────────────────────────────────────────────────────────────────

test('Discipline — repeated penalties in our half escalate to high risk', () => {
  const intel = buildLiveIntelligence([penalty(60, 'us', 'own_22'), penalty(64, 'us', 'own_half'), penalty(68, 'us', 'own_22')], {})
  assert.equal(intel.disciplineRisk.level, 'high')
  assert.ok(intel.disciplineRisk.recommendations.some(r => r.id === 'disc-reset'))
  assert.ok(intel.disciplineRisk.evidence.length >= 2)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — fatigue
// ─────────────────────────────────────────────────────────────────────────────

test('Fatigue — rises late in the game', () => {
  const early = buildLiveIntelligence([ev(10, 'ruck', 'us')], {}).fatigueAlerts.us
  const late = buildLiveIntelligence([ev(75, 'ruck', 'us')], {}).fatigueAlerts.us
  assert.ok(late > early)
})

test('Fatigue — 14 men raises our fatigue and triggers an alert', () => {
  const intel = buildLiveIntelligence([card(40, 'us', 'yellow'), ...Array.from({ length: 8 }, (_, i) => tackle(41 + i, 'us', 'own_half'))], {})
  assert.ok(intel.fatigueAlerts.alerts.some(a => a.id === 'fat-14'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — opportunity / danger
// ─────────────────────────────────────────────────────────────────────────────

test('Opportunity — extra man detected (their card)', () => {
  const intel = buildLiveIntelligence([card(50, 'them', 'yellow'), ev(51, 'ruck', 'us')], {})
  assert.ok(intel.opportunityDetection.recommendations.some(r => r.id === 'opp-extra'))
  assert.ok(intel.recommendedNextAction.recommendation.length > 0)
})

test('Danger — down a man + under pressure detected', () => {
  const intel = buildLiveIntelligence([
    card(50, 'us', 'yellow'),
    terr(52, 'them', 'own_22'), terr(53, 'them', 'own_22'), terr(54, 'them', 'own_22'),
  ], {})
  assert.ok(intel.dangerDetection.recommendations.some(r => r.id === 'dgr-14'))
  assert.ok(intel.dangerDetection.recommendations.some(r => r.id === 'dgr-pressure'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — critical moments
// ─────────────────────────────────────────────────────────────────────────────

test('Critical moments — scores and cards captured in order', () => {
  const intel = buildLiveIntelligence([card(30, 'them', 'yellow'), tryScore(10, 'us'), pen3(50, 'them')], {})
  const minutes = intel.criticalMoments.moments.map(m => m.minute)
  assert.deepEqual(minutes, [10, 30, 50])
  assert.equal(intel.criticalMoments.count, 3)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — five scenarios
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario — first half (opening exchanges)', () => {
  const intel = buildLiveIntelligence([tryScore(8, 'us'), conv(9, 'us'), penalty(15, 'them', 'opp_half'), ruck(18, 'us', 'opp_half')], { grade: 'senior' })
  assert.equal(intel.matchState.half, 1)
  assert.ok(['opening', 'first_end'].includes(intel.matchState.phase))
  assert.ok(intel.winProbability.value > 50)
})

test('Scenario — second half (closing phase, manage the game)', () => {
  const intel = buildLiveIntelligence([tryScore(70, 'us'), conv(71, 'us'), ev(74, 'ruck', 'us')], {})
  assert.equal(intel.matchState.half, 2)
  assert.equal(intel.matchState.phase, 'closing')
  assert.ok(intel.benchRecommendations.recommendations.some(r => r.id === 'bench-closeout'))
})

test('Scenario — comeback (behind, momentum building)', () => {
  const intel = buildLiveIntelligence([
    tryScore(20, 'them'), conv(21, 'them'), tryScore(25, 'them'),       // 0-19
    conv(26, 'them'),
    tryScore(58, 'us'), tryScore(62, 'us'), conv(63, 'us'),             // two late tries
    turnover(64, 'us', 'opp_22'),                                       // momentum surging
  ], {})
  assert.ok(intel.matchState.score.margin < 0)
  assert.equal(intel.momentumScore.side, 'us')
  assert.ok(intel.opportunityDetection.recommendations.some(r => r.id === 'opp-momentum'))
})

test('Scenario — defending a lead (protect the result)', () => {
  const intel = buildLiveIntelligence([
    tryScore(30, 'us'), conv(31, 'us'), pen3(40, 'us'),                  // 10-0
    terr(72, 'them', 'own_22'), terr(74, 'them', 'own_22'),             // under late pressure
  ], {})
  assert.ok(intel.matchState.score.margin > 0)
  assert.equal(intel.matchState.phase, 'closing')
  assert.ok(intel.winProbability.value >= 60)
  assert.ok(intel.dangerDetection.recommendations.some(r => r.id === 'dgr-pressure'))
})

test('Scenario — playing with 14 men', () => {
  const intel = buildLiveIntelligence([card(35, 'us', 'yellow'), tackle(36, 'us', 'own_half'), tackle(38, 'us', 'own_22')], {})
  assert.equal(intel.matchState.playersOnField.us, 14)
  assert.equal(intel.matchState.numericalAdvantage, -1)
  assert.ok(intel.dangerDetection.recommendations.some(r => r.id === 'dgr-14'))
  assert.ok(intel.fatigueAlerts.alerts.some(a => a.id === 'fat-14'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — recommendation contract
// ─────────────────────────────────────────────────────────────────────────────

test('Every recommendation has WHY + evidence + confidence + fallback', () => {
  const intel = buildLiveIntelligence([
    card(50, 'them', 'yellow'), penalty(55, 'us', 'own_22'), penalty(58, 'us', 'own_half'),
    terr(59, 'us', 'opp_22'), tryScore(60, 'us'),
  ], { opponent: { dimensions: { disciplineProfile: { score: 30, evidence: ['o-disc'] }, fitnessTrends: { score: 25, evidence: ['o-fit'] } } } })
  for (const r of allRecs(intel)) {
    assert.ok(r.recommendation && r.recommendation.length > 0)
    assert.ok(r.why && r.why.length > 0, `rec ${r.id} missing why`)
    assert.ok(Array.isArray(r.evidence))
    assert.ok('fallback' in r, `rec ${r.id} missing fallback`)
    assert.ok(r.fallback || r.confidence != null)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Deterministic — same events → identical intelligence', () => {
  const events = [tryScore(20, 'us'), card(40, 'them', 'yellow'), penalty(55, 'us', 'own_22'), turnover(60, 'us', 'opp_22')]
  assert.deepEqual(buildLiveIntelligence(events, {}), buildLiveIntelligence(events, {}))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — graceful degradation + overrides
// ─────────────────────────────────────────────────────────────────────────────

test('No events → graceful fallback intelligence', () => {
  const intel = buildLiveIntelligence([], {})
  assert.equal(intel.ok, true)
  assert.equal(intel.isFallback, true)
  assert.equal(intel.winProbability.value, 50)
  assert.ok(intel.recommendedNextAction.recommendation.length > 0)
})

test('Manual coach override — forces next action + win probability', () => {
  const intel = buildLiveIntelligence([tryScore(10, 'them')], { overrides: { nextAction: 'Go to the corner', winProbability: 80 } })
  assert.equal(intel.recommendedNextAction.recommendation, 'Go to the corner')
  assert.equal(intel.winProbability.value, 80)
  assert.equal(intel.winProbability.overridden, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 13 — AI wiring
// ─────────────────────────────────────────────────────────────────────────────

test('AI.liveMatch.record + AI.getLiveMatchIntelligence (by matchId)', async () => {
  await AI.liveMatch.reset('m-live')
  await AI.liveMatch.record('m-live', [tryScore(10, 'us'), conv(11, 'us')])
  const r = await AI.getLiveMatchIntelligence('m-live', { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.matchState.score.us, 7)
  await AI.liveMatch.reset('m-live')
})

test('AI.getLiveMatchIntelligence — events array directly', async () => {
  const r = await AI.getLiveMatchIntelligence([tryScore(20, 'us')], { tier: 'enterprise' })
  assert.equal(r.available, true)
  assert.equal(r.matchState.score.us, 5)
})

test('AI.getLiveMatchIntelligence — feature flag disabled', async () => {
  const r = await AI.getLiveMatchIntelligence([], { tier: 'professional', flags: { 'ai.liveMatch': false } })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('AI.getLiveMatchIntelligence — subscription gating (starter blocked)', async () => {
  const r = await AI.getLiveMatchIntelligence([], { tier: 'starter' })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'insufficient_tier')
})

for (const tier of ['performance', 'professional', 'club', 'enterprise']) {
  test(`AI.getLiveMatchIntelligence — ${tier} tier allowed`, async () => {
    const r = await AI.getLiveMatchIntelligence([tryScore(5, 'us')], { tier })
    assert.equal(r.available, true)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 14 — structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('live-match modules are Brain-only — no Core / no cross-Brain imports', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../ai-brain/live-match/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.js'))
  assert.ok(files.length >= 15)
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/integration', 'ai-brain/learning', 'ai-brain/coach-dna', 'ai-brain/opponent',
    'ai-brain/training-designer', 'ai-brain/match-strategy', 'coach-products',
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
