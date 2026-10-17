/**
 * @coach-core-adapter — Availability Mapping (DORMANT)
 *
 * Maps Coach's Eye Core availability responses ('available' | 'unavailable' | 'maybe', as found
 * in api/availability.js) onto the boolean `availability` the M120/M121 candidate contract
 * requires. Pure and deterministic. The treatment of 'maybe' and of missing/unknown responses
 * is policy, exposed as options (both default to false — conservative).
 *
 * No persistence, filesystem, network, randomness or clock.
 */

export const CORE_AVAILABILITY_RESPONSES = Object.freeze(['available', 'unavailable', 'maybe'])

const isObj = (v) => v !== null && typeof v === 'object'

/** Pull the response token out of a Core string or a Core response object `{ response }`. */
function responseToken(value) {
  if (typeof value === 'string') return value.trim().toLowerCase()
  if (isObj(value) && typeof value.response === 'string') return value.response.trim().toLowerCase()
  return null
}

/**
 * Map one Core availability value to a boolean.
 *
 * @param {string|{response:string}|null|undefined} value  Core response string or response object
 * @param {{ maybeAvailable?: boolean, unknownAvailable?: boolean }} [options]
 *   maybeAvailable   — how to treat 'maybe' (default false)
 *   unknownAvailable — how to treat missing / unrecognised responses (default false)
 * @returns {boolean}
 */
export function mapAvailability(value, options = {}) {
  if (!isObj(options) || Array.isArray(options)) throw new TypeError('mapAvailability: options must be an object')
  const maybeAvailable = options.maybeAvailable === true
  const unknownAvailable = options.unknownAvailable === true

  switch (responseToken(value)) {
    case 'available': return true
    case 'unavailable': return false
    case 'maybe': return maybeAvailable
    default: return unknownAvailable
  }
}

/**
 * Map a Core availability `responses` object ({ [userId]: { response, ... } } — the shape
 * stored by api/availability.js) to a plain `{ [userId]: boolean }` map.
 *
 * @param {Record<string, {response:string}|string>} responses
 * @param {{ maybeAvailable?: boolean, unknownAvailable?: boolean }} [options]
 * @returns {Record<string, boolean>}
 */
export function mapAvailabilityResponses(responses, options = {}) {
  if (!isObj(responses) || Array.isArray(responses)) throw new TypeError('mapAvailabilityResponses: responses must be an object')
  const out = {}
  for (const userId of Object.keys(responses)) {
    out[userId] = mapAvailability(responses[userId], options)
  }
  return out
}
