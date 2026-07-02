/**
 * web/brain-coach-dna-training-intelligence-consumer-contract.js - Coach DNA Training Intelligence Consumer Contract (M273, DORMANT)
 *
 * The consumer-safety contract for the training domain — the training-domain analogue of the M256 core and
 * M265 selection consumer contracts. It completes the public API of the Training Intelligence read stack by
 * defining and verifying HOW future training modules may consume the M272 query surface, so a consumer can
 * depend on a stable behavioural guarantee rather than on the M270/M271 internals.
 *
 * `describeCoachDnaTrainingIntelligenceConsumerContract()` returns the frozen contract descriptor: the allowed
 * query methods, response shapes, the safe-malformed-input rule, availability of provenance/evidence/confidence/
 * validation-state, the frozen-response requirement, and — critically for this domain — the explicit
 * no-player-data, no-training-recommendation, no-content-generation and no-session-analysis boundaries.
 * `validateCoachDnaTrainingIntelligenceConsumer(surface)` probes an actual surface against that contract and
 * returns a deterministic pass/fail report.
 *
 * Pure functions. They reuse ONLY the M272 surface (building one on demand from a profile/index), mutate no
 * input, perform no writes, make no recommendation, call no AI/LLM, and use no DOM/network/storage/env/
 * database/clock/randomness. Same input → same report, byte for byte.
 */

import { createCoachDnaTrainingIntelligenceQuery } from './brain-coach-dna-training-intelligence-query.js' // M272

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

const ALLOWED_METHODS = Object.freeze([
  { name: 'isUsable', args: '()', returns: 'boolean' },
  { name: 'getTrainingLens', args: '(lensOrCategory)', returns: 'frozen object | null' },
  { name: 'getEvidence', args: '(lensOrCategory?)', returns: 'frozen object | null' },
  { name: 'getConfidence', args: '(lensOrCategory?)', returns: 'frozen object | null' },
  { name: 'getCoverage', args: '()', returns: 'frozen object' },
  { name: 'getProvenance', args: '()', returns: 'frozen object' },
  { name: 'getValidationState', args: '()', returns: 'frozen object' },
  { name: 'listAvailableLenses', args: '()', returns: 'frozen string[]' },
])
const METHOD_NAMES = Object.freeze(ALLOWED_METHODS.map((m) => m.name))
// Getters that must always return a frozen object (never null, never throw) for any surface.
const OBJECT_GETTERS = Object.freeze(['getEvidence', 'getConfidence', 'getCoverage', 'getProvenance', 'getValidationState'])

const PLAYER_DATA = /player(Id|Name|s)\b/i
// Recommendation / prediction / training-content / session-analysis language a compliant response must never contain.
const FORBIDDEN_BEHAVIOUR = /\b(recommend(ation|ed|s)?|predict|forecast|you should|must (start|bench|do)|training plan|session plan|do this drill|run this session|session analysis|analyse[sd]? (the |this )?session)\b/i
const UNKNOWN_KEY = '___m273_no_such_lens___'

/**
 * The static, frozen description of the training consumer contract.
 * @returns {object}
 */
