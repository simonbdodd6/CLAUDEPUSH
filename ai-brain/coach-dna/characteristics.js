/**
 * AI Brain — Coach DNA Characteristic Derivation (M23)
 *
 * Pure, deterministic functions that turn an observation stream into the ten
 * discovered characteristics. No assumptions: a characteristic starts neutral
 * (score 50, confidence 0) and only moves as evidence accrues.
 *
 * Learning algorithm (per characteristic):
 *   1. Each observation emits zero or more weighted signals (delta ∈ [-1, +1]).
 *   2. score      = 50 + clamp(meanDelta, -1, 1) × 50          (direction)
 *   3. saturation = n / (n + SATURATION_K)                     (more evidence → higher)
 *   4. recency    = 1 / (1 + gapAfterLast / RECENCY_SCALE)     (stale → decays)
 *   5. agreement  = |Σδ| / Σ|δ|                                (conflicting → lower)
 *   6. confidence = round2(saturation × recency × (0.5 + 0.5 × agreement))
 *
 * Every observation therefore *increases* confidence (n grows) unless it
 * conflicts with the established direction (agreement falls) or is followed by
 * a long unrelated stretch (recency decays) — confidence can rise or fall.
 *
 * Explicit coach_preference_set events override the inferred value entirely
 * (manual = true, confidence = 1.0); the inferred score is retained as
 * `inferredScore` for transparency. Explicit always wins — DNA is advisory.
 */

import {
  CHARACTERISTIC as C, CHARACTERISTIC_KEYS, CHARACTERISTIC_META,
  MANUAL_PREFERENCE_MAP, LABEL_SCORES, EVENT,
  SATURATION_K, RECENCY_SCALE, MAX_EVIDENCE, BAND_HIGH, BAND_LOW,
} from './coach-dna-types.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const lc = (s) => String(s ?? '').toLowerCase()
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const round2 = (n) => Math.round(n * 100) / 100
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

function bandOf(score) {
  if (score >= BAND_HIGH) return 'high'
  if (score <= BAND_LOW) return 'low'
  return 'balanced'
}

function descriptorOf(key, score, band) {
  const meta = CHARACTERISTIC_META[key]
  if (band === 'high') return meta.high
  if (band === 'low') return meta.low
  return `balanced (${meta.low} ↔ ${meta.high})`
}

// ── signal mapping (observation → weighted characteristic deltas) ─────────────

/**
 * Emit the signals a single observation carries.
 * @returns {{characteristic: string, delta: number}[]}
 */
