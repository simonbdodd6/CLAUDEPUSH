/**
 * AI Brain — Coach DNA Engine (M23)
 *
 * Assembles CoachDNA profiles from observation streams, derives a coaching
 * "style", compares evolution across seasons, summarises what was learned in a
 * season, and provides store / reset / export / versioning utilities.
 *
 * Pure where possible. The only stateful parts are a small in-memory cache and
 * a per-coach manual reset marker — neither touches Core or the Learning store.
 */

import {
  DNA_VERSION, CHARACTERISTIC_KEYS, DISCOVERY_CONFIDENCE, MIN_OBSERVATIONS_FOR_SIGNAL,
} from './coach-dna-types.js'
import { buildCharacteristics } from './characteristics.js'
import {
  seasonsIn, groupBySeason, diffCharacteristics, newlyDiscovered, seasonCompare, seasonOf, UNKNOWN_SEASON,
} from './season.js'

const round2 = (n) => Math.round(n * 100) / 100

// ── Style synthesis ───────────────────────────────────────────────────────────

/**
 * Synthesise a high-level coaching style from the characteristics.
 * Picks the strongest *off-neutral, confident* traits.
 */
export function buildStyle(characteristics) {
  const traits = CHARACTERISTIC_KEYS
    .map(k => characteristics[k])
    .map(e => ({
      key: e.key, descriptor: e.descriptor, score: e.score, confidence: e.confidence,
      band: e.band, manual: e.manual,
      strength: e.confidence * (Math.abs(e.score - 50) / 50),
    }))
    .filter(t => t.confidence >= 0.15 && t.band !== 'balanced' && t.band !== 'unknown')
    .sort((a, b) => (b.strength - a.strength) || (a.key < b.key ? -1 : 1))

  const top = traits.slice(0, 3)
  return {
    primary:   top[0]?.descriptor ?? null,
    secondary: top[1]?.descriptor ?? null,
    traits: top.map(t => ({ key: t.key, descriptor: t.descriptor, score: t.score, confidence: t.confidence, manual: t.manual })),
    summary: top.length
      ? top.map(t => t.descriptor).join(', ')
      : 'Coaching identity still emerging — more observations needed',
  }
}

// ── CoachDNA assembly ─────────────────────────────────────────────────────────

/**
 * Build a CoachDNA profile (pure).
 * @param {string}   coachId
 * @param {object[]} observations
 * @param {object}   opts  { asOf? }
 * @returns {CoachDNA}
 */
export function buildCoachDNA(coachId, observations = [], opts = {}) {
  const obs = Array.isArray(observations) ? observations : []
  const characteristics = buildCharacteristics(obs)
  const seasons = seasonsIn(obs)
  const confidences = CHARACTERISTIC_KEYS.map(k => characteristics[k].confidence)
  const maturity = round2(confidences.reduce((a, b) => a + b, 0) / CHARACTERISTIC_KEYS.length)
  const manualOverrides = CHARACTERISTIC_KEYS.filter(k => characteristics[k].manual)
  const discovered = CHARACTERISTIC_KEYS.filter(k =>
    characteristics[k].confidence >= DISCOVERY_CONFIDENCE &&
    characteristics[k].observationCount >= MIN_OBSERVATIONS_FOR_SIGNAL)

  return {
    dnaVersion:       DNA_VERSION,
    coachId:          coachId ?? null,
    generatedAt:      opts.asOf ?? null,
    observationCount: obs.length,
    seasonsObserved:  seasons,
    maturity,
    discovered,
    manualOverrides,
    characteristics,
    style: buildStyle(characteristics),
  }
}

// ── In-memory store + manual reset ────────────────────────────────────────────

const dnaCache = new Map()      // coachId → last built CoachDNA
const resetMarkers = new Map()  // coachId → ISO cutoff; observations strictly before are ignored

/** Apply a coach's reset marker to an observation stream. */
function applyReset(coachId, observations) {
  const cut = resetMarkers.get(coachId)
  if (!cut) return observations
  return (observations ?? []).filter(o => (o.recordedAt ?? '') >= cut)
}

/**
 * Build + cache a CoachDNA, honouring any manual reset marker.
 * @returns {CoachDNA}
 */
export function getCoachDNA(coachId, observations = [], opts = {}) {
  const effective = applyReset(coachId, observations)
  const dna = buildCoachDNA(coachId, effective, opts)
  if (coachId) dnaCache.set(coachId, dna)
  return dna
}

/** High-level style only. */
export function getCoachStyle(coachId, observations = [], opts = {}) {
  const dna = getCoachDNA(coachId, observations, opts)
  return {
    dnaVersion: DNA_VERSION,
    coachId: coachId ?? null,
    maturity: dna.maturity,
    observationCount: dna.observationCount,
    ...dna.style,
  }
}

/**
 * Manually reset a coach's DNA learning from `asOf` forward.
 * Observations recorded before `asOf` are excluded from future builds.
 * With no `asOf`, a full reset (all prior observations ignored) is applied.
 * Never deletes observations — those are owned by the Learning Engine.
 */
export function resetCoachDNA(coachId, opts = {}) {
  if (!coachId) return null
  const cutoff = opts.asOf ?? '9999-12-31'   // full reset by default
  resetMarkers.set(coachId, cutoff)
  dnaCache.delete(coachId)
  return { coachId, resetAt: opts.asOf ?? null, fullReset: opts.asOf == null }
}