export function describeCoachDnaTrainingIntelligenceConsumerContract() {
  const draft = {
    type: 'coach-dna-training-intelligence-consumer-contract',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    domain: 'training',
    source: 'coach-dna-training-intelligence-query',
    sourceMilestone: 'M272',
    allowedMethods: ALLOWED_METHODS,
    responseShapes: {
      getTrainingLens: ['lens', 'sourceCategory', 'label', 'present', 'isDominant', 'occurrences', 'strength', 'supportingCount', 'themeCount', 'averageConfidence', 'averageWeight', 'isStrongest', 'isWeakest'],
      getEvidence: ['totalMemories', 'uniqueTypes', 'totalEvidence', 'totalOntologyLinks', 'byLens'],
      getEvidenceByLens: ['present', 'occurrences', 'supportingCount', 'themeCount'],
      getConfidence: ['level', 'value', 'high', 'low'],
      getConfidenceByLens: ['present', 'averageConfidence'],
      getCoverage: ['presentLenses', 'dominantLenses', 'totalLenses', 'confidenceLevel'],
      getProvenance: ['chain', 'profileFingerprint', 'trainingInputsFingerprint', 'origin', 'byMilestone'],
      getValidationState: ['profileRecognized', 'profileUsable', 'presentLenses', 'dominantLenses', 'totalLenses', 'issues'],
    },
    boundaries: {
      readOnly: true,
      frozenResponses: true,
      safeMalformedInput: true,
      noPlayerData: true,
      noPlayerEvaluation: true,
      noTrainingRecommendation: true,
      noContentGeneration: true,
      noSessionAnalysis: true,
      noPrediction: true,
    },
    availability: {
      provenance: true,
      evidence: true,
      confidence: true,
      coverage: true,
      validationState: true,
    },
    derivationMetadata: {
      milestone: 'M273',
      domain: 'training',
      describes: 'coach-dna-training-intelligence-query',
      sourceMilestone: 'M272',
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

function resolveSurface(input) {
  if (isObj(input) && typeof input.getTrainingLens === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaTrainingIntelligenceQuery(input)
}

/**
 * Validate an M272 training query surface (or a profile/index that yields one) against the consumer contract.
 *
 * @param {object} input an M272 surface, or an M270 profile / M271 index / { profile, index } pair
 * @returns {object} frozen validation report.
 */
export function validateCoachDnaTrainingIntelligenceConsumer(input) {
  const surface = resolveSurface(input)
  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass: pass === true, detail })
  const collected = [] // JSON of every observed response, for the boundary checks

  for (const name of METHOD_NAMES) add(`method:${name}`, isObj(surface) && typeof surface[name] === 'function')
  const callable = (name) => isObj(surface) && typeof surface[name] === 'function'

  // safe malformed input
  if (callable('getTrainingLens')) {
    const a = safeCall(() => surface.getTrainingLens(UNKNOWN_KEY))
    add('safe-unknown-lens-null', a.ok && a.value === null)
    const b = safeCall(() => surface.getTrainingLens(7))
    add('safe-nonstring-lens-null', b.ok && b.value === null)
  }
  if (callable('getEvidence')) add('safe-unknown-evidence-null', (() => { const r = safeCall(() => surface.getEvidence(UNKNOWN_KEY)); return r.ok && r.value === null })())
  if (callable('getConfidence')) add('safe-unknown-confidence-null', (() => { const r = safeCall(() => surface.getConfidence(UNKNOWN_KEY)); return r.ok && r.value === null })())

  // object getters: always a frozen object, never null, never throws
  const responses = {}
  for (const name of OBJECT_GETTERS) {
    if (!callable(name)) { add(`returns-frozen-object:${name}`, false, 'method missing'); continue }
    const r = safeCall(() => surface[name]())
    const ok = r.ok && isObj(r.value) && Object.isFrozen(r.value)
    add(`returns-frozen-object:${name}`, ok)
    if (r.ok && isObj(r.value)) { responses[name] = r.value; collected.push(JSON.stringify(r.value)) }
  }

  // a present training lens must be a frozen object (or null) — never unfrozen, never a throw
  if (callable('getTrainingLens')) {
    const lens = safeCall(() => surface.getTrainingLens('sessionStructureSignals'))
    const ok = lens.ok && (lens.value === null || (isObj(lens.value) && Object.isFrozen(lens.value)))
    add('training-lens-frozen-or-null', ok)
    if (lens.ok && isObj(lens.value)) collected.push(JSON.stringify(lens.value))
  }

  // listAvailableLenses: a frozen array
  if (callable('listAvailableLenses')) {
    const l = safeCall(() => surface.listAvailableLenses())
    add('available-lenses-frozen-array', l.ok && Array.isArray(l.value) && Object.isFrozen(l.value))
  }

  // availability + shape
  const validationState = responses.getValidationState
  add('validation-state-available', isObj(validationState) && typeof validationState.profileUsable === 'boolean')
  add('provenance-available', isObj(responses.getProvenance))
  add('evidence-available', isObj(responses.getEvidence))
  add('confidence-available', isObj(responses.getConfidence) && typeof responses.getConfidence.level === 'string')
  add('coverage-available', isObj(responses.getCoverage))

  // domain boundaries: no player data, no recommendation/content/session-analysis language anywhere in responses
  const noPlayerData = collected.every((s) => !PLAYER_DATA.test(s))
  const noForbiddenBehaviour = collected.every((s) => !FORBIDDEN_BEHAVIOUR.test(s))
  add('no-player-data', noPlayerData)
  add('no-recommendation-content-session-analysis', noForbiddenBehaviour)

  const failed = checks.filter((c) => !c.pass)
  const usable = callable('isUsable') ? safeCall(() => surface.isUsable() === true).value === true : false

  const draft = {
    type: 'coach-dna-training-intelligence-consumer-contract-validation',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    domain: 'training',
    validates: 'M272',
    contractFingerprint: describeCoachDnaTrainingIntelligenceConsumerContract().contractFingerprint,
    valid: failed.length === 0,
    surfaceUsable: usable,
    totalChecks: checks.length,
    passedChecks: checks.length - failed.length,
    failedChecks: failed.length,
    checks,
    errors: failed.map((c) => c.name),
    availability: {
      provenance: isObj(responses.getProvenance),
      evidence: isObj(responses.getEvidence),
      confidence: isObj(responses.getConfidence),
      coverage: isObj(responses.getCoverage),
      validationState: isObj(validationState),
    },
    boundaries: {
      noPlayerData,
      noTrainingRecommendation: noForbiddenBehaviour,
      noContentGeneration: noForbiddenBehaviour,
      noSessionAnalysis: noForbiddenBehaviour,
    },
  }
  draft.validationFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the training consumer-contract validation.
 * @param {object} input an M272 surface or a profile/index
 * @returns {string}
 */
export function summarizeCoachDnaTrainingIntelligenceConsumerValidation(input) {
  const v = validateCoachDnaTrainingIntelligenceConsumer(input)
  return [
    `Coach DNA training intelligence consumer contract: ${v.valid ? 'HONOURED' : 'VIOLATED'}`,
    `Surface usable: ${v.surfaceUsable}`,
    `Checks: ${v.passedChecks}/${v.totalChecks}`,
    ...(v.failedChecks ? ['Failures:', ...v.errors.map((e) => `  - ${e}`)] : []),
    `Fingerprint: ${v.validationFingerprint}`,
  ].join('\n')
}
