/**
 * AI Brain — M24 Opponent Intelligence Engine Tests
 *
 * Coverage:
 *  1. Types / shape (14 dimensions, version, standard entry fields)
 *  2. Empty stream → null-score, zero-confidence profile
 *  3. Discovery of each dimension (attack, defence, scrum, lineout, kick,
 *     restart, discipline, substitution, fitness, late-game, breakdown, counter)
 *  4. Strengths / weaknesses derivation
 *  5. Threats / opportunities + evidence chains (every recommendation cites evidence)
 *  6. Descriptive dimensions excluded from strengths/weaknesses
 *  7. Confidence grows with evidence
 *  8. Determinism
 *  9. Compare opponents
 * 10. Evolution (earlier vs recent windows)
 * 11. AI namespace wiring: record + 6 products, feature flag, tiers, fallback
 * 12. Structural contract (Brain-only, no Core)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildOpponentProfile, buildOpponentSummary, compareOpponentProfiles, buildOpponentEvolution,
  PROFILE_VERSION, DIMENSION as D, DIMENSION_KEYS,
} from '../ai-brain/opponent/index.js'
import { AI } from '../ai-brain/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function dt(base, n) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function stream(specs, base = '2025-09-01', prefix = 'o') {
  return specs.map(([type, data], i) => ({
    observationId: `${prefix}${i}`, eventType: type, eventData: { ...data },
    recordedAt: dt(base, i), matchId: data.matchId ?? `m${Math.floor(i / 5)}`,
  }))
}
const rep = (n, spec) => Array.from({ length: n }, () => spec)
const dim = (p, k) => p.dimensions[k]

// Event-type shortcuts
const ATT = 'attack_sequence', DEF = 'defensive_set', SCR = 'scrum_event', LIN = 'lineout_event'
const KICK = 'kick_event', RES = 'restart_event', PEN = 'penalty_event', SUB = 'substitution_event'
const SEG = 'match_segment'

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Types
// ─────────────────────────────────────────────────────────────────────────────

test('Fourteen dimensions, version, standard entry fields', () => {
  assert.equal(DIMENSION_KEYS.length, 14)
  const p = buildOpponentProfile('opp-1', stream(rep(6, [ATT, { channel: 'wide', result: 'try', phases: 5 }])))
  assert.equal(p.profileVersion, PROFILE_VERSION)
  const e = dim(p, D.ATTACK_TENDENCIES)
  for (const f of ['score', 'confidence', 'evidence', 'observationCount', 'lastUpdated', 'trend']) {
    assert.ok(f in e, `missing ${f}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Empty
// ─────────────────────────────────────────────────────────────────────────────

test('Empty stream — null scores, zero maturity, empty recommendations', () => {
  const p = buildOpponentProfile('opp-1', [])
  assert.equal(p.maturity, 0)
  assert.equal(p.observationCount, 0)
  for (const k of DIMENSION_KEYS) {
    assert.equal(dim(p, k).score, null)
    assert.equal(dim(p, k).confidence, 0)
  }
  assert.deepEqual(p.strengths, [])
  assert.deepEqual(p.weaknesses, [])
  assert.deepEqual(p.threats, [])
  assert.deepEqual(p.opportunities, [])
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Dimension discovery
// ─────────────────────────────────────────────────────────────────────────────

test('Attack tendencies — wide, clinical attack scores high', () => {
  const p = buildOpponentProfile('opp-1', stream(rep(10, [ATT, { channel: 'wide', result: 'try', phases: 6, breakdownSpeed: 'fast', counterAttack: true }])))
  assert.ok(dim(p, D.ATTACK_TENDENCIES).score >= 80)
  assert.ok(dim(p, D.ATTACK_TENDENCIES).confidence > 0)
  assert.ok(dim(p, D.BREAKDOWN_SPEED).score >= 80)
  assert.ok(dim(p, D.COUNTERATTACK_FREQUENCY).score >= 80)
})

test('Defensive tendencies — leaky defence scores low', () => {
  const p = buildOpponentProfile('opp-1', stream(rep(8, [DEF, { missedTackles: 5, turnoverWon: false, dominantTackle: false, lineSpeed: 'slow' }])))
  assert.ok(dim(p, D.DEFENSIVE_TENDENCIES).score <= 30)
})

test('Scrum dominant vs vulnerable', () => {
  const strong = buildOpponentProfile('o', stream(rep(8, [SCR, { outcome: 'won', onOwnFeed: true }])))
  assert.ok(dim(strong, D.SCRUM_PROFILE).score >= 80)
  const weak = buildOpponentProfile('o', stream(rep(8, [SCR, { outcome: 'penalty_conceded', onOwnFeed: true }])))
  assert.ok(dim(weak, D.SCRUM_PROFILE).score <= 20)
})

test('Lineout vulnerable on own throw', () => {
  const p = buildOpponentProfile('o', stream(rep(8, [LIN, { outcome: 'lost', onOwnThrow: true }])))
  assert.ok(dim(p, D.LINEOUT_PROFILE).score <= 20)
})

test('Kick profile — box-kick led, reclaims well', () => {
  const p = buildOpponentProfile('o', stream(rep(8, [KICK, { type: 'box', reclaimed: true }])))
  assert.ok(dim(p, D.KICK_PROFILE).metrics.boxRate >= 0.9)
  assert.ok(dim(p, D.KICK_PROFILE).score >= 80)
})

test('Restart retention', () => {
  const p = buildOpponentProfile('o', stream(rep(8, [RES, { type: 'kickoff', retained: true, contested: true }])))
  assert.ok(dim(p, D.RESTART_PROFILE).score >= 80)
})

test('Discipline — penalty-prone (cards + own half) is low; clean is high', () => {
  const loose = buildOpponentProfile('o', stream([...rep(8, [PEN, { reason: 'breakdown', area: 'own_half', half: 2 }]), ...rep(2, [PEN, { reason: 'high_tackle', area: 'own22', half: 2, card: 'yellow' }])]))
  assert.ok(dim(loose, D.DISCIPLINE_PROFILE).score <= 40)
  assert.equal(dim(loose, D.DISCIPLINE_PROFILE).metrics.topReason, 'breakdown')
  const clean = buildOpponentProfile('o', stream(rep(8, [PEN, { reason: 'offside', area: 'opp_half', half: 1 }])))
  assert.ok(dim(clean, D.DISCIPLINE_PROFILE).score >= 65)
})

test('Substitution behaviour — impactful bench', () => {
  const p = buildOpponentProfile('o', stream(rep(6, [SUB, { minute: 55, unit: 'back_row', impact: 'positive' }])))
  assert.ok(dim(p, D.SUBSTITUTION_BEHAVIOUR).score >= 80)
})

test('Fitness / late-game — fade late vs strong finishers', () => {
  const fade = buildOpponentProfile('o', stream(rep(6, [SEG, { segment: 'last20', pointsFor: 0, pointsAgainst: 10 }])))
  assert.ok(dim(fade, D.FITNESS_TRENDS).score <= 20)
  assert.ok(dim(fade, D.LATE_GAME_BEHAVIOUR).score <= 20)
  const strong = buildOpponentProfile('o', stream(rep(6, [SEG, { segment: 'last20', pointsFor: 12, pointsAgainst: 0 }])))
  assert.ok(dim(strong, D.FITNESS_TRENDS).score >= 80)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4/5 — Strengths, weaknesses, threats, opportunities + evidence chains
// ─────────────────────────────────────────────────────────────────────────────

function richOpponent() {
  return [
    ...stream(rep(10, [ATT, { channel: 'wide', result: 'try', phases: 6, breakdownSpeed: 'fast', counterAttack: true }]), '2025-09-01', 'a'),
    ...stream(rep(8, [DEF, { missedTackles: 5, turnoverWon: false, dominantTackle: false }]), '2025-09-20', 'd'),
    ...stream([...rep(8, [PEN, { reason: 'breakdown', area: 'own_half', half: 2 }]), ...rep(2, [PEN, { reason: 'high_tackle', area: 'own22', half: 2, card: 'yellow' }])], '2025-10-01', 'p'),
    ...stream(rep(8, [SCR, { outcome: 'won' }]), '2025-10-15', 's'),
  ]
}

test('Strengths and weaknesses derived from the same profile', () => {
  const p = buildOpponentProfile('opp-rich', richOpponent())
  assert.ok(p.strengths.some(s => s.key === D.ATTACK_TENDENCIES))
  assert.ok(p.strengths.some(s => s.key === D.SCRUM_PROFILE))
  assert.ok(p.weaknesses.some(w => w.key === D.DEFENSIVE_TENDENCIES))
  assert.ok(p.weaknesses.some(w => w.key === D.DISCIPLINE_PROFILE))
})

test('Every threat and opportunity references a non-empty evidence chain', () => {
  const p = buildOpponentProfile('opp-rich', richOpponent())
  assert.ok(p.threats.length > 0 && p.opportunities.length > 0)
  for (const t of p.threats) {
    assert.ok(Array.isArray(t.evidence) && t.evidence.length > 0, `threat ${t.basis} missing evidence`)
    assert.ok(t.recommendation && t.recommendation.length > 0)
    // evidence chain matches the source dimension's evidence
    assert.deepEqual(t.evidence, dim(p, t.basis).evidence)
  }
  for (const o of p.opportunities) {
    assert.ok(Array.isArray(o.evidence) && o.evidence.length > 0, `opportunity ${o.basis} missing evidence`)
    assert.ok(o.recommendation && o.recommendation.length > 0)
    assert.deepEqual(o.evidence, dim(p, o.basis).evidence)
  }
})

test('Discipline opportunity recommends playing in their half', () => {
  const p = buildOpponentProfile('opp-rich', richOpponent())
  const opp = p.opportunities.find(o => o.basis === D.DISCIPLINE_PROFILE)
  assert.ok(opp)
  assert.ok(opp.recommendation.toLowerCase().includes('half'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Descriptive dimensions excluded
// ─────────────────────────────────────────────────────────────────────────────

test('Descriptive dimensions (phase count, territory) never appear as strengths/weaknesses', () => {
  const p = buildOpponentProfile('o', stream(rep(10, [ATT, { channel: 'wide', result: 'try', phases: 9 }])))
  assert.ok(!p.strengths.some(s => s.key === D.PHASE_COUNT || s.key === D.TERRITORY_PREFERENCE))
  assert.ok(!p.weaknesses.some(w => w.key === D.PHASE_COUNT || w.key === D.TERRITORY_PREFERENCE))
  assert.equal(dim(p, D.PHASE_COUNT).descriptive, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7/8 — Confidence growth, determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Confidence grows with more evidence', () => {
  const few = buildOpponentProfile('o', stream(rep(3, [SCR, { outcome: 'won' }])))
  const many = buildOpponentProfile('o', stream(rep(20, [SCR, { outcome: 'won' }])))
  assert.ok(dim(many, D.SCRUM_PROFILE).confidence > dim(few, D.SCRUM_PROFILE).confidence)
})

test('Deterministic — same observations → same profile', () => {
  const obs = richOpponent()
  assert.deepEqual(buildOpponentProfile('o', obs), buildOpponentProfile('o', obs))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — Compare
// ─────────────────────────────────────────────────────────────────────────────

test('compareOpponents — dimension edges + summary', () => {
  const a = { opponentId: 'A', observations: stream(rep(8, [SCR, { outcome: 'won' }])) }
  const b = { opponentId: 'B', observations: stream(rep(8, [SCR, { outcome: 'penalty_conceded' }])) }
  const cmp = compareOpponentProfiles(a, b)
  const scrum = cmp.dimensions.find(d => d.key === D.SCRUM_PROFILE)
  assert.equal(scrum.edge, 'a')
  assert.ok(!cmp.dimensions.some(d => d.key === D.PHASE_COUNT))   // descriptive excluded
  assert.ok(cmp.summary.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — Evolution
// ─────────────────────────────────────────────────────────────────────────────

test('Evolution — earlier weak scrum → recent strong scrum rises', () => {
  const obs = [
    ...stream(rep(8, [SCR, { outcome: 'penalty_conceded' }]), '2025-09-01', 'e'),
    ...stream(rep(8, [SCR, { outcome: 'won' }]), '2025-11-01', 'r'),
  ]
  const evo = buildOpponentEvolution('o', obs)
  assert.equal(evo.windows.length, 2)
  const scrumChange = evo.changes.find(c => c.key === D.SCRUM_PROFILE)
  assert.equal(scrumChange.direction, 'rising')
  assert.ok(scrumChange.delta > 0)
  assert.ok(evo.trend.mostChanged.some(c => c.key === D.SCRUM_PROFILE))
})

test('Summary product — top strengths/weaknesses + counts', () => {
  const s = buildOpponentSummary('opp-rich', richOpponent())
  assert.equal(s.profileVersion, PROFILE_VERSION)
  assert.ok(s.topStrengths.length > 0)
  assert.ok(s.topWeaknesses.length > 0)
  assert.ok(s.threatCount > 0 && s.opportunityCount > 0)
  assert.ok(s.headline.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — AI namespace wiring
// ─────────────────────────────────────────────────────────────────────────────

test('AI.opponent.record + AI.getOpponentProfile (wired, evidence-backed)', async () => {
  await AI.opponent.reset('ai-opp')
  await AI.opponent.record('ai-opp', richOpponent())
  const r = await AI.getOpponentProfile('ai-opp', { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.ok(r.threats.length > 0 && r.threats.every(t => t.evidence.length > 0))
  await AI.opponent.reset('ai-opp')
})

test('AI.getOpponentProfile — feature flag disabled', async () => {
  const r = await AI.getOpponentProfile('ai-opp', { tier: 'professional', flags: { 'ai.opponentIntelligence': false } })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('AI.getOpponentProfile — subscription gating (starter blocked)', async () => {
  const r = await AI.getOpponentProfile('ai-opp', { tier: 'starter' })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'insufficient_tier')
})

for (const tier of ['performance', 'professional', 'club', 'enterprise']) {
  test(`AI.getOpponentProfile — ${tier} tier allowed`, async () => {
    await AI.opponent.reset('ai-opp2')
    const r = await AI.getOpponentProfile('ai-opp2', { tier })
    assert.equal(r.available, true)
  })
}

test('AI.getOpponentProfile — graceful fallback for unknown opponent', async () => {
  await AI.opponent.reset('ghost')
  const r = await AI.getOpponentProfile('ghost', { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.equal(r.observationCount, 0)
  assert.equal(r.maturity, 0)
})

test('AI.getOpponentSummary / Threats / Opportunities / Evolution / compareOpponents — wired', async () => {
  await AI.opponent.reset('ai-a'); await AI.opponent.reset('ai-b')
  await AI.opponent.record('ai-a', richOpponent())
  await AI.opponent.record('ai-b', stream(rep(8, [SCR, { outcome: 'penalty_conceded' }])))
  const opts = { tier: 'enterprise' }
  assert.equal((await AI.getOpponentSummary('ai-a', opts)).available, true)
  assert.ok((await AI.getOpponentThreats('ai-a', opts)).threats.length > 0)
  assert.ok((await AI.getOpponentOpportunities('ai-a', opts)).opportunities.length > 0)
  const evo = await AI.getOpponentEvolution('ai-a', opts)
  assert.equal(evo.available, true)
  const cmp = await AI.compareOpponents(['ai-a', 'ai-b'], opts)
  assert.equal(cmp.available, true)
  assert.ok(cmp.dimensions.length > 0)
  await AI.opponent.reset('ai-a'); await AI.opponent.reset('ai-b')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — Structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('opponent modules are Brain-only — no Core / no cross-Brain imports', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../ai-brain/opponent/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.js'))
  assert.ok(files.length >= 10)
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/integration', 'ai-brain/learning', 'ai-brain/coach-dna', 'coach-products',
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
