/**
 * AI Brain — Training Objective Builder (M25)
 *
 * Derives the session's objectives, theme and key outcomes from the upstream
 * Brain products — every objective carries the evidence that justifies it:
 *   - Opponent opportunities  → what to exploit
 *   - Opponent threats        → what to nullify
 *   - Match Readiness focus    → physical / tactical / technical needs
 *   - Weekly Brief priorities  → the coach's stated week
 *   - Coach DNA                → philosophy weighting (attack/defence/dev/welfare)
 *
 * Pure + deterministic. Multiple sources reinforce the same objective.
 */

import { TAG } from './training-types.js'

/** Canonical objective definitions (id → tags + outcome). */
export const OBJECTIVE_DEFS = Object.freeze({
  'wide-attack':      { label: 'Exploit space out wide',     tags: [TAG.ATTACK_SHAPE, TAG.HANDLING, TAG.DECISION], outcome: 'Create and finish overlaps in the wide channels' },
  'counter-attack':   { label: 'Counter-attack from deep',   tags: [TAG.COUNTER_ATTACK, TAG.HANDLING, TAG.KICKING], outcome: 'Punish loose kicks with organised counter-attack' },
  'kicking-game':     { label: 'Win the territorial battle', tags: [TAG.KICKING, TAG.DECISION], outcome: 'Pin the opponent in their half and force errors' },
  'defensive-system': { label: 'Defensive system & line speed', tags: [TAG.DEFENCE, TAG.DECISION], outcome: 'Hold shape and line speed under pressure' },
  'breakdown-speed':  { label: 'Breakdown speed',            tags: [TAG.BREAKDOWN, TAG.CONTACT_SKILL, TAG.FITNESS], outcome: 'Quicken our ruck ball and slow theirs' },
  'set-piece-scrum':  { label: 'Scrum',                      tags: [TAG.SCRUM], outcome: 'Stabilise and pressure the scrum' },
  'set-piece-lineout':{ label: 'Lineout & maul',             tags: [TAG.LINEOUT], outcome: 'Secure our throw and contest theirs' },
  'restart':          { label: 'Restarts',                   tags: [TAG.RESTART], outcome: 'Win the restart battle' },
  'discipline':       { label: 'Discipline at the breakdown', tags: [TAG.DISCIPLINE, TAG.DEFENCE, TAG.BREAKDOWN], outcome: 'Cut out penalties and stay on the right side' },
  'handling-skills':  { label: 'Core handling',              tags: [TAG.HANDLING], outcome: 'Improve catch-pass accuracy under pressure' },
  'contact-skills':   { label: 'Contact technique',          tags: [TAG.CONTACT_SKILL, TAG.DEFENCE], outcome: 'Sharpen tackle and clearout technique' },
  'conditioning':     { label: 'Game-specific conditioning', tags: [TAG.FITNESS], outcome: 'Build fitness for a strong finish' },
})

/** Opponent weakness (their dimension) → objective we should target. */
const OPP_WEAKNESS_MAP = {
  defensiveTendencies: 'wide-attack',
  kickProfile: 'counter-attack',
  disciplineProfile: 'kicking-game',
  fitnessTrends: 'conditioning',
  lateGameBehaviour: 'conditioning',
  lineoutProfile: 'set-piece-lineout',
  scrumProfile: 'set-piece-scrum',
  restartProfile: 'restart',
  attackTendencies: 'defensive-system',
}
/** Opponent strength (their dimension) → objective to nullify it. */
const OPP_STRENGTH_MAP = {
  attackTendencies: 'defensive-system',
  scrumProfile: 'set-piece-scrum',
  breakdownSpeed: 'breakdown-speed',
  counterattackFrequency: 'kicking-game',
  kickProfile: 'counter-attack',
  lineoutProfile: 'set-piece-lineout',
  restartProfile: 'restart',
}
const READINESS_FOCUS_MAP = { physical: 'conditioning', tactical: 'kicking-game', technical: 'handling-skills' }
const BRIEF_CATEGORY_MAP = {
  attack: 'wide-attack', attacking: 'wide-attack',
  defence: 'defensive-system', defensive: 'defensive-system',
  preparation: 'set-piece-lineout', 'set piece': 'set-piece-lineout', selection: null,
  breakdown: 'breakdown-speed', discipline: 'discipline', kicking: 'kicking-game',
}

