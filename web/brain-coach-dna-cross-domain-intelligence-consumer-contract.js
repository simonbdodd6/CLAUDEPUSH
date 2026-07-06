/**
 * web/brain-coach-dna-cross-domain-intelligence-consumer-contract.js - Coach DNA Cross-Domain Intelligence Consumer Contract (M281, DORMANT)
 *
 * The consumer-safety contract for the cross-domain chapter — the cross-domain analogue of the M256/M265/M273
 * consumer contracts. It completes the public API of the Cross-Domain Intelligence read stack by defining and
 * verifying HOW future cross-domain modules may consume the M280 query surface, so a consumer can depend on a
 * stable behavioural guarantee rather than on the M278/M279 internals.
 *
 * `describeCoachDnaCrossDomainIntelligenceConsumerContract()` returns the frozen contract descriptor: the
 * allowed query methods, response shapes, the safe-malformed-input rule, availability of provenance/evidence/
 * confidence/completeness/validation-state, the frozen-response requirement, and — critically for this chapter —
 * the explicit no-player, no-recommendation, no-training-plan/session-analysis, no-domain-comparison and
 * no-cross-domain-reasoning boundaries. Cross-domain REASONING is deliberately outside this contract: the read
 * stack only assembles, and consumers must not expect compared, ranked or reconciled domains from it.
 * `validateCoachDnaCrossDomainIntelligenceConsumer(surface)` probes an actual surface against that contract and
 * returns a deterministic pass/fail report.
 *
 * Pure functions. They reuse ONLY the M280 surface (building one on demand from a profile/index), mutate no
 * input, perform no writes, make no recommendation, call no AI/LLM, and use no DOM/network/storage/env/
 * database/clock/randomness. Same input → same report, byte for byte.
 */

import { createCoachDnaCrossDomainIntelligenceQuery } from './brain-coach-dna-cross-domain-intelligence-query.js' // M280

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
  { name: 'getDomain', args: '(domainKey)', returns: 'frozen object | null' },
  { name: 'getEvidence', args: '(domainKey?)', returns: 'frozen object | null' },
  { name: 'getConfidence', args: '(domainKey?)', returns: 'frozen object | null' },
  { name: 'getCompleteness', args: '()', returns: 'frozen object' },
  { name: 'getProvenance', args: '()', returns: 'frozen object' },
  { name: 'getValidationState', args: '()', returns: 'frozen object' },
  { name: 'listAvailableDomains', args: '()', returns: 'frozen string[]' },
])
const METHOD_NAMES = Object.freeze(ALLOWED_METHODS.map((m) => m.name))
// Getters that must always return a frozen object (never null, never throw) for any surface. getEvidence and
// getConfidence qualify in their keyless form — the byDomain map always exists even when its slots are null.
const OBJECT_GETTERS = Object.freeze(['getEvidence', 'getConfidence', 'getCompleteness', 'getProvenance', 'getValidationState'])

const PLAYER_DATA = /player(Id|Name|s)\b/i
// Recommendation / prediction / training-content / session-analysis language a compliant response must never contain.
const FORBIDDEN_BEHAVIOUR = /\b(recommend(ation|ed|s)?|predict|forecast|you should|must (start|bench|do)|training plan|session plan|do this drill|run this session|session analysis|analyse[sd]? (the |this )?session)\b/i
// Domain-comparison / cross-domain-reasoning language a compliant response must never contain: the read stack
// assembles the domains side by side and must never rank, weigh or reconcile them.
const COMPARISON_LANGUAGE = /\b(better|worse|stronger|weaker|outperform\w*|versus|compared? (to|with)|comparison|reconcil\w*|prioriti[sz]e\w*|trade-?off)\b/i
const UNKNOWN_KEY = '___m281_no_such_domain___'

/**
 * The static, frozen description of the cross-domain consumer contract.
 * @returns {object}
 */
