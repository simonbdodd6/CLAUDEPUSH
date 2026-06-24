/**
 * @coach-core-adapter — Coach DNA Profile (DORMANT)
 *
 * Builds a coach DNA profile (M114-compatible shape) from coach-level signals / tags / traits /
 * attributes via configurable mappings — the coach-level analogue of M153's player signal source.
 * The output is consumed by M152 applyPlayerDnaInfluence and M155 createDnaConfidenceProvider, so
 * it closes the gap between memory-derived coaching signals and per-player DNA influence.
 *
 * Pure adapter composition: no engine / M120 / recommendation / pipeline / Core edits, no Redis,
 * no network, no clock. Multiple sources for the same category SUM (then clamp to [0,1]) — matching
 * M114's "more evidence → stronger" — so categories are unique. Inputs are never mutated; output
 * is deeply frozen.
 *
 * NOTE: exported as `composeCoachDnaProfile` (not `buildCoachDnaProfile`) to avoid shadowing the
 * existing M114 `buildCoachDnaProfile(signals)` in coach-memory.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const strCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

// illustrative defaults — overridable via options.mappings (categories are M108 memory types)
export const DEFAULT_COACH_DNA_MAPPINGS = Object.freeze({
  tags: Object.freeze({
    'forward-led': Object.freeze({ category: 'selection-preference', strength: 0.4 }),
    'risk-averse': Object.freeze({ category: 'risk-warning', strength: 0.4 }),
    attacking: Object.freeze({ category: 'tactical-preference', strength: 0.4 }),
  }),
  traits: Object.freeze({
    methodical: Object.freeze({ category: 'learned-pattern', strength: 0.3 }),
    'man-manager': Object.freeze({ category: 'player-management', strength: 0.3 }),
  }),
  attributes: Object.freeze({
    style: Object.freeze({
      expansive: Object.freeze({ category: 'tactical-preference', strength: 0.5 }),
      structured: Object.freeze({ category: 'learned-pattern', strength: 0.5 }),
    }),
  }),
})

function assertCoachProfile(p) {
  if (!isObj(p)) throw new TypeError('composeCoachDnaProfile requires a coach profile { signals?, tags?, traits?, attributes? }')
  if (p.signals !== undefined) {
    if (!Array.isArray(p.signals)) throw new TypeError('composeCoachDnaProfile: signals must be an array')
    for (const s of p.signals) {
      if (!isObj(s) || !isNonEmptyString(s.category) || !isFiniteNumber(s.strength)) throw new TypeError('composeCoachDnaProfile: each signal must be { category, strength }')
    }
  }
  if (p.tags !== undefined && !isStringArray(p.tags)) throw new TypeError('composeCoachDnaProfile: tags must be an array of strings')
  if (p.traits !== undefined && !isStringArray(p.traits)) throw new TypeError('composeCoachDnaProfile: traits must be an array of strings')
  if (p.attributes !== undefined) {
    if (!isObj(p.attributes)) throw new TypeError('composeCoachDnaProfile: attributes must be an object')
    for (const k of Object.keys(p.attributes)) {
      if (typeof p.attributes[k] !== 'string') throw new TypeError(`composeCoachDnaProfile: attribute "${k}" must be a string value`)
    }
  }
}

/** Validate a mapping entry resolves to a { category, strength } contribution. */
function asContribution(entry, where) {
  if (!isObj(entry) || !isNonEmptyString(entry.category) || !isFiniteNumber(entry.strength)) {
    throw new TypeError(`composeCoachDnaProfile: malformed mapping at ${where}`)
  }
  return { category: entry.category, strength: entry.strength }
}

/**
 * Compose a coach DNA profile from coach-level inputs.
 *
 * @param {{ signals?: Array<{category:string, strength:number}>, tags?: string[], traits?: string[], attributes?: Record<string,string> }} coachProfile
 * @param {{ mappings?: { tags?:object, traits?:object, attributes?:object } }} [options]
 * @returns {Readonly<{ profileVersion:string, dominantSignals: ReadonlyArray<{category:string, strength:number}>, confidence:number, metadata:object }>}
 */
export function composeCoachDnaProfile(coachProfile, options = {}) {
  assertCoachProfile(coachProfile)
  if (!isObj(options)) throw new TypeError('composeCoachDnaProfile: options must be an object')
  const mappings = options.mappings !== undefined ? options.mappings : DEFAULT_COACH_DNA_MAPPINGS
  if (!isObj(mappings)) throw new TypeError('composeCoachDnaProfile: mappings must be an object')
  for (const k of ['tags', 'traits', 'attributes']) {
    if (mappings[k] !== undefined && !isObj(mappings[k])) throw new TypeError(`composeCoachDnaProfile: mappings.${k} must be an object`)
  }
  const tagMap = isObj(mappings.tags) ? mappings.tags : {}
  const traitMap = isObj(mappings.traits) ? mappings.traits : {}
  const attrMap = isObj(mappings.attributes) ? mappings.attributes : {}

  const signals = coachProfile.signals || []
  const tags = coachProfile.tags || []
  const traits = coachProfile.traits || []
  const attributes = coachProfile.attributes || {}

  // collect contributions in a fixed order: direct signals → tags → traits → attributes (sorted keys)
  const raw = []
  for (const s of signals) raw.push({ category: s.category, strength: s.strength, source: `signal:${s.category}` })
  for (const tag of tags) {
    if (Object.prototype.hasOwnProperty.call(tagMap, tag)) raw.push({ ...asContribution(tagMap[tag], `tags.${tag}`), source: `tag:${tag}` })
  }
  for (const trait of traits) {
    if (Object.prototype.hasOwnProperty.call(traitMap, trait)) raw.push({ ...asContribution(traitMap[trait], `traits.${trait}`), source: `trait:${trait}` })
  }
  for (const key of Object.keys(attributes).sort(strCmp)) {
    const byValue = attrMap[key]
    const value = attributes[key]
    if (isObj(byValue) && Object.prototype.hasOwnProperty.call(byValue, value)) {
      raw.push({ ...asContribution(byValue[value], `attributes.${key}.${value}`), source: `attribute:${key}=${value}` })
    }
  }

  // aggregate by category: sum strengths (clamped), collect sources; unique categories, sorted
  const byCategory = new Map()
  for (const r of raw) {
    const cur = byCategory.get(r.category) || { strength: 0, sources: [] }
    cur.strength += r.strength
    cur.sources.push(r.source)
    byCategory.set(r.category, cur)
  }

  const dominantSignals = [...byCategory.entries()]
    .map(([category, v]) => ({ category, strength: clamp01(v.strength) }))
    .sort((a, b) => strCmp(a.category, b.category))

  const confidence = dominantSignals.length
    ? clamp01(dominantSignals.reduce((sum, s) => sum + s.strength, 0) / dominantSignals.length)
    : 0

  return deepFreeze({
    profileVersion: '1.0',
    dominantSignals,
    confidence,
    metadata: {
      sources: [...byCategory.entries()].sort((a, b) => strCmp(a[0], b[0])).map(([category, v]) => ({ category, sources: v.sources })),
      signalCount: dominantSignals.length,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
