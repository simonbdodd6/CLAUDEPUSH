/**
 * @brain/evidence-normalization — normalizer registry (M51, DORMANT)
 *
 * A pure, IMMUTABLE registry mapping `sourceType` (and version) → the registered
 * normalizer that speaks the common language for that source (M42 §3: "register a
 * sourceType + a normalizer; nothing downstream changes"). Architecture only — it
 * holds no real normalizers, dispatches nothing, touches no provider, store, gateway
 * or runtime.
 *
 * Functional + immutable: there is NO mutable global registry. `createNormalizerRegistry`
 * builds a frozen registry; `register` returns a NEW registry, never mutating the old
 * one. Deterministic ordering throughout (sorted by `sourceType` then version). No
 * clock, no randomness, no I/O. Lookups REPORT misses as data (null); only malformed
 * contracts / duplicate registrations / malformed input throw (programmer errors).
 *
 * Imports only sibling modules — depends, transitively, solely on @brain/evidence-contracts.
 */

import { assertNormalizerContract } from './contracts.js'
import { NormalizationError, NORMALIZATION_ERROR } from './errors.js'

const isStr = (v) => typeof v === 'string' && v.length > 0

/**
 * Deterministic version comparison. Compares dot-separated segments left-to-right:
 * two numeric segments compare numerically, otherwise lexicographically; a shorter
 * run sorts before a longer one that shares its prefix (`'1' < '1.0'`). Total + stable.
 * @returns {-1|0|1}
 */
export function compareVersions(a, b) {
  const sa = String(a).split('.'), sb = String(b).split('.')
  const len = Math.max(sa.length, sb.length)
  for (let i = 0; i < len; i++) {
    const x = sa[i], y = sb[i]
    if (x === undefined) return -1            // a ran out first → a is lower
    if (y === undefined) return 1
    const nx = Number(x), ny = Number(y)
    const bothNum = isStr(x) && isStr(y) && Number.isFinite(nx) && Number.isFinite(ny)
    if (bothNum) { if (nx !== ny) return nx < ny ? -1 : 1 }
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** Deterministic order over descriptors: by sourceType, then version. */
function compareDescriptors(a, b) {
  if (a.sourceType !== b.sourceType) return a.sourceType < b.sourceType ? -1 : 1
  return compareVersions(a.version, b.version)
}

/** Add a normalizer into a working Map (throws on malformed contract / duplicate). */
function addInto(byKey, normalizer) {
  const descriptor = assertNormalizerContract(normalizer)   // throws invalid_contract if malformed
  if (byKey.has(descriptor.key)) {
    throw new NormalizationError(
      NORMALIZATION_ERROR.DUPLICATE_NORMALIZER,
      `a normalizer is already registered for ${descriptor.key}`,
    )
  }
  byKey.set(descriptor.key, Object.freeze({ descriptor, normalizer }))
  return byKey
}

/**
 * Wrap a fully-built Map as a frozen registry value object. `entries` is computed
 * once, in deterministic order, and reused by every read.
 */
function freezeRegistry(byKey) {
  const entries = [...byKey.values()].sort((x, y) => compareDescriptors(x.descriptor, y.descriptor))

  const forSource = (sourceType) => entries.filter((e) => e.descriptor.sourceType === sourceType)
  const exact = (sourceType, version) => byKey.get(`${sourceType}@${version}`) || null

  const registry = {
    /** Number of registered normalizers. */
    size: entries.length,

    /**
     * Is a normalizer registered? With `version`, an exact match; without, any
     * version of `sourceType`.
     * @param {string} sourceType @param {string} [version] @returns {boolean}
     */
    has(sourceType, version) {
      if (version !== undefined) return exact(sourceType, version) != null
      return forSource(sourceType).length > 0
    },

    /**
     * Exact lookup by (sourceType, version). Unknown → null (reported as data).
     * @returns {object|null} the registered normalizer
     */
    get(sourceType, version) {
      const hit = exact(sourceType, version)
      return hit ? hit.normalizer : null
    },

    /**
     * Resolve the normalizer for a sourceType. With `version`, the exact match;
     * without, the highest registered version (deterministic). None → null.
     * @returns {object|null}
     */
    resolve(sourceType, version) {
      if (version !== undefined) return registry.get(sourceType, version)
      const candidates = forSource(sourceType)
      if (candidates.length === 0) return null
      const latest = candidates.reduce((best, e) =>
        compareVersions(e.descriptor.version, best.descriptor.version) > 0 ? e : best)
      return latest.normalizer
    },

    /** The descriptor for (sourceType, version), or null. */
    describe(sourceType, version) {
      const hit = exact(sourceType, version)
      return hit ? hit.descriptor : null
    },

    /** All descriptors, deterministically ordered, frozen. */
    list() {
      return Object.freeze(entries.map((e) => e.descriptor))
    },

    /** All `sourceType@version` keys, deterministically ordered, frozen. */
    keys() {
      return Object.freeze(entries.map((e) => e.descriptor.key))
    },

    /** Distinct registered sourceTypes, deterministically ordered, frozen. */
    sourceTypes() {
      const seen = []
      for (const e of entries) if (!seen.includes(e.descriptor.sourceType)) seen.push(e.descriptor.sourceType)
      return Object.freeze(seen)
    },

    /**
     * Return a NEW registry with `normalizer` added — the current registry is never
     * mutated. Throws `invalid_contract` (malformed) or `duplicate_normalizer`.
     * @returns {Readonly<object>}
     */
    register(normalizer) {
      return freezeRegistry(addInto(new Map(byKey), normalizer))
    },
  }
  return Object.freeze(registry)
}

/**
 * Build an immutable normalizer registry from an initial (possibly empty) list.
 * Each entry must satisfy the NormalizerContract; duplicate `sourceType@version`
 * pairs are rejected. Order of the input does not affect lookups or listing order.
 * @param {object[]} [normalizers]
 * @returns {Readonly<{ size:number, has:Function, get:Function, resolve:Function, describe:Function, list:Function, keys:Function, sourceTypes:Function, register:Function }>}
 */
export function createNormalizerRegistry(normalizers = []) {
  if (!Array.isArray(normalizers)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'normalizers must be an array')
  }
  const byKey = new Map()
  for (const n of normalizers) addInto(byKey, n)
  return freezeRegistry(byKey)
}