export function signalsFor(obs) {
  const out = []
  const add = (c, d) => out.push({ characteristic: c, delta: d })
  const ev = obs?.eventData ?? {}
  const t = obs?.eventType
  const cat = lc(ev.category)
  const urg = lc(ev.urgency)
  const focus = lc(ev.focus)
  const approach = lc(ev.approach)

  if (t === EVENT.RECOMMENDATION_ACCEPTED || t === EVENT.RECOMMENDATION_REJECTED) {
    const sign = t === EVENT.RECOMMENDATION_ACCEPTED ? 1 : -1
    if (/welfare|medical|wellbeing|welbeing/.test(cat)) add(C.WELFARE_EMPHASIS, sign)
    if (/develop|training|coaching|skill/.test(cat))    add(C.DEVELOPMENT_EMPHASIS, sign)
    if (/youth|academy|junior/.test(cat)) { add(C.YOUTH_PROMOTION, sign); add(C.DEVELOPMENT_EMPHASIS, 0.5 * sign) }
    if (/attack|attacking|offen/.test(cat)) add(C.ATTACK_DEFENCE_BIAS, sign)
    if (/defen/.test(cat))                  add(C.ATTACK_DEFENCE_BIAS, -sign)
    if (/tactic|structure|shape|set.?piece/.test(cat)) add(C.TACTICAL_TENDENCIES, sign)
    if (/selection|pick/.test(cat))         add(C.SELECTION_PHILOSOPHY, sign)
    if (/rotation|rest/.test(cat))          add(C.ROTATION_PHILOSOPHY, sign)
    if (urg === 'high')               add(C.RISK_APPETITE, sign)
    else if (urg === 'low' && sign > 0) add(C.RISK_APPETITE, -0.3)
  } else if (t === EVENT.PLAYER_SELECTED) {
    if (ev.isYouth === true || (isNum(ev.age) && ev.age <= 20) || ev.newCap === true) {
      add(C.YOUTH_PROMOTION, 1); add(C.EXPERIMENTATION_LEVEL, 0.5)
    }
    if (ev.retained === true) {
      add(C.CONTINUITY_PREFERENCE, 1); add(C.ROTATION_PHILOSOPHY, -0.5); add(C.SELECTION_PHILOSOPHY, -0.3)
    }
    if (ev.retained === false || ev.experimental === true) {
      add(C.ROTATION_PHILOSOPHY, 0.7); add(C.EXPERIMENTATION_LEVEL, 0.7); add(C.CONTINUITY_PREFERENCE, -0.5)
    }
  } else if (t === EVENT.PLAYER_DESELECTED) {
    add(C.SELECTION_PHILOSOPHY, 0.5); add(C.CONTINUITY_PREFERENCE, -0.5)
  } else if (t === EVENT.TRAINING_COMPLETED) {
    if (/tactic|structure|shape/.test(focus)) add(C.TACTICAL_TENDENCIES, 1)
    if (/attack|attacking/.test(focus))       add(C.ATTACK_DEFENCE_BIAS, 0.7)
    if (/defen/.test(focus))                  add(C.ATTACK_DEFENCE_BIAS, -0.7)
    if (/skill|technical|develop/.test(focus)) add(C.DEVELOPMENT_EMPHASIS, 0.7)
    if (/welfare|recovery|rest|wellbeing/.test(focus)) add(C.WELFARE_EMPHASIS, 0.7)
    if (/physical|conditioning|fitness/.test(focus))   add(C.DEVELOPMENT_EMPHASIS, 0.3)
  } else if (t === EVENT.MATCH_OUTCOME_RECORDED) {
    if (/expansive|attacking|expan/.test(approach)) { add(C.ATTACK_DEFENCE_BIAS, 1); add(C.RISK_APPETITE, 0.5) }
    if (/conservative|pragmatic|defensive/.test(approach)) { add(C.ATTACK_DEFENCE_BIAS, -0.7); add(C.RISK_APPETITE, -0.5) }
    if (ev.riskTaken === true) { add(C.RISK_APPETITE, 1); add(C.EXPERIMENTATION_LEVEL, 0.5) }
    if (isNum(ev.changes)) {
      if (ev.changes >= 5) { add(C.ROTATION_PHILOSOPHY, 1); add(C.CONTINUITY_PREFERENCE, -1) }
      else if (ev.changes <= 1) { add(C.ROTATION_PHILOSOPHY, -1); add(C.CONTINUITY_PREFERENCE, 1) }
    }
    if (isNum(ev.youthMinutes) && ev.youthMinutes >= 40) add(C.YOUTH_PROMOTION, 0.7)
  }
  return out
}

// ── manual overrides (explicit coach settings) ───────────────────────────────

function resolveExplicitScore(key, value) {
  if (CHARACTERISTIC_KEYS.includes(key)) {
    if (isNum(value)) return clamp(value, 0, 100)
    return LABEL_SCORES[lc(value)] ?? null
  }
  const map = MANUAL_PREFERENCE_MAP[key]
  if (!map) return null
  const score = isNum(value) ? clamp(value, 0, 100) : (map.values[lc(value)] ?? LABEL_SCORES[lc(value)] ?? null)
  return score == null ? null : { characteristic: map.characteristic, score }
}

/**
 * Extract the latest explicit override per characteristic from the stream.
 * @returns {Object<string, {score, evidence:string[], lastUpdated, count}>}
 */
