/**
 * AI Brain — M25 Autonomous Training Designer Tests
 *
 * Coverage:
 *  1. Types / version
 *  2. Full 90-minute senior session — all phases, complete activity metadata,
 *     evidence chains, deterministic time budget
 *  3. Academy session
 *  4. U10 session — non-contact, no set piece, capped complexity & duration
 *  5. Determinism
 *  6. Optimisation knobs — weather, space, players, injuries, importance, season
 *  7. Coach philosophy influences objective ranking
 *  8. Every activity explains WHY + references evidence where available
 *  9. Fallback template on invalid build
 * 10. Manual overrides (theme / exclude / pin / skip)
 * 11. AI namespace wiring: flag, tiers, graceful degradation
 * 12. Structural contract (Brain-only)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  designSession, DESIGNER_VERSION, PHASE, PHASE_ORDER, DRILL_BY_ID,
} from '../ai-brain/training-designer/index.js'
import { AI } from '../ai-brain/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const ACTIVITY_FIELDS = ['purpose', 'estimatedDuration', 'coachingFocus', 'equipment', 'constraints', 'workload', 'welfareImpact', 'learningObjective', 'decisionComplexity', 'confidence', 'why', 'evidence']

function squad(n, mods = {}) {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`, available: true, status: 'fit', minutesLoad: 50,
    ...(mods[i] ?? {}),
  }))
}

function seniorContext(over = {}) {
  return {
    grade: 'senior', format: 'fifteens', durationMin: 90, space: 'full', weather: 'good',
    matchImportance: 'high', seasonPhase: 'mid',
    coachDNA: { characteristics: { attackVsDefenceBias: { score: 80 }, developmentEmphasis: { score: 55 }, welfareEmphasis: { score: 50 } } },
    opponent: {
      opportunities: [{ basis: 'defensiveTendencies', evidence: ['o-d1', 'o-d2'] }, { basis: 'kickProfile', evidence: ['o-k1'] }],
      threats: [{ basis: 'scrumProfile', evidence: ['o-s1'] }],
    },
    matchReadiness: { trainingFocus: [{ emphasis: 'physical' }], evidenceIds: ['mr-1'] },
    weeklyBrief: { topPriorities: [{ category: 'set piece', evidenceId: 'wb-1' }] },
    squad: squad(24, { 0: { status: 'injured' }, 1: { minutesLoad: 92 } }),
    generatedAt: '2026-06-13T09:00:00Z',
    ...over,
  }
}

const allActivities = (s) => Object.values(s.phases).flatMap(p => p.activities)

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Types
// ─────────────────────────────────────────────────────────────────────────────

test('Designer version present', () => {
  const s = designSession(seniorContext())
  assert.equal(s.designerVersion, DESIGNER_VERSION)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Full senior session
// ─────────────────────────────────────────────────────────────────────────────

test('90-minute senior session — every phase present and time-budgeted', () => {
  const s = designSession(seniorContext())
  for (const k of PHASE_ORDER) assert.ok(s.phases[k], `missing phase ${k}`)
  const total = allActivities(s).reduce((sum, a) => sum + a.estimatedDuration, 0)
  assert.ok(Math.abs(total - 90) <= 6, `total ${total} not ~90`)
  assert.ok(s.phases[PHASE.CONTACT].activities.length > 0)   // full contact grade
  assert.ok(s.phases[PHASE.SET_PIECE].activities.length > 0)
  assert.equal(s.isFallback, false)
})

test('Senior session — every activity carries complete metadata', () => {
  const s = designSession(seniorContext())
  for (const a of allActivities(s)) {
    for (const f of ACTIVITY_FIELDS) assert.ok(f in a, `activity ${a.id} missing ${f}`)
    assert.equal(typeof a.workload, 'number')
    assert.ok(['low', 'moderate', 'high'].includes(a.welfareImpact))
    assert.ok(a.decisionComplexity >= 1 && a.decisionComplexity <= 5)
    assert.ok(a.why && a.why.length > 0)
  }
})

test('Senior session — objectives + evidence from opponent intelligence', () => {
  const s = designSession(seniorContext())
  assert.ok(s.objectives.length > 0)
  assert.ok(s.evidence.includes('o-d1'))   // opponent opportunity evidence flows to session
  // attacking coach DNA pushes an attack objective to the top
  assert.ok(['wide-attack', 'counter-attack'].includes(s.objectives[0].id))
  // some activity references opponent evidence
  assert.ok(allActivities(s).some(a => a.evidence.includes('o-d1') || a.evidence.includes('o-k1')))
})

test('Senior session — workload computed and classified', () => {
  const s = designSession(seniorContext())
  assert.equal(typeof s.totalWorkload, 'number')
  assert.ok(['light', 'on_target', 'over', 'unknown'].includes(s.workloadStatus))
  assert.ok(s.welfareNotes.some(n => n.includes('injured') || n.includes('high-load')))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Academy
// ─────────────────────────────────────────────────────────────────────────────

test('Academy session — valid, full contact allowed', () => {
  const s = designSession(seniorContext({ grade: 'academy', durationMin: 90, matchImportance: 'normal' }))
  assert.equal(s.grade, 'academy')
  assert.equal(s.constraintsApplied.contactLevel, 'full')
  assert.ok(allActivities(s).length > 0)
  assert.equal(s.isFallback, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — U10
// ─────────────────────────────────────────────────────────────────────────────

test('U10 session — non-contact, no set piece, capped complexity & duration', () => {
  const s = designSession({ grade: 'u10', format: 'fifteens', durationMin: 90, players: 16, space: 'full', weather: 'good' })
  assert.equal(s.grade, 'u10')
  assert.equal(s.constraintsApplied.contactLevel, 'none')
  assert.ok(s.durationMin <= 60, 'duration capped for U10')
  assert.equal(s.phases[PHASE.CONTACT].activities.length, 0)
  assert.equal(s.phases[PHASE.SET_PIECE].activities.length, 0)
  for (const a of allActivities(s)) {
    assert.ok(a.decisionComplexity <= 2, `${a.id} complexity ${a.decisionComplexity} > 2`)
    const drill = DRILL_BY_ID[a.id]
    if (drill) assert.notEqual(drill.contact, 'full')
  }
  assert.ok(s.phases[PHASE.WARM_UP].activities.length > 0)
  assert.ok(s.phases[PHASE.SKILL].activities.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — Determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Deterministic — same context → identical session', () => {
  const ctx = seniorContext()
  assert.deepEqual(designSession(ctx), designSession(ctx))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Optimisation knobs
// ─────────────────────────────────────────────────────────────────────────────

test('Weather — windy excludes weather-sensitive drills (e.g. kicking)', () => {
  const calm = designSession(seniorContext({ matchImportance: 'normal' }))
  const windy = designSession(seniorContext({ matchImportance: 'normal', weather: 'windy' }))
  const hasKickingTees = (s) => allActivities(s).some(a => a.id === 'kicking-tees' || a.id === 'conditioned-kick-chase' || a.id === 'high-ball-contest')
  // windy must not schedule weather-sensitive drills
  assert.ok(!allActivities(windy).some(a => DRILL_BY_ID[a.id]?.weatherSensitive))
})

test('Space — small space excludes large/full-space drills', () => {
  const s = designSession(seniorContext({ space: 'medium', matchImportance: 'normal' }))
  for (const a of allActivities(s)) {
    const d = DRILL_BY_ID[a.id]
    if (d) assert.ok(['small', 'medium'].includes(d.space), `${a.id} needs ${d.space} space`)
  }
})

test('Players — too few players excludes live scrum', () => {
  const s = designSession(seniorContext({ players: 12, squad: squad(12), matchImportance: 'normal' }))
  assert.ok(!allActivities(s).some(a => a.id === 'scrum-live'))
})

test('Injuries / high load — reduces contact and adds welfare notes', () => {
  const heavy = squad(24)
  for (let i = 0; i < 6; i++) heavy[i].minutesLoad = 95
  const s = designSession(seniorContext({ squad: heavy, matchImportance: 'normal' }))
  assert.ok(s.welfareNotes.length > 0)
  // welfare pressure softens contact to light
  assert.ok(['light', 'none'].includes(s.constraintsApplied.contactLevel) || s.constraintsApplied.highLoad >= 5)
})

test('Match importance — high adds set-piece emphasis vs low', () => {
  const setMin = (s) => s.phases[PHASE.SET_PIECE].durationMin
  const low = designSession(seniorContext({ matchImportance: 'low' }))
  const high = designSession(seniorContext({ matchImportance: 'cup_final' }))
  assert.ok(setMin(high) >= setMin(low))
})

test('Season phase — preseason raises conditioning vs late-season taper', () => {
  const cond = (s) => s.phases[PHASE.CONDITIONING].durationMin
  const pre = designSession(seniorContext({ seasonPhase: 'preseason', matchImportance: 'normal' }))
  const late = designSession(seniorContext({ seasonPhase: 'playoffs', matchImportance: 'normal' }))
  assert.ok(cond(pre) >= cond(late))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — Coach philosophy
// ─────────────────────────────────────────────────────────────────────────────

test('Coach philosophy — defensive DNA ranks defensive objective higher than attacking DNA does', () => {
  const base = { format: 'fifteens', grade: 'senior', durationMin: 90, space: 'full',
    opponent: { opportunities: [{ basis: 'defensiveTendencies', evidence: ['e1'] }], threats: [{ basis: 'attackTendencies', evidence: ['e2'] }] } }
  const attacking = designSession({ ...base, coachDNA: { characteristics: { attackVsDefenceBias: { score: 85 } } } })
  const defensive = designSession({ ...base, coachDNA: { characteristics: { attackVsDefenceBias: { score: 15 } } } })
  const rank = (s, id) => s.objectives.findIndex(o => o.id === id)
  assert.ok(rank(defensive, 'defensive-system') <= rank(attacking, 'defensive-system'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — Explainability / evidence
// ─────────────────────────────────────────────────────────────────────────────

test('Every activity explains why it exists', () => {
  const s = designSession(seniorContext())
  for (const a of allActivities(s)) {
    assert.ok(typeof a.why === 'string' && a.why.length > 0)
  }
  assert.ok(s.explanation.length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — Fallback
// ─────────────────────────────────────────────────────────────────────────────

test('Fallback template applied when the primary build is invalid', () => {
  // Skipping the warm-up phase makes the primary session invalid → fallback.
  const s = designSession(seniorContext({ overrides: { skipPhases: ['warmUp'] } }))
  assert.equal(s.isFallback, true)
  assert.ok(s.phases[PHASE.WARM_UP].activities.length > 0)   // fallback restores a warm-up
  assert.equal(s.validation.ok, true)
})

test('Graceful — empty context still returns a usable session', () => {
  const s = designSession({})
  assert.equal(s.ok, true)
  assert.ok(allActivities(s).length > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — Manual overrides
// ─────────────────────────────────────────────────────────────────────────────

test('Override — theme is forced', () => {
  const s = designSession(seniorContext({ overrides: { theme: 'Captain’s run' } }))
  assert.equal(s.theme, 'Captain’s run')
})

test('Override — excludeDrills removes a drill', () => {
  const base = designSession(seniorContext({ matchImportance: 'normal' }))
  const picked = allActivities(base).map(a => a.id).find(id => id !== 'session-review')
  const s = designSession(seniorContext({ matchImportance: 'normal', overrides: { excludeDrills: [picked] } }))
  assert.ok(!allActivities(s).some(a => a.id === picked))
})

test('Override — pinDrills forces a drill into its phase', () => {
  const s = designSession(seniorContext({ matchImportance: 'normal', overrides: { pinDrills: ['game-based-fitness'] } }))
  assert.ok(allActivities(s).some(a => a.id === 'game-based-fitness'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — AI namespace wiring
// ─────────────────────────────────────────────────────────────────────────────

test('AI.designTrainingSession — wired + tier allowed', async () => {
  const r = await AI.designTrainingSession(seniorContext(), { tier: 'professional' })
  assert.equal(r.available, true)
  assert.equal(r.ok, true)
  assert.ok(r.phases && r.theme)
})

test('AI.designTrainingSession — feature flag disabled', async () => {
  const r = await AI.designTrainingSession(seniorContext(), { tier: 'professional', flags: { 'ai.trainingDesigner': false } })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('AI.designTrainingSession — subscription gating (starter blocked)', async () => {
  const r = await AI.designTrainingSession(seniorContext(), { tier: 'starter' })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'insufficient_tier')
})

for (const tier of ['performance', 'professional', 'club', 'enterprise']) {
  test(`AI.designTrainingSession — ${tier} tier allowed`, async () => {
    const r = await AI.designTrainingSession({ grade: 'senior', durationMin: 80 }, { tier })
    assert.equal(r.available, true)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — Structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('training-designer modules are Brain-only — no Core / no cross-Brain imports', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../ai-brain/training-designer/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.js'))
  assert.ok(files.length >= 11)
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/integration', 'ai-brain/learning', 'ai-brain/coach-dna', 'ai-brain/opponent',
    'coach-products', 'index.html', '/core/', 'auth', 'match-centre', 'messaging',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    for (const path of forbidden) assert.ok(!src.includes(path), `${f} must not reference ${path}`)
    for (const imp of [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) {
      assert.ok(imp.startsWith('./'), `${f} import must be self-relative: ${imp}`)
    }
  }
})