export function describeCoachDnaCrossDomainIntelligenceConsumerContract() {
  const draft = {
    type: 'coach-dna-cross-domain-intelligence-consumer-contract',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    domain: 'cross-domain',
    source: 'coach-dna-cross-domain-intelligence-query',
    sourceMilestone: 'M280',
    allowedMethods: ALLOWED_METHODS,
    responseShapes: {
      getDomain: ['domain', 'sourceMilestone', 'included', 'usable', 'summaryFingerprint', 'readiness', 'presentCharacteristics', 'totalCharacteristics', 'strongestCharacteristic', 'unknownCount'],
      getEvidence: ['selection', 'training'],
      getEvidenceByDomain: ['assessed', 'wellSupported', 'tentative', 'unknown', 'completeness', 'consistency'],
      getConfidence: ['selection', 'training'],
      getConfidenceByDomain: ['level', 'value', 'high', 'low'],
      getCompleteness: ['level', 'complete', 'includedDomains', 'usableDomains', 'totalDomains'],
      getProvenance: ['chain', 'profileFingerprint', 'crossDomainInputsFingerprint', 'byDomain', 'byMilestone'],
      getValidationState: ['profileRecognized', 'profileUsable', 'includedDomains', 'usableDomains', 'totalDomains', 'completenessLevel', 'issues'],
    },
    boundaries: {
      readOnly: true,
      frozenResponses: true,
      safeMalformedInput: true,
      noPlayerData: true,
      noPlayerEvaluation: true,
      noPlayerSelection: true,
      noPlayerScoring: true,
      noPlayerRanking: true,
      noTeamRecommendation: true,
      noTrainingRecommendation: true,
      noContentGeneration: true,
      noSessionAnalysis: true,
      noPrediction: true,
      noDomainComparison: true,
      noCrossDomainReasoning: true,
    },
    availability: {
      provenance: true,
      evidence: true,
      confidence: true,
      completeness: true,
      validationState: true,
    },
    derivationMetadata: {
      milestone: 'M281',
      domain: 'cross-domain',
      describes: 'coach-dna-cross-domain-intelligence-query',
      sourceMilestone: 'M280',
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
  if (isObj(input) && typeof input.getDomain === 'function' && typeof input.getValidationState === 'function') return input
  return createCoachDnaCrossDomainIntelligenceQuery(input)
}

/**
 * Validate an M280 cross-domain query surface (or a profile/index that yields one) against the consumer
 * contract.
 *
 * @param {object} input an M280 surface, or an M278 profile / M279 index / { profile, index } pair
 * @returns {object} frozen validation report.
 */
export function validateCoachDnaCrossDomainIntelligenceConsumer(input) {
  const surface = resolveSurface(input)
  const checks = []
  const add = (name, pass, detail = '') => checks.push({ name, pass: pass === true, detail })
  const collected = [] // JSON of every observed response, for the boundary checks

  for (const name of METHOD_NAMES) add(`method:${name}`, isObj(surface) && typeof surface[name] === 'function')
  const callable = (name) => isObj(surface) && typeof surface[name] === 'function'

  // safe malformed input
  if (callable('getDomain')) {
    const a = safeCall(() => surface.getDomain(UNKNOWN_KEY))
    add('safe-unknown-domain-null', a.ok && a.value === null)
    const b = safeCall(() => surface.getDomain(7))
    add('safe-nonstring-domain-null', b.ok && b.value === null)
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

  // a domain entry must be a frozen object (or null) — never unfrozen, never a throw
  if (callable('getDomain')) {
    for (const key of ['selection', 'training']) {
      const d = safeCall(() => surface.getDomain(key))
      const ok = d.ok && (d.value === null || (isObj(d.value) && Object.isFrozen(d.value)))
      add(`domain-frozen-or-null:${key}`, ok)
      if (d.ok && isObj(d.value)) collected.push(JSON.stringify(d.value))
    }
  }

  // listAvailableDomains: a frozen array
  if (callable('listAvailableDomains')) {
    const l = safeCall(() => surface.listAvailableDomains())
    add('available-domains-frozen-array', l.ok && Array.isArray(l.value) && Object.isFrozen(l.value))
  }

  // availability + shape
  const validationState = responses.getValidationState
  add('validation-state-available', isObj(validationState) && typeof validationState.profileUsable === 'boolean')
  add('provenance-available', isObj(responses.getProvenance))
  add('evidence-available', isObj(responses.getEvidence))
  add('confidence-available', isObj(responses.getConfidence))
  add('completeness-available', isObj(responses.getCompleteness) && typeof responses.getCompleteness.level === 'string')

  // chapter boundaries: no player data, no recommendation/content/session-analysis language, and no
  // domain-comparison / cross-domain-reasoning language anywhere in the observed responses
  const noPlayerData = collected.every((s) => !PLAYER_DATA.test(s))
  const noForbiddenBehaviour = collected.every((s) => !FORBIDDEN_BEHAVIOUR.test(s))
  const noComparisonLanguage = collected.every((s) => !COMPARISON_LANGUAGE.test(s))
  add('no-player-data', noPlayerData)
  add('no-recommendation-content-session-analysis', noForbiddenBehaviour)
  add('no-domain-comparison-or-reasoning', noComparisonLanguage)

  const failed = checks.filter((c) => !c.pass)
  const usable = callable('isUsable') ? safeCall(() => surface.isUsable() === true).value === true : false

  const draft = {
    type: 'coach-dna-cross-domain-intelligence-consumer-contract-validation',
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    domain: 'cross-domain',
    validates: 'M280',
    contractFingerprint: describeCoachDnaCrossDomainIntelligenceConsumerContract().contractFingerprint,
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
      completeness: isObj(responses.getCompleteness),
      validationState: isObj(validationState),
    },
    boundaries: {
      noPlayerData,
      noTrainingRecommendation: noForbiddenBehaviour,
      noContentGeneration: noForbiddenBehaviour,
      noSessionAnalysis: noForbiddenBehaviour,
      noDomainComparison: noComparisonLanguage,
      noCrossDomainReasoning: noComparisonLanguage,
    },
  }
  draft.validationFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the cross-domain consumer-contract validation.
 * @param {object} input an M280 surface or a profile/index
 * @returns {string}
 */
export function summarizeCoachDnaCrossDomainIntelligenceConsumerValidation(input) {
  const v = validateCoachDnaCrossDomainIntelligenceConsumer(input)
  return [
    `Coach DNA cross-domain intelligence consumer contract: ${v.valid ? 'HONOURED' : 'VIOLATED'}`,
    `Surface usable: ${v.surfaceUsable}`,
    `Checks: ${v.passedChecks}/${v.totalChecks}`,
    ...(v.failedChecks ? ['Failures:', ...v.errors.map((e) => `  - ${e}`)] : []),
    `Fingerprint: ${v.validationFingerprint}`,
  ].join('\n')
}
