/**
 * @coach-core-adapter — Player DNA Signal Source (DORMANT)
 *
 * Produces the per-player DNA affinity signals that M152 (applyPlayerDnaInfluence) consumes,
 * by mechanically mapping a player's tags / traits / attributes onto coaching signal categories
 * via configurable mappings. It runs no AI inference, generates no text, and touches no
 * Core/Redis/network/clock — it is a pure deterministic translator. Inputs are never mutated;
 * output is deeply frozen.
 *
 * Output `dnaSignals` is exactly the `{ category, weight }[]` shape M152 expects, so the two
 * compose directly: derivePlayerDnaSignals(profile).dnaSignals → candidate.dnaSignals.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const strCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

// illustrative defaults — overridable via options.mappings (categories are M108 memory types)
export const DEFAULT_DNA_MAPPINGS = Object.freeze({
  tags: Object.freeze({
    leader: Object.freeze({ category: 'communication-style', weight: 1 }),
    reliable: Object.freeze({ category: 'selection-preference', weight: 1 }),
    'high-risk': Object.freeze({ category: 'risk-warning', weight: 1 }),
  }),
  traits: Object.freeze({
    disciplined: Object.freeze({ category: 'player-management', weight: 1 }),
    creative: Object.freeze({ category: 'tactical-preference', weight: 1 }),
  }),
  attributes: Object.freeze({
    experience: Object.freeze({
      high: Object.freeze({ category: 'learned-pattern', weight: 1 }),
      low: Object.freeze({ category: 'learned-pattern', weight: -1 }),
    }),
  }),
})

function assertProfile(p) {
  if (!isObj(p) || !isNonEmptyString(p.playerId)) throw new TypeError('derivePlayerDnaSignals requires a profile { playerId, tags?, traits?, attributes? }')
  if (p.tags !== undefined && !isStringArray(p.tags)) throw new TypeError('derivePlayerDnaSignals: tags must be an array of strings')
  if (p.traits !== undefined && !isStringArray(p.traits)) throw new TypeError('derivePlayerDnaSignals: traits must be an array of strings')
  if (p.attributes !== undefined) {
    if (!isObj(p.attributes)) throw new TypeError('derivePlayerDnaSignals: attributes must be an object')
    for (const k of Object.keys(p.attributes)) {
      if (typeof p.attributes[k] !== 'string') throw new TypeError(`derivePlayerDnaSignals: attribute "${k}" must be a string value`)
    }
  }
}

/** Validate a mapping entry resolves to a { category, weight } signal. */
function asSignal(entry, where) {
  if (!isObj(entry) || !isNonEmptyString(entry.category) || !isFiniteNumber(entry.weight)) {
    throw new TypeError(`derivePlayerDnaSignals: malformed mapping at ${where}`)
  }
  return { category: entry.category, weight: entry.weight }
}

/**
 * Derive a player's DNA affinity signals from their profile via configurable mappings.
 *
 * @param {{ playerId:string, tags?:string[], traits?:string[], attributes?:Record<string,string> }} playerProfile
 * @param {{ mappings?: { tags?:object, traits?:object, attributes?:object } }} [options]
 * @returns {Readonly<{ playerId:string, dnaSignals: ReadonlyArray<{category:string, weight:number}>, metadata:object }>}
 */
export function derivePlayerDnaSignals(playerProfile, options = {}) {
  assertProfile(playerProfile)
  if (!isObj(options)) throw new TypeError('derivePlayerDnaSignals: options must be an object')

  const mappings = options.mappings !== undefined ? options.mappings : DEFAULT_DNA_MAPPINGS
  if (!isObj(mappings)) throw new TypeError('derivePlayerDnaSignals: mappings must be an object')
  for (const k of ['tags', 'traits', 'attributes']) {
    if (mappings[k] !== undefined && !isObj(mappings[k])) throw new TypeError(`derivePlayerDnaSignals: mappings.${k} must be an object`)
  }
  const tagMap = isObj(mappings.tags) ? mappings.tags : {}
  const traitMap = isObj(mappings.traits) ? mappings.traits : {}
  const attrMap = isObj(mappings.attributes) ? mappings.attributes : {}

  const tags = playerProfile.tags || []
  const traits = playerProfile.traits || []
  const attributes = playerProfile.attributes || {}

  // collect raw signals in a fixed order: tags → traits → attributes (attribute keys sorted)
  const raw = []
  for (const tag of tags) {
    if (Object.prototype.hasOwnProperty.call(tagMap, tag)) raw.push({ ...asSignal(tagMap[tag], `tags.${tag}`), source: `tag:${tag}` })
  }
  for (const trait of traits) {
    if (Object.prototype.hasOwnProperty.call(traitMap, trait)) raw.push({ ...asSignal(traitMap[trait], `traits.${trait}`), source: `trait:${trait}` })
  }
  for (const key of Object.keys(attributes).sort(strCmp)) {
    const value = attributes[key]
    const byValue = attrMap[key]
    if (isObj(byValue) && Object.prototype.hasOwnProperty.call(byValue, value)) {
      raw.push({ ...asSignal(byValue[value], `attributes.${key}.${value}`), source: `attribute:${key}=${value}` })
    }
  }

  // dedupe by category (first-seen wins), then stable-sort by category
  const seen = new Set()
  const kept = []
  for (const r of raw) {
    if (!seen.has(r.category)) { seen.add(r.category); kept.push(r) }
  }
  kept.sort((a, b) => strCmp(a.category, b.category))

  const dnaSignals = kept.map((r) => ({ category: r.category, weight: r.weight }))

  return deepFreeze({
    playerId: playerProfile.playerId,
    dnaSignals,
    metadata: {
      sources: kept.map((r) => ({ source: r.source, category: r.category, weight: r.weight })),   // explains each signal's origin
      tagCount: tags.length,
      traitCount: traits.length,
      attributeCount: Object.keys(attributes).length,
      signalCount: dnaSignals.length,
      duplicatesRemoved: raw.length - kept.length,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