function add(map, id, priority, source, evidence = []) {
  if (!id || !OBJECTIVE_DEFS[id]) return
  const cur = map.get(id) ?? { id, ...OBJECTIVE_DEFS[id], priority: 0, sources: [], evidence: [] }
  cur.priority += priority
  if (!cur.sources.includes(source)) cur.sources.push(source)
  for (const e of evidence) if (e && !cur.evidence.includes(e)) cur.evidence.push(e)
  map.set(id, cur)
}

/** DNA priority multipliers per objective tag (attack/defence/development/welfare). */
function dnaWeights(coachDNA) {
  const c = coachDNA?.characteristics ?? {}
  const score = (k) => (c[k] && typeof c[k].score === 'number' ? c[k].score : 50)
  return {
    attack: score('attackVsDefenceBias') >= 60 ? 1.3 : score('attackVsDefenceBias') <= 40 ? 0.85 : 1,
    defence: score('attackVsDefenceBias') <= 40 ? 1.3 : 1,
    development: score('developmentEmphasis') >= 60 ? 1.3 : 1,
    welfare: score('welfareEmphasis') >= 60 ? 1.2 : 1,
  }
}

export function buildObjectives(context = {}, constraints = {}) {
  const map = new Map()

  // 1. Opponent intelligence (highest weight — match-specific, evidence-backed)
  const opp = context.opponent ?? null
  for (const o of (opp?.opportunities ?? [])) {
    add(map, OPP_WEAKNESS_MAP[o.basis], 3, 'opponent-opportunity', o.evidence ?? [])
  }
  for (const t of (opp?.threats ?? [])) {
    add(map, OPP_STRENGTH_MAP[t.basis], 2.5, 'opponent-threat', t.evidence ?? [])
  }

  // 2. Match Readiness training focus
  const mr = context.matchReadiness ?? null
  for (const f of (mr?.trainingFocus ?? [])) {
    add(map, READINESS_FOCUS_MAP[f.emphasis], 2, 'match-readiness', mr?.evidenceIds ?? [])
  }

  // 3. Weekly Brief priorities
  const wb = context.weeklyBrief ?? null
  for (const p of (wb?.topPriorities ?? [])) {
    const id = BRIEF_CATEGORY_MAP[String(p.category ?? '').toLowerCase()]
    add(map, id, 1.5, 'weekly-brief', p.evidenceId ? [p.evidenceId] : [])
  }

  // 4. Always ensure a handling/skills baseline objective exists
  add(map, 'handling-skills', 0.5, 'baseline', [])

  // 5. Coach DNA weighting
  const w = dnaWeights(context.coachDNA)
  const ATTACK = new Set(['wide-attack', 'counter-attack'])
  const DEFENCE = new Set(['defensive-system'])
  const DEV = new Set(['handling-skills', 'contact-skills'])
  for (const obj of map.values()) {
    if (ATTACK.has(obj.id)) obj.priority *= w.attack
    if (DEFENCE.has(obj.id)) obj.priority *= w.defence
    if (DEV.has(obj.id)) obj.priority *= w.development
  }

  const objectives = [...map.values()]
    .map(o => ({ ...o, priority: Math.round(o.priority * 100) / 100 }))
    .sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : 1))

  const theme = context.overrides?.theme
    ?? (objectives[0] ? objectives[0].label : 'Skill & conditioning')
  const keyOutcomes = objectives.slice(0, 3).map(o => o.outcome)

  return { objectives, theme, keyOutcomes, dnaWeights: w }
}