/** Clear a coach's reset marker (resume learning from full history). */
export function clearReset(coachId) {
  if (coachId) resetMarkers.delete(coachId)
}

/**
 * Export a serialisable CoachDNA snapshot with export metadata + version.
 */
export function exportCoachDNA(coachId, observations = [], opts = {}) {
  const dna = getCoachDNA(coachId, observations, opts)
  return {
    exportVersion: DNA_VERSION,
    exportedAt:    opts.asOf ?? null,
    coachId:       coachId ?? null,
    dna,
  }
}

/** Test isolation. */
export function _clear() {
  dnaCache.clear()
  resetMarkers.clear()
}

// ── Season comparisons / evolution ────────────────────────────────────────────

/**
 * Compare a coach's DNA across every observed season.
 * @returns evolution report with per-season snapshots, transitions, and trend.
 */
export function compareCoachEvolution(coachId, observations = [], opts = {}) {
  const effective = applyReset(coachId, observations)
  const groups = groupBySeason(effective)
  const seasons = [...groups.keys()].filter(s => s !== UNKNOWN_SEASON)

  const perSeason = seasons.map(season => {
    const dna = buildCoachDNA(coachId, groups.get(season), opts)
    const scores = {}, confidences = {}
    for (const k of CHARACTERISTIC_KEYS) {
      scores[k] = dna.characteristics[k].score
      confidences[k] = dna.characteristics[k].confidence
    }
    return {
      season,
      observationCount: dna.observationCount,
      maturity: dna.maturity,
      style: { primary: dna.style.primary, summary: dna.style.summary },
      scores, confidences,
    }
  })

  const transitions = []
  for (let i = 1; i < seasons.length; i++) {
    const prev = buildCoachDNA(coachId, groups.get(seasons[i - 1]), opts)
    const cur  = buildCoachDNA(coachId, groups.get(seasons[i]), opts)
    transitions.push({
      from: seasons[i - 1], to: seasons[i],
      changes: diffCharacteristics(prev, cur),
      newlyDiscovered: newlyDiscovered(prev, cur),
    })
  }

  // Overall trend: first vs last season
  let trend = { mostChanged: [], summary: 'Not enough seasons to compare' }
  if (seasons.length >= 2) {
    const first = buildCoachDNA(coachId, groups.get(seasons[0]), opts)
    const last  = buildCoachDNA(coachId, groups.get(seasons[seasons.length - 1]), opts)
    const diffs = diffCharacteristics(first, last)
      .filter(d => d.direction !== 'stable')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    trend = {
      mostChanged: diffs.slice(0, 3).map(d => ({ key: d.key, label: d.label, delta: d.delta, direction: d.direction })),
      summary: diffs.length
        ? `Over ${seasons.length} seasons, biggest shift: ${diffs[0].label} ${diffs[0].direction} (${diffs[0].delta > 0 ? '+' : ''}${diffs[0].delta})`
        : `Identity stable across ${seasons.length} seasons`,
    }
  }

  return {
    dnaVersion: DNA_VERSION,
    coachId: coachId ?? null,
    seasons,
    perSeason,
    transitions,
    trend,
    overall: buildCoachDNA(coachId, effective, opts),
  }
}

/**
 * Summarise what was learned about a coach within one season, versus everything
 * known before it.
 * @param {object} opts  { season?, asOf? }   season defaults to the latest observed
 */
export function getSeasonLearning(coachId, observations = [], opts = {}) {
  const effective = applyReset(coachId, observations)
  const seasons = seasonsIn(effective)
  if (!seasons.length) {
    return {
      dnaVersion: DNA_VERSION, coachId: coachId ?? null,
      season: null, previousSeason: null, observationCount: 0, maturity: 0,
      discovered: [], characteristics: {}, summary: 'No season data yet',
    }
  }
  const season = opts.season && seasons.includes(opts.season) ? opts.season : seasons[seasons.length - 1]
  const idx = seasons.indexOf(season)
  const previousSeason = idx > 0 ? seasons[idx - 1] : null

  const groups = groupBySeason(effective)
  const seasonDna = buildCoachDNA(coachId, groups.get(season), opts)
  // Cumulative DNA through the END of the previous season (what we knew before).
  const priorObs = effective.filter(o => seasonCompare(seasonOf(o), season) < 0)
  const priorDna = buildCoachDNA(coachId, priorObs, opts)

  const characteristics = {}
  for (const k of CHARACTERISTIC_KEYS) {
    const cur = seasonDna.characteristics[k]
    const prev = priorDna.characteristics[k]
    characteristics[k] = {
      score: cur.score,
      confidence: cur.confidence,
      observationCount: cur.observationCount,
      deltaVsPrevSeason: prev ? cur.score - prev.score : null,
    }
  }

  const discovered = newlyDiscovered(priorDna, seasonDna)
  return {
    dnaVersion: DNA_VERSION,
    coachId: coachId ?? null,
    season,
    previousSeason,
    observationCount: seasonDna.observationCount,
    maturity: seasonDna.maturity,
    discovered,
    characteristics,
    summary: discovered.length
      ? `This season revealed: ${discovered.map(d => d.descriptor).join(', ')}`
      : `No new characteristics crossed the discovery threshold in ${season}`,
  }
}
