/**
 * web/brain-coach-dna-selection-intelligence-consumer-contract.js - Coach DNA Selection Intelligence Consumer Contract (M265, DORMANT)
 *
 * The consumer-safety contract for the selection domain — the selection-domain analogue of the M256 core
 * consumer contract. It completes the public API of the Selection Intelligence read stack by defining and
 * verifying HOW future selection reasoning modules may consume the M264 query surface, so a consumer can depend
 * on a stable behavioural guarantee rather than on the M262/M263 internals.
 *
 * `describeCoachDnaSelectionIntelligenceConsumerContract()` returns the frozen contract descriptor: the allowed
 * query methods, response shapes, the safe-malformed-input rule, availability of provenance/evidence/confidence/
 * validation-state, the frozen-response requirement, and — critically for this domain — the explicit
 * no-player-data and no-ranking/no-scoring/no-recommendation boundaries.
 * `validateCoachDnaSelectionIntelligenceConsumer(surface)` probes an actual surface against that contract and
 * returns a deterministic pass/fail report.
 *
 * Pure functions. They reuse ONLY the M264 surface (building one on demand from a profile/index), mutate no
 * input, perform no writes, make no recommendation, call no AI/LLM, and use no DOM/network/storage/env/
 * database/clock/randomness. Same input → same report, byte for byte.
 */

import { createCoachDnaSelectionIntelligenceQuery } from './brain-coach-dna-selection-intelligence-query.js' // M264

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
  { name: 'getSelectionLens', args: '(lensOrCategory)', returns: 'frozen object | null' },
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
const RANK_SCORE_REC = /\b(rank(ed|ing)?|score(d|s)?|recommend(ation|ed|s)?|predict|forecast|you should|must start|must bench|drop him|pick him|best xv|select him|start him|bench him)\b/i
const UNKNOWN_KEY = '___m265_no_such_lens___'

/**
 * The static, frozen description of the selection consumer contract.
 * @returns {object}
 */
export function describeCoachDnaSelectionIntelligenceConsumerContract() {
  const draft = {
    type: 'coach-dna-selection-intelligence-consumer-contract',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    domain: 'selection',
    source: 'coach-dna-selection-intelligence-query',
    sourceMilestone: 'M264',
    allowedMethods: ALLOWED_METHODS,
    responseShapes: {
      getSelectionLens: ['lens', 'sourceCategory', 'label', 'present', 'isDominant', 'occurrences', 'strength', 'supportingCount', 'themeCount', 'averageConfidence', 'averageWeight', 'isStrongest', 'isWeakest'],
      getEvidence: ['totalMemories', 'uniqueTypes', 'totalEvidence', 'totalOntologyLinks', 'byLens'],
      getEvidenceByLens: ['present', 'occurrences', 'supportingCount', 'themeCount'],
      getConfidence: ['level', 'value', 'high', 'low'],
      getConfidenceByLens: ['present', 'averageConfidence'],
      getCoverage: ['presentLenses', 'dominantLenses', 'totalLenses', 'confidenceLevel'],
      getProvenance: ['chain', 'profileFingerprint', 'selectionInputsFingerprint', 'origin', 'byMilestone'],
      getValidationState: ['profileRecognized', 'profileUsable', 'presentLenses', 'dominantLenses', 'totalLenses', 'issues'],
    },
    boundaries: {
      readOnly: true,
      frozenResponses: true,
      safeMalformedInput: true,
      noPlayerData: true,
      noPlayerScoring: true,
      noPlayerRanking: true,
      noRecommendation: true,
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
      milestone: 'M265',
      domain: 'selection',
      describes: 'coach-dna-selection-intelligence-query',
      sourceMilestone: 'M264',
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
  if (isObj(input) && typeof input.getSelectionLens === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaSelectionIntelligenceQuery(input)
}

/**
 * Validate an M264 selection query surface (or a profile/index that yields one) against the consumer contract.
 *
 * @param {object} input an M264 surface, or an M262 profile / M263 index / { profile, index } pair
 * @returns {object} frozen validation report.
 */
export function validateCoachDnaSelectionIntelligenceConsumer(input) {
  const surface = resolveSurface(input)
  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass: pass === true, detail })
  const collected = []

  for (const name of METHOD_NAMES) add(`method:${name}`, isObj(surface) && typeof surface[name] === 'function')
  const callable = (name) => isObj(surface) && typeof surface[name] === 'function'

  // safe malformed input
  if (callable('getSelectionLens')) {
    const a = safeCall(() => surface.getSelectionLens(UNKNOWN_KEY))
    add('safe-unknown-lens-null', a.ok && a.value === null)
    const b = safeCall(() => surface.getSelectionLens(7))
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

  // a present selection lens, when usable, must be a frozen object (or null) — never unfrozen, never a throw
  if (callable('getSelectionLens')) {
    const lens = safeCall(() => surface.getSelectionLens('selectionSignals'))
    const ok = lens.ok && (lens.value === null || (isObj(lens.value) && Object.isFrozen(lens.value)))
    add('selection-lens-frozen-or-null', ok)
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

  // domain boundaries: no player data, no ranking/scoring/recommendation language anywhere in responses
  const noPlayerData = collected.every((s) => !PLAYER_DATA.test(s))
  const noRankScoreRec = collected.every((s) => !RANK_SCORE_REC.test(s))
  add('no-player-data', noPlayerData)
  add('no-ranking-scoring-recommendation', noRankScoreRec)

  const failed = checks.filter((c) => !c.pass)
  const usable = callable('isUsable') ? safeCall(() => surface.isUsable() === true).value === true : false

  const draft = {
    type: 'coach-dna-selection-intelligence-consumer-contract-validation',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    domain: 'selection',
    validates: 'M264',
    contractFingerprint: describeCoachDnaSelectionIntelligenceConsumerContract().contractFingerprint,
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
      noPlayerScoring: noRankScoreRec,
      noPlayerRanking: noRankScoreRec,
      noRecommendation: noRankScoreRec,
    },
  }
  draft.validationFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the selection consumer-contract validation.
 * @param {object} input an M264 surface or a profile/index
 * @returns {string}
 */
export function summarizeCoachDnaSelectionIntelligenceConsumerValidation(input) {
  const v = validateCoachDnaSelectionIntelligenceConsumer(input)
  return [
    `Coach DNA selection intelligence consumer contract: ${v.valid ? 'HONOURED' : 'VIOLATED'}`,
    `Surface usable: ${v.surfaceUsable}`,
    `Checks: ${v.passedChecks}/${v.totalChecks}`,
    ...(v.failedChecks ? ['Failures:', ...v.errors.map((e) => `  - ${e}`)] : []),
    `Fingerprint: ${v.validationFingerprint}`,
  ].join('\n')
}
