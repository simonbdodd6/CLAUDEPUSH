/**
 * @coach-core-adapter — Position Normalization (DORMANT)
 *
 * Maps Coach's Eye Core position strings (free text, e.g. "Loosehead Prop", "Scrum-half",
 * "Flanker", "TBC") onto the canonical Brain position tokens used by the selection pipeline
 * (the M123 DEFAULT_FORMATION vocabulary). Pure, deterministic, lossless — it never guesses:
 * Core's coarse terms that have no single Brain equivalent ("Flanker", "Wing", "Centre")
 * normalise to coarse family tokens, and anything unknown / "TBC" / empty returns null.
 *
 * Reconciling coarse family tokens to specific jersey positions (Blindside vs Openside, etc.)
 * is a downstream formation / position-group concern — intentionally NOT decided here.
 *
 * No persistence, filesystem, network, randomness or clock.
 */

// The 14 distinct specific Brain position tokens used by M123 DEFAULT_FORMATION
// (15 jerseys, but Lock fills two — jerseys 4 & 5 — so 14 unique positions).
export const BRAIN_FORMATION_POSITIONS = Object.freeze([
  'LH', 'Hooker', 'TH', 'Lock', 'Blindside', 'Openside', 'Number8', 'ScrumHalf',
  'FlyHalf', 'LeftWing', 'InsideCentre', 'OutsideCentre', 'RightWing', 'Fullback',
])

// Coarse family tokens for Core data that lacks the finer distinction.
export const COARSE_POSITIONS = Object.freeze(['Flanker', 'Wing', 'Centre'])

// canonical token → the normalised alias keys that map to it
const POSITION_DEFINITIONS = Object.freeze({
  LH: ['lh', 'loosehead', 'loosehead prop', 'prop loosehead', 'lhp', '1'],
  Hooker: ['hooker', 'hook', '2'],
  TH: ['th', 'tighthead', 'tighthead prop', 'prop tighthead', 'thp', '3'],
  Lock: ['lock', 'second row', 'second rower', 'lock forward', '4', '5'],
  Blindside: ['blindside', 'blindside flanker', '6'],
  Openside: ['openside', 'openside flanker', '7'],
  Number8: ['number8', 'number 8', 'no8', 'no 8', 'eight', 'eightman', 'n8', '8'],
  ScrumHalf: ['scrumhalf', 'scrum half', 'sh', 'halfback', 'half back', '9'],
  FlyHalf: ['flyhalf', 'fly half', 'outhalf', 'out half', 'fh', 'oh', 'standoff', 'stand off', 'pivot', '10'],
  LeftWing: ['leftwing', 'left wing', 'lw', 'left winger', '11'],
  InsideCentre: ['insidecentre', 'inside centre', 'inside center', 'ic', 'first centre', '12'],
  OutsideCentre: ['outsidecentre', 'outside centre', 'outside center', 'oc', 'second centre', '13'],
  RightWing: ['rightwing', 'right wing', 'rw', 'right winger', '14'],
  Fullback: ['fullback', 'full back', 'fb', '15'],
  // coarse families (Core stores these without the finer split)
  Flanker: ['flanker', 'flank', 'wing forward'],
  Wing: ['wing', 'winger'],
  Centre: ['centre', 'center', 'midfielder'],
})

// flat alias-key → token lookup, built once
const ALIAS_TO_TOKEN = (() => {
  const map = new Map()
  for (const [token, aliases] of Object.entries(POSITION_DEFINITIONS)) {
    for (const alias of aliases) map.set(alias, token)
  }
  return map
})()

export const POSITION_ALIASES = Object.freeze(Object.fromEntries(ALIAS_TO_TOKEN))

/** Normalise a raw position string to a comparable key (lowercase, punctuation→space, collapsed). */
function toKey(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().toLowerCase().replace(/[-_./]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Normalise a Core position string to a canonical Brain token, or null if unknown / "TBC".
 *
 * @param {unknown} raw  a Core position string (or anything)
 * @returns {string|null}  a BRAIN_FORMATION_POSITIONS / COARSE_POSITIONS token, or null
 */
export function normalizePosition(raw) {
  const key = toKey(raw)
  if (!key) return null
  return ALIAS_TO_TOKEN.get(key) || null
}

/** True when `raw` maps to a known Brain position token. */
export function isKnownPosition(raw) {
  return normalizePosition(raw) !== null
}
