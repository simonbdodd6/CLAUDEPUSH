/**
 * web/brain-coach-dna-intelligence-consumer-contract.js - Coach DNA Intelligence Consumer Contract (M256, DORMANT)
 *
 * The consumer-safety contract for the Coach's Eye Intelligence subsystem. It is NOT a new intelligence layer:
 * it defines and verifies HOW future Brain subsystems (Match Intelligence, Selection Intelligence, Season
 * Memory, Opposition Analysis, Coach Evolution, ...) are allowed to consume the M255 query surface, so a
 * consumer can depend on a stable, safe behavioural guarantee rather than on the internal profile/index shapes.
 *
 * `describeCoachDnaIntelligenceConsumerContract()` returns the frozen contract descriptor: the allowed query
 * methods, expected response shapes, the safe-malformed-input rule, availability of provenance/coverage/
 * confidence/validation-state, the frozen-response requirement, and the no-recommendation / no-prediction /
 * no-derivation boundary. `validateCoachDnaIntelligenceConsumer(surface)` probes an actual surface against that
 * contract and returns a deterministic pass/fail report — proving the surface honours the contract (a genuine
 * M255 surface passes even when its data is empty; a non-compliant fake is rejected).
 *
 * Pure functions. They reuse ONLY the M255 surface (building one on demand from a profile/index), mutate no
 * input, perform no writes, make no recommendation, call no AI/LLM, and use no DOM/network/storage/env/
 * database/clock/randomness. Same input → same report, byte for byte.
 */

import { createCoachDnaIntelligenceQuery } from './brain-coach-dna-intelligence-query.js' // M255

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

// FNV-1a 32-bit — the same fingerprint convention used across the Coach DNA pipeline, for consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const CONTRACT_VERSION = 1

// The methods a consumer is allowed to call on the M255 surface, with their contracted behaviour.
const ALLOWED_METHODS = Object.freeze([
  { name: 'isUsable', args: '()', returns: 'boolean' },
  { name: 'getSignalGroup', args: '(categoryOrField)', returns: 'frozen object | null' },
  { name: 'getCategory', args: '(categoryOrField)', returns: 'frozen object | null' },
  { name: 'listPresentCategories', args: '()', returns: 'frozen string[]' },
  { name: 'getCoverage', args: '()', returns: 'frozen object' },
  { name: 'getEvidence', args: '()', returns: 'frozen object' },
  { name: 'getConfidence', args: '()', returns: 'frozen object' },
  { name: 'getProvenance', args: '()', returns: 'frozen object' },
  { name: 'getValidationState', args: '()', returns: 'frozen object' },
])
const METHOD_NAMES = Object.freeze(ALLOWED_METHODS.map((m) => m.name))
// Getters that must always return a frozen object (never null, never throw) for any surface.
const OBJECT_GETTERS = Object.freeze(['getCoverage', 'getEvidence', 'getConfidence', 'getProvenance', 'getValidationState'])
// Language a contract-compliant response must never contain.
const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast)\b/i
const UNKNOWN_KEY = '___m256_no_such_category___'

/**
 * The static, frozen description of the consumer contract.
 * @returns {object}
 */