export function extractManualOverrides(sortedObs) {
  const res = {}
  for (const obs of sortedObs) {
    if (obs.eventType !== EVENT.COACH_PREFERENCE_SET) continue
    const ev = obs.eventData ?? {}
    if (ev.key == null) continue
    const resolved = resolveExplicitScore(ev.key, ev.value)
    if (resolved == null) continue
    const characteristic = typeof resolved === 'object' ? resolved.characteristic : ev.key
    const score = typeof resolved === 'object' ? resolved.score : resolved
    if (!CHARACTERISTIC_KEYS.includes(characteristic)) continue
    const cur = res[characteristic] ?? { score: null, evidence: [], lastUpdated: null, count: 0 }
    cur.score = score                                  // latest wins
    cur.lastUpdated = obs.recordedAt ?? cur.lastUpdated
    cur.count += 1
    cur.evidence = [obs.observationId, ...cur.evidence].slice(0, MAX_EVIDENCE)
    res[characteristic] = cur
  }
  return res
}

// ── entry builders ────────────────────────────────────────────────────────────

function emptyEntry(key) {
  const meta = CHARACTERISTIC_META[key]
  return {
    key, label: meta.label,
    score: 50, confidence: 0, band: 'unknown', descriptor: 'insufficient data',
    evidence: [], lastUpdated: null, observationCount: 0, manual: false,
  }
}

function deriveEntry(key, contribs, totalObs) {
  const n = contribs.length
  if (n === 0) return emptyEntry(key)
  const sum = contribs.reduce((s, c) => s + c.delta, 0)
  const absSum = contribs.reduce((s, c) => s + Math.abs(c.delta), 0)
  const mean = clamp(sum / n, -1, 1)
  const score = Math.round(50 + mean * 50)

  const saturation = n / (n + SATURATION_K)
  const lastIdx = contribs[n - 1].idx
  const gap = Math.max(0, (totalObs - 1) - lastIdx)
  const recency = 1 / (1 + gap / RECENCY_SCALE)
  const agreement = absSum > 0 ? Math.abs(sum) / absSum : 0
  const confidence = round2(saturation * recency * (0.5 + 0.5 * agreement))

  const band = bandOf(score)
  return {
    key, label: CHARACTERISTIC_META[key].label,
    score, confidence, band,
    descriptor: descriptorOf(key, score, band),
    evidence: contribs.slice(-MAX_EVIDENCE).reverse().map(c => c.obsId),
    lastUpdated: contribs[n - 1].recordedAt ?? null,
    observationCount: n,
    manual: false,
  }
}

function manualEntry(key, m, contribs, totalObs) {
  const score = clamp(m.score, 0, 100)
  const band = bandOf(score)
  const inferred = contribs && contribs.length ? deriveEntry(key, contribs, totalObs) : null
  return {
    key, label: CHARACTERISTIC_META[key].label,
    score, confidence: 1.0, band,
    descriptor: `${descriptorOf(key, score, band)} (coach-set)`,
    evidence: m.evidence.slice(0, MAX_EVIDENCE),
    lastUpdated: m.lastUpdated,
    observationCount: m.count,
    manual: true,
    inferredScore: inferred ? inferred.score : null,
    inferredConfidence: inferred ? inferred.confidence : 0,
  }
}

// ── public: build all ten characteristics ────────────────────────────────────

/**
 * Build the ten characteristic entries from an observation stream.
 * @param {object[]} observations
 * @returns {Object<string, CharacteristicEntry>}
 */
export function buildCharacteristics(observations) {
  const obs = Array.isArray(observations) ? observations : []
  // Deterministic order: oldest-first by recordedAt, tie-broken by observationId.
  const sorted = [...obs].sort((a, b) => {
    const ta = a.recordedAt ?? '', tb = b.recordedAt ?? ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return String(a.observationId) < String(b.observationId) ? -1 : 1
  })

  const acc = {}
  sorted.forEach((o, idx) => {
    for (const { characteristic, delta } of signalsFor(o)) {
      (acc[characteristic] ??= []).push({ obsId: o.observationId, delta, recordedAt: o.recordedAt ?? null, idx })
    }
  })

  const manual = extractManualOverrides(sorted)
  const total = sorted.length
  const out = {}
  for (const key of CHARACTERISTIC_KEYS) {
    out[key] = manual[key]
      ? manualEntry(key, manual[key], acc[key], total)
      : deriveEntry(key, acc[key] ?? [], total)
  }
  return out
}