export function describeCoachDnaIntelligenceConsumerContract() {
  const draft = {
    type: 'coach-dna-intelligence-consumer-contract',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    source: 'coach-dna-intelligence-query',
    sourceMilestone: 'M255',
    allowedMethods: ALLOWED_METHODS,
    responseShapes: {
      getSignalGroup: ['field', 'category', 'label', 'present', 'isDominant', 'occurrences', 'strength', 'supportingCount', 'themeCount', 'averageConfidence', 'averageWeight'],
      getCategory: ['category', 'label', 'signalKey', 'present', 'isDominant', 'isStrongest', 'isWeakest'],
      getCoverage: ['categoriesCovered', 'categoriesPossible', 'coverageRatio', 'presentSignals', 'dominantSignals', 'totalSignals', 'confidenceLevel'],
      getEvidence: ['totalMemories', 'uniqueTypes', 'totalEvidence', 'totalOntologyLinks', 'byCategory'],
      getConfidence: ['level'],
      getProvenance: ['chain', 'profileFingerprint', 'intelligenceInputsFingerprint', 'origin', 'byMilestone'],
      getValidationState: ['profileRecognized', 'profileUsable', 'issues'],
    },
    boundaries: {
      readOnly: true,
      frozenResponses: true,
      safeMalformedInput: true,      // unknown key → null; absent category → present:false; never throws
      noRecommendation: true,
      noPrediction: true,
      noDerivation: true,
    },
    availability: {
      provenance: true,
      coverage: true,
      confidence: true,
      evidence: true,
      validationState: true,
    },
    derivationMetadata: {
      milestone: 'M256',
      describes: 'coach-dna-intelligence-query',
      sourceMilestone: 'M255',
      deterministic: true,
      llmGenerated: false,
      readOnly: true,
      dormant: true,
    },
  }
  draft.contractFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

function safeCall(fn) {
  try { return { ok: true, value: fn() } } catch (e) { return { ok: false, value: undefined, error: String(e && e.message) } }
}

// Resolve the surface to validate: an existing M255 surface is used as-is; anything else is fed to M255 (which
// yields a real, contract-shaped surface — usable or not).
function resolveSurface(input) {
  if (isObj(input) && typeof input.getSignalGroup === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaIntelligenceQuery(input)
}

/**
 * Validate an M255 query surface (or a profile/index that yields one) against the consumer contract.
 *
 * @param {object} input an M255 surface, or an M253 profile / M254 index / { profile, index } pair
 * @returns {object} frozen validation report (valid, per-check pass/fail, availability flags).
 */
export function validateCoachDnaIntelligenceConsumer(input) {
  const surface = resolveSurface(input)
  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass: pass === true, detail })
  const collected = [] // JSON of every observed response, for the no-advice boundary check

  // allowed methods present ---------------------------------------------------------------------------------
  for (const name of METHOD_NAMES) add(`method:${name}`, isObj(surface) && typeof surface[name] === 'function')
  const callable = (name) => isObj(surface) && typeof surface[name] === 'function'

  // safe malformed input ------------------------------------------------------------------------------------
  if (callable('getSignalGroup')) {
    const a = safeCall(() => surface.getSignalGroup(UNKNOWN_KEY))
    add('safe-unknown-key-null', a.ok && a.value === null)
    const b = safeCall(() => surface.getSignalGroup(7))
    add('safe-nonstring-key-null', b.ok && b.value === null)
    if (a.ok && a.value !== null) collected.push(JSON.stringify(a.value))
  }
  if (callable('getCategory')) {
    const c = safeCall(() => surface.getCategory(UNKNOWN_KEY))
    add('safe-unknown-category-null', c.ok && c.value === null)
  }

  // object getters: always a frozen object, never null, never throws ----------------------------------------
  const responses = {}
  for (const name of OBJECT_GETTERS) {
    if (!callable(name)) { add(`returns-frozen-object:${name}`, false, 'method missing'); continue }
    const r = safeCall(() => surface[name]())
    const ok = r.ok && isObj(r.value) && Object.isFrozen(r.value)
    add(`returns-frozen-object:${name}`, ok)
    if (r.ok && isObj(r.value)) { responses[name] = r.value; collected.push(JSON.stringify(r.value)) }
  }

  // a present signal group, when usable, must be a frozen object -------------------------------------------
  const usable = callable('isUsable') ? safeCall(() => surface.isUsable() === true).value === true : false
  if (callable('getSignalGroup')) {
    const present = safeCall(() => surface.getSignalGroup('philosophy'))
    // either a frozen object (present/absent entry) or null — never an unfrozen object, never a throw
    const ok = present.ok && (present.value === null || (isObj(present.value) && Object.isFrozen(present.value)))
    add('signal-group-frozen-or-null', ok)
    if (present.ok && isObj(present.value)) collected.push(JSON.stringify(present.value))
  }

  // listPresentCategories: a frozen array ------------------------------------------------------------------
  if (callable('listPresentCategories')) {
    const l = safeCall(() => surface.listPresentCategories())
    add('present-categories-frozen-array', l.ok && Array.isArray(l.value) && Object.isFrozen(l.value))
  }

  // availability + shape of the named contract surfaces ----------------------------------------------------
  const validationState = responses.getValidationState
  add('validation-state-available', isObj(validationState) && typeof validationState.profileUsable === 'boolean')
  add('provenance-available', isObj(responses.getProvenance))
  add('coverage-available', isObj(responses.getCoverage))
  add('confidence-available', isObj(responses.getConfidence) && typeof responses.getConfidence.level === 'string')
  add('evidence-available', isObj(responses.getEvidence))

  // no recommendation / no prediction boundary ------------------------------------------------------------
  add('no-recommendation-or-prediction', collected.every((s) => !ADVICE_LANG.test(s)))

  const failed = checks.filter((c) => !c.pass)
  const draft = {
    type: 'coach-dna-intelligence-consumer-contract-validation',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    validates: 'M255',
    contractFingerprint: describeCoachDnaIntelligenceConsumerContract().contractFingerprint,
    valid: failed.length === 0,
    surfaceUsable: usable,
    totalChecks: checks.length,
    passedChecks: checks.length - failed.length,
    failedChecks: failed.length,
    checks,
    errors: failed.map((c) => c.name),
    availability: {
      provenance: isObj(responses.getProvenance),
      coverage: isObj(responses.getCoverage),
      confidence: isObj(responses.getConfidence),
      evidence: isObj(responses.getEvidence),
      validationState: isObj(validationState),
    },
  }
  draft.validationFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the consumer-contract validation.
 * @param {object} input an M255 surface or a profile/index
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceConsumerValidation(input) {
  const v = validateCoachDnaIntelligenceConsumer(input)
  return [
    `Coach DNA intelligence consumer contract: ${v.valid ? 'HONOURED' : 'VIOLATED'}`,
    `Surface usable: ${v.surfaceUsable}`,
    `Checks: ${v.passedChecks}/${v.totalChecks}`,
    ...(v.failedChecks ? ['Failures:', ...v.errors.map((e) => `  - ${e}`)] : []),
    `Fingerprint: ${v.validationFingerprint}`,
  ].join('\n')
}
